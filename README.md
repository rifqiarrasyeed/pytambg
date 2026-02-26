# SPPG Ops SaaS (Next.js + Prisma + Midtrans)

Aplikasi SaaS operasional Dapur SPPG dengan fokus:
1. Multi-tenant anti bocor (`tenant_id` enforced server-side)
2. Workflow harian dapur (`plan -> produksi -> distribusi -> POD -> verifikasi -> laporan`)
3. Billing subscription otomatis Midtrans (Snap + webhook idempotent)
4. Audit trail mutasi kritikal

## Stack
- Next.js App Router + TypeScript (frontend + backend route handlers)
- Prisma ORM + PostgreSQL
- Auth: NextAuth Credentials + JWT session
- Validation: Zod
- UI: Tailwind + komponen gaya shadcn
- Storage bukti: local dev / S3-compatible production (signed URL)
- Billing: Midtrans (Snap + webhook)

## Struktur utama
- `web/app/app/*` Tenant console
- `web/app/platform/*` Platform internal (ops/admin)
- `web/app/api/*` API route handlers
- `web/lib/core/*` auth, tenant scope, RBAC, audit, billing, storage
- `web/prisma/schema.prisma` schema
- `web/prisma/migrations/0001_init/migration.sql` migrasi awal
- `web/prisma/seed.ts` seed akun dan data demo
- `web/prisma/rls.sql` hardening RLS deny-all role client
- `docker-compose.yml` local stack

## Setup lokal cepat
1. Copy env:
```bash
copy .env.example .env
copy web\.env.example web\.env.local
```
2. Install dependencies:
```bash
npm install
npm --prefix web install
```
3. Generate prisma client:
```bash
npm run web:db:push
npm --prefix web run prisma:generate
```
4. Seed data demo:
```bash
npm run web:db:seed
```
5. Jalankan web app:
```bash
npm run web:dev
```
Akses: `http://localhost:3001`

## Env minimum lokal
Pastikan nilai ini valid sebelum run:
1. Root `.env`:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Web `web/.env.local`:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (contoh lokal: `http://localhost:3001`)
   - `NEXT_PUBLIC_APP_URL`
   - `API_BASE_URL` (contoh lokal: `http://127.0.0.1:3000`)

## Akun seed default
- Platform Admin: `platform.admin@mbg.local` / `Admin#12345`
- Platform Ops: `platform.ops@mbg.local` / `Admin#12345`
- Tenant Owner: `admin@demo.local` / `Admin#12345`
- Tenant Driver: `driver@demo.local` / `Admin#12345`
- School Verifier: `verifier@demo.local` / `Admin#12345`

## Midtrans setup
Isi env berikut:
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `MIDTRANS_MERCHANT_ID`
- `MIDTRANS_IS_PRODUCTION`
- `MIDTRANS_WEBHOOK_SIGNATURE_MODE`

Webhook endpoint:
- `POST /api/billing/midtrans/webhook`

Verifikasi webhook:
- Signature hash SHA512 (`order_id + status_code + gross_amount + server_key`)
- Event idempotent via `MidtransEvent.providerEventId` (unique)

## Upload bukti
Flow:
1. `POST /api/files/presign-upload`
2. Upload file ke signed URL (PUT)
3. `POST /api/files/complete`
4. Akses baca via `GET /api/files/:id/signed-url`

## Minimal test
Jalankan:
```bash
npm run web:test
npm run web:build
```

Tes yang disediakan:
- `web/tests/tenant-scope.test.ts`: tenant isolation negative
- `web/tests/midtrans-webhook-idempotency.test.ts`: webhook duplikat tidak diproses ganda

## Docker compose
Jalankan:
```bash
docker compose up --build
```
Service:
- `app` (Next.js)
- `db` (PostgreSQL)
- `minio` (opsional object storage)

## Baseline Stabil Lokal (RC)
Branch freeze:
- `feat/rc-local-audit-coverage`

Head saat freeze:
- `094b941 feat(audit): harden audit coverage observability + filters + rc checks`

Timestamp freeze:
- `2026-02-27 01:03:01 +07:00`

Gate utama:
```bash
npm run qa:full
```
Wajib lulus 2x berurutan sebelum push baseline.

Catatan reliability:
1. `e2e:strict` sekarang otomatis pakai server production (`npm run start` + `npm run web:start`) jika build tersedia (`dist/index.js` dan `web/.next/BUILD_ID`).
2. Jika build belum tersedia, runner fallback ke mode dev.
3. Legacy redirect tetap aktif:
   - `/verification` -> `/delivery?tab=verification`
   - `/disputes` -> `/delivery?tab=disputes`
   - `/audit` -> `/reports?tab=audit`
   - `/dashboard` -> `/planning`

## Operasi Harian Solo (Quick Check)
```bash
npm run qa:quick
npm run e2e:strict
```

Smoke manual ringkas:
1. Login.
2. Planning -> Procurement -> Inventory.
3. Production -> Delivery -> Verify/Dispute.
4. Reports (overview + tab advanced).

Lokasi evidence:
- `playwright-report/`
- `test-results/`

## Catatan penting keamanan
- Jangan commit secret `.env`
- `tenant_id` tidak boleh diambil dari body request
- Endpoint platform tidak boleh expose data operasional tenant
- Status subscription `SUSPENDED` hanya read/export (write diblok)

## Referensi Midtrans
- Snap overview: https://docs.midtrans.com/docs/snap-overview
- Payment notification/webhook: https://docs.midtrans.com/docs/https-notification-webhooks
- Subscription/recurring: https://docs.midtrans.com/reference/one-click

