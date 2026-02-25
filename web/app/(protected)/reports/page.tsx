"use client";

import { BarChart3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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

type Job = {
  id: string;
  report_type: string;
  format: string;
  status: string;
  result_attachment_id: string | null;
  error_message: string | null;
  created_at: string;
};

export default function ReportsPage() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [kpiDate, setKpiDate] = useState("");
  const [exportForm, setExportForm] = useState({
    report_type: "KPI_DAILY",
    date_from: "",
    date_to: "",
    format: "CSV"
  });

  const load = async () => {
    try {
      const [kpiData, jobsData] = await Promise.all([
        apiClient<Kpi>(`/api/proxy/reports/kpi${kpiDate ? `?date=${kpiDate}` : ""}`),
        apiClient<{ data: Job[] }>("/api/proxy/reports/jobs")
      ]);
      setKpi(kpiData);
      setJobs(jobsData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load reports");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createExport = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/reports/export", {
        method: "POST",
        body: JSON.stringify(exportForm)
      });
      await load();
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

  return (
    <div className="page">
      <PageHeader
        title="Reports & Export Jobs"
        subtitle="Pantau KPI harian dan job export audit/report dengan signed URL attachment."
        icon={BarChart3}
        actions={
          <button className="btn btn-secondary icon-btn" onClick={() => load()}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>KPI</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <label>
              Tanggal KPI
              <input className="input" type="date" value={kpiDate} onChange={(e) => setKpiDate(e.target.value)} />
            </label>
            <button className="btn btn-secondary" onClick={() => load()}>
              Muat KPI
            </button>
          </div>

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
              <h3>Verified Rate</h3>
              <p>{Math.round((kpi?.verified_rate ?? 0) * 100)}%</p>
            </div>
          </div>
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
          <button className="btn btn-primary" type="submit" disabled={busy}>
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
                      <button className="btn btn-secondary" onClick={() => getSignedUrl(job.result_attachment_id!)}>
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
    </div>
  );
}
