import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { env } from "@/lib/core/env";
import { readLocalFile } from "@/lib/core/storage";

const schema = z.object({
  objectKey: z.string().min(3),
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
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload complete upload tidak valid", 422, parsed.error.flatten());

  if (!parsed.data.objectKey.startsWith(`${tenantId}/`)) {
    return errorResponse("TENANT_SCOPE_VIOLATION", "Object key tidak sesuai tenant aktif", 403);
  }

  if (env.STORAGE_DRIVER === "local") {
    const bytes = await readLocalFile(parsed.data.objectKey).catch(() => null);
    if (!bytes) return errorResponse("UPLOAD_NOT_FOUND", "File belum ter-upload", 404);

    const calculated = crypto.createHash("sha256").update(bytes).digest("hex");
    if (calculated !== parsed.data.checksumSha256) {
      return errorResponse("CHECKSUM_MISMATCH", "Checksum file tidak sesuai", 422);
    }
  }

  const file = await prisma.fileObject.create({
    data: {
      tenantId,
      storageDriver: env.STORAGE_DRIVER.toUpperCase() as any,
      bucket: env.STORAGE_DRIVER === "s3" ? env.S3_BUCKET : "local",
      objectKey: parsed.data.objectKey,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      checksumSha256: parsed.data.checksumSha256,
      uploadedById: session.userId
    }
  });

  return ok({ id: file.id, objectKey: file.objectKey, checksumSha256: file.checksumSha256 }, 201);
}

