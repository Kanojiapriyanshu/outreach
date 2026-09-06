# Deploying Fidem Growth — Vercel (app) + Render (worker)

## Architecture

Next.js can't be neatly split into a separate "frontend" and "backend" — every `/api/*` route lives inside the same Next.js app as the UI. So the real split is:

| Piece | Where | Why |
|---|---|---|
| The Next.js app (dashboard UI **and** every `/api/*` route) | **Vercel** | This is what Vercel is built for — it's the whole web app, including everything the "backend" would mean here (auth, sending emails, the settings API, etc). |
| `scripts/worker.ts` — the always-on poller that checks Gmail and sends follow-ups | **Render**, as a *Background Worker* service | Vercel only runs short-lived serverless functions; it can't run a process that stays alive and polls every 5 minutes. Render's Background Worker type is made exactly for this. |
| Postgres database | **Already on Neon** — no change | It's already cloud-hosted, not on your machine. Both Vercel and Render will point at the same `DATABASE_URL` you're already using. |

Nothing about this setup keeps anything on localhost — your laptop's dev server and local PM2 worker were only ever a stand-in for these two cloud services during development. Once both are deployed, you can leave `npm run dev` off entirely (or keep using it just for making further changes, which won't affect production).

## What's already been done to the code

- Added `postinstall: prisma generate` to `package.json` — without this, Vercel's build would fail because the Prisma client is never generated.
- Changed `build` to `prisma migrate deploy && next build` — every deploy now applies any pending database migrations automatically before building.
- Consolidated the migration history into a single clean baseline (`prisma/migrations/20260906000000_init`) matching the database exactly, and verified `prisma migrate deploy` runs cleanly against it. (The old migration history only covered the first two schema changes — everything since was applied with `db push` and had no migration file. This is now fixed so a fresh environment, or Vercel's build step, can set up the schema correctly from scratch.)
- Added `render.yaml` in the repo root — Render can read this to set up the worker service semi-automatically (see below).
- Confirmed there's no hardcoded `localhost` anywhere in the source — every URL-dependent piece (OAuth redirects, cookies) already reads from environment variables or the incoming request, so it'll work correctly on whatever domain you deploy to.

## Step-by-step

### 1. Push the code to GitHub

Both Vercel and Render deploy from a Git repo.

```bash
git init   # if not already a repo
git add .
git commit -m "Prepare for deployment"
```
Create a repo on GitHub and push to it. **Do not commit `.env`** — it has real secrets in it (check `.gitignore` already excludes it, which it does in this project).

### 2. Deploy the web app to Vercel

1. Go to vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: Next.js (auto-detected).
3. Before the first deploy, add these **Environment Variables** (Project Settings → Environment Variables — set them for Production, and Preview too if you want preview deploys to work):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | same Neon connection string you're using locally |
   | `GOOGLE_CLIENT_ID` | same as local |
   | `GOOGLE_CLIENT_SECRET` | same as local |
   | `GOOGLE_REDIRECT_URI` | `https://<your-vercel-domain>/api/auth/google/callback` — you won't know the exact domain until after the first deploy, so put a placeholder now and fix it in step 4 |
   | `SESSION_SECRET` | same as local (or generate a new random 32-byte value) |
   | `ANTHROPIC_API_KEY` | leave blank — the system works fully without it (zero-cost heuristic classifier); only set this if you decide to pay for the nuance boost later |

4. Deploy. Vercel will run `npm install` (triggers `postinstall: prisma generate`) → `npm run build` (runs `prisma migrate deploy && next build`) → deploy.
5. Once deployed, note your real URL — e.g. `https://fidem-outreach.vercel.app` (or a custom domain if you attach one in Project Settings → Domains).

### 3. Fix the Google OAuth redirect URI

Gmail OAuth is strict about redirect URIs — it must exactly match what's registered.

1. Go to **Google Cloud Console → APIs & Services → Credentials** → open your OAuth 2.0 Client.
2. Under **Authorized redirect URIs**, add: `https://<your-real-vercel-domain>/api/auth/google/callback` (keep the existing `localhost` one too if you still want to test locally sometimes).
3. Back in Vercel, update the `GOOGLE_REDIRECT_URI` environment variable to that same URL.
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new env var takes effect.

### 4. Deploy the worker to Render

**Option A — via the `render.yaml` blueprint (recommended, faster):**
1. Go to render.com → **New → Blueprint** → connect the same GitHub repo.
2. Render reads `render.yaml` and proposes the `fidem-outreach-worker` background worker service.
3. When prompted, fill in the env vars marked `sync: false`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (same production value as Vercel), `SESSION_SECRET`, and `ANTHROPIC_API_KEY` (leave blank, same as above).
4. Deploy.

**Option B — manually:**
1. **New → Background Worker** → connect the repo.
2. Build command: `npm install`
3. Start command: `npm run worker`
4. Add the same environment variables as above.
5. Deploy.

Render will keep this process running continuously and restart it automatically if it ever crashes — this replaces the local PM2 setup entirely.

### 5. Connect the Gmail account in production

1. Open your production URL, log in (or go through `/setup` if this is the very first account).
2. Go to **Settings → Email Accounts → Connect Gmail**.
3. Sign in with `yash@fidemgrowth.com` and approve.

**One thing to watch for**, since this is a Google **Workspace** account (not a personal Gmail): if the `fidemgrowth.com` Workspace admin has API access restrictions turned on (Admin Console → Security → API Controls → App Access Control), this OAuth app may need to be explicitly allowed for the domain before `yash@fidemgrowth.com` can grant it access — a personal `@gmail.com` account wouldn't hit this, but a Workspace account can. If the OAuth screen shows a blocking "This app is blocked" (not just the usual "unverified app, click Advanced to continue"), that's the symptom — the Workspace admin needs to whitelist the OAuth Client ID.

### 6. Verify end-to-end

1. In Settings, confirm the account shows **Connected**.
2. Send a real test email via **Track → Write & Send**.
3. Check the Render worker's logs (Render dashboard → your worker service → Logs) — you should see it tick every 5 minutes (`WORKER_POLL_INTERVAL_MS`, default 300000ms).
4. Reply to the test email from a second address, wait for the next worker tick (or check the logs), and confirm the dashboard reflects the reply.

## Ongoing operations

- **Schema changes going forward:** use `npx prisma migrate dev --name <description>` locally (creates a proper migration file) instead of `db push`, so the migration history stays accurate for Vercel's automatic `prisma migrate deploy` step. `db push` is fine for quick local experimentation but should never be the last step before a deploy.
- **Worker health:** the Settings page's Worker Heartbeat reflects whichever process last ran a tick — once Render's worker is live, that's what you'll see there instead of the local one.
- **Logs:** Vercel → your project → Logs (web app / API routes). Render → your worker service → Logs (the polling loop, sends, errors).
- **Redeploying:** both platforms auto-deploy on every push to your main branch by default (configurable in each platform's settings if you'd rather deploy manually).
