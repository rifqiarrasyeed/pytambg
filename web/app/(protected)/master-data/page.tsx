"use client";

import { Database, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient, readData } from "@/lib/api-client";
import type { LookupMasterResponse } from "@/lib/contracts";

type School = { id: string; code: string; name: string; address: string | null; sla_minutes: number };
type RouteRow = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Vendor = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Item = { id: string; sku: string; name: string; unit_id: string; track_expiry: boolean; standard_cost: number };
type RecipeItem = { item_id: string; qty_per_portion: number; loss_factor: number };
type Recipe = { id: string; code: string; name: string; yield_portions: number; status: "DRAFT" | "APPROVED" | "ARCHIVED"; items: RecipeItem[] };
type RouteSchool = { school_id: string; school_code: string; school_name: string; stop_order: number };
type SchoolVerifier = { user_id: string; full_name: string; email: string };

type TabKey = "schools" | "routes" | "vendors" | "items" | "recipes" | "route-schools" | "verifiers";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "schools", label: "Sekolah" },
  { key: "routes", label: "Rute" },
  { key: "vendors", label: "Vendor" },
  { key: "items", label: "Item" },
  { key: "recipes", label: "Resep" },
  { key: "route-schools", label: "Rute-Sekolah" },
  { key: "verifiers", label: "Verifier-Sekolah" }
];

function emptyRecipeItem(): RecipeItem {
  return { item_id: "", qty_per_portion: 0, loss_factor: 0 };
}

export default function MasterDataPage() {
  const [tab, setTab] = useState<TabKey>("schools");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupMasterResponse>({});
  const [schools, setSchools] = useState<School[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const [schoolForm, setSchoolForm] = useState({ id: "", code: "", name: "", address: "", sla_minutes: 60 });
  const [routeForm, setRouteForm] = useState<{ id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE" }>({
    id: "",
    code: "",
    name: "",
    status: "ACTIVE"
  });
  const [vendorForm, setVendorForm] = useState<{ id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE" }>({
    id: "",
    code: "",
    name: "",
    status: "ACTIVE"
  });
  const [itemForm, setItemForm] = useState({ id: "", sku: "", name: "", unit_id: "", track_expiry: false, standard_cost: 0 });
  const [recipeForm, setRecipeForm] = useState({
    id: "",
    code: "",
    name: "",
    yield_portions: 100,
    status: "DRAFT" as "DRAFT" | "APPROVED" | "ARCHIVED",
    items: [emptyRecipeItem()]
  });
  const [routeMapRouteId, setRouteMapRouteId] = useState("");
  const [routeMapDraft, setRouteMapDraft] = useState<Array<{ school_id: string; school_name: string; enabled: boolean; stop_order: number }>>([]);
  const [verifierSchoolId, setVerifierSchoolId] = useState("");
  const [selectedVerifierIds, setSelectedVerifierIds] = useState<string[]>([]);

  const itemLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of lookups.items ?? []) map.set(item.id, `${item.sku} | ${item.name}`);
    return map;
  }, [lookups.items]);
  const schoolLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const school of lookups.schools ?? []) map.set(school.id, `${school.code} | ${school.name}`);
    return map;
  }, [lookups.schools]);
  const unitLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of lookups.units ?? []) map.set(unit.id, `${unit.code} | ${unit.name}`);
    return map;
  }, [lookups.units]);

  const loadAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const [schoolsRes, routesRes, vendorsRes, itemsRes, recipesRes, lookupRes] = await Promise.all([
        apiClient("/api/proxy/schools?page=1&page_size=200"),
        apiClient("/api/proxy/routes?page=1&page_size=200"),
        apiClient("/api/proxy/vendors?page=1&page_size=200"),
        apiClient("/api/proxy/items?page=1&page_size=200"),
        apiClient("/api/proxy/recipes?page=1&page_size=200"),
        apiClient<LookupMasterResponse>("/api/proxy/lookups/master?include=schools,routes,vendors,items,recipes,units,verifiers")
      ]);
      setSchools(readData<School>(schoolsRes));
      setRoutes(readData<RouteRow>(routesRes));
      setVendors(readData<Vendor>(vendorsRes));
      setItems(readData<Item>(itemsRes));
      setRecipes(readData<Recipe>(recipesRes));
      setLookups(lookupRes);
      if (!routeMapRouteId) {
        const firstRoute = readData<RouteRow>(routesRes)[0];
        if (firstRoute) {
          setRouteMapRouteId(firstRoute.id);
        }
      }
      if (!verifierSchoolId) {
        const firstSchool = readData<School>(schoolsRes)[0];
        if (firstSchool) {
          setVerifierSchoolId(firstSchool.id);
        }
      }
      if (!itemForm.unit_id && (lookupRes.units?.length ?? 0) > 0) {
        setItemForm((prev) => ({ ...prev, unit_id: lookupRes.units?.[0]?.id ?? "" }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat master data");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRouteMap = async (routeId: string) => {
    if (!routeId) return;
    try {
      const response = await apiClient<{ data: RouteSchool[] }>(`/api/proxy/routes/${routeId}/schools`);
      const existing = new Map(response.data.map((row) => [row.school_id, row]));
      const draft = (lookups.schools ?? []).map((school, idx) => {
        const found = existing.get(school.id);
        return {
          school_id: school.id,
          school_name: `${school.code} | ${school.name}`,
          enabled: Boolean(found),
          stop_order: found?.stop_order ?? idx + 1
        };
      });
      setRouteMapDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat mapping rute");
    }
  };

  const loadVerifierMap = async (schoolId: string) => {
    if (!schoolId) return;
    try {
      const response = await apiClient<{ data: SchoolVerifier[] }>(`/api/proxy/schools/${schoolId}/verifiers`);
      setSelectedVerifierIds(response.data.map((row) => row.user_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat verifier sekolah");
    }
  };

  useEffect(() => {
    if (routeMapRouteId) {
      void loadRouteMap(routeMapRouteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeMapRouteId, lookups.schools]);

  useEffect(() => {
    if (verifierSchoolId) {
      void loadVerifierMap(verifierSchoolId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifierSchoolId]);

  const runSave = async (fn: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : message);
    } finally {
      setBusy(false);
    }
  };

  const saveSchool = async () =>
    runSave(async () => {
      const payload = {
        code: schoolForm.code,
        name: schoolForm.name,
        address: schoolForm.address || undefined,
        sla_minutes: Number(schoolForm.sla_minutes)
      };
      if (schoolForm.id) {
        await apiClient(`/api/proxy/schools/${schoolForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiClient("/api/proxy/schools", { method: "POST", body: JSON.stringify(payload) });
      }
      setSchoolForm({ id: "", code: "", name: "", address: "", sla_minutes: 60 });
    }, "Gagal simpan sekolah");

  const saveRoute = async () =>
    runSave(async () => {
      const payload = { code: routeForm.code, name: routeForm.name, status: routeForm.status };
      if (routeForm.id) {
        await apiClient(`/api/proxy/routes/${routeForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiClient("/api/proxy/routes", { method: "POST", body: JSON.stringify(payload) });
      }
      setRouteForm({ id: "", code: "", name: "", status: "ACTIVE" });
    }, "Gagal simpan rute");

  const saveVendor = async () =>
    runSave(async () => {
      const payload = { code: vendorForm.code, name: vendorForm.name, status: vendorForm.status };
      if (vendorForm.id) {
        await apiClient(`/api/proxy/vendors/${vendorForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiClient("/api/proxy/vendors", { method: "POST", body: JSON.stringify(payload) });
      }
      setVendorForm({ id: "", code: "", name: "", status: "ACTIVE" });
    }, "Gagal simpan vendor");

  const saveItem = async () =>
    runSave(async () => {
      const payload = {
        sku: itemForm.sku,
        name: itemForm.name,
        unit_id: itemForm.unit_id,
        track_expiry: itemForm.track_expiry,
        standard_cost: Number(itemForm.standard_cost)
      };
      if (itemForm.id) {
        await apiClient(`/api/proxy/items/${itemForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiClient("/api/proxy/items", { method: "POST", body: JSON.stringify(payload) });
      }
      setItemForm((prev) => ({ ...prev, id: "", sku: "", name: "", track_expiry: false, standard_cost: 0 }));
    }, "Gagal simpan item");

  const saveRecipe = async () =>
    runSave(async () => {
      const normalizedItems = recipeForm.items.filter((row) => row.item_id);
      if (normalizedItems.length === 0) {
        throw new Error("BOM recipe wajib minimal 1 item");
      }
      const payload = {
        code: recipeForm.code,
        name: recipeForm.name,
        yield_portions: Number(recipeForm.yield_portions),
        status: recipeForm.status,
        items: normalizedItems.map((row) => ({
          item_id: row.item_id,
          qty_per_portion: Number(row.qty_per_portion),
          loss_factor: Number(row.loss_factor)
        }))
      };
      if (recipeForm.id) {
        await apiClient(`/api/proxy/recipes/${recipeForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiClient("/api/proxy/recipes", { method: "POST", body: JSON.stringify(payload) });
      }
      setRecipeForm({ id: "", code: "", name: "", yield_portions: 100, status: "DRAFT", items: [emptyRecipeItem()] });
    }, "Gagal simpan recipe");

  const saveRouteMap = async () =>
    runSave(async () => {
      if (!routeMapRouteId) return;
      const schoolsPayload = routeMapDraft
        .filter((row) => row.enabled)
        .map((row) => ({ school_id: row.school_id, stop_order: Number(row.stop_order) }))
        .sort((a, b) => a.stop_order - b.stop_order);
      await apiClient(`/api/proxy/routes/${routeMapRouteId}/schools`, {
        method: "PUT",
        body: JSON.stringify({ schools: schoolsPayload })
      });
      await loadRouteMap(routeMapRouteId);
    }, "Gagal simpan mapping rute");

  const saveVerifierMap = async () =>
    runSave(async () => {
      if (!verifierSchoolId) return;
      await apiClient(`/api/proxy/schools/${verifierSchoolId}/verifiers`, {
        method: "PUT",
        body: JSON.stringify({ verifier_user_ids: selectedVerifierIds })
      });
      await loadVerifierMap(verifierSchoolId);
    }, "Gagal simpan verifier sekolah");

  return (
    <div className="page">
      <PageHeader
        title="Master Data Operasional"
        subtitle="Kelola sekolah, rute, vendor, item, resep, dan mapping verifikasi lintas SPPG."
        icon={Database}
        actions={
          <button className="btn btn-secondary icon-btn" data-testid="master-refresh" onClick={() => loadAll()} disabled={busy}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <div>
            <strong>Master Data Operasional</strong>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Kelola sekolah, rute, vendor, item, recipe, dan mapping.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="action-row" style={{ flexWrap: "wrap" }}>
            {tabs.map((row) => (
              <button key={row.key} data-testid={`master-tab-${row.key}`} className={tab === row.key ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setTab(row.key)}>
                {row.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {tab === "schools" ? (
        <section className="card">
          <div className="card-header"><strong>Sekolah</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <div className="grid-3">
              <label>Kode<input className="input" value={schoolForm.code} onChange={(e) => setSchoolForm({ ...schoolForm, code: e.target.value })} /></label>
              <label>Nama<input className="input" value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} /></label>
              <label>SLA<input className="input" type="number" value={schoolForm.sla_minutes} onChange={(e) => setSchoolForm({ ...schoolForm, sla_minutes: Number(e.target.value) })} /></label>
            </div>
            <label>Alamat<input className="input" value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-school" onClick={saveSchool} disabled={busy}>{schoolForm.id ? "Update" : "Tambah"}</button>
              {schoolForm.id ? <button className="btn btn-secondary" onClick={() => setSchoolForm({ id: "", code: "", name: "", address: "", sla_minutes: 60 })}>Batal</button> : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Aksi</th><th>Kode</th><th>Nama</th><th>SLA</th></tr></thead>
                <tbody>
                  {schools.map((row) => (
                    <tr key={row.id}>
                      <td><button className="btn btn-secondary" onClick={() => setSchoolForm({ id: row.id, code: row.code, name: row.name, address: row.address ?? "", sla_minutes: row.sla_minutes })}>Edit</button></td>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.sla_minutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "routes" ? (
        <section className="card">
          <div className="card-header"><strong>Rute</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <div className="grid-3">
              <label>Kode<input className="input" value={routeForm.code} onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })} /></label>
              <label>Nama<input className="input" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} /></label>
              <label>Status
                <select className="select" value={routeForm.status} onChange={(e) => setRouteForm({ ...routeForm, status: e.target.value as "ACTIVE" | "INACTIVE" })}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-route" onClick={saveRoute} disabled={busy}>{routeForm.id ? "Update" : "Tambah"}</button>
              {routeForm.id ? <button className="btn btn-secondary" onClick={() => setRouteForm({ id: "", code: "", name: "", status: "ACTIVE" })}>Batal</button> : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Aksi</th><th>Kode</th><th>Nama</th><th>Status</th></tr></thead>
                <tbody>
                  {routes.map((row) => (
                    <tr key={row.id}>
                      <td><button className="btn btn-secondary" onClick={() => setRouteForm({ id: row.id, code: row.code, name: row.name, status: row.status })}>Edit</button></td>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td><StatusBadge value={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "vendors" ? (
        <section className="card">
          <div className="card-header"><strong>Vendor</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <div className="grid-3">
              <label>Kode<input className="input" value={vendorForm.code} onChange={(e) => setVendorForm({ ...vendorForm, code: e.target.value })} /></label>
              <label>Nama<input className="input" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></label>
              <label>Status
                <select className="select" value={vendorForm.status} onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value as "ACTIVE" | "INACTIVE" })}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-vendor" onClick={saveVendor} disabled={busy}>{vendorForm.id ? "Update" : "Tambah"}</button>
              {vendorForm.id ? <button className="btn btn-secondary" onClick={() => setVendorForm({ id: "", code: "", name: "", status: "ACTIVE" })}>Batal</button> : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Aksi</th><th>Kode</th><th>Nama</th><th>Status</th></tr></thead>
                <tbody>
                  {vendors.map((row) => (
                    <tr key={row.id}>
                      <td><button className="btn btn-secondary" onClick={() => setVendorForm({ id: row.id, code: row.code, name: row.name, status: row.status })}>Edit</button></td>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td><StatusBadge value={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "items" ? (
        <section className="card">
          <div className="card-header"><strong>Item</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <div className="grid-3">
              <label>SKU<input className="input" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} /></label>
              <label>Nama<input className="input" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} /></label>
              <label>Satuan
                <select className="select" value={itemForm.unit_id} onChange={(e) => setItemForm({ ...itemForm, unit_id: e.target.value })}>
                  <option value="">Pilih satuan</option>
                  {(lookups.units ?? []).map((row) => <option key={row.id} value={row.id}>{row.code} | {row.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid-3">
              <label>Cost<input className="input" type="number" value={itemForm.standard_cost} onChange={(e) => setItemForm({ ...itemForm, standard_cost: Number(e.target.value) })} /></label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 24 }}>
                <input type="checkbox" checked={itemForm.track_expiry} onChange={(e) => setItemForm({ ...itemForm, track_expiry: e.target.checked })} />
                Track expiry
              </label>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-item" onClick={saveItem} disabled={busy}>{itemForm.id ? "Update" : "Tambah"}</button>
              {itemForm.id ? <button className="btn btn-secondary" onClick={() => setItemForm((prev) => ({ ...prev, id: "", sku: "", name: "", track_expiry: false, standard_cost: 0 }))}>Batal</button> : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Aksi</th><th>SKU</th><th>Nama</th><th>Satuan</th><th>Expiry</th></tr></thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td><button className="btn btn-secondary" onClick={() => setItemForm({ id: row.id, sku: row.sku, name: row.name, unit_id: row.unit_id, track_expiry: row.track_expiry, standard_cost: Number(row.standard_cost) })}>Edit</button></td>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{unitLabelById.get(row.unit_id) ?? row.unit_id}</td>
                      <td>{row.track_expiry ? "YA" : "TIDAK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "recipes" ? (
        <section className="card">
          <div className="card-header"><strong>Resep (BOM)</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <div className="grid-3">
              <label>Kode<input className="input" value={recipeForm.code} onChange={(e) => setRecipeForm({ ...recipeForm, code: e.target.value })} /></label>
              <label>Nama<input className="input" value={recipeForm.name} onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })} /></label>
              <label>Yield<input className="input" type="number" value={recipeForm.yield_portions} onChange={(e) => setRecipeForm({ ...recipeForm, yield_portions: Number(e.target.value) })} /></label>
            </div>
            <div className="grid-3">
              <label>Status
                <select className="select" value={recipeForm.status} onChange={(e) => setRecipeForm({ ...recipeForm, status: e.target.value as "DRAFT" | "APPROVED" | "ARCHIVED" })}>
                  <option value="DRAFT">DRAFT</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Item</th><th>Qty/Portion</th><th>Loss</th><th>Aksi</th></tr></thead>
                <tbody>
                  {recipeForm.items.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="select" value={row.item_id} onChange={(e) => setRecipeForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...x, item_id: e.target.value } : x)) }))}>
                          <option value="">Pilih item</option>
                          {(lookups.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.sku} | {item.name}</option>)}
                        </select>
                      </td>
                      <td><input className="input" type="number" step="0.0001" value={row.qty_per_portion} onChange={(e) => setRecipeForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...x, qty_per_portion: Number(e.target.value) } : x)) }))} /></td>
                      <td><input className="input" type="number" step="0.01" value={row.loss_factor} onChange={(e) => setRecipeForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...x, loss_factor: Number(e.target.value) } : x)) }))} /></td>
                      <td><button className="btn btn-secondary" onClick={() => setRecipeForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items }))}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="action-row">
              <button className="btn btn-secondary" onClick={() => setRecipeForm((prev) => ({ ...prev, items: [...prev.items, emptyRecipeItem()] }))}>Tambah BOM</button>
              <button className="btn btn-primary" data-testid="master-save-recipe" onClick={saveRecipe} disabled={busy}>{recipeForm.id ? "Update" : "Tambah"}</button>
              {recipeForm.id ? <button className="btn btn-secondary" onClick={() => setRecipeForm({ id: "", code: "", name: "", yield_portions: 100, status: "DRAFT", items: [emptyRecipeItem()] })}>Batal</button> : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Aksi</th><th>Kode</th><th>Nama</th><th>Status</th><th>BOM</th></tr></thead>
                <tbody>
                  {recipes.map((row) => (
                    <tr key={row.id}>
                      <td><button className="btn btn-secondary" onClick={() => setRecipeForm({ id: row.id, code: row.code, name: row.name, yield_portions: Number(row.yield_portions), status: row.status, items: row.items?.length ? row.items : [emptyRecipeItem()] })}>Edit</button></td>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td><StatusBadge value={row.status} /></td>
                      <td>{(row.items ?? []).map((it) => itemLabelById.get(it.item_id) ?? it.item_id).join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "route-schools" ? (
        <section className="card">
          <div className="card-header"><strong>Mapping Rute - Sekolah</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <label>Rute
              <select className="select" value={routeMapRouteId} onChange={(e) => setRouteMapRouteId(e.target.value)}>
                <option value="">Pilih rute</option>
                {routes.map((row) => <option key={row.id} value={row.id}>{row.code} | {row.name}</option>)}
              </select>
            </label>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Pakai</th><th>Sekolah</th><th>Urutan</th></tr></thead>
                <tbody>
                  {routeMapDraft.map((row, idx) => (
                    <tr key={row.school_id}>
                      <td><input type="checkbox" checked={row.enabled} onChange={(e) => setRouteMapDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)))} /></td>
                      <td>{row.school_name}</td>
                      <td><input className="input" type="number" min={1} value={row.stop_order} onChange={(e) => setRouteMapDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, stop_order: Number(e.target.value) } : x)))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-route-map" onClick={saveRouteMap} disabled={busy || !routeMapRouteId}>Simpan Mapping</button>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "verifiers" ? (
        <section className="card">
          <div className="card-header"><strong>Verifier Sekolah</strong></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <label>Sekolah
              <select className="select" value={verifierSchoolId} onChange={(e) => setVerifierSchoolId(e.target.value)}>
                <option value="">Pilih sekolah</option>
                {(lookups.schools ?? []).map((row) => <option key={row.id} value={row.id}>{row.code} | {row.name}</option>)}
              </select>
            </label>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Pilih</th><th>Nama</th><th>Email</th></tr></thead>
                <tbody>
                  {(lookups.verifiers ?? []).map((row) => (
                    <tr key={row.id}>
                      <td><input type="checkbox" checked={selectedVerifierIds.includes(row.id)} onChange={(e) => setSelectedVerifierIds((prev) => (e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)))} /></td>
                      <td>{row.full_name}</td>
                      <td>{row.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" data-testid="master-save-verifier-map" onClick={saveVerifierMap} disabled={busy || !verifierSchoolId}>Simpan Verifier</button>
              <span className="badge badge-neutral">{schoolLabelById.get(verifierSchoolId) ?? "-"}</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
