import { NextRequest } from "next/server";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const [openDisputes, pendingVerification, pastDueSubs] = await Promise.all([
    prisma.dispute.count({ where: { tenantId, status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.verification.count({ where: { tenantId, status: { in: ["PENDING", "MISMATCH_REPORTED"] } } }),
    prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } })
  ]);

  const alerts = [
    ...(openDisputes > 0
      ? [{ id: "open-disputes", level: "warning", title: "Dispute belum selesai", description: `${openDisputes} dispute aktif.` }]
      : []),
    ...(pendingVerification > 0
      ? [{ id: "pending-verify", level: "info", title: "Verifikasi tertunda", description: `${pendingVerification} stop menunggu verifikasi.` }]
      : []),
    ...(pastDueSubs && ["PAST_DUE", "SUSPENDED"].includes(pastDueSubs.status)
      ? [{ id: "sub-warning", level: "danger", title: "Subscription bermasalah", description: `Status ${pastDueSubs.status}.` }]
      : [])
  ];

  return ok(alerts);
}

