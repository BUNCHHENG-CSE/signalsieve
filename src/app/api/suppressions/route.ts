import { NextRequest, NextResponse } from "next/server";
import {
  createSuppressionRule,
  listSuppressionRules,
  revokeSuppressionRule,
} from "@/lib/db";

export async function GET() {
  try {
    const suppressions = await listSuppressionRules();
    return NextResponse.json({ suppressions });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list suppression rules" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { error: "A suppression reason log is required for auditability." },
        { status: 400 }
      );
    }

    const rule = await createSuppressionRule({
      name: body.name || `Suppress Pattern: ${body.pattern_signature}`,
      pattern_signature: body.pattern_signature || "custom-pattern",
      match_criteria: body.match_criteria,
      reason: body.reason.trim(),
      created_by: body.created_by || "alex@leanops.io (On-Call SRE)",
      durationHours: Number(body.durationHours) || 24,
      clusterId: body.clusterId,
    });

    return NextResponse.json({
      ok: true,
      rule,
      suppressions: await listSuppressionRules(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create suppression rule" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
    }
    const updated = await revokeSuppressionRule(id);
    return NextResponse.json({
      ok: true,
      rule: updated,
      suppressions: await listSuppressionRules(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to revoke suppression rule" },
      { status: 500 }
    );
  }
}
