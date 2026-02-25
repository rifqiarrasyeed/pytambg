import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch } from "@/lib/backend";
import { ACCESS_COOKIE, ACTIVE_SPPG_COOKIE, REFRESH_COOKIE } from "@/lib/constants";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());

  const login = await backendFetch<{
    access_token: string;
    refresh_token: string;
    active_sppg_id: string | null;
    assignments: Array<{ sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean }>;
    user: { id: string; name: string; email: string };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (!login.ok) {
    return NextResponse.json(login.data, { status: login.status });
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, login.data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  store.set(REFRESH_COOKIE, login.data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  if (login.data.active_sppg_id) {
    store.set(ACTIVE_SPPG_COOKIE, login.data.active_sppg_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  return NextResponse.json({
    user: login.data.user,
    assignments: login.data.assignments,
    active_sppg_id: login.data.active_sppg_id
  });
}
