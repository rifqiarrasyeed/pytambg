"use client";

import { KeyRound, LogIn } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px"
      }}
    >
      <section className="card" style={{ width: "100%", maxWidth: 420 }}>
        <div className="card-header">
          <strong style={{ fontFamily: "var(--font-heading)", fontSize: 20, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <LogIn size={18} />
            MBG Ops Login
          </strong>
          <span className="status-badge status-neutral">SPPG</span>
        </div>
        <form className="card-body" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label>
            Email
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <div className="status-badge status-danger">{error}</div> : null}
          <button className="btn btn-primary icon-btn" type="submit" disabled={loading}>
            <KeyRound size={16} />
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}
