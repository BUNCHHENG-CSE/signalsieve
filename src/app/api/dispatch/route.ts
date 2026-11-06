import { NextRequest, NextResponse } from "next/server";
import { getClusterById } from "@/lib/db";
import { AlertCluster } from "@/lib/types";

interface WebhookDispatchPayload {
  channel: "slack" | "teams" | "pagerduty" | "custom";
  webhookUrl?: string;
  clusterId: string;
}

function formatSlackPayload(cluster: AlertCluster) {
  const urgencyEmoji =
    cluster.urgency_score >= 80 ? "🚨" : cluster.urgency_score >= 60 ? "⚠️" : "ℹ️";
  return {
    text: `${urgencyEmoji} *[TCT SignalSieve Incident]* ${cluster.title} (Urgency: ${cluster.urgency_score}/100)`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${urgencyEmoji} TCT SignalSieve Incident #${cluster.id.slice(0, 8)}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Status:*\n\`${cluster.status.toUpperCase()}\``,
          },
          {
            type: "mrkdwn",
            text: `*Urgency / Blast Radius:*\n*${cluster.urgency_score}* / *${cluster.blast_radius_score}*`,
          },
          {
            type: "mrkdwn",
            text: `*Alert Count:*\n${cluster.alert_count} raw alerts sifted`,
          },
          {
            type: "mrkdwn",
            text: `*Environment:*\n\`${cluster.environment}\``,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Context Summary:*\n${cluster.context_summary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Root Cause Hypothesis:*\n\`${cluster.root_cause_hypothesis}\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recommended Action:*\n${cluster.recommended_action}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Services: ${cluster.services.join(", ")} | Sources: ${cluster.sources.join(", ")} | Pattern: \`${cluster.pattern_signature}\``,
          },
        ],
      },
    ],
  };
}

function formatTeamsPayload(cluster: AlertCluster) {
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: cluster.urgency_score >= 75 ? "D9381E" : "FF9900",
    summary: cluster.title,
    sections: [
      {
        activityTitle: `TCT SignalSieve Incident: ${cluster.title}`,
        activitySubtitle: `Urgency ${cluster.urgency_score}/100 | Blast Radius ${cluster.blast_radius_score}/100`,
        facts: [
          { name: "Status", value: cluster.status },
          { name: "Environment", value: cluster.environment },
          { name: "Alerts Correlated", value: String(cluster.alert_count) },
          { name: "Services", value: cluster.services.join(", ") },
        ],
        text: `**Root Cause Hypothesis:**\n${cluster.root_cause_hypothesis}\n\n**Runbook Remediation:**\n${cluster.recommended_action}`,
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: WebhookDispatchPayload = await req.json();
    const { channel = "slack", webhookUrl, clusterId } = body;

    if (!clusterId) {
      return NextResponse.json(
        { error: "clusterId is required" },
        { status: 400 }
      );
    }

    const cluster = await getClusterById(clusterId);
    if (!cluster) {
      return NextResponse.json(
        { error: "Cluster not found" },
        { status: 404 }
      );
    }

    let payload: any;
    if (channel === "teams") {
      payload = formatTeamsPayload(cluster);
    } else {
      payload = formatSlackPayload(cluster);
    }

    // If an actual valid HTTP webhook URL is provided, try to send it
    if (
      webhookUrl &&
      (webhookUrl.startsWith("http://") || webhookUrl.startsWith("https://"))
    ) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const startTime = Date.now();

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;
        const responseText = await response.text();

        return NextResponse.json({
          ok: response.ok,
          delivered: response.ok,
          status: response.status,
          latencyMs,
          channel,
          webhookUrl,
          responseText: responseText.slice(0, 500),
          payload,
        });
      } catch (fetchError: any) {
        return NextResponse.json({
          ok: false,
          delivered: false,
          error: fetchError?.message || "Connection failed or timed out",
          channel,
          webhookUrl,
          payload,
        });
      }
    }

    // Simulated / Test delivery (e.g. for demo or testing webhooks)
    return NextResponse.json({
      ok: true,
      simulated: true,
      delivered: true,
      status: 200,
      latencyMs: 42,
      channel,
      message: "Notification payload synthesized and ready for dispatch.",
      payload,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to dispatch notification" },
      { status: 500 }
    );
  }
}
