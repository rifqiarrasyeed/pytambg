"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, ClipboardCheck, Factory, FileText, History, LayoutDashboard, Route, Settings2, Shield, Siren, Truck, UsersRound, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";

type Assignment = { sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean };

type AppShellProps = {
  assignments: Assignment[];
  activeSppgId: string | null;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  section: "operasional" | "master" | "kontrol";
  roles: string[];
  permissions: string[];
  icon: React.ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"], permissions: ["report.view"], icon: LayoutDashboard },
  { href: "/planning", label: "Planning", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "NUTRITIONIST"], permissions: ["planning.write", "planning.approve"], icon: UtensilsCrossed },
  { href: "/procurement", label: "Procurement", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"], permissions: ["procurement.write", "procurement.approve", "receipt.post"], icon: FileText },
  { href: "/inventory", label: "Inventory", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"], permissions: ["inventory.write", "inventory.approve"], icon: Boxes },
  { href: "/production", label: "Production", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "KITCHEN_PRODUCTION"], permissions: ["production.write", "production.finalize"], icon: Factory },
  { href: "/delivery", label: "Delivery", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "DRIVER"], permissions: ["delivery.manage", "delivery.update_status"], icon: Truck },
  { href: "/verification", label: "Verification", section: "operasional", roles: ["SUPER_ADMIN", "SCHOOL_VERIFIER"], permissions: ["delivery.verify"], icon: ClipboardCheck },
  { href: "/disputes", label: "Disputes", section: "operasional", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "SCHOOL_VERIFIER"], permissions: ["dispute.manage"], icon: Shield },

  { href: "/master-data", label: "Master Data", section: "master", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY", "NUTRITIONIST"], permissions: ["master.read", "master.write"], icon: Route },
  { href: "/sppg-admin", label: "Admin Pusat", section: "master", roles: ["SUPER_ADMIN"], permissions: ["sppg.manage", "assignment.manage"], icon: UsersRound },
  { href: "/settings", label: "Settings", section: "master", roles: ["SUPER_ADMIN", "ADMIN_SPPG"], permissions: ["master.write"], icon: Settings2 },

  { href: "/reports", label: "Reports", section: "kontrol", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"], permissions: ["report.view"], icon: FileText },
  { href: "/audit", label: "Audit", section: "kontrol", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"], permissions: ["audit.view"], icon: History },
  { href: "/incidents", label: "Incident/Waste", section: "kontrol", roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"], permissions: ["inventory.write", "delivery.manage"], icon: Siren }
];

function sectionTitle(section: NavItem["section"]): string {
  if (section === "operasional") return "Operasional";
  if (section === "master") return "Master";
  return "Kontrol & Audit";
}

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
    const byRole = currentRoles.includes("SUPER_ADMIN")
      ? navItems
      : navItems.filter((item) => item.roles.some((role) => currentRoles.includes(role)));
    if (!permissions || currentRoles.includes("SUPER_ADMIN")) {
      return byRole;
    }
    return byRole.filter((item) => item.permissions.length === 0 || item.permissions.some((perm) => permissions.includes(perm)));
  }, [currentRoles, permissions]);

  const navBySection = useMemo(() => {
    const grouped: Record<NavItem["section"], NavItem[]> = { operasional: [], master: [], kontrol: [] };
    for (const item of visibleNav) {
      grouped[item.section].push(item);
    }
    return grouped;
  }, [visibleNav]);

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

  useEffect(() => {
    const tableSelector = "table.table";
    const applyLabels = () => {
      const tables = document.querySelectorAll<HTMLTableElement>(tableSelector);
      tables.forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => (cell.textContent ?? "").trim());
        const rows = table.querySelectorAll("tbody tr");
        rows.forEach((row) => {
          const cells = row.querySelectorAll("td");
          cells.forEach((cell, index) => {
            if (!cell.getAttribute("data-label")) {
              cell.setAttribute("data-label", headers[index] ?? `Kolom ${index + 1}`);
            }
          });
        });
      });
    };

    const observer = new MutationObserver(() => {
      applyLabels();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    applyLabels();

    return () => observer.disconnect();
  }, [pathname]);

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
        Menu
      </button>

      <aside className={`app-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-title">
          <strong>MBG Ops</strong>
          <small>Industrial Kitchen Console</small>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 700 }}>SPPG Aktif</label>
            <select
              className="select"
              value={activeSppgId ?? ""}
              onChange={(event) => switchTenant(event.target.value)}
              disabled={switching || assignments.length === 0}
            >
              {assignments.map((assignment) => (
                <option key={assignment.sppg_id} value={assignment.sppg_id}>
                  {assignment.sppg_code} | {assignment.sppg_name}
                </option>
              ))}
            </select>
            <div className="status-badge status-neutral">Role: {currentRoles.join(", ") || "-"}</div>
            <ThemeToggle />
          </div>
        </div>

        {(["operasional", "master", "kontrol"] as const).map((section) =>
          navBySection[section].length > 0 ? (
            <nav className="nav-group" key={section}>
              <h4>{sectionTitle(section)}</h4>
              {navBySection[section].map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link className={`nav-link ${active ? "active" : ""}`} key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null
        )}

        <button className="btn btn-secondary icon-btn" onClick={logout} style={{ width: "100%" }}>
          <Shield size={16} />
          <span>Logout</span>
        </button>
      </aside>

      {menuOpen ? <button className="app-overlay" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}
      <section className="app-content">{children}</section>
    </main>
  );
}
