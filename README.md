# SyncBoard

SyncBoard is a self-hostable collaborative whiteboard built with React, Vite, TypeScript, Fabric.js, Socket.IO, Express, PostgreSQL, Prisma, and Zod. Fabric.js is MIT-licensed; it provides drawing primitives and object manipulation, while this repository owns the room protocol and persistence.

## Current implementation

- Guest display names and room links (`/board/ROOM_CODE`)
- Room creation and lookup API with validation and rate limiting
- Fabric.js canvas with selection, freehand, rectangle, ellipse, line, arrow metadata, text, sticky-note objects, eraser, duplicate/delete, keyboard shortcuts, zoom, background and grid controls
- Socket.IO room isolation, live cursor presence, transient freehand previews, and versioned object create/update/delete messages
- PostgreSQL room snapshot persistence via Prisma, restored when a room is joined
- Read-only guard enforced by the server model (the API currently has no public endpoint to enable read-only mode)
- PNG/SVG export, share dialog, participant list, connection state, basic validation tests and Playwright smoke test

## Collaboration model and limitations

Each room is a Socket.IO channel. The server assigns the participant identity from the Socket.IO connection and validates room code, guest name, cursor coordinates, drawing operations, and settings. Object operations carry an operation UUID, object UUID, and monotonically increasing per-client object version. The server rejects stale versions and broadcasts accepted changes to the other sockets in the same room. Object snapshots are stored in PostgreSQL; cursor and in-progress stroke messages are ephemeral and are not persisted. A final freehand path is persisted when Fabric creates the path object.

This is an optimistic, version-based last-arriving-newer-version model, not a CRDT. Simultaneous edits to the same object may cause one update to be rejected; there is no per-user locking or offline operation queue. Snapshot writes currently happen per accepted object operation, which is safe for modest usage but should be batched and serialized before scaling to high write rates. The undo/redo controls are local canvas history, not a distributed history protocol. The current board title editor is session-only. Image upload, PDF export, authentication accounts, owner management, and a production-ready read-only invitation endpoint are not included in this version.

## Requirements

- Node.js 20+ (tested target: Node 22)
- PostgreSQL 14+
- npm 10+

## Local setup

1. Create a PostgreSQL database named `syncboard`.
2. Copy `.env.example` to `.env` in the repository root and update `DATABASE_URL` if needed. Vite is configured to read root-level env values, and the server loads `../.env` when run from its workspace directory.
3. Install packages from the repository root:

   ```bash
   npm install
   ```

4. Generate Prisma client and apply migrations:

   ```bash
   npm --workspace server exec prisma generate
   npm --workspace server exec prisma migrate deploy
   ```

   For local development where you want Prisma to create migrations, use `npm --workspace server exec prisma migrate dev` instead.
5. Start both apps:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:5173`. The API health check is `http://localhost:4000/health`.

The root `.env.example` uses `VITE_SERVER_URL=http://localhost:4000`. Vite only exposes variables prefixed with `VITE_`; never put database credentials or server secrets in frontend variables.

## Scripts

```bash
npm run dev
npm run build
npm test
npm run test:e2e
```

The backend validation tests do not need a database. The end-to-end tests require PostgreSQL, migrations, both services running, and Playwright's Chromium browser installed (`npm --workspace client exec playwright install chromium`); they skip if room creation is unavailable. For a full multiplayer acceptance test, open a room in two separate browser contexts, draw a shape in one, and confirm the shape and cursors update in the other. Also open a second room to confirm isolation.

## Deployment

### PostgreSQL

Provision a PostgreSQL database on Railway, Render, Neon, or another PostgreSQL provider. Copy its private connection string into the backend's `DATABASE_URL`. Do not put it in the frontend environment.

### Backend (Render or Railway)

- Root directory: repository root (monorepo)
- Build command: `npm install && npm --workspace server exec prisma generate && npm --workspace server run build`
- Start command: `npm --workspace server exec prisma migrate deploy && npm --workspace server run start`
- Health check: `/health`
- Environment: `DATABASE_URL`, `CLIENT_ORIGIN` (exact deployed frontend origin; comma-separated origins are supported), `NODE_ENV=production`, and `PORT` if the platform does not inject it
- Enable WebSocket support on the service and use the platform-provided HTTPS URL

### Frontend (Vercel)

- Framework preset: Vite
- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_SERVER_URL=https://YOUR-BACKEND-HOST`
- Add a Vercel rewrite so direct room links load the SPA. `client/vercel.json` is included.

After deployment, update backend `CLIENT_ORIGIN` to the Vercel domain, redeploy the backend, create a board, open the same invitation in two different browser contexts, and verify live drawing, cursor presence, refresh recovery, and `/health`. A successful build alone does not verify deployed WebSocket or database connectivity.

## Troubleshooting

- `Room not found`: ensure the room was created against the same backend URL and that the database migration ran.
- `DATABASE_URL` errors: verify the backend service's private database URL and SSL requirements for your provider.
- WebSocket reconnect loop: check `VITE_SERVER_URL`, backend availability, `CLIENT_ORIGIN`, and that the deployment proxy supports WebSockets.
- Blank canvas after deployment: inspect browser console errors and confirm Vite built the client with the deployed `VITE_SERVER_URL`.
- `prisma` command not found: run the command from the repository root with `npm --workspace server exec prisma ...`.
