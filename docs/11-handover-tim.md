# Handover Tim SPPG Ops (Lokal)

Dokumen ini dipakai sebagai panduan kerja harian tim engineer/QA untuk repo `C:\mbgasoy`.

## 1) Tujuan
1. Tim bisa clone, jalankan, test, dan debug aplikasi tanpa asumsi tersembunyi.
2. Tim paham source-of-truth route, guard keamanan tenant, dan gate kualitas sebelum push.
3. Tim punya checklist operasional yang sama agar hasil konsisten.

## 2) Struktur Tanggung Jawab
1. Backend:
- Menjaga guard route mutasi: `auth -> active_sppg -> permission -> state -> period lock -> idempotency -> audit`.
- Menjaga kontrak API non-breaking.
2. Frontend:
- Menjaga canonical route `/(protected)` tetap jadi jalur utama.
- Menjaga semua aksi tombol kritikal punya feedback jelas dan `data-testid` stabil.
3. QA:
- Menjalankan gate berurutan.
- Menyimpan evidence run (`playwright-report/`, `test-results/`).
4. DBA/Infra:
- Menjaga `deploy:db:assert` tetap hijau (RLS/policy/trigger/integrity).

## 3) Source-of-Truth Aplikasi
1. Canonical route tenant:
- `/planning`
- `/procurement`
- `/inventory`
- `/production`
- `/delivery`
- `/reports`
2. Compatibility route:
- `/app/*` diarahkan ke canonical route.
- Legacy redirect:
  - `/verification` -> `/delivery?tab=verification`
  - `/disputes` -> `/delivery?tab=disputes`
  - `/audit` -> `/reports?tab=audit`
  - `/dashboard` -> `/planning`

## 4) Setup Lokal Cepat
1. Install dependency:
```bash
npm install
npm --prefix web install
```
2. Siapkan env:
- Root `.env`
- `web/.env.local`
3. Inisialisasi DB:
```bash
npm run deploy:db
```
4. Jalankan backend dan frontend:
```bash
npm run dev
npm run web:dev
```
5. Akses:
- `http://localhost:3001/login`

## 5) Akun Uji Seed
Password default akun SQL seed:
- `Passw0rd!`

Akun utama:
1. `superadmin@mbg.local`
2. `admin.sppga@mbg.local`
3. `inventory.sppga@mbg.local`
4. `driver.sppga@mbg.local`
5. `verifier.sppga@mbg.local`
6. `auditor@mbg.local`

## 6) Checklist QA Wajib Sebelum Push
Jalankan urut:
```bash
npm test
npm run build
npm run web:build
npm run deploy:db:assert
npm run e2e:strict
```

Gate penuh:
```bash
npm run qa:full
```

Untuk freeze baseline:
1. `qa:full` wajib pass 2x berurutan.
2. Simpan evidence output dan timestamp run.

## 7) Realtime (SSE) yang Sudah Aktif
Endpoint:
- `GET /workspace/stream?topics=reports,delivery&interval_seconds=10`

Behavior:
1. Reports subscribe topic `reports`.
2. Delivery subscribe topic `delivery`.
3. Jika SSE gagal >=3 kali, frontend otomatis fallback polling (20 detik).
4. Status koneksi tampil di UI (`live`, `fallback`, `connecting`, `error`).

## 8) Aturan Perubahan Kode Tim
1. Dilarang commit secret:
- `.env*`, token, credential file.
2. Dilarang ubah kontrak API publik tanpa update docs + test.
3. Semua endpoint mutasi baru wajib:
- permission guard
- tenant scope
- audit write
- validasi state/idempotency jika relevan
4. Semua tombol aksi baru wajib:
- `data-testid`
- loading/success/error state
- refresh state pasca mutate

## 9) Template Alur Kerja Branch
1. Buat branch fitur:
- `feat/<fitur-ringkas>`
2. Commit message:
- `feat(...)`, `fix(...)`, `docs(...)`, `test(...)`
3. Sebelum push:
- pastikan `git status` bersih dari artefak.
4. Setelah push:
- catat commit hash + status gate.

## 10) Troubleshooting Cepat
1. `EADDRINUSE` port 3000/3001:
- hentikan proses lama, lalu jalankan ulang.
2. Login `HTTP 500`:
- cek backend aktif.
- cek DB sudah `deploy:db`.
3. E2E gagal random:
- ulangi `npm run e2e:strict` setelah build bersih.
- pastikan `reuseExistingServer: false` tetap.
4. Data tidak muncul setelah switch tenant:
- cek `active_sppg` user.
- cek assignment user di SPPG.

## 11) Placeholder Operasional Tim
Isi nilai berikut di dokumen internal tim:
1. `<ISI_NAMA_PIC_BACKEND>`
2. `<ISI_NAMA_PIC_FRONTEND>`
3. `<ISI_NAMA_PIC_QA>`
4. `<ISI_CHANNEL_INCIDENT_TIM>`
5. `<ISI_CHANNEL_RELEASE_TIM>`
6. `<ISI_LINK_DASHBOARD_MONITORING>`

## 12) Definition of Done Tim
Suatu task dianggap selesai jika:
1. Kode + docs sinkron.
2. Test/gate sesuai scope lulus.
3. Tidak ada tenant leak atau silent-fail tombol.
4. Evidence run tercatat.
