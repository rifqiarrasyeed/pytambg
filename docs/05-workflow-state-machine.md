# Workflow Kritis dan State Machine

## 1) Planning
Alur:
1. Buat `menu_plans` status `DRAFT`.
2. Submit -> `SUBMITTED`.
3. Approve -> `APPROVED`.

Kontrol:
- recipe BOM harus lengkap.
- tidak boleh approve jika lock period aktif.
- self-approval dapat ditolak sesuai policy.

## 2) Procurement dan Receiving
Alur:
1. PO `DRAFT` -> `SUBMITTED` -> `APPROVED`.
2. GRN diposting dengan idempotency key.
3. Selisih qty/harga wajib reason sesuai rule.

Kontrol:
- item expiry wajib lot/expiry.
- GRN wajib idempotency.
- attachment bukti invoice wajib.

## 3) Inventory dan Opname
Alur:
1. Stock move tercatat append-only.
2. Opname `DRAFT` -> `SUBMITTED` -> `APPROVED` -> `POSTED`.

Kontrol:
- tidak boleh edit/delete stock move.
- adjustment besar ikut jalur approval pusat.
- mutate ditolak saat period lock.

## 4) Production
Alur:
1. Run `PLANNED` -> `IN_PROGRESS`.
2. Finalize -> `FINALIZED`.

Kontrol:
- stok minimum harus cukup.
- QC minimal wajib saat finalize.
- output negatif ditolak.

## 5) Delivery, Proof, Verification
Alur:
1. Manifest `PLANNED` -> `LOADED` -> `IN_TRANSIT` -> `DELIVERED`.
2. Proof upload (idempotent).
3. Verification: `MATCH` -> `VERIFIED`, `MISMATCH` -> `DISPUTED`.

Kontrol:
- driver hanya update status/proof.
- verifier harus sekolah yang berhak.
- mismatch wajib reason + attachment.

## 6) Dispute Resolution
Alur:
1. Create dispute.
2. Resolve `ACCEPT`/`REJECT`.
3. Jika ada stock action, sistem post `stock_moves`.

Kontrol:
- dispute final tidak boleh diresolve ulang.
- stock action wajib field pendukung (`item_id`, `qty`, `reason_code`).

## 7) Period Lock
Alur:
1. `OPEN` -> `LOCKED`.
2. Unlock: `LOCKED` -> `UNLOCK_REQUESTED` -> `UNLOCKED`.

Kontrol:
- unlock wajib reason.
- lock/unlock wajib audit.

