import { NextRequest } from "next/server";
import { verifyMidtransSignature } from "@/lib/core/midtrans";
import { prisma } from "@/lib/core/db";
import { errorResponse, ok } from "@/lib/core/errors";

const statusMap: Record<string, "SUCCESS" | "PENDING" | "FAILED" | "EXPIRED"> = {
  settlement: "SUCCESS",
  capture: "SUCCESS",
  pending: "PENDING",
  deny: "FAILED",
  cancel: "FAILED",
  expire: "EXPIRED",
  failure: "FAILED"
};

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return errorResponse("VALIDATION_ERROR", "Payload webhook tidak valid", 422);

  if (!verifyMidtransSignature(payload)) {
    return errorResponse("INVALID_SIGNATURE", "Signature Midtrans tidak valid", 401);
  }

  const orderId = String(payload.order_id ?? "");
  const transactionStatus = String(payload.transaction_status ?? "pending");
  const transactionId = String(payload.transaction_id ?? `${orderId}:${transactionStatus}`);
  const providerEventId = `${transactionId}:${transactionStatus}`;

  const existing = await prisma.midtransEvent.findUnique({ where: { providerEventId } });
  if (existing) {
    return ok({ ok: true, duplicate: true });
  }

  const invoice = await prisma.invoice.findFirst({ where: { providerOrderId: orderId } });

  let event;
  try {
    event = await prisma.midtransEvent.create({
      data: {
        providerEventId,
        orderId,
        eventType: transactionStatus,
        payload: payload as any,
        tenantId: invoice?.tenantId,
        processed: false
      }
    });
  } catch {
    return ok({ ok: true, duplicate: true });
  }

  if (invoice) {
    const paymentStatus = statusMap[transactionStatus] ?? "PENDING";
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          status: paymentStatus,
          amount: invoice.amount,
          method: String(payload.payment_type ?? "unknown"),
          providerPaymentId: transactionId,
          providerPayload: payload as any,
          paidAt: paymentStatus === "SUCCESS" ? new Date() : null
        }
      });

      const nextInvoiceStatus = paymentStatus === "SUCCESS" ? "PAID" : paymentStatus === "EXPIRED" ? "OVERDUE" : "OPEN";
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextInvoiceStatus,
          paidAt: paymentStatus === "SUCCESS" ? new Date() : null,
          lastWebhookEventId: event.id
        }
      });

      const subscription = invoice.subscriptionId ? await tx.subscription.findUnique({ where: { id: invoice.subscriptionId } }) : null;
      if (subscription) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data:
            paymentStatus === "SUCCESS"
              ? {
                  status: "ACTIVE",
                  currentPeriodStart: new Date(),
                  currentPeriodEnd:
                    subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date()
                      ? subscription.currentPeriodEnd
                      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
                  graceUntil: null
                }
              : {
                  status: "PAST_DUE",
                  graceUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
                }
        });
      }

      await tx.midtransEvent.update({
        where: { id: event.id },
        data: { processed: true, processedAt: new Date() }
      });
    });
  } else {
    await prisma.midtransEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
  }

  return ok({ ok: true, eventId: event.id });
}

