"use client";

import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/feedback-states";
import { PageHeader } from "@/components/page-header";
import { apiClient } from "@/lib/api-client";

type SettingsData = {
  sppg_id: string;
  config: Record<string, unknown>;
  config_version: number;
  effective_from: string;
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [configText, setConfigText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const settings = await apiClient<SettingsData>("/api/proxy/settings");
      setData(settings);
      setConfigText(JSON.stringify(settings.config, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal load settings");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(configText) as Record<string, unknown>;
      await apiClient("/api/proxy/settings", {
        method: "PATCH",
        body: JSON.stringify({ config: parsed })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="SPPG Settings"
        subtitle="Kelola konfigurasi tenant dan versioning setting operasional."
        icon={SlidersHorizontal}
        actions={
          <button className="btn btn-secondary icon-btn" data-testid="settings-reload" onClick={() => load()}>
            <RefreshCw size={16} />
            <span>Reload</span>
          </button>
        }
        chips={<span className="status-badge status-neutral">Version: {data?.config_version ?? "-"}</span>}
      />

      <ErrorState message={error} />

      <section className="card">
        <div className="card-header">
          <div>
            <strong>SPPG Settings</strong>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              Version: {data?.config_version ?? "-"} | Effective: {data?.effective_from ?? "-"}
            </div>
          </div>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10 }}>
          <textarea
            className="textarea"
            rows={18}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          />
          <div>
            <button className="btn btn-primary" data-testid="settings-save" onClick={save} disabled={busy}>
              Simpan Versi Baru
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
