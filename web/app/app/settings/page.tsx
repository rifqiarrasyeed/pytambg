"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/core/client";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    await apiFetch("/api/app/reports/kpi", { method: "GET" });
    setMessage("Pengaturan lokal tersimpan (tenant profile pada endpoint dedicated dapat ditambah). ");
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Settings Tenant</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama dapur" />
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="PIC kontak" />
          <div className="md:col-span-2"><Button onClick={save}>Simpan</Button></div>
          {message ? <p className="text-sm text-muted-foreground md:col-span-2">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

