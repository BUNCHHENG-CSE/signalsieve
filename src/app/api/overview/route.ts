import { NextRequest, NextResponse } from "next/server";
import {
  getClusteringConfig,
  getDashboardMetrics,
  getDbStatus,
  listClusters,
  listSuppressionRules,
  resetAndReseedDatabase,
  triggerScenarioSimulation,
} from "@/lib/db";
import { SAMPLE_WEBHOOK_PAYLOADS, SCENARIOS } from "@/lib/scenarios";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") || "all";
    const [metrics, clusters, suppressions, config, dbStatus] = await Promise.all([
      getDashboardMetrics(),
      listClusters({ status, includeAlerts: true }),
      listSuppressionRules(),
      getClusteringConfig(),
      getDbStatus(),
    ]);

    return NextResponse.json({
      metrics,
      clusters,
      suppressions,
      config,
      dbStatus,
      scenarios: Object.values(SCENARIOS).map((s) => ({
        id: s.id,
        name: s.name,
        subtitle: s.subtitle,
        alertCount: s.alertCount,
        badge: s.badge,
      })),
      sampleWebhooks: SAMPLE_WEBHOOK_PAYLOADS,
    });
  } catch (error: any) {
    console.error("GET /api/overview error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load dashboard overview" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "reset_demo") {
      await resetAndReseedDatabase();
      return NextResponse.json({
        ok: true,
        message: "Database reset and re-seeded with baseline multi-source scenarios.",
        metrics: await getDashboardMetrics(),
      });
    }

    if (body.action === "get_scenario_alerts") {
      const scenario = SCENARIOS[body.scenario || "expired_cert"];
      if (!scenario) {
        return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, scenario });
    }

    if (body.action === "simulate_scenario") {
      const scenarioKey = body.scenario || "expired_cert";
      const result = await triggerScenarioSimulation(scenarioKey);
      return NextResponse.json({
        ok: true,
        result,
        metrics: await getDashboardMetrics(),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/overview error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to execute action" },
      { status: 500 }
    );
  }
}
