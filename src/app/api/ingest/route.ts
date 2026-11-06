import { NextRequest, NextResponse } from "next/server";
import { getDashboardMetrics, ingestAlertPayload } from "@/lib/db";
import { AlertSource } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const explicitSource =
      (req.nextUrl.searchParams.get("source") as AlertSource | null) || undefined;
    const body = await req.json();

    const payloads: Record<string, any>[] = Array.isArray(body)
      ? body
      : Array.isArray(body.alerts)
      ? body.alerts
      : [body];

    const results = [];
    let suppressedCount = 0;

    for (const item of payloads) {
      const res = await ingestAlertPayload(
        item,
        explicitSource || (item.source as AlertSource | undefined)
      );
      if (res.suppressed) suppressedCount++;
      results.push({
        alertId: res.alert.id,
        source: res.alert.source,
        service: res.alert.service,
        title: res.alert.title,
        suppressed: res.suppressed,
        matchedRuleId: res.matchedRule?.id || null,
        clusterId: res.cluster?.id || null,
        clusterTitle: res.cluster?.title || null,
        clusterUrgency: res.cluster?.urgency_score || null,
      });
    }

    return NextResponse.json({
      ok: true,
      ingestedCount: results.length,
      suppressedCount,
      results,
      metrics: await getDashboardMetrics(),
    });
  } catch (error: any) {
    console.error("POST /api/ingest error:", error);
    return NextResponse.json(
      { error: error?.message || "Invalid alert webhook payload" },
      { status: 400 }
    );
  }
}
