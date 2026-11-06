import {
  AlertSource,
  DependencyEdge,
  DependencyGraph,
  DependencyNode,
  Environment,
  RankingBreakdown,
  RawAlert,
  Severity,
} from "./types";

const TIER_1_SERVICES = new Set([
  "edge-gateway",
  "checkout-api",
  "payments-service",
  "auth-service",
  "auth-proxy",
  "orders-service",
  "api-gateway",
]);

const TIER_2_SERVICES = new Set([
  "inventory-api",
  "billing-worker",
  "user-profile",
  "webhook-dispatcher",
]);

export const SERVICE_TOPOLOGY: Record<string, string[]> = {
  "edge-gateway": ["checkout-api", "auth-proxy", "orders-service", "inventory-api"],
  "auth-proxy": ["auth-service", "checkout-api", "billing-worker"],
  "auth-service": ["checkout-api", "orders-service", "user-profile"],
  "checkout-api": ["orders-service", "payments-service", "billing-worker"],
  "orders-service": ["inventory-api", "reporting-worker", "billing-worker"],
  "inventory-api": ["reporting-worker"],
};

export function areServicesTopologicallyLinked(svcA: string, svcB: string): boolean {
  if (svcA === svcB) return true;
  const downA = SERVICE_TOPOLOGY[svcA] || [];
  const downB = SERVICE_TOPOLOGY[svcB] || [];
  if (downA.includes(svcB) || downB.includes(svcA)) return true;
  // Shared parent upstream check
  for (const children of Object.values(SERVICE_TOPOLOGY)) {
    if (children.includes(svcA) && children.includes(svcB)) return true;
  }
  return false;
}

export function getHighestSeverity(severities: Severity[]): Severity {
  if (severities.includes("critical")) return "critical";
  if (severities.includes("high")) return "high";
  if (severities.includes("warning")) return "warning";
  return "info";
}

export function computeClusterRanking(alerts: RawAlert[]): {
  blastRadiusScore: number;
  urgencyScore: number;
  breakdown: RankingBreakdown;
  dependencyGraph: DependencyGraph;
  highestSeverity: Severity;
  dominantEnvironment: Environment;
} {
  const uniqueServices = Array.from(new Set(alerts.map((a) => a.service)));
  const uniqueSources = Array.from(new Set(alerts.map((a) => a.source))) as AlertSource[];
  const severities = alerts.map((a) => a.severity);
  const highestSeverity = getHighestSeverity(severities);

  const hasProd = alerts.some((a) => a.environment === "production" || a.environment === "global");
  const hasStaging = alerts.some((a) => a.environment === "staging");
  const dominantEnvironment: Environment = hasProd
    ? "production"
    : hasStaging
    ? "staging"
    : "development";

  // 1. Affected Services Score (0 - 35)
  const affectedServicesScore = Math.min(35, uniqueServices.length * 9);

  // 2. Cross-Source Corroboration Score (0 - 15)
  const crossSourceScore =
    uniqueSources.length >= 3 ? 15 : uniqueSources.length === 2 ? 11 : 5;

  // 3. Environment Weight (0 - 25)
  const environmentWeight =
    dominantEnvironment === "production"
      ? 25
      : dominantEnvironment === "staging"
      ? 10
      : 4;

  // 4. Service Tier Criticality (0 - 25)
  const hasTier1 = uniqueServices.some((s) => TIER_1_SERVICES.has(s));
  const hasTier2 = uniqueServices.some((s) => TIER_2_SERVICES.has(s));
  const tierCriticalityScore = hasTier1 ? 25 : hasTier2 ? 16 : 6;

  const blastRadiusTotal = Math.min(
    100,
    Math.round(
      affectedServicesScore + crossSourceScore + environmentWeight + tierCriticalityScore
    )
  );

  // Velocity calculation
  const timestamps = alerts
    .map((a) => new Date(a.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  let spanMinutes = 5;
  if (timestamps.length > 1) {
    spanMinutes = Math.max(
      1,
      (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60)
    );
  }
  const alertsPerMinute = Number((alerts.length / spanMinutes).toFixed(2));
  const velocityScore = Math.min(100, Math.round(alerts.length * 6 + alertsPerMinute * 18));

  // Root-Cause Criticality Weight (0 - 100)
  const allTags = alerts.reduce((acc, a) => ({ ...acc, ...a.entity_tags }), {} as Record<string, string>);
  let rootCauseWeight = 45;
  if (allTags.cert_cn || allTags.error_code?.includes("CERT")) {
    rootCauseWeight = 95;
  } else if (allTags.db_cluster || allTags.error_code?.includes("CONNECTIONS")) {
    rootCauseWeight = 90;
  } else if (allTags.attacker_ip || allTags.finding_type || uniqueSources.includes("aws_guardduty")) {
    rootCauseWeight = 92;
  } else if (dominantEnvironment !== "production") {
    rootCauseWeight = 30;
  }

  // Raw Severity Score (only 15% of final urgency so noisy CRITICAL alerts don't drown real cascades)
  const rawSeverityScore =
    highestSeverity === "critical"
      ? 100
      : highestSeverity === "high"
      ? 75
      : highestSeverity === "warning"
      ? 45
      : 20;

  const urgencyTotal = Math.min(
    100,
    Math.round(
      blastRadiusTotal * 0.42 +
        velocityScore * 0.23 +
        rootCauseWeight * 0.20 +
        rawSeverityScore * 0.15
    )
  );

  const explanation: string[] = [];
  if (uniqueServices.length > 1) {
    explanation.push(
      `Cross-service cascade impacting ${uniqueServices.length} distinct services (${uniqueServices.join(", ")}).`
    );
  } else {
    explanation.push(`Isolated to a single service (${uniqueServices[0] || "unknown"}).`);
  }

  if (hasTier1 && dominantEnvironment === "production") {
    explanation.push("Impacts Tier-1 revenue/authentication path in Production (+50 Blast Radius pts).");
  } else if (dominantEnvironment !== "production") {
    explanation.push(
      `Downgraded urgency: alerts originate from ${dominantEnvironment.toUpperCase()} environment despite ${highestSeverity.toUpperCase()} severity label.`
    );
  }

  if (uniqueSources.length > 1) {
    explanation.push(
      `Corroborated across ${uniqueSources.length} telemetry sources (${uniqueSources.join(", ")}).`
    );
  }

  // Build Dependency Graph for visual blast radius inspection
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  let rootId = "root-cause-node";
  let rootLabel = "Shared Anomaly";
  let rootSublabel = "Correlated Signal";
  let rootType: DependencyNode["type"] = "root_cause";

  if (allTags.cert_cn) {
    rootLabel = allTags.cert_cn;
    rootSublabel = "Expired TLS Certificate";
  } else if (allTags.db_cluster) {
    rootLabel = allTags.db_cluster;
    rootSublabel = "DB Connection Pool Exhausted";
  } else if (allTags.attacker_ip || allTags.ip_address) {
    rootLabel = allTags.attacker_ip || allTags.ip_address;
    rootSublabel = allTags.iam_principal ? `Target: ${allTags.iam_principal}` : "Threat Actor IP";
    rootType = "external_actor";
  } else if (allTags.root_entity) {
    rootLabel = allTags.root_entity;
    rootSublabel = allTags.error_code || "Shared Dependency";
  } else {
    rootLabel = allTags.error_code || uniqueServices[0] || "Service Fault";
    rootSublabel = "Error Signature";
  }

  nodes.push({
    id: rootId,
    label: rootLabel,
    sublabel: rootSublabel,
    type: rootType,
    severity: highestSeverity,
    alertCount: alerts.length,
  });

  uniqueServices.forEach((svc, idx) => {
    const svcAlerts = alerts.filter((a) => a.service === svc);
    const svcSev = getHighestSeverity(svcAlerts.map((a) => a.severity));
    const nodeId = `svc-${svc}`;
    const isPrimary = idx === 0 || TIER_1_SERVICES.has(svc);

    nodes.push({
      id: nodeId,
      label: svc,
      sublabel: `${svcAlerts.length} alert${svcAlerts.length > 1 ? "s" : ""}`,
      type: isPrimary ? "primary_service" : "downstream_service",
      severity: svcSev,
      alertCount: svcAlerts.length,
    });

    if (idx === 0) {
      edges.push({
        from: rootId,
        to: nodeId,
        relation: allTags.cert_cn
          ? "TLS Handshake Failure"
          : allTags.db_cluster
          ? "Pool Saturated"
          : allTags.attacker_ip
          ? "Brute Force / Auth Probe"
          : "Triggers",
      });
    } else {
      const parentSvc = uniqueServices[0];
      edges.push({
        from: `svc-${parentSvc}`,
        to: nodeId,
        relation: "Cascading 5xx / Timeout",
      });
    }
  });

  return {
    blastRadiusScore: blastRadiusTotal,
    urgencyScore: urgencyTotal,
    breakdown: {
      affectedServicesScore,
      crossSourceScore,
      environmentWeight,
      tierCriticalityScore,
      blastRadiusTotal,
      velocityScore,
      rootCauseWeight,
      rawSeverityScore,
      urgencyTotal,
      alertsPerMinute,
      explanation,
    },
    dependencyGraph: { nodes, edges },
    highestSeverity,
    dominantEnvironment,
  };
}
