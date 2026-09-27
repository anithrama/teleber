# Buying and Procurement API Testing

Base URL: `http://127.0.0.1:8000`. Start the API from `backend/` with `py -3.12 manage.py runserver`. The database is SQLite.

Successful JSON responses have `{ "success": true, "message": "...", "data": ... }`. Errors have `{ "success": false, "message": "...", "errors": ... }`. `204 No Content` deletes have no body.

## Login and JWT

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/auth/login/ -H "Content-Type: application/json" -d '{"username":"buyer","password":"YOUR_SEED_PASSWORD"}'
$TOKEN = "paste-data.access-here"
curl.exe -X POST http://127.0.0.1:8000/api/auth/refresh/ -H "Content-Type: application/json" -d '{"refresh":"YOUR_REFRESH_TOKEN"}'
curl.exe http://127.0.0.1:8000/api/auth/me/ -H "Authorization: Bearer $TOKEN"
```

Protected routes require `Authorization: Bearer <access-token>`. Invalid login, missing token, invalid token, or expired token returns `401`.

## Suppliers

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/suppliers/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"supplier_code":"SUP-100","name":"Example Supply","email":"orders@example.test"}'
curl.exe http://127.0.0.1:8000/api/suppliers/ -H "Authorization: Bearer $TOKEN"
curl.exe http://127.0.0.1:8000/api/suppliers/1/ -H "Authorization: Bearer $TOKEN"
curl.exe -X PATCH http://127.0.0.1:8000/api/suppliers/1/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"phone":"555-0100"}'
curl.exe -X DELETE http://127.0.0.1:8000/api/suppliers/1/ -H "Authorization: Bearer $TOKEN"
```

Create returns `201`; list, retrieve, and update return `200`; delete returns `204`. Duplicate codes and invalid fields return `400`.

## Items and Material Requests

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/items/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"item_code":"ITEM-100","name":"Fastener kit","unit":"Kit","purchase_rate":"24.50","tax_rate":"8.00"}'
curl.exe -X PATCH http://127.0.0.1:8000/api/items/1/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"purchase_rate":"25.00"}'
curl.exe -X POST http://127.0.0.1:8000/api/material-requests/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"request_number":"MR-100","department":"Maintenance","request_date":"2026-09-27","required_date":"2026-10-10","priority":"NORMAL","items":[{"item":1,"quantity":"4","estimated_rate":"24.50"}]}'
curl.exe -X POST http://127.0.0.1:8000/api/material-requests/1/submit/ -H "Authorization: Bearer $TOKEN"
curl.exe -X POST http://127.0.0.1:8000/api/material-requests/1/approve/ -H "Authorization: Bearer $TOKEN"
curl.exe -X POST http://127.0.0.1:8000/api/material-requests/1/reject/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"reason":"Budget review"}'
curl.exe -X POST http://127.0.0.1:8000/api/material-requests/1/cancel/ -H "Authorization: Bearer $TOKEN"
```

Material requests must have at least one line to submit. Status is changed with workflow actions, not general CRUD. Purchase managers/admins approve and reject; rejection requires a reason.

## Quotations and Comparison

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/quotations/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"quotation_number":"SQ-100","supplier":1,"material_request":1,"quotation_date":"2026-09-27","valid_until":"2026-10-15","items":[{"item":1,"quantity":"4","rate":"23.75","tax_rate":"8.00"}]}'
curl.exe -X PATCH http://127.0.0.1:8000/api/quotations/1/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"remarks":"Includes freight"}'
curl.exe http://127.0.0.1:8000/api/quotations/1/ -H "Authorization: Bearer $TOKEN"
curl.exe "http://127.0.0.1:8000/api/quotations/compare/?material_request=1" -H "Authorization: Bearer $TOKEN"
```

Quotation totals are derived from line quantities, rates, and tax. Comparison reports offers but never auto-selects a supplier.

## Purchase Orders and Approval

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/purchase-orders/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"po_number":"PO-100","supplier":1,"material_request":1,"quotation":1,"order_date":"2026-09-27","expected_delivery_date":"2026-10-10","currency":"USD","items":[{"item":1,"quantity":"4","rate":"23.75","tax_rate":"8.00","discount":"0"}]}'
curl.exe http://127.0.0.1:8000/api/purchase-orders/ -H "Authorization: Bearer $TOKEN"
curl.exe http://127.0.0.1:8000/api/purchase-orders/1/ -H "Authorization: Bearer $TOKEN"
curl.exe -X PATCH http://127.0.0.1:8000/api/purchase-orders/1/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"remarks":"Deliver to receiving dock"}'
curl.exe -X POST http://127.0.0.1:8000/api/purchase-orders/1/submit/ -H "Authorization: Bearer $TOKEN"
curl.exe -X POST http://127.0.0.1:8000/api/purchase-orders/1/approve/ -H "Authorization: Bearer $TOKEN"
curl.exe -X POST http://127.0.0.1:8000/api/purchase-orders/1/reject/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"reason":"Delivery date is unacceptable"}'
curl.exe -X POST http://127.0.0.1:8000/api/purchase-orders/1/mark-ordered/ -H "Authorization: Bearer $TOKEN"
```

PO totals and status are server-controlled. Only purchase managers/admins can approve/reject; creators cannot approve their own PO. Invalid transitions and validation failures return `400`; role denial returns `403`.

## Receipts and Inventory

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/purchase-receipts/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"receipt_number":"PR-100","purchase_order":1,"warehouse":1,"receipt_date":"2026-09-27","items":[{"purchase_order_item":1,"received_quantity":"4","rejected_quantity":"0"}]}'
curl.exe http://127.0.0.1:8000/api/stock-movements/ -H "Authorization: Bearer $TOKEN"
```

Only warehouse managers/admins can receive. Receipts must reference an approved/ordered PO and cannot exceed remaining quantity. Accepted quantities update stock and create movements atomically.

## Invoices and Three-Way Match

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/invoices/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"invoice_number":"INV-100","supplier":1,"purchase_order":1,"invoice_date":"2026-09-27","due_date":"2026-10-27","grand_total":"1","items":[{"item":1,"quantity":"4","rate":"23.75","tax_rate":"8.00"}]}'
curl.exe http://127.0.0.1:8000/api/invoices/ -H "Authorization: Bearer $TOKEN"
curl.exe http://127.0.0.1:8000/api/invoices/1/ -H "Authorization: Bearer $TOKEN"
curl.exe -X PATCH http://127.0.0.1:8000/api/invoices/1/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"due_date":"2026-11-01"}'
curl.exe -X POST http://127.0.0.1:8000/api/invoices/1/three-way-match/ -H "Authorization: Bearer $TOKEN"
curl.exe -X POST http://127.0.0.1:8000/api/invoices/1/payment/ -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"amount":"25.00"}'
curl.exe -X DELETE http://127.0.0.1:8000/api/invoices/1/ -H "Authorization: Bearer $TOKEN"
```

Only accounts users/admins create invoices, run matching, and post payments. Invoice totals are calculated from lines; client totals are ignored. Match results: `MATCHED`, `ITEM_MISMATCH`, `QUANTITY_MISMATCH`, `RATE_MISMATCH`, `TOTAL_MISMATCH`.

## Errors and HTTP Status Codes

| Code | Meaning |
| --- | --- |
| `200` | Read, update, payment, or workflow action succeeded |
| `201` | Resource created |
| `204` | Deleted; no body |
| `400` | Invalid fields, duplicate, transition, or business rule |
| `401` | Missing/invalid JWT or invalid login |
| `403` | Authenticated role is not authorized |
| `404` | Resource not found |
| `500` | Unexpected server error; details are logged, not exposed |

Example error:

```json
{"success":false,"message":"The request could not be completed.","errors":{"items":["Invalid quantity."]}}
```

## Postman and Swagger

In Postman, create `baseUrl=http://127.0.0.1:8000`; call login, then set collection variable `token` from `pm.response.json().data.access` in the Tests tab. Add `Authorization: Bearer {{token}}` to protected requests. Use the curl request bodies above as raw JSON. Include negative cases for `400`, `401`, and `403`.

Swagger UI: `http://127.0.0.1:8000/api/docs/`. Select **Authorize** and enter `Bearer <access-token>`. ReDoc is at `/api/redoc/`; the OpenAPI document is `/api/schema/`. The document describes the same response envelopes returned by the API.

Run verification from `backend/`:

```powershell
py -3.12 manage.py check
py -3.12 manage.py makemigrations --check
py -3.12 manage.py test
```

No pytest configuration or dependency is present; Django's test runner is the configured framework.