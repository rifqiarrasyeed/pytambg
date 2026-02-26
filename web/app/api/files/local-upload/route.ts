import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/core/errors";
import { verifyLocalSignedPayload, writeLocalFile } from "@/lib/core/storage";

export async function PUT(request: NextRequest) {
  const payload = request.nextUrl.searchParams.get("payload");
  const signature = request.nextUrl.searchParams.get("signature");

  if (!payload || !signature) return errorResponse("INVALID_SIGNATURE", "Signed payload tidak lengkap", 401);

  const verified = verifyLocalSignedPayload(payload, signature);
  if (!verified.valid || !verified.objectKey) return errorResponse("INVALID_SIGNATURE", "Signed payload tidak valid", 401);

  const bytes = Buffer.from(await request.arrayBuffer());
  await writeLocalFile(verified.objectKey, bytes);

  return Response.json({ ok: true });
}

