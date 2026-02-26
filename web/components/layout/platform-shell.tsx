"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, FileText, Shield, Users } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/platform/dashboard", label: "Dashboard", icon: Building2 },
  { href: "/platform/tenants", label: "Tenants", icon: Building2 },
  { href: "/platform/billing/plans", label: "Plans", icon: CreditCard },
  { href: "/platform/billing/invoices", label: "Invoices", icon: FileText },
  { href: "/platform/staff", label: "Staff", icon: Users },
  { href: "/platform/audit", label: "Audit", icon: Shield }
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="container-app flex h-14 items-center justify-between">
          <div>
            <p className="text-sm font-semibold">SPPG Ops Platform</p>
            <p className="text-xs text-muted-foreground">Internal Ops</p>
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
    </div>
  );
}

