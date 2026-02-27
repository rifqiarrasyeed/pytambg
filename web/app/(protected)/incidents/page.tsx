"use client";

import { RefreshCw, Siren } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { apiClient, readData } from "@/lib/api-client";
import type { CompletedAttachment } from "@/lib/attachments";
import type { PaginatedResponse } from "@/lib/contracts";
import { localDateTimeToIso } from "@/lib/datetime";
import { useSessionContext } from "@/lib/use-session-context";

type Waste = { id: string; event_time: string; item_id: string | null; qty: number; reason_code: string; severity: string; status: string };
type Incident = { id: string; incident_time: string; category: string; severity: string; description: string; status: string };
type StockRow = { item_id: string; item_name: string; batch_id: string | null; lot_no: string | null; on_hand_qty: number };

function generateEntityId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function IncidentsPage() {
  const { hasAnyPermission } = useSessionContext();
  const [wastes, setWastes] = useState<Waste[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [wasteEntityId, setWasteEntityId] = useState(() => generateEntityId());
  const [incidentEntityId, setIncidentEntityId] = useState(() => generateEntityId());
  const [wasteAttachment, setWasteAttachment] = useState<CompletedAttachment | null>(null);
  const [incidentAttachment, setIncidentAttachment] = useState<CompletedAttachment | null>(null);
  const [recallLot, setRecallLot] = useState("");
  const [recallResult, setRecallResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wasteForm, setWasteForm] = useState({
    event_time: "",
    stock_key: "",
    qty: "0",
    reason_code: "",
    severity: "MEDIUM"
  });

  const [incidentForm, setIncidentForm] = useState({
    incident_time: "",
    category: "",
    severity: "MEDIUM",
    description: "",
    action_taken: "",
    due_at: ""
  });

  const selectedStock = useMemo(() => {
    if (!wasteForm.stock_key) return null;
    const [itemId, batchId] = wasteForm.stock_key.split(":");
    return { item_id: itemId, batch_id: batchId === "nobatch" ? null : batchId };
  }, [wasteForm.stock_key]);
  const itemNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stockRows) {
      if (!map.has(row.item_id)) {
        map.set(row.item_id, row.item_name);
      }
    }
    return map;
  }, [stockRows]);
  const canWriteWaste = hasAnyPermission("inventory.write");
  const canWriteIncident = hasAnyPermission("delivery.manage");

  const load = async () => {
    try {
      const [wasteData, incidentData, stockData] = await Promise.all([
        apiClient<PaginatedResponse<Waste>>("/api/proxy/waste-events?page=1&page_size=100"),
        apiClient<PaginatedResponse<Incident>>("/api/proxy/incident-logs?page=1&page_size=100"),
        apiClient<PaginatedResponse<StockRow>>("/api/proxy/stock?page=1&page_size=100")
      ]);
      const stock = readData<StockRow>(stockData);
      setWastes(readData<Waste>(wasteData));
      setIncidents(readData<Incident>(incidentData));
      setStockRows(stock);
      if (!wasteForm.stock_key && stock.length > 0) {
        setWasteForm((prev) => ({ ...prev, stock_key: `${stock[0].item_id}:${stock[0].batch_id ?? "nobatch"}` }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load incidents/waste");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createWaste = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStock) return;

    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/waste-events", {
        method: "POST",
        body: JSON.stringify({
          event_time: localDateTimeToIso(wasteForm.event_time),
          item_id: selectedStock.item_id,
          batch_id: selectedStock.batch_id ?? undefined,
          qty: Number(wasteForm.qty),
          reason_code: wasteForm.reason_code,
          severity: wasteForm.severity,
          post_stock_move: true,
          attachments: wasteAttachment ? [{ attachment_id: wasteAttachment.id }] : undefined
        })
      });
      await load();
      setWasteAttachment(null);
      setWasteEntityId(generateEntityId());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create waste");
    } finally {
      setBusy(false);
    }
  };

  const createIncident = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/incident-logs", {
        method: "POST",
        body: JSON.stringify({
          incident_time: localDateTimeToIso(incidentForm.incident_time),
          category: incidentForm.category,
          severity: incidentForm.severity,
          description: incidentForm.description,
          action_taken: incidentForm.action_taken || undefined,
          due_at: incidentForm.due_at ? localDateTimeToIso(incidentForm.due_at) : undefined,
          attachments: incidentAttachment ? [{ attachment_id: incidentAttachment.id }] : undefined
        })
      });
      await load();
      setIncidentAttachment(null);
      setIncidentEntityId(generateEntityId());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create incident");
    } finally {
      setBusy(false);
    }
  };

  const traceRecall = async () => {
    if (!recallLot) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient(`/api/proxy/recall/trace?lot_no=${encodeURIComponent(recallLot)}`);
      setRecallResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal trace recall");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Incident, Waste & Recall"
        subtitle="Catat kejadian kritikal, bukti lapangan, dan telusur recall batch."
        icon={Siren}
        actions={
          <button className="btn btn-secondary icon-btn" data-testid="incidents-refresh" onClick={() => load()}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Waste Event</strong>
        </div>
        <form className="card-body" onSubmit={createWaste} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Event Time
              <input className="input" type="datetime-local" value={wasteForm.event_time} onChange={(e) => setWasteForm({ ...wasteForm, event_time: e.target.value })} required />
            </label>
            <label>
              Item/Batch
              <select className="select" value={wasteForm.stock_key} onChange={(e) => setWasteForm({ ...wasteForm, stock_key: e.target.value })} required>
                <option value="">Pilih item/batch</option>
                {stockRows.map((row) => (
                  <option key={`${row.item_id}:${row.batch_id ?? "nobatch"}`} value={`${row.item_id}:${row.batch_id ?? "nobatch"}`}>
                    {row.item_name} {row.lot_no ? `| ${row.lot_no}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qty
              <input className="input" type="number" value={wasteForm.qty} onChange={(e) => setWasteForm({ ...wasteForm, qty: e.target.value })} required />
            </label>
            <label>
              Reason
              <input className="input" value={wasteForm.reason_code} onChange={(e) => setWasteForm({ ...wasteForm, reason_code: e.target.value })} required />
            </label>
            <label>
              Severity
              <select className="select" value={wasteForm.severity} onChange={(e) => setWasteForm({ ...wasteForm, severity: e.target.value })}>
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>CRITICAL</option>
              </select>
            </label>
          </div>
          <button className="btn btn-primary" data-testid="incidents-save-waste" type="submit" disabled={busy || !canWriteWaste}>
            Simpan Waste
          </button>
          <AttachmentUploader
            moduleName="incident"
            entityId={wasteEntityId}
            label="Bukti waste (foto opsional)"
            disabled={busy || !canWriteWaste}
            onUploaded={setWasteAttachment}
          />
          {!canWriteWaste ? <div className="badge badge-warn">Role aktif tidak memiliki izin inventory.write</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Incident Log</strong>
        </div>
        <form className="card-body" onSubmit={createIncident} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Incident Time
              <input
                className="input"
                type="datetime-local"
                value={incidentForm.incident_time}
                onChange={(e) => setIncidentForm({ ...incidentForm, incident_time: e.target.value })}
                required
              />
            </label>
            <label>
              Category
              <input className="input" value={incidentForm.category} onChange={(e) => setIncidentForm({ ...incidentForm, category: e.target.value })} required />
            </label>
            <label>
              Severity
              <select className="select" value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>CRITICAL</option>
              </select>
            </label>
            <label>
              Description
              <input className="input" value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} required />
            </label>
            <label>
              Action Taken
              <input className="input" value={incidentForm.action_taken} onChange={(e) => setIncidentForm({ ...incidentForm, action_taken: e.target.value })} />
            </label>
            <label>
              Due At
              <input className="input" type="datetime-local" value={incidentForm.due_at} onChange={(e) => setIncidentForm({ ...incidentForm, due_at: e.target.value })} />
            </label>
          </div>
          <button className="btn btn-primary" data-testid="incidents-save-incident" type="submit" disabled={busy || !canWriteIncident}>
            Simpan Incident
          </button>
          <AttachmentUploader
            moduleName="incident"
            entityId={incidentEntityId}
            label="Bukti incident (foto/dokumen opsional)"
            disabled={busy || !canWriteIncident}
            onUploaded={setIncidentAttachment}
          />
          {!canWriteIncident ? <div className="badge badge-warn">Role aktif tidak memiliki izin delivery.manage</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Recall Trace</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10 }}>
          <div className="action-row">
            <input className="input" placeholder="Lot No" value={recallLot} onChange={(e) => setRecallLot(e.target.value)} />
            <button className="btn btn-secondary" data-testid="incidents-trace-recall" onClick={traceRecall} disabled={busy}>
              Trace
            </button>
          </div>
          {recallResult ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(recallResult, null, 2)}</pre> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Waste & Incident History</strong>
        </div>
        <div className="card-body grid-2">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {wastes.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.event_time).toLocaleString("id-ID")}</td>
                    <td>{row.item_id ? itemNameById.get(row.item_id) ?? row.item_id : "-"}</td>
                    <td>{row.qty}</td>
                    <td><StatusBadge value={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.incident_time).toLocaleString("id-ID")}</td>
                    <td>{row.category}</td>
                    <td><SeverityBadge value={row.severity} /></td>
                    <td><StatusBadge value={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
