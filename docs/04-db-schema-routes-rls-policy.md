# DB Schema, Route Map, RLS, dan Policy

## Skema DB Ringkas
Referensi utama: [schema.sql](/c:/mbgasoy/sql/schema.sql)

Kelompok tabel:
1. Tenancy dan security  
   `sppg`, `sppg_settings`, `users`, `user_sppg`, `sessions_tokens`
2. Master  
   `schools`, `routes`, `vendors`, `inventory_items`, `recipes`
3. Operasional  
   `menu_plans`, `purchases`, `receipts`, `stock_moves`, `production_runs`, `deliveries`, `disputes`
4. Audit dan kontrol  
   `audit_logs`, `change_requests`, `period_locks`, `idempotency_keys`

## Trigger Integritas
1. `stock_moves` append-only  
   Update/delete ditolak trigger immutable.
2. `audit_logs` write-once  
   Update/delete ditolak trigger immutable.

## Route Map
Referensi implementasi route:
- `src/modules/*/routes.ts`

Pola umum:
- endpoint `GET` list/read
- endpoint `POST/PATCH` mutasi
- route kritikal memakai state machine + audit

## RLS dan Policy (Defense-in-Depth)
RLS ditetapkan di level tabel operasional dengan policy:
- `deny_all_clients`
- berlaku untuk role `anon`, `authenticated`
- `USING (false) WITH CHECK (false)`

Tujuan:
- mencegah akses langsung dari client role ke tabel operasional.
- memastikan semua akses operasional tetap lewat backend API.

## SQL Verifikasi Integritas
1. Cek integritas umum: [check_integrity.sql](/c:/mbgasoy/sql/check_integrity.sql)
2. Cek RLS/policy: [check_rls.sql](/c:/mbgasoy/sql/check_rls.sql)
3. Refresh saldo stok MV: [refresh_stock_balances.sql](/c:/mbgasoy/sql/refresh_stock_balances.sql)

## Eksekusi Cek (Contoh)
```bash
psql "<ISI_DATABASE_URL_POOLER>" -f sql/check_integrity.sql
psql "<ISI_DATABASE_URL_POOLER>" -f sql/check_rls.sql
psql "<ISI_DATABASE_URL_POOLER>" -f sql/refresh_stock_balances.sql
```

## Catatan Penting
- RLS ini bukan pengganti guard backend.
- Guard backend tetap sumber kontrol utama tenancy + permission + workflow.

