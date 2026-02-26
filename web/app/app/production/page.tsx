"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/core/client";

type Production = { id: string; productionDate: string; status: string; producedPortions: number; plannedPortions: number; notes: string | null };

export default function ProductionPage() {
  const [rows, setRows] = useState<Production[]>([]);
  const [date, setDate] = useState("");
  const [portion, setPortion] = useState(0);
  const [note, setNote] = useState("");

  const load = async () => {
    const res = await apiFetch<{ data: Production[] }>("/api/app/productions?page=1&page_size=30");
    setRows(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    await apiFetch("/api/app/productions", {
      method: "POST",
      body: JSON.stringify({ productionDate: date, producedPortions: portion, notes: note })
    });
    setDate("");
    setPortion(0);
    setNote("");
    await load();
  };

  const markDone = async (id: string) => {
    await apiFetch("/api/app/productions", {
      method: "PATCH",
      body: JSON.stringify({ id, status: "DONE" })
    });
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Produksi Harian</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="number" value={portion} onChange={(e) => setPortion(Number(e.target.value))} placeholder="Porsi jadi" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan" />
          <Button onClick={create} disabled={!date}>Simpan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Log Produksi</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{new Date(row.productionDate).toLocaleDateString("id-ID")}</p>
                <p className="text-xs text-muted-foreground">{row.producedPortions} / {row.plannedPortions} porsi</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.status === "DONE" ? "success" : row.status === "IN_PROGRESS" ? "warning" : "outline"}>{row.status}</Badge>
                {row.status !== "DONE" ? <Button size="sm" onClick={() => markDone(row.id)}>Set Done</Button> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

