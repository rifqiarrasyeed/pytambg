# Audit dan Traceability

## Prinsip Audit
Semua mutasi kritikal wajib menghasilkan record audit yang memuat:
- `entity_table`
- `entity_id`
- `action`
- `old_value`
- `new_value`
- `actor_user_id`
- `actor_role`
- `request_id`
- `ip`, `user_agent`, `device_id` (jika tersedia)
- `occurred_at`

Referensi implementasi:
- [audit-service.ts](/c:/mbgasoy/src/services/audit-service.ts)
- [audit route](/c:/mbgasoy/src/modules/audit/routes.ts)

## Traceability Bukti
Flow attachment:
1. `presign-upload`
2. upload file ke signed URL
3. `complete`
4. akses baca via signed URL pendek

Metadata penting:
- `bucket_name`
- `object_key`
- `mime_type`
- `size_bytes`
- `checksum_sha256`
- `captured_at`
- `captured_by`

## Chain-of-Custody Distribusi
Proof delivery terkait:
- `delivery_stop_id`
- `proof_type`
- `captured_at`
- geo opsional (`lat`, `lng`)
- attachment referensi

Jika mismatch:
- wajib dispute.
- jika dispute diresolve dengan stock action, jejak lanjut ke `stock_moves`.

## Integritas Ledger
1. `stock_moves` immutable.
2. `audit_logs` write-once.
3. rekonsiliasi `stock_balances_mv` wajib rutin.

## Audit Pack Konseptual
Kompilasi bukti audit per hari:
- ringkasan operasional
- manifest + proof
- ledger stock move
- audit log mutasi
- daftar approval/koreksi

