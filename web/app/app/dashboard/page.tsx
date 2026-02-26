"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/core/client";

type Summary = { tasks_today: number; open_disputes: number; pending_verifications: number; near_expiry_alerts: number };
type Kpi = { planned: number; produced: number; delivered: number; verified: number; waste_rate: number };
type Alert = { id: string; level: "info" | "warning" | "danger"; title: string; description: string };

export default function AppDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Summary>("/api/app/workspace/summary"),
      apiFetch<Kpi>("/api/app/workspace/kpi"),
      apiFetch<Alert[]>("/api/app/workspace/alerts")
    ])
      .then(([s, k, a]) => {
        setSummary(s);
        setKpi(k);
        setAlerts(a);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div>
        <h1 className="text-xl font-semibold">Dashboard Harian</h1>
        <p className="text-sm text-muted-foreground">Ringkasan operasional tenant aktif.</p>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Task Hari Ini</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.tasks_today ?? "-"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open Dispute</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.open_disputes ?? "-"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pending Verify</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.pending_verifications ?? "-"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Near Expiry</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.near_expiry_alerts ?? "-"}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>KPI Hari Ini</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-5 text-sm">
          <div>Planned: <strong>{kpi?.planned ?? 0}</strong></div>
          <div>Produced: <strong>{kpi?.produced ?? 0}</strong></div>
          <div>Delivered: <strong>{kpi?.delivered ?? 0}</strong></div>
          <div>Verified: <strong>{kpi?.verified ?? 0}</strong></div>
          <div>Waste: <strong>{kpi ? `${(kpi.waste_rate * 100).toFixed(2)}%` : "0%"}</strong></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada alert aktif.</p> : null}
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{alert.title}</p>
                <Badge variant={alert.level === "danger" ? "danger" : alert.level === "warning" ? "warning" : "info"}>{alert.level.toUpperCase()}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

