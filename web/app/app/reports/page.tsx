"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/core/client";

type Kpi = { planned: number; produced: number; delivered: number; verified: number; waste_rate: number };
type Audit = { id: string; entity: string; action: string; actorRole: string; createdAt: string };

export default function ReportsPage() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<Kpi>("/api/app/reports/kpi"),
      apiFetch<{ data: Audit[] }>("/api/app/audit-logs?page=1&page_size=20")
    ]).then(([k, a]) => {
      setKpi(k);
      setAudits(a.data);
    });
  }, []);

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Laporan & Advanced</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">KPI harian, audit trail, settings, master data, dan panel lanjutan.</CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="master">Master</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>KPI</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-5 text-sm">
              <div>Planned: <strong>{kpi?.planned ?? 0}</strong></div>
              <div>Produced: <strong>{kpi?.produced ?? 0}</strong></div>
              <div>Delivered: <strong>{kpi?.delivered ?? 0}</strong></div>
              <div>Verified: <strong>{kpi?.verified ?? 0}</strong></div>
              <div>Waste: <strong>{kpi ? `${(kpi.waste_rate * 100).toFixed(2)}%` : "0%"}</strong></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit">
          <Card>
            <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {audits.map((row) => (
                <div key={row.id} className="rounded-md border border-border p-2 text-sm">
                  <span className="font-medium">{row.entity}</span> · {row.action} · {row.actorRole}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings"><Card><CardContent className="p-4 text-sm">Kelola tenant profile, lock policy, dan konfigurasi module.</CardContent></Card></TabsContent>
        <TabsContent value="master"><Card><CardContent className="p-4 text-sm">Master data tersedia di menu Master (schools/routes/users).</CardContent></Card></TabsContent>
        <TabsContent value="incidents"><Card><CardContent className="p-4 text-sm">Incident & waste log untuk compliance.</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

