"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/core/client";

type Row = { id: string; invoiceNo: string; amount: string; status: string; tenantName: string };

export default function PlatformInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiFetch<{ data: Row[] }>("/api/platform/invoices?page=1&page_size=50").then((res) => setRows(res.data));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Invoice Logs</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-2 text-sm">
            <strong>{row.invoiceNo}</strong> · {row.tenantName} · {row.amount} · {row.status}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

