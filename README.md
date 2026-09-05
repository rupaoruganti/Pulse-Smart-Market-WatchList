# Pulse — Smart Market Watchlist

Pulse is a full-stack, dependency-free submission for Groww CODE 2026. It answers one question clearly: **what meaningfully changed since I last checked?**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933) ![Dependencies](https://img.shields.io/badge/runtime_dependencies-0-00a984)

## Run locally

```bash
npm start
```

Open `http://localhost:3000`. Node.js 20+ is the only requirement; there is no install or build step.

On first visit, register a personal account or choose **Continue with demo account**. The server binds to `127.0.0.1` by default, so it is available only on this computer and does not need public firewall access.

The demo market advances every eight seconds. Prices, volume, session high/low, sparklines, timestamps, scoring, and open browser sessions update together. Set `PULSE_DISABLE_TICKS=1` for a frozen deterministic feed when debugging.

### Optional NSE provider feed

Pulse supports server-side quote polling through Twelve Data. Create an API key, then start PowerShell with:

```powershell
$env:TWELVE_DATA_API_KEY="your-key"
npm.cmd start
```

The server batches the 12 configured `SYMBOL:NSE` instruments into one `/quote` request every 60 seconds. The key never enters browser code or API responses. If the provider is unavailable or rate-limited, the UI says so explicitly and temporarily switches to the labeled simulator. Remove the environment variable to use simulation only.

Batching reduces network overhead but each symbol still consumes one provider credit, so check the [official Twelve Data batch-request documentation](https://support.twelvedata.com/en/articles/5203360-batch-api-requests) before increasing the universe or polling frequency. Data freshness depends on the provider plan and exchange entitlements; Pulse deliberately labels this “Provider feed,” not guaranteed real-time data.

## Product decisions

### Meaningful, not noisy

A stock is evaluated against its own historical behavior rather than a universal percentage threshold. The normalized components are:

- unusual movement since the user’s last review — 45%;
- volume anomaly versus the 20-day profile — 30%;
- crossing the prior session’s high or low — 15%;
- an unusual expansion in intraday range — 10%.

Continuous signals use a capped z-score: `(current - historical mean) / standard deviation`. A score must clear a noise floor of `1.15`, and no more than five ranked market changes are surfaced per visit. Data-integrity warnings bypass that cap and are visually separated, because possible splits or corrupt ticks should never be hidden by market rankings. A quiet market therefore produces an honest empty state instead of manufactured urgency. Every alert states its dominant reason; the score is used for ranking, not shown as financial advice.

### “Last checked” is explicit

The baseline moves only when **Mark as reviewed** is used. Opening another tab does not silently clear changes. Per-symbol price, volume, high, low, and timestamp snapshots are stored server-side so they follow the user across sessions/devices. New symbols use a conservative market baseline until their first review.

### Reliability choices

- Writes use a temporary file plus atomic rename to avoid partial JSON corruption.
- Every mutation includes the last-seen store version. A stale writer receives `409 Conflict` instead of overwriting newer data.
- Server-sent events fan out both market ticks and successful user-state writes to open sessions.
- Market timestamps, feed source, and delay are visible; stale data is never presented as live.
- Split-like price discontinuities are labeled as possible corporate actions instead of high-conviction market signals.
- Input size, watchlist names, symbols, paths, and response types are constrained server-side.

### Authentication and isolation

- Passwords are never stored directly; Node’s built-in `scrypt` derives a 64-byte hash with a unique random salt.
- A successful login creates a cryptographically random, HTTP-only, `SameSite=Strict` session cookie.
- Sessions expire on both the browser and server after eight hours, and logout invalidates the token immediately.
- Repeated failed logins are throttled per address and email.
- Each account owns separate watchlists, profile details, and review snapshots.

Sessions are intentionally held in memory for this single-process demo, so restarting the server requires signing in again. Production would store hashed session identifiers in Redis or a database, use TLS-secured cookies, add email verification/recovery, and apply distributed rate limiting.

## Architecture

```text
Browser (responsive HTML/CSS/JS)
  ├── REST: bootstrap + mutations
  └── SSE: cross-session invalidation
              │
Node HTTP server (no framework)
  ├── deterministic demo market adapter
  ├── scoring.js (pure significance engine)
  ├── optimistic concurrency
  └── atomic JSON persistence
```

The JSON store is appropriate for a single-user demo, so each mutation currently rewrites one small file. In production, row-level updates in Postgres replace this wholesale rewrite. The interface maps to `watchlists`, `watchlist_items`, and `review_baselines`, using row versions for optimistic locking. Market ticks would enter through a durable stream, be normalized once, and fan out through a cached significance service rather than being calculated separately per browser.

Runtime accounts and password hashes live in the ignored `data/store.json`. The repository ships only `data/store.seed.json`, containing a passwordless fictional demo account. On first boot, the server copies that seed into a fresh runtime store, preventing local test identities or credentials from entering a submission.

The simulator exercises changing and stale data paths, but deliberately does not pretend to reproduce conflicting exchange providers. Production ingestion would attach provider and exchange timestamps, reject older ticks, and quarantine materially conflicting same-timestamp values for reconciliation while serving the last verified observation with reduced confidence.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/bootstrap` | User state, instruments, source freshness |
| `GET` | `/api/events` | Cross-session update stream |
| `POST` | `/api/auth/register` | Create an isolated account and session |
| `POST` | `/api/auth/login` | Verify credentials and create a session |
| `POST` | `/api/auth/demo` | Enter the passwordless demo account |
| `POST` | `/api/auth/logout` | Invalidate the current session |
| `POST` | `/api/watchlists` | Create a watchlist |
| `PATCH/DELETE` | `/api/watchlists/:id` | Rename/delete a watchlist |
| `PATCH` | `/api/profile` | Update the personal demo profile |
| `PUT/DELETE` | `/api/watchlists/:id/items/:symbol` | Add/remove an instrument |
| `DELETE` | `/api/watchlists/:id` | Delete a watchlist |
| `POST` | `/api/review` | Advance the explicit review baseline |
| `POST` | `/api/account/reset` | Restore starter watchlists and review state |

All mutations accept `{ "version": number }`.

## Intentional scope

This is not a trading terminal. Order placement, recommendations, social sentiment, and dozens of technical indicators were left out because they dilute the core job. The included market feed is a visibly labeled deterministic simulation, not real NSE data; production would use an exchange-authorized provider and the reconciliation policy above.
