import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, refreshAccessTokenOnServer } from "@/lib/backend";
import { ACCESS_COOKIE, ACTIVE_SPPG_COOKIE } from "@/lib/constants";

const schema = z.object({
  sppg_id: z.string().uuid()
});

export async function POST(request: Request) {
  const store = await cookies();
  const body = schema.parse(await request.json());
  let accessToken = store.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    const refreshed = await refreshAccessTokenOnServer();
    if (!refreshed) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Session expired" } }, { status: 401 });
    }
    accessToken = refreshed;
  }

  const switched = await backendFetch<{ active_sppg_id: string; access_token: string }>("/me/active-sppg", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!switched.ok) {
    return NextResponse.json(switched.data, { status: switched.status });
  }

  store.set(ACCESS_COOKIE, switched.data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  store.set(ACTIVE_SPPG_COOKIE, switched.data.active_sppg_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  return NextResponse.json(switched.data);
}
