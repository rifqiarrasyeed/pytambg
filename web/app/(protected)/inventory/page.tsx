"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, readData } from "@/lib/api-client";
import type { PaginatedResponse } from "@/lib/contracts";

type StockRow = {
  item_id: string;
  item_name: string;
  sku: string;
  batch_id: string | null;
  lot_no: string | null;
  expiry_date: string | null;
  on_hand_qty: number;
};
type MoveRow = { id: string; move_no: number; move_type: string; item_id: string; qty: number; reason_code: string | null; created_at: string };
type OpnameRow = { id: string; opname_date: string; status: string; created_at: string };

export default function InventoryPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [opnames, setOpnames] = useState<OpnameRow[]>([]);
  const [selectedStockKey, setSelectedStockKey] = useState<string>("");
  const [selectedOpnameId, setSelectedOpnameId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [moveForm, setMoveForm] = useState({
    move_type: "ADJUSTMENT",
    qty: "0",
    reason_code: "",
    move_date: ""
  });

  const [opnameForm, setOpnameForm] = useState({
    opname_date: "",
    physical_qty: "0"
  });

  const selectedStock = useMemo(() => stock.find((row) => `${row.item_id}:${row.batch_id ?? "nobatch"}` === selectedStockKey) ?? null, [stock, selectedStockKey]);
  const itemNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stock) {
      map.set(row.item_id, row.item_name);
    }
    return map;
  }, [stock]);

  const load = async () => {
    try {
      const [stockData, moveData, opnameData] = await Promise.all([
        apiClient<PaginatedResponse<StockRow>>("/api/proxy/stock?page=1&page_size=80"),
        apiClient<PaginatedResponse<MoveRow>>("/api/proxy/stock-moves?page=1&page_size=100"),
        apiClient<PaginatedResponse<OpnameRow>>("/api/proxy/opnames?page=1&page_size=50")
      ]);
      const stockRows = readData<StockRow>(stockData);
      const opnameRows = readData<OpnameRow>(opnameData);

      setStock(stockRows);
      setMoves(readData<MoveRow>(moveData));
      setOpnames(opnameRows);

      if (!selectedStockKey && stockRows.length > 0) {
        setSelectedStockKey(`${stockRows[0].item_id}:${stockRows[0].batch_id ?? "nobatch"}`);
      }
      if (!selectedOpnameId && opnameRows.length > 0) {
        setSelectedOpnameId(opnameRows[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load inventory");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStock) return;

    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/stock-moves", {
        method: "POST",
        body: JSON.stringify({
          move_type: moveForm.move_type,
          item_id: selectedStock.item_id,
          batch_id: selectedStock.batch_id ?? undefined,
          qty: Number(moveForm.qty),
          reason_code: moveForm.reason_code || undefined,
          move_date: moveForm.move_date
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create stock move");
    } finally {
      setBusy(false);
    }
  };

  const createOpname = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStock) return;

    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/opnames", {
        method: "POST",
        body: JSON.stringify({
          opname_date: opnameForm.opname_date,
          lines: [
            {
              item_id: selectedStock.item_id,
              batch_id: selectedStock.batch_id ?? undefined,
              physical_qty: Number(opnameForm.physical_qty)
            }
          ]
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create opname");
    } finally {
      setBusy(false);
    }
  };

  const runOpnameAction = async (action: "submit" | "approve") => {
    if (!selectedOpnameId) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/opnames/${selectedOpnameId}/${action}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${action} opname`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <strong>Stock Movement</strong>
        </div>
        <form className="card-body" onSubmit={createMove} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Basis Stock
              <select className="select" value={selectedStockKey} onChange={(e) => setSelectedStockKey(e.target.value)} required>
                <option value="">Pilih item/batch</option>
                {stock.map((row) => (
                  <option key={`${row.item_id}:${row.batch_id ?? "nobatch"}`} value={`${row.item_id}:${row.batch_id ?? "nobatch"}`}>
                    {row.item_name} {row.lot_no ? `| ${row.lot_no}` : ""} (on hand {row.on_hand_qty})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Move Type
              <select className="select" value={moveForm.move_type} onChange={(e) => setMoveForm({ ...moveForm, move_type: e.target.value })}>
                <option>RECEIVE</option>
                <option>ISSUE_TO_PRODUCTION</option>
                <option>TRANSFER</option>
                <option>ADJUSTMENT</option>
                <option>WASTE</option>
                <option>RETURN_VENDOR</option>
                <option>RETURN</option>
              </select>
            </label>
            <label>
              Qty
              <input className="input" type="number" value={moveForm.qty} onChange={(e) => setMoveForm({ ...moveForm, qty: e.target.value })} required />
            </label>
            <label>
              Reason Code
              <input className="input" value={moveForm.reason_code} onChange={(e) => setMoveForm({ ...moveForm, reason_code: e.target.value })} />
            </label>
            <label>
              Move Date
              <input className="input" type="date" value={moveForm.move_date} onChange={(e) => setMoveForm({ ...moveForm, move_date: e.target.value })} required />
            </label>
          </div>

          <button className="btn btn-primary" type="submit" disabled={busy || !selectedStock}>
            Post Stock Move
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Stock Opname</strong>
        </div>
        <form className="card-body" onSubmit={createOpname} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Opname Date
              <input className="input" type="date" value={opnameForm.opname_date} onChange={(e) => setOpnameForm({ ...opnameForm, opname_date: e.target.value })} required />
            </label>
            <label>
              Physical Qty
              <input className="input" type="number" value={opnameForm.physical_qty} onChange={(e) => setOpnameForm({ ...opnameForm, physical_qty: e.target.value })} required />
            </label>
            <label>
              Selected Opname
              <select className="select" value={selectedOpnameId} onChange={(e) => setSelectedOpnameId(e.target.value)}>
                <option value="">Pilih opname</option>
                {opnames.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.opname_date} - {row.status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="action-row">
            <button className="btn btn-primary" type="submit" disabled={busy || !selectedStock}>
              Buat Opname
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => runOpnameAction("submit")} disabled={busy || !selectedOpnameId}>
              Submit Selected
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => runOpnameAction("approve")} disabled={busy || !selectedOpnameId}>
              Approve Selected
            </button>
          </div>
          {error ? <div className="badge badge-danger">{error}</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Stock Snapshot</strong>
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
                  <th>Item</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>On Hand</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row, idx) => (
                  <tr key={`${row.item_id}-${idx}`}>
                    <td>
                      <button className="btn btn-secondary" onClick={() => setSelectedStockKey(`${row.item_id}:${row.batch_id ?? "nobatch"}`)}>
                        Pilih
                      </button>
                    </td>
                    <td>{row.item_name}</td>
                    <td>{row.lot_no ?? "-"}</td>
                    <td>{row.expiry_date ?? "-"}</td>
                    <td>{row.on_hand_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Move #</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((row) => (
                  <tr key={row.id}>
                    <td>{row.move_no}</td>
                    <td>{row.move_type}</td>
                    <td>{itemNameById.get(row.item_id) ?? row.item_id}</td>
                    <td>{row.qty}</td>
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
