# Central secrets with Infisical

This project keeps its secrets in [Infisical](https://infisical.com) instead of a local
`.env` file. The app code is unchanged: `server.ts` still reads `process.env.*` exactly
as before, and the Infisical CLI injects the values into the process at start time.

- Docs index (machine readable): <https://infisical.com/docs/llms.txt>
- First-secret quickstart: <https://infisical.com/docs/documentation/platform/secrets-mgmt/quick-starts/deliver-first-secret>
- CLI install: <https://infisical.com/docs/cli/overview>
- `infisical run`: <https://infisical.com/docs/cli/commands/run>

## 1. What this project needs

Stack: Node.js + TypeScript, Express API (`server.ts`) with a Vite/React SPA.
Delivery method: **local development via the Infisical CLI**. There is no
`docker-compose.yml`, `Dockerfile`, `Procfile`, `Makefile` or CI workflow in the
repository, so no container/CI wiring is needed yet — see section 6 if you add one.

Environment variables the server reads (names only; values belong in Infisical):

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Required. Gemini API key used by `getAiClient()` and the AI routes. |
| `OPENROUTER_API_KEY` | Optional. Bearer token for the OpenRouter provider. |
| `DEEPSEEK_API_KEY` | Optional. Bearer token for the DeepSeek provider. |
| `QWEN_API_KEY` | Optional. Bearer token for the Qwen provider. |
| `CUSTOM_OPENAI_API_KEY` | Optional. Bearer token for a custom OpenAI-compatible provider. |
| `CUSTOM_OPENAI_ENDPOINT` | Optional. Base URL for that provider (defaults to `http://localhost:8000/v1`). |
| `APP_URL` | Hosting URL, injected by the hosting platform. |
| `NODE_ENV` | Set to `production` to serve the built SPA from `dist/` instead of the Vite middleware. |
| `DISABLE_HMR` | Read by `vite.config.ts` to disable HMR/file watching. |

`PORT` is currently hard-coded to `3000` in `server.ts`; it is not read from the environment.

`server.ts` calls `dotenv.config()`. That is harmless and gives the right precedence:
dotenv never overwrites variables that already exist in the process, so values injected
by `infisical run` win over anything left in a local `.env`.

## 2. Create the account and project

1. Sign up / sign in at <https://app.infisical.com>.
2. **Secrets Management → + Add New Project**, name it after the service
   (`ai-data-analytics-platform` matches `metadata.json`).
3. Every new project starts with **Development**, **Staging** and **Production** environments.
4. On the **Secrets Overview** page, drag and drop the existing local `.env` file (or use
   *Paste Secrets*) to import all key/value pairs at once. Review the parsed keys, target the
   `Development` environment, then **Upload Secrets**.
5. Delete the local `.env` once the import is verified (see section 7).

## 3. Install the CLI and log in

Windows (this checkout runs PowerShell):

```powershell
winget install infisical
```

macOS: `brew install infisical/get-cli/infisical` · Linux: use the deb/rpm/apk repo commands
from <https://infisical.com/docs/cli/overview> · any OS: `npm install -g @infisical/cli`.

Then authenticate:

```powershell
infisical login
```

On WSL 2, GitHub Codespaces, or a remote SSH session with no browser, use the interactive
prompt-less flow instead:

```powershell
infisical login -i
```

## 4. Link the codebase

From the project root:

```powershell
infisical init
```

This writes `.infisical.json` (project ID + default environment). It holds local project
settings only, contains no secrets, and is safe to commit.

## 5. Inject secrets at runtime

The npm scripts are already wrapped, so the team gets secrets by default:

```jsonc
"dev":   "infisical run --env=dev -- tsx server.ts",
"start": "infisical run --env=dev -- node dist/server.cjs"
```

```powershell
npm run dev     # dev server on http://localhost:3000 with Infisical secrets
npm run build   # unchanged: vite build + esbuild; needs no secrets
npm run start   # serves the built bundle with Infisical secrets
```

Useful variants:

```powershell
infisical run --env=staging -- npm run dev    # another environment
infisical run --watch -- npm run dev          # restart when a secret changes (dev only)
```

Unwrapped fallback for a machine without the CLI (reads the local `.env` via dotenv):
`npx tsx server.ts`.

## 6. Non-local environments (CI/CD, Kubernetes, production)

Do not use interactive login there. Create a **machine identity** and authenticate with
**Universal Auth**:

- <https://infisical.com/docs/documentation/platform/identities/machine-identities>
- <https://infisical.com/docs/documentation/platform/identities/universal-auth>

1. Project → **Access Control → Identities → Create Identity**, attach Universal Auth, and
   grant the identity read access to only the project and environment it needs.
2. Store the generated **client ID** and **client secret** in that platform's own secret
   store (GitHub Actions secrets, Kubernetes `Secret`/External Secrets, Vault, …) — never in
   this repository.
3. In the pipeline, fetch a token and run the job through the CLI:

   ```bash
   export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
     --client-id="$INFISICAL_CLIENT_ID" \
     --client-secret="$INFISICAL_CLIENT_SECRET" --silent --plain)
   infisical run --projectId="<project-id>" --env=prod -- node dist/server.cjs
   ```

   Pin the CLI to a specific version in production, and set
   `INFISICAL_DISABLE_UPDATE_CHECK=true` to skip the version check.

## 7. Verify the migration

1. Start through the wrapper and confirm the app boots and at least one known variable
   resolves — log its **length**, never its value:

   ```powershell
   npm run dev
   # in another shell, or a temporary log line: process.env.GEMINI_API_KEY?.length
   ```

2. Prove the secrets are no longer coming from disk: rename the local file and restart.

   ```powershell
   Rename-Item .env .env.backup      # macOS/Linux: mv .env .env.backup
   npm run dev
   ```

   The app must still start and answer AI requests. `.env*` is already covered by
   `.gitignore`, so `.env.backup` cannot be committed either.
3. Once verified, delete `.env.backup` (or keep it outside the repo) and rely on Infisical.

## 8. Housekeeping

- `.gitignore` already ignores `.env*` while keeping `!.env.example`, so no local secret file
  can be committed.
- `.env.example` is the only env file that is safe to commit and must contain placeholder
  values only; the complete list of variables the app reads is in section 1. A real value must
  never be written into a file, a script or chat.
- **If any real secret was ever committed, rotate it.** Removing it in a later commit does not
  remove it from git history; the value must be treated as compromised.
- Scan for leaked secrets with the CLI:
  <https://infisical.com/docs/cli/scanning-overview>

  ```powershell
  infisical scan .
  ```
