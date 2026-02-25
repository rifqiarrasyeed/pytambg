import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config";
import { query } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import {
  buildObjectKey,
  createSignedReadUrl,
  createSignedUpload,
  resolveBucket,
  verifyUploadedObject,
  type AttachmentModule
} from "../../services/supabase-storage";
import { notFound, unprocessable } from "../../utils/api-error";

const moduleSchema = z.enum(["delivery", "qc", "incident", "invoice", "export"]);

const uploadSchema = z.object({
  bucket_name: z.string().max(80).optional(),
  object_key: z.string().min(3),
  file_name: z.string().min(1),
  mime_type: z.string().min(3),
  size_bytes: z.number().int().positive(),
  checksum_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/)
});

const presignSchema = z.object({
  module_name: moduleSchema,
  entity_id: z.string().uuid(),
  file_name: z.string().min(3),
  mime_type: z.string().min(3),
  size_bytes: z.number().int().positive()
});

const completeSchema = z.object({
  module_name: moduleSchema,
  object_key: z.string().min(3),
  file_name: z.string().min(1),
  mime_type: z.string().min(3),
  checksum_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  captured_at: z.string().datetime().optional()
});

const signedUrlSchema = z.object({
  expires_in_seconds: z.number().int().min(60).max(3600).optional()
});

function resolveModule(moduleName: z.infer<typeof moduleSchema>): AttachmentModule {
  return moduleName;
}

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/attachments/presign-upload",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ATTACHMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = presignSchema.parse(request.body);

      if (body.size_bytes > config.maxUploadBytes) {
        throw unprocessable(`Ukuran file melebihi batas ${config.maxUploadBytes} bytes`);
      }

      const moduleName = resolveModule(body.module_name);
      const bucket = resolveBucket(moduleName);
      const objectKey = buildObjectKey({
        sppgId,
        moduleName,
        entityId: body.entity_id,
        fileName: body.file_name
      });

      const presign = await createSignedUpload({
        bucket,
        objectKey
      });

      return reply.status(201).send({
        bucket_name: bucket,
        object_key: objectKey,
        token: presign.token,
        signed_upload_url: presign.signedUrl,
        expires_in_seconds: config.storageUploadSignedUrlTtlSeconds
      });
    }
  );

  app.post(
    "/attachments/complete",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ATTACHMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = completeSchema.parse(request.body);

      const bucket = resolveBucket(resolveModule(body.module_name));
      const verified = await verifyUploadedObject({
        bucket,
        objectKey: body.object_key,
        checksumSha256: body.checksum_sha256
      });

      const attachmentId = randomUUID();
      await query(
        `
          INSERT INTO attachments (
            id, sppg_id, bucket_name, object_key, file_name, mime_type, size_bytes,
            checksum_sha256, uploaded_by, uploaded_at, captured_at, captured_by,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, now(), $10::timestamptz, $9,
            now(), $9, now(), $9
          )
        `,
        [
          attachmentId,
          sppgId,
          bucket,
          body.object_key,
          body.file_name,
          body.mime_type,
          verified.sizeBytes,
          body.checksum_sha256.toLowerCase(),
          request.auth!.user_id,
          body.captured_at ?? null
        ]
      );

      await writeAudit({
        sppgId,
        entityTable: "attachments",
        entityId: attachmentId,
        action: "CREATE",
        newValue: {
          bucket_name: bucket,
          object_key: body.object_key,
          file_name: body.file_name,
          mime_type: body.mime_type,
          size_bytes: verified.sizeBytes,
          checksum_sha256: body.checksum_sha256.toLowerCase(),
          captured_at: body.captured_at ?? null
        },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(201).send({
        id: attachmentId,
        bucket_name: bucket,
        object_key: body.object_key,
        checksum_sha256: body.checksum_sha256.toLowerCase(),
        mime_type: body.mime_type,
        size_bytes: verified.sizeBytes,
        uploaded_at: new Date().toISOString()
      });
    }
  );

  app.get(
    "/attachments/:id/signed-url",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ATTACHMENT_READ);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const queryParams = signedUrlSchema.parse(request.query);

      const result = await query<{
        id: string;
        bucket_name: string;
        object_key: string;
      }>(
        `
          SELECT id, bucket_name, object_key
          FROM attachments
          WHERE id = $1 AND sppg_id = $2
          LIMIT 1
        `,
        [params.id, sppgId]
      );

      const attachment = result.rows[0];
      if (!attachment) {
        throw notFound("Attachment tidak ditemukan");
      }

      const signedUrl = await createSignedReadUrl({
        bucket: attachment.bucket_name,
        objectKey: attachment.object_key,
        expiresInSeconds: queryParams.expires_in_seconds
      });

      return reply.send({
        id: attachment.id,
        bucket_name: attachment.bucket_name,
        object_key: attachment.object_key,
        signed_url: signedUrl,
        expires_in_seconds: queryParams.expires_in_seconds ?? config.storageSignedUrlTtlSeconds
      });
    }
  );

  app.post(
    "/attachments",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ATTACHMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = uploadSchema.parse(request.body);

      const attachmentId = randomUUID();
      await query(
        `
          INSERT INTO attachments (
            id, sppg_id, bucket_name, object_key, file_name, mime_type, size_bytes,
            checksum_sha256, uploaded_by, uploaded_at, captured_at, captured_by,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, now(), NULL, $9,
            now(), $9, now(), $9
          )
        `,
        [
          attachmentId,
          sppgId,
          body.bucket_name ?? config.supabaseBuckets.deliveryProofs,
          body.object_key,
          body.file_name,
          body.mime_type,
          body.size_bytes,
          body.checksum_sha256.toLowerCase(),
          request.auth!.user_id
        ]
      );

      await writeAudit({
        sppgId,
        entityTable: "attachments",
        entityId: attachmentId,
        action: "CREATE",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(201).send({
        id: attachmentId,
        bucket_name: body.bucket_name ?? config.supabaseBuckets.deliveryProofs,
        checksum_sha256: body.checksum_sha256.toLowerCase(),
        mime_type: body.mime_type,
        uploaded_at: new Date().toISOString()
      });
    }
  );
}
