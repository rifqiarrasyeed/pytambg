"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/core/client";

type RouteRow = { id: string; code: string; name: string };

export default function MasterRoutesPage() {
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const load = async () => {
    const res = await apiFetch<{ data: RouteRow[] }>("/api/app/routes?page=1&page_size=50");
    setRows(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    await apiFetch("/api/app/routes", { method: "POST", body: JSON.stringify({ code, name }) });
    setCode("");
    setName("");
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Master Rute</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama rute" />
          <Button onClick={create}>Tambah</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-2">
          {rows.map((row) => <div key={row.id} className="rounded-md border border-border p-2 text-sm"><strong>{row.code}</strong> - {row.name}</div>)}
        </CardContent>
      </Card>
    </div>
  );
}

