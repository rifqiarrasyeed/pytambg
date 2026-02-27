# Indeks Dokumen MBG Ops (Lokal)

Dokumen ini menjadi pintu masuk utama untuk memahami sistem MBG Ops yang berjalan lokal, audit-ready, dan multi-tenant ketat.

## Urutan Baca
1. `01-setup-lokal.md`  
   Tujuan: jalankan backend, frontend, DB, seed, worker, dan validasi awal.
2. `02-arsitektur-dan-tenancy.md`  
   Tujuan: pahami batas tenant, alur `active_sppg`, dan anti data-leak.
3. `03-api-kontrak.md`  
   Tujuan: kontrak API yang dipakai frontend dan integrasi eksternal.
4. `04-db-schema-routes-rls-policy.md`  
   Tujuan: lihat skema DB, route map, trigger immutable, RLS policy.
5. `05-workflow-state-machine.md`  
   Tujuan: pahami alur operasional per modul beserta state transition.
6. `06-audit-traceability.md`  
   Tujuan: jejak audit, attachment checksum, chain-of-custody.
7. `07-ui-system-industrial-kitchen-clean.md`  
   Tujuan: prinsip desain UI mobile-first dan komponen visual.
8. `08-qa-uat-regression.md`  
   Tujuan: test matrix, negative security test, acceptance gate.
9. `09-runbook-operasional.md`  
   Tujuan: SOP harian, lock period, dispute, incident handling.
10. `10-template-placeholder.md`  
   Tujuan: daftar placeholder wajib isi tim deploy/infrastruktur.
11. `11-handover-tim.md`  
   Tujuan: panduan onboarding engineer/QA, SOP perubahan kode, gate sebelum push, dan troubleshooting tim.

## Definisi Istilah Operasional
- `SPPG`: tenant dapur operasional MBG.
- `active_sppg`: konteks tenant aktif di sesi user.
- `Menu Plan`: rencana porsi menu per sekolah.
- `GRN`: goods receipt note (penerimaan barang).
- `Stock Move`: ledger append-only untuk setiap mutasi stok.
- `Manifest`: dokumen distribusi per rute.
- `Proof`: bukti foto/ttd/QR untuk chain-of-custody.
- `Dispute`: selisih serah-terima yang wajib resolusi terkontrol.
- `Period Lock`: penguncian periode agar tidak ada backdated mutation.

## Cakupan Lokal Fase Ini
- Fokus ke kualitas lokal end-to-end.
- Deploy ke hosting/domain bukan bagian dokumen ini.

## Baseline RC Terbaru
- Branch: `feat/rc-local-audit-coverage`
- Head freeze sebelumnya: `4a52fba`
- Snapshot hardening lanjutan: `2026-02-27 09:32:08 +07:00` (local-only, pre-push commit fase ini)
- Dokumen acuan QA: `08-qa-uat-regression.md`
- Gate acuan: `npm run qa:full` (wajib pass 2x berurutan)
- Canonical route operasional: `/planning`, `/procurement`, `/inventory`, `/production`, `/delivery`, `/reports`
- Realtime additive aktif: SSE `/workspace/stream` + fallback polling otomatis di Reports/Delivery
