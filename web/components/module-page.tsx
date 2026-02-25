"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

type Column = {
  key: string;
  label: string;
};

type FieldType = "text" | "number" | "date" | "datetime-local" | "select";

type FormField = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

type ModulePageProps = {
  title: string;
  description: string;
  listPath: string;
  columns: Column[];
  createPath?: string;
  formFields?: FormField[];
  defaultPayload?: Record<string, unknown>;
};

function badgeClass(value: unknown): string {
  const text = String(value ?? "").toUpperCase();
  if (["APPROVED", "VERIFIED", "CLOSED", "ACTIVE", "POSTED", "SUCCEEDED", "LOCKED"].includes(text)) {
    return "badge badge-ok";
  }
  if (["REJECTED", "FAILED", "VOIDED", "DISPUTED", "CANCELLED"].includes(text)) {
    return "badge badge-danger";
  }
  return "badge badge-warn";
}

function asArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as Array<Record<string, unknown>>;
    }
  }
  return [];
}

export function ModulePage(props: ModulePageProps) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of props.formFields ?? []) {
      initial[field.name] = "";
    }
    return initial;
  });

  const canCreate = useMemo(() => Boolean(props.createPath && props.formFields && props.formFields.length > 0), [props]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<unknown>(`/api/proxy${props.listPath}`);
      setRows(asArray(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.listPath]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!props.createPath) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { ...(props.defaultPayload ?? {}) };
      for (const field of props.formFields ?? []) {
        const raw = formState[field.name];
        if (field.type === "number") {
          payload[field.name] = Number(raw);
        } else {
          payload[field.name] = raw;
        }
      }

      await apiClient(`/api/proxy${props.createPath}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setFormState((prev) => {
        const next: Record<string, string> = {};
        for (const key of Object.keys(prev)) {
          next[key] = "";
        }
        return next;
      });

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{props.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{props.description}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
        {canCreate ? (
          <form className="card-body" onSubmit={submit} style={{ display: "grid", gap: 10 }}>
            <div className="grid-3">
              {(props.formFields ?? []).map((field) => (
                <label key={field.name} style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{field.label}</span>
                  {field.type === "select" ? (
                    <select
                      className="select"
                      value={formState[field.name] ?? ""}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          [field.name]: event.target.value
                        }))
                      }
                      required={field.required}
                    >
                      <option value="">Pilih...</option>
                      {(field.options ?? []).map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={field.type ?? "text"}
                      value={formState[field.name] ?? ""}
                      placeholder={field.placeholder}
                      required={field.required}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          [field.name]: event.target.value
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card">
        <div className="card-header">
          <strong>Data</strong>
          {loading ? <span className="badge badge-neutral">Loading...</span> : <span className="badge badge-neutral">{rows.length} baris</span>}
        </div>
        <div className="card-body">
          {error ? <div className="badge badge-danger">{error}</div> : null}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {props.columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={props.columns.length} style={{ color: "var(--muted)" }}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={(row.id as string) ?? index}>
                      {props.columns.map((column) => {
                        const value = row[column.key];
                        const isStatus = /status|state/.test(column.key);
                        return (
                          <td key={`${index}-${column.key}`}>
                            {isStatus ? (
                              <span className={badgeClass(value)}>{String(value ?? "-")}</span>
                            ) : typeof value === "object" && value !== null ? (
                              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(value)}</pre>
                            ) : (
                              String(value ?? "-")
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
