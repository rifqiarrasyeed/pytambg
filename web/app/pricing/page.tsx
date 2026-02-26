import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const plans = [
  { name: "Starter", price: "Rp 499.000", interval: "bulanan", features: ["3 user", "10 sekolah", "500 delivery"] },
  { name: "Growth", price: "Rp 999.000", interval: "bulanan", features: ["10 user", "30 sekolah", "2.000 delivery"] },
  { name: "Enterprise", price: "Custom", interval: "kontrak", features: ["Unlimited", "SLA khusus", "Support prioritas"] }
];

export default function PricingPage() {
  return (
    <main className="container-app py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pricing SPPG Ops</h1>
        <p className="text-sm text-muted-foreground">Pembayaran via Midtrans Snap + recurring support.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                <span className="text-xl font-bold text-foreground">{plan.price}</span> / {plan.interval}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.features.map((feature) => (
                <Badge key={feature} variant="outline" className="mr-2 mb-2">
                  {feature}
                </Badge>
              ))}
              <div>
                <Button className="w-full">Subscribe</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

