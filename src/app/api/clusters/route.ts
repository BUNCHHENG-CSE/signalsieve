import { NextRequest, NextResponse } from "next/server";
import {
  bulkSuppressClusters,
  bulkUpdateClusterStatus,
  listClusters,
} from "@/lib/db";
import { ClusterStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") || "all";
    const clusters = await listClusters({ status, includeAlerts: true });
    return NextResponse.json({ clusters });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list clusters" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, clusterIds, status, reason } = body;

    if (!Array.isArray(clusterIds) || clusterIds.length === 0) {
      return NextResponse.json(
        { error: "clusterIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (action === "bulk_status" && status) {
      const updatedCount = await bulkUpdateClusterStatus(
        clusterIds,
        status as ClusterStatus
      );
      return NextResponse.json({ ok: true, updatedCount });
    }

    if (action === "bulk_suppress") {
      const suppressedCount = await bulkSuppressClusters(
        clusterIds,
        reason || "Bulk suppressed by operator"
      );
      return NextResponse.json({ ok: true, suppressedCount });
    }

    return NextResponse.json(
      { error: "Invalid action or parameters" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to perform bulk cluster update" },
      { status: 500 }
    );
  }
}
