# Buying and Procurement Backend

A Django REST API for a focused procurement workflow: suppliers, material requests, supplier quotations and comparison, purchase orders and approvals, purchase receipts, inventory movements, purchase invoices, and three-way matching. It is an independent implementation inspired by common ERP procurement workflows; it does not include ERPNext source code or a frontend.

## Quick Start

Run the backend and frontend in two separate PowerShell terminals opened at the repository root.

**Backend terminal:**

```powershell
cd backend
Copy-Item .env.example .env
py -3.12 manage.py migrate
py -3.12 manage.py seed_data
py -3.12 manage.py runserver 127.0.0.1:8000
```

**Frontend terminal:**

```powershell
Copy-Item frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` and sign in with one of the local demo accounts listed in [Seeded Login Accounts](#seeded-login-accounts). Credentials are local-only; do not use them in production.

## Architecture

- `config/`: Django settings, URL routing, JWT, CORS, and API schema setup.
- `apps/accounts/`: custom user role and JWT endpoints.
- `apps/suppliers/`: supplier records.
- `apps/procurement/`: items, material requests, quotations, and quotation comparison.
- `apps/purchasing/`: purchase orders, approvals, receipts, and transactional services.
- `apps/inventory/`: warehouses and immutable stock movement records.
- `apps/accounting/`: purchase invoices, payments, and three-way matching.
- `apps/audit/`: JSON-safe audit history and read-only audit API.

The database is SQLite. Foreign keys, indexes, and check constraints protect core records. Complex receipt, approval, payment, and nested line writes use Django transactions. Totals are derived by the backend.

## Requirements and Setup

Python 3.12 or newer is required. From the repository root:

```powershell
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

Set `DJANGO_SECRET_KEY` in `backend/.env` to a long random value before deployment. Development defaults to SQLite at `backend/db.sqlite3`; no PostgreSQL or MySQL configuration is included.

## Database and Run

```powershell
cd backend
python manage.py check
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```

To use one password for newly created sample accounts, set `SEED_DEFAULT_PASSWORD` before running the seed command. Otherwise the command generates and prints one temporary password when it creates the sample users. Existing sample passwords are not changed on later runs.

## Authentication and Roles

Obtain access and refresh tokens with `POST /api/auth/login/` using `username` and `password`. Refresh at `POST /api/auth/refresh/`; the authenticated profile is `GET /api/auth/me/`. Send the access token as `Authorization: Bearer <access-token>`.

Roles are `ADMIN`, `PURCHASE_MANAGER`, `PURCHASE_USER`, `WAREHOUSE_MANAGER`, `ACCOUNTS_USER`, and `VIEWER`. `ADMIN` can access all APIs. Viewers are read-only. Purchase users and managers manage procurement records; only managers can approve or reject purchase orders. A purchase-order creator cannot approve their own order. Warehouse managers process receipts, and accounts users maintain invoices and payments.

## API Endpoints
### Authentication

| Method and path | Description |
| --- | --- |
| `POST /api/auth/login/` | Validate username/password and issue access and refresh JWTs. |
| `POST /api/auth/refresh/` | Exchange a valid refresh JWT for a new access JWT. |
| `GET /api/auth/me/` | Return the authenticated user's profile and role. |

### Suppliers and Items

| Method and path | Description |
| --- | --- |
| `GET /api/suppliers/` | List suppliers (paginated). |
| `POST /api/suppliers/` | Create a supplier; supplier code must be unique. |
| `GET /api/suppliers/{id}/` | Retrieve one supplier. |
| `PUT /api/suppliers/{id}/` | Replace supplier fields. |
| `PATCH /api/suppliers/{id}/` | Update selected supplier fields. |
| `DELETE /api/suppliers/{id}/` | Delete a supplier when no protected records reference it. |
| `GET /api/items/` | List items and current stock (paginated). |
| `POST /api/items/` | Create an item with nonnegative rates and tax. |
| `GET /api/items/{id}/` | Retrieve one item. |
| `PUT /api/items/{id}/` | Replace item fields. |
| `PATCH /api/items/{id}/` | Update selected item fields; current stock remains read-only. |
| `DELETE /api/items/{id}/` | Delete an item when no protected records reference it. |

### Material Requests and Quotations

| Method and path | Description |
| --- | --- |
| `GET /api/material-requests/` | List requests with their item lines. |
| `POST /api/material-requests/` | Create a draft request and its lines; requester is the authenticated user. |
| `GET /api/material-requests/{id}/` | Retrieve one request and its lines. |
| `PUT /api/material-requests/{id}/` | Replace a draft request; non-draft requests are not editable. |
| `PATCH /api/material-requests/{id}/` | Update selected fields on a draft request. |
| `DELETE /api/material-requests/{id}/` | Delete a request when it is not protected by downstream records. |
| `POST /api/material-requests/{id}/submit/` | Submit a nonempty draft request for approval. |
| `POST /api/material-requests/{id}/approve/` | Approve a submitted request (purchase manager/admin). |
| `POST /api/material-requests/{id}/reject/` | Reject a submitted request with a reason (purchase manager/admin). |
| `POST /api/material-requests/{id}/cancel/` | Cancel a draft or submitted request. |
| `GET /api/quotations/` | List supplier quotations and their item lines. |
| `POST /api/quotations/` | Create a supplier quotation; line and grand totals are calculated by the server. |
| `GET /api/quotations/{id}/` | Retrieve one quotation and its lines. |
| `PUT /api/quotations/{id}/` | Replace quotation fields and lines. |
| `PATCH /api/quotations/{id}/` | Update selected quotation fields. |
| `DELETE /api/quotations/{id}/` | Delete a quotation when no protected records reference it. |
| `GET /api/quotations/compare/?material_request={id}` | Compare supplier offers by item, rate, tax, subtotal, total, and validity; does not choose a supplier. |

### Purchase Orders and Receipts

| Method and path | Description |
| --- | --- |
| `GET /api/purchase-orders/` | List purchase orders with item lines. |
| `POST /api/purchase-orders/` | Create a draft PO; subtotal, discount, tax, and grand total are server-calculated. |
| `GET /api/purchase-orders/{id}/` | Retrieve one PO with approval and receipt state. |
| `PUT /api/purchase-orders/{id}/` | Replace a draft PO and its lines. |
| `PATCH /api/purchase-orders/{id}/` | Update selected fields on a draft PO. |
| `DELETE /api/purchase-orders/{id}/` | Delete a PO when database protections allow it. |
| `POST /api/purchase-orders/{id}/submit/` | Submit a complete draft PO for approval. |
| `POST /api/purchase-orders/{id}/approve/` | Approve a pending PO (purchase manager/admin); creator cannot self-approve. |
| `POST /api/purchase-orders/{id}/reject/` | Reject a pending PO with a required reason (purchase manager/admin). |
| `POST /api/purchase-orders/{id}/mark-ordered/` | Mark an approved PO as ordered. |
| `POST /api/purchase-orders/{id}/cancel/` | Cancel an eligible PO with no receipts. |
| `GET /api/purchase-receipts/` | List posted receipts and their received/rejected/accepted quantities. |
| `POST /api/purchase-receipts/` | Receive an approved/ordered PO (warehouse manager/admin); checks remaining quantity and writes stock movements atomically. |
| `GET /api/purchase-receipts/{id}/` | Retrieve one immutable receipt. |

Receipts intentionally do not support `PUT`, `PATCH`, or `DELETE`; posted receipt history and stock movements are preserved.

### Inventory and Accounting

| Method and path | Description |
| --- | --- |
| `GET /api/warehouses/` | List warehouses. |
| `POST /api/warehouses/` | Create a warehouse (warehouse manager/admin). |
| `GET /api/warehouses/{id}/` | Retrieve one warehouse. |
| `PUT /api/warehouses/{id}/` | Replace warehouse fields. |
| `PATCH /api/warehouses/{id}/` | Update selected warehouse fields. |
| `DELETE /api/warehouses/{id}/` | Delete an unreferenced warehouse. |
| `GET /api/stock-movements/` | List the read-only stock ledger (paginated). |
| `GET /api/stock-movements/{id}/` | Retrieve one stock movement. |
| `GET /api/invoices/` | List purchase invoices and their lines. |
| `POST /api/invoices/` | Create an invoice (accounts user/admin); invoice totals and outstanding balance are calculated by the server. |
| `GET /api/invoices/{id}/` | Retrieve one invoice. |
| `PUT /api/invoices/{id}/` | Replace an unpaid invoice and its lines. |
| `PATCH /api/invoices/{id}/` | Update selected fields on an unpaid invoice. |
| `DELETE /api/invoices/{id}/` | Delete an invoice with no posted payments. |
| `POST /api/invoices/{id}/three-way-match/` | Compare invoice lines/totals to PO lines and accepted receipts; returns the match result. |
| `POST /api/invoices/{id}/payment/` | Record a positive payment up to the outstanding balance (accounts user/admin). |

### Audit and API Documentation

| Method and path | Description |
| --- | --- |
| `GET /api/audit-logs/` | List audit events (admin only). |
| `GET /api/audit-logs/{id}/` | Retrieve one audit event (admin only). |
| `GET /api/schema/` | Serve the generated OpenAPI schema. |
| `GET /api/docs/` | Open Swagger UI for interactive API exploration. |
| `GET /api/redoc/` | Open ReDoc documentation. |

All list endpoints are paginated. Successful JSON responses use `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "errors": ... }`. Role restrictions are enforced server-side; `ADMIN` can access all APIs. The [API testing guide](API_TESTING.md) includes curl and Postman examples.

## Business Workflow and Rules

1. Create a supplier and active item records.
2. Create a material request with one or more positive-quantity lines, then submit and approve it.
3. Create supplier quotations against the request. Quotation amounts include line tax. The comparison endpoint reports supplier, item rates, tax, subtotal, total, and validity; it never chooses a supplier.
4. Create a draft purchase order. The API computes subtotal, discounts, tax, and grand total and ignores client totals. Submit it for approval. A different purchase manager approves or rejects it; rejection requires a reason. Mark an approved order ordered before receiving.
5. Create a receipt for an approved/ordered order. Received quantity cannot exceed the remaining line quantity. Rejected quantities do not enter stock; accepted quantities update item stock and create stock movement records atomically.
6. Create an invoice with item lines. Supplier must match the PO; line totals and outstanding balance are derived by the backend. Record payments through the payment action.
7. Run three-way matching to compare invoice items, rates, totals, and quantities with purchase-order lines and accepted receipt quantities. Result is `MATCHED`, `ITEM_MISMATCH`, `QUANTITY_MISMATCH`, `RATE_MISMATCH`, or `TOTAL_MISMATCH`.

Mutations create audit records containing user, action, model, object id, old/new JSON-safe values, and timestamp. Passwords and tokens are not included.

## React Frontend

The React/Vite application lives in `frontend/`. It talks only to the Django REST API; dashboard figures, table rows, dropdown options, workflow statuses, and matching results are loaded from backend endpoints. There are no mock business records or local business calculations used as authoritative data. The browser applies role-based navigation and button visibility for usability; Django API permissions remain the security boundary.

### Frontend Setup

Use Node.js 20.19+ or 22.12+. Start the Django API first (from a separate terminal):

```powershell
cd backend
Copy-Item .env.example .env
py -3.12 manage.py migrate
py -3.12 manage.py seed_data
py -3.12 manage.py runserver 127.0.0.1:8000
```

In another terminal, from the repository root:

```powershell
Copy-Item frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

The Vite development server defaults to `http://localhost:5173`. `VITE_API_BASE_URL` in `frontend/.env` points the client to `http://127.0.0.1:8000/api/`. For local development, the backend example environment enables Django debug mode and permissive CORS; for deployment, set `DJANGO_DEBUG=false` and list the frontend origin in `CORS_ALLOWED_ORIGINS`.
The Vite development server defaults to `http://localhost:5173`. `VITE_API_BASE_URL` in `frontend/.env` points the client to `http://127.0.0.1:8000/api/`. The backend example environment explicitly allows the Vite origins `http://127.0.0.1:5173` and `http://localhost:5173`; it does not allow every origin. For deployment, set `DJANGO_DEBUG=false` and list only the deployed frontend origin in `CORS_ALLOWED_ORIGINS`.

Useful commands from `frontend/`:

```powershell
npm run dev
npm run build
npm run preview
npm run lint
```

### Seeded Login Accounts

The current local SQLite database was seeded with these demo accounts. They share the generated local seed password:

| Username | Password | Role | Purpose |
| --- | --- | --- | --- |
| `admin` | `ElZCcHqj-2RIuYi6sYoaxpix` | `ADMIN` | Administration and all module APIs. |
| `purchase.manager` | `ElZCcHqj-2RIuYi6sYoaxpix` | `PURCHASE_MANAGER` | Procurement and purchase-order approvals. |
| `buyer` | `ElZCcHqj-2RIuYi6sYoaxpix` | `PURCHASE_USER` | Suppliers, items, requests, quotations, and purchase orders. |
| `warehouse` | `ElZCcHqj-2RIuYi6sYoaxpix` | `WAREHOUSE_MANAGER` | Receipts, warehouses, and inventory operations. |
| `accounts` | `ElZCcHqj-2RIuYi6sYoaxpix` | `ACCOUNTS_USER` | Invoices, payments, and three-way matching. |
| `viewer` | `ElZCcHqj-2RIuYi6sYoaxpix` | `VIEWER` | Read-only API access. |

For a fresh database, the command generates one temporary password shared by newly created seed accounts and prints it once. Set `SEED_DEFAULT_PASSWORD` before the first seed run to choose a local demo password. Reruns preserve existing account passwords. These are local demo credentials only; do not reuse them in production. To reset one local account, run `py -3.12 manage.py changepassword buyer` from `backend/`.

### Frontend Architecture

- `src/api/client.ts`: single Axios instance, API envelope unwrapping, pagination, JWT attachment/refresh, and normalized API errors.
- `src/api/*Api.ts`: resource-specific authentication, supplier, item, request, quotation, PO, receipt, invoice, and dashboard calls.
- `src/context/AuthContext.tsx`: session token, authenticated user, bootstrap, logout, and expired-session handling.
- `src/components/`: role-filtered sidebar, status badges, tables, forms, dialogs, loading/error states, and notifications.
- `src/pages/`: login, API-driven dashboard, lists, create/edit forms, record details, comparison, receiving, inventory, approvals, and reports.
- `src/styles.css`: responsive ERP workspace styling and shared design tokens.

JWTs are held in `sessionStorage`, attached by the shared Axios client, and refreshed after an eligible `401`. A failed refresh signs the user out. `403` responses remain visible as clear permission errors; frontend role gates do not replace backend authorization.

### Application Routes

| Route | Purpose |
| --- | --- |
| `/login` | JWT sign-in. |
| `/dashboard` | Counts, commitments, low stock, and recent API records. |
| `/suppliers`, `/suppliers/create`, `/suppliers/:id`, `/suppliers/:id/edit` | Supplier browse and CRUD. |
| `/items`, `/items/create`, `/items/:id`, `/items/:id/edit` | Item catalogue and stock readout. |
| `/material-requests`, `/material-requests/create`, `/material-requests/:id`, `/material-requests/:id/edit` | Request editing and submit/approve/reject/cancel actions. |
| `/quotations`, `/quotations/create`, `/quotations/:id`, `/quotations/:id/edit` | Supplier quotations and line totals. |
| `/quotations/compare` | API-backed, item-level supplier offer comparison. |
| `/purchase-orders`, `/purchase-orders/create`, `/purchase-orders/:id`, `/purchase-orders/:id/edit` | PO editing, approvals, rejection details, and order status. |
| `/approvals` | Purchase-manager queue of pending orders. |
| `/purchase-receipts`, `/purchase-receipts/create`, `/purchase-receipts/:id` | Receiving with remaining-quantity validation. |
| `/inventory` | Item balances, warehouses, and stock movement ledger. |
| `/invoices`, `/invoices/create`, `/invoices/:id`, `/invoices/:id/edit` | Invoice entry, payment, receipt context, and backend matching. |
| `/reports` | Supplier commitments derived from purchase orders. |

### End-to-End Workflow

Sign in with a seeded or provisioned account, create or review a material request, collect and compare supplier quotations, create a PO and submit it for manager approval, then mark it ordered. Warehouse users record receipts against remaining quantities; accepted units appear in inventory through backend stock movements. Accounts users enter supplier invoices, post payments, and run the Django three-way-match action. The result badge and comparison rows are rendered from the API response, not calculated as the match decision in React.

### Backend API Dependency

The frontend requires the Django API and SQLite database to be available at the URL configured by `VITE_API_BASE_URL`. If lists fail to load, check the backend server, JWT session, configured API base URL, and CORS origin. `401` indicates an invalid/expired session and triggers refresh where possible; `403` means the current backend role is not authorized.

## Tests and Troubleshooting

```powershell
python manage.py test
python manage.py check
python manage.py makemigrations --check
python manage.py migrate
```

- `DisallowedHost`: add the request host to `DJANGO_ALLOWED_HOSTS`.
- Browser CORS errors: set the React origin in `CORS_ALLOWED_ORIGINS` as a comma-separated list.
- `401 Unauthorized`: obtain a new access token and send it using the Bearer authorization scheme.
- Migration drift: run `python manage.py makemigrations`, inspect the generated migration, and commit it with the model change.
- SQLite is intended for local/small deployments; use transaction-safe backups and do not place the database on an unreliable network filesystem.