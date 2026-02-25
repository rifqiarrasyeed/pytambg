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

