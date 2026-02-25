import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "@/lib/constants";

export default async function HomePage() {
  const store = await cookies();
  const hasAccess = Boolean(store.get(ACCESS_COOKIE)?.value);
  redirect(hasAccess ? "/dashboard" : "/login");
}
