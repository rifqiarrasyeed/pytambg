import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/core/auth-options";
import { TenantShell } from "@/components/layout/tenant-shell";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.activeTenantId) {
    redirect("/login");
  }

  return <TenantShell>{children}</TenantShell>;
}

