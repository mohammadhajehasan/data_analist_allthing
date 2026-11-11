import { describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import {
  BackendCodegenError,
  generateBackendProject,
  resolveFramework,
  type BackendOptions,
} from '../utils/backendCodegen';
import { createZip } from '../utils/zipStore';

function schema(): ErModel {
  return {
    diagramNames: ['Shop'],
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
        id: 'products',
        name: 'products',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'sku', type: 'VARCHAR(40)', isPrimaryKey: false, isNullable: false, isUnique: true },
          { name: 'price', type: 'DECIMAL(10,2)', isPrimaryKey: false, isNullable: false },
        ],
      },
      {
        id: 'order_items',
        name: 'order_items',
        columns: [
          { name: 'order_id', type: 'BIGINT', isPrimaryKey: true, isNullable: false, isForeignKey: true },
          { name: 'product_id', type: 'INT', isPrimaryKey: true, isNullable: false, isForeignKey: true },
          { name: 'quantity', type: 'INT', isPrimaryKey: false, isNullable: false, defaultValue: '1', check: 'quantity > 0' },
        ],
      },
    ],
    relationships: [
      { id: 'r1', sourceTable: 'customers', targetTable: 'orders', cardinality: '1-N' },
      { id: 'r2', sourceTable: 'orders', targetTable: 'order_items', cardinality: '1-N' },
      { id: 'r3', sourceTable: 'products', targetTable: 'order_items', cardinality: '1-N' },
      { id: 'r4', sourceTable: 'orders', targetTable: 'products', cardinality: 'N-M' },
    ],
  };
}

const options = (overrides: Partial<BackendOptions> = {}): BackendOptions => ({
  db: 'postgres',
  framework: 'fastapi',
  mode: 'full',
  auth: false,
  ...overrides,
});

function file(project: ReturnType<typeof generateBackendProject>, path: string): string {
  const match = project.files.find(entry => entry.path === path);
  expect(match, `missing generated file ${path}`).toBeDefined();
  return match!.content;
}

function paths(project: ReturnType<typeof generateBackendProject>): string[] {
  return project.files.map(entry => entry.path);
}

describe('backend stack selection', () => {
  it('chooses Laravel for MySQL and FastAPI for PostgreSQL/SQLite', () => {
    expect(resolveFramework('mysql', 'auto')).toBe('laravel');
    expect(resolveFramework('postgres', 'auto')).toBe('fastapi');
    expect(resolveFramework('sqlite', 'auto')).toBe('fastapi');
  });

  it('lets a manual choice override the automatic rule', () => {
    expect(resolveFramework('mysql', 'fastapi')).toBe('fastapi');
    expect(resolveFramework('postgres', 'pdo')).toBe('pdo');
    const project = generateBackendProject({
      model: schema(),
      options: options({ db: 'mysql', framework: 'pdo' }),
      projectName: 'shop-demo',
    });
    expect(project.framework).toBe('pdo');
    expect(project.label).toContain('PHP 8');
    expect(paths(project)).toContain('public/index.php');
  });
});

describe('FastAPI generator', () => {
  const project = generateBackendProject({
    model: schema(),
    options: options({ auth: true }),
    projectName: 'shop-demo',
  });

  it('ships VS Code workspace settings and framework tasks', () => {
    expect(paths(project)).toEqual(
      expect.arrayContaining(['.vscode/settings.json', '.vscode/extensions.json', '.vscode/tasks.json', '.vscode/launch.json', 'shop-demo.code-workspace'])
    );
    const tasks = JSON.parse(file(project, '.vscode/tasks.json')) as { tasks: { command: string }[] };
    expect(tasks.tasks.map(task => task.command)).toContain('uvicorn app.main:app --reload');
    const workspace = JSON.parse(file(project, 'shop-demo.code-workspace')) as { folders: { path: string }[] };
    expect(workspace.folders).toEqual([{ path: '.' }]);

    const laravel = generateBackendProject({
      model: schema(),
      options: options({ db: 'mysql', framework: 'laravel' }),
      projectName: 'shop-demo',
    });
    const laravelTasks = JSON.parse(file(laravel, '.vscode/tasks.json')) as { tasks: { command: string }[] };
    expect(laravelTasks.tasks.map(task => task.command)).toEqual(
      expect.arrayContaining(['composer install', 'php artisan migrate', 'php artisan serve'])
    );
  });

  it('generates models, schemas, routers, migrations and auth', () => {
    expect(paths(project)).toEqual(
      expect.arrayContaining([
        'app/models.py',
        'app/schemas.py',
        'app/routers/orders.py',
        'app/routers/order_items.py',
        'app/auth_models.py',
        'app/routers/auth.py',
        'migrations/001_init.sql',
        'migrations/002_auth.sql',
        'requirements.txt',
        'README.md',
      ])
    );
    expect(project.stats.junctionTables).toBe(1);
    expect(project.stats.endpoints).toBe(25);
    expect(project.warnings).toEqual([]);
  });

  it('mirrors constraints and relations in SQLAlchemy models', () => {
    const models = file(project, 'app/models.py');
    expect(models).toContain('class Customer(Base):');
    expect(models).toContain('email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)');
    expect(models).toContain('customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False, index=True)');
    expect(models).toContain('CheckConstraint("quantity > 0", name="ck_order_items_quantity")');
    expect(models).toContain('customer: Mapped[Optional["Customer"]] = relationship(back_populates="orders")');
    expect(models).toContain(
      'order_items: Mapped[list["OrderItem"]] = relationship(back_populates="order", passive_deletes=True)'
    );
    expect(models).toContain('server_default=text("\'pending\'")');
    // ForeignKey positional قبل أي keyword — قاعدة Python
    expect(models).not.toMatch(/mapped_column\([^)]*nullable=[^)]*ForeignKey/);
    // SQLite يحتاج تفعيل FK لكل اتصال، وإلا يمرّ الحذف غير الآمن بصمت
    expect(file(project, 'app/database.py')).toContain('PRAGMA foreign_keys=ON');
  });

  it('validates unique fields, lengths, e-mail and foreign keys', () => {
    const customers = file(project, 'app/routers/customers.py');
    const orders = file(project, 'app/routers/orders.py');
    const schemas = file(project, 'app/schemas.py');
    expect(customers).toContain('raise HTTPException(status_code=409, detail="email must be unique")');
    expect(orders).toContain('db.get(Customer, data.get("customer_id")) is None');
    expect(schemas).toContain('full_name: str = Field(max_length=120)');
    expect(schemas).toContain('email: EmailStr = Field(max_length=255)');
    expect(schemas).toContain('model_config = ConfigDict(from_attributes=True)');
  });

  it('emits full CRUD routes and protects them when auth is on', () => {
    const router = file(project, 'app/routers/orders.py');
    expect(router).toContain('dependencies=[Depends(get_current_user)]');
    expect(router).toContain('@router.get("", response_model=list[OrderOut])');
    expect(router).toContain('@router.post("", response_model=OrderOut');
    expect(router).toContain('@router.get("/{id}", response_model=OrderOut)');
    expect(router).toContain('@router.put("/{id}", response_model=OrderOut)');
    expect(router).toContain('@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)');
    // المفتاح المركّب: مسار بمعاملين
    expect(file(project, 'app/routers/order_items.py')).toContain('@router.get("/{order_id}/{product_id}"');
  });

  it('writes the exact SQL schema to the migration file', () => {
    const sql = file(project, 'migrations/001_init.sql');
    expect(sql).toContain('CREATE TABLE "customers"');
    expect(sql).toContain('"email" VARCHAR(255) NOT NULL UNIQUE');
    expect(sql).toContain('CREATE TABLE "orders_products_junction"');
    expect(sql).toContain('FOREIGN KEY ("customer_id") REFERENCES "customers"("id")');
    expect(sql).toContain('PRIMARY KEY ("order_id", "product_id")');
    expect(sql).toContain('CHECK (quantity > 0)');
  });

  it('supports models-only mode without API files', () => {
    const modelsOnly = generateBackendProject({
      model: schema(),
      options: options({ mode: 'models', auth: true }),
      projectName: 'shop-demo',
    });
    expect(paths(modelsOnly)).toContain('app/models.py');
    expect(paths(modelsOnly)).toContain('migrations/001_init.sql');
    expect(paths(modelsOnly)).not.toContain('app/main.py');
    expect(paths(modelsOnly)).not.toContain('app/routers/orders.py');
    expect(paths(modelsOnly)).not.toContain('app/schemas.py');
    expect(modelsOnly.stats.endpoints).toBe(0);
  });

  it('never leaks template placeholders into generated files', () => {
    for (const entry of project.files) {
      expect(entry.content, entry.path).not.toContain('undefined');
      expect(entry.content, entry.path).not.toContain('${');
    }
  });

  it('stamps every file with generation metadata and ships an auditable MANIFEST', () => {
    expect(paths(project)).toContain('MANIFEST.json');
    const models = file(project, 'app/models.py');
    expect(models.startsWith('# Generated automatically by Schema Studio')).toBe(true);
    const manifest = JSON.parse(file(project, 'MANIFEST.json'));
    expect(manifest.generation.operationId).toBe(project.generation.operationId);
    expect(manifest.generation.routingReason).toBe('manual');
    expect(manifest.generation.aiEnrichment).toBe(false);
    expect(manifest.files.every((entry: { source: string }) => entry.source === 'template')).toBe(true);
  });

  it('adds optional AI seed data without letting it change the schema', () => {
    const enriched = generateBackendProject({
      model: schema(),
      options: options({
        routingReason: 'manual',
        aiSeedRows: {
          customers: [
            { id: 99, full_name: 'Maya Haddad', email: 'maya@example.com' },
            { full_name: 'Omar Nasser', email: 'omar@example.com' },
          ],
        },
        aiNotes: ['Realistic demo rows.'],
      }),
      projectName: 'shop-demo',
      operationId: 'gen_fixed',
      generatedAt: '2026-11-09T00:00:00.000Z',
    });
    expect(enriched.generation.routingReason).toBe('manual');
    expect(enriched.generation.aiEnrichment).toBe(true);
    const seed = file(enriched, 'app/seed_demo.py');
    expect(seed).toContain('Maya Haddad');
    expect(seed).toContain('INSERT INTO');
    // auto-increment primary keys must never be injected from AI output
    expect(seed).not.toContain('"id": 99');
    const manifest = JSON.parse(file(enriched, 'MANIFEST.json'));
    expect(manifest.generation.operationId).toBe('gen_fixed');
    expect(manifest.files.find((entry: { path: string }) => entry.path === 'app/seed_demo.py').source).toBe('ai');
    expect(manifest.generation.aiNotes).toContain('Realistic demo rows.');
  });
});

describe('Django generator', () => {
  const django = generateBackendProject({
    model: schema(),
    options: options({ db: 'postgres', framework: 'django' }),
    projectName: 'shop-demo',
  });

  it('generates a Django + DRF project with managed=False models', () => {
    expect(django.framework).toBe('django');
    expect(django.language).toBe('python');
    expect(django.label).toContain('Django');
    expect(paths(django)).toEqual(
      expect.arrayContaining([
        'manage.py',
        'config/settings.py',
        'config/urls.py',
        'api/models.py',
        'api/serializers.py',
        'api/views.py',
        'api/urls.py',
        'migrations/001_init.sql',
        'requirements.txt',
        'README.md',
      ])
    );
    const models = file(django, 'api/models.py');
    expect(models).toContain('class Customer(models.Model):');
    expect(models).toContain('managed = False');
    expect(models).toContain('db_table = "customers"');
    expect(models).toContain('email = models.CharField(max_length=255, unique=True)');
    expect(models).toContain('customer = models.ForeignKey(');
    expect(models).toContain('models.CompositePrimaryKey("order", "product")');
    expect(file(django, 'config/settings.py')).toContain('django.db.backends.postgresql');
    expect(file(django, 'api/views.py')).toContain('class CustomerViewSet(viewsets.ModelViewSet):');
    expect(file(django, 'api/views.py')).toContain('class OrderItemDetailView(generics.RetrieveUpdateDestroyAPIView):');
    expect(file(django, 'api/urls.py')).toContain('api/order-items/');
    expect(file(django, '.vscode/tasks.json')).toContain('python manage.py runserver');
  });

  it('adds TokenAuthentication and auth routes only when auth is enabled', () => {
    const secured = generateBackendProject({
      model: schema(),
      options: options({ db: 'postgres', framework: 'django', auth: true }),
      projectName: 'shop-demo',
    });
    expect(paths(secured)).toEqual(
      expect.arrayContaining(['api/auth_views.py', 'api/auth_urls.py'])
    );
    expect(file(secured, 'config/settings.py')).toContain('rest_framework.authentication.TokenAuthentication');
    expect(file(secured, 'config/settings.py')).toContain('rest_framework.authtoken');
    expect(file(secured, 'api/urls.py')).toContain('api/auth/');
    expect(paths(django)).not.toContain('api/auth_views.py');
  });
});

describe('Laravel generator', () => {
  const project = generateBackendProject({
    model: schema(),
    options: options({ db: 'mysql', framework: 'laravel', auth: true }),
    projectName: 'shop-demo',
  });

  it('creates Eloquent models with relations and fillable fields', () => {
    const order = file(project, 'app/Models/Order.php');
    expect(order).toContain('class Order extends Model');
    expect(order).toContain("protected $table = 'orders';");
    expect(order).toContain("return $this->belongsTo(Customer::class, 'customer_id', 'id');");
    expect(order).toContain("return $this->hasMany(OrderItem::class, 'order_id', 'id');");
    expect(order).toContain("'total' => 'decimal:2'");
    expect(order).toContain('public $timestamps = false;');
  });

  it('emits migrations with composite PKs and FKs even on PK columns', () => {
    const migration = paths(project).find(path => path.includes('create_order_items_table'))!;
    const content = file(project, migration);
    expect(content).toContain("$table->primary(['order_id', 'product_id']);");
    expect(content).toContain("$table->foreign('order_id')->references('id')->on('orders');");
    expect(content).toContain("$table->foreign('product_id')->references('id')->on('products');");
    // عمود PK مركّب لا يُضاف كـ autoIncrement
    expect(content).not.toContain("$table->increments('order_id')");
  });

  it('validates unique, exists and length rules, and ignores the current row on update', () => {
    const store = file(project, 'app/Http/Requests/StoreCustomerRequest.php');
    const update = file(project, 'app/Http/Requests/UpdateCustomerRequest.php');
    expect(store).toContain("'email' => ['required', 'string', 'max:255', 'email', Rule::unique('customers', 'email')]");
    expect(update).toContain("Rule::unique('customers', 'email')->ignore($id, 'id')");
    expect(file(project, 'app/Http/Requests/StoreOrderRequest.php')).toContain("'exists:customers,id'");
    const controller = file(project, 'app/Http/Controllers/CustomerController.php');
    expect(controller).toContain('public function store(StoreCustomerRequest $request): JsonResponse');
    expect(controller).toContain('$data = $request->validated();');
  });

  it('uses the query builder for composite-key updates/deletes (Eloquent has no composite PK)', () => {
    const controller = file(project, 'app/Http/Controllers/OrderItemController.php');
    expect(controller).toContain("OrderItem::query()->where('order_id', $key1)->where('product_id', $key2)->update($data);");
    expect(controller).toContain("OrderItem::query()->where('order_id', $key1)->where('product_id', $key2)->delete();");
    expect(controller).not.toContain('$item->save();');
  });

  it('registers API resources and auth middleware', () => {
    const routes = file(project, 'routes/api.php');
    expect(routes).toContain("Route::apiResource('customers', CustomerController::class)->parameters(['customers' => 'id']);");
    expect(routes).toContain("Route::middleware('auth:sanctum')->group(function () {");
    expect(routes).toContain("Route::post('auth/login', [AuthController::class, 'login']);");
    expect(paths(project)).toContain('app/Http/Controllers/AuthController.php');
  });

  it('generates AI seeders and a routing decision in the bilingual README', () => {
    const enriched = generateBackendProject({
      model: schema(),
      options: options({
        db: 'mysql',
        framework: 'laravel',
        routingReason: 'manual',
        aiSeedRows: { customers: [{ full_name: 'Maya Haddad', email: 'maya@example.com' }] },
        aiNotes: ['Realistic demo rows.'],
      }),
      projectName: 'shop-demo',
    });
    expect(file(enriched, 'database/seeders/DemoDataSeeder.php')).toContain("DB::table('customers')->insert");
    expect(file(enriched, 'database/seeders/DatabaseSeeder.php')).toContain('DemoDataSeeder::class');
    const readme = file(enriched, 'README.md');
    expect(readme).toContain('اختيار يدوي');
    expect(readme).toContain('Routing decision');
    expect(readme).toContain('AI enrichment');
  });
});

describe('Laravel runnable scaffold', () => {
  const project = generateBackendProject({
    model: schema(),
    options: options({ db: 'sqlite', framework: 'laravel', auth: true }),
    projectName: 'shop-demo',
  });

  it('ships a bootable Laravel skeleton', () => {
    expect(paths(project)).toEqual(
      expect.arrayContaining([
        'composer.json',
        'artisan',
        'bootstrap/app.php',
        'bootstrap/providers.php',
        'public/index.php',
        'app/Http/Controllers/Controller.php',
        'app/Providers/AppServiceProvider.php',
        'routes/api.php',
        '.env',
        '.env.example',
        'database/database.sqlite',
        'bootstrap/cache/.gitignore',
        'storage/framework/views/.gitignore',
      ])
    );
    expect(file(project, 'bootstrap/app.php')).toContain("api: __DIR__.'/../routes/api.php'");
    expect(file(project, 'public/index.php')).toContain("__DIR__.'/../vendor/autoload.php'");
    const composer = JSON.parse(file(project, 'composer.json')) as { require: Record<string, string> };
    expect(composer.require['laravel/framework']).toBeTruthy();
    expect(composer.require['laravel/sanctum']).toBeTruthy();
    expect(file(project, '.env')).toContain('DB_CONNECTION=sqlite');
    // متغيّر فارغ يمنع Laravel من استخدام database/database.sqlite
    expect(file(project, '.env')).not.toMatch(/^DB_DATABASE=$/m);
    // ملف قاعدة البيانات الفارغ يجب ألا يحمل رأس التوليد
    expect(file(project, 'database/database.sqlite')).toBe('');
  });

  it('keeps FormRequests under app/Http/Requests and refreshes created rows', () => {
    expect(file(project, 'app/Http/Requests/StoreOrderRequest.php')).toContain(
      'namespace App\\Http\\Requests;'
    );
    const controller = file(project, 'app/Http/Controllers/OrderController.php');
    expect(controller).toContain('StoreOrderRequest $request');
    expect(controller).toContain('$item->refresh();');
    expect(controller).toContain('return response()->json($item, 201);');
  });

  it('generates a standard users table and Sanctum pieces when the schema has none', () => {
    expect(paths(project)).toEqual(
      expect.arrayContaining([
        'database/migrations/0001_01_01_000000_create_users_table.php',
        'database/migrations/0001_01_01_000001_create_personal_access_tokens_table.php',
        'app/Models/User.php',
      ])
    );
    expect(file(project, 'app/Models/User.php')).toContain('HasApiTokens');
    expect(project.warnings.some(warning => warning.includes('no `users` table'))).toBe(true);
    expect(file(project, 'routes/api.php')).toContain("auth:sanctum");
  });

  it('uses the schema users columns for auth instead of assuming name/email/password', () => {
    const withUsers: ErModel = {
      diagramNames: ['Auth'],
      warnings: [],
      tables: [
        {
          id: 'users',
          name: 'users',
          columns: [
            { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
            { name: 'full_name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: false },
            { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false, isUnique: true },
            { name: 'password', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
          ],
        },
      ],
      relationships: [],
    };
    const authProject = generateBackendProject({
      model: withUsers,
      options: options({ db: 'sqlite', framework: 'laravel', auth: true }),
      projectName: 'auth-demo',
    });
    expect(file(authProject, 'app/Models/User.php')).toContain('extends Authenticatable');
    expect(file(authProject, 'app/Models/User.php')).toContain('use HasApiTokens;');
    const controller = file(authProject, 'app/Http/Controllers/AuthController.php');
    expect(controller).toContain("'full_name' => ['required', 'string', 'max:120'],");
    expect(controller).toContain("'email' => ['required', 'email'");
    expect(controller).not.toContain("'name' =>");
    expect(controller).toContain('$user->refresh();');
  });

  it('skips auth endpoints when the users table cannot support them', () => {
    const noPassword: ErModel = {
      diagramNames: ['Auth'],
      warnings: [],
      tables: [
        {
          id: 'users',
          name: 'users',
          columns: [
            { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
            { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
          ],
        },
      ],
      relationships: [],
    };
    const broken = generateBackendProject({
      model: noPassword,
      options: options({ db: 'sqlite', framework: 'laravel', auth: true }),
      projectName: 'broken-auth',
    });
    expect(paths(broken)).not.toContain('app/Http/Controllers/AuthController.php');
    expect(file(broken, 'routes/api.php')).not.toContain('auth:sanctum');
    expect(broken.warnings.some(warning => warning.includes('no password column'))).toBe(true);
  });

  it('rewrites triggers written for another engine into an equivalent definition', () => {
    const model = schema();
    model.triggers = [
      {
        name: 'trg_users_audit',
        table: 'customers',
        timing: 'AFTER',
        event: 'INSERT',
        rawSql:
          'CREATE TRIGGER `trg_users_audit` AFTER INSERT ON `customers` FOR EACH ROW BEGIN SET NEW.full_name = TRIM(NEW.full_name); END',
      },
      {
        name: 'trg_customers_touch',
        table: 'customers',
        timing: 'BEFORE',
        event: 'UPDATE',
        rawSql:
          'CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON customers FOR EACH ROW UPDATE customers SET created_at = CURRENT_TIMESTAMP WHERE id = NEW.id',
      },
      {
        name: 'trg_modern_audit',
        table: 'customers',
        timing: 'AFTER',
        event: 'INSERT',
        rawSql:
          'CREATE TRIGGER trg_modern_audit AFTER INSERT ON customers FOR EACH ROW EXECUTE FUNCTION audit_row()',
      },
    ];
    const sqlite = generateBackendProject({
      model,
      options: options({ db: 'sqlite', framework: 'laravel' }),
      projectName: 'triggers',
    });
    const migrationPath = paths(sqlite).find(path => path.includes('create_views_and_triggers'))!;
    const migration = file(sqlite, migrationPath);

    // MySQL SET NEW → SQLite AFTER trigger UPDATE بدل الاستبعاد
    expect(migration).toContain('CREATE TRIGGER "trg_users_audit" AFTER INSERT ON "customers"');
    expect(migration).toContain(
      'UPDATE "customers" SET "full_name" = TRIM(NEW."full_name") WHERE "id" = NEW."id";'
    );
    expect(sqlite.warnings.some(warning => warning.includes('trg_users_audit') && warning.includes('adapted for sqlite'))).toBe(true);

    // التعريف المكتوب أصلاً لـSQLite يبقى كما هو
    expect(migration).toContain('CREATE TRIGGER trg_customers_touch');

    // ما لا يمكن ترجمته بأمان (دالة PostgreSQL خارجية) يبقى موثّقاً بلا تنفيذ
    expect(migration).toContain('Trigger trg_modern_audit skipped');
    expect(sqlite.warnings.some(warning => warning.includes('trg_modern_audit') && warning.includes('left out'))).toBe(true);
  });

  it('generates an equivalent PostgreSQL function when the source trigger was MySQL', () => {
    const model = schema();
    model.triggers = [
      {
        name: 'trg_customers_trim',
        table: 'customers',
        timing: 'BEFORE',
        event: 'INSERT',
        rawSql:
          'CREATE TRIGGER `trg_customers_trim` BEFORE INSERT ON `customers` FOR EACH ROW BEGIN SET NEW.full_name = TRIM(NEW.full_name); END',
      },
    ];
    const postgres = generateBackendProject({
      model,
      options: options({ db: 'postgres', framework: 'laravel' }),
      projectName: 'triggers-pg',
    });
    const migrationPath = paths(postgres).find(path => path.includes('create_views_and_triggers'))!;
    const migration = file(postgres, migrationPath);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION "fn_trg_customers_trim"() RETURNS trigger AS $$');
    expect(migration).toContain('NEW."full_name" := TRIM(NEW."full_name");');
    expect(migration).toContain('FOR EACH ROW EXECUTE FUNCTION "fn_trg_customers_trim"();');
    // down() يحذف الدالة المولّدة أيضاً
    expect(migration).toContain('DROP FUNCTION IF EXISTS "fn_trg_customers_trim"();');
    expect(postgres.warnings.some(warning => warning.includes('adapted for postgres'))).toBe(true);
  });

  it('documents CHECK constraints on SQLite and enforces them on MySQL migrations', () => {
    const sqlitePath = paths(project).find(path => path.includes('create_order_items_table'))!;
    expect(file(project, sqlitePath)).toContain('// CHECK quantity not enforceable on SQLite: quantity > 0');
    expect(project.warnings.some(warning => warning.includes('SQLite cannot add CHECK constraints'))).toBe(true);

    const mysql = generateBackendProject({
      model: schema(),
      options: options({ db: 'mysql', framework: 'laravel' }),
      projectName: 'shop-demo',
    });
    const mysqlPath = paths(mysql).find(path => path.includes('create_order_items_table'))!;
    const migration = file(mysql, mysqlPath);
    expect(migration).toContain('ADD CONSTRAINT');
    expect(migration).toContain('CHECK (quantity > 0)');
  });
});

describe('plain PHP PDO generator', () => {
  const project = generateBackendProject({
    model: schema(),
    options: options({ db: 'sqlite', framework: 'pdo', auth: true }),
    projectName: 'shop-demo',
  });

  it('generates a runnable structure with prepared statements', () => {
    expect(paths(project)).toEqual(
      expect.arrayContaining([
        'public/index.php',
        'src/bootstrap.php',
        'src/Database.php',
        'src/Router.php',
        'src/Validator.php',
        'src/Controllers/OrderController.php',
        'src/Controllers/AuthController.php',
        'routes/api.php',
        'migrations/001_init.sql',
        'migrations/002_auth.sql',
      ])
    );
    const controller = file(project, 'src/Controllers/OrderController.php');
    expect(controller).toContain('Database::quote(\'orders\')');
    expect(controller).toContain('prepare($sql)');
    expect(controller).not.toContain('query(\'SELECT * FROM orders');
  });

  it('validates unique values on update while ignoring the current row', () => {
    const controller = file(project, 'src/Controllers/CustomerController.php');
    expect(controller).toContain("'unique:customers,email,id,' . $id . ''");
    const validator = file(project, 'src/Validator.php');
    expect(validator).toContain('AND NOT (');
  });

  it('uses positional route arguments so controller parameter names never break dispatch', () => {
    const router = file(project, 'src/Router.php');
    expect(router).toContain('(new $class())->{$action}(...array_values($params));');
  });

  it('does not register API routes in models-only mode', () => {
    const modelsOnly = generateBackendProject({
      model: schema(),
      options: options({ db: 'sqlite', framework: 'pdo', mode: 'models' }),
      projectName: 'shop-demo',
    });
    const routes = file(modelsOnly, 'routes/api.php');
    expect(routes).not.toContain('/api/orders');
    expect(paths(modelsOnly)).not.toContain('src/Controllers/OrderController.php');
  });
});

describe('edge cases', () => {
  it('rejects an empty schema with a readable error', () => {
    expect(() =>
      generateBackendProject({
        model: { diagramNames: [], tables: [], relationships: [], warnings: [] },
        options: options(),
        projectName: 'empty',
      })
    ).toThrow(BackendCodegenError);
  });

  it('keeps a table without a primary key to list/create and warns', () => {
    const table = schema().tables[0];
    const noPk: ErModel = {
      diagramNames: ['No PK'],
      warnings: [],
      relationships: [],
      tables: [
        {
          id: 'events',
          name: 'events',
          columns: [
            { name: 'message', type: 'TEXT', isPrimaryKey: false, isNullable: false },
            { name: 'created_at', type: 'DATETIME', isPrimaryKey: false, isNullable: true },
          ] as typeof table.columns,
        },
      ],
    };
    const project = generateBackendProject({ model: noPk, options: options(), projectName: 'events' });
    expect(project.warnings.some(warning => warning.includes('no primary key'))).toBe(true);
    expect(file(project, 'app/routers/events.py')).not.toContain('@router.get("/{');
    expect(file(project, 'app/routers/events.py')).toContain('@router.post(""');
    expect(project.stats.endpoints).toBe(2);
  });
});

describe('PRD edge cases', () => {
  function cyclicSchema(): ErModel {
    return {
      diagramNames: ['Org'],
      warnings: [],
      tables: [
        {
          id: 'teams',
          name: 'teams',
          columns: [
            { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
            { name: 'name', type: 'VARCHAR(80)', isPrimaryKey: false, isNullable: false },
            { name: 'lead_member_id', type: 'INT', isPrimaryKey: false, isNullable: true, isForeignKey: true },
          ],
        },
        {
          id: 'members',
          name: 'members',
          columns: [
            { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
            { name: 'team_id', type: 'INT', isPrimaryKey: false, isNullable: false, isForeignKey: true },
          ],
        },
      ],
      relationships: [
        { id: 'r1', sourceTable: 'teams', targetTable: 'members', cardinality: '1-N' },
        { id: 'r2', sourceTable: 'members', targetTable: 'teams', cardinality: '1-N', targetColumn: 'lead_member_id' },
      ],
    };
  }

  it('defers circular foreign keys to a second Laravel migration', () => {
    const project = generateBackendProject({
      model: cyclicSchema(),
      options: options({ db: 'mysql', framework: 'laravel' }),
      projectName: 'org',
    });
    expect(project.warnings.some(warning => warning.includes('Circular foreign-key'))).toBe(true);
    const deferredPath = paths(project).find(path => path.includes('add_deferred_foreign_keys'))!;
    expect(deferredPath).toBeDefined();
    const deferred = file(project, deferredPath);
    expect(deferred).toContain("Schema::table('teams'");
    expect(deferred).toContain("$table->foreign('lead_member_id')->references('id')->on('members');");
    const teamsMigrationPath = paths(project).find(path => path.includes('create_teams_table'))!;
    expect(file(project, teamsMigrationPath)).not.toContain("references('id')->on('members')");
    const membersMigrationPath = paths(project).find(path => path.includes('create_members_table'))!;
    expect(file(project, membersMigrationPath)).toContain("$table->foreign('team_id')");
  });

  it('defers circular foreign keys with ALTER in PostgreSQL and keeps SQLite inline', () => {
    const postgres = generateBackendProject({
      model: cyclicSchema(),
      options: options({ db: 'postgres', framework: 'fastapi' }),
      projectName: 'org',
    });
    const sql = file(postgres, 'migrations/001_init.sql');
    expect(sql).toContain('-- Phase 2: cyclic foreign keys deferred until all tables exist');
    expect(sql).toContain('ALTER TABLE "teams" ADD CONSTRAINT');
    expect(sql).toContain('FOREIGN KEY ("lead_member_id") REFERENCES "members"("id")');
    const teamsCreate = sql.slice(sql.indexOf('CREATE TABLE "teams"'), sql.indexOf('CREATE TABLE "members"'));
    expect(teamsCreate).not.toContain('FOREIGN KEY ("lead_member_id")');

    const sqlite = generateBackendProject({
      model: cyclicSchema(),
      options: options({ db: 'sqlite', framework: 'fastapi' }),
      projectName: 'org',
    });
    expect(file(sqlite, 'migrations/001_init.sql')).not.toContain('ADD CONSTRAINT');
  });

  it('carries indexes, views and triggers into migrations', () => {
    const model = cyclicSchema();
    model.tables[0].indexes = [{ name: 'ix_teams_name', columns: ['name'], unique: false }];
    model.views = [{ name: 'team_members', query: 'SELECT t.id AS team_id, m.id AS member_id FROM teams t JOIN members m ON m.team_id = t.id' }];
    model.triggers = [{
      name: 'trg_members_audit',
      table: 'members',
      timing: 'AFTER',
      event: 'INSERT',
      rawSql: "CREATE TRIGGER trg_members_audit AFTER INSERT ON members FOR EACH ROW INSERT INTO audit_log (member_id) VALUES (NEW.id)",
    }];

    const fastapi = generateBackendProject({
      model,
      options: options({ db: 'postgres', framework: 'fastapi' }),
      projectName: 'org',
    });
    const sql = file(fastapi, 'migrations/001_init.sql');
    expect(sql).toContain('CREATE INDEX "ix_teams_name" ON "teams" ("name");');
    expect(sql).toContain('CREATE VIEW "team_members" AS');
    expect(sql).toContain('CREATE TRIGGER trg_members_audit AFTER INSERT ON members');
    expect(fastapi.stats).toMatchObject({ indexes: 1, views: 1, triggers: 1 });

    const laravel = generateBackendProject({
      model,
      options: options({ db: 'mysql', framework: 'laravel' }),
      projectName: 'org',
    });
    const objectsPath = paths(laravel).find(path => path.includes('create_views_and_triggers'))!;
    expect(objectsPath).toBeDefined();
    const objects = file(laravel, objectsPath);
    expect(objects).toContain("DB::unprepared('CREATE VIEW `team_members` AS");
    expect(objects).toContain("DB::unprepared('CREATE TRIGGER trg_members_audit");
    expect(objects).toContain('DROP VIEW IF EXISTS');
    const teamsMigrationPath = paths(laravel).find(path => path.includes('create_teams_table'))!;
    expect(file(laravel, teamsMigrationPath)).toContain("$table->index(['name'], 'ix_teams_name');");
  });

  it('warns about unsupported SQL types and maps them to TEXT', () => {
    const model = cyclicSchema();
    model.tables[0].columns.push({ name: 'region', type: 'GEOGRAPHY', isPrimaryKey: false, isNullable: true });
    const project = generateBackendProject({
      model,
      options: options({ db: 'postgres', framework: 'fastapi' }),
      projectName: 'org',
    });
    expect(project.warnings.some(warning => warning.includes('unsupported SQL type "GEOGRAPHY"'))).toBe(true);
    expect(file(project, 'app/models.py')).toContain('region: Mapped[Optional[str]] = mapped_column(Text');
    const laravel = generateBackendProject({
      model,
      options: options({ db: 'mysql', framework: 'laravel' }),
      projectName: 'org',
    });
    const teamsMigrationPath = paths(laravel).find(path => path.includes('create_teams_table'))!;
    expect(file(laravel, teamsMigrationPath)).toContain('// Note: unsupported SQL type "GEOGRAPHY" mapped to text.');
  });
});

describe('ZIP writer', () => {
  it('writes a valid archive with the expected entries', () => {
    const archive = createZip(
      [
        { path: 'app/main.py', content: 'print("hi")\n' },
        { path: 'README.md', content: '# hi\n' },
      ],
      new Date(2026, 0, 1, 12, 0, 0)
    );
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = archive.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    expect(new TextDecoder().decode(archive.slice(30, 30 + 10))).toBe('app/main.p');
  });
});
