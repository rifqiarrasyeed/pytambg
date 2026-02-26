"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Factory, Package, Settings, Truck, Users, CreditCard } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/app/plans", label: "Planning", icon: ClipboardList },
  { href: "/app/production", label: "Produksi", icon: Factory },
  { href: "/app/deliveries", label: "Distribusi", icon: Truck },
  { href: "/app/reports", label: "Laporan", icon: BarChart3 },
  { href: "/app/master", label: "Master", icon: Users },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings }
];

export function TenantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="container-app flex h-14 items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">SPPG Ops</p>
            <p className="text-xs text-muted-foreground">Tenant Console</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container-app grid gap-4 py-4 md:grid-cols-[220px_1fr]">
        <aside className="hidden md:block">
          <div className="rounded-lg border border-border bg-card p-2">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        <main className="space-y-4">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-card md:hidden">
        {nav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-2 text-[11px]",
                pathname === item.href ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

