# Kontrak API Operasional (Ringkas)

## Base URL Lokal
- Backend API: `http://127.0.0.1:3000`
- Frontend proxy: `/api/proxy/*`

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
- `GET /qa/health-integrity` (ringkasan health RLS/policy/trigger/ledger)
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
