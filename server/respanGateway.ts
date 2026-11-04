/**
 * Respan Gateway sidecar — one loopback endpoint in front of every provider.
 *
 * Respan Gateway (https://github.com/respanai/respan-gateway) is an
 * OpenAI-compatible gateway: the app sends an OpenAI Chat Completions request
 * and the gateway forwards it to whichever vendor owns the model, translating
 * between the OpenAI, Anthropic and Gemini formats on the way.
 *
 * This project is a Node/Express app, so the gateway runs as a child process of
 * the server (`python -m respan_gateway serve`) bound to 127.0.0.1 and is called
 * over HTTP at `<url>/v1` — the in-process Python `rg.Gateway()` API is not
 * reachable from Node.
 *
 * Provider credentials are never copied here: the child inherits this process's
 * environment, i.e. the very same `.env` the app already loads (GEMINI_API_KEY,
 * OPENROUTER_API_KEY, ...). A gateway.toml that references secrets must use
 * `env:NAME` — see docs/AI_PROVIDERS_INTEGRATION.md.
 *
 * Opt-in environment:
 *   RESPAN_GATEWAY_ENABLED=true     start the sidecar and route AI calls through it
 *   RESPAN_GATEWAY_URL=...          use an already-running gateway (no spawn)
 *   RESPAN_GATEWAY_PORT=...         port for the spawned sidecar (default: a free port)
 *   RESPAN_GATEWAY_PYTHON=...       interpreter (default: .venv, then python)
 *   RESPAN_GATEWAY_CONFIG=...       gateway.toml to use (default: ./gateway.toml)
 *   RESPAN_GATEWAY_CLIENT_KEY=...   Bearer key when the config declares client_keys
 */
import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';

const LOOPBACK = '127.0.0.1';
const READY_TIMEOUT_MS = 30_000;
const STDERR_TAIL_LIMIT = 4000;

let child: ChildProcess | null = null;
let baseUrl: string | null = null;
let startPromise: Promise<string | null> | null = null;
let startedAt: string | null = null;
let lastError = '';
let stderrTail = '';

export interface RespanGatewayStatus {
  enabled: boolean;
  running: boolean;
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  error?: string;
}

/** True when the gateway is switched on (own sidecar or an external URL). */
export function isGatewayEnabled(): boolean {
  const flag = (process.env.RESPAN_GATEWAY_ENABLED || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true;
  return Boolean((process.env.RESPAN_GATEWAY_URL || '').trim());
}

export function getGatewayStatus(): RespanGatewayStatus {
  return {
    enabled: isGatewayEnabled(),
    running: Boolean(baseUrl),
    url: baseUrl,
    pid: child?.pid ?? null,
    startedAt,
    ...(lastError ? { error: lastError } : {}),
  };
}

/** Interpreter that has respan-gateway installed. */
function resolvePython(): string {
  const configured = (process.env.RESPAN_GATEWAY_PYTHON || '').trim();
  if (configured) return configured;
  const root = process.cwd();
  const venvPython = process.platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) return venvPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function resolveConfigPath(): string | null {
  const configured = (process.env.RESPAN_GATEWAY_CONFIG || '').trim();
  if (configured) return configured;
  const local = path.join(process.cwd(), 'gateway.toml');
  return fs.existsSync(local) ? local : null;
}

function normaliseBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, LOOPBACK, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error('could not allocate a loopback port'))));
    });
  });
}

function rememberStderr(chunk: Buffer) {
  stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
}

/**
 * Start (once) the loopback gateway and return its base URL, or null when the
 * gateway is disabled or cannot start. Never throws: the AI routes fall back to
 * the direct provider paths.
 */
export async function ensureGateway(): Promise<string | null> {
  if (!isGatewayEnabled()) return null;

  const external = (process.env.RESPAN_GATEWAY_URL || '').trim();
  if (external) {
    baseUrl = normaliseBaseUrl(external);
    return baseUrl;
  }
  if (baseUrl) return baseUrl;
  if (startPromise) return startPromise;

  startPromise = startGateway().finally(() => {
    startPromise = null;
  });
  return startPromise;
}

async function startGateway(): Promise<string | null> {
  const started = Date.now();
  lastError = '';
  try {
    const port = parseInt(process.env.RESPAN_GATEWAY_PORT || '', 10) || (await findFreePort());
    const url = `http://${LOOPBACK}:${port}`;
    const python = resolvePython();
    const args = ['-m', 'respan_gateway', 'serve', '--listen', `${LOOPBACK}:${port}`, '--log', 'off'];
    const configPath = resolveConfigPath();
    if (configPath) args.push('--config', configPath);

    stderrTail = '';
    const proc = spawn(python, args, {
      cwd: process.cwd(),
      env: process.env, // the app's own .env keys — no secret is copied into this file
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child = proc;
    proc.stderr?.on('data', rememberStderr);
    proc.stdout?.on('data', () => { /* the gateway logs to stderr; drain stdout */ });
    proc.once('error', (err: Error) => {
      lastError = `gateway failed to start (${python}): ${err.message}`;
      child = null;
      baseUrl = null;
    });
    proc.once('exit', (code) => {
      if (child === proc) {
        child = null;
        baseUrl = null;
        if (code !== 0 && code !== null) {
          lastError = lastError || `gateway exited with code ${code}${stderrTail ? `: ${tail(stderrTail)}` : ''}`;
        }
      }
    });
    process.once('exit', () => { try { proc.kill(); } catch { /* already gone */ } });

    await waitForGateway(url, proc);
    baseUrl = url;
    startedAt = new Date().toISOString();
    lastError = '';
    console.log(`[Respan Gateway] serving at ${url} (pid ${proc.pid}, ${Date.now() - started}ms) — AI calls route through it.`);
    return baseUrl;
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.warn(`[Respan Gateway] unavailable — AI calls keep using the direct provider paths. ${lastError}`);
    stopGateway();
    return null;
  }
}

function tail(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(-400);
}

/** Poll the gateway until it answers (any HTTP status below 500 proves it is up). */
async function waitForGateway(url: string, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  // Let a spawn failure (missing interpreter, no module) surface as an 'error'
  // event first, so the message names it instead of a bare "exited".
  await new Promise((resolve) => setTimeout(resolve, 50));
  while (Date.now() < deadline) {
    if (!proc.pid || proc.exitCode !== null) {
      throw new Error(lastError || `gateway process exited before it was ready${stderrTail ? `: ${tail(stderrTail)}` : ''}`);
    }
    try {
      const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`gateway did not answer ${url}/v1/models within ${READY_TIMEOUT_MS}ms${stderrTail ? `: ${tail(stderrTail)}` : ''}`);
}

/** Stop the sidecar (no-op when the gateway is external or disabled). */
export function stopGateway(): void {
  const proc = child;
  child = null;
  baseUrl = null;
  startedAt = null;
  if (!proc) return;
  try {
    proc.kill();
  } catch { /* already gone */ }
}

export interface GatewayChatParams {
  model: string;
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface GatewayChatResult {
  text: string;
  modelUsed: string;
  durationMs: number;
}

/**
 * Send one chat completion through the gateway, using the OpenAI format every
 * provider behind it understands. Returns null when the gateway is off or the
 * request fails, so the caller can fall back to its direct provider path.
 */
export async function tryGatewayChat(params: GatewayChatParams): Promise<GatewayChatResult | null> {
  if (!isGatewayEnabled()) return null;
  const started = Date.now();
  try {
    const url = await ensureGateway();
    if (!url) return null;

    const clientKey = (process.env.RESPAN_GATEWAY_CLIENT_KEY || 'local').trim() || 'local';
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientKey}`,
      },
      signal: AbortSignal.timeout(params.timeoutMs ?? 120_000),
      body: JSON.stringify({
        model: params.model,
        messages: [
          ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
          { role: 'user', content: params.prompt },
        ],
        temperature: 0.1,
        max_tokens: params.maxTokens || 4096,
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      lastError = `gateway returned status ${res.status}${detail ? `: ${tail(detail)}` : ''}`;
      console.warn(`[Respan Gateway] ${lastError}`);
      return null;
    }

    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) {
      lastError = 'gateway returned an empty completion';
      return null;
    }
    const servedModel = typeof data?.model === 'string' && data.model ? data.model : params.model;
    return {
      text,
      modelUsed: `respan-gateway:${servedModel}`,
      durationMs: Date.now() - started,
    };
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.warn(`[Respan Gateway] request failed — falling back to the direct provider path. ${lastError}`);
    return null;
  }
}
