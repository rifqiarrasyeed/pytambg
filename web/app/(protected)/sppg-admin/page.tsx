"use client";

import { Building2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient, readData } from "@/lib/api-client";

type SppgRow = {
  id: string;
  code: string;
  name: string;
  status: "PENDING_SETUP" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  timezone: string;
  config: Record<string, unknown> | null;
  config_version: number | null;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  is_super_admin: boolean;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role_scope: string[];
  is_default: boolean;
  status: string;
};

const roleOptions = ["ADMIN_SPPG", "NUTRITIONIST", "INVENTORY", "KITCHEN_PRODUCTION", "DRIVER", "SCHOOL_VERIFIER", "AUDITOR_VIEWER"];

export default function SppgAdminPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sppg, setSppg] = useState<SppgRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedSppgId, setSelectedSppgId] = useState("");

  const [sppgForm, setSppgForm] = useState({
    id: "",
    code: "",
    name: "",
    status: "PENDING_SETUP" as SppgRow["status"],
    timezone: "Asia/Jakarta",
    settings_json: '{\n  "operational_hours": {"start":"05:00","end":"18:00"}\n}'
  });

  const [assignForm, setAssignForm] = useState({
    user_id: "",
    role_scope: ["ADMIN_SPPG"] as string[],
    is_default: false,
    status: "ACTIVE"
  });

  const loadAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const [sppgRes, userRes] = await Promise.all([
        apiClient("/api/proxy/sppg?page=1&page_size=100"),
        apiClient("/api/proxy/users?page=1&page_size=100")
      ]);
      const sppgRows = readData<SppgRow>(sppgRes);
      const userRows = readData<UserRow>(userRes);
      setSppg(sppgRows);
      setUsers(userRows);
      if (!selectedSppgId && sppgRows.length > 0) {
        setSelectedSppgId(sppgRows[0].id);
      }
      if (!assignForm.user_id && userRows.length > 0) {
        setAssignForm((prev) => ({ ...prev, user_id: userRows[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data admin pusat");
    } finally {
      setBusy(false);
    }
  };

  const loadAssignments = async (targetSppgId: string) => {
    if (!targetSppgId) return;
    try {
      const response = await apiClient(`/api/proxy/sppg/${targetSppgId}/assignments?page=1&page_size=100`);
      setAssignments(readData<AssignmentRow>(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat assignments");
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSppgId) {
      void loadAssignments(selectedSppgId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSppgId]);

  const saveSppg = async () => {
    setBusy(true);
    setError(null);
    try {
      const settings = JSON.parse(sppgForm.settings_json) as Record<string, unknown>;
      if (sppgForm.id) {
        await apiClient(`/api/proxy/sppg/${sppgForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: sppgForm.name, status: sppgForm.status, timezone: sppgForm.timezone, settings })
        });
      } else {
        await apiClient("/api/proxy/sppg", {
          method: "POST",
          body: JSON.stringify({ code: sppgForm.code, name: sppgForm.name, timezone: sppgForm.timezone, settings })
        });
      }
      setSppgForm({
        id: "",
        code: "",
        name: "",
        status: "PENDING_SETUP",
        timezone: "Asia/Jakarta",
        settings_json: '{\n  "operational_hours": {"start":"05:00","end":"18:00"}\n}'
      });
      await loadAll();
      if (selectedSppgId) await loadAssignments(selectedSppgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan SPPG");
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    if (!selectedSppgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient(`/api/proxy/sppg/${selectedSppgId}/assign-user`, {
        method: "POST",
        body: JSON.stringify(assignForm)
      });
      await loadAssignments(selectedSppgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal assign user ke SPPG");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Admin Pusat SPPG"
        subtitle="Kelola tenant SPPG dan assignment user lintas role secara terkontrol."
        icon={Building2}
        actions={
          <button className="btn btn-secondary icon-btn" data-testid="sppg-admin-refresh" onClick={() => loadAll()} disabled={busy}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        }
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Admin Pusat SPPG</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div className="grid-3">
            <label>Kode<input className="input" value={sppgForm.code} onChange={(e) => setSppgForm({ ...sppgForm, code: e.target.value })} disabled={Boolean(sppgForm.id)} /></label>
            <label>Nama<input className="input" value={sppgForm.name} onChange={(e) => setSppgForm({ ...sppgForm, name: e.target.value })} /></label>
            <label>Timezone<input className="input" value={sppgForm.timezone} onChange={(e) => setSppgForm({ ...sppgForm, timezone: e.target.value })} /></label>
          </div>
          <div className="grid-3">
            <label>Status
              <select className="select" value={sppgForm.status} onChange={(e) => setSppgForm({ ...sppgForm, status: e.target.value as SppgRow["status"] })}>
                <option value="PENDING_SETUP">PENDING_SETUP</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
          </div>
          <label>Settings JSON<textarea className="textarea" rows={8} value={sppgForm.settings_json} onChange={(e) => setSppgForm({ ...sppgForm, settings_json: e.target.value })} /></label>
          <div className="action-row">
            <button className="btn btn-primary" data-testid="sppg-admin-save-sppg" onClick={saveSppg} disabled={busy}>{sppgForm.id ? "Update SPPG" : "Tambah SPPG"}</button>
            {sppgForm.id ? <button className="btn btn-secondary" data-testid="sppg-admin-cancel-edit" onClick={() => setSppgForm({ id: "", code: "", name: "", status: "PENDING_SETUP", timezone: "Asia/Jakarta", settings_json: '{\n  "operational_hours": {"start":"05:00","end":"18:00"}\n}' })}>Batal Edit</button> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><strong>Daftar SPPG</strong></div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead><tr><th>Aksi</th><th>Kode</th><th>Nama</th><th>Status</th><th>Version</th></tr></thead>
            <tbody>
              {sppg.map((row) => (
                <tr key={row.id}>
                  <td className="action-row">
                    <button className="btn btn-secondary" data-testid="sppg-admin-edit-row" onClick={() => setSppgForm({ id: row.id, code: row.code, name: row.name, status: row.status, timezone: row.timezone, settings_json: JSON.stringify(row.config ?? {}, null, 2) })}>Edit</button>
                    <button className={selectedSppgId === row.id ? "btn btn-primary" : "btn btn-secondary"} data-testid="sppg-admin-select-row" onClick={() => setSelectedSppgId(row.id)}>Pilih</button>
                  </td>
                  <td>{row.code}</td><td>{row.name}</td><td><StatusBadge value={row.status} /></td><td>{row.config_version ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><strong>Assign User ke SPPG</strong></div>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div className="badge badge-neutral">SPPG aktif: {sppg.find((row) => row.id === selectedSppgId)?.code ?? "-"}</div>
          <div className="grid-3">
            <label>User
              <select className="select" value={assignForm.user_id} onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}>
                {users.map((row) => <option key={row.id} value={row.id}>{row.full_name} | {row.email}</option>)}
              </select>
            </label>
            <label>Status
              <select className="select" value={assignForm.status} onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 24 }}>
              <input type="checkbox" checked={assignForm.is_default} onChange={(e) => setAssignForm({ ...assignForm, is_default: e.target.checked })} />
              Jadikan default
            </label>
          </div>
          <div className="action-row" style={{ flexWrap: "wrap" }}>
            {roleOptions.map((role) => (
              <label key={role} className="badge badge-neutral" style={{ gap: 6, display: "inline-flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={assignForm.role_scope.includes(role)}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, role_scope: e.target.checked ? [...prev.role_scope, role] : prev.role_scope.filter((r) => r !== role) }))}
                />
                {role}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" data-testid="sppg-admin-save-assignment" onClick={saveAssignment} disabled={busy || !selectedSppgId || assignForm.role_scope.length === 0}>Simpan Assignment</button>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>User</th><th>Email</th><th>Role Scope</th><th>Default</th><th>Status</th></tr></thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.full_name}</td><td>{row.email}</td><td>{row.role_scope.join(", ")}</td><td>{row.is_default ? "YA" : "TIDAK"}</td><td><StatusBadge value={row.status} /></td>
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
