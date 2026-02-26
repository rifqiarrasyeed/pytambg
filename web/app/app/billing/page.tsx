"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/core/client";

type Plan = { id: string; code: string; name: string; price: string; interval: string };
type Subscription = { status: string; planName: string; graceUntil: string | null };

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [p, s] = await Promise.all([
      apiFetch<Plan[]>("/api/billing/plans"),
      apiFetch<Subscription>("/api/billing/subscription")
    ]);
    setPlans(p);
    setSubscription(s);
  };

  useEffect(() => {
    load();
  }, []);

  const subscribe = async (planId: string) => {
    const res = await apiFetch<{ redirectUrl: string | null; snapToken: string | null }>("/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ planId })
    });

    setMessage(res.redirectUrl ? `Lanjutkan pembayaran di: ${res.redirectUrl}` : "Subscription intent dibuat.");
    await load();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <Card>
        <CardHeader><CardTitle>Status Subscription</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-2 text-sm">
          <Badge variant={subscription?.status === "ACTIVE" ? "success" : subscription?.status === "PAST_DUE" ? "warning" : "danger"}>
            {subscription?.status ?? "-"}
          </Badge>
          <span>{subscription?.planName ?? "Belum berlangganan"}</span>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader><CardTitle>{plan.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Harga: {plan.price} / {plan.interval}</p>
              <Button className="w-full" onClick={() => subscribe(plan.id)}>Subscribe</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

