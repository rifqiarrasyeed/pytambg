# Kontrak API Operasional (Ringkas)

## Base URL Lokal
- Backend API: `http://127.0.0.1:3000`
- Frontend proxy: `/api/proxy/*`

## Kompatibilitas Route Legacy (Frontend)
Route lama tetap hidup sebagai redirect agar bookmark lama tidak putus:
1. `/verification` -> `/delivery?tab=verification`
2. `/disputes` -> `/delivery?tab=disputes`
3. `/audit` -> `/reports?tab=audit`
4. `/dashboard` -> `/planning`

## Error Envelope Baku
```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Role tidak memiliki izin",
    "details": {},
    "request_id": "req_123",
    "timestamp": "2026-02-25T10:00:00Z"
  }
}
```

## Kontrak List Baku
Query:
- `page`
- `page_size`
- `search`
- `status`
- `date_from`
- `date_to`
- `sort_by`
- `sort_dir`

Response:
```json
{
  "data": [],
  "page": 1,
  "page_size": 20,
  "total": 0,
  "has_next": false
}
```

## Endpoint Inti
### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Session dan Switcher
- `GET /me/sppg`
- `POST /me/active-sppg`
- `GET /me/context`

### Admin Pusat SPPG
- `GET /sppg`
- `POST /sppg`
- `PATCH /sppg/:id`
- `POST /sppg/:id/assign-user`
- `GET /users`
- `GET /sppg/:id/assignments`

### Master
- `GET/POST/PATCH /schools`
- `GET/POST/PATCH /routes`
- `GET/POST/PATCH /vendors`
- `GET/POST/PATCH /items`
- `GET/POST /recipes`
- `PATCH /recipes/:id` (replace BOM transaksional)
- `GET /routes/:id/schools`
- `PUT /routes/:id/schools`
- `GET /schools/:id/verifiers`
- `PUT /schools/:id/verifiers`
- `GET /lookups/master?include=schools,routes,vendors,items,recipes,drivers,units,verifiers`

### Planning
- `GET /menu-plans`
- `POST /menu-plans`
- `POST /menu-plans/:id/submit`
- `POST /menu-plans/:id/approve`

### Procurement dan Receiving
- `GET /purchases`
- `GET /purchases/:id/items`
- `POST /purchases`
- `POST /purchases/:id/submit`
- `POST /purchases/:id/approve`
- `GET /receipts`
- `POST /receipts`

### Inventory
- `GET /stock`
- `GET /stock-moves`
- `POST /stock-moves`
- `GET /opnames`
- `POST /opnames`
- `POST /opnames/:id/submit`
- `POST /opnames/:id/approve`

### Production
- `GET /production-runs`
- `POST /production-runs`
- `POST /production-runs/:id/start`
- `POST /production-runs/:id/finalize`

### Delivery dan Verification
- `GET /deliveries`
- `GET /deliveries/:id/stops`
- `POST /deliveries`
- `POST /deliveries/:id/status`
- `POST /deliveries/:id/proof`
- `GET /verification/stops`
- `POST /deliveries/:id/verify`
- `POST /deliveries/:id/disputes`
- `POST /disputes/:id/resolve`
- `GET /disputes`

### Audit, Reports, Locks
- `GET /audit-logs`
- `GET /workspace/summary`
- `GET /workspace/alerts`
- `GET /workspace/kpi`
- `GET /reports/kpi`
- `GET /reports/kpi-trend`
- `POST /reports/export`
- `GET /reports/jobs`
- `GET /reports/jobs/:id`
- `GET /qa/health-integrity` (ringkasan health RLS/policy/trigger/ledger + audit coverage)
- `GET /period-locks`
- `POST /period-locks/:date/lock`
- `POST /period-locks/:date/unlock`

### Attachments
- `POST /attachments/presign-upload`
- `POST /attachments/complete`
- `GET /attachments/:id/signed-url`
- `POST /attachments` (opsional metadata insert langsung jika dipakai)

## Idempotensi Wajib
Header:
- `Idempotency-Key: <ISI_IDEMPOTENCY_KEY_UNIK>`

Wajib untuk:
- `POST /receipts`
- `POST /deliveries/:id/proof`
- `POST /deliveries/:id/verify`

Perilaku:
- key sama + payload sama -> replay respons sebelumnya.
- key sama + payload beda -> `409 IDEMPOTENCY_CONFLICT`.

## Tambahan Kontrak RC Audit Coverage
### `GET /qa/health-integrity`
Query optional:
- `audit_window_hours` (default `24`, min `1`, max `168`)
- `include_samples` (`true|false`, default `false`)
- `sample_limit` (default `10`, max `50`)

Tambahan response:
```json
{
  "ok": true,
  "scope_sppg_id": "uuid",
  "audit_window_hours": 24,
  "checks": {
    "audit_create_gap_count": 0,
    "audit_update_gap_count": 0,
    "audit_missing_request_id_count": 0,
    "audit_missing_actor_meta_count": 0
  },
  "samples": {
    "audit_create_gap": [],
    "audit_update_gap": [],
    "audit_missing_request_id": [],
    "audit_missing_actor_meta": []
  }
}
```
Catatan: field `samples` hanya dikirim jika `include_samples=true`.

### `GET /audit-logs`
Filter tambahan:
- `entity_id=<uuid>`
- `action=<ACTION_CODE>`

Contoh:
`GET /audit-logs?entity_table=sessions_tokens&entity_id=<uuid>&action=ACTIVE_SPPG_SWITCH&page=1&page_size=20`

## Catatan Runtime Session/Login Compatibility
Untuk local-first compatibility, halaman login frontend mendukung:
1. Jalur legacy token login via `/api/auth/login`.
2. Fallback ke NextAuth Credentials jika jalur legacy gagal.

Tujuan:
1. Menjaga kompatibilitas backend lama.
2. Menjaga transisi bertahap ke route handler full-stack tanpa memutus flow user.
