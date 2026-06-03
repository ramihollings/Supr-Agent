import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { costTracker } from "@/lib/services/cost-tracker";
import { budgetEngine, BudgetScopeType } from "@/lib/services/budget-engine";

export const dynamic = "force-dynamic";

/**
 * Zod schemas for finance request bodies.
 *
 * The previous version used `Number(limitCents)` / `Number(warnPercent)`
 * which silently accepts NaN, negative values, and out-of-range floats.
 * This lets a caller write a row with `limitCents: -1` or
 * `limitCents: Number.MAX_SAFE_INTEGER` and bypass the budget guard.
 * The schema below enforces a positive integer for `limitCents`, a
 * 1..100 range for `warnPercent`, and a closed enum for `scopeType`.
 */
const SCOPE_TYPES: [BudgetScopeType, ...BudgetScopeType[]] = ["global", "agent", "mission"];

const upsertPolicySchema = z.object({
  action: z.literal("upsert_policy"),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.string().min(1).max(256),
  limitCents: z.number().int().positive().max(1_000_000_000_000), // 10B cents = $100M cap
  warnPercent: z.number().min(1).max(100).optional(),
  hardStop: z.boolean().optional(),
});

const resolveIncidentSchema = z.object({
  action: z.literal("resolve_incident"),
  incidentId: z.string().min(1).max(256),
});

const financeRequestSchema = z.discriminatedUnion("action", [
  upsertPolicySchema,
  resolveIncidentSchema,
]);

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  try {
    const summary = await costTracker.getSpendSummary();
    const policies = await budgetEngine.listPolicies();
    const incidents = await budgetEngine.getIncidents();

    return NextResponse.json({
      success: true,
      summary,
      policies,
      incidents,
    });
  } catch (error: any) {
    console.error("Finance API Error (GET):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch financial data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = financeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body.",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      );
    }

    if (parsed.data.action === "upsert_policy") {
      await budgetEngine.upsertPolicy({
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        limitCents: parsed.data.limitCents,
        warnPercent: parsed.data.warnPercent,
        hardStop: parsed.data.hardStop,
      });
      return NextResponse.json({ success: true, message: "Budget policy upserted successfully" });
    }

    if (parsed.data.action === "resolve_incident") {
      await budgetEngine.resolveIncident(parsed.data.incidentId);
      return NextResponse.json({ success: true, message: "Incident resolved successfully" });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Finance API Error (POST):", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute finance action" },
      { status: 500 }
    );
  }
}
