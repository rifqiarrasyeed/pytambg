"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/core/client";

type TenantRow = { id: string; code: string; name: string; subscriptionStatus: string; planName: string | null; lastActiveAt: string | null };

export default function PlatformDashboardPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    apiFetch<{ data: TenantRow[] }>("/api/platform/tenants?page=1&page_size=10").then((res) => setTenants(res.data));
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Platform Dashboard</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Ringkasan tenant dan billing.</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tenant Terbaru</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="rounded-md border border-border p-2 text-sm">
              <strong>{tenant.code}</strong> - {tenant.name} · {tenant.subscriptionStatus}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

