-- =============================================================================
-- SignalSieve — Production PostgreSQL 16 Schema & High-Throughput Indexing
-- Optimized for high-velocity webhook ingestion, JSONB entity correlation,
-- and sub-millisecond 24-hour pattern suppression lookups.
-- =============================================================================

BEGIN;

-- 1. Clustering & Hybrid LLM Engine Configuration (Singleton row id = 1)
CREATE TABLE IF NOT EXISTS clustering_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_window_minutes INTEGER NOT NULL DEFAULT 15,
  entity_weight DOUBLE PRECISION NOT NULL DEFAULT 0.45,
  service_topology_weight DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  text_similarity_weight DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  similarity_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.42,
  llm_provider TEXT NOT NULL DEFAULT 'deterministic',
  llm_api_key TEXT NOT NULL DEFAULT '',
  llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clustering_config (
  id, time_window_minutes, entity_weight, service_topology_weight,
  text_similarity_weight, similarity_threshold, llm_provider, llm_api_key, llm_model
) VALUES (
  1, 15, 0.45, 0.30, 0.25, 0.42, 'deterministic', '', 'gpt-4o-mini'
) ON CONFLICT (id) DO NOTHING;

-- 2. Correlated Incident Clusters
CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  context_summary TEXT NOT NULL,
  root_cause_hypothesis TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  summary_source TEXT NOT NULL DEFAULT 'deterministic',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  urgency_score DOUBLE PRECISION NOT NULL DEFAULT 50,
  blast_radius_score DOUBLE PRECISION NOT NULL DEFAULT 50,
  ranking_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  dependency_graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  alert_count INTEGER NOT NULL DEFAULT 1,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  highest_severity TEXT NOT NULL CHECK (highest_severity IN ('critical', 'high', 'warning', 'info')),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development', 'global')),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pattern_signature TEXT NOT NULL
);

-- 3. 24-Hour Pattern Suppression Rules & Audit Reason Log
CREATE TABLE IF NOT EXISTS suppression_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pattern_signature TEXT NOT NULL,
  match_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  suppressed_count INTEGER NOT NULL DEFAULT 0
);

-- 4. Raw Ingested Telemetry Alerts
CREATE TABLE IF NOT EXISTS raw_alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  service TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development', 'global')),
  host TEXT NOT NULL,
  entity_tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL,
  suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_rule_id TEXT REFERENCES suppression_rules(id) ON DELETE SET NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- Production Performance Indexes
-- =============================================================================

-- Fast ordered scan for Prioritized Triage Queue (Urgency + Blast Radius)
CREATE INDEX IF NOT EXISTS idx_clusters_triage_priority
  ON clusters (status, urgency_score DESC, blast_radius_score DESC, last_seen DESC);

-- Partial index for active candidate cluster correlation during live webhook bursts
CREATE INDEX IF NOT EXISTS idx_clusters_active_window
  ON clusters (last_seen DESC, pattern_signature)
  WHERE status IN ('open', 'acknowledged');

-- Partial index for O(1) active 24h pattern suppression checks on ingestion
CREATE INDEX IF NOT EXISTS idx_suppression_rules_active
  ON suppression_rules (pattern_signature, expires_at DESC)
  WHERE is_active = TRUE;

-- GIN index on JSONB match_criteria for flexible entity suppression rules
CREATE INDEX IF NOT EXISTS idx_suppression_rules_criteria_gin
  ON suppression_rules USING GIN (match_criteria jsonb_path_ops);

-- GIN index on raw_alerts.entity_tags for fast JSONB containment (@>) queries
CREATE INDEX IF NOT EXISTS idx_raw_alerts_entity_tags_gin
  ON raw_alerts USING GIN (entity_tags jsonb_path_ops);

-- Composite B-Tree index for loading cluster alert timelines in chronological order
CREATE INDEX IF NOT EXISTS idx_raw_alerts_cluster_timeline
  ON raw_alerts (cluster_id, timestamp DESC);

-- Composite B-Tree index for service + fingerprint deduplication within time windows
CREATE INDEX IF NOT EXISTS idx_raw_alerts_service_fingerprint
  ON raw_alerts (service, fingerprint, timestamp DESC);

COMMIT;
