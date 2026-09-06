# Fidem Growth — Brand & Creator Outreach Automation
### Product Requirements Document (as-built)

This document describes the system **as it currently exists in this codebase** — not just what was originally planned. It exists so that this PRD can be handed to any AI assistant or developer, along with a specific feature request, and they can understand the whole system well enough to extend it safely without breaking existing behavior.

Codebase root: `D:\Fidem outreach`

---

## 1. What this system does

Fidem Growth's team reaches out to **Brands** (to place creators in sponsored content) and **Creators** (to recruit them for paid brand deals). Historically this meant manually tracking every email thread in a spreadsheet, remembering who to follow up with and when, and losing deals to slow response times.

This system automates the **follow-up and tracking** side of that process:

1. The team sends (or the system sends) the first outreach email.
2. The system watches the Gmail thread continuously.
3. If nobody replies, it automatically sends up to 3 follow-ups, spaced out over business/calendar days, at a randomized time each morning (not the same clock-minute every time).
4. If a reply comes in, an AI classifier reads it and decides what actually happened — a real reply, a non-answer, interest in the creator list, a chosen creator, disinterest, an opt-out, or an auto-reply — and the system reacts accordingly.
5. When the team manually sends something themselves (e.g. a creator shortlist, sent directly from Gmail, not through this tool), the system notices that too and restarts the follow-up clock around it.
6. Everything is visible on a dashboard that mirrors the team's own tracking-sheet vocabulary (First Email Sent → Creator List Sent → Negotiation → Creator Selected → Deal, or Not Interested).

**What it explicitly does NOT do:** write creative/pitch content beyond the canned templates, manage payments/contracts, or replace human judgment on negotiation and closing. Those stay manual.

---

## 2. Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), TypeScript
- **Database:** PostgreSQL (hosted on Neon), via **Prisma ORM** — schema at `prisma/schema.prisma`, client generated to `app/generated/prisma` (generator: `prisma-client`, imported as `@/app/generated/prisma/client`)
- **Email:** Gmail API only (`googleapis` package), OAuth2 with offline refresh tokens. No Outlook support yet (schema has an `EmailProvider` enum with `OUTLOOK` as a placeholder, unused).
- **Auth:** Hand-rolled cookie session auth (HMAC-signed via Web Crypto in `lib/session.ts`), gated by `middleware.ts`. Not NextAuth. Single-tenant style — one team, multiple `User` rows possible, no per-user data isolation (everyone sees everything).
- **AI:** `@anthropic-ai/sdk`, model `claude-haiku-4-5`, wrapped with `headroom-ai/anthropic`'s `withHeadroom()` for token-usage compression (falls back to a plain Anthropic client if no local Headroom proxy is running). **Gated behind `ANTHROPIC_API_KEY`** — without it, reply classification is skipped entirely and every reply is treated as a plain, terminal "human reply."
- **Background worker:** a standalone Node process (`scripts/worker.ts`), **not** part of the Next.js request lifecycle, run under **PM2** (`ecosystem.config.js`) for auto-restart on crash. Polls every `WORKER_POLL_INTERVAL_MS` (default 5 minutes, env-configurable).
- **Testing:** Vitest (`vitest.config.mts`), unit tests in `lib/__tests__/`.
- **Styling:** Tailwind CSS v4 + a hand-written CSS-variable design system (`app/globals.css`) supporting light/dark mode (see §9).
- **Deployment model:** local/self-hosted, single machine, assumed to run in **Asia/Kolkata (IST)** timezone — the code has no explicit timezone conversion anywhere; all `Date.getHours()`-style checks use the host machine's local time. This is a known limitation (see §12).

---

## 3. Data model (Prisma schema — `prisma/schema.prisma`)

### Core entities
- **`User`** — `name`, `email`, `passwordHash`, `timezone`, `role`. One row per team member with dashboard access.
- **`EmailAccount`** — a connected Gmail inbox. `accessToken`/`refreshToken`/`tokenExpiry` (OAuth), `accessStatus` (`CONNECTED` / `NEEDS_REAUTH` / `DISCONNECTED`), `dailySendLimit` (default 450, for quota protection). Multiple accounts can be connected; multi-account support exists but no per-account routing logic beyond "pick one when composing."
- **`Brand`** — `name`, `website`, `category`, `isAgency`, `budgetRangeText`, `budgetType` (enum: `FLAT_FEE`/`COMMISSION`/`PRODUCT_ONLY`/`HYBRID`/`UNKNOWN`), `influencerRangeMin/Max`, `deliverables`, `campaignTimeline`.
- **`Creator`** — `name`, `email`, `channelName`, `channelUrl`, `niche`.
- **`Contact`** — the actual person being emailed; belongs to either a `Brand` or a `Creator` (nullable FKs, exactly one set).
- **`OutreachSequence`** — the central tracking object, one per outreach thread. Key fields:
  - `outreachType`: `BRAND` | `CREATOR`
  - `recipientType`: `DIRECT` | `AGENCY` (Brand track only — direct-to-brand vs. reaching their agency)
  - `threadId`, `initialMessageId` — Gmail identifiers for the tracked thread
  - `currentStep` — how many follow-ups have gone out in the *current* cadence cycle (resets on a manual send or non-committal-reply reschedule)
  - `status` (`SequenceStatus` enum) — the **automation** state machine value (see §5)
  - `stage` (`PipelineStage` enum) — the **business pipeline** label shown on the dashboard (see §6) — deliberately a *separate* field from `status`
  - `lastKnownMsgCount` — watermark: how many messages in the Gmail thread have already been processed, so re-polling only looks at what's new
  - `variables` (JSON) — the resolved `{Variable}` values for this sequence's templates
- **`ScheduledAction`** — one pending/sent/cancelled follow-up or nudge. `step`, `scheduledAt`, `status` (`PENDING`/`SENT`/`SKIPPED`/`CANCELLED`), `kind` (`ScheduledActionKind` — see §7), `templateVersion` (nullable — only used for `kind: TEMPLATE`), `actionKey` (unique, used for idempotency).
- **`EmailMessage`** — a log of every message (in or out) tied to a sequence. `direction` (`OUT`/`IN`), `source` (`SYSTEM`/`MANUAL` — was this sent by the system or hand-typed by the team in Gmail?), `providerMessageId` (the Gmail message ID — used to detect "have we already seen/sent this exact message").
- **`Template`** — the canned email copy. `outreachType` + `recipientType` + `step` (1 = first email, 2/3/4 = follow-ups 1/2/3) + `version` (editing a template bumps the version rather than mutating a version already referenced by a live `ScheduledAction` — so in-flight sequences keep using the copy they started with). `isActive` flags the current version.
- **`ActivityLog`** — human-readable audit trail per sequence, shown as a timeline on the dashboard.
- **`SuppressedContact`** — global "do not email" list (explicit opt-outs land here automatically).
- **`WorkerHeartbeat`** — single row updated every worker tick (`lastRunAt`, `lastRunOk`, `lastError`, `actionsChecked`) so the Settings page can show "is the worker actually alive."
- **`AutomationSettings`** — single-row global config (see §8 for every field).

---

## 4. The outreach entry points ("how a sequence gets created")

All three live under `/track`, one shared page with tabs:

1. **"Write & Send"** (`ComposeAndSend.tsx` → `POST /api/sequences/compose` → `lib/trackSequence.ts: composeAndSendInitialEmail()`) — the system sends Email 1 itself via Gmail, then creates the sequence + first `ScheduledAction`.
2. **"I Already Sent It"** (attach flow, `page.tsx` → `POST /api/sequences` → `lib/trackSequence.ts: trackSequence()`) — the team already sent Email 1 manually from Gmail; this searches Sent mail (`GET /api/gmail/search`) for the thread and attaches tracking to it retroactively.
3. **"Bulk Upload"** (`BulkImport.tsx` → `POST /api/sequences/bulk`) — CSV import for sending Email 1 to many contacts at once, same underlying `composeAndSendInitialEmail()` per row.

Both single-send paths funnel through a **duplicate-protection check** (an existing active sequence for the same `threadId` returns the existing one instead of creating a new one) and a **template-driven required-variables check** (`checkPrerequisites()` in `trackSequence.ts` — reads which `{Variables}` the *actual* template-to-be-used references, via `findUnresolvedVariables()`, so a variable a template doesn't use is never wrongly required — e.g. the Agency template never asks for `{Target_Audience_Or_Angle}`).

### Paste-to-autofill email extraction (zero API key required by default)

`BrandDetailsForm.tsx`'s "Got their email already? Paste it to fill this in" box → `POST /api/extract/email-details` → `lib/emailExtractor.ts` → `lib/emailExtractorHeuristic.ts`.

- **Default path (no API key needed):** pure regex/keyword heuristics. Extracts: brand vs. agency name (and whether it's an agency, via `on behalf of` / `partnering with` / `representing` patterns, or a company-suffix heuristic on the signature), contact name (from signature or "my name is X"), product category + niche + a shopper-comparison "angle" (via a `CATEGORY_MAP` of ~25 product categories → niche/angle pairs), key product features (via "specializing in X" / "on their/its X" / "featuring X" patterns, with guards against false-positives like "featuring either our:" grabbing list-intro text instead of an actual feature), budget (dollar range, % commission, or "product only"), influencer subscriber range, deliverables, campaign timeline.
- **Optional enhancement layer:** if `ANTHROPIC_API_KEY` is set, `emailExtractor.ts` runs the LLM on top and merges its output over the heuristic's (LLM wins on conflicts) for cases regex can't reliably catch.
- A fresh paste **hard-replaces** every extractor-derived field (falls back to blank, never to the previous value) — this was a deliberate bug fix so a stale value from an unrelated earlier paste can never leak into a new brand's email.

---

## 5. Automation status — `SequenceStatus` (the low-level machine)

```
NEW → INITIAL_EMAIL_DETECTED → WAITING_FOR_REPLY → FOLLOW_UP_1_SENT → FOLLOW_UP_2_SENT → FOLLOW_UP_3_SENT → COMPLETED
                                        ↓ (any point)
                              REPLIED | BOUNCED | UNSUBSCRIBED | STOPPED | PAUSED
```

Pure transition logic lives in `lib/stateMachine.ts: advanceState(state, event)`. Events: `REPLY`, `BOUNCE`, `UNSUBSCRIBE`, `STOP`, `PAUSE`, `RESUME`, `NO_REPLY_ADVANCE` (fired after each follow-up send with no reply; after follow-up 3, advances to `COMPLETED`). `MAX_FOLLOW_UPS = 3`.

**Important nuance (changed from the original design):** `REPLIED` is *not* fully terminal for monitoring purposes anymore — see §7. It still means "the automatic follow-up *cadence* has stopped," but the thread keeps being watched for what the team does next.

---

## 6. Pipeline stage — `PipelineStage` (the business-facing label)

A **separate field** from `status`, shown as the colored badge on the dashboard, deliberately matching the team's own tracking-sheet vocabulary:

| Stage | Set how | Meaning |
|---|---|---|
| `FIRST_EMAIL_SENT` | automatic (default) | Initial outreach sent, nothing back yet |
| `CREATOR_LIST_REQUESTED` | **automatic** (AI classifies reply as `WANTS_CREATOR_LIST`) | Brand is interested and asked to see creators |
| `CREATOR_LIST_SENT` | **automatic** (system detects the team manually sent something in the thread) | The team sent the shortlist |
| `NEGOTIATION` | **manual** (dashboard dropdown) | Team is actively negotiating — not reliably detectable from email text |
| `CREATOR_SELECTED` | **automatic** (AI classifies reply as `CREATOR_CHOSEN`) *or* manual override | Brand named/committed to a creator |
| `NOT_INTERESTED` | **automatic** (AI classifies as `UNINTERESTED` or `OPT_OUT`) | Declined this campaign, or asked to stop entirely |
| `DEAL` | **manual** (dashboard dropdown) | Closed — not detectable from email alone |

Manual-set stages are exposed via `PATCH /api/sequences/[id]/stage` (`StageControl.tsx` component), restricted server-side to `NEGOTIATION`, `CREATOR_SELECTED`, `DEAL` only (`app/api/sequences/[id]/stage/route.ts`).

`DEAD_STAGES = ["DEAL", "NOT_INTERESTED"]` — once a sequence reaches one of these, the continuous checker stops watching its thread entirely (see §7).

---

## 7. The automation engine — `lib/scheduler.ts`

This is the most important file to understand before extending anything.

### 7.1 The worker tick

`scripts/worker.ts` calls `runWorkerTick()` every poll interval, which does two things in order:

```
runWorkerTick()
 ├─ runContinuousReplyCheck()   — watch every non-dead sequence's thread for events
 └─ runDueScheduledActions()    — actually send whatever follow-up/nudge is due right now
```

### 7.2 `runContinuousReplyCheck()` — watching threads

Queries **every** `OutreachSequence` where:
```
status NOT IN [BOUNCED, UNSUBSCRIBED, STOPPED, COMPLETED, PAUSED]
AND stage NOT IN [DEAL, NOT_INTERESTED]
```
Note this **includes `REPLIED`** — a sequence that's `REPLIED` + `stage: CREATOR_LIST_REQUESTED` still gets its thread checked every tick, because the team sending the creator list (a `MANUAL` outbound message) is itself an event this system needs to catch. This was a deliberate fix — the original design stopped watching entirely once `status` went terminal, which meant a manually-sent creator list would never be detected.

For each watched sequence, calls `checkThreadForTerminalEvent(gmail, seq)`.

### 7.3 `checkThreadForTerminalEvent()` — the core classifier

Fetches the Gmail thread (`getThreadSummary`), looks only at messages newer than `lastKnownMsgCount`, and processes them **in order**:

1. **Not from the contact (i.e. outbound):**
   - If its Gmail message ID is already in `EmailMessage` (this system sent it) → skip.
   - If it's *not* known → **the team typed and sent this directly in Gmail.** Calls `handleManualOutboundMessage()`: logs it as an `EmailMessage` with `source: MANUAL`, cancels any pending scheduled action, resets `status → WAITING_FOR_REPLY`, `currentStep → 0`, moves `stage → CREATOR_LIST_SENT` (unless the stage is already manually-set or terminal), and schedules a fresh `CREATOR_LIST_NUDGE` cycle (see §7.5). Then returns immediately (`manualSendDetected: true`) — remaining messages in this batch get picked up next tick.

2. **From the contact, looks like a bounce** (`looksLikeBounce()` — mailer-daemon sender or DSN-style subject) → `status → BOUNCED`, cancel pending, terminal.

3. **From the contact, looks like an auto-reply** (`looksLikeAutoReply()` — `Auto-Submitted`/`X-Autoreply` headers, or "out of office"/"automatic reply" in the subject) → log it, advance the watermark, keep going (not terminal — the *existing* pending follow-up is untouched).

4. **From the contact, anything else** → `classifyReply(snippet, { creatorListAlreadySent })` (see §7.4). `creatorListAlreadySent` is `true` whenever `stage` is *not* `FIRST_EMAIL_SENT` or `CREATOR_LIST_REQUESTED` — i.e. it's read as "has the list gone out yet," which changes which labels the classifier is allowed to use.

### 7.4 `lib/replyClassifier.ts` — `classifyReply(snippet, context)`

Calls Claude Haiku with a context-aware prompt. Possible labels, and what happens on each:

| Label | When offered | What happens |
|---|---|---|
| `AUTO_REPLY` | always | logged, cadence continues untouched |
| `NON_COMMITTAL` | always | "ok, will check and get back to you" — **actively reschedules**: cancels pending, resets `status → WAITING_FOR_REPLY` / `currentStep → 0`, schedules a `TEAM_CHECK_NUDGE` after `settings.nonCommittalDelayDays` (default 2) |
| `WANTS_CREATOR_LIST` | only when `!creatorListAlreadySent` | `status → REPLIED`, `stage → CREATOR_LIST_REQUESTED`, cancels pending, terminal (waits for the team to send the list manually) |
| `CREATOR_CHOSEN` | only when `creatorListAlreadySent` | `status → REPLIED`, `stage → CREATOR_SELECTED`, cancels pending, terminal |
| `UNINTERESTED` | always | declines *this* campaign — `status → REPLIED`, `stage → NOT_INTERESTED`, cancels pending, terminal. Does **not** globally suppress the contact. |
| `OPT_OUT` | always | explicit "stop emailing me" — `status → UNSUBSCRIBED`, `stage → NOT_INTERESTED`, adds to `SuppressedContact` (blocks *all future* sequences to this email), cancels pending, terminal |
| `HUMAN_REPLY` (fallback) | always | anything else substantive — `status → REPLIED`, stage unchanged, cancels pending, terminal (hands off to the team) |

**Without `ANTHROPIC_API_KEY` configured, `classifyReply()` always returns `HUMAN_REPLY`** — none of the nuance above is available; every non-bounce, non-auto-reply message is treated as a terminal human reply. This is a load-bearing caveat — as of the last check in this conversation, the key was set to an **empty string** in `.env`, meaning the classifier was inactive.

### 7.5 Nudge content — `lib/genericNudgeTemplates.ts`

Three named template sets (each with 3 steps, referencing only `{Contact_Name}`):
- `CREATOR_LIST_NUDGE` — "have you had a chance to look at the creator list," offers budget negotiation help
- `TEAM_CHECK_NUDGE` — "have you had a chance to check with your team"
- `GENERIC_NUDGE` — content-agnostic fallback (currently unused by any automatic path, but supported by the schema/renderer for future manual-send scenarios that aren't about the creator list)

`renderNudge(kind, step, contactName)` picks the right set and step.

### 7.6 Race-condition protection — `claimSequence()`

Every state-changing branch above first calls `claimSequence(seq, data)`, which does a **conditional `updateMany`**: `WHERE id = seq.id AND lastKnownMsgCount = seq.lastKnownMsgCount`. If two checks race (e.g. the worker's own tick overlapping a manually-triggered check), only the first writer's update matches a row; the loser's `count` comes back `0` and it silently backs off instead of duplicating the transaction (duplicate sends, duplicate activity-log entries). This was added after a real duplicate-logging bug was found in testing.

### 7.7 `processScheduledAction(scheduledActionId, options)` — actually sending

Runs the full send-protection gate before every send:
1. Action must be `PENDING`.
2. Sequence must not be `PAUSED` or in any terminal `status`.
3. Contact must not be in `SuppressedContact`.
4. Email account must be `CONNECTED`.
5. Re-checks the thread one more time (`checkThreadForTerminalEvent`) right before sending — if anything changed, skip.
6. Sending-window check (`clampToSendingWindow`) — unless `ignoreSendingWindow` (used by the manual "Send Now" button).
7. Daily quota check (`isUnderDailyLimit`, per `EmailAccount.dailySendLimit`) — if over, reschedule for tomorrow instead of sending.
8. Renders content: `TEMPLATE` kind → looks up the real `Template` row and does `{Variable}` substitution (blocks the send if any variable is still unresolved); `CREATOR_LIST_NUDGE`/`TEAM_CHECK_NUDGE`/`GENERIC_NUDGE` → `renderNudge()`.
9. Sends via `sendFollowUpEmail()` (preserves `In-Reply-To`/`References` headers for correct Gmail threading).
10. Advances the state machine, logs an `EmailMessage`, and — unless this was follow-up #3 (→ `COMPLETED`) — schedules the next action via `computeNextScheduledAt()`.

### 7.8 Timing — `lib/businessDays.ts`

- `addBusinessDays(date, n)` — skips weekends (Brand track).
- `addCalendarDays(date, n)` — no skipping (Creator track).
- `clampToSendingWindow(date, settings)` — pushes a date/time forward to the next moment inside the configured sending window/days.
- **`pickRandomSendTime(date, settings)`** — finds the right day via `clampToSendingWindow`, then overrides the time-of-day with a **random minute inside the window** (default 7:00–10:00am IST). Every place a follow-up/nudge gets scheduled goes through this (via `scheduler.ts: computeNextScheduledAt()`, which is exported and reused by `trackSequence.ts` and the manual "Skip" control) — so no two follow-ups land at the identical clock time, and the reasoning (per the team) is that most brands are China/Hong Kong-based, roughly 2.5–3 hours ahead of IST, so a 7–10am IST send lands in their inbox around their own 10–11am office-open.

### 7.9 Batch send pacing

`runDueScheduledActions()` processes all currently-due actions in one tick, but sleeps a random `sendSpacingSecondsMin`–`sendSpacingSecondsMax` (default 30–180s) between each **send** within that batch — separate from the day-level randomization above, this prevents a burst of simultaneous sends within a single tick.

---

## 8. `AutomationSettings` — every configurable field

Single global row, editable at `/settings`, API at `GET`/`PUT /api/settings`:

| Field | Default | Meaning |
|---|---|---|
| `brandDelayDays1/2/3` | 1 / 4 / 5 | business days between Brand follow-ups |
| `creatorDelayDays1/2/3` | 2 / 3 / 4 | calendar days between Creator follow-ups |
| `sendWindowStartHour` / `sendWindowEndHour` | 7 / 10 | sending window, 24h clock, host machine's local time |
| `sendWindowDays` | `MON,TUE,WED,THU,FRI` | comma-separated allowed weekdays |
| `sendSpacingSecondsMin/Max` | 30 / 180 | random gap between sends within one batch |
| `nonCommittalDelayDays` | 2 | days before a `TEAM_CHECK_NUDGE` after a vague reply |

---

## 9. UI / design system

- Every color is a **CSS custom property** defined in `app/globals.css` (`--bg`, `--surface`, `--border`, `--ink`, `--muted`, `--muted-2`, `--brand-teal*`, `--success/warn/danger/neutral/info-bg/fg`, `--stage-*-bg/fg`, `--ink-inverse`, `--shadow-card`) — no component hardcodes a hex color. This is what makes theme-wide changes (like dark mode) cheap.
- **Light/dark theme**, user-toggleable: `ThemeToggle.tsx` (bottom of the sidebar nav) sets `data-theme="light"|"dark"` on `<html>` and persists to `localStorage`. An inline blocking `<script>` in `app/layout.tsx` applies the saved theme before first paint (no flash-of-wrong-theme). Absent an explicit choice, `@media (prefers-color-scheme: dark)` follows the OS setting. Dark palette is Gmail-dark-inspired (`#131314` bg / `#1e1f20` surface / `#e8eaed` text).
- **Plain-language labels everywhere** — `lib/friendlyLabels.ts` (`variableLabel()`, `variableHint()`, `budgetTypeLabel()`), `app/components/Badge.tsx` (`statusLabel()`, `stageLabelText()`) — no raw enum/database value is ever shown directly to a non-technical user.
- **Pages:** `/dashboard` (+ `/dashboard/[id]` detail/timeline/controls), `/track` (new outreach, 3 tabs), `/templates` (editor), `/analytics`, `/activity` (global audit log), `/settings`, `/login`, `/setup`.

---

## 10. API route map

```
POST   /api/auth/login, /api/auth/logout          — session auth
POST   /api/setup                                  — first-run admin account creation
GET    /api/auth/google, GET /api/auth/google/callback  — Gmail OAuth
GET    /api/gmail/search                            — search Sent mail for the "attach" flow
POST   /api/extract/email-details                    — paste-to-autofill extraction
POST   /api/sequences                                — attach-existing-thread flow
POST   /api/sequences/compose                        — write & send flow
POST   /api/sequences/bulk                           — CSV bulk send
GET    /api/sequences/[id]                           — sequence detail
POST   /api/sequences/[id]/control                   — PAUSE / RESUME / STOP / SKIP / SEND_NOW
PATCH  /api/sequences/[id]/stage                      — manual stage set (NEGOTIATION/CREATOR_SELECTED/DEAL)
GET/PUT /api/settings                                — AutomationSettings + connected accounts + suppression list
DELETE /api/settings/email-accounts/[id]              — disconnect a Gmail account
POST   /api/settings/suppress                         — manually add to Do Not Email
GET/POST /api/templates, POST /api/templates/reset    — template CRUD + reset-to-default
GET    /api/analytics                                 — reply-rate / completion metrics
GET/POST /api/team                                    — team member management
```

---

## 11. Background worker operations

- Run via **PM2**: `npx pm2 start ecosystem.config.js`. Config points `script` at `node_modules/tsx/dist/cli.mjs` directly (not the `node_modules/.bin/tsx` shim — that's a POSIX shell script that PM2 on Windows executes with `node` directly, producing a `SyntaxError: missing ) after argument list`).
- `autorestart: true`, `max_restarts: 50` — survives a crash from a single bad Gmail/DB response (also has top-level `unhandledRejection`/`uncaughtException` handlers in `worker.ts` as a second line of defense).
- **Does not survive a full machine reboot** unless `pm2 save` + `pm2 startup` have been run once (not yet configured as of this writing).
- Health is visible on `/settings` via the `WorkerHeartbeat` row; if it stops updating, the worker process itself has died.
- **Important operational note:** the worker (and the dev server) hold a lock on the native Prisma query-engine binary (`app/generated/prisma/query_engine-windows.dll.node`) — both must be stopped before running `npx prisma db push`/`generate`, or the generate step fails with `EPERM`.

---

## 12. Known limitations / caveats (read before extending)

1. **No real timezone handling.** All hour-of-day checks (`sendWindowStartHour`, etc.) use the Node process's local time via `Date.getHours()`. This only produces IST-correct behavior because the host machine itself is set to IST. Deploying to a server in another timezone (or scheduling jobs via a UTC-based cron) would silently break the 7–10am window.
2. **Reply classification requires `ANTHROPIC_API_KEY`.** Without it, every substantive reply is treated as a plain terminal `HUMAN_REPLY` — no non-committal detection, no "wants the list" / "chose a creator" auto-staging, no opt-out vs. "not interested" distinction (both would just become a generic stop).
3. **No structured record of *what* was in a manually-sent creator list.** `handleManualOutboundMessage()` logs the `EmailMessage` with a placeholder body ("(sent directly from Gmail — not tracked by the system)") — the actual content/creator names aren't captured, so `CREATOR_CHOSEN` classification relies purely on the *reply's* wording ("let's go with X"), not cross-referencing against what was actually offered.
4. **Single-tenant.** All `User` rows see all data; there's no per-user or per-team data partitioning.
5. **Outlook is schema-ready but not implemented** (`EmailProvider.OUTLOOK` exists, no corresponding client code).
6. **`MAX_FOLLOW_UPS` is a single global constant (3)**, shared by every cadence (Email-1 follow-ups, creator-list nudges, team-check nudges) — there's no per-cadence override, even though real-world usage suggested "maybe 3 or 4" for the creator-list case specifically.
7. **`GENERIC_NUDGE` template set exists but nothing currently triggers it automatically** — every manual-send-triggered nudge currently defaults to `CREATOR_LIST_NUDGE`. It's there for a future case where a manual send isn't about the creator list.

---

## 13. How to extend this system (for whoever picks this PRD up next)

- **New reply classification / new automatic behavior on a reply:** add a label to `ReplyClassification` in `lib/replyClassifier.ts`, extend the prompt, then add a handling branch in `checkThreadForTerminalEvent()` in `lib/scheduler.ts` — follow the existing pattern: `claimSequence()` first, then a `$transaction` for the side effects (cancel pending, log activity, maybe update `stage`).
- **New pipeline stage:** add it to the `PipelineStage` enum in `prisma/schema.prisma`, run `npx prisma db push` (stop the dev server + worker first — see §11), add a color/label pair to `STAGE_STYLE`/`STAGE_LABEL` in `Badge.tsx` (plus CSS variables in `globals.css` for both light and dark), and decide whether it's auto-set (in `scheduler.ts`) or manual (add to `MANUALLY_SETTABLE_STAGES` in `app/api/sequences/[id]/stage/route.ts`).
- **New nudge/follow-up copy:** add a template set to `lib/genericNudgeTemplates.ts`, add the corresponding value to the `ScheduledActionKind` enum in the schema, and branch on it in `processScheduledAction()`.
- **New required-variable or template:** edit `lib/defaultTemplates.ts` (seed content) and/or `lib/templates.ts` (`BRAND_VARIABLES`/`CREATOR_VARIABLES` lists) — `requiredVariablesFor()` in `trackSequence.ts` derives requirements straight from what a template actually references, so a new variable only becomes "required" if a template uses `{ItsName}`.
- **Always run the full verification pass before considering a change done:** `npx tsc --noEmit -p tsconfig.json` → `npx eslint .` → `npx vitest run` → `npx next build` → stop the dev server, `rm -rf .next`, restart cleanly. Running `next build` while the dev server is live corrupts its Turbopack cache.
- **After any schema change:** stop both the dev server and the PM2 worker first (they lock the native Prisma engine binary on Windows), run `npx prisma db push --accept-data-loss`, then restart both. New/changed columns with a `@default()` only apply that default to *new* rows — existing rows need a one-off script to backfill (see how `sendWindowStartHour`/`sendWindowEndHour` were updated when the window changed from 9–5 to 7–10).

---

*This document reflects the system as of the state of `D:\Fidem outreach` at the time it was written. It is not automatically kept in sync with the code — if it's been a while, diff it against `prisma/schema.prisma` and `lib/scheduler.ts` before trusting it fully.*
