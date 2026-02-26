import crypto from "node:crypto";
import midtransClient from "midtrans-client";
import { env } from "@/lib/core/env";

const snap = new midtransClient.Snap({
  isProduction: env.midtransIsProduction,
  serverKey: env.MIDTRANS_SERVER_KEY,
  clientKey: env.MIDTRANS_CLIENT_KEY
});

export async function createSnapTransaction(input: {
  orderId: string;
  grossAmount: number;
  customer: { firstName: string; email: string; phone?: string | null };
  callbacks?: { finish?: string; pending?: string; error?: string };
}) {
  const payload: Record<string, unknown> = {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: Math.round(input.grossAmount)
    },
    customer_details: {
      first_name: input.customer.firstName,
      email: input.customer.email,
      phone: input.customer.phone ?? undefined
    }
  };

  if (input.callbacks) {
    payload.callbacks = {
      finish: input.callbacks.finish,
      pending: input.callbacks.pending,
      error: input.callbacks.error
    };
  }

  const tx = await snap.createTransaction(payload as any);
  return {
    token: tx.token,
    redirectUrl: tx.redirect_url,
    raw: tx
  };
}

export function verifyMidtransSignature(payload: Record<string, unknown>): boolean {
  if (env.MIDTRANS_WEBHOOK_SIGNATURE_MODE === "none") {
    return true;
  }

  const signature = String(payload.signature_key ?? "");
  const orderId = String(payload.order_id ?? "");
  const statusCode = String(payload.status_code ?? "");
  const grossAmount = String(payload.gross_amount ?? "");

  if (!signature || !orderId || !statusCode || !grossAmount || !env.MIDTRANS_SERVER_KEY) {
    return false;
  }

  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY}`)
    .digest("hex");

  return expected === signature;
}

