"use client";

import { useEffect, useMemo, useState } from "react";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { apiClient, readData } from "@/lib/api-client";
import type { CompletedAttachment } from "@/lib/attachments";
import type { LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { fetchMasterLookups } from "@/lib/lookups";
import { useSessionContext } from "@/lib/use-session-context";

type VerifyStop = {
  delivery_stop_id: string;
  delivery_id: string;
  school_id: string;
  stop_order: number;
  status: string;
  planned_portions: number;
  delivered_portions: number;
  manifest_no: string;
  planned_departure: string;
};

export default function VerificationPage() {
  const { hasAnyPermission } = useSessionContext();
  const [stops, setStops] = useState<VerifyStop[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [selectedStopId, setSelectedStopId] = useState("");
  const [proofAttachment, setProofAttachment] = useState<CompletedAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    idempotency_key: `verify-${Date.now()}`,
    verified_portions: "0",
    result: "MATCH",
    reason: ""
  });

  const selectedStop = useMemo(() => stops.find((stop) => stop.delivery_stop_id === selectedStopId) ?? null, [stops, selectedStopId]);
  const schoolNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const school of lookups.schools ?? []) {
      map.set(school.id, school.name);
    }
    return map;
  }, [lookups.schools]);
  const canVerify = hasAnyPermission("delivery.verify");

  const load = async () => {
    try {
      const [data, lookupData] = await Promise.all([
        apiClient<PaginatedResponse<VerifyStop>>("/api/proxy/verification/stops?page=1&page_size=100"),
        fetchMasterLookups(["schools"])
      ]);
      const rows = readData<VerifyStop>(data);
      setStops(rows);
      setLookups(lookupData);
      if (rows.length > 0) {
        setSelectedStopId((prev) => prev || rows[0].delivery_stop_id);
      } else {
        setSelectedStopId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load verifikasi");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStop) return;
    setForm((prev) => ({ ...prev, verified_portions: String(selectedStop.delivered_portions) }));
    setProofAttachment(null);
  }, [selectedStop]);

  const submitVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStop) return;

    if (form.result === "MISMATCH" && (!form.reason || !proofAttachment)) {
      setError("MISMATCH wajib isi reason dan upload bukti");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/deliveries/${selectedStop.delivery_id}/verify`, {
        method: "POST",
        headers: {
          "Idempotency-Key": form.idempotency_key
        },
        body: JSON.stringify({
          delivery_stop_id: selectedStop.delivery_stop_id,
          verified_portions: Number(form.verified_portions),
          result: form.result,
          reason: form.reason || undefined,
          attachments: proofAttachment ? [{ attachment_id: proofAttachment.id }] : undefined
        })
      });
      await load();
      setForm((prev) => ({ ...prev, idempotency_key: `verify-${Date.now()}`, reason: "" }));
      setProofAttachment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal verify stop");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <strong>School Verification</strong>
        </div>
        <form className="card-body" onSubmit={submitVerify} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Selected Stop
              <select className="select" value={selectedStopId} onChange={(e) => setSelectedStopId(e.target.value)} required>
                <option value="">Pilih stop</option>
                {stops.map((stop) => (
                  <option key={stop.delivery_stop_id} value={stop.delivery_stop_id}>
                    {stop.manifest_no} | sekolah {schoolNameById.get(stop.school_id) ?? stop.school_id} | status {stop.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Verified Portions
              <input className="input" type="number" value={form.verified_portions} onChange={(e) => setForm({ ...form, verified_portions: e.target.value })} required />
            </label>
            <label>
              Result
              <select className="select" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                <option>MATCH</option>
                <option>MISMATCH</option>
              </select>
            </label>
            <label>
              Reason
              <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </label>
            <label>
              Idempotency Key
              <input className="input" value={form.idempotency_key} onChange={(e) => setForm({ ...form, idempotency_key: e.target.value })} required />
            </label>
          </div>

          {form.result === "MISMATCH" ? (
            <AttachmentUploader
              moduleName="delivery"
              entityId={selectedStop?.delivery_stop_id ?? ""}
              label="Bukti mismatch"
              required
              disabled={busy || !selectedStop || !canVerify}
              onUploaded={setProofAttachment}
            />
          ) : null}

          <button className="btn btn-primary" type="submit" disabled={busy || !selectedStop || !canVerify}>
            Verify Selected Stop
          </button>
          {!canVerify ? <div className="badge badge-warn">Role aktif tidak memiliki izin verify</div> : null}
          {error ? <div className="badge badge-danger">{error}</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Pending Verification Stops</strong>
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
                <th>Urutan Stop</th>
                <th>Sekolah</th>
                <th>Status</th>
                <th>Planned</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop) => (
                <tr key={stop.delivery_stop_id}>
                  <td>
                    <button className="btn btn-secondary" onClick={() => setSelectedStopId(stop.delivery_stop_id)}>
                      Pilih
                    </button>
                  </td>
                  <td>{stop.manifest_no}</td>
                  <td>#{stop.stop_order}</td>
                  <td>{schoolNameById.get(stop.school_id) ?? stop.school_id}</td>
                  <td>
                    <span className="badge badge-neutral">{stop.status}</span>
                  </td>
                  <td>{stop.planned_portions}</td>
                  <td>{stop.delivered_portions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
