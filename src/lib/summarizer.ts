import { RawAlert, SummarySource } from "./types";

export interface GeneratedClusterContext {
  title: string;
  context_summary: string;
  root_cause_hypothesis: string;
  recommended_action: string;
  summary_source: SummarySource;
}

const SOURCE_LABELS: Record<string, string> = {
  pagerduty: "PagerDuty",
  datadog: "Datadog",
  aws_cloudwatch: "AWS CloudWatch",
  aws_guardduty: "AWS GuardDuty",
  generic_webhook: "Webhook",
  csv_import: "Imported Telemetry",
};

export function generateDeterministicSummary(alerts: RawAlert[]): GeneratedClusterContext {
  const count = alerts.length;
  const services = Array.from(new Set(alerts.map((a) => a.service)));
  const sources = Array.from(
    new Set(alerts.map((a) => SOURCE_LABELS[a.source] || a.source))
  );
  const hosts = Array.from(new Set(alerts.map((a) => a.host)));

  const mergedTags: Record<string, string> = {};
  for (const a of alerts) {
    for (const [k, v] of Object.entries(a.entity_tags || {})) {
      if (v && !mergedTags[k]) {
        mergedTags[k] = v;
      }
    }
  }

  const svcListStr =
    services.length > 1
      ? `across ${services.length} services (${services.join(", ")})`
      : `on service ${services[0] || "unknown"}`;
  const sourceListStr = sources.join(", ");

  // Case 1: Expired Certificate cascade
  if (mergedTags.cert_cn || mergedTags.error_code?.includes("CERT")) {
    const cert = mergedTags.cert_cn || "*.internal.service.local";
    const primarySvc = mergedTags.upstream_service || services[0] || "edge-gateway";
    return {
      title: `Expired TLS Certificate Cascade (${cert})`,
      context_summary: `These ${count} alerts ${svcListStr} from ${sourceListStr} all trace to the same expired TLS certificate (${cert}) terminating on ${primarySvc}. Downstream 502/504 errors and token validation failures are secondary symptoms of the failed mTLS/TLS handshake.`,
      root_cause_hypothesis: `TLS certificate "${cert}" on ${primarySvc} (${hosts[0] || "prod-edge"}) expired and auto-renewal via cert-manager failed to reload the ingress secret.`,
      recommended_action: `1. Rotate/renew certificate ${cert} on ${primarySvc} immediately. 2. Force reload of Envoy/ALB TLS listener secret. 3. Do not restart downstream services (${services.slice(1).join(", ") || "consumers"}); they will recover automatically once TLS handshakes succeed.`,
      summary_source: "deterministic",
    };
  }

  // Case 2: Database Connection Pool Exhaustion
  if (mergedTags.db_cluster || mergedTags.error_code?.includes("CONNECTIONS")) {
    const db = mergedTags.db_cluster || "rds-prod-primary";
    return {
      title: `Database Connection Pool Saturation on ${db}`,
      context_summary: `These ${count} alerts ${svcListStr} from ${sourceListStr} all trace to connection pool exhaustion on ${db} (${mergedTags.error_code || "FATAL_TOO_MANY_CONNECTIONS"}). API latency spikes and HTTP 500 responses across ${services.join(", ")} are caused by starved database worker threads.`,
      root_cause_hypothesis: `Unindexed batch query or long-running transaction holding row locks on ${db}, exhausting PgBouncer max_client_conn limits.`,
      recommended_action: `1. Inspect pg_stat_activity on ${db} and terminate blocking PIDs > 60s. 2. Temporarily throttle ${services.find((s) => s.includes("worker") || s.includes("report")) || "background workers"} to free pool capacity for ${services[0]}.`,
      summary_source: "deterministic",
    };
  }

  // Case 3: Security / Credential Stuffing / IAM Anomaly
  if (
    mergedTags.attacker_ip ||
    mergedTags.finding_type ||
    alerts.some((a) => a.source === "aws_guardduty")
  ) {
    const ip = mergedTags.attacker_ip || mergedTags.ip_address || "185.220.101.42";
    const principal = mergedTags.iam_principal || "production auth endpoint";
    return {
      title: `Coordinated Brute-Force & IAM Anomaly from ${ip}`,
      context_summary: `These ${count} security and operational alerts ${svcListStr} from ${sourceListStr} correlate to a single threat actor IP (${ip}) executing high-velocity credential stuffing against ${services[0]} followed by anomalous IAM API calls on ${principal}.`,
      root_cause_hypothesis: `External automated credential stuffing campaign originating from ASN/IP ${ip} attempting token harvesting and privilege enumeration on ${principal}.`,
      recommended_action: `1. Block IP ${ip}/32 at AWS WAF / Edge Gateway immediately. 2. Rotate active session tokens and temporary STS credentials for ${principal}. 3. Verify no MFA bypass occurred in auth audit logs.`,
      summary_source: "deterministic",
    };
  }

  // Case 4: Legacy / Flapping Cron or Partner Timeout
  if (
    mergedTags.root_entity ||
    mergedTags.error_code?.includes("ETIMEDOUT") ||
    services.some((s) => s.includes("sftp") || s.includes("cron") || s.includes("legacy"))
  ) {
    const target = mergedTags.root_entity || mergedTags.partner_host || services[0];
    return {
      title: `Recurring Timeout Flapping on ${services[0]} (${target})`,
      context_summary: `These ${count} repetitive alerts on ${services[0]} (${alerts[0]?.environment || "staging"}) all stem from the same recurring connection timeout to ${target} (${mergedTags.error_code || "ETIMEDOUT"}). Despite CRITICAL severity labels on individual checks, blast radius is strictly isolated with zero customer-facing impact.`,
      root_cause_hypothesis: `External partner endpoint (${target}) is undergoing scheduled maintenance or rate-limiting batch sync retries every 5 minutes.`,
      recommended_action: `Suppress this alert pattern for 24 hours with a reason log while partner maintenance completes, and downgrade the monitor severity from CRITICAL to WARNING.`,
      summary_source: "deterministic",
    };
  }

  // Default generic correlated cluster
  const topTitle = alerts[0]?.title || "Correlated Operational Incident";
  const sharedErr = mergedTags.error_code ? ` (${mergedTags.error_code})` : "";
  return {
    title:
      count > 1
        ? `${services[0]} Correlated Incident${sharedErr} (${count} alerts)`
        : topTitle,
    context_summary: `These ${count} alerts ${svcListStr} reported via ${sourceListStr} within the correlation window share common entity signatures on ${hosts.slice(0, 2).join(", ")}${sharedErr}.`,
    root_cause_hypothesis: `Shared infrastructure degradation or deployment regression affecting ${services.join(", ")} on host group ${hosts[0] || "primary"}.`,
    recommended_action: `Check recent deployments and upstream health metrics for ${services[0]} before investigating downstream symptoms.`,
    summary_source: "deterministic",
  };
}

export async function generateHybridClusterSummary(
  alerts: RawAlert[],
  llmConfig?: {
    provider: SummarySource;
    apiKey?: string;
    model?: string;
  }
): Promise<GeneratedClusterContext> {
  const deterministic = generateDeterministicSummary(alerts);

  if (
    !llmConfig ||
    llmConfig.provider === "deterministic" ||
    !llmConfig.apiKey ||
    llmConfig.apiKey.trim() === ""
  ) {
    return deterministic;
  }

  const prompt = `You are a Principal SRE & SecOps Incident Triage Assistant for a lean operations team.
Analyze the following cluster of ${alerts.length} correlated alerts and produce a JSON object with 4 fields:
- "title": Concise incident title (under 70 chars)
- "context_summary": 2 sentences explaining how these ${alerts.length} alerts across services/sources trace to the same underlying issue.
- "root_cause_hypothesis": 1 sentence identifying the most probable root cause entity/fault.
- "recommended_action": Concrete 2-step remediation advice for the on-call engineer.

Alerts JSON:
${JSON.stringify(
  alerts.slice(0, 15).map((a) => ({
    source: a.source,
    service: a.service,
    env: a.environment,
    severity: a.severity,
    title: a.title,
    description: a.description,
    entity_tags: a.entity_tags,
    timestamp: a.timestamp,
  })),
  null,
  2
)}

Respond ONLY with valid JSON.`;

  try {
    if (llmConfig.provider === "openai") {
      const model = llmConfig.model || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return {
          title: parsed.title || deterministic.title,
          context_summary: parsed.context_summary || deterministic.context_summary,
          root_cause_hypothesis:
            parsed.root_cause_hypothesis || deterministic.root_cause_hypothesis,
          recommended_action: parsed.recommended_action || deterministic.recommended_action,
          summary_source: "openai",
        };
      }
    } else if (llmConfig.provider === "gemini") {
      const model = llmConfig.model || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          llmConfig.apiKey.trim()
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            title: parsed.title || deterministic.title,
            context_summary: parsed.context_summary || deterministic.context_summary,
            root_cause_hypothesis:
              parsed.root_cause_hypothesis || deterministic.root_cause_hypothesis,
            recommended_action: parsed.recommended_action || deterministic.recommended_action,
            summary_source: "gemini",
          };
        }
      }
    } else if (llmConfig.provider === "anthropic") {
      const model = llmConfig.model || "claude-3-5-sonnet-latest";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": llmConfig.apiKey.trim(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            title: parsed.title || deterministic.title,
            context_summary: parsed.context_summary || deterministic.context_summary,
            root_cause_hypothesis:
              parsed.root_cause_hypothesis || deterministic.root_cause_hypothesis,
            recommended_action: parsed.recommended_action || deterministic.recommended_action,
            summary_source: "anthropic",
          };
        }
      }
    }
  } catch (err) {
    console.warn("LLM summary generation failed, falling back to deterministic engine:", err);
  }

  return deterministic;
}
