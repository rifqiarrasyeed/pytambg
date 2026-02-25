"use client";

import { RefreshCw, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { apiClient } from "@/lib/api-client";

type AuditRow = {
  id: string;
  entity_table: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  actor_role: string;
  occurred_at: string;
  old_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
};

type UserLookup = {
  id: string;
  full_name: string;
  email: string;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<UserLookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    entity_table: "",
    actor_user_id: "",
    start_at: "",
    end_at: "",
    limit: "200"
  });
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const load = async () => {
    const params = new URLSearchParams();
    if (filters.entity_table) params.set("entity_table", filters.entity_table);
    if (filters.actor_user_id) params.set("actor_user_id", filters.actor_user_id);
    if (filters.start_at) params.set("start_at", new Date(filters.start_at).toISOString());
    if (filters.end_at) params.set("end_at", new Date(filters.end_at).toISOString());
    params.set("limit", filters.limit || "200");

    try {
      const [auditData, usersData] = await Promise.all([
        apiClient<{ data: AuditRow[] }>(`/api/proxy/audit-logs?${params.toString()}`),
        apiClient<{ data: UserLookup[] }>("/api/proxy/users?page=1&page_size=200")
      ]);
      const activeUsers = usersData.data ?? [];
      setUsers(activeUsers);
      setRows(auditData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load audit");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Audit Trail"
        subtitle="Forensik perubahan data kritikal: actor, waktu, entity, dan diff old/new."
        icon={ScrollText}
        actions={
          <button className="btn btn-secondary icon-btn" onClick={() => load()}>
            <RefreshCw size={16} />
            <span>Filter</span>
          </button>
        }
        chips={<span className="status-badge status-neutral">{rows.length} log entries</span>}
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <strong>Audit Trail</strong>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10 }}>
          <div className="grid-3">
            <label>
              Entity Table
              <input className="input" value={filters.entity_table} onChange={(e) => setFilters({ ...filters, entity_table: e.target.value })} />
            </label>
            <label>
              Actor
              <select className="select" value={filters.actor_user_id} onChange={(e) => setFilters({ ...filters, actor_user_id: e.target.value })}>
                <option value="">Semua Actor</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} | {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start At
              <input className="input" type="datetime-local" value={filters.start_at} onChange={(e) => setFilters({ ...filters, start_at: e.target.value })} />
            </label>
            <label>
              End At
              <input className="input" type="datetime-local" value={filters.end_at} onChange={(e) => setFilters({ ...filters, end_at: e.target.value })} />
            </label>
            <label>
              Limit
              <input className="input" type="number" value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: e.target.value })} />
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Log Entries</strong>
        </div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.occurred_at).toLocaleString("id-ID")}</td>
                  <td>
                    {row.entity_table}
                    <br />
                    <small>{row.entity_id}</small>
                  </td>
                  <td>
                    <StatusBadge value={row.action} />
                  </td>
                  <td>
                    {(userById.get(row.actor_user_id)?.full_name ?? row.actor_user_id)}
                    <br />
                    <small>
                      {(userById.get(row.actor_user_id)?.email ?? row.actor_role)}
                    </small>
                  </td>
                  <td>
                    <details>
                      <summary>Lihat old/new</summary>
                      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify({ old: row.old_value, new: row.new_value }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
