"use client";

import { useMemo, useState } from "react";
import { uploadAttachment, type AttachmentModule, type CompletedAttachment } from "@/lib/attachments";

type Props = {
  moduleName: AttachmentModule;
  entityId: string;
  label?: string;
  accept?: string;
  disabled?: boolean;
  required?: boolean;
  onUploaded: (attachment: CompletedAttachment | null) => void;
};

export function AttachmentUploader({
  moduleName,
  entityId,
  label = "Bukti",
  accept = "image/*",
  disabled,
  required,
  onUploaded
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<CompletedAttachment | null>(null);

  const canUpload = useMemo(() => {
    return !disabled && !uploading && Boolean(file) && Boolean(entityId);
  }, [disabled, uploading, file, entityId]);

  const clearAttachment = () => {
    setAttachment(null);
    setError(null);
    setFile(null);
    onUploaded(null);
  };

  const submitUpload = async () => {
    if (!file || !entityId) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const completed = await uploadAttachment({
        moduleName,
        entityId,
        file
      });
      setAttachment(completed);
      onUploaded(completed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload attachment gagal");
      setAttachment(null);
      onUploaded(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {label} {required ? "(wajib)" : "(opsional)"}
        </span>
        <input
          className="input"
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] ?? null;
            setFile(selected);
            setAttachment(null);
            setError(null);
            onUploaded(null);
          }}
        />
      </label>
      <div className="action-row">
        <button className="btn btn-secondary" type="button" onClick={submitUpload} disabled={!canUpload}>
          {uploading ? "Mengunggah..." : "Upload Bukti"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={clearAttachment} disabled={uploading && !attachment}>
          Reset
        </button>
        {attachment ? <span className="badge badge-ok">Attachment tersimpan</span> : null}
      </div>
      {attachment ? (
        <div className="badge badge-neutral" style={{ justifySelf: "start" }}>
          {attachment.id}
        </div>
      ) : null}
      {error ? <div className="badge badge-danger">{error}</div> : null}
    </div>
  );
}
