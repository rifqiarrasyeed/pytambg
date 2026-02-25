# Setup Lokal MBG Ops

Dokumen ini menjelaskan langkah setup dari nol sampai siap UAT lokal.

## Prasyarat
- Node.js `>=18`.
- NPM aktif.
- Akses project Supabase yang valid.
- `psql` (opsional, untuk query SQL manual).

## 1) Isi Environment
Gunakan file `.env` di root project.

Nilai minimum wajib:
- `DATABASE_URL=<ISI_DATABASE_URL_POOLER>`
- `JWT_ACCESS_SECRET=<ISI_JWT_ACCESS_SECRET_64_HEX>`
- `JWT_REFRESH_SECRET=<ISI_JWT_REFRESH_SECRET_64_HEX>`
- `SUPABASE_URL=<ISI_SUPABASE_URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<ISI_SUPABASE_SERVICE_ROLE_KEY>`

Frontend (`web/.env.local`) minimum:
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`
- `NEXT_PUBLIC_SUPABASE_URL=<ISI_SUPABASE_URL>`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ISI_SUPABASE_PUBLISHABLE_KEY>`

Catatan port lokal:
- Backend: `3000`
- Frontend: `3001`

## 2) Instalasi Dependensi
```bash
npm install
npm --prefix web install
```

## 3) Inisialisasi Database
Reset (opsional untuk baseline UAT bersih):
```bash
npm run deploy:db:reset
```

Init schema + seed:
```bash
npm run deploy:db
```

Init storage bucket private:
```bash
npm run deploy:storage
```

## 4) Jalankan Service Lokal
Backend:
```bash
npm run dev
```

Frontend:
```bash
npm run web:dev
```

## 5) Akun Seed UAT
Password default:
- `Passw0rd!`

Contoh akun:
- `superadmin@mbg.local`
- `admin.sppga@mbg.local`
- `nutritionist.sppga@mbg.local`
- `inventory.sppga@mbg.local`
- `kitchen.sppga@mbg.local`
- `driver.sppga@mbg.local`
- `verifier.sppga@mbg.local`
- `auditor@mbg.local`

## 6) Verifikasi Dasar
Backend health:
```bash
curl http://127.0.0.1:3000/health
```

Build/test:
```bash
npm test
npm run build
npm run web:build
```

## Troubleshooting Cepat
### Port frontend bentrok `EADDRINUSE:3001`
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen
Stop-Process -Id <PID> -Force
```

### Login frontend error `HTTP 500`
Pastikan:
- Frontend berjalan di `3001`.
- `NEXT_PUBLIC_API_BASE_URL` mengarah ke backend `127.0.0.1:3000`.

