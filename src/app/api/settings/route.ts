import { NextRequest, NextResponse } from "next/server";
import {
  getClusteringConfig,
  getDbStatus,
  switchPostgresConnection,
  updateClusteringConfig,
} from "@/lib/db";

export async function GET() {
  try {
    const [config, dbStatus] = await Promise.all([
      getClusteringConfig(),
      getDbStatus(),
    ]);
    return NextResponse.json({ config, dbStatus });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body.databaseUrl === "string") {
      const connRes = await switchPostgresConnection(body.databaseUrl);
      const config = await getClusteringConfig();
      if (!connRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: connRes.error,
            dbStatus: connRes.status,
            config,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        dbStatus: connRes.status,
        config,
      });
    }

    const updated = await updateClusteringConfig(body);
    const dbStatus = await getDbStatus();
    return NextResponse.json({ ok: true, config: updated, dbStatus });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update settings" },
      { status: 400 }
    );
  }
}
