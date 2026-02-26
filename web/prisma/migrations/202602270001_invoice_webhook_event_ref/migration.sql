ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "lastWebhookEventId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_lastWebhookEventId_idx"
ON "Invoice" ("lastWebhookEventId");
