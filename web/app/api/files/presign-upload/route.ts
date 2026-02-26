import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { createUploadUrl, randomObjectKey } from "@/lib/core/storage";
import { env } from "@/lib/core/env";

const schema = z.object({
  module: z.string().min(2),
  fileName: z.string().min(1),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive(),
  checksumSha256: z.string().length(64)
});

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload upload tidak valid", 422, parsed.error.flatten());

  const objectKey = randomObjectKey(tenantId, parsed.data.module, parsed.data.fileName);
  const upload = await createUploadUrl(objectKey, parsed.data.mimeType);

  return ok({
    uploadUrl: upload.url,
    method: upload.method,
    objectKey,
    storageDriver: env.STORAGE_DRIVER,
    expiresInSeconds: 900,
    checksumSha256: parsed.data.checksumSha256,
    sizeBytes: parsed.data.sizeBytes,
    mimeType: parsed.data.mimeType,
    fileName: parsed.data.fileName
  });
}

