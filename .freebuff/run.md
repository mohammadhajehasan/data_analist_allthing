# Run doc — AI Data Analytics Platform

## How to run the server

The app is an Express + Vite dev server on **port 3000** (`server.ts`, hard-coded `PORT = 3000`).

```powershell
npm run dev
```

- In this project `npm run dev` is wrapped as `infisical run --env=dev -- tsx server.ts`.
  If the Infisical CLI is not installed / not logged in yet, run the unwrapped fallback:
  `npx tsx server.ts` (reads `.env` via dotenv as before).
- URL: http://localhost:3000 (API under `/api/*`, SPA served via Vite middleware in dev).
- Production: `npm run build` then `npm run start` (serves `dist/`).

## Environment / artifacts a fresh checkout needs

1. Copy `.env` from the main checkout (never commit it; it is gitignored).
   - `GEMINI_API_KEY` must be a real key from https://aistudio.google.com/apikey —
     placeholder values make the AI endpoints return HTTP 500 with a clear message.
2. `npm install` (lockfile: `package-lock.json` + `bun.lock` present).
3. No database, no docker-compose, no CI config — the server keeps state in memory.

## Health check

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

`aiEnabled: true` means the Gemini key is present and not a placeholder.

## Preview notes (this thread)

- Registered preview: http://localhost:3000 (dev server started detached; log:
  `.freebuff/preview-*.log`).
- The Vite dev server may log benign `net::ERR_CONNECTION_REFUSED` entries on startup
  (model-list probes to local engines such as Ollama that are not running) — harmless.
