import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "./constants";
import { backendFetch, refreshAccessTokenOnServer } from "./backend";

export type SessionPayload = {
  assignments: Array<{ sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean }>;
  active_sppg_id: string | null;
};

export async function getSessionOrRedirect(): Promise<SessionPayload> {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    redirect("/login");
  }

  const fetchSession = async (token: string) =>
    backendFetch<SessionPayload>("/me/sppg", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

  let session = await fetchSession(accessToken);
  if (session.status === 401) {
    const refreshedToken = await refreshAccessTokenOnServer();
    if (!refreshedToken) {
      redirect("/login");
    }
    accessToken = refreshedToken;
    session = await fetchSession(accessToken);
  }

  if (!session.ok) {
    redirect("/login");
  }

  return session.data;
}
