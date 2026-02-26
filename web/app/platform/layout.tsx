import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/core/auth-options";
import { PlatformShell } from "@/components/layout/platform-shell";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const roles = session.platformRoles ?? [];
  if (!roles.includes("PLATFORM_ADMIN") && !roles.includes("PLATFORM_OPS")) {
    redirect("/app/dashboard");
  }

  return <PlatformShell>{children}</PlatformShell>;
}

