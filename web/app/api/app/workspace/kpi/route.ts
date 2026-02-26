import { NextRequest } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const from = startOfDay(new Date());
  const to = endOfDay(new Date());

  const [plannedRows, productionRows, deliveredRows, verifiedRows, disputeRows] = await Promise.all([
    prisma.dailyPlanItem.aggregate({
      _sum: { targetPortions: true },
      where: { tenantId, dailyPlan: { planDate: { gte: from, lte: to } } }
    }),
    prisma.production.aggregate({ _sum: { producedPortions: true }, where: { tenantId, productionDate: { gte: from, lte: to } } }),
    prisma.deliveryStop.aggregate({ _sum: { deliveredPortions: true }, where: { tenantId, createdAt: { gte: from, lte: to } } }),
    prisma.verification.aggregate({ _sum: { receivedPortions: true }, where: { tenantId, status: "VERIFIED", createdAt: { gte: from, lte: to } } }),
    prisma.dispute.count({ where: { tenantId, status: { in: ["OPEN", "IN_REVIEW"] } } })
  ]);

  const planned = plannedRows._sum.targetPortions ?? 0;
  const produced = productionRows._sum.producedPortions ?? 0;
  const delivered = deliveredRows._sum.deliveredPortions ?? 0;
  const verified = verifiedRows._sum.receivedPortions ?? 0;
  const waste_rate = produced > 0 ? Math.max(0, produced - verified) / produced : 0;

  return ok({ planned, produced, delivered, verified, waste_rate, open_disputes: disputeRows });
}

