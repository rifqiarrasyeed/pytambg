import { NextRequest } from "next/server";
import { addDays } from "date-fns";
import { requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { generateDocNo } from "@/lib/core/utils";

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  if (!session.platformRoles.includes("PLATFORM_ADMIN")) {
    return errorResponse("FORBIDDEN", "Hanya PLATFORM_ADMIN yang boleh renew batch", 403);
  }

  const dueSubs = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lte: new Date() } },
    include: { plan: true },
    take: 200
  });

  const created: string[] = [];

  for (const sub of dueSubs) {
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        planId: sub.planId,
        invoiceNo: generateDocNo("INV"),
        amount: sub.plan.price,
        status: "OPEN",
        dueAt: addDays(new Date(), 7),
        providerOrderId: generateDocNo("ORD")
      }
    });
    created.push(invoice.id);
  }

  return ok({ created_count: created.length, invoice_ids: created });
}

