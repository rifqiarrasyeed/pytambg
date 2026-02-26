"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/core/client";

type Row = { id: string; tenantName: string; amount: string; status: string; method: string | null };

export default function PlatformPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiFetch<{ data: Row[] }>("/api/platform/payments?page=1&page_size=50").then((res) => setRows(res.data));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Payment Logs</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-2 text-sm">
            {row.tenantName} · {row.amount} · {row.status} · {row.method ?? "-"}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

