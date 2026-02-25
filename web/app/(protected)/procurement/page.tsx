"use client";

import { RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient, readData } from "@/lib/api-client";
import type { CompletedAttachment } from "@/lib/attachments";
import type { LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { localDateTimeToIso } from "@/lib/datetime";
import { fetchMasterLookups } from "@/lib/lookups";
import { useSessionContext } from "@/lib/use-session-context";

type Purchase = { id: string; po_no: string; vendor_id: string; eta_date: string; status: string; created_at: string };
type Receipt = { id: string; grn_no: string; purchase_id: string; received_at: string; status: string; created_at: string };
type PurchaseItem = {
  id: string;
  item_id: string;
  ordered_qty: number;
  unit_price: number;
  item_name: string;
  track_expiry: boolean;
};

export default function ProcurementPage() {
  const { hasAnyPermission } = useSessionContext();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("");
  const [grnAttachment, setGrnAttachment] = useState<CompletedAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [poForm, setPoForm] = useState({
    vendor_id: "",
    eta_date: "",
    item_id: "",
    ordered_qty: "100",
    unit_price: "0"
  });

  const [grnForm, setGrnForm] = useState({
    idempotency_key: `grn-${Date.now()}`,
    received_at: "",
    purchase_item_id: "",
    received_qty: "0",
    lot_no: "",
    expiry_date: "",
    price: "0",
    variance_reason: ""
  });

  const vendors = lookups.vendors ?? [];
  const items = lookups.items ?? [];
  const vendorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const vendor of vendors) {
      map.set(vendor.id, vendor.name);
    }
    return map;
  }, [vendors]);
  const poNoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const po of purchases) {
      map.set(po.id, po.po_no);
    }
    return map;
  }, [purchases]);
  const selectedPurchase = useMemo(() => purchases.find((purchase) => purchase.id === selectedPurchaseId) ?? null, [purchases, selectedPurchaseId]);
  const selectedPurchaseItem = useMemo(
    () => purchaseItems.find((item) => item.id === grnForm.purchase_item_id) ?? null,
    [purchaseItems, grnForm.purchase_item_id]
  );
  const canProcurementWrite = hasAnyPermission("procurement.write");
  const canProcurementApprove = hasAnyPermission("procurement.approve");
  const canReceiptPost = hasAnyPermission("receipt.post");

  const load = async () => {
    try {
      const [poData, grnData, lookupData] = await Promise.all([
        apiClient<PaginatedResponse<Purchase>>("/api/proxy/purchases?page=1&page_size=50"),
        apiClient<PaginatedResponse<Receipt>>("/api/proxy/receipts?page=1&page_size=50"),
        fetchMasterLookups(["vendors", "items"])
      ]);
      setPurchases(readData<Purchase>(poData));
      setReceipts(readData<Receipt>(grnData));
      setLookups(lookupData);
      if (!selectedPurchaseId && poData.data.length > 0) {
        setSelectedPurchaseId(poData.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load procurement");
    }
  };

  const loadPurchaseItems = async (purchaseId: string) => {
    if (!purchaseId) {
      setPurchaseItems([]);
      return;
    }
    try {
      const data = await apiClient<{ data: PurchaseItem[] }>(`/api/proxy/purchases/${purchaseId}/items`);
      const rows = readData<PurchaseItem>(data);
      setPurchaseItems(rows);
      if (rows.length > 0) {
        const first = rows[0];
        setGrnForm((prev) => ({
          ...prev,
          purchase_item_id: prev.purchase_item_id || first.id,
          received_qty: prev.received_qty === "0" ? String(first.ordered_qty) : prev.received_qty,
          price: prev.price === "0" ? String(first.unit_price) : prev.price
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load purchase items");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPurchaseId) {
      return;
    }
    setGrnAttachment(null);
    void loadPurchaseItems(selectedPurchaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPurchaseId]);

  const createPo = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/purchases", {
        method: "POST",
        body: JSON.stringify({
          vendor_id: poForm.vendor_id,
          eta_date: poForm.eta_date,
          items: [
            {
              item_id: poForm.item_id,
              ordered_qty: Number(poForm.ordered_qty),
              unit_price: Number(poForm.unit_price)
            }
          ]
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create PO");
    } finally {
      setBusy(false);
    }
  };

  const runPoAction = async (action: "submit" | "approve") => {
    if (!selectedPurchaseId) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/purchases/${selectedPurchaseId}/${action}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${action} PO`);
    } finally {
      setBusy(false);
    }
  };

  const createGrn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPurchaseId) return;
    if (!grnAttachment) {
      setError("Bukti invoice/faktur wajib diupload sebelum Post GRN");
      return;
    }
    if (selectedPurchaseItem?.track_expiry && (!grnForm.lot_no || !grnForm.expiry_date)) {
      setError("Item expiry wajib lot number dan expiry date");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/receipts", {
        method: "POST",
        headers: {
          "Idempotency-Key": grnForm.idempotency_key
        },
        body: JSON.stringify({
          purchase_id: selectedPurchaseId,
          received_at: localDateTimeToIso(grnForm.received_at),
          items: [
            {
              purchase_item_id: grnForm.purchase_item_id,
              received_qty: Number(grnForm.received_qty),
              lot_no: grnForm.lot_no || undefined,
              expiry_date: grnForm.expiry_date || undefined,
              price: Number(grnForm.price),
              variance_reason: grnForm.variance_reason || undefined
            }
          ],
          attachments: [{ attachment_id: grnAttachment.id }]
        })
      });
      await load();
      setGrnAttachment(null);
      setGrnForm((prev) => ({
        ...prev,
        idempotency_key: `grn-${Date.now()}`
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal posting GRN");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Procurement & Receiving"
        subtitle="Kelola PO, approval, dan posting GRN dengan idempotency dan bukti faktur."
        icon={ShoppingCart}
        actions={
          <button className="btn btn-secondary icon-btn" onClick={() => load()}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
        chips={<span className="status-badge status-neutral">Selected PO: {selectedPurchase?.po_no ?? "-"}</span>}
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Procurement (PO)</strong>
        </div>
        <form className="card-body" onSubmit={createPo} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Vendor
              <select className="select" value={poForm.vendor_id} onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })} required>
                <option value="">Pilih vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ETA Date
              <input className="input" type="date" value={poForm.eta_date} onChange={(e) => setPoForm({ ...poForm, eta_date: e.target.value })} required />
            </label>
            <label>
              Item
              <select className="select" value={poForm.item_id} onChange={(e) => setPoForm({ ...poForm, item_id: e.target.value })} required>
                <option value="">Pilih item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordered Qty
              <input className="input" type="number" value={poForm.ordered_qty} onChange={(e) => setPoForm({ ...poForm, ordered_qty: e.target.value })} required />
            </label>
            <label>
              Unit Price
              <input className="input" type="number" value={poForm.unit_price} onChange={(e) => setPoForm({ ...poForm, unit_price: e.target.value })} required />
            </label>
          </div>

          <div className="action-row">
            <button className="btn btn-primary" type="submit" disabled={busy || !canProcurementWrite}>
              Buat PO
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runPoAction("submit")}
              disabled={busy || !selectedPurchaseId || !canProcurementWrite}
            >
              Submit Selected PO
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runPoAction("approve")}
              disabled={busy || !selectedPurchaseId || !canProcurementApprove}
            >
              Approve Selected PO
            </button>
          </div>
          {!canProcurementWrite ? <div className="badge badge-warn">Role aktif tidak memiliki izin procurement.write</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Receiving / GRN</strong>
        </div>
        <form className="card-body" onSubmit={createGrn} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Idempotency Key
              <input className="input" value={grnForm.idempotency_key} onChange={(e) => setGrnForm({ ...grnForm, idempotency_key: e.target.value })} required />
            </label>
            <label>
              Selected PO
              <input className="input" value={selectedPurchase?.po_no ?? "-"} readOnly />
            </label>
            <label>
              Received At
              <input className="input" type="datetime-local" value={grnForm.received_at} onChange={(e) => setGrnForm({ ...grnForm, received_at: e.target.value })} required />
            </label>
            <label>
              Purchase Item
              <select className="select" value={grnForm.purchase_item_id} onChange={(e) => setGrnForm({ ...grnForm, purchase_item_id: e.target.value })} required>
                <option value="">Pilih purchase item</option>
                {purchaseItems.map((purchaseItem) => (
                  <option key={purchaseItem.id} value={purchaseItem.id}>
                    {purchaseItem.item_name} (ordered {purchaseItem.ordered_qty})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Received Qty
              <input className="input" type="number" value={grnForm.received_qty} onChange={(e) => setGrnForm({ ...grnForm, received_qty: e.target.value })} required />
            </label>
            <label>
              Lot No
              <input className="input" value={grnForm.lot_no} onChange={(e) => setGrnForm({ ...grnForm, lot_no: e.target.value })} />
            </label>
            <label>
              Expiry Date
              <input className="input" type="date" value={grnForm.expiry_date} onChange={(e) => setGrnForm({ ...grnForm, expiry_date: e.target.value })} />
            </label>
            <label>
              Price
              <input className="input" type="number" value={grnForm.price} onChange={(e) => setGrnForm({ ...grnForm, price: e.target.value })} required />
            </label>
            <label>
              Variance Reason
              <input className="input" value={grnForm.variance_reason} onChange={(e) => setGrnForm({ ...grnForm, variance_reason: e.target.value })} />
            </label>
          </div>

          <AttachmentUploader
            moduleName="invoice"
            entityId={selectedPurchaseId}
            label="Bukti faktur/invoice"
            accept="image/*,.pdf"
            required
            disabled={busy || !selectedPurchaseId || !canReceiptPost}
            onUploaded={setGrnAttachment}
          />

          <button className="btn btn-primary" type="submit" disabled={busy || !selectedPurchaseId || !canReceiptPost}>
            Post GRN
          </button>
          {!canReceiptPost ? <div className="badge badge-warn">Role aktif tidak memiliki izin receipt.post</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Daftar PO & GRN</strong>
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
                  <th>PO</th>
                  <th>Status</th>
                  <th>Vendor</th>
                  <th>ETA</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((po) => (
                  <tr key={po.id}>
                    <td>
                      <button className="btn btn-secondary" onClick={() => setSelectedPurchaseId(po.id)}>
                        Pilih
                      </button>
                    </td>
                    <td>{po.po_no}</td>
                    <td>
                      <StatusBadge value={po.status} />
                    </td>
                    <td>{vendorNameById.get(po.vendor_id) ?? po.vendor_id}</td>
                    <td>{po.eta_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>GRN</th>
                  <th>Status</th>
                  <th>Purchase</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((grn) => (
                  <tr key={grn.id}>
                    <td>{grn.grn_no}</td>
                    <td>
                      <StatusBadge value={grn.status} />
                    </td>
                    <td>{poNoById.get(grn.purchase_id) ?? grn.purchase_id}</td>
                    <td>{new Date(grn.received_at).toLocaleString("id-ID")}</td>
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
