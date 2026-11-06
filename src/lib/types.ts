export type AlertSource =
  | "pagerduty"
  | "datadog"
  | "aws_cloudwatch"
  | "aws_guardduty"
  | "generic_webhook"
  | "csv_import";

export type Severity = "critical" | "high" | "warning" | "info";

export type Environment = "production" | "staging" | "development" | "global";

export type ClusterStatus = "open" | "acknowledged" | "resolved" | "suppressed";

export type SummarySource = "deterministic" | "openai" | "gemini" | "anthropic";

export interface RawAlert {
  id: string;
  source: AlertSource;
  external_id: string;
  timestamp: string;
  ingested_at: string;
  title: string;
  description: string;
  severity: Severity;
  service: string;
  environment: Environment;
  host: string;
  entity_tags: Record<string, string>;
  fingerprint: string;
  cluster_id: string | null;
  suppressed: boolean;
  suppression_rule_id: string | null;
  raw_payload: Record<string, unknown>;
}

export interface RankingBreakdown {
  affectedServicesScore: number; // max 35
  crossSourceScore: number; // max 15
  environmentWeight: number; // max 25
  tierCriticalityScore: number; // max 25
  blastRadiusTotal: number; // 0 - 100
  velocityScore: number; // 0 - 100
  rootCauseWeight: number; // 0 - 100
  rawSeverityScore: number; // 0 - 100
  urgencyTotal: number; // 0 - 100
  alertsPerMinute: number;
  explanation: string[];
}

export interface DependencyNode {
  id: string;
  label: string;
  sublabel?: string;
  type: "root_cause" | "primary_service" | "downstream_service" | "external_actor";
  severity: Severity;
  alertCount: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  relation: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface AlertCluster {
  id: string;
  title: string;
  context_summary: string;
  root_cause_hypothesis: string;
  recommended_action: string;
  summary_source: SummarySource;
  status: ClusterStatus;
  urgency_score: number;
  blast_radius_score: number;
  ranking_breakdown: RankingBreakdown;
  dependency_graph: DependencyGraph;
  alert_count: number;
  sources: AlertSource[];
  services: string[];
  entities: string[];
  highest_severity: Severity;
  environment: Environment;
  first_seen: string;
  last_seen: string;
  pattern_signature: string;
  alerts?: RawAlert[];
}

export interface SuppressionMatchCriteria {
  pattern_signature?: string;
  service?: string;
  fingerprint?: string;
  entity_key?: string;
  entity_value?: string;
  source?: AlertSource;
}

export interface SuppressionRule {
  id: string;
  name: string;
  pattern_signature: string;
  match_criteria: SuppressionMatchCriteria;
  reason: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  suppressed_count: number;
}

export interface ClusteringConfig {
  time_window_minutes: number;
  entity_weight: number;
  service_topology_weight: number;
  text_similarity_weight: number;
  similarity_threshold: number;
  llm_provider: SummarySource;
  llm_api_key: string;
  llm_model: string;
}

export interface ValidationAlertItem {
  id: string;
  timestamp: string;
  source: AlertSource;
  service: string;
  environment: Environment;
  severity: Severity;
  title: string;
  description: string;
  host?: string;
  entity_tags?: Record<string, string>;
  human_cluster_label: string; // What the human team tagged as "related"
}

export interface ValidationDisagreement {
  alertA: { id: string; title: string; service: string; human_label: string };
  alertB: { id: string; title: string; service: string; human_label: string };
  type: "false_merge" | "missed_merge";
  score: number;
  reason: string;
}

export interface ValidationReport {
  totalAlerts: number;
  humanClusterCount: number;
  engineClusterCount: number;
  noiseReductionPercent: number;
  pairwisePrecision: number;
  pairwiseRecall: number;
  f1AgreementScore: number;
  status: "ready_for_prod" | "needs_tuning" | "divergent";
  disagreements: ValidationDisagreement[];
  engineClusters: {
    clusterId: string;
    summary: string;
    alertCount: number;
    dominantHumanLabel: string;
    purity: number;
    alerts: ValidationAlertItem[];
  }[];
}
