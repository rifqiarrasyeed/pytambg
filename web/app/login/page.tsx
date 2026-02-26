"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("superadmin@mbg.local");
  const [password, setPassword] = useState("Passw0rd!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    let legacyReady = false;
    try {
      const legacyLogin = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      legacyReady = legacyLogin.ok;
    } catch {
      legacyReady = false;
    }

    if (legacyReady) {
      router.push("/planning");
      router.refresh();
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/app/dashboard"
    });

    if (!result || result.error) {
      setError("Login gagal. Cek email/password.");
      setLoading(false);
      return;
    }

    router.push(result.url ?? "/app/dashboard");
    router.refresh();
    setLoading(false);
  };

  return (
    <main className="container-app grid min-h-screen place-items-center py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Masuk SPPG Ops</CardTitle>
          <CardDescription>Gunakan akun tenant atau platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="login-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="login-password" className="text-sm font-medium">
                Password
              </label>
              <Input id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button disabled={loading} className="w-full" type="submit">
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

