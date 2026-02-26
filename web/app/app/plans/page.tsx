"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/core/client";

type PlanRow = { id: string; planDate: string; status: string; menuSummary: string | null };

export default function PlansPage() {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [menuSummary, setMenuSummary] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ data: PlanRow[] }>("/api/app/daily-plans?page=1&page_size=30");
    setRows(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  const createPlan = async () => {
    await apiFetch("/api/app/daily-plans", {
      method: "POST",
      body: JSON.stringify({ planDate, menuSummary })
    });
    setMessage("Plan dibuat");
    setPlanDate("");
    setMenuSummary("");
    await load();
  };

  const approvePlan = async (id: string) => {
    await apiFetch(`/api/app/daily-plans/${id}/approve`, { method: "POST", body: JSON.stringify({ reason: "Approved by owner" }) });
    setMessage("Plan di-approve");
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Rencana Harian</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
          <Input value={menuSummary} onChange={(e) => setMenuSummary(e.target.value)} placeholder="Menu hari ini" />
          <Button onClick={createPlan} disabled={!planDate}>Tambah Plan</Button>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {loading ? <p className="text-sm">Loading...</p> : null}

      <Card>
        <CardHeader><CardTitle>Daftar Plan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{new Date(row.planDate).toLocaleDateString("id-ID")}</p>
                <p className="text-xs text-muted-foreground">{row.menuSummary ?? "-"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.status === "APPROVED" ? "success" : row.status === "LOCKED" ? "warning" : "outline"}>{row.status}</Badge>
                {row.status === "DRAFT" ? <Button size="sm" onClick={() => approvePlan(row.id)}>Approve</Button> : null}
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada data plan.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

