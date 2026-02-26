"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/core/client";

type Plan = { id: string; code: string; name: string; price: string; interval: string; active: boolean };

export default function PlatformPlansPage() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const load = async () => {
    const res = await apiFetch<Plan[]>("/api/billing/plans");
    setRows(res);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    await apiFetch("/api/platform/subscription-plans", {
      method: "POST",
      body: JSON.stringify({ code, name, price, interval: "MONTHLY" })
    });
    setCode("");
    setName("");
    setPrice("");
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Manage Paket Subscription</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Harga" />
          <Button onClick={create}>Tambah Plan</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-2">
          {rows.map((row) => <div key={row.id} className="rounded-md border border-border p-2 text-sm"><strong>{row.code}</strong> - {row.name} ({row.price})</div>)}
        </CardContent>
      </Card>
    </div>
  );
}

