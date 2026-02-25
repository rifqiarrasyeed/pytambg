# Template Placeholder Wajib

Dokumen ini mendefinisikan placeholder standar yang wajib dipakai lintas dokumentasi dan konfigurasi.

## Aturan Format
Gunakan format:
- `<ISI_NAMA_PLACEHOLDER>`

Jangan gunakan:
- `xxxx`
- `ganti-disini`
- `todo`

## Daftar Placeholder Inti
1. `<ISI_DATABASE_URL_POOLER>`
2. `<ISI_SUPABASE_URL>`
3. `<ISI_SUPABASE_SERVICE_ROLE_KEY>`
4. `<ISI_SUPABASE_PUBLISHABLE_KEY>`
5. `<ISI_JWT_ACCESS_SECRET_64_HEX>`
6. `<ISI_JWT_REFRESH_SECRET_64_HEX>`
7. `<ISI_NEXT_PUBLIC_API_BASE_URL>`
8. `<ISI_NAMA_BUCKET_DELIVERY_PROOFS>`
9. `<ISI_NAMA_BUCKET_QC_PROOFS>`
10. `<ISI_NAMA_BUCKET_INCIDENT_PROOFS>`
11. `<ISI_NAMA_BUCKET_INVOICES>`
12. `<ISI_NAMA_BUCKET_EXPORTS>`
13. `<ISI_EMAIL_ADMIN_SPPG_A>`
14. `<ISI_PASSWORD_UAT_ROLE>`
15. `<ISI_IDEMPOTENCY_KEY_UNIK>`

## Contoh Benar
```env
DATABASE_URL=<ISI_DATABASE_URL_POOLER>
SUPABASE_URL=<ISI_SUPABASE_URL>
JWT_ACCESS_SECRET=<ISI_JWT_ACCESS_SECRET_64_HEX>
JWT_REFRESH_SECRET=<ISI_JWT_REFRESH_SECRET_64_HEX>
NEXT_PUBLIC_API_BASE_URL=<ISI_NEXT_PUBLIC_API_BASE_URL>
```

## Contoh Salah
```env
DATABASE_URL=isi-sendiri
SUPABASE_URL=-
JWT_ACCESS_SECRET=123
```

## Template Checklist Isi Placeholder
- [ ] Semua placeholder env backend terisi.
- [ ] Semua placeholder env frontend terisi.
- [ ] Bucket storage sesuai naming final.
- [ ] Akun UAT role sudah disiapkan.
- [ ] Tidak ada secret aktual dipublikasikan di dokumen publik.

