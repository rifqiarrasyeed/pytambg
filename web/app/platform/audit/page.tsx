"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/core/client";

type Row = { id: string; action: string; entity: string; actorRole: string; createdAt: string };

export default function PlatformAuditPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiFetch<{ data: Row[] }>("/api/platform/audit-logs?page=1&page_size=50").then((res) => setRows(res.data));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Platform Audit Logs</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-2 text-sm">
            {row.action} · {row.entity} · {row.actorRole} · {new Date(row.createdAt).toLocaleString("id-ID")}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

