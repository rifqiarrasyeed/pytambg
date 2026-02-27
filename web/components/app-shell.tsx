"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, Factory, FileText, Shield, Truck, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiClient } from "@/lib/api-client";
import { resolveAllowedDeliveryTab, resolveAllowedReportsTab, resolveRoleHomeRoute, roleHasMainRouteAccess, type MainRoute } from "@/lib/navigation";

type Assignment = { sppg_id: string; sppg_code: string; sppg_name: string; roles: string[]; is_default: boolean };

type AppShellProps = {
  assignments: Assignment[];
  activeSppgId: string | null;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: "Planning" | "Procurement" | "Inventory" | "Produksi" | "Distribusi" | "Laporan";
  roles: string[];
  icon: React.ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
  {
    href: "/planning",
    label: "Planning",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "NUTRITIONIST", "KITCHEN_PRODUCTION"],
    icon: UtensilsCrossed
  },
  {
    href: "/procurement",
    label: "Procurement",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"],
    icon: FileText
  },
  {
    href: "/inventory",
    label: "Inventory",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY"],
    icon: Boxes
  },
  {
    href: "/production",
    label: "Produksi",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "KITCHEN_PRODUCTION", "NUTRITIONIST"],
    icon: Factory
  },
  {
    href: "/delivery",
    label: "Distribusi",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "DRIVER", "SCHOOL_VERIFIER", "KITCHEN_PRODUCTION"],
    icon: Truck
  },
  {
    href: "/reports",
    label: "Laporan",
    roles: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER", "NUTRITIONIST", "INVENTORY", "KITCHEN_PRODUCTION"],
    icon: Shield
  }
];

export function AppShell({ assignments, activeSppgId, children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentRoles = useMemo(() => {
    const found = assignments.find((item) => item.sppg_id === activeSppgId);
    return found?.roles ?? [];
  }, [assignments, activeSppgId]);

  const visibleNav = useMemo(() => {
    if (currentRoles.includes("SUPER_ADMIN")) {
      return navItems;
    }
    return navItems.filter((item) => item.roles.some((role) => currentRoles.includes(role)));
  }, [currentRoles]);
  const homeRoute = useMemo(() => resolveRoleHomeRoute(currentRoles), [currentRoles]);
  const activeAssignment = useMemo(() => assignments.find((item) => item.sppg_id === activeSppgId) ?? null, [activeSppgId, assignments]);

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

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const mainRoutes: MainRoute[] = ["/planning", "/procurement", "/inventory", "/production", "/delivery", "/reports"];
    if (!mainRoutes.includes(pathname as MainRoute)) {
      return;
    }

    if (!roleHasMainRouteAccess(currentRoles, pathname as MainRoute)) {
      if (pathname !== homeRoute) {
        router.replace(homeRoute);
      }
      return;
    }

    if (pathname === "/delivery") {
      const requestedTab = searchParams.get("tab");
      const allowedTab = resolveAllowedDeliveryTab(currentRoles, requestedTab);
      if (requestedTab !== allowedTab) {
        router.replace(`/delivery?tab=${allowedTab}`);
      }
      return;
    }

    if (pathname === "/reports") {
      const requestedTab = searchParams.get("tab");
      const allowedTab = resolveAllowedReportsTab(currentRoles, requestedTab);
      if (requestedTab !== allowedTab) {
        router.replace(`/reports?tab=${allowedTab}`);
      }
    }
  }, [currentRoles, homeRoute, pathname, router, searchParams]);

  const logout = async () => {
    await apiClient("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <main className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
      <button className="mobile-nav-btn" data-testid="shell-toggle-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation">
        Menu
      </button>

      <aside className={`app-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-title">
          <strong>MBG Ops</strong>
          <small>Operasional Dapur SPPG</small>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 700 }}>
              SPPG Akun Aktif
            </label>
            <div className="status-badge status-neutral">
              {activeAssignment ? `${activeAssignment.sppg_code} | ${activeAssignment.sppg_name}` : "-"}
            </div>
            <div className="status-badge status-neutral">Role: {currentRoles.join(", ") || "-"}</div>
            {assignments.length > 1 ? <div className="badge badge-warn">Mode sederhana aktif: 1 SPPG per akun.</div> : null}
            <ThemeToggle />
          </div>
        </div>

        <nav className="nav-group">
          <h4>Menu Utama</h4>
          {visibleNav.map((item) => {
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

        <button className="btn btn-secondary icon-btn" data-testid="shell-logout" onClick={logout} style={{ width: "100%" }}>
          <Shield size={16} />
          <span>Logout</span>
        </button>
      </aside>

      {menuOpen ? <button className="app-overlay" data-testid="shell-close-menu" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}
      <section className="app-content">{children}</section>
    </main>
  );
}
