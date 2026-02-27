"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, ClipboardList, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient } from "@/lib/api-client";
import type { QaIntegrityResponse, ReportsTab, WorkspaceAlert, WorkspaceSummaryResponse } from "@/lib/contracts";
import { hasAccessToReportsTab, resolveAllowedReportsTab } from "@/lib/navigation";
import { useSessionContext } from "@/lib/use-session-context";
import AuditPage from "../audit/page";
import IncidentsPage from "../incidents/page";
import MasterDataPage from "../master-data/page";
import SettingsPage from "../settings/page";
import SppgAdminPage from "../sppg-admin/page";

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

type Job = {
  id: string;
  report_type: string;
  format: string;
  status: string;
  result_attachment_id: string | null;
  error_message: string | null;
  created_at: string;
};

const tabs: Array<{ key: ReportsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "audit", label: "Audit" },
  { key: "settings", label: "Settings" },
  { key: "master", label: "Master Data" },
  { key: "admin", label: "Admin Pusat" },
  { key: "incidents", label: "Incidents/Waste" }
];

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { roles, loaded } = useSessionContext();

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummaryResponse | null>(null);
  const [alerts, setAlerts] = useState<WorkspaceAlert[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [integrity, setIntegrity] = useState<QaIntegrityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [exportForm, setExportForm] = useState({
    report_type: "KPI_DAILY",
    date_from: "",
    date_to: "",
    format: "CSV"
  });

  const requestedTab = searchParams.get("tab");
  const activeTab = resolveAllowedReportsTab(roles, requestedTab);

  const visibleTabs = useMemo(() => tabs.filter((tab) => hasAccessToReportsTab(roles, tab.key)), [roles]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (requestedTab !== activeTab) {
      router.replace(`/reports?tab=${activeTab}`);
    }
  }, [activeTab, loaded, requestedTab, router]);

  const loadOverview = async () => {
    try {
      const [kpiData, summaryData, alertsData, jobsData] = await Promise.all([
        apiClient<Kpi>("/api/proxy/workspace/kpi"),
        apiClient<WorkspaceSummaryResponse>("/api/proxy/workspace/summary"),
        apiClient<{ data: WorkspaceAlert[] }>("/api/proxy/workspace/alerts"),
        apiClient<{ data: Job[] }>("/api/proxy/reports/jobs")
      ]);
      setKpi(kpiData);
      setSummary(summaryData);
      setAlerts(alertsData.data ?? []);
      setJobs(jobsData.data ?? []);
      try {
        const integrityData = await apiClient<QaIntegrityResponse>("/api/proxy/qa/health-integrity");
        setIntegrity(integrityData);
      } catch {
        setIntegrity(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load laporan");
    }
  };

  useEffect(() => {
    if (activeTab === "overview") {
      void loadOverview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const createExport = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/reports/export", {
        method: "POST",
        body: JSON.stringify(exportForm)
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create export");
    } finally {
      setBusy(false);
    }
  };

  const getSignedUrl = async (attachmentId: string) => {
    try {
      const data = await apiClient<{ signed_url: string }>(`/api/proxy/attachments/${attachmentId}/signed-url?expires_in_seconds=300`);
      setDownloadUrl(data.signed_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate signed URL");
    }
  };

  const openTab = (tab: ReportsTab) => {
    router.replace(`/reports?tab=${tab}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Laporan"
        subtitle="Overview operasional + advanced governance dalam tab terpusat."
        icon={BarChart3}
        actions={
          <button className="btn btn-secondary icon-btn" data-testid="reports-refresh" onClick={() => (activeTab === "overview" ? loadOverview() : router.refresh())}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
        chips={<span className="status-badge status-neutral">Tab aktif: {activeTab}</span>}
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Reports Console</strong>
        </div>
        <div className="card-body">
          <div className="action-row" style={{ flexWrap: "wrap" }}>
            {visibleTabs.map((tab) => (
              <button key={tab.key} data-testid={`reports-tab-${tab.key}`} className={activeTab === tab.key ? "btn btn-primary" : "btn btn-secondary"} onClick={() => openTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <>
          <section className="card">
            <div className="card-header">
              <strong>KPI Hari Ini</strong>
              <button className="btn btn-secondary" data-testid="reports-load-kpi" onClick={() => loadOverview()}>
                Muat KPI
              </button>
            </div>
            <div className="card-body">
              <div className="grid-3">
                <div className="card kpi"><h3>Planned</h3><p>{kpi?.planned ?? 0}</p></div>
                <div className="card kpi"><h3>Produced</h3><p>{kpi?.produced ?? 0}</p></div>
                <div className="card kpi"><h3>Delivered</h3><p>{kpi?.delivered ?? 0}</p></div>
                <div className="card kpi"><h3>Verified</h3><p>{kpi?.verified ?? 0}</p></div>
                <div className="card kpi"><h3>Verified Rate</h3><p>{Math.round((kpi?.verified_rate ?? 0) * 100)}%</p></div>
                <div className="card kpi"><h3>Waste Rate</h3><p>{Math.round((kpi?.waste_rate ?? 0) * 100)}%</p></div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <strong>Ringkasan Tugas Harian</strong>
              <small style={{ color: "var(--muted)" }}>{summary?.date ?? "-"}</small>
            </div>
            <div className="card-body">
              <div className="grid-3">
                <div className="card kpi"><h3>Planning Pending</h3><p>{summary?.counters.planning_pending ?? 0}</p></div>
                <div className="card kpi"><h3>PO Pending</h3><p>{summary?.counters.po_pending ?? 0}</p></div>
                <div className="card kpi"><h3>Produksi Aktif</h3><p>{summary?.counters.production_active ?? 0}</p></div>
                <div className="card kpi"><h3>Delivery Aktif</h3><p>{summary?.counters.delivery_active ?? 0}</p></div>
                <div className="card kpi"><h3>Menunggu Verifikasi</h3><p>{summary?.counters.verification_pending ?? 0}</p></div>
                <div className="card kpi"><h3>Dispute Open</h3><p>{summary?.counters.disputes_open ?? 0}</p></div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} />
                Alert Operasional
              </strong>
            </div>
            <div className="card-body">
              {alerts.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>Tidak ada alert aktif.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Jenis</th>
                        <th>Severity</th>
                        <th>Deskripsi</th>
                        <th>Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert) => (
                        <tr key={alert.kind}>
                          <td>{alert.kind}</td>
                          <td><StatusBadge value={alert.severity} /></td>
                          <td>{alert.title}</td>
                          <td>{alert.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ClipboardList size={16} />
                Integrity Health
              </strong>
              <StatusBadge value={integrity ? (integrity.ok ? "SUCCEEDED" : "FAILED") : "N/A"} />
            </div>
            <div className="card-body">
              <div className="grid-3">
                <div className="card kpi"><h3>RLS Missing</h3><p>{integrity?.checks.rls_missing_count ?? "-"}</p></div>
                <div className="card kpi"><h3>Policy Missing</h3><p>{integrity?.checks.deny_policy_missing_count ?? "-"}</p></div>
                <div className="card kpi"><h3>Trigger Missing</h3><p>{integrity?.checks.required_trigger_missing_count ?? "-"}</p></div>
                <div className="card kpi"><h3>Ledger Delta</h3><p>{integrity?.checks.stock_mv_mismatch_count ?? "-"}</p></div>
                <div className="card kpi"><h3>Attachment Mismatch</h3><p>{integrity?.checks.attachment_tenant_mismatch_count ?? "-"}</p></div>
                <div className="card kpi"><h3>Leaked Grants</h3><p>{integrity?.checks.leaked_grants_count ?? "-"}</p></div>
              </div>
              <small style={{ color: "var(--muted)" }}>
                Checked at: {integrity?.checked_at ? new Date(integrity.checked_at).toLocaleString("id-ID") : "-"}
              </small>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <strong>Export Reports</strong>
            </div>
            <form className="card-body" onSubmit={createExport} style={{ display: "grid", gap: 10 }}>
              <div className="grid-3">
                <label>
                  Report Type
                  <select className="select" value={exportForm.report_type} onChange={(e) => setExportForm({ ...exportForm, report_type: e.target.value })}>
                    <option>KPI_DAILY</option>
                    <option>AUDIT_PACK</option>
                    <option>STOCK_LEDGER</option>
                  </select>
                </label>
                <label>
                  Date From
                  <input className="input" type="date" value={exportForm.date_from} onChange={(e) => setExportForm({ ...exportForm, date_from: e.target.value })} required />
                </label>
                <label>
                  Date To
                  <input className="input" type="date" value={exportForm.date_to} onChange={(e) => setExportForm({ ...exportForm, date_to: e.target.value })} required />
                </label>
                <label>
                  Format
                  <select className="select" value={exportForm.format} onChange={(e) => setExportForm({ ...exportForm, format: e.target.value })}>
                    <option>CSV</option>
                    <option>PDF</option>
                    <option>XLSX</option>
                  </select>
                </label>
              </div>
              <button className="btn btn-primary" data-testid="reports-generate-export" type="submit" disabled={busy}>
                Generate Export
              </button>
              {downloadUrl ? (
                <a className="btn btn-secondary" href={downloadUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", width: "fit-content" }}>
                  Download Last Signed URL
                </a>
              ) : null}
            </form>
          </section>

          <section className="card">
            <div className="card-header">
              <strong>Jobs</strong>
            </div>
            <div className="card-body table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Attachment</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        {job.id.slice(0, 8)}
                        <br />
                        <small>{new Date(job.created_at).toLocaleString("id-ID")}</small>
                      </td>
                      <td>{job.report_type}</td>
                      <td>
                        <StatusBadge value={job.status} />
                      </td>
                      <td>
                        {job.result_attachment_id ? (
                          <button className="btn btn-secondary" data-testid="reports-job-signed-url" onClick={() => getSignedUrl(job.result_attachment_id!)}>
                            Signed URL
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{job.error_message ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "audit" ? <AuditPage /> : null}
      {activeTab === "settings" ? <SettingsPage /> : null}
      {activeTab === "master" ? <MasterDataPage /> : null}
      {activeTab === "admin" ? <SppgAdminPage /> : null}
      {activeTab === "incidents" ? <IncidentsPage /> : null}
    </div>
  );
}
