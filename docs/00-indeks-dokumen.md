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

