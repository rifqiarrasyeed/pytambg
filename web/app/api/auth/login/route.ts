import { z } from "zod";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";
import { ACCESS_COOKIE, ACTIVE_SPPG_COOKIE, REFRESH_COOKIE } from "@/lib/constants";
import { errorResponse } from "@/lib/core/errors";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const bodyRaw = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Payload login tidak valid", 422, parsed.error.flatten());
  }

  const upstream = await backendFetch<{
    access_token?: string;
    refresh_token?: string;
    active_sppg_id?: string | null;
    user?: unknown;
    assignments?: unknown[];
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(parsed.data)
  });

  if (!upstream.ok || !upstream.data?.access_token || !upstream.data?.refresh_token) {
    return NextResponse.json(upstream.data ?? { error: { message: "Login gagal" } }, { status: upstream.status || 401 });
  }

  const response = NextResponse.json({
    ok: true,
    message: "Legacy token session created",
    user: upstream.data.user ?? null,
    assignments: upstream.data.assignments ?? [],
    active_sppg_id: upstream.data.active_sppg_id ?? null
  });

  response.cookies.set(ACCESS_COOKIE, upstream.data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set(REFRESH_COOKIE, upstream.data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  if (upstream.data.active_sppg_id) {
    response.cookies.set(ACTIVE_SPPG_COOKIE, upstream.data.active_sppg_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  return response;
}
