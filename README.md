# MBG Ops (SPPG) - Backend + Frontend + Deploy Automation

Implementasi end-to-end operasional dapur MBG multi-tenant dengan audit trail, traceability, dan kontrol status state-machine.

## Dokumentasi
Dokumentasi detail tersedia di folder `docs/`:
- [00-indeks-dokumen.md](/c:/mbgasoy/docs/00-indeks-dokumen.md)
- [01-setup-lokal.md](/c:/mbgasoy/docs/01-setup-lokal.md)
- [02-arsitektur-dan-tenancy.md](/c:/mbgasoy/docs/02-arsitektur-dan-tenancy.md)
- [03-api-kontrak.md](/c:/mbgasoy/docs/03-api-kontrak.md)
- [04-db-schema-routes-rls-policy.md](/c:/mbgasoy/docs/04-db-schema-routes-rls-policy.md)
- [05-workflow-state-machine.md](/c:/mbgasoy/docs/05-workflow-state-machine.md)
- [06-audit-traceability.md](/c:/mbgasoy/docs/06-audit-traceability.md)
- [07-ui-system-industrial-kitchen-clean.md](/c:/mbgasoy/docs/07-ui-system-industrial-kitchen-clean.md)
- [08-qa-uat-regression.md](/c:/mbgasoy/docs/08-qa-uat-regression.md)
- [09-runbook-operasional.md](/c:/mbgasoy/docs/09-runbook-operasional.md)
- [10-template-placeholder.md](/c:/mbgasoy/docs/10-template-placeholder.md)

## Arsitektur
- Backend API: Fastify + TypeScript (`src/`)
- Database: PostgreSQL/Supabase (`sql/schema.sql`, `sql/seed.sql`)
- Storage bukti: Supabase private buckets + signed URL
- Frontend: Next.js App Router (`web/`)
- Worker:
  - `report-worker` (proses `reports_jobs`)
  - `maintenance-worker` (purge idempotency + refresh `stock_balances_mv`)
- Deploy orchestration: `scripts/deploy/*.ts` (Supabase + Render + Vercel + smoke test)

## Fitur Inti
- Multi-tenant scope berbasis `active_sppg` (backend inject scope, body `sppg_id` diabaikan)
- Guard anti cross-tenant pada resource (`id + sppg_id`)
- RBAC by role (`SUPER_ADMIN`, `ADMIN_SPPG`, `NUTRITIONIST`, dst)
- Audit log old/new + actor metadata
- Inventory ledger append-only (`stock_moves` immutable trigger)
- Audit logs write-once trigger
- State machine delivery/planning/procurement/production/opname/period-lock
- Idempotency untuk `receipts`, delivery proof, verify
- Attachment checksum + signed URL flow:
  - `POST /attachments/presign-upload`
  - `POST /attachments/complete`
  - `GET /attachments/:id/signed-url`
- Kontrak list paginated standar:
  - Query: `page`, `page_size`, `search`, `status`, `date_from`, `date_to`, `sort_by`, `sort_dir`
  - Response: `{ data, page, page_size, total, has_next }`
- Lookup operasional form:
  - `GET /lookups/master?include=schools,routes,vendors,items,recipes,drivers,units,verifiers`
- Context permission untuk UI:
  - `GET /me/context`
- Endpoint admin pusat:
  - `GET /users`
  - `GET /sppg/:id/assignments`

## Struktur Direktori
- `src/` backend modules, guards, services
- `sql/` schema, seed, util checks
- `scripts/deploy/` provisioning scripts
- `web/` frontend Next.js mobile-first

## Setup Backend Lokal
1. Copy env:
   - `copy .env.example .env`
2. Install:
   - `npm install`
3. Migrasi schema:
   - `npm run migrate`
4. Seed:
   - `psql <DATABASE_URL> -f sql/seed.sql`
5. Jalankan API:
   - `npm run dev`

### Perintah Backend
- Build: `npm run build`
- Test: `npm test`
- Worker report: `npm run worker:reports`
- Worker maintenance: `npm run worker:maintenance`

## Setup Frontend Lokal
1. Copy env frontend:
   - `copy web\\.env.example web\\.env.local`
2. Install frontend:
   - `npm --prefix web install`
3. Jalankan frontend:
   - `npm run web:dev`
   - default berjalan di `http://localhost:3001`
4. Build frontend:
   - `npm run web:build`

Catatan port lokal:
- Backend API default: `http://127.0.0.1:3000`
- Frontend Next.js default: `http://localhost:3001`

Catatan UX lokal:
- Modul utama (planning, procurement, inventory, production, delivery, verification, disputes, incidents) sudah diarahkan ke pola pilih data dari dropdown/list, bukan input ID manual sebagai jalur utama.
- Halaman master dan admin pusat tersedia:
  - `http://localhost:3001/master-data`
  - `http://localhost:3001/sppg-admin`
- Upload bukti memakai flow resmi backend: `presign-upload -> upload -> complete` (tanpa input manual `attachment_id`).

### Akun Seed UAT (lokal)
- Password default semua akun: `Passw0rd!`
- `superadmin@mbg.local` (`SUPER_ADMIN`)
- `admin.sppga@mbg.local` (`ADMIN_SPPG`)
- `nutritionist.sppga@mbg.local` (`NUTRITIONIST`)
- `inventory.sppga@mbg.local` (`INVENTORY`)
- `kitchen.sppga@mbg.local` (`KITCHEN_PRODUCTION`)
- `driver.sppga@mbg.local` (`DRIVER`)
- `verifier.sppga@mbg.local` (`SCHOOL_VERIFIER`)
- `auditor@mbg.local` (`AUDITOR_VIEWER`)
- `admin.sppgb@mbg.local` (`ADMIN_SPPG`, tenant SPPG-B)

## Deploy Automation
Set env sesuai target lalu jalankan:
- DB reset (opsional lokal/UAT): `npm run deploy:db:reset`
- DB init: `npm run deploy:db`
- Storage init: `npm run deploy:storage`
- Render provision: `npm run deploy:render`
- Vercel provision: `npm run deploy:vercel`
- Smoke test: `npm run deploy:smoke`
- Full chain: `npm run deploy:all`

Template env provisioning tersedia di:
- `scripts/deploy/.env.example`

### Env penting backend
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET_DELIVERY_PROOFS`, `SUPABASE_BUCKET_QC_PROOFS`, `SUPABASE_BUCKET_INCIDENT_PROOFS`, `SUPABASE_BUCKET_INVOICES`, `SUPABASE_BUCKET_EXPORTS`

### Env penting provisioning
- `RENDER_API_KEY` (+ `RENDER_SERVICE_ID` atau `RENDER_OWNER_ID` + `RENDER_REPO_URL`)
- `VERCEL_TOKEN` (+ `VERCEL_PROJECT_NAME`, optional `VERCEL_GIT_REPO`)
- `SMOKE_API_BASE_URL` (+ optional `SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`)

## SQL Utilities
- Refresh saldo stok MV:
  - `sql/refresh_stock_balances.sql`
- Integrity checks:
  - `sql/check_integrity.sql`
- RLS checks:
  - `sql/check_rls.sql`

## Catatan Keamanan
- Operasional data **hanya** lewat backend API (backend-only DB access)
- Supabase storage bucket disetel private
- Signed URL durasi pendek
- Lampiran memiliki metadata checksum SHA-256
