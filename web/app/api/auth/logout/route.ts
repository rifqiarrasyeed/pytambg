import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";
import { ACCESS_COOKIE, ACTIVE_SPPG_COOKIE, REFRESH_COOKIE } from "@/lib/constants";

export async function POST() {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;

  if (refresh) {
    await backendFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh })
    });
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(ACTIVE_SPPG_COOKIE);

  return NextResponse.json({ ok: true });
}
