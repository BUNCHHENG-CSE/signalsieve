import { NextRequest, NextResponse } from "next/server";
import { evaluateValidationDataset } from "@/lib/clustering";
import { getClusteringConfig, updateClusteringConfig } from "@/lib/db";
import { WEEKLY_VALIDATION_DATASET } from "@/lib/scenarios";
import { ClusteringConfig, ValidationAlertItem } from "@/lib/types";

export async function GET() {
  try {
    const config = await getClusteringConfig();
    const report = evaluateValidationDataset(WEEKLY_VALIDATION_DATASET, config);
    return NextResponse.json({
      config,
      dataset: WEEKLY_VALIDATION_DATASET,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to evaluate validation dataset" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const currentConfig = await getClusteringConfig();

    const customConfig: ClusteringConfig = {
      ...currentConfig,
      ...(body.config || {}),
    };

    const dataset: ValidationAlertItem[] =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : WEEKLY_VALIDATION_DATASET;

    const report = evaluateValidationDataset(dataset, customConfig);

    if (body.applyToProd) {
      await updateClusteringConfig({
        time_window_minutes: customConfig.time_window_minutes,
        entity_weight: customConfig.entity_weight,
        service_topology_weight: customConfig.service_topology_weight,
        text_similarity_weight: customConfig.text_similarity_weight,
        similarity_threshold: customConfig.similarity_threshold,
      });
    }

    return NextResponse.json({
      ok: true,
      appliedToProd: Boolean(body.applyToProd),
      config: customConfig,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to run validation analysis" },
      { status: 400 }
    );
  }
}
