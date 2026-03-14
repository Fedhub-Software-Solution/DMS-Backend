# Pharma DMS Backend (Phase 1)

Node.js API: Express, PostgreSQL, JWT auth, **local file storage** for templates and documents.

## Prerequisites

- Node.js 18+
- PostgreSQL (database `pharma_dms` must exist)

## Setup

1. Copy `.env.example` to `.env` and set your DB and JWT values (you already have `.env` with DB config).
2. Install and run migrations:
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
   Or `npm start` for production.

Server runs at **http://localhost:4000** (or `PORT` in `.env`).

## Build & validation (is the code eligible for build?)

Before deploying or releasing, ensure the code passes checks:

1. **Syntax check (all JS files)**  
   ```bash
   npm run build
   ```
   or  
   ```bash
   npm run validate
   ```
   Both run the same script: they validate syntax of every `.js` file (excluding `node_modules`). If any file has a syntax error, the command exits with code 1 and lists failed files.

2. **Smoke test**  
   Start the server and hit the health endpoint:
   ```bash
   npm start
   ```
   Then `GET http://localhost:4000/api/health` — if it responds, the app loads correctly.

3. **(Optional)** Add ESLint and tests later; then `npm run build` can be extended to run `lint` and `test` as well.

## Env (.env)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Full PostgreSQL URL (recommended; overrides below). e.g. `postgres://user:pass@host:port/dbname?sslmode=require` |
| `DATABASENAME` | PostgreSQL database name (used when `DATABASE_URL` is not set) |
| `DATABASEUSER` | PostgreSQL user |
| `DATABASEPASSWORD` | PostgreSQL password |
| `DATABASEHOST` | Host (default: localhost) |
| `DATABASEPORT` | Port (default: 5432) |
| `PORT` | API server port (default: 4000) |
| `JWT_SECRET` | Secret for JWT signing |
| `FILE_STORAGE_PATH` | Local folder for uploads (default: `./uploads`) |

## API (base path `/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/auth/login` | No | Login (body: `username`, `password`) |
| GET | `/auth/me` | Yes | Current user |
| GET | `/departments` | Yes | List departments |
| GET/POST | `/templates` | Yes | List / upload template (multipart `file`, body `department_id`) |
| GET/PATCH | `/templates/:id` | Yes | Get / update template (e.g. `parsed_sections`) |
| GET/POST | `/requests` | Yes | List / create request (body: `template_id`, `title`, `department_id`) |
| GET/PATCH | `/requests/:id` | Yes | Get / update request |
| GET/PUT | `/requests/:id/form-data` | Yes | Get / save form data (body: `data`, `formSectionsSnapshot`) |
| GET/POST | `/documents` | Yes | List / upload document (multipart `file`, body `request_id`) |
| GET/PATCH | `/documents/:id` | Yes | Get / update document |
| GET | `/documents/:id/file` | Yes | Download file (stream) |
| GET | `/audit-logs` | Yes | List audit logs (query: `entity_type`, `entity_id`, `user_id`, `limit`) |

Protected routes use header: `Authorization: Bearer <token>`.

## Seed

After `npm run db:seed`, you can log in with:

- **Username:** `admin`
- **Password:** `admin123`

## File storage

Uploads are stored **locally** under `FILE_STORAGE_PATH` (default `./uploads`):

- `uploads/templates/` – template files (Word/Excel/PDF)
- `uploads/documents/` – document files (docx/pdf/xlsx)

Ensure the process has read/write access to this directory.

## Troubleshooting: Upload timeout

If the frontend shows "Upload timed out" when uploading a template:

1. **Confirm the backend is running** in a separate terminal: `npm run dev`. You should see:
   - `Pharma DMS API running at http://localhost:4000`
   - `[App] Upload directories ready: { templates: '...', documents: '...' }`

2. **Check health:** Open http://localhost:4000/api/health in the browser. It should return `{"ok":true,...}`.

3. **Watch the backend terminal** when you click Upload in the app:
   - If you see `[Templates] POST / upload received, Content-Type: multipart/form-data; boundary=...` then the request reached the server; the hang is in multer or DB.
   - If you see `[Templates] File received: filename.docx ...` then the file was parsed; the hang is in the DB insert or response.
   - If you see **nothing** when you upload, the request is not reaching this server (wrong port, firewall, or frontend calling a different URL).

4. **Test upload with curl** (replace `YOUR_JWT` with a token from login, and use a real .docx path):
   ```bash
   curl -X POST http://localhost:4000/api/templates -H "Authorization: Bearer YOUR_JWT" -F "file=@path/to/test.docx" -F "department_id=a0000001-0000-0000-0000-000000000001"
   ```
   If this succeeds, the backend is fine and the issue is between the browser and the server (e.g. CORS, proxy, or very slow connection).
