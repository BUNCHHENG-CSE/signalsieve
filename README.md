# TCT SignalSieve (`tct-signalsieve`) — Alert Noise Reducer for Lean Ops & Security Teams

> **Stop triaging 500 raw alerts. Fix the 3 root causes.**  
> Built for lean security & ops teams (2–10 people) who already have monitoring tools (PagerDuty, Datadog, AWS CloudWatch, AWS GuardDuty) producing more alert noise than they can process.

---

## 🚀 Key Features

### 1. Multi-Source Telemetry Ingestion (`POST /api/ingest`)
- Out-of-the-box webhook normalizers for **PagerDuty V3**, **Datadog Monitors**, **AWS CloudWatch Alarms**, **AWS GuardDuty Findings**, and generic JSON/CSV imports.
- Automatically extracts high-signal correlation entities (`cert_cn`, `db_cluster`, `attacker_ip`, `iam_principal`, `error_code`, `upstream_service`) from structured attributes and free-text bodies.

### 2. Time-Window + Multi-Dimensional Entity Clustering
- Correlates alerts within a configurable rolling time window (default `15m`) using a composite score of:
  - **Shared Root Entity** (`cert_cn`, `db_cluster`, `attacker_ip`, `error_code`) (45% weight)
  - **Service Dependency Topology** (upstream/downstream graph) (30% weight)
  - **Normalized Fingerprint & Token Jaccard Similarity** (25% weight)

### 3. Chronological Incident Waterfall & Timeline Explorer
- Visual timeline with delta timestamps from origin (`+00:00 (Origin)`, `+00:15s`, `+01:04m`) showing the exact cause-to-effect cascade across microservices.
- Easily identify the trigger alert vs downstream cascade symptoms.
- Filter timeline by severity, monitoring source, or keyword search.

### 4. Hybrid Context Summary Synthesizer
- **Deterministic Entity Synthesizer (Default, Zero Latency, 100% Offline)**: Generates clear incident narratives (*"These 12 alerts across 4 microservices from Datadog, PagerDuty, and CloudWatch all trace to the same expired TLS certificate (`*.prod.internal.acme.io`) on `edge-gateway`."*), root-cause hypotheses, and remediation runbooks.
- **Pluggable LLM Synthesizer**: Connect **OpenAI** (`gpt-4o-mini`), **Google Gemini** (`gemini-2.5-flash`), or **Anthropic Claude** (`claude-3-5-sonnet-latest`) in the Settings modal.

### 5. Blast Radius & Composite Urgency Ranking (0–100)
- Ranks incidents by **Blast Radius (0–100)** (`Services Spread`, `Service Tier Criticality`, `Environment Weight`, `Cross-Source Corroboration`) and **Composite Urgency (0–100)** (`42% Blast Radius`, `23% Alert Velocity`, `20% Root-Cause Weight`, `15% Raw Severity`).
- Prevents noisy staging alerts with arbitrary `CRITICAL` labels from burying production incidents.
- Includes visual **Blast-Radius Dependency Graph** and complete score math breakdown.

### 6. One-Click Post-Mortem Export & Outbound Webhook Dispatcher
- **1-Click Markdown Post-Mortem**: Generates complete incident briefs ready to paste into Notion, Confluence, GitHub, or Jira (Overview, Root Cause, Blast Radius, Waterfall Timeline, Verification Checklists).
- **Outbound Webhook Dispatcher**: Dispatches rich incident notifications to **Slack** (Blocks format), **Microsoft Teams** (MessageCard), or generic webhooks with live delivery verification.
- **Machine-Readable JSON Audit**: 1-click export of full incident payloads.

### 7. 24-Hour Pattern Suppression Shields & Custom Rule Creator
- Mute noisy or flapping alert signatures for 24 hours (or 1h, 6h, 12h, 48h, 7d) with a mandatory operator reason log and live countdown timer.
- Incoming alerts matching active rules are automatically intercepted and counted without paging on-call.
- **Custom Rule Builder**: Create proactive suppression rules ahead of scheduled maintenance windows.

### 8. Analytics & Operational ROI Dashboard
- Real-time **Compression Funnel** and noise reduction metrics.
- **Engineering Toil Calculator**: Customize your hourly on-call rate (\$/hr) to quantify dollars and hours saved.
- Visual charts: Top Noisy Services breakdown, Prevalent Root-Cause Entities, Telemetry Source Mix, and Urgency Tier distribution.

### 9. Multi-Select Bulk Triage & Advanced Filters
- Checkbox multi-select with a floating bottom action dock:
  - **Acknowledge All**, **Resolve All**, **Silence 24h**, and **Export JSON**.
- Advanced filter drawer: Filter by Environment (`Production`, `Staging`, `Development`), Severity (`Critical`, `High`, `Warning`), Target Service, and Minimum Urgency score slider.

### 10. Live Auto-Refresh & Chaos Storm Streaming Simulator
- Selectable **Live Auto-Refresh** (`Off`, `5s`, `10s`, `30s`) with animated pulsing indicator and live refresh countdown.
- **Real-Time Streaming Alert Storm Player**: Streams alerts one-by-one with dynamic interval and progress bar so operators can watch live clustering in action.
- Built-in scenarios: Expired TLS Certificate, Aurora DB Connection Pool Exhaustion, GuardDuty Crypto-Mining, Payment Gateway Timeout, and Staging Flapping Cron.

### 11. 1-Week Alert Export & Clustering Validation Lab
- Test historical 1-week alert exports against human on-call consensus labels.
- Calculates **Pairwise Precision**, **Recall**, and **F1 Agreement Score** to tune correlation weights before rolling out to production.

### 12. Power-User Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| `j` / `↓` | Select next incident cluster in triage queue |
| `k` / `↑` | Select previous incident cluster in triage queue |
| `Enter` / `Space` | Open selected incident cluster detail drawer |
| `Escape` | Close active drawer or modal |
| `a` | Acknowledge currently selected incident |
| `r` | Resolve currently selected incident |
| `s` | Arm 24h suppression rule for selected incident |
| `/` | Focus search bar |
| `?` | Open keyboard shortcuts cheat sheet |

---

## 🛠️ Quick Start (All-in-One Full-Stack Next.js)

### 1. Install & Run with Bun or Node

```bash
# Using Bun (Recommended)
bun install
bun dev

# Or using npm
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🗄️ Database Architecture: Neon PostgreSQL (Production) & SQLite (Local)

TCT SignalSieve uses **Prisma ORM** with dual-database support:

### Local Development (Zero-Config SQLite)
- **Active by default**: Uses local SQLite at `data/signalsieve.db` via `DATABASE_URL="file:./data/signalsieve.db"`.
- Requires **zero external servers, zero Docker, and zero setup**.
- Commands:
  ```bash
  bun run db:use:sqlite   # Switch & push local SQLite schema
  bun run db:push         # Push schema changes to SQLite
  bun run db:studio       # Launch Prisma Studio for local DB
  ```

### Production Deployment (Neon Serverless PostgreSQL)
- Seamlessly connects to **Neon Serverless PostgreSQL** with connection pooling and SSL encryption (`sslmode=require`).
- Set your Neon pooled or direct connection string in `.env` or production environment:
  ```env
  DATABASE_URL="postgresql://user:password@ep-cool-snowflake-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
  ```
- Commands:
  ```bash
  bun run db:use:neon "postgresql://user:pass@ep-name.region.aws.neon.tech/neondb?sslmode=require"
  bun run db:push         # Push Prisma schema to Neon
  bun run build           # Automatically compiles production Prisma client & Next.js
  ```
- You can also live-switch between Neon PostgreSQL and local SQLite dynamically at runtime from the **Settings Modal** in the web dashboard without restarting the server!
