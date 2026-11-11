/**
 * اختبار انحدار حقيقي لمشروع FastAPI المولَّد
 * -----------------------------------------------------------------
 * يثبّت requirements في بيئة افتراضية، يقلع uvicorn، ويستدعي مسارات API
 * الفعلية (مصادقة Bearer، CRUD، مفاتيح مركّبة) مع بيانات البذر.
 * يُشغَّل عبر `npm run test:fastapi-e2e` أو في CI فقط.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import { generateBackendProject } from '../utils/backendCodegen';
import {
  apiClient,
  enabled,
  installProject,
  runCommand,
  startServer,
  stopServer,
  writeProject,
  type ApiResponse,
  type RunningServer,
} from './pythonProjectHarness';

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
        ],
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
  };
}

const e2e = enabled() ? describe : describe.skip;

e2e('generated FastAPI project (pip install → create tables → REST API)', () => {
  const project = generateBackendProject({
    model: shopSchema(),
    projectName: 'e2e-fastapi',
    options: {
      db: 'sqlite',
      framework: 'fastapi',
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

  let projectDir = '';
  let server: RunningServer | null = null;
  let api: ReturnType<typeof apiClient>;
  let token = '';
  const auth = () => ({ token });

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'schema-studio-fastapi-e2e-'));
    writeProject(projectDir, project.files);
    const pythonPath = installProject(projectDir);

    server = await startServer(pythonPath, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '{PORT}', '--log-level', 'warning'], projectDir, '/health');
    api = apiClient(server.baseUrl);

    // الجداول تُنشأ عند الإقلاع (AUTO_CREATE_TABLES=1) — البذر بعدها
    if (project.files.some(file => file.path === 'app/seed_demo.py')) {
      runCommand(pythonPath, ['-m', 'app.seed_demo'], projectDir, 'python -m app.seed_demo', 2 * 60 * 1000);
    }

    const registered = await api('/api/auth/register', {
      body: { email: `main-${Date.now()}@example.com`, password: 'Sup3rSecret!' },
    });
    if (registered.status !== 201 || typeof registered.body?.token !== 'string') {
      throw new Error(`تعذّر تجهيز توكن الاختبار: ${registered.status} ${JSON.stringify(registered.body)}`);
    }
    token = registered.body.token;
  }, 20 * 60 * 1000);

  afterAll(() => {
    stopServer(server);
    if (projectDir && process.env.PY_BACKEND_E2E_KEEP !== '1') {
      rmSync(projectDir, { recursive: true, force: true });
    } else if (projectDir) {
      console.log(`[fastapi-e2e] kept project at ${projectDir}`);
    }
  }, 60_000);

  it('protects business routes and validates registration', async () => {
    expect((await api('/api/customers')).status).toBe(401);

    const weak = await api('/api/auth/register', {
      body: { email: `weak-${Date.now()}@example.com`, password: 'short' },
    });
    expect(weak.status).toBe(422);
  });

  it('signs in, reads the profile and invalidates the token on logout', async () => {
    const email = `flow-${Date.now()}@example.com`;
    const registered = await api('/api/auth/register', { body: { email, password: 'An0therSecret!' } });
    expect(registered.status).toBe(201);

    const login = await api('/api/auth/login', { body: { email, password: 'An0therSecret!' } });
    expect(login.status).toBe(200);
    const loginToken = login.body.token as string;
    expect(typeof loginToken).toBe('string');

    const me = await api('/api/auth/me', { token: loginToken });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    expect((await api('/api/auth/logout', { method: 'POST', token: loginToken })).status).toBe(204);
    expect((await api('/api/auth/me', { token: loginToken })).status).toBe(401);
  });

  it('serves CRUD for a single-key table and returns seeded rows', async () => {
    const list: ApiResponse = await api('/api/customers', auth());
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect((list.body as { email: string }[]).map(row => row.email)).toEqual(
      expect.arrayContaining(['maya.haddad@example.com', 'omar.nasser@example.com'])
    );

    const invalid = await api('/api/customers', { ...auth(), body: { full_name: 'No Email' } });
    expect(invalid.status).toBe(422);

    const created = await api('/api/customers', {
      ...auth(),
      body: { full_name: 'Rana Saleh', email: `rana-${Date.now()}@example.com` },
    });
    expect(created.status).toBe(201);
    expect(created.body.created_at).toBeTruthy();
    const id = created.body.id as number;
    expect(Number.isInteger(id)).toBe(true);

    const show = await api(`/api/customers/${id}`, auth());
    expect(show.status).toBe(200);
    expect(show.body.full_name).toBe('Rana Saleh');

    const updated = await api(`/api/customers/${id}`, { ...auth(), method: 'PUT', body: { full_name: 'Rana Saleh Updated' } });
    expect(updated.status).toBe(200);
    expect(updated.body.full_name).toBe('Rana Saleh Updated');

    expect((await api(`/api/customers/${id}`, { ...auth(), method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/customers/${id}`, auth())).status).toBe(404);
  });

  it('serves CRUD for a composite-key table', async () => {
    const stamp = Date.now();
    const product = await api('/api/products', { ...auth(), body: { sku: `SKU-${stamp}`, price: 19.5 } });
    expect(product.status).toBe(201);

    const customer = await api('/api/customers', {
      ...auth(),
      body: { full_name: 'Order Owner', email: `owner-${stamp}@example.com` },
    });
    expect(customer.status).toBe(201);

    const order = await api('/api/orders', {
      ...auth(),
      body: {
        customer_id: customer.body.id,
        status: 'pending',
        total: 39,
        placed_at: new Date().toISOString(),
      },
    });
    expect(order.status).toBe(201);

    const item = await api('/api/order-items', {
      ...auth(),
      body: { order_id: order.body.id, product_id: product.body.id, quantity: 2 },
    });
    expect(item.status).toBe(201);

    const keyed = `/api/order-items/${order.body.id}/${product.body.id}`;
    const show = await api(keyed, auth());
    expect(show.status).toBe(200);
    expect(show.body.quantity).toBe(2);

    const updated = await api(keyed, { ...auth(), method: 'PUT', body: { quantity: 5 } });
    expect(updated.status).toBe(200);
    expect(updated.body.quantity).toBe(5);

    expect((await api(keyed, { ...auth(), method: 'DELETE' })).status).toBe(204);
    expect((await api(keyed, auth())).status).toBe(404);
  }, 60_000);
});
