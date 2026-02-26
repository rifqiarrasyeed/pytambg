import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="container-app py-10 space-y-6">
      <section className="grid gap-4 md:grid-cols-2 md:items-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">SPPG Ops SaaS</h1>
          <p className="text-muted-foreground">
            Platform operasional dapur SPPG: planning, produksi, distribusi, bukti terima, verifikasi, laporan, dan billing otomatis.
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/login">Masuk</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/pricing">Lihat Paket</Link>
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>MVP Fokus</CardTitle>
            <CardDescription>Audit-ready + Multi-tenant ketat</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>1. Tenant isolation wajib.</p>
            <p>2. Subscription gating read-only saat suspended.</p>
            <p>3. Midtrans webhook idempotent + signature verified.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
