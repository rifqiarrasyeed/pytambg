import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACTIVE_SPPG_COOKIE, REFRESH_COOKIE } from "./constants";

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000";
  return base.replace(/\/+$/, "");
}

export type BackendResult<T> = {
  status: number;
  ok: boolean;
  data: T;
};

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<BackendResult<T>> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return {
    status: response.status,
    ok: response.ok,
    data
  };
}

export async function refreshAccessTokenOnServer(): Promise<string | null> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return null;
  }

  const activeSppg = store.get(ACTIVE_SPPG_COOKIE)?.value;
  const refreshed = await backendFetch<{ access_token: string; refresh_token: string; active_sppg_id: string | null }>(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken, active_sppg_id: activeSppg ?? undefined })
    }
  );

  if (!refreshed.ok) {
    return null;
  }

  store.set(ACCESS_COOKIE, refreshed.data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  store.set(REFRESH_COOKIE, refreshed.data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  if (refreshed.data.active_sppg_id) {
    store.set(ACTIVE_SPPG_COOKIE, refreshed.data.active_sppg_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  return refreshed.data.access_token;
}
