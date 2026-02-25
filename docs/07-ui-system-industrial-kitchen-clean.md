# UI System: Industrial Kitchen Clean

## Arah Visual
Karakter tampilan:
- tegas dan operasional
- kontras status jelas
- warna hangat-netral untuk konteks dapur
- fokus keterbacaan data lapangan

Referensi stylesheet:
- [globals.css](/c:/mbgasoy/web/app/globals.css)

## Design Tokens Utama
- `--bg`, `--surface`, `--surface-2`, `--line`
- `--brand`, `--brand-2`
- `--ok`, `--warn`, `--danger`
- `--radius`, `--shadow`

## Komponen Dasar
1. `Card`  
   Wadah utama setiap modul.
2. `Badge`  
   Status visual cepat (`ok/warn/danger/neutral`).
3. `Button`  
   Touch target minimal `44px`.
4. `Input/Select`  
   Fokus ring jelas untuk validasi form.
5. `Action Row`  
   sticky di mobile untuk aksi utama cepat.

## Pola Layar Operasional
Semua modul mengikuti pola:
1. `Filter/Form`
2. `Aksi utama`
3. `Tabel/list hasil`
4. `Refresh/Error state`

## Mobile-first Rules
1. Sidebar jadi drawer.
2. Aksi utama tetap terjangkau jempol.
3. Tabel tetap bisa scroll horizontal.
4. Status utama tampil sebagai badge, bukan teks panjang.

## Peningkatan Human-readable Data
Prioritas tampilan:
1. tampilkan nama/kode bisnis (`po_no`, `manifest_no`, nama sekolah/vendor/item)
2. UUID hanya fallback jika label bisnis tidak tersedia.

## Empty/Loading/Error
Minimal setiap halaman memiliki:
- tombol `Refresh`
- pesan kosong yang jelas
- banner error dari envelope backend
- disable state saat submit (`busy`)

