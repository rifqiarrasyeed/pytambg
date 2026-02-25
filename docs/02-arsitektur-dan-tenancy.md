# Arsitektur dan Tenancy MBG Ops

## Ringkasan Arsitektur
- Backend API: Fastify + TypeScript.
- DB: PostgreSQL (Supabase).
- Storage bukti: Supabase bucket private + signed URL.
- Frontend: Next.js App Router.
- Worker: laporan dan maintenance.

## Prinsip Isolasi Tenant
1. Semua tabel transaksi kritikal memiliki `sppg_id NOT NULL`.
2. `sppg_id` tidak boleh dipercaya dari request body.
3. Scope tenant selalu dari `active_sppg` di JWT/session.
4. Akses by-id non-superadmin wajib filter `id + sppg_id`.

## Alur Scope Request
1. User login.
2. Backend tentukan `active_sppg_id` dari assignment aktif.
3. JWT berisi `active_sppg_id`, `roles`, `session_id`.
4. Endpoint mutasi/list membaca `request.activeSppgId`.
5. Query resource dilakukan dengan filter tenant.

## Pola Guard Endpoint
Urutan target pada endpoint mutasi operasional:
1. `authenticate`
2. `requireActiveSppg`
3. `requirePermission`
4. `assertTransition` (jika endpoint stateful)
5. `assertPeriodUnlocked` (jika endpoint berbasis tanggal operasional)
6. `writeAudit`

## Role dan Scope Ringkas
- `SUPER_ADMIN`: lintas tenant.
- `ADMIN_SPPG`: kendali tenant.
- `NUTRITIONIST`: planning/menu.
- `INVENTORY`: procurement, receiving, stock.
- `KITCHEN_PRODUCTION`: produksi.
- `DRIVER`: status delivery + proof.
- `SCHOOL_VERIFIER`: verify/dispute.
- `AUDITOR_VIEWER`: read-only audit/report.

## Keamanan Defense-in-Depth
1. Guard di aplikasi backend.
2. Trigger DB immutable untuk ledger dan audit.
3. RLS deny-all untuk role client (`anon`, `authenticated`).
4. Storage proof private dengan signed URL TTL pendek.

