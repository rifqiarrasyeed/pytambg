"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/core/client";

type Delivery = { id: string; manifestNo: string; status: string; plannedDeparture: string | null };
type VerificationRow = { stopId: string; schoolName: string; status: string; plannedPortions: number; deliveredPortions: number };
type Dispute = { id: string; status: string; reason: string; stopId: string };

export default function DeliveriesPage() {
  const [manifestNo, setManifestNo] = useState("");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [verificationQueue, setVerificationQueue] = useState<VerificationRow[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const load = async () => {
    const [d, v, q] = await Promise.all([
      apiFetch<{ data: Delivery[] }>("/api/app/deliveries?page=1&page_size=30"),
      apiFetch<{ data: VerificationRow[] }>("/api/app/deliveries?view=verification"),
      apiFetch<{ data: Dispute[] }>("/api/app/deliveries?view=disputes")
    ]);

    setDeliveries(d.data);
    setVerificationQueue(v.data);
    setDisputes(q.data);
  };

  useEffect(() => {
    load();
  }, []);

  const createManifest = async () => {
    await apiFetch("/api/app/deliveries", {
      method: "POST",
      body: JSON.stringify({ manifestNo })
    });
    setManifestNo("");
    await load();
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch("/api/app/deliveries", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    });
    await load();
  };

  const verifyStop = async (stopId: string) => {
    await apiFetch(`/api/app/deliveries/${stopId}/verify`, {
      method: "POST",
      headers: { "Idempotency-Key": `verify-${stopId}-${Date.now()}` },
      body: JSON.stringify({ result: "VERIFIED", receivedPortions: 100 })
    });
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Distribusi</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input value={manifestNo} onChange={(e) => setManifestNo(e.target.value)} placeholder="Manifest No (opsional, auto jika kosong)" />
          <Button onClick={createManifest}>Buat Manifest</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="manifest" className="space-y-3">
        <TabsList>
          <TabsTrigger value="manifest">Manifest</TabsTrigger>
          <TabsTrigger value="verification">Verification Queue</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
        </TabsList>

        <TabsContent value="manifest">
          <Card>
            <CardHeader><CardTitle>Daftar Manifest</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {deliveries.map((row) => (
                <div key={row.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{row.manifestNo}</p>
                    <p className="text-xs text-muted-foreground">{row.plannedDeparture ? new Date(row.plannedDeparture).toLocaleString("id-ID") : "Belum dijadwalkan"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === "VERIFIED" ? "success" : row.status === "DISPUTED" ? "warning" : "outline"}>{row.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, "IN_TRANSIT")}>IN_TRANSIT</Button>
                    <Button size="sm" onClick={() => updateStatus(row.id, "DELIVERED")}>DELIVERED</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardHeader><CardTitle>Queue Verifikasi Sekolah</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {verificationQueue.map((row) => (
                <div key={row.stopId} className="rounded-md border border-border p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{row.schoolName}</p>
                    <p className="text-xs text-muted-foreground">planned {row.plannedPortions}, delivered {row.deliveredPortions}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === "VERIFIED" ? "success" : "outline"}>{row.status}</Badge>
                    {row.status !== "VERIFIED" ? <Button size="sm" onClick={() => verifyStop(row.stopId)}>Verify</Button> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes">
          <Card>
            <CardHeader><CardTitle>Daftar Dispute</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {disputes.map((row) => (
                <div key={row.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Dispute #{row.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{row.reason}</p>
                  </div>
                  <Badge variant={row.status === "RESOLVED" ? "success" : "warning"}>{row.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

