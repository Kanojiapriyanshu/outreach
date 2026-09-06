# Fidem Growth Outreach Automation

Automates Brand & Creator outreach follow-ups — send (or compose) Email 1, and the app tracks the thread, waits, checks for replies, and sends up to 3 automated follow-ups. See `Fidem_Growth_Brand_and_Creator_Outreach_Automation_PRD.md` for the full spec.

## Setup

### 1. Database (Postgres)

Get a free connection string from [neon.tech](https://neon.tech), then set it in `.env`:

```
DATABASE_URL="postgresql://...your-neon-connection-string...?sslmode=require"
```

Then run:

```bash
npm run db:migrate
npm run db:seed
```

### 2. Session secret

Generate one and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```
SESSION_SECRET="...paste it here..."
```

### 3. Gmail OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a new project (or use an existing one).
2. Enable the **Gmail API** (APIs & Services → Library → search "Gmail API" → Enable).
3. Go to APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
4. If prompted, configure the OAuth consent screen (External, add your own Gmail as a test user — no need to publish for personal/internal use).
5. Copy the **Client ID** and **Client Secret** into `.env`:

```
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
```

### 4. Run it

Two processes, run in separate terminals:

```bash
npm run dev      # the web app at http://localhost:3000
npm run worker   # the background scheduler that polls for replies and sends follow-ups
```

For a durable worker that auto-restarts on crash instead of dying in a terminal:

```bash
npm run worker:start   # pm2-managed, survives crashes
npm run worker:logs
npm run worker:status
```

First visit to the app goes to `/setup` — create the first login (any email/password), then connect Gmail from Settings.

## How it works

**Getting Email 1 out the door** — three ways, all on `/track`:
- **Compose & Send** — fill in the recipient + template variables, preview the rendered email, and send it directly through your connected Gmail account.
- **Attach Existing** — if you'd rather send from Gmail yourself first, search your Sent mail for the message and attach that thread to the automation.
- **Bulk** — either mode above, but from a CSV of many contacts at once.

**After that**, the worker polls (every 5 minutes, configurable via `WORKER_POLL_INTERVAL_MS`), checks each thread for replies/bounces/auto-replies, and sends the next follow-up if nothing blocks it (paused, suppressed, already replied, daily send limit reached, outside the sending window, etc.). Everything is visible on `/dashboard` (with manual Pause/Resume/Stop/Skip/Send Now controls per sequence), `/analytics`, and `/activity`. Settings shows a live worker heartbeat so you can tell if the background process has stopped.

## Optional: LLM reply classification

By default, replies are classified with header/regex heuristics only (out-of-office detection, bounce detection). Setting `ANTHROPIC_API_KEY` in `.env` enables an LLM classification pass that also catches "please stop emailing me" replies and automatically suppresses that contact, not just stopping the one sequence.

This call is additionally wrapped with [Headroom](https://github.com/headroomlabs-ai/headroom) (`headroom-ai/anthropic`) to compress the request before it reaches Anthropic. Headroom is optional infrastructure — with no local Headroom proxy running, the wrapper transparently no-ops (`fallback: true`) and the classifier still works normally, just without the token savings. To actually get the compression, install and run the proxy separately (see Headroom's own docs, e.g. `pip install "headroom-ai[all]"` then `headroom proxy`).

## Tests

```bash
npm run test
```

27 unit tests cover the state machine, business-day/sending-window math, template rendering/validation, and the Brand/Creator subject-line ordering rule.
