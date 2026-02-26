import { prisma } from "@/lib/core/db";
import { sha256 } from "@/lib/core/utils";

export async function withIdempotency<T>(scope: string, endpoint: string, key: string, payload: unknown, handler: () => Promise<{ status: number; body: T }>) {
  const requestHash = sha256(JSON.stringify(payload ?? {}));
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      scope_endpoint_key: {
        scope,
        endpoint,
        key
      }
    }
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        replay: false,
        conflict: true,
        status: 409,
        body: {
          error: {
            code: "IDEMPOTENCY_CONFLICT",
            message: "Idempotency-Key sudah dipakai dengan payload berbeda",
            timestamp: new Date().toISOString()
          }
        }
      } as const;
    }

    return {
      replay: true,
      conflict: false,
      status: existing.responseCode ?? 200,
      body: existing.responseBody as T
    } as const;
  }

  const result = await handler();

  await prisma.idempotencyKey.create({
    data: {
      scope,
      endpoint,
      key,
      requestHash,
      responseCode: result.status,
      responseBody: result.body as any,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }
  });

  return {
    replay: false,
    conflict: false,
    status: result.status,
    body: result.body
  } as const;
}

