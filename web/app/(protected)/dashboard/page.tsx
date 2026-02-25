"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type Kpi = {
  date: string;
  planned: number;
  produced: number;
  delivered: number;
  verified: number;
  delivered_rate: number;
  verified_rate: number;
  waste_rate: number;
};

export default function DashboardPage() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [locks, setLocks] = useState<Array<{ period_date: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [periodDate, setPeriodDate] = useState("");
  const [unlockReason, setUnlockReason] = useState("");

  const load = async () => {
    try {
      const [kpiData, locksData] = await Promise.all([
        apiClient<Kpi>("/api/proxy/reports/kpi"),
        apiClient<{ data: Array<{ period_date: string; status: string }> }>("/api/proxy/period-locks")
      ]);
      setKpi(kpiData);
      setLocks(locksData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dashboard");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const lockPeriod = async () => {
    if (!periodDate) return;
    try {
      await apiClient(`/api/proxy/period-locks/${periodDate}/lock`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal lock period");
    }
  };

  const unlockPeriod = async () => {
    if (!periodDate) return;
    try {
      await apiClient(`/api/proxy/period-locks/${periodDate}/unlock`, {
        method: "POST",
        body: JSON.stringify({ reason: unlockReason || "Revisi operasional" })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal unlock period");
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 24 }}>Dashboard Operasional</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>KPI harian, lock period, dan alert discrepancy</div>
          </div>
          <button className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <div className="card-body">
          {error ? <div className="badge badge-danger">{error}</div> : null}
          <div className="grid-3">
            <div className="card kpi">
              <h3>Planned</h3>
              <p>{kpi?.planned ?? 0}</p>
            </div>
            <div className="card kpi">
              <h3>Produced</h3>
              <p>{kpi?.produced ?? 0}</p>
            </div>
            <div className="card kpi">
              <h3>Delivered</h3>
              <p>{kpi?.delivered ?? 0}</p>
            </div>
            <div className="card kpi">
              <h3>Verified</h3>
              <p>{kpi?.verified ?? 0}</p>
            </div>
            <div className="card kpi">
              <h3>Delivered Rate</h3>
              <p>{Math.round((kpi?.delivered_rate ?? 0) * 100)}%</p>
            </div>
            <div className="card kpi">
              <h3>Waste Rate</h3>
              <p>{Math.round((kpi?.waste_rate ?? 0) * 100)}%</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Status Lock Period</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div className="grid-3">
            <label>
              Tanggal Periode
              <input className="input" type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
            </label>
            <label>
              Alasan Unlock
              <input className="input" value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <button className="btn btn-secondary" onClick={lockPeriod}>
                Lock
              </button>
              <button className="btn btn-secondary" onClick={unlockPeriod}>
                Unlock
              </button>
            </div>
          </div>
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {locks.length === 0 ? (
                <tr>
                  <td colSpan={2}>Belum ada lock period.</td>
                </tr>
              ) : (
                locks.map((row) => (
                  <tr key={row.period_date}>
                    <td>{row.period_date}</td>
                    <td>
                      <span className={row.status === "LOCKED" || row.status === "RELOCKED" ? "badge badge-ok" : "badge badge-neutral"}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}
