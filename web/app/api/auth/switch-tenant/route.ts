import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/core/auth-options";
import { prisma } from "@/lib/core/db";
import { errorResponse } from "@/lib/core/errors";
import { cookies } from "next/headers";

const switchSchema = z.object({
  tenant_id: z.string().min(1)
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return errorResponse("UNAUTHENTICATED", "Sesi tidak valid", 401);
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = switchSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "tenant_id wajib diisi", 422, parsed.error.flatten());
  }

  const member = await prisma.tenantMember.findUnique({
    where: {
      tenantId_userId: {
        tenantId: parsed.data.tenant_id,
        userId: session.user.id
      }
    }
  });

  if (!member || member.status !== "ACTIVE") {
    return errorResponse("FORBIDDEN", "Tenant tidak termasuk assignment user", 403);
  }

  const store = await cookies();
  store.set("mbg_active_tenant", parsed.data.tenant_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return Response.json({ ok: true, active_tenant_id: parsed.data.tenant_id });
}

