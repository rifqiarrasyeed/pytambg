"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/core/client";

type UserRow = { id: string; email: string; name: string; roles: string[] };

export default function MasterUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const load = async () => {
    const res = await apiFetch<{ data: UserRow[] }>("/api/app/tenant-users?page=1&page_size=50");
    setRows(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    await apiFetch("/api/app/tenant-users", { method: "POST", body: JSON.stringify({ email, name, password, roles: ["TENANT_VIEWER"] }) });
    setEmail("");
    setName("");
    setPassword("");
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Users Tenant</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <Button onClick={create}>Tambah User</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-2 text-sm">
              <strong>{row.name}</strong> ({row.email}) · {row.roles.join(", ")}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

