import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { costTracker } from "@/src/services/cost-tracker";
import { budgetEngine, BudgetScopeType } from "@/src/services/budget-engine";

export const dynamic = "force-dynamic";

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
    const { action, scopeType, scopeId, limitCents, warnPercent, hardStop, incidentId } = body;

    if (action === "upsert_policy") {
      if (!scopeType || !scopeId || limitCents === undefined) {
        return NextResponse.json(
          { success: false, error: "scopeType, scopeId, and limitCents are required" },
          { status: 400 }
        );
      }

      await budgetEngine.upsertPolicy({
        scopeType: scopeType as BudgetScopeType,
        scopeId: String(scopeId),
        limitCents: Number(limitCents),
        warnPercent: warnPercent !== undefined ? Number(warnPercent) : undefined,
        hardStop: hardStop !== undefined ? Boolean(hardStop) : undefined,
      });

      return NextResponse.json({ success: true, message: "Budget policy upserted successfully" });
    }

    if (action === "resolve_incident") {
      if (!incidentId) {
        return NextResponse.json(
          { success: false, error: "incidentId is required" },
          { status: 400 }
        );
      }

      await budgetEngine.resolveIncident(String(incidentId));
      return NextResponse.json({ success: true, message: "Incident resolved successfully" });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
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
