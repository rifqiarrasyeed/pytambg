"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, readData } from "@/lib/api-client";
import type { LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { fetchMasterLookups } from "@/lib/lookups";

type PlanRow = {
  id: string;
  plan_date: string;
  status: string;
  buffer_pct: number;
  created_at: string;
};

export default function PlanningPage() {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    plan_date: "",
    buffer_pct: "5",
    school_id: "",
    recipe_id: "",
    target_portions: "100"
  });

  const schools = lookups.schools ?? [];
  const recipes = lookups.recipes ?? [];

  const selectedPlan = useMemo(() => rows.find((row) => row.id === selectedPlanId) ?? null, [rows, selectedPlanId]);

  const load = async () => {
    try {
      const [plans, lookupResult] = await Promise.all([
        apiClient<PaginatedResponse<PlanRow>>("/api/proxy/menu-plans?page=1&page_size=50"),
        fetchMasterLookups(["schools", "recipes"])
      ]);

      setRows(readData<PlanRow>(plans));
      setLookups(lookupResult);
      if (!selectedPlanId && plans.data.length > 0) {
        setSelectedPlanId(plans.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load planning");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        plan_date: form.plan_date,
        buffer_pct: Number(form.buffer_pct),
        items: [
          {
            school_id: form.school_id,
            recipe_id: form.recipe_id,
            target_portions: Number(form.target_portions)
          }
        ]
      };

      await apiClient("/api/proxy/menu-plans", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create plan");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: "submit" | "approve") => {
    if (!selectedPlanId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/menu-plans/${selectedPlanId}/${action}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${action} plan`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>Menu Planning & MRP</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Flow: buat plan -&gt; submit -&gt; approve</div>
          </div>
          <button className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <form className="card-body" onSubmit={createPlan} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Plan Date
              <input className="input" type="date" value={form.plan_date} onChange={(e) => setForm({ ...form, plan_date: e.target.value })} required />
            </label>
            <label>
              Buffer (%)
              <input className="input" type="number" value={form.buffer_pct} onChange={(e) => setForm({ ...form, buffer_pct: e.target.value })} required />
            </label>
            <label>
              Target Portions
              <input
                className="input"
                type="number"
                min={1}
                value={form.target_portions}
                onChange={(e) => setForm({ ...form, target_portions: e.target.value })}
                required
              />
            </label>
            <label>
              Sekolah
              <select className="select" value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })} required>
                <option value="">Pilih sekolah</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Resep
              <select className="select" value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })} required>
                <option value="">Pilih resep</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="action-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Buat Plan
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy || !selectedPlanId} onClick={() => runAction("submit")}>
              Submit Selected
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy || !selectedPlanId} onClick={() => runAction("approve")}>
              Approve Selected
            </button>
            <span className="badge badge-neutral">
              Selected: {selectedPlan ? `${selectedPlan.plan_date} (${selectedPlan.status})` : "-"}
            </span>
          </div>
          {error ? <div className="badge badge-danger">{error}</div> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Daftar Menu Plan</strong>
        </div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aksi</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Buffer</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>Belum ada planning.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button className="btn btn-secondary" onClick={() => setSelectedPlanId(row.id)}>
                        Pilih
                      </button>
                    </td>
                    <td>{row.plan_date}</td>
                    <td>
                      <span className="badge badge-neutral">{row.status}</span>
                    </td>
                    <td>{row.buffer_pct}</td>
                    <td>{new Date(row.created_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
