import { NextRequest } from "next/server";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { createReadUrl } from "@/lib/core/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const routeParams = await params;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const file = await prisma.fileObject.findFirst({ where: { id: routeParams.id, tenantId } });
  if (!file) return errorResponse("NOT_FOUND", "Attachment tidak ditemukan", 404);

  const signedUrl = await createReadUrl(file.objectKey);
  return ok({ fileId: file.id, signedUrl, expiresInSeconds: 300 });
}
