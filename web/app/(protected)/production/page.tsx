"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, readData } from "@/lib/api-client";
import type { LookupMasterResponse, PaginatedResponse } from "@/lib/contracts";
import { fetchMasterLookups } from "@/lib/lookups";

type RunRow = { id: string; run_date: string; menu_plan_id: string; status: string; started_at: string | null; finalized_at: string | null };
type MenuPlan = { id: string; plan_date: string; status: string };

export default function ProductionPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [plans, setPlans] = useState<MenuPlan[]>([]);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [selectedRunId, setSelectedRunId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createForm, setCreateForm] = useState({ menu_plan_id: "", run_date: "" });
  const [finalizeForm, setFinalizeForm] = useState({
    school_id: "",
    recipe_id: "",
    output_portions: "0",
    deviation_reason: "",
    temperature_c: "72"
  });

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);
  const planDateById = useMemo(() => {
    const map = new Map<string, string>();
    for (const plan of plans) {
      map.set(plan.id, plan.plan_date);
    }
    return map;
  }, [plans]);
  const schools = lookups.schools ?? [];
  const recipes = lookups.recipes ?? [];

  const load = async () => {
    try {
      const [runData, planData, lookupData] = await Promise.all([
        apiClient<PaginatedResponse<RunRow>>("/api/proxy/production-runs?page=1&page_size=50"),
        apiClient<PaginatedResponse<MenuPlan>>("/api/proxy/menu-plans?page=1&page_size=50"),
        fetchMasterLookups(["schools", "recipes"])
      ]);
      const runRows = readData<RunRow>(runData);
      const planRows = readData<MenuPlan>(planData);

      setRuns(runRows);
      setPlans(planRows);
      setLookups(lookupData);

      if (!selectedRunId && runRows.length > 0) {
        setSelectedRunId(runRows[0].id);
      }
      if (!createForm.menu_plan_id && planRows.length > 0) {
        setCreateForm((prev) => ({ ...prev, menu_plan_id: planRows[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load production runs");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRun = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient("/api/proxy/production-runs", {
        method: "POST",
        body: JSON.stringify(createForm)
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal create run");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: "start" | "finalize") => {
    if (!selectedRunId) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "start") {
        await apiClient(`/api/proxy/production-runs/${selectedRunId}/start`, {
          method: "POST",
          body: JSON.stringify({})
        });
      } else {
        await apiClient(`/api/proxy/production-runs/${selectedRunId}/finalize`, {
          method: "POST",
          body: JSON.stringify({
            outputs: [
              {
                school_id: finalizeForm.school_id,
                recipe_id: finalizeForm.recipe_id,
                output_portions: Number(finalizeForm.output_portions),
                deviation_reason: finalizeForm.deviation_reason || undefined
              }
            ],
            qc_checks: [
              {
                check_type: "TEMPERATURE",
                temperature_c: Number(finalizeForm.temperature_c),
                checked_at: new Date().toISOString()
              }
            ]
          })
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${action} run`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <strong>Production Run Harian</strong>
        </div>
        <form className="card-body" onSubmit={createRun} style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Menu Plan
              <select className="select" value={createForm.menu_plan_id} onChange={(e) => setCreateForm({ ...createForm, menu_plan_id: e.target.value })} required>
                <option value="">Pilih menu plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.plan_date} - {plan.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Run Date
              <input className="input" type="date" value={createForm.run_date} onChange={(e) => setCreateForm({ ...createForm, run_date: e.target.value })} required />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Buat Run
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Start / Finalize</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Selected Run
              <select className="select" value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)}>
                <option value="">Pilih run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.run_date} - {run.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sekolah
              <select className="select" value={finalizeForm.school_id} onChange={(e) => setFinalizeForm({ ...finalizeForm, school_id: e.target.value })} required>
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
              <select className="select" value={finalizeForm.recipe_id} onChange={(e) => setFinalizeForm({ ...finalizeForm, recipe_id: e.target.value })} required>
                <option value="">Pilih resep</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Output Portions
              <input
                className="input"
                type="number"
                min={0}
                value={finalizeForm.output_portions}
                onChange={(e) => setFinalizeForm({ ...finalizeForm, output_portions: e.target.value })}
              />
            </label>
            <label>
              Temperature QC
              <input className="input" type="number" value={finalizeForm.temperature_c} onChange={(e) => setFinalizeForm({ ...finalizeForm, temperature_c: e.target.value })} />
            </label>
            <label>
              Deviation Reason
              <input className="input" value={finalizeForm.deviation_reason} onChange={(e) => setFinalizeForm({ ...finalizeForm, deviation_reason: e.target.value })} />
            </label>
          </div>

          <div className="action-row">
            <button className="btn btn-secondary" type="button" onClick={() => runAction("start")} disabled={busy || !selectedRunId}>
              Start Selected
            </button>
            <button className="btn btn-primary" type="button" onClick={() => runAction("finalize")} disabled={busy || !selectedRunId}>
              Finalize Selected
            </button>
            <span className="badge badge-neutral">
              Selected: {selectedRun ? `${selectedRun.run_date} (${selectedRun.status})` : "-"}
            </span>
          </div>
          {error ? <div className="badge badge-danger">{error}</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Daftar Production Runs</strong>
          <button className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aksi</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <button className="btn btn-secondary" onClick={() => setSelectedRunId(run.id)}>
                      Pilih
                    </button>
                  </td>
                  <td>{run.run_date}</td>
                  <td>
                    <span className="badge badge-neutral">{run.status}</span>
                  </td>
                  <td>{planDateById.get(run.menu_plan_id) ?? run.menu_plan_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
