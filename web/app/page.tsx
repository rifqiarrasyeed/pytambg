import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "@/lib/constants";
import { resolveRoleHomeRoute } from "@/lib/navigation";
import { getSessionOrRedirect } from "@/lib/session-server";

export default async function HomePage() {
  const store = await cookies();
  const hasAccess = Boolean(store.get(ACCESS_COOKIE)?.value);
  if (!hasAccess) {
    redirect("/login");
  }

  const session = await getSessionOrRedirect();
  const activeRoles = session.assignments.find((assignment) => assignment.sppg_id === session.active_sppg_id)?.roles ?? [];
  redirect(resolveRoleHomeRoute(activeRoles));
}
