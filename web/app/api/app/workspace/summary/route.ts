import { NextRequest } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { requireSession, requireTenant, enforceTenantPermission } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const blocked = await enforceTenantPermission(session, "reports.read");
  if (blocked) return blocked;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(now);

  const [tasks_today, open_disputes, pending_verifications, near_expiry_alerts] = await Promise.all([
    prisma.delivery.count({ where: { tenantId, status: { in: ["PLANNED", "LOADED", "IN_TRANSIT", "DELIVERED"] } } }),
    prisma.dispute.count({ where: { tenantId, status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.verification.count({ where: { tenantId, status: { in: ["PENDING", "MISMATCH_REPORTED"] } } }),
    prisma.fileObject.count({ where: { tenantId, createdAt: { gte: from, lte: to } } })
  ]);

  return ok({ tasks_today, open_disputes, pending_verifications, near_expiry_alerts });
}

