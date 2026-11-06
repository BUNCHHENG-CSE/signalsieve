import { AlertSource, Environment, RawAlert, Severity } from "./types";

const CERT_REGEX = /(?:cert(?:ificate)?|cn|sni|domain)[=:\s"']+([a-zA-Z0-9*.-]+\.[a-zA-Z]{2,})/i;
const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/;
const ERROR_CODE_REGEX = /\b(CERT_HAS_EXPIRED|X509_V_ERR_[A-Z_]+|ETIMEDOUT[A-Z0-9_]*|ECONNREFUSED|FATAL_TOO_MANY_CONNECTIONS|502_BAD_GATEWAY|504_GATEWAY_TIMEOUT|AUTH_BRUTE_FORCE|IAM_ANOMALY_[A-Z0-9_]+|OOM_KILLED)\b/i;
const DB_REGEX = /\b(rds-[a-z0-9-]+|pgbouncer-[a-z0-9-]+|postgres-[a-z0-9-]+|redis-[a-z0-9-]+)\b/i;

export function normalizeTextForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "<uuid>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\b\d+(?:\.\d+)?(?:ms|s|%|mb|gb)\b/g, "<metric>")
    .replace(/\b\d+\b/g, "<num>")
    .replace(/[^a-z0-9<>_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

export function extractEntitiesFromText(
  title: string,
  description: string,
  existingTags: Record<string, string> = {}
): Record<string, string> {
  const combined = `${title} ${description}`;
  const tags: Record<string, string> = { ...existingTags };

  if (!tags.cert_cn) {
    const certMatch = combined.match(CERT_REGEX);
    if (certMatch?.[1]) {
      tags.cert_cn = certMatch[1].toLowerCase();
    }
  }

  if (!tags.ip_address) {
    const ipMatch = combined.match(IP_REGEX);
    if (ipMatch?.[0]) {
      tags.ip_address = ipMatch[0];
    }
  }

  if (!tags.error_code) {
    const errMatch = combined.match(ERROR_CODE_REGEX);
    if (errMatch?.[1]) {
      tags.error_code = errMatch[1].toUpperCase();
    }
  }

  if (!tags.db_cluster) {
    const dbMatch = combined.match(DB_REGEX);
    if (dbMatch?.[1]) {
      tags.db_cluster = dbMatch[1].toLowerCase();
    }
  }

  return tags;
}

export function buildPatternSignature(
  service: string,
  entityTags: Record<string, string>,
  fingerprint: string
): string {
  if (entityTags.cert_cn) {
    return `cert:${entityTags.cert_cn}`;
  }
  if (entityTags.db_cluster) {
    return `db:${entityTags.db_cluster}:${entityTags.error_code || "pool"}`;
  }
  if (entityTags.attacker_ip || entityTags.ip_address) {
    return `sec-ip:${entityTags.attacker_ip || entityTags.ip_address}`;
  }
  if (entityTags.root_entity) {
    return `entity:${entityTags.root_entity}`;
  }
  if (entityTags.error_code) {
    return `svc:${service}:err:${entityTags.error_code}`;
  }
  return `svc:${service}:fp:${fingerprint.slice(0, 48)}`;
}

function mapSeverity(raw?: string): Severity {
  if (!raw) return "warning";
  const s = raw.toLowerCase();
  if (s.includes("crit") || s === "p1" || s === "sev1" || s === "fatal" || s === "high_urgency") {
    return "critical";
  }
  if (s.includes("high") || s.includes("err") || s === "p2" || s === "sev2" || Number(s) >= 7) {
    return "high";
  }
  if (s.includes("info") || s.includes("low") || s === "p4" || s === "p5") {
    return "info";
  }
  return "warning";
}

function mapEnvironment(raw?: string): Environment {
  if (!raw) return "production";
  const e = raw.toLowerCase();
  if (e.includes("stag") || e.includes("uat") || e.includes("preprod")) return "staging";
  if (e.includes("dev") || e.includes("test") || e.includes("sandbox") || e.includes("batch"))
    return "development";
  if (e.includes("glob")) return "global";
  return "production";
}

export function normalizeIncomingPayload(
  payload: Record<string, any>,
  explicitSource?: AlertSource
): Omit<RawAlert, "id" | "ingested_at" | "cluster_id" | "suppressed" | "suppression_rule_id"> {
  // Detect source if not explicitly provided
  let source: AlertSource = explicitSource || (payload.source as AlertSource) || "generic_webhook";
  if (!explicitSource && !payload.source) {
    if (payload.event?.event_type?.startsWith("incident.") || payload.incident?. incident_number) {
      source = "pagerduty";
    } else if (payload.alert_metric || payload.monitor_id || Array.isArray(payload.tags)) {
      source = "datadog";
    } else if (payload.AlarmName || payload.detail?.findingType) {
      source = payload.detail?.findingType ? "aws_guardduty" : "aws_cloudwatch";
    }
  }

  let title = "";
  let description = "";
  let severity: Severity = "warning";
  let service = "unknown-service";
  let environment: Environment = "production";
  let host = "unknown-host";
  let external_id = "";
  let timestamp = payload.timestamp || new Date().toISOString();
  let entity_tags: Record<string, string> = {};

  if (source === "pagerduty" && (payload.event || payload.incident)) {
    const data = payload.event?.data || payload.incident || payload;
    title = data.title || payload.title || "PagerDuty Incident Triggered";
    description =
      data.body?.details ||
      data.custom_details?.message ||
      payload.description ||
      "Alert triggered via PagerDuty webhook";
    severity = mapSeverity(data.urgency === "high" ? (data.priority?.summary || "high") : data.severity || payload.severity);
    service = data.service?.summary || data.service?.name || payload.service || "core-api";
    environment = mapEnvironment(data.custom_details?.env || payload.environment);
    host = data.custom_details?.host || payload.host || `${service}-prod-01`;
    external_id = data.id || payload.external_id || `pd-${Date.now()}`;
    timestamp = payload.event?.occurred_at || data.created_at || timestamp;
    entity_tags = {
      ...(data.custom_details || {}),
      ...(payload.entity_tags || {}),
    };
  } else if (source === "datadog" && (payload.alert_metric || payload.monitor_id || payload.tags)) {
    title = payload.title || payload.alert_title || "Datadog Monitor Alert";
    description = payload.body || payload.event_msg || payload.description || "";
    severity = mapSeverity(payload.priority || payload.alert_transition || payload.severity);
    const tagList: string[] = Array.isArray(payload.tags)
      ? payload.tags
      : typeof payload.tags === "string"
      ? payload.tags.split(",")
      : [];
    const parsedTags: Record<string, string> = {};
    for (const t of tagList) {
      const [k, v] = t.trim().split(":");
      if (k && v) parsedTags[k] = v;
    }
    service = parsedTags.service || payload.service || "web-gateway";
    environment = mapEnvironment(parsedTags.env || payload.environment);
    host = payload.host || parsedTags.host || `${service}-node-1`;
    external_id = String(payload.id || payload.event_id || payload.external_id || `dd-${Date.now()}`);
    entity_tags = {
      ...parsedTags,
      ...(payload.entity_tags || {}),
    };
  } else if (source === "aws_cloudwatch" && payload.AlarmName) {
    title = `CloudWatch Alarm: ${payload.AlarmName}`;
    description = payload.NewStateReason || payload.AlarmDescription || payload.description || "";
    severity = mapSeverity(payload.NewStateValue === "ALARM" ? (payload.severity || "high") : "warning");
    const dims: Record<string, string> = {};
    if (Array.isArray(payload.Trigger?.Dimensions)) {
      for (const d of payload.Trigger.Dimensions) {
        if (d.name && d.value) dims[d.name] = d.value;
      }
    }
    service = dims.ServiceName || dims.TargetGroup || payload.service || "aws-infra";
    environment = mapEnvironment(dims.Environment || payload.environment);
    host = dims.InstanceId || dims.DBInstanceIdentifier || payload.host || "aws-us-east-1";
    external_id = payload.AWSAccountId
      ? `cw-${payload.AWSAccountId}-${Date.now()}`
      : payload.external_id || `cw-${Date.now()}`;
    timestamp = payload.StateChangeTime || timestamp;
    entity_tags = {
      region: payload.Region || "us-east-1",
      ...dims,
      ...(payload.entity_tags || {}),
    };
  } else if (source === "aws_guardduty" && payload.detail) {
    const d = payload.detail;
    title = d.title || `GuardDuty: ${d.type || "Security Finding"}`;
    description = d.description || payload.description || "";
    severity = mapSeverity(String(d.severity || payload.severity || "high"));
    service = d.service?.resourceRole || payload.service || "auth-service";
    environment = mapEnvironment(payload.environment || "production");
    host = d.resource?.instanceDetails?.instanceId || payload.host || "iam-global";
    external_id = d.id || payload.external_id || `gd-${Date.now()}`;
    timestamp = d.updatedAt || timestamp;
    entity_tags = {
      finding_type: d.type || "UnauthorizedAccess",
      ...(payload.entity_tags || {}),
    };
  } else {
    // Standard / normalized format
    title = String(payload.title || "Incoming Operational Alert");
    description = String(payload.description || payload.message || "");
    severity = mapSeverity(payload.severity);
    service = String(payload.service || "core-service");
    environment = mapEnvironment(payload.environment);
    host = String(payload.host || `${service}-01`);
    external_id = String(payload.external_id || payload.id || `alt-${Date.now()}`);
    entity_tags = { ...(payload.entity_tags || {}) };
  }

  // Enrich entity tags from text
  const enrichedTags = extractEntitiesFromText(title, description, entity_tags);
  // Ensure all values are strings
  const cleanTags: Record<string, string> = {};
  for (const [k, v] of Object.entries(enrichedTags)) {
    if (v !== undefined && v !== null && typeof v !== "object") {
      cleanTags[k] = String(v);
    }
  }

  const fingerprint = normalizeTextForFingerprint(`${service}:${title}:${cleanTags.error_code || ""}`);

  return {
    source,
    external_id,
    timestamp,
    title,
    description,
    severity,
    service,
    environment,
    host,
    entity_tags: cleanTags,
    fingerprint,
    raw_payload: payload,
  };
}
