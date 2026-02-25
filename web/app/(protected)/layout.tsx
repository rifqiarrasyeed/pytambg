import { AppShell } from "@/components/app-shell";
import { getSessionOrRedirect } from "@/lib/session-server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionOrRedirect();

  return (
    <AppShell assignments={session.assignments} activeSppgId={session.active_sppg_id}>
      {children}
    </AppShell>
  );
}
