import { NextRequest, NextResponse } from "next/server";
import {
  getClusterById,
  regenerateClusterSummaryWithLLM,
  updateClusterStatus,
} from "@/lib/db";
import { ClusterStatus } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cluster = await getClusterById(id);
    if (!cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }
    return NextResponse.json({ cluster });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch cluster" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    if (body.action === "regenerate_summary") {
      const updated = await regenerateClusterSummaryWithLLM(id);
      if (!updated) {
        return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
      }
      return NextResponse.json({ cluster: updated });
    }

    if (body.status) {
      const updated = await updateClusterStatus(id, body.status as ClusterStatus);
      if (!updated) {
        return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
      }
      return NextResponse.json({ cluster: updated });
    }

    return NextResponse.json({ error: "No valid update field provided" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update cluster" },
      { status: 500 }
    );
  }
}
