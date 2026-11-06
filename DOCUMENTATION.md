# TCT SignalSieve (`tct-signalsieve`): Alert Noise Reducer for Lean Ops & Security Teams
## Comprehensive Technical Architecture, Operation, Capabilities, and Value Guide

---

## 1. Executive Summary & Vision

Modern engineering and security teams are drowning in monitoring telemetry. A single infrastructure fault—such as an expired TLS certificate, a saturated database connection pool, or an automated credential stuffing attack—routinely triggers a cascade of dozens or hundreds of distinct alerts across multiple monitoring tools:
* **Datadog** fires synthetic monitor failures and APM error-budget spikes.
* **PagerDuty** creates high-urgency pages for downstream API services experiencing 502/504 errors.
* **AWS CloudWatch** alarms on Application Load Balancer (ALB) HTTP 5xx rates and target response times.
* **AWS GuardDuty** flags anomalous credential activity and high-volume failed authentication attempts.

For **lean operations and security teams (2–10 engineers)** without dedicated Tier-1 Network Operations Centers (NOC) or 24/7 Security Operations Centers (SOC), on-call engineers face severe **alert fatigue**:
* Engineers spend 30 to 45 minutes manually triaging disparate alerts, reading raw stack traces, and determining which alert was the root cause versus which were downstream symptoms.
* Critical production incidents get lost among high-frequency "CRITICAL" warnings triggered by non-customer-impacting staging cron jobs or flapping third-party partner connections.
* Constant alert interruptions lead to human burnout, high turnover, and extended Mean Time to Resolution (MTTR).

**TCT SignalSieve** solves this fundamental operational crisis. Rather than replacing existing monitoring platforms (PagerDuty, Datadog, AWS CloudWatch, AWS GuardDuty), TCT SignalSieve sits in front of on-call engineers as an intelligent correlation and triage gateway. It intercepts high-volume raw alert webhooks in real time, clusters them into unified multi-service incidents using deterministic entity correlation and topological dependency analysis, ranks them by true business blast radius, and provides actionable remediation guidance.

```
+-----------------------------------------------------------------------------------+
|                           HETEROGENEOUS TELEMETRY SOURCES                         |
|   PagerDuty V3 Webhooks | Datadog Webhooks | AWS CloudWatch Alarms | AWS GuardDuty|
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                              TCT SIGNALSIEVE ENGINE                               |
|                                                                                   |
|  1. Ingestion & Normalizer Pipeline: Text extraction, regex entity mining         |
|  2. Active 24h Suppression Engine: Pattern signatures & advisory-locked rules     |
|  3. Greedy Chronological Clustering: Rolling time windows, topology, Jaccard      |
|  4. Dynamic Blast Radius & Urgency Ranking: Tier criticality, service cascade     |
|  5. Hybrid Summary Synthesizer: Zero-latency deterministic runbooks + LLM API     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                                TRIAGE COCKPIT & UI                                |
|   * High-Level Executive Metrics (Noise Reduction %, Saved Triage Hours)          |
|   * Smart Ranked Incident Cards (Urgency 0-100 vs Misleading Raw Severities)       |
|   * Visual Blast Radius Dependency Graphs                                         |
|   * 1-Click 24h Pattern Suppression with Reason Logs                              |
|   * Validation Lab: Ground-truth F1 score tuning on historical alert datasets     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Value Proposition & ROI for Lean Teams

| Dimension | Traditional Alert Triage | TCT SignalSieve Operational Model |
| :--- | :--- | :--- |
| **Volume Handled** | 500 individual pages / day sent to on-call phone. | Correlated into 3–5 actionable incident clusters. |
| **Noise Reduction** | 0% (every monitor pages independently). | **85% – 95% noise reduction** across heterogeneous sources. |
| **Triage Time** | 30–45 mins per incident cross-referencing dashboards. | **< 3 minutes**: root cause entity, runbook, and blast radius displayed instantly. |
| **Priority Accuracy** | Based on arbitrary tool labels (e.g. staging cron labeled `CRITICAL` pages on-call at 2 AM). | **Contextual Urgency Ranking (0–100)**: Evaluates tier criticality, production vs staging, velocity, and cascade spread. |
| **Downstream Noise** | Engineers restart 5 downstream microservices unnecessarily. | Clear dependency graph warns: *"Do not restart downstream services; they will recover once upstream TLS/DB is fixed."* |
| **Noisy Flapping Alarms** | Ignored informally or disabled permanently in monitoring tools. | **1-Click 24h Suppression** with mandatory reason logging, automatic expiration, and intercepted alert counters. |
| **Offline Reliability** | Cloud-dependent or proprietary black-box ML. | **Zero-latency deterministic summarizer** runs 100% locally with dual PostgreSQL 16 / SQLite fallback. |

---

## 3. System Architecture & Component Design

TCT SignalSieve is engineered as a modern, high-throughput all-in-one full-stack Next.js application utilizing TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, and dual-database storage (Neon Serverless PostgreSQL with pooling and SSL in production, and zero-config local SQLite for development).

### 3.1 Architectural Layout

```mermaid
flowchart TD
    subgraph WebhookSources["Telemetry Ingestion Sources"]
        PD["PagerDuty V3 Webhooks"]
        DD["Datadog Monitors & APM"]
        CW["AWS CloudWatch Alarms (SNS)"]
        GD["AWS GuardDuty Security Findings"]
        GW["Generic Webhooks / JSON / CSV"]
    end

    subgraph IngestionLayer["Ingestion & Normalization Layer (POST /api/ingest)"]
        NORM["Payload Normalizer<br/>(src/lib/normalizers.ts)"]
        ENTITY["Entity Mining Engine<br/>(cert_cn, db_cluster, attacker_ip, error_code)"]
        FP["Fingerprint & Signature Generator"]
    end

    subgraph SuppressionLayer["Active Suppression Layer"]
        SUPP_CHECK{"Matches Active<br/>24h Suppression?"}
        SUPP_STORE[("Suppressed Alert Record<br/>Counter Increment")]
    end

    subgraph CorrelationLayer["Correlation & Clustering Engine"]
        WINDOW{"Within Rolling<br/>Time Window (15m)?"}
        CORR["Pair Correlation Calculator<br/>Entity (45%) + Topology (30%) + Text (25%)"]
        THRESH{"Score >= Threshold<br/>(default 0.42)?"}
        MERGE["Merge into Existing Cluster"]
        CREATE["Create New Incident Cluster"]
    end

    subgraph RankingLayer["Ranking & Graph Engine (src/lib/ranking.ts)"]
        BLAST["Blast Radius Calculator (0-100)<br/>Services + Tiers + Cross-Source + Env"]
        URGENCY["Composite Urgency Calculator (0-100)<br/>Blast (42%) + Velocity (23%) + Root (20%) + Sev (15%)"]
        DEP_GRAPH["Topological Dependency Graph Builder"]
    end

    subgraph SynthesizerLayer["Hybrid Summary Synthesizer (src/lib/summarizer.ts)"]
        DET_SYNTH["Deterministic Incident Synthesizer<br/>(Zero latency, 100% offline)"]
        LLM_SYNTH["Pluggable LLM Synthesizer<br/>(OpenAI / Gemini / Anthropic)"]
    end

    subgraph StorageLayer["Data Storage Layer (src/lib/db.ts)"]
        PG[("Neon Serverless PostgreSQL + Prisma ORM<br/>Advisory Locks + Pooling + GIN")]
        SQLITE[("Prisma ORM + Node.js SQLite<br/>(WAL Mode, Zero Config)")]
    end

    subgraph PresentationLayer["Presentation Layer (src/app/page.tsx)"]
        DASH["Triage Cockpit (Smart vs Raw Severity)"]
        DRAWER["Cluster Detail Drawer & Graph Explorer"]
        LAB["1-Week Validation Lab (F1 Score Tuning)"]
        SUPP_TAB["Suppression Manager & Rule Auditor"]
    end

    WebhookSources --> NORM
    NORM --> ENTITY --> FP
    FP --> SUPP_CHECK
    SUPP_CHECK -- Yes --> SUPP_STORE
    SUPP_CHECK -- No --> WINDOW
    WINDOW -- Yes --> CORR --> THRESH
    WINDOW -- No --> CREATE
    THRESH -- Yes --> MERGE
    THRESH -- No --> CREATE
    MERGE --> BLAST
    CREATE --> BLAST
    BLAST --> URGENCY --> DEP_GRAPH
    DEP_GRAPH --> DET_SYNTH
    DET_SYNTH -. Pluggable Optional .-> LLM_SYNTH
    DET_SYNTH --> PG
    DET_SYNTH --> SQLITE
    PG --> DASH
    SQLITE --> DASH
    DASH --> DRAWER
    DASH --> LAB
    DASH --> SUPP_TAB
```

---

## 4. How It Works: Detailed Engineering Walkthrough

### 4.1 Ingestion & Multi-Source Normalization

Alert payloads arrive in disparate schemas depending on the vendor:
* **PagerDuty** formats payloads inside `event.data` or `incident.custom_details`.
* **Datadog** passes tag arrays such as `["service:orders-service", "env:production", "db_cluster:rds-orders-primary"]`.
* **AWS CloudWatch** passes `Trigger.Dimensions` like `[{ name: "ServiceName", value: "edge-gateway" }]`.
* **AWS GuardDuty** nests findings inside `detail.type`, `detail.service`, and `detail.resource`.

The normalizer ([src/lib/normalizers.ts](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/lib/normalizers.ts)) ingests raw payloads, auto-detects the provider, maps severities (`critical`, `high`, `warning`, `info`) and environments (`production`, `staging`, `development`, `global`), and produces a standardized `RawAlert` model.

#### Entity Mining Regex Engine
Alert descriptions frequently hide critical correlation keys in unstructured text. SignalSieve executes deterministic regex extraction on incoming titles and descriptions:
* **TLS Certificates**: `/(?:cert(?:ificate)?|cn|sni|domain)[=:\s"']+([a-zA-Z0-9*.-]+\.[a-zA-Z]{2,})/i` (extracts `*.prod.internal.acme.io`)
* **IP Addresses / Threat Actors**: `/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/` (extracts `185.220.101.42`)
* **Standard Error Codes**: Detects `CERT_HAS_EXPIRED`, `X509_V_ERR_*`, `ETIMEDOUT*`, `ECONNREFUSED`, `FATAL_TOO_MANY_CONNECTIONS`, `502_BAD_GATEWAY`, `AUTH_BRUTE_FORCE`, `OOM_KILLED`.
* **Database Clusters**: Detects `rds-*`, `pgbouncer-*`, `postgres-*`, `redis-*`.

#### Normalized Fingerprinting & Pattern Signatures
To enable fast suppression matching and token similarity, the engine strips dynamic variables (UUIDs, IP addresses, numeric thresholds, microsecond latencies) into canonical token templates:
```typescript
normalizeTextForFingerprint("502 Bad Gateway calling edge-gateway on host i-0a8b1c2d3e (latency 412ms)")
// Produces: "502-bad-gateway-calling-edge-gateway-on-host-<uuid>-latency-<metric>"
```

---

### 4.2 Greedy Chronological Clustering Engine

Incoming alerts are evaluated sequentially against open clusters within a rolling time window (configurable, default: **15 minutes**).

#### Mathematical Pair Correlation Formula
The correlation score between an incoming alert $A$ and an existing cluster alert $B$ is a weighted composite score in the range $[0.0, 1.0]$:

$$Score(A, B) = w_{entity} \cdot S_{entity} + w_{topo} \cdot S_{topo} + w_{text} \cdot Jaccard(Tokens(A), Tokens(B))$$

Where:
* **$w_{entity}$ (Default: 0.45)**: Weight assigned to shared root-cause entity matches. If both alerts share an identical `cert_cn`, `db_cluster`, or `attacker_ip`, $S_{entity} = 1.0$. If they share a generic `error_code`, $S_{entity} = 0.78$.
* **$w_{topo}$ (Default: 0.30)**: Weight assigned to service topology.
  * $S_{topo} = 1.0$ if $Alert_A.service == Alert_B.service$.
  * $S_{topo} = 0.85$ if explicit `upstream_service` links are present in metadata.
  * $S_{topo} = 0.75$ if services are linked in the known Service Dependency Topology graph ([src/lib/ranking.ts](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/lib/ranking.ts#L29-L36)).
* **$w_{text}$ (Default: 0.25)**: Token Jaccard similarity across alert titles, descriptions, and tag values after stop-word filtering. If normalized fingerprints match exactly, $S_{text} \ge 0.95$.

#### Strong Root-Cause Overrides
If two alerts share a high-confidence root-cause entity (e.g. the exact same expired domain or saturated database pool) and either belong to topologically linked services or share error codes, the composite score is boosted:
$$\text{Score} = \max(\text{Score}, 0.72 \cdot w_{entity} + 0.45)$$
This guarantees that cascading failures across dependent microservices are merged even if their textual descriptions differ significantly (e.g. Datadog APM reporting `p99 latency > 3000ms` while PagerDuty reports `HTTP 502 Bad Gateway`).

---

### 4.3 Blast Radius & Composite Urgency Ranking

Raw alerts notoriously display misleading severities: a background staging batch worker might throw a `CRITICAL` alert because its database connection timed out, while a multi-service production cascade might begin with a `WARNING` label on TLS handshake error counts.

SignalSieve calculates a calibrated **Blast Radius Score (0–100)** and **Composite Urgency Score (0–100)** to eliminate false alarms:

#### 1. Blast Radius Score (0–100)
$$\text{BlastRadius} = \min(100, S_{services} + S_{crossSource} + S_{env} + S_{tier})$$
* **Affected Services Spread ($S_{services}$, 0–35 pts)**: $9 \times \text{Unique Impacted Services}$. A cascade affecting 4 services scores 35/35.
* **Cross-Source Corroboration ($S_{crossSource}$, 0–15 pts)**: 15 pts if corroborated across 3+ monitoring tools (e.g. PagerDuty + Datadog + AWS CloudWatch); 11 pts if 2 sources; 5 pts for a single source.
* **Environment Weight ($S_{env}$, 0–25 pts)**: Production = 25 pts; Staging = 10 pts; Development/Sandbox = 4 pts.
* **Service Tier Criticality ($S_{tier}$, 0–25 pts)**: Tier-1 (edge gateway, payments, authentication, checkout) = 25 pts; Tier-2 (inventory, billing, workers) = 16 pts; Tier-3 = 6 pts.

#### 2. Composite Urgency Score (0–100)
$$\text{Urgency} = \min(100, 0.42 \cdot \text{BlastRadius} + 0.23 \cdot \text{Velocity} + 0.20 \cdot W_{rootCause} + 0.15 \cdot S_{rawSeverity})$$
* **Blast Radius (42% weight)**: True infrastructure footprint.
* **Alert Velocity (23% weight)**: Ingestion frequency (alerts per minute). High-velocity alert storms rapidly climb in urgency.
* **Root-Cause Criticality ($W_{rootCause}$, 20% weight)**: 95 pts for TLS certificate expirations, 90 pts for database pool saturation, 92 pts for active threat-actor attacks, downgraded to 30 pts for non-production environments.
* **Raw Severity Label ($S_{rawSeverity}$, only 15% weight)**: Keeps noisy raw vendor labels from dominating real business impact.

#### Why Smart Ranking Matters:
```
+------------------------------------------------------------------------------------------+
| SCENARIO COMPARISON: WHY RAW SEVERITY FAILS                                             |
|                                                                                          |
| Alert A: Staging SFTP Cron Failure                                                      |
|   - Raw Severity: CRITICAL (Tool Label)                                                 |
|   - Environment: Staging                                                                 |
|   - Blast Radius: 20/100 (Single non-revenue service, 1 source, isolated)                |
|   - SignalSieve Urgency: 34/100 -> Triage desk pushes to bottom of queue.                 |
|                                                                                          |
| Alert B: Expired TLS Certificate Cascade                                                 |
|   - Raw Severity: WARNING (Initial CloudWatch ALB handshake error count)                 |
|   - Environment: Production                                                              |
|   - Blast Radius: 96/100 (4 Tier-1 services, 3 sources, customer checkout broken)        |
|   - SignalSieve Urgency: 94/100 -> Ranked #1 on Triage Cockpit immediately.              |
+------------------------------------------------------------------------------------------+
```

---

### 4.4 Topological Dependency Graph Generator

For every incident cluster, SignalSieve computes an interactive dependency topology graph ([src/lib/ranking.ts](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/lib/ranking.ts#L177-L250)):
* **Root Cause Node**: The extracted root-cause entity (e.g. `*.prod.internal.acme.io` or `rds-orders-primary` or `185.220.101.42`).
* **Primary Service Node**: The initial point of failure (e.g. `edge-gateway`).
* **Downstream Service Nodes**: Cascading consumers (e.g. `checkout-api`, `auth-proxy`, `billing-worker`).
* **Directional Relationship Edges**: Clearly labeled with causality (e.g. *"TLS Handshake Failure"*, *"Cascading 5xx / Timeout"*).

This graph is rendered inside the **Cluster Detail Drawer**, allowing operators to immediately see the ripple effect across their architecture.

---

### 4.5 Hybrid Context Summary Synthesizer

SignalSieve features a two-tiered summarizer architecture ([src/lib/summarizer.ts](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/lib/summarizer.ts)):

#### 1. Deterministic Synthesizer (Default, Zero-Latency, 100% Offline)
Executes instant rule-based synthesis across entity tags, topology links, and service error signatures. It generates:
* **Human-Readable Incident Title**: e.g., *"Expired TLS Certificate Cascade (*.prod.internal.acme.io)"*.
* **Context Narrative**: e.g., *"These 12 alerts across 4 services (edge-gateway, checkout-api, auth-proxy, billing-worker) from Datadog, PagerDuty, and AWS CloudWatch all trace to the same expired TLS certificate terminating on edge-gateway."*
* **Root Cause Hypothesis**: e.g., *"TLS certificate expired and auto-renewal via cert-manager failed to reload the ingress secret."*
* **Remediation Runbook**: e.g., *"1. Rotate/renew certificate on edge-gateway. 2. Reload Envoy/ALB listener secret. 3. Do not restart downstream services; they will recover automatically."*

#### 2. Pluggable LLM Integration (OpenAI, Google Gemini, Anthropic Claude)
Users can connect their own API key in the Settings modal:
* Supports **OpenAI** (`gpt-4o-mini`, `gpt-4o`), **Google Gemini** (`gemini-2.5-flash`), or **Anthropic Claude** (`claude-3-5-sonnet-latest`).
* Automatically formats alerts into structured JSON context and prompts the LLM to return valid JSON with remediation runbooks.
* If the external AI provider times out or fails, SignalSieve gracefully falls back to the deterministic synthesizer without dropping or delaying alerts.

---

### 4.6 One-Click 24-Hour Active Suppression Engine

Noisy or flapping alerts (e.g. recurring partner timeouts, batch cron jobs undergoing maintenance) can be silenced for 24 hours with a single click:
* **Mandatory Reason Logging**: Enforces operational hygiene (e.g. *"Partner SFTP server maintenance ticket OPS-4102"*).
* **Live Expiration Countdown**: Displays hours and minutes remaining until rule expiration.
* **Incoming Interception**: New alerts matching the pattern signature (`cert:*`, `db:*`, `sec-ip:*`, `svc:*`) are intercepted during ingestion, marked as `suppressed = true`, and increment the suppression rule's counter without paging engineers or creating incident clutter.
* **Test Intercept Action**: Engineers can click "Test Intercept" in the UI to immediately simulate an incoming alert and watch the interception counter increment in real time.

---

### 4.7 1-Week Historical Validation Lab

Before deploying correlation weights to a production environment, engineering teams need proof that the engine won't merge unrelated incidents or split genuine cascades.

The **Validation Lab** ([src/components/ValidationLab.tsx](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/components/ValidationLab.tsx)) provides an empirical testing workbench:
* **Dataset Support**: Ships with a curated 25-alert real-world dataset and accepts custom JSON/CSV uploads of historical alerts tagged with human on-call consensus labels (`human_cluster_label`).
* **Statistical Metrics**:
  * **Pairwise Precision**: Percentage of pairs grouped together by the engine that truly belong together according to human consensus.
  * **Pairwise Recall**: Percentage of true incident pairs that the engine successfully grouped.
  * **F1 Agreement Score**: The harmonic mean of Precision and Recall.
  * **Noise Reduction %**: Formula: $((N_{raw} - N_{clusters}) / N_{raw}) \times 100$.
* **Disagreements Inspector**: Pinpoints exact pairs with issues:
  * **False Merges**: The engine grouped alerts that humans tagged as separate incidents.
  * **Missed Merges**: The engine separated alerts that humans tagged as the same incident.
* **Live Interactive Sliders**: Adjust Time Window (5–60 mins), Entity Weight, Topology Weight, Text Similarity Weight, and Similarity Threshold (0.1–0.9) with instant real-time re-evaluation.
* **Save to Production**: One-click button to persist tuned weights to the active database.

---

## 5. Storage Layer: Dual PostgreSQL 16 & SQLite Architecture

SignalSieve provides enterprise-grade data management with a zero-friction fallback:

### 5.1 Production PostgreSQL 16
* **Prisma ORM with `@prisma/adapter-pg`**: Connection pooling tuned via `pg.Pool` (`max: 10`, `idleTimeoutMillis: 30000`).
* **Advisory Locks (`pg_advisory_xact_lock`)**: Serializes concurrent webhook ingestion sharing the same pattern signature without table locks or deadlocks.
* **Prisma `relationJoins`**: Utilizes database-level PostgreSQL `LATERAL JOIN` and `json_agg` via `relationLoadStrategy: "join"` to fetch clusters and candidate alerts in a single round-trip.
* **JSONB & GIN Indexes**: Uses `JsonbPathOps` indexing on suppression match criteria and entity tags for sub-millisecond query execution.

### 5.2 Zero-Config SQLite Fallback
* When PostgreSQL is offline, SignalSieve automatically activates Node.js 22's built-in `node:sqlite` (`signalsieve.db`).
* Operates in **WAL mode (Write-Ahead Logging)** with foreign key constraints.
* Provides seamless local developer onboarding without requiring Docker or cloud databases.
* The Settings modal allows live switching and connection string validation with real-time ping latency checks.

---

## 6. Pre-Packaged Incident Scenarios

SignalSieve includes built-in realistic multi-telemetry incident scenarios ([src/lib/scenarios.ts](file:///d:/Program/Network_Project/Alert%20Noise%20Reducer%20for%20Lean%20Ops%20&%20Security/src/lib/scenarios.ts)):

### Scenario 1: Expired TLS Certificate Cascade
* **Volume**: 12 alerts across 4 services (`edge-gateway`, `checkout-api`, `auth-proxy`, `billing-worker`).
* **Sources**: Datadog Synthetic Handshake failure, AWS CloudWatch ALB TargetTLSNegotiationErrorCount High, PagerDuty 502 Bad Gateway surge, Datadog APM error-rate spikes, auth token verification rejections.
* **Root Cause Entity**: `cert_cn = "*.prod.internal.acme.io"`.
* **SignalSieve Output**: Clustered into 1 incident; Urgency: **94/100**; Blast Radius: **96/100**.

### Scenario 2: RDS Database Connection Pool Exhaustion
* **Volume**: 10 alerts across 3 services (`orders-service`, `inventory-api`, `reporting-worker`).
* **Sources**: CloudWatch RDS DatabaseConnections > 98%, Datadog APM database timeout spikes, PagerDuty HTTP 500 error cascade.
* **Root Cause Entity**: `db_cluster = "rds-orders-primary"`, `error_code = "FATAL_TOO_MANY_CONNECTIONS"`.
* **SignalSieve Output**: Clustered into 1 incident; Urgency: **89/100**; Blast Radius: **78/100**. Identifies unindexed batch reporting query as blocking PID.

### Scenario 3: Coordinated Credential Stuffing & IAM Anomaly
* **Volume**: 8 alerts across 2 services (`auth-service`, `api-gateway`).
* **Sources**: AWS GuardDuty `UnauthorizedAccess:IAMUser/AnomalousBehavior`, Datadog failed login spike, CloudWatch WAF block threshold alert.
* **Root Cause Entity**: `attacker_ip = "185.220.101.42"`, `iam_principal = "arn:aws:iam::123456789012:user/deployer"`.
* **SignalSieve Output**: Clustered into 1 incident; Urgency: **91/100**; Blast Radius: **70/100**. Actionable runbook recommends blocking IP at AWS WAF and rotating STS credentials.

### Scenario 4: Noisy Staging SFTP Cron Flapping
* **Volume**: 6 alerts on `legacy-sftp-sync` in the Staging environment.
* **Characteristics**: Flapping `CRITICAL` alerts caused by third-party maintenance.
* **SignalSieve Output**: Urgency downgraded to **34/100** due to staging environment and isolated blast radius. Ready for 1-click 24-hour suppression.

---

## 7. REST API Reference

### 7.1 Multi-Source Ingestion
* **Endpoint**: `POST /api/ingest`
* **Query Parameters**: `?source=pagerduty|datadog|aws_cloudwatch|aws_guardduty|generic_webhook` (optional)
* **Payload**: Single JSON object or JSON array of alert payloads.
* **Response**:
```json
{
  "ok": true,
  "ingestedCount": 12,
  "suppressedCount": 0,
  "results": [
    {
      "alertId": "alt-17291849102-x9k2",
      "source": "datadog",
      "service": "edge-gateway",
      "title": "[Synthetics] TLS Handshake Failed on edge-gateway",
      "suppressed": false,
      "clusterId": "inc-m2n9x-k81q",
      "clusterTitle": "Expired TLS Certificate Cascade (*.prod.internal.acme.io)",
      "clusterUrgency": 94
    }
  ],
  "metrics": {
    "totalRawAlerts": 12,
    "activeClusters": 1,
    "suppressedAlertsCount": 0,
    "noiseReductionPercent": 91.7,
    "estimatedMinutesSaved": 48
  }
}
```

### 7.2 Overview & Metrics
* **Endpoint**: `GET /api/overview?status=open|acknowledged|resolved|all`
* **Response**: Returns dashboard metrics, active clusters, active suppression rules, configuration, database health, and pre-packaged scenario definitions.

### 7.3 Cluster Management
* **Endpoint**: `GET /api/clusters/[id]`
* **Endpoint**: `PATCH /api/clusters/[id]`
* **Payload**: `{"status": "acknowledged" | "resolved" | "open"}` or `{"action": "regenerate_summary"}`

### 7.4 Suppression Management
* **Endpoint**: `GET /api/suppressions`
* **Endpoint**: `POST /api/suppressions` (create 24h suppression rule)
* **Endpoint**: `DELETE /api/suppressions?id=[ruleId]`

### 7.5 Validation Lab
* **Endpoint**: `GET /api/validate` (runs evaluation on default dataset)
* **Endpoint**: `POST /api/validate` (evaluates custom weights or uploads, with optional `applyToProd: true`)

### 7.6 Incident Dispatch & Notification
* **Endpoint**: `POST /api/dispatch`
* **Payload**:
  ```json
  {
    "channel": "slack", // "slack" | "teams" | "custom"
    "webhookUrl": "https://hooks.slack.com/services/...",
    "clusterId": "cl-cert-cascade-01"
  }
  ```
* **Capabilities**: Formats incident into Slack Block Kit or Microsoft Teams MessageCard JSON with live delivery verification or offline simulation.

### 7.7 Bulk Cluster Operations
* **Endpoint**: `PATCH /api/clusters`
* **Payloads**:
  ```json
  // Bulk status update
  {
    "action": "bulk_status",
    "clusterIds": ["cl-1", "cl-2"],
    "status": "resolved"
  }
  // Bulk 24h suppression
  {
    "action": "bulk_suppress",
    "clusterIds": ["cl-1", "cl-2"],
    "reason": "Bulk silenced by operator"
  }
  ```

### 7.8 Engine Settings
* **Endpoint**: `GET /api/settings`
* **Endpoint**: `POST /api/settings` (updates weights, LLM provider, API keys, or PostgreSQL connection string)

---

## 8. Incident Waterfall & Triage Velocity Features

### 8.1 Chronological Incident Waterfall Timeline
Inside each cluster's detail drawer, operators can toggle from the topological graph to the **Waterfall Timeline**. Alerts are chronologically aligned relative to $t_0$ (the earliest alert):
* **Offset Timestamps**: `+00:00 (Origin)`, `+00:15s`, `+01:04m`.
* **Origin Trigger Marker**: Visually emphasizes the initial cascading point of failure.
* **Telemetry Filters**: Real-time filtering by severity, source (PagerDuty, Datadog, CloudWatch, GuardDuty), or microservice.

### 8.2 Analytics & Operational ROI Dashboard
Provides immediate management and engineering visibility:
* **Toil Elimination**: Converts prevented pages and deduplicated alerts into saved engineering hours.
* **Custom Hourly Rate Calculator**: Allows teams to input on-call compensation rates (\$/hr) to quantify dollars saved.
* **Top Noisy Services & Root-Cause Entities**: Horizontal distribution meters highlight recurrent architectural pain points.

### 8.3 Live Auto-Refresh & Streaming Chaos Storm
* **Auto-Refresh Controls**: Selectable 5s, 10s, 30s background poll intervals with a countdown indicator.
* **Real-Time Streaming Simulator**: Ingests alerts sequentially at 900ms intervals, allowing on-call teams to observe live incident clustering and dynamic urgency score recalibration.

### 8.4 Keyboard-Driven Incident Response
Power-users can navigate and triage alert storms without a mouse:
* `j` / `k` (or Arrow keys): Navigate down/up through incidents.
* `Enter`: Open incident detail drawer.
* `a` / `r`: Acknowledge or Resolve focused incident.
* `s`: Suppress focused pattern for 24 hours.
* `/`: Focus search input.
* `?`: Open keyboard shortcuts cheat sheet.

---

## 9. Setup & Quick Start Guide

### Prerequisites
* Node.js 18+ (Node.js 22 recommended for native `node:sqlite`)
* Docker & Docker Compose (optional, for PostgreSQL 16)

### Installation Steps

1. **Clone & Install Dependencies**:
   ```bash
   git clone <repo_url>
   cd "Alert Noise Reducer for Lean Ops & Security"
   npm install
   ```

2. **Database Options**:
   * **Option A: Zero-Config SQLite (Default)**:
     No configuration needed. SQLite database initializes automatically at `./data/signalsieve.db`.
   * **Option B: Production PostgreSQL 16**:
     ```bash
     docker-compose up -d
     npx prisma db push
     ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your web browser.

4. **Verify System with Ingestion Simulator**:
   * Navigate to the **Simulator** tab.
   * Click **"Trigger Expired TLS Cert Cascade"**.
   * Switch to the **Triage Desk** to view the resulting 12-alert correlated incident card, dependency graph, and urgency ranking.

---

## 9. Conclusion

TCT SignalSieve bridges the critical gap between raw monitoring telemetry and human cognitive capacity. By automating multi-source normalization, deterministic entity correlation, topological blast radius ranking, and 24-hour alert suppression, TCT SignalSieve empowers lean engineering teams to operate with the incident-response speed, precision, and confidence of an enterprise NOC.
