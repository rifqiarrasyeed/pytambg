import { NextRequest } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "reports.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const date = request.nextUrl.searchParams.get("date") ? new Date(request.nextUrl.searchParams.get("date") as string) : new Date();
  const from = startOfDay(date);
  const to = endOfDay(date);

  const [plannedRows, producedRows, deliveredRows, verifiedRows] = await Promise.all([
    prisma.dailyPlanItem.aggregate({ _sum: { targetPortions: true }, where: { tenantId, dailyPlan: { planDate: { gte: from, lte: to } } } }),
    prisma.production.aggregate({ _sum: { producedPortions: true }, where: { tenantId, productionDate: { gte: from, lte: to } } }),
    prisma.deliveryStop.aggregate({ _sum: { deliveredPortions: true }, where: { tenantId, createdAt: { gte: from, lte: to } } }),
    prisma.verification.aggregate({ _sum: { receivedPortions: true }, where: { tenantId, status: "VERIFIED", createdAt: { gte: from, lte: to } } })
  ]);

  const planned = plannedRows._sum.targetPortions ?? 0;
  const produced = producedRows._sum.producedPortions ?? 0;
  const delivered = deliveredRows._sum.deliveredPortions ?? 0;
  const verified = verifiedRows._sum.receivedPortions ?? 0;
  const waste_rate = produced > 0 ? Math.max(0, produced - verified) / produced : 0;

  return ok({ planned, produced, delivered, verified, waste_rate });
}

