"use client";

import { RefreshCw, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient, readData } from "@/lib/api-client";
import type { CompletedAttachment } from "@/lib/attachments";
import type { DeliveryTab, LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { localDateTimeToIso } from "@/lib/datetime";
import { resolveAllowedDeliveryTab } from "@/lib/navigation";
import { fetchMasterLookups } from "@/lib/lookups";
import { useSessionContext } from "@/lib/use-session-context";
import DisputesPage from "../disputes/page";
import VerificationPage from "../verification/page";

type Delivery = {
  id: string;
  manifest_no: string;
  route_id: string;
  driver_user_id: string;
  status: string;
  planned_departure: string;
};

type Stop = {
  id: string;
  school_id: string;
  stop_order: number;
  status: string;
  planned_portions: number;
  delivered_portions: number;
};

type ProductionRun = {
  id: string;
  run_date: string;
  status: string;
};

const deliveryTabs: Array<{ key: DeliveryTab; label: string }> = [
  { key: "manifest", label: "Manifest" },
  { key: "verification", label: "Verification Queue" },
  { key: "disputes", label: "Disputes" }
];

export default function DeliveryPage() {
  const { hasAnyPermission, roles, loaded } = useSessionContext();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [selectedStopId, setSelectedStopId] = useState("");
  const [proofAttachment, setProofAttachment] = useState<CompletedAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [manifestForm, setManifestForm] = useState({
    route_id: "",
    driver_user_id: "",
    vehicle_no: "",
    planned_departure: "",
    production_run_id: ""
  });

  const [actionForm, setActionForm] = useState({
    status: "LOADED"
  });

  const [proofForm, setProofForm] = useState({
    proof_type: "PHOTO",
    captured_at: "",
    idempotency_key: `proof-${Date.now()}`
  });

  const routes = lookups.routes ?? [];
  const drivers = lookups.drivers ?? [];
  const schools = lookups.schools ?? [];

  const requestedTab = searchParams.get("tab");
  const activeTab = resolveAllowedDeliveryTab(roles, requestedTab);

  const canManageDelivery = hasAnyPermission("delivery.manage");
  const canUpdateStatus = hasAnyPermission("delivery.update_status", "delivery.manage");
  const canUploadProof = hasAnyPermission("delivery.upload_proof", "delivery.manage");

  const driverLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      map.set(driver.id, driver.full_name);
    }
    return map;
  }, [drivers]);

  const schoolLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const school of schools) {
      map.set(school.id, school.name);
    }
    return map;
  }, [schools]);

  const selectedDelivery = useMemo(() => deliveries.find((row) => row.id === selectedDeliveryId) ?? null, [deliveries, selectedDeliveryId]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (requestedTab !== activeTab) {
      router.replace(`/delivery?tab=${activeTab}`);
    }
  }, [activeTab, loaded, requestedTab, router]);

  const load = async () => {
    try {
      const [deliveryData, lookupData, runData] = await Promise.all([
        apiClient<PaginatedResponse<Delivery>>("/api/proxy/deliveries?page=1&page_size=50"),
        fetchMasterLookups(["routes", "drivers", "schools"]),
        apiClient<PaginatedResponse<ProductionRun>>("/api/proxy/production-runs?page=1&page_size=50&status=FINALIZED")
      ]);
      const deliveryRows = readData<Delivery>(deliveryData);
      const runRows = readData<ProductionRun>(runData);

      setDeliveries(deliveryRows);
      setLookups(lookupData);
      setProductionRuns(runRows);

      if (!selectedDeliveryId && deliveryRows.length > 0) {
        setSelectedDeliveryId(deliveryRows[0].id);
      }

      if (!manifestForm.production_run_id && runRows.length > 0) {
        setManifestForm((prev) => ({ ...prev, production_run_id: runRows[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load deliveries");
    }
  };

  const loadStops = async (deliveryId: string) => {
    if (!deliveryId) {
      setStops([]);
      setSelectedStopId("");
      return;
    }

    try {
      const data = await apiClient<PaginatedResponse<Stop>>(`/api/proxy/deliveries/${deliveryId}/stops?page=1&page_size=100`);
      const rows = readData<Stop>(data);
      setStops(rows);
      if (rows.length > 0) {
        setSelectedStopId(rows[0].id);
      } else {
        setSelectedStopId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load stops");
    }
  };

  useEffect(() => {
    if (activeTab !== "manifest") {
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "manifest" || !selectedDeliveryId) return;
    void loadStops(selectedDeliveryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDeliveryId]);

  useEffect(() => {
    setProofAttachment(null);
  }, [selectedStopId]);

  const createManifest = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/deliveries", {
        method: "POST",
        body: JSON.stringify({
          route_id: manifestForm.route_id,
          driver_user_id: manifestForm.driver_user_id,
          vehicle_no: manifestForm.vehicle_no || undefined,
          planned_departure: localDateTimeToIso(manifestForm.planned_departure),
          production_run_id: manifestForm.production_run_id || undefined
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create manifest");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async () => {
    if (!selectedDeliveryId) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/deliveries/${selectedDeliveryId}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: actionForm.status,
          delivery_stop_id: selectedStopId || undefined
        })
      });
      await load();
      await loadStops(selectedDeliveryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update status");
    } finally {
      setBusy(false);
    }
  };

  const uploadProof = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDeliveryId || !selectedStopId) return;
    if (!proofAttachment) {
      setError("Upload bukti dulu sebelum submit proof");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/deliveries/${selectedDeliveryId}/proof`, {
        method: "POST",
        headers: {
          "Idempotency-Key": proofForm.idempotency_key
        },
        body: JSON.stringify({
          delivery_stop_id: selectedStopId,
          proof_type: proofForm.proof_type,
          attachment_id: proofAttachment.id,
          captured_at: localDateTimeToIso(proofForm.captured_at)
        })
      });
      await load();
      await loadStops(selectedDeliveryId);
      setProofForm((prev) => ({
        ...prev,
        idempotency_key: `proof-${Date.now()}`
      }));
      setProofAttachment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal upload proof");
    } finally {
      setBusy(false);
    }
  };

  const openTab = (tab: DeliveryTab) => {
    router.replace(`/delivery?tab=${tab}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Distribusi"
        subtitle="Manifest, verifikasi sekolah, dan dispute berada dalam satu alur Distribusi."
        icon={Truck}
        actions={
          <button className="btn btn-secondary icon-btn" onClick={() => (activeTab === "manifest" ? load() : router.refresh())}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
        chips={<span className="status-badge status-neutral">Tab aktif: {activeTab}</span>}
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Distribusi Control Hub</strong>
        </div>
        <div className="card-body">
          <div className="action-row" style={{ flexWrap: "wrap" }}>
            {deliveryTabs.map((tab) => (
              <button key={tab.key} className={activeTab === tab.key ? "btn btn-primary" : "btn btn-secondary"} onClick={() => openTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === "manifest" ? (
        <>
          <section className="card">
            <div className="card-header">
              <strong>Delivery Manifest</strong>
            </div>
            <form className="card-body" onSubmit={createManifest} style={{ display: "grid", gap: 10 }}>
              <div className="grid-3">
                <label>
                  Rute
                  <select className="select" value={manifestForm.route_id} onChange={(e) => setManifestForm({ ...manifestForm, route_id: e.target.value })} required>
                    <option value="">Pilih rute</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Driver
                  <select
                    className="select"
                    value={manifestForm.driver_user_id}
                    onChange={(e) => setManifestForm({ ...manifestForm, driver_user_id: e.target.value })}
                    required
                  >
                    <option value="">Pilih driver</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.full_name} ({driver.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vehicle No
                  <input className="input" value={manifestForm.vehicle_no} onChange={(e) => setManifestForm({ ...manifestForm, vehicle_no: e.target.value })} />
                </label>
                <label>
                  Planned Departure
                  <input
                    className="input"
                    type="datetime-local"
                    value={manifestForm.planned_departure}
                    onChange={(e) => setManifestForm({ ...manifestForm, planned_departure: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Production Run
                  <select className="select" value={manifestForm.production_run_id} onChange={(e) => setManifestForm({ ...manifestForm, production_run_id: e.target.value })}>
                    <option value="">Tanpa referensi run</option>
                    {productionRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.run_date} ({run.status})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || !canManageDelivery}>
                Buat Manifest
              </button>
              {!canManageDelivery ? <div className="badge badge-warn">Role aktif tidak memiliki izin create manifest</div> : null}
            </form>
          </section>

          <section className="card">
            <div className="card-header">
              <strong>Status & Proof</strong>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 12 }}>
              <div className="grid-3">
                <label>
                  Selected Delivery
                  <select className="select" value={selectedDeliveryId} onChange={(e) => setSelectedDeliveryId(e.target.value)}>
                    <option value="">Pilih delivery</option>
                    {deliveries.map((delivery) => (
                      <option key={delivery.id} value={delivery.id}>
                        {delivery.manifest_no} - {delivery.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Selected Stop
                  <select className="select" value={selectedStopId} onChange={(e) => setSelectedStopId(e.target.value)}>
                    <option value="">Pilih stop</option>
                    {stops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        #{stop.stop_order} - {schoolLabelById.get(stop.school_id) ?? stop.school_id} ({stop.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select className="select" value={actionForm.status} onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })}>
                    <option>LOADED</option>
                    <option>IN_TRANSIT</option>
                    <option>DELIVERED</option>
                    <option>VERIFIED</option>
                    <option>CLOSED</option>
                  </select>
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-secondary" type="button" onClick={updateStatus} disabled={busy || !selectedDeliveryId || !canUpdateStatus}>
                  Update Status
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => loadStops(selectedDeliveryId)} disabled={busy || !selectedDeliveryId}>
                  Reload Stops
                </button>
                <span className="status-badge status-neutral">Manifest: {selectedDelivery?.manifest_no ?? "-"}</span>
              </div>

              <form onSubmit={uploadProof} style={{ display: "grid", gap: 10 }}>
                <div className="grid-3">
                  <label>
                    Proof Type
                    <select className="select" value={proofForm.proof_type} onChange={(e) => setProofForm({ ...proofForm, proof_type: e.target.value })}>
                      <option>PHOTO</option>
                      <option>SIGNATURE</option>
                      <option>QR</option>
                    </select>
                  </label>
                  <label>
                    Captured At
                    <input className="input" type="datetime-local" value={proofForm.captured_at} onChange={(e) => setProofForm({ ...proofForm, captured_at: e.target.value })} required />
                  </label>
                  <label>
                    Idempotency Key
                    <input className="input" value={proofForm.idempotency_key} onChange={(e) => setProofForm({ ...proofForm, idempotency_key: e.target.value })} required />
                  </label>
                </div>
                <AttachmentUploader
                  moduleName="delivery"
                  entityId={selectedStopId}
                  label="Bukti serah-terima"
                  required
                  disabled={busy || !selectedStopId || !canUploadProof}
                  onUploaded={setProofAttachment}
                />
                <button className="btn btn-primary" type="submit" disabled={busy || !selectedDeliveryId || !selectedStopId || !proofAttachment || !canUploadProof}>
                  Submit Proof
                </button>
              </form>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <strong>Daftar Delivery</strong>
              <button className="btn btn-secondary" onClick={() => load()}>
                Refresh
              </button>
            </div>
            <div className="card-body grid-2">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Aksi</th>
                      <th>Manifest</th>
                      <th>Status</th>
                      <th>Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button className="btn btn-secondary" onClick={() => setSelectedDeliveryId(row.id)}>
                            Pilih
                          </button>
                        </td>
                        <td>{row.manifest_no}</td>
                        <td>
                          <StatusBadge value={row.status} />
                        </td>
                        <td>{driverLabelById.get(row.driver_user_id) ?? row.driver_user_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Aksi</th>
                      <th>Stop</th>
                      <th>Sekolah</th>
                      <th>Status</th>
                      <th>Planned</th>
                      <th>Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((stop) => (
                      <tr key={stop.id}>
                        <td>
                          <button className="btn btn-secondary" onClick={() => setSelectedStopId(stop.id)}>
                            Pilih
                          </button>
                        </td>
                        <td>#{stop.stop_order}</td>
                        <td>{schoolLabelById.get(stop.school_id) ?? stop.school_id}</td>
                        <td>
                          <StatusBadge value={stop.status} />
                        </td>
                        <td>{stop.planned_portions}</td>
                        <td>{stop.delivered_portions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "verification" ? <VerificationPage /> : null}
      {activeTab === "disputes" ? <DisputesPage /> : null}
    </div>
  );
}
