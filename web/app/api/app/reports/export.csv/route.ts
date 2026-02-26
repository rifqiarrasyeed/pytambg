import { NextRequest } from "next/server";
import { stringify } from "csv-stringify/sync";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "reports.export");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const plans = await prisma.dailyPlan.findMany({
    where: { tenantId },
    include: { items: true },
    orderBy: { planDate: "desc" },
    take: 100
  });

  const rows = plans.map((plan) => ({
    plan_date: plan.planDate.toISOString().slice(0, 10),
    status: plan.status,
    target_portions: plan.items.reduce((sum, item) => sum + item.targetPortions, 0),
    menu: plan.menuSummary ?? ""
  }));

  const csv = stringify(rows, { header: true });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=report-plans.csv"
    }
  });
}

