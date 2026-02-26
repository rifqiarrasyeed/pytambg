"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/core/client";

type TenantRow = { id: string; code: string; name: string; subscriptionStatus: string; planName: string | null; ownerEmail: string | null; lastActiveAt: string | null };

export default function PlatformTenantsPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);

  useEffect(() => {
    apiFetch<{ data: TenantRow[] }>("/api/platform/tenants?page=1&page_size=50").then((res) => setRows(res.data));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Daftar Tenant/Owner</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-3 text-sm">
            <p><strong>{row.code}</strong> - {row.name}</p>
            <p className="text-muted-foreground">Owner: {row.ownerEmail ?? "-"} · Plan: {row.planName ?? "-"} · Status: {row.subscriptionStatus}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

