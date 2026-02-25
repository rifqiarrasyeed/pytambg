"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

type Assignment = { sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean };

type AppShellProps = {
  assignments: Assignment[];
  activeSppgId: string | null;
  children: React.ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"] },
  { href: "/planning", label: "Planning", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "NUTRITIONIST"] },
  { href: "/procurement", label: "Procurement", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"] },
  { href: "/inventory", label: "Inventory", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"] },
  { href: "/production", label: "Production", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "KITCHEN_PRODUCTION"] },
  { href: "/delivery", label: "Delivery", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "DRIVER"] },
  { href: "/verification", label: "Verification", roles: ["SUPER_ADMIN", "SCHOOL_VERIFIER"] },
  { href: "/disputes", label: "Disputes", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "SCHOOL_VERIFIER"] },
  { href: "/reports", label: "Reports", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"] },
  { href: "/audit", label: "Audit", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"] },
  { href: "/master-data", label: "Master Data", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY", "NUTRITIONIST"] },
  { href: "/sppg-admin", label: "Admin Pusat", roles: ["SUPER_ADMIN"] },
  { href: "/settings", label: "Settings", roles: ["SUPER_ADMIN", "ADMIN_SPPG"] },
  { href: "/incidents", label: "Incident/Waste", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"] }
];

const navPermissionMap: Record<string, string[]> = {
  "/dashboard": ["report.view"],
  "/planning": ["planning.write", "planning.approve"],
  "/procurement": ["procurement.write", "procurement.approve", "receipt.post"],
  "/inventory": ["inventory.write", "inventory.approve"],
  "/production": ["production.write", "production.finalize"],
  "/delivery": ["delivery.manage", "delivery.update_status"],
  "/verification": ["delivery.verify"],
  "/disputes": ["dispute.manage"],
  "/reports": ["report.view"],
  "/audit": ["audit.view"],
  "/master-data": ["master.read", "master.write"],
  "/sppg-admin": ["sppg.manage", "assignment.manage"],
  "/settings": ["master.write"],
  "/incidents": ["inventory.write", "delivery.manage"]
};

export function AppShell({ assignments, activeSppgId, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  const currentRoles = useMemo(() => {
    const found = assignments.find((item) => item.sppg_id === activeSppgId);
    return found?.roles ?? [];
  }, [assignments, activeSppgId]);

  const visibleNav = useMemo(() => {
    if (currentRoles.includes("SUPER_ADMIN")) {
      return navItems;
    }
    const roleMatched = navItems.filter((item) => item.roles.some((role) => currentRoles.includes(role)));
    if (!permissions) {
      return roleMatched;
    }
    return roleMatched.filter((item) => {
      const required = navPermissionMap[item.href];
      if (!required || required.length === 0) {
        return true;
      }
      return required.some((permission) => permissions.includes(permission));
    });
  }, [currentRoles, permissions]);

  useEffect(() => {
    let mounted = true;
    const loadContext = async () => {
      try {
        const session = await apiClient<{ context?: { permissions?: string[] } }>("/api/session");
        if (mounted) {
          setPermissions(session.context?.permissions ?? null);
        }
      } catch {
        if (mounted) {
          setPermissions(null);
        }
      }
    };
    void loadContext();
    return () => {
      mounted = false;
    };
  }, []);

  const switchTenant = async (sppgId: string) => {
    setSwitching(true);
    try {
      await apiClient("/api/auth/switch-sppg", {
        method: "POST",
        body: JSON.stringify({ sppg_id: sppgId })
      });
      router.refresh();
    } finally {
      setSwitching(false);
      setMenuOpen(false);
    }
  };

  const logout = async () => {
    await apiClient("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <main className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
      <button className="mobile-nav-btn" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation">
        {menuOpen ? "Tutup Menu" : "Menu"}
      </button>

      <aside className={`app-sidebar ${menuOpen ? "open" : ""}`}>
        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>MBG Ops</strong>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Multi-SPPG Traceability</div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>SPPG Aktif</label>
            <select
              className="select"
              value={activeSppgId ?? ""}
              onChange={(e) => switchTenant(e.target.value)}
              disabled={switching || assignments.length === 0}
            >
              {assignments.map((assignment) => (
                <option key={assignment.sppg_id} value={assignment.sppg_id}>
                  {assignment.sppg_code} | {assignment.sppg_name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Role: {currentRoles.join(", ") || "-"}</div>
          </div>
        </div>

        <nav style={{ display: "grid", gap: 6 }}>
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: active ? "#fff5ea" : "transparent",
                  border: active ? "1px solid #deb88d" : "1px solid transparent",
                  fontWeight: active ? 700 : 500
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button className="btn btn-secondary" onClick={logout} style={{ marginTop: 14, width: "100%" }}>
          Logout
        </button>
      </aside>

      {menuOpen ? <button className="app-overlay" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}

      <section className="app-content">{children}</section>
    </main>
  );
}
