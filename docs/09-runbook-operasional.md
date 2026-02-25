# Runbook Operasional Harian

## 1) Awal Hari
1. Login role operasional.
2. Pastikan `active_sppg` benar.
3. Cek dashboard alert:
   - dispute terbuka
   - incident high/critical
   - missing proof delivery

## 2) Siklus Operasional
1. Planning disiapkan dan diapprove.
2. PO dibuat, disubmit, diapprove.
3. GRN diposting dengan bukti invoice.
4. Produksi start/finalize + QC.
5. Manifest delivery dibuat dan dijalankan.
6. Sekolah verifikasi, mismatch masuk dispute.

## 3) Akhir Hari
1. Review KPI harian.
2. Pastikan dispute kritikal ditangani.
3. Lock period harian.
4. Jalankan rekonsiliasi stok.

## 4) Rekonsiliasi Harian
1. Bandingkan `stock_moves` vs `stock_balances_mv`.
2. Cek delta planned vs produced vs verified.
3. Cek bukti delivery yang belum lengkap.

## 5) SOP Unlock Period
1. Hanya role berizin (`period.unlock`).
2. Wajib isi alasan unlock.
3. Audit unlock wajib diperiksa.
4. Setelah koreksi selesai, lakukan relock.

## 6) SOP Incident/Dispute
1. Kategorikan severity.
2. Lampirkan bukti.
3. Tunjuk PIC resolusi.
4. Update status sampai closed/resolved.

## 7) Operasional Worker
Worker yang perlu aktif:
- `npm run worker:reports`
- `npm run worker:maintenance`

