# QA, UAT, dan Regression Lokal

## Quality Gate Wajib
1. `npm test` lulus.
2. `npm run build` lulus.
3. `npm run web:build` lulus.
4. checklist UAT kritikal lulus.
5. negative security tests tenant lulus.

## 1) Automated Check
```bash
npm test
npm run build
npm run web:build
```

## 2) Database Integrity Check
```bash
psql "<ISI_DATABASE_URL_POOLER>" -f sql/check_integrity.sql
psql "<ISI_DATABASE_URL_POOLER>" -f sql/check_rls.sql
```

## 2.1) Reliability Core (Solo Operator)
```bash
npm run qa:quick
npm run e2e:strict
npm run qa:full
```

Checklist reliability:
1. Tidak ada warning `allowedDevOrigins` saat `npm run e2e:strict`.
2. Tidak ada warning chart `width(-1)` / `height(-1)`.
3. `qa:full` lulus minimal 2x run berurutan sebelum freeze/push.

Troubleshooting cepat:
1. Port conflict (`EADDRINUSE`):
   - hentikan proses lama di port 3000/3001 lalu rerun.
2. Stale process Playwright:
   - pastikan `playwright.config.ts` tetap `reuseExistingServer: false`.
3. Date collision data UAT (plan/lock):
   - rerun dengan data fixture tanggal baru (helper `futureDateSafe` di `e2e/support.ts`).
4. Backend proxy tidak reachable:
   - cek backend aktif di `http://127.0.0.1:3000`, frontend proxy otomatis fallback ke URL ini jika env kosong.

## 3) Skenario Wajib (Ringkas)
1. Login valid/invalid/inactive.
2. Switch SPPG assigned/unassigned.
3. Cross-tenant read by ID ditolak.
4. Cross-tenant mutate by ID ditolak.
5. Body `sppg_id` diabaikan.
6. Driver tidak bisa ubah data produksi.
7. Verifier tidak bisa verify sekolah lain.
8. Submit plan tanpa BOM ditolak.
9. Approve saat lock ditolak.
10. PO illegal transition ditolak.
11. GRN tanpa idempotency ditolak.
12. GRN replay same payload sama.
13. GRN same key payload beda conflict.
14. Expiry item tanpa lot/expiry ditolak.
15. Update/delete stock_moves ditolak trigger.
16. Update/delete audit_logs ditolak trigger.
17. Self-approval kritikal ditolak.
18. Production start stok kurang ditolak.
19. Finalize tanpa QC minimal ditolak.
20. Delivery lompat status ditolak.
21. Proof tanpa attachment ditolak.
22. Verify mismatch tanpa reason+bukti ditolak.
23. Resolve dispute stock action menghasilkan stock move.
24. Mutasi di period lock ditolak.
25. Unlock tanpa reason ditolak.
26. Signed URL lintas tenant ditolak.
27. Audit mutasi kritikal lengkap old/new + actor metadata.

## 4) UAT Flow End-to-End
1. Planning -> Procurement -> Receiving.
2. Production start/finalize + QC.
3. Delivery -> proof -> verify.
4. Dispute create -> resolve.
5. Opname submit -> approve.
6. Lock -> unlock period.

## 5) Bukti Hasil QA yang Harus Disimpan
- screenshot hasil build/test pass.
- export query check_integrity/check_rls.
- catatan defect + status fix.
- rekaman langkah UAT per role.

## 6) Evidence Freeze Baseline (Solo Operator)
- Timestamp freeze: `2026-02-26 18:40:35 +07:00`
- Branch kerja: `feat/hardening-sync-backend-db-rls`
- Hasil gate:
  - `npm run deploy:db` -> pass
  - `npm run deploy:db:assert` -> pass
  - `npm run qa:full` -> pass run #1
  - `npm run qa:full` -> pass run #2
- Artefak:
  - `playwright-report/`
  - `test-results/`
