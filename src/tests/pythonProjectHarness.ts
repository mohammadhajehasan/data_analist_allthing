/**
 * أدوات مشتركة لاختبارات Python E2E (FastAPI وDjango)
 * -----------------------------------------------------------------
 * هذه الاختبارات تشغّل المشروع المولَّد فعلياً: تنشئ بيئة افتراضية،
 * تثبّت requirements، تطبّق السكيما، تقلع الخادم وتستدعي مسارات API.
 * لذلك تُشغَّل اختيارياً (`PY_BACKEND_E2E=1`) وفي CI، لا مع كل vitest.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

export const IS_WIN = process.platform === 'win32';
export const PYTHON = process.env.PYTHON_BIN || (IS_WIN ? 'python' : 'python3');

export function enabled(): boolean {
  return process.env.PY_BACKEND_E2E === '1';
}

export function venvPython(projectDir: string): string {
  return IS_WIN
    ? join(projectDir, '.venv', 'Scripts', 'python.exe')
    : join(projectDir, '.venv', 'bin', 'python');
}

export function writeProject(projectDir: string, files: { path: string; content: string }[]): void {
  for (const file of files) {
    const target = join(projectDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
  }
}

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  label: string,
  timeout = 10 * 60 * 1000
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONUNBUFFERED: '1' },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    throw new Error(`${label}: تعذّر تشغيل الأمر (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: انتهى بالرمز ${result.status}\n--- output ---\n${output.slice(-4000)}`);
  }
  return output;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export interface RunningServer {
  child: ChildProcess;
  baseUrl: string;
  log: () => string;
}

export async function startServer(
  pythonPath: string,
  args: string[],
  cwd: string,
  healthPath: string,
  timeoutMs = 120_000
): Promise<RunningServer> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverArgs = args.map(arg => arg.replace('{PORT}', String(port)));
  let log = '';
  const child = spawn(pythonPath, serverArgs, {
    cwd,
    detached: !IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  child.stdout?.on('data', chunk => { log += String(chunk); });
  child.stderr?.on('data', chunk => { log += String(chunk); });
  child.on('error', error => { log += `\n[spawn error] ${error.message}`; });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`الخادم خرج بالرمز ${child.exitCode}\n${log}`);
    }
    try {
      const health = await fetch(`${baseUrl}${healthPath}`, { signal: AbortSignal.timeout(2000) });
      if (health.ok) {
        return { child, baseUrl, log: () => log };
      }
    } catch {
      // لم يجهز بعد
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`الخادم لم يستجب على ${baseUrl}${healthPath} خلال ${Math.round(timeoutMs / 1000)} ثانية\n${log}`);
}

export function stopServer(server: RunningServer | null): void {
  if (!server || server.child.killed) return;
  const pid = server.child.pid;
  if (pid && IS_WIN) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else if (pid) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        server.child.kill('SIGTERM');
      } catch {
        // توقّف بالفعل
      }
    }
  }
}

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

export interface ApiRequest {
  method?: string;
  body?: unknown;
  token?: string;
  tokenPrefix?: string;
  headers?: Record<string, string>;
}

export function apiClient(baseUrl: string) {
  return async function api(path: string, request: ApiRequest = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(request.headers ?? {}),
    };
    if (request.token) headers.Authorization = `${request.tokenPrefix ?? 'Bearer'} ${request.token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method: request.method ?? (request.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  };
}

/** إنشاء بيئة افتراضية وتثبيت requirements — الخطوة الأطول في هذه الاختبارات */
export function installProject(projectDir: string): string {
  runCommand(PYTHON, ['-m', 'venv', '.venv'], projectDir, 'python -m venv', 5 * 60 * 1000);
  const pythonPath = venvPython(projectDir);
  runCommand(
    pythonPath,
    ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'],
    projectDir,
    'pip install -r requirements.txt',
    15 * 60 * 1000
  );
  return pythonPath;
}
