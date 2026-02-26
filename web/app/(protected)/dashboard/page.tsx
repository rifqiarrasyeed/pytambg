"use client";

import { Activity, CalendarDays, Lock, RefreshCw, Scale, Truck, Utensils, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell } from "@/components/chart-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/feedback-states";
import { apiClient, readData } from "@/lib/api-client";
import type { KpiTrendResponse, PaginatedResponse } from "@/lib/contracts";

type KpiDaily = {
  date: string;
  planned: number;
  produced: number;
  delivered: number;
  verified: number;
  delivered_rate: number;
  verified_rate: number;
  waste_rate: number;
};

type PeriodLock = {
  period_date: string;
  status: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function minusDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [kpi, setKpi] = useState<KpiDaily | null>(null);
  const [locks, setLocks] = useState<PeriodLock[]>([]);
  const [trend, setTrend] = useState<KpiTrendResponse["series"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [periodDate, setPeriodDate] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const [dateFrom, setDateFrom] = useState(minusDaysIso(13));
  const [dateTo, setDateTo] = useState(todayIso());

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [kpiData, locksData, trendData] = await Promise.all([
        apiClient<KpiDaily>("/api/proxy/reports/kpi"),
        apiClient<PaginatedResponse<PeriodLock>>("/api/proxy/period-locks?page=1&page_size=15"),
        apiClient<KpiTrendResponse>(`/api/proxy/reports/kpi-trend?date_from=${dateFrom}&date_to=${dateTo}&granularity=day`)
      ]);
      setKpi(kpiData);
      setLocks(readData<PeriodLock>(locksData));
      setTrend(trendData.series ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dashboard");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockPeriod = async () => {
    if (!periodDate) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/period-locks/${periodDate}/lock`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal lock period");
    } finally {
      setBusy(false);
    }
  };

  const unlockPeriod = async () => {
    if (!periodDate) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/period-locks/${periodDate}/unlock`, {
        method: "POST",
        body: JSON.stringify({ reason: unlockReason || "Revisi operasional" })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal unlock period");
    } finally {
      setBusy(false);
    }
  };

  const kpiChips = useMemo(() => {
    if (!kpi) return null;
    return (
      <>
        <span className="status-badge status-neutral">
          <CalendarDays size={14} />
          <span>{kpi.date}</span>
        </span>
        <span className="status-badge status-warn">
          <Scale size={14} />
          <span>Waste {(kpi.waste_rate * 100).toFixed(1)}%</span>
        </span>
      </>
    );
  }, [kpi]);

  return (
    <div className="page">
      <PageHeader
        title="Dashboard Operasional"
        subtitle="Monitoring planned vs produced vs delivered vs verified lintas aktivitas harian."
        icon={Activity}
        actions={
          <button className="btn btn-secondary icon-btn" onClick={() => load()} disabled={busy}>
            <RefreshCw size={16} />
            <span>{busy ? "Muat..." : "Refresh"}</span>
          </button>
        }
        chips={kpiChips}
      />

      <ErrorState message={error} />

      <section className="panel">
        <div className="panel-body metric-grid">
          <StatCard label="Planned" value={kpi?.planned ?? 0} icon={Utensils} />
          <StatCard label="Produced" value={kpi?.produced ?? 0} icon={Activity} />
          <StatCard label="Delivered" value={kpi?.delivered ?? 0} icon={Truck} hint={`${((kpi?.delivered_rate ?? 0) * 100).toFixed(1)}%`} />
          <StatCard label="Verified" value={kpi?.verified ?? 0} icon={Scale} hint={`${((kpi?.verified_rate ?? 0) * 100).toFixed(1)}%`} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div className="page-title-wrap">
            <div className="page-title-row">
              <Activity size={18} className="page-title-icon" />
              <h3>Trend KPI Harian</h3>
            </div>
            <p>Grafik planned/produced/delivered untuk analisis performa operasional.</p>
          </div>
        </div>
        <div className="panel-body" style={{ display: "grid", gap: 12 }}>
          <div className="grid-3">
            <label>
              Dari
              <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              Sampai
              <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <div className="action-row" style={{ alignItems: "end" }}>
              <button className="btn btn-primary icon-btn" onClick={() => load()} disabled={busy}>
                <RefreshCw size={16} />
                <span>Terapkan</span>
              </button>
            </div>
          </div>
          <ChartShell minHeight={300}>
            {({ width, height }) => (
              <AreaChart width={width} height={height} data={trend}>
                <defs>
                  <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="deliveredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="planned" stroke="var(--brand)" fill="url(#plannedGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="delivered" stroke="var(--success)" fill="url(#deliveredGrad)" strokeWidth={2} />
              </AreaChart>
            )}
          </ChartShell>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div className="page-title-wrap">
            <div className="page-title-row">
              <Lock size={18} className="page-title-icon" />
              <h3>Lock Period</h3>
            </div>
            <p>Kunci periode operasional setelah review. Unlock hanya dengan alasan.</p>
          </div>
        </div>
        <div className="panel-body" style={{ display: "grid", gap: 12 }}>
          <div className="grid-3">
            <label>
              Tanggal Periode
              <input className="input" type="date" value={periodDate} onChange={(event) => setPeriodDate(event.target.value)} />
            </label>
            <label>
              Alasan Unlock
              <input className="input" value={unlockReason} onChange={(event) => setUnlockReason(event.target.value)} placeholder="Wajib saat unlock" />
            </label>
            <div className="mobile-sticky-actions">
              <button className="btn btn-secondary icon-btn" onClick={lockPeriod} disabled={busy || !periodDate}>
                <Lock size={16} />
                <span>Lock</span>
              </button>
              <button className="btn btn-secondary icon-btn" onClick={unlockPeriod} disabled={busy || !periodDate}>
                <Unlock size={16} />
                <span>Unlock</span>
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
                        <StatusBadge value={row.status} />
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
