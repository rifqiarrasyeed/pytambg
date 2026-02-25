"use client";

import { apiClient } from "@/lib/api-client";

export type AttachmentModule = "delivery" | "qc" | "incident" | "invoice" | "export";

type PresignUploadResponse = {
  bucket_name: string;
  object_key: string;
  token: string;
  signed_upload_url: string;
  expires_in_seconds: number;
};

export type CompletedAttachment = {
  id: string;
  bucket_name: string;
  object_key: string;
  checksum_sha256: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeFileSha256(file: File): Promise<string> {
  const raw = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return toHex(digest);
}

export async function uploadAttachment(args: {
  moduleName: AttachmentModule;
  entityId: string;
  file: File;
  capturedAt?: string;
}): Promise<CompletedAttachment> {
  const checksum = await computeFileSha256(args.file);
  const mimeType = args.file.type || "application/octet-stream";

  const presign = await apiClient<PresignUploadResponse>("/api/proxy/attachments/presign-upload", {
    method: "POST",
    body: JSON.stringify({
      module_name: args.moduleName,
      entity_id: args.entityId,
      file_name: args.file.name,
      mime_type: mimeType,
      size_bytes: args.file.size
    })
  });

  const uploadResponse = await fetch(presign.signed_upload_url, {
    method: "PUT",
    headers: {
      "content-type": mimeType,
      "x-upsert": "true"
    },
    body: args.file
  });
  if (!uploadResponse.ok) {
    throw new Error("Upload file ke storage gagal");
  }

  return apiClient<CompletedAttachment>("/api/proxy/attachments/complete", {
    method: "POST",
    body: JSON.stringify({
      module_name: args.moduleName,
      object_key: presign.object_key,
      file_name: args.file.name,
      mime_type: mimeType,
      checksum_sha256: checksum,
      captured_at: args.capturedAt
    })
  });
}
