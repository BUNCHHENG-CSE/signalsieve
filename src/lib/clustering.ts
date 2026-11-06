import { extractEntitiesFromText, normalizeTextForFingerprint } from "./normalizers";
import { areServicesTopologicallyLinked } from "./ranking";
import { generateDeterministicSummary } from "./summarizer";
import {
  ClusteringConfig,
  RawAlert,
  ValidationAlertItem,
  ValidationDisagreement,
  ValidationReport,
} from "./types";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "on",
  "in",
  "to",
  "of",
  "alert",
  "monitor",
  "alarm",
  "high",
  "critical",
  "warning",
  "prod",
  "production",
  "service",
  "error",
  "failed",
  "failure",
]);

export function tokenizeText(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const CORRELATION_ENTITY_KEYS = [
  "cert_cn",
  "db_cluster",
  "attacker_ip",
  "ip_address",
  "root_entity",
  "trace_id",
  "iam_principal",
  "error_code",
  "partner_host",
];

export function computePairCorrelation(
  alertA: {
    timestamp: string;
    service: string;
    environment: string;
    title: string;
    description: string;
    entity_tags: Record<string, string>;
    fingerprint?: string;
  },
  alertB: {
    timestamp: string;
    service: string;
    environment: string;
    title: string;
    description: string;
    entity_tags: Record<string, string>;
    fingerprint?: string;
  },
  config: Pick<
    ClusteringConfig,
    | "time_window_minutes"
    | "entity_weight"
    | "service_topology_weight"
    | "text_similarity_weight"
  >
): { score: number; reason: string; withinWindow: boolean } {
  const tA = new Date(alertA.timestamp).getTime();
  const tB = new Date(alertB.timestamp).getTime();
  const diffMinutes = Math.abs(tA - tB) / (1000 * 60);

  if (!isNaN(diffMinutes) && diffMinutes > config.time_window_minutes) {
    return {
      score: 0,
      reason: `Outside ${config.time_window_minutes}m time window (${Math.round(diffMinutes)}m apart)`,
      withinWindow: false,
    };
  }

  // Different environments rarely belong to the same incident unless one is global
  if (
    alertA.environment !== alertB.environment &&
    alertA.environment !== "global" &&
    alertB.environment !== "global"
  ) {
    return {
      score: 0.05,
      reason: `Environment mismatch (${alertA.environment} vs ${alertB.environment})`,
      withinWindow: true,
    };
  }

  // 1. Entity Correlation Score (0 - 1)
  let entityScore = 0;
  const matchedEntities: string[] = [];
  for (const key of CORRELATION_ENTITY_KEYS) {
    const valA = alertA.entity_tags?.[key];
    const valB = alertB.entity_tags?.[key];
    if (valA && valB && valA.toLowerCase() === valB.toLowerCase()) {
      // High-confidence root cause keys get 1.0, generic error_code gets 0.75
      const boost = key === "error_code" ? 0.78 : 1.0;
      if (boost > entityScore) entityScore = boost;
      matchedEntities.push(`${key}=${valA}`);
    }
  }

  // 2. Service & Topology Correlation Score (0 - 1)
  let topologyScore = 0;
  if (alertA.service === alertB.service) {
    topologyScore = 1.0;
  } else if (areServicesTopologicallyLinked(alertA.service, alertB.service)) {
    topologyScore = 0.75;
  } else if (
    alertA.entity_tags?.upstream_service === alertB.service ||
    alertB.entity_tags?.upstream_service === alertA.service
  ) {
    topologyScore = 0.85;
  }

  // 3. Text / Token Similarity Score (0 - 1)
  const tokensA = tokenizeText(
    `${alertA.title} ${alertA.description} ${Object.values(alertA.entity_tags || {}).join(" ")}`
  );
  const tokensB = tokenizeText(
    `${alertB.title} ${alertB.description} ${Object.values(alertB.entity_tags || {}).join(" ")}`
  );
  let textScore = jaccardSimilarity(tokensA, tokensB);
  if (
    alertA.fingerprint &&
    alertB.fingerprint &&
    alertA.fingerprint === alertB.fingerprint
  ) {
    textScore = Math.max(textScore, 0.95);
  }

  // Normalize weights so they sum to 1.0
  const totalWeight =
    config.entity_weight +
    config.service_topology_weight +
    config.text_similarity_weight || 1;
  const wEntity = config.entity_weight / totalWeight;
  const wTopo = config.service_topology_weight / totalWeight;
  const wText = config.text_similarity_weight / totalWeight;

  let compositeScore =
    entityScore * wEntity + topologyScore * wTopo + textScore * wText;

  // Strong root-cause entity match (e.g., exact same expired cert CN, DB cluster, or attacker IP)
  // within the time window should strongly boost correlation across dependent services
  if (
    entityScore >= 0.95 &&
    (topologyScore >= 0.7 || matchedEntities.some((e) => !e.startsWith("error_code=")))
  ) {
    compositeScore = Math.max(compositeScore, 0.72 * wEntity + 0.45);
  }

  const reasons: string[] = [];
  if (matchedEntities.length > 0) {
    reasons.push(`Shared entity (${matchedEntities.join(", ")})`);
  }
  if (topologyScore === 1) {
    reasons.push(`Same service (${alertA.service})`);
  } else if (topologyScore > 0) {
    reasons.push(`Linked topology (${alertA.service} <-> ${alertB.service})`);
  }
  if (textScore > 0.25) {
    reasons.push(`Token similarity ${(textScore * 100).toFixed(0)}%`);
  }

  return {
    score: Number(Math.min(1, compositeScore).toFixed(3)),
    reason: reasons.join(" + ") || "Low signal overlap",
    withinWindow: true,
  };
}

export function evaluateValidationDataset(
  items: ValidationAlertItem[],
  config: ClusteringConfig
): ValidationReport {
  // Enrich items with extracted entity tags and fingerprints
  const enriched = items
    .map((item) => {
      const entity_tags = extractEntitiesFromText(
        item.title,
        item.description,
        item.entity_tags || {}
      );
      const fingerprint = normalizeTextForFingerprint(
        `${item.service}:${item.title}:${entity_tags.error_code || ""}`
      );
      return {
        ...item,
        entity_tags,
        fingerprint,
      };
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Greedy chronological clustering (mirrors live streaming ingestion)
  const clusters: {
    id: string;
    alerts: typeof enriched;
  }[] = [];

  for (const alert of enriched) {
    let bestClusterIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      // Compare against most recent alert and highest-scoring member in candidate cluster
      const lastAlert = c.alerts[c.alerts.length - 1];
      const timeCheck = computePairCorrelation(alert, lastAlert, config);
      if (!timeCheck.withinWindow) continue;

      let maxMemberScore = 0;
      for (const member of c.alerts) {
        const res = computePairCorrelation(alert, member, config);
        if (res.score > maxMemberScore) {
          maxMemberScore = res.score;
        }
      }

      if (maxMemberScore >= config.similarity_threshold && maxMemberScore > bestScore) {
        bestScore = maxMemberScore;
        bestClusterIdx = i;
      }
    }

    if (bestClusterIdx >= 0) {
      clusters[bestClusterIdx].alerts.push(alert);
    } else {
      clusters.push({
        id: `val-cluster-${clusters.length + 1}`,
        alerts: [alert],
      });
    }
  }

  // Map alert ID -> engine cluster ID
  const alertToEngineCluster = new Map<string, string>();
  for (const c of clusters) {
    for (const a of c.alerts) {
      alertToEngineCluster.set(a.id, c.id);
    }
  }

  // Pairwise evaluation against human_cluster_label
  let truePositives = 0;
  let falsePositives = 0; // False merges (engine grouped, human separated)
  let falseNegatives = 0; // Missed merges (human grouped, engine separated)
  const disagreements: ValidationDisagreement[] = [];

  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a = enriched[i];
      const b = enriched[j];
      const sameHuman = a.human_cluster_label === b.human_cluster_label;
      const sameEngine = alertToEngineCluster.get(a.id) === alertToEngineCluster.get(b.id);

      if (sameHuman && sameEngine) {
        truePositives++;
      } else if (!sameHuman && sameEngine) {
        falsePositives++;
        if (disagreements.length < 12) {
          const pairRes = computePairCorrelation(a, b, config);
          disagreements.push({
            alertA: {
              id: a.id,
              title: a.title,
              service: a.service,
              human_label: a.human_cluster_label,
            },
            alertB: {
              id: b.id,
              title: b.title,
              service: b.service,
              human_label: b.human_cluster_label,
            },
            type: "false_merge",
            score: pairRes.score,
            reason: `Engine merged (${pairRes.reason}), but team labeled "${a.human_cluster_label}" vs "${b.human_cluster_label}"`,
          });
        }
      } else if (sameHuman && !sameEngine) {
        falseNegatives++;
        if (disagreements.length < 12) {
          const pairRes = computePairCorrelation(a, b, config);
          disagreements.push({
            alertA: {
              id: a.id,
              title: a.title,
              service: a.service,
              human_label: a.human_cluster_label,
            },
            alertB: {
              id: b.id,
              title: b.title,
              service: b.service,
              human_label: b.human_cluster_label,
            },
            type: "missed_merge",
            score: pairRes.score,
            reason: `Team grouped as "${a.human_cluster_label}", but engine score ${pairRes.score} < threshold ${config.similarity_threshold} (${pairRes.reason})`,
          });
        }
      }
    }
  }

  const pairwisePrecision =
    truePositives + falsePositives > 0
      ? Number(((truePositives / (truePositives + falsePositives)) * 100).toFixed(1))
      : 100;
  const pairwiseRecall =
    truePositives + falseNegatives > 0
      ? Number(((truePositives / (truePositives + falseNegatives)) * 100).toFixed(1))
      : 100;
  const f1AgreementScore =
    pairwisePrecision + pairwiseRecall > 0
      ? Number(
          (
            (2 * pairwisePrecision * pairwiseRecall) /
            (pairwisePrecision + pairwiseRecall)
          ).toFixed(1)
        )
      : 0;

  const humanLabels = new Set(enriched.map((a) => a.human_cluster_label));
  const noiseReductionPercent =
    enriched.length > 0
      ? Number((((enriched.length - clusters.length) / enriched.length) * 100).toFixed(1))
      : 0;

  const engineClusters = clusters.map((c) => {
    const labelCounts: Record<string, number> = {};
    for (const a of c.alerts) {
      labelCounts[a.human_cluster_label] = (labelCounts[a.human_cluster_label] || 0) + 1;
    }
    const sortedLabels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]);
    const dominantHumanLabel = sortedLabels[0]?.[0] || "Unknown";
    const dominantCount = sortedLabels[0]?.[1] || 0;
    const purity = Number(((dominantCount / c.alerts.length) * 100).toFixed(0));

    const pseudoRawAlerts: RawAlert[] = c.alerts.map((a) => ({
      id: a.id,
      source: a.source,
      external_id: a.id,
      timestamp: a.timestamp,
      ingested_at: a.timestamp,
      title: a.title,
      description: a.description,
      severity: a.severity,
      service: a.service,
      environment: a.environment,
      host: a.host || `${a.service}-01`,
      entity_tags: a.entity_tags,
      fingerprint: a.fingerprint,
      cluster_id: c.id,
      suppressed: false,
      suppression_rule_id: null,
      raw_payload: {},
    }));

    const synth = generateDeterministicSummary(pseudoRawAlerts);

    return {
      clusterId: c.id,
      summary: synth.context_summary,
      alertCount: c.alerts.length,
      dominantHumanLabel,
      purity,
      alerts: c.alerts,
    };
  });

  const status =
    f1AgreementScore >= 85
      ? "ready_for_prod"
      : f1AgreementScore >= 65
      ? "needs_tuning"
      : "divergent";

  return {
    totalAlerts: enriched.length,
    humanClusterCount: humanLabels.size,
    engineClusterCount: clusters.length,
    noiseReductionPercent,
    pairwisePrecision,
    pairwiseRecall,
    f1AgreementScore,
    status,
    disagreements,
    engineClusters,
  };
}
