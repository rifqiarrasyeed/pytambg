"use client";

import { useEffect, useMemo, useState } from "react";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { apiClient, readData } from "@/lib/api-client";
import type { CompletedAttachment } from "@/lib/attachments";
import type { LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { fetchMasterLookups } from "@/lib/lookups";
import { useSessionContext } from "@/lib/use-session-context";

type Dispute = {
  id: string;
  delivery_stop_id: string;
  delivery_id: string;
  dispute_type: string;
  delta_portions: number;
  reason: string;
  status: string;
  created_at: string;
};

type VerifyStop = {
  delivery_stop_id: string;
  delivery_id: string;
  school_id: string;
  status: string;
  manifest_no: string;
};

type StockRow = {
  item_id: string;
  item_name: string;
  batch_id: string | null;
  lot_no: string | null;
  on_hand_qty: number;
};

export default function DisputesPage() {
  const { hasAnyPermission } = useSessionContext();
  const [rows, setRows] = useState<Dispute[]>([]);
  const [stops, setStops] = useState<VerifyStop[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [createAttachment, setCreateAttachment] = useState<CompletedAttachment | null>(null);
  const [selectedDisputeId, setSelectedDisputeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createForm, setCreateForm] = useState({
    delivery_stop_id: "",
    delta_portions: "0",
    reason: ""
  });

  const [resolveForm, setResolveForm] = useState({
    resolution: "ACCEPT",
    stock_action: "NONE",
    stock_key: "",
    qty: "",
    reason_code: "",
    notes: ""
  });

  const selectedDispute = useMemo(() => rows.find((row) => row.id === selectedDisputeId) ?? null, [rows, selectedDisputeId]);
  const schoolNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const school of lookups.schools ?? []) {
      map.set(school.id, school.name);
    }
    return map;
  }, [lookups.schools]);
  const stopById = useMemo(() => {
    const map = new Map<string, VerifyStop>();
    for (const stop of stops) {
      map.set(stop.delivery_stop_id, stop);
    }
    return map;
  }, [stops]);
  const canManageDispute = hasAnyPermission("dispute.manage");

  const load = async () => {
    try {
      const [disputeData, stopData, stockData, lookupData] = await Promise.all([
        apiClient<PaginatedResponse<Dispute>>("/api/proxy/disputes?page=1&page_size=100"),
        apiClient<PaginatedResponse<VerifyStop>>("/api/proxy/verification/stops?page=1&page_size=100"),
        apiClient<PaginatedResponse<StockRow>>("/api/proxy/stock?page=1&page_size=100"),
        fetchMasterLookups(["schools"])
      ]);
      const disputeRows = readData<Dispute>(disputeData);
      const stopRows = readData<VerifyStop>(stopData);

      setRows(disputeRows);
      setStops(stopRows);
      setStockRows(readData<StockRow>(stockData));
      setLookups(lookupData);

      if (!selectedDisputeId && disputeRows.length > 0) {
        setSelectedDisputeId(disputeRows[0].id);
      }
      if (!createForm.delivery_stop_id && stopRows.length > 0) {
        setCreateForm((prev) => ({ ...prev, delivery_stop_id: stopRows[0].delivery_stop_id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load disputes");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCreateAttachment(null);
  }, [createForm.delivery_stop_id]);

  const createDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    const stop = stops.find((item) => item.delivery_stop_id === createForm.delivery_stop_id);
    if (!stop) return;
    if (!createAttachment) {
      setError("Bukti dispute wajib diupload");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/deliveries/${stop.delivery_id}/disputes`, {
        method: "POST",
        body: JSON.stringify({
          delivery_stop_id: stop.delivery_stop_id,
          delta_portions: Number(createForm.delta_portions),
          reason: createForm.reason,
          attachments: [{ attachment_id: createAttachment.id }]
        })
      });
      await load();
      setCreateAttachment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create dispute");
    } finally {
      setBusy(false);
    }
  };

  const resolveDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDisputeId) return;

    const [itemId, batchId] = resolveForm.stock_key ? resolveForm.stock_key.split(":") : [undefined, undefined];

    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/disputes/${selectedDisputeId}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          resolution: resolveForm.resolution,
          stock_action: resolveForm.stock_action,
          item_id: itemId || undefined,
          batch_id: batchId && batchId !== "nobatch" ? batchId : undefined,
          qty: resolveForm.qty ? Number(resolveForm.qty) : undefined,
          reason_code: resolveForm.reason_code || undefined,
          notes: resolveForm.notes || undefined
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal resolve dispute");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <strong>Create Dispute</strong>
        </div>
        <form className="card-body" onSubmit={createDispute} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Delivery Stop
              <select className="select" value={createForm.delivery_stop_id} onChange={(e) => setCreateForm({ ...createForm, delivery_stop_id: e.target.value })} required>
                <option value="">Pilih stop</option>
                {stops.map((stop) => (
                  <option key={stop.delivery_stop_id} value={stop.delivery_stop_id}>
                    {stop.manifest_no} - {schoolNameById.get(stop.school_id) ?? stop.school_id} ({stop.status})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delta Portions
              <input className="input" type="number" value={createForm.delta_portions} onChange={(e) => setCreateForm({ ...createForm, delta_portions: e.target.value })} required />
            </label>
            <label>
              Reason
              <input className="input" value={createForm.reason} onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })} required />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !canManageDispute}>
            Create Dispute
          </button>
          <AttachmentUploader
            moduleName="delivery"
            entityId={createForm.delivery_stop_id}
            label="Bukti dispute"
            required
            disabled={busy || !createForm.delivery_stop_id || !canManageDispute}
            onUploaded={setCreateAttachment}
          />
          {!canManageDispute ? <div className="badge badge-warn">Role aktif tidak memiliki izin dispute.manage</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Resolve Dispute</strong>
        </div>
        <form className="card-body" onSubmit={resolveDispute} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Selected Dispute
              <select className="select" value={selectedDisputeId} onChange={(e) => setSelectedDisputeId(e.target.value)} required>
                <option value="">Pilih dispute</option>
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {stopById.get(row.delivery_stop_id)?.manifest_no ?? row.delivery_id} - {row.status} ({row.reason})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Resolution
              <select className="select" value={resolveForm.resolution} onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })}>
                <option>ACCEPT</option>
                <option>REJECT</option>
              </select>
            </label>
            <label>
              Stock Action
              <select className="select" value={resolveForm.stock_action} onChange={(e) => setResolveForm({ ...resolveForm, stock_action: e.target.value })}>
                <option>NONE</option>
                <option>RETURN</option>
                <option>WASTE</option>
              </select>
            </label>
            <label>
              Item/Batch Stock
              <select className="select" value={resolveForm.stock_key} onChange={(e) => setResolveForm({ ...resolveForm, stock_key: e.target.value })}>
                <option value="">Pilih stock</option>
                {stockRows.map((row) => (
                  <option key={`${row.item_id}:${row.batch_id ?? "nobatch"}`} value={`${row.item_id}:${row.batch_id ?? "nobatch"}`}>
                    {row.item_name} {row.lot_no ? `| ${row.lot_no}` : ""} (on hand {row.on_hand_qty})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qty
              <input className="input" type="number" value={resolveForm.qty} onChange={(e) => setResolveForm({ ...resolveForm, qty: e.target.value })} />
            </label>
            <label>
              Reason Code
              <input className="input" value={resolveForm.reason_code} onChange={(e) => setResolveForm({ ...resolveForm, reason_code: e.target.value })} />
            </label>
            <label>
              Notes
              <input className="input" value={resolveForm.notes} onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })} />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !selectedDispute || !canManageDispute}>
            Resolve Selected
          </button>
          {error ? <div className="badge badge-danger">{error}</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Dispute Queue</strong>
          <button className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aksi</th>
                <th>Manifest</th>
                <th>Sekolah</th>
                <th>Delta</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button className="btn btn-secondary" onClick={() => setSelectedDisputeId(row.id)}>
                      Pilih
                    </button>
                  </td>
                  <td>{stopById.get(row.delivery_stop_id)?.manifest_no ?? row.delivery_id}</td>
                  <td>{schoolNameById.get(stopById.get(row.delivery_stop_id)?.school_id ?? "") ?? stopById.get(row.delivery_stop_id)?.school_id ?? row.delivery_stop_id}</td>
                  <td>{row.delta_portions}</td>
                  <td>
                    <span className="badge badge-neutral">{row.status}</span>
                  </td>
                  <td>{row.reason}</td>
                  <td>{new Date(row.created_at).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
