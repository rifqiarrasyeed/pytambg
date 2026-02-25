import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch, refreshAccessTokenOnServer } from "@/lib/backend";
import { ACCESS_COOKIE } from "@/lib/constants";

export async function GET() {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    const refreshed = await refreshAccessTokenOnServer();
    if (!refreshed) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    accessToken = refreshed;
  }

  let session = await backendFetch<{
    assignments: Array<{ sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean }>;
    active_sppg_id: string | null;
  }>("/me/sppg", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  let context = await backendFetch<{
    user: { id: string; email: string | null; full_name: string | null };
    active_sppg_id: string | null;
    roles: string[];
    permissions: string[];
    is_super_admin: boolean;
  }>("/me/context", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (session.status === 401) {
    const refreshed = await refreshAccessTokenOnServer();
    if (!refreshed) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    session = await backendFetch("/me/sppg", {
      method: "GET",
      headers: { Authorization: `Bearer ${refreshed}` }
    });
    context = await backendFetch("/me/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${refreshed}` }
    });
  }

  if (!session.ok || !context.ok) {
    const status = !session.ok ? session.status : context.status;
    const data = !session.ok ? session.data : context.data;
    return NextResponse.json(data, { status });
  }

  return NextResponse.json({ authenticated: true, ...session.data, context: context.data });
}
