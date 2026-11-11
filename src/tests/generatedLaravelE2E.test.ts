/**
 * اختبار انحدار حقيقي لمشروع Laravel المولَّد
 * -----------------------------------------------------------------
 * بقية اختبارات المولّد تفحص نص الملفات. هذا الاختبار لا يكتفي بذلك:
 * يكتب المشروع على القرص، يشغّل `composer install` و`php artisan migrate`
 * و`php artisan db:seed`، يقلع خادماً على منفذ حر، ثم يستدعي مسارات API
 * الفعلية (مصادقة، CRUD، مفاتيح مركّبة) ويتحقق من العروض والـTriggers.
 *
 * يتطلّب PHP 8.2+ وComposer واتصالاً بالشبكة (تنزيل laravel/framework).
 * لذلك يُشغَّل اختيارياً عبر `npm run test:laravel-e2e` (وفي CI) بدل كل
 * تشغيل لـ`vitest`، حتى لا تتعطّل دورات التطوير السريعة.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import { generateBackendProject } from '../utils/backendCodegen';

const enabled = process.env.LARAVEL_E2E === '1';
const e2e = enabled ? describe : describe.skip;

const SHELL = process.platform === 'win32';
const COMPOSER_TIMEOUT = 15 * 60 * 1000;
const ARTISAN_TIMEOUT = 3 * 60 * 1000;

/** سكيما متجر صغيرة تغطي: مفتاح مفرد، مفتاح مركّب، فهرساً، عرضاً، وTrigger */
function shopSchema(): ErModel {
  return {
    diagramNames: ['E2E Shop'],
    warnings: [],
    tables: [
      {
        id: 'customers',
        name: 'customers',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'full_name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: false },
          { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false, isUnique: true },
          { name: 'created_at', type: 'DATETIME', isPrimaryKey: false, isNullable: true, defaultValue: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'DATETIME', isPrimaryKey: false, isNullable: true },
        ],
        indexes: [{ name: 'ix_customers_email', columns: ['email'], unique: false }],
      },
      {
        id: 'products',
        name: 'products',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'sku', type: 'VARCHAR(40)', isPrimaryKey: false, isNullable: false, isUnique: true },
          { name: 'price', type: 'DECIMAL(10,2)', isPrimaryKey: false, isNullable: false },
        ],
      },
      {
        id: 'orders',
        name: 'orders',
        columns: [
          { name: 'id', type: 'BIGINT', isPrimaryKey: true, isNullable: false },
          { name: 'customer_id', type: 'INT', isPrimaryKey: false, isNullable: false, isForeignKey: true },
          { name: 'status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: false, defaultValue: "'pending'" },
          { name: 'total', type: 'DECIMAL(10,2)', isPrimaryKey: false, isNullable: false },
          { name: 'placed_at', type: 'DATETIME', isPrimaryKey: false, isNullable: false },
        ],
      },
      {
        id: 'order_items',
        name: 'order_items',
        columns: [
          { name: 'order_id', type: 'BIGINT', isPrimaryKey: true, isNullable: false, isForeignKey: true },
          { name: 'product_id', type: 'INT', isPrimaryKey: true, isNullable: false, isForeignKey: true },
          { name: 'quantity', type: 'INT', isPrimaryKey: false, isNullable: false, defaultValue: '1' },
        ],
      },
    ],
    relationships: [
      { id: 'r1', sourceTable: 'customers', targetTable: 'orders', sourceColumn: 'id', targetColumn: 'customer_id', cardinality: '1-N', onDelete: 'CASCADE' },
      { id: 'r2', sourceTable: 'orders', targetTable: 'order_items', sourceColumn: 'id', targetColumn: 'order_id', cardinality: '1-N', onDelete: 'CASCADE' },
      { id: 'r3', sourceTable: 'products', targetTable: 'order_items', sourceColumn: 'id', targetColumn: 'product_id', cardinality: '1-N', onDelete: 'CASCADE' },
    ],
    views: [{ name: 'customer_overview', query: 'SELECT id, email FROM customers' }],
    triggers: [
      {
        name: 'trg_customers_touch',
        table: 'customers',
        timing: 'AFTER',
        event: 'UPDATE',
        rawSql:
          'CREATE TRIGGER trg_customers_touch AFTER UPDATE ON customers FOR EACH ROW BEGIN UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END',
      },
      {
        // مكتوب لـMySQL: يجب أن يُترجم إلى AFTER INSERT ... UPDATE على SQLite
        name: 'trg_customers_audit',
        table: 'customers',
        timing: 'AFTER',
        event: 'INSERT',
        rawSql:
          'CREATE TRIGGER `trg_customers_audit` AFTER INSERT ON `customers` FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); SET NEW.full_name = TRIM(NEW.full_name); END',
      },
    ],
  };
}

function run(command: string, args: string[], cwd: string, label: string, timeout: number): string {
  const options = {
    cwd,
    encoding: 'utf8' as const,
    timeout,
    env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
  };
  // composer على Windows ملف .bat — يحتاج shell؛ نمرّر الأمر كسلسلة واحدة
  // لتجنّب تحذير Node DEP0190 (وسائط مع shell).
  const result =
    SHELL && command === 'composer'
      ? spawnSync([command, ...args].join(' '), { ...options, shell: true })
      : spawnSync(command, args, options);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    throw new Error(`${label}: تعذّر تشغيل الأمر (${result.error.message})`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: انتهى بالرمز ${result.status}\n--- output ---\n${output.slice(-4000)}`);
  }
  return output;
}

function freePort(): Promise<number> {
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

interface ApiResponse {
  status: number;
  body: any;
}

let projectDir = '';
let baseUrl = '';
let server: ChildProcess | null = null;
let serverLog = '';
let token = '';

async function api(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.auth) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function stopServer(): void {
  if (!server || server.killed) return;
  const pid = server.pid;
  if (pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else if (pid) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        server.kill('SIGTERM');
      } catch {
        // الخادم توقّف بالفعل
      }
    }
  }
  server = null;
}

async function startServer(): Promise<void> {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
    cwd: projectDir,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, APP_ENV: 'local' },
  });
  server.stdout?.on('data', chunk => { serverLog += String(chunk); });
  server.stderr?.on('data', chunk => { serverLog += String(chunk); });
  server.on('error', error => { serverLog += `\n[spawn error] ${error.message}`; });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`php artisan serve خرج بالرمز ${server.exitCode}\n${serverLog}`);
    }
    try {
      const health = await fetch(`${baseUrl}/up`, { signal: AbortSignal.timeout(2000) });
      if (health.ok) return;
    } catch {
      // لم يجهز بعد
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`الخادم لم يستجب على ${baseUrl}/up خلال 90 ثانية\n${serverLog}`);
}

e2e('generated Laravel project (composer install → migrate → REST API)', () => {
  const model = shopSchema();
  const project = generateBackendProject({
    model,
    projectName: 'e2e-shop',
    options: {
      db: 'sqlite',
      framework: 'laravel',
      mode: 'full',
      auth: true,
      routingReason: 'manual',
      aiSeedRows: {
        customers: [
          { full_name: 'Maya Haddad', email: 'maya.haddad@example.com' },
          { full_name: 'Omar Nasser', email: 'omar.nasser@example.com' },
        ],
      },
      aiNotes: ['E2E fixture rows.'],
    },
  });

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'schema-studio-laravel-e2e-'));
    for (const file of project.files) {
      const target = join(projectDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content, 'utf8');
    }

    run('composer', ['install', '--no-interaction', '--prefer-dist', '--no-progress'], projectDir, 'composer install', COMPOSER_TIMEOUT);
    run('php', ['artisan', 'key:generate', '--force'], projectDir, 'php artisan key:generate', ARTISAN_TIMEOUT);
    run('php', ['artisan', 'migrate', '--force'], projectDir, 'php artisan migrate', ARTISAN_TIMEOUT);
    run('php', ['artisan', 'db:seed', '--force'], projectDir, 'php artisan db:seed', ARTISAN_TIMEOUT);
    run('php', ['artisan', 'route:list', '--json'], projectDir, 'php artisan route:list', ARTISAN_TIMEOUT);

    await startServer();

    const registered = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E Main', email: `main-${Date.now()}@example.com`, password: 'Sup3rSecret!' }),
    });
    if (registered.status !== 201 || typeof registered.body?.token !== 'string') {
      throw new Error(`تعذّر تجهيز توكن الاختبار: ${registered.status} ${JSON.stringify(registered.body)}`);
    }
    token = registered.body.token;
  }, 20 * 60 * 1000);

  afterAll(() => {
    stopServer();
    if (projectDir && process.env.LARAVEL_E2E_KEEP !== '1') {
      rmSync(projectDir, { recursive: true, force: true });
    } else if (projectDir) {
      console.log(`[laravel-e2e] kept project at ${projectDir}`);
    }
  }, 60_000);

  it('registers the generated API routes', () => {
    const output = run('php', ['artisan', 'route:list', '--json'], projectDir, 'php artisan route:list', ARTISAN_TIMEOUT);
    const json = output.slice(output.indexOf('['));
    const routes = JSON.parse(json) as { uri: string; method: string }[];
    const uris = routes.map(route => route.uri);

    expect(uris).toEqual(
      expect.arrayContaining([
        'api/customers',
        'api/customers/{id}',
        'api/order-items/{key1}/{key2}',
        'api/auth/register',
        'api/auth/login',
        'api/auth/me',
      ])
    );
  });

  it('applies views and triggers in the same migrate run', () => {
    const probePath = join(projectDir, 'e2e_probe.php');
    writeFileSync(
      probePath,
      [
        '<?php',
        "$pdo = new PDO('sqlite:'.__DIR__.'/database/database.sqlite');",
        '$rows = $pdo->query("SELECT type, name FROM sqlite_master WHERE type IN (\'view\',\'trigger\',\'table\') ORDER BY type, name")->fetchAll(PDO::FETCH_ASSOC);',
        'echo json_encode($rows);',
        '',
      ].join('\n'),
      'utf8'
    );
    const output = run('php', ['e2e_probe.php'], projectDir, 'sqlite probe', ARTISAN_TIMEOUT);
    const objects = JSON.parse(output) as { type: string; name: string }[];
    const names = objects.map(object => object.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'customer_overview',
        'trg_customers_touch',
        'trg_customers_audit',
        'order_items',
        'personal_access_tokens',
      ])
    );
  });

  it('rejects unauthenticated access and validates registration', async () => {
    const anonymous = await api('/api/customers');
    expect(anonymous.status).toBe(401);

    const weak = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Weak', email: `weak-${Date.now()}@example.com`, password: 'short' }),
    });
    expect(weak.status).toBe(422);
  });

  it('signs in, reads the profile and invalidates the token on logout', async () => {
    const email = `flow-${Date.now()}@example.com`;
    const registered = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Flow User', email, password: 'An0therSecret!' }),
    });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(email);
    expect(registered.body.user.created_at).toBeTruthy();

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'An0therSecret!' }),
    });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');

    const loginToken = login.body.token as string;
    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Accept: 'application/json', Authorization: `Bearer ${loginToken}` } });
    expect(me.status).toBe(200);
    expect((await me.json()).email).toBe(email);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${loginToken}` },
    });
    expect(logout.status).toBe(204);

    const after = await fetch(`${baseUrl}/api/auth/me`, { headers: { Accept: 'application/json', Authorization: `Bearer ${loginToken}` } });
    expect(after.status).toBe(401);
  });

  it('serves CRUD for a single-key table and returns seeded rows', async () => {
    const list = await api('/api/customers', { auth: true });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const seeded = (list.body.data as { email: string }[]).map(row => row.email);
    expect(seeded).toEqual(expect.arrayContaining(['maya.haddad@example.com', 'omar.nasser@example.com']));

    const invalid = await api('/api/customers', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ full_name: 'No Email' }),
    });
    expect(invalid.status).toBe(422);

    const created = await api('/api/customers', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ full_name: 'Rana Saleh', email: `rana-${Date.now()}@example.com` }),
    });
    expect(created.status).toBe(201);
    expect(created.body.created_at).toBeTruthy();
    // الـTrigger المكتوب لـMySQL (SET NEW.updated_at) يجب أن يعمل بعد الترجمة
    expect(created.body.updated_at).toBeTruthy();
    const id = created.body.id as number;
    expect(Number.isInteger(id)).toBe(true);

    const show = await api(`/api/customers/${id}`, { auth: true });
    expect(show.status).toBe(200);
    expect(show.body.full_name).toBe('Rana Saleh');

    const updated = await api(`/api/customers/${id}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ full_name: 'Rana Saleh Updated' }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.full_name).toBe('Rana Saleh Updated');

    const removed = await api(`/api/customers/${id}`, { method: 'DELETE', auth: true });
    expect(removed.status).toBe(204);
    expect((await api(`/api/customers/${id}`, { auth: true })).status).toBe(404);
  });

  it('serves CRUD for a composite-key table', async () => {
    const stamp = Date.now();
    const product = await api('/api/products', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ sku: `SKU-${stamp}`, price: 19.5 }),
    });
    expect(product.status).toBe(201);
    expect(product.body.id).toBeTruthy();

    const customer = await api('/api/customers', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ full_name: 'Order Owner', email: `owner-${stamp}@example.com` }),
    });
    expect(customer.status).toBe(201);

    const order = await api('/api/orders', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        customer_id: customer.body.id,
        status: 'pending',
        total: 39,
        placed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }),
    });
    expect(order.status).toBe(201);
    const orderId = order.body.id as number;

    const item = await api('/api/order-items', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ order_id: orderId, product_id: product.body.id, quantity: 2 }),
    });
    expect(item.status).toBe(201);

    const keyed = `/api/order-items/${orderId}/${product.body.id}`;
    const show = await api(keyed, { auth: true });
    expect(show.status).toBe(200);
    expect(show.body.quantity).toBe(2);

    const updated = await api(keyed, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ quantity: 5 }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.quantity).toBe(5);

    const removed = await api(keyed, { method: 'DELETE', auth: true });
    expect(removed.status).toBe(204);
    expect((await api(keyed, { auth: true })).status).toBe(404);
  }, 60_000);
});
