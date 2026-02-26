import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/core/errors";
import { verifyLocalSignedPayload, readLocalFile } from "@/lib/core/storage";

export async function GET(request: NextRequest) {
  const payload = request.nextUrl.searchParams.get("payload");
  const signature = request.nextUrl.searchParams.get("signature");

  if (!payload || !signature) return errorResponse("INVALID_SIGNATURE", "Signed payload tidak lengkap", 401);

  const verified = verifyLocalSignedPayload(payload, signature);
  if (!verified.valid || !verified.objectKey) return errorResponse("INVALID_SIGNATURE", "Signed payload tidak valid", 401);

  const file = await readLocalFile(verified.objectKey).catch(() => null);
  if (!file) return errorResponse("NOT_FOUND", "File tidak ditemukan", 404);

  return new Response(file, { status: 200 });
}

