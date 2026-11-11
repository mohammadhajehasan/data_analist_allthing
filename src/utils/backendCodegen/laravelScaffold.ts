/**
 * هيكل Laravel القابل للتشغيل + مساعدات ترحيل الكائنات
 * -----------------------------------------------------------------
 * المولّد كان يُصدر ملفات تطبيق فقط (Models/Migrations/Controllers)
 * ويطلب من المستخدم إنشاء مشروع Laravel ونسخها يدوياً؛ وكان ذلك
 * يترك المشروع غير قابل للتشغيل: مسارات API غير مسجّلة، وترحيل
 * users يتعارض مع ترحيل Laravel الافتراضي، وطلبات التحقق في مسار
 * غير موجود. هنا نُصدر الحد الأدنى المثبت تجريبياً لمشروع Laravel
 * 11/12 يعمل بـ`composer install` ثم `php artisan migrate`.
 */

import type { BackendColumn, BackendModel, BackendOptions, BackendTable } from './model';
import type { GeneratedFile } from './types';

export interface LaravelAuthPlan {
  /** عمود البريد المستخدم في تسجيل الدخول */
  email: BackendColumn;
  /** عمود كلمة المرور (يُخزَّن مُجزَّأً عبر Hash) */
  password: BackendColumn;
  /** عمود الاسم المعروض إن وُجد */
  display?: BackendColumn;
  /** هل جدول users مُولَّد لأن السكيما لا تحتويه؟ */
  synthetic: boolean;
}

export interface LaravelAuthResolution {
  plan: LaravelAuthPlan | null;
  warnings: string[];
}

function lower(name: string): string {
  return name.toLowerCase();
}

function findColumn(table: BackendTable, candidate: RegExp): BackendColumn | undefined {
  return table.columns.find(column => candidate.test(lower(column.name)));
}

/**
 * يحدّد أعمدة المصادقة من جدول users الموجود في السكيما.
 * إذا كان الجدول موجوداً بلا email/password فلا نولّد مسارات مصادقة
 * معطوبة — نُعطّلها ونشرح السبب في التحذيرات.
 */
export function resolveLaravelAuthPlan(model: BackendModel): LaravelAuthResolution {
  const warnings: string[] = [];
  const users = model.tables.find(table => lower(table.name) === 'users');
  if (!users) {
    warnings.push(
      'The schema has no `users` table, so a standard Laravel users table (id, name, email, password, timestamps) and User model were generated for authentication.'
    );
    const column = (name: string): BackendColumn => ({
      name,
      codeName: name,
      kind: 'string',
      rawType: 'VARCHAR(255)',
      primaryKey: false,
      nullable: false,
      unique: false,
      autoIncrement: false,
    });
    return {
      plan: {
        email: column('email'),
        password: column('password'),
        display: column('name'),
        synthetic: true,
      },
      warnings,
    };
  }

  const email = findColumn(users, /^e[-_]?mail$/);
  const password = findColumn(users, /^password(_hash)?$/);
  if (!email || !password) {
    const missing = [!email ? 'email' : null, !password ? 'password' : null].filter(Boolean).join(' and ');
    warnings.push(
      `Authentication was requested but \`users\` has no ${missing} column, so the auth endpoints were skipped instead of emitting code that cannot run. Add the column and regenerate.`
    );
    return { plan: null, warnings };
  }

  const display = findColumn(users, /^(name|full_name|username|display_name)$/);
  if (!display) {
    warnings.push(
      'The `users` table has no name/full_name/username column; registration therefore only asks for email and password.'
    );
  }

  return { plan: { email, password, display, synthetic: false }, warnings };
}

/** ترحيل users القياسي — يُستخدم فقط عندما لا تحتوي السكيما جدول users */
export function syntheticUsersMigration(): GeneratedFile {
  return {
    path: 'database/migrations/0001_01_01_000000_create_users_table.php',
    language: 'php',
    content: [
      '<?php',
      '',
      'use Illuminate\\Database\\Migrations\\Migration;',
      'use Illuminate\\Database\\Schema\\Blueprint;',
      'use Illuminate\\Support\\Facades\\Schema;',
      '',
      '// Generated because the schema has no users table and authentication was requested.',
      'return new class extends Migration',
      '{',
      '    public function up(): void',
      '    {',
      "        Schema::create('users', function (Blueprint $table) {",
      '            $table->id();',
      "            $table->string('name');",
      "            $table->string('email')->unique();",
      "            $table->timestamp('email_verified_at')->nullable();",
      "            $table->string('password');",
      "            $table->rememberToken();",
      '            $table->timestamps();',
      '        });',
      '    }',
      '',
      '    public function down(): void',
      '    {',
      "        Schema::dropIfExists('users');",
      '    }',
      '};',
      '',
    ].join('\n'),
  };
}

/** نموذج User القياسي — فقط عند توليد جدول users */
export function syntheticUserModel(): GeneratedFile {
  return {
    path: 'app/Models/User.php',
    language: 'php',
    content: [
      '<?php',
      '',
      'namespace App\\Models;',
      '',
      'use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;',
      'use Illuminate\\Foundation\\Auth\\User as Authenticatable;',
      'use Illuminate\\Notifications\\Notifiable;',
      'use Laravel\\Sanctum\\HasApiTokens;',
      '',
      'class User extends Authenticatable',
      '{',
      '    use HasApiTokens, HasFactory, Notifiable;',
      '',
      '    protected $fillable = [',
      "        'name',",
      "        'email',",
      "        'password',",
      '    ];',
      '',
      '    protected $hidden = [',
      "        'password',",
      "        'remember_token',",
      '    ];',
      '',
      '    protected $casts = [',
      "        'email_verified_at' => 'datetime',",
      "        'password' => 'hashed',",
      '    ];',
      '}',
      '',
    ].join('\n'),
  };
}

/** جدول Sanctum — شرط أن تعمل توكنات Bearer */
export function personalAccessTokensMigration(): GeneratedFile {
  return {
    path: 'database/migrations/0001_01_01_000001_create_personal_access_tokens_table.php',
    language: 'php',
    content: [
      '<?php',
      '',
      'use Illuminate\\Database\\Migrations\\Migration;',
      'use Illuminate\\Database\\Schema\\Blueprint;',
      'use Illuminate\\Support\\Facades\\Schema;',
      '',
      '// Sanctum requires this table for `createToken()` / Bearer authentication.',
      'return new class extends Migration',
      '{',
      '    public function up(): void',
      '    {',
      "        Schema::create('personal_access_tokens', function (Blueprint $table) {",
      '            $table->id();',
      "            $table->morphs('tokenable');",
      "            $table->string('name');",
      "            $table->string('token', 64)->unique();",
      "            $table->text('abilities')->nullable();",
      "            $table->timestamp('last_used_at')->nullable();",
      "            $table->timestamp('expires_at')->nullable();",
      '            $table->timestamps();',
      '        });',
      '    }',
      '',
      '    public function down(): void',
      '    {',
      "        Schema::dropIfExists('personal_access_tokens');",
      '    }',
      '};',
      '',
    ].join('\n'),
  };
}

function composerJson(projectName: string, auth: boolean): string {
  const require: Record<string, string> = {
    php: '^8.2',
    'laravel/framework': '^11.0|^12.0',
  };
  if (auth) require['laravel/sanctum'] = '^4.0';
  const payload = {
    name: `schema-studio/${projectName}`,
    type: 'project',
    description: 'Laravel API generated from an ER schema by Schema Studio.',
    keywords: ['laravel', 'api', 'schema'],
    license: 'MIT',
    require,
    autoload: {
      'psr-4': {
        'App\\': 'app/',
        'Database\\Factories\\': 'database/factories/',
        'Database\\Seeders\\': 'database/seeders/',
      },
    },
    config: {
      'optimize-autoloader': true,
      'sort-packages': true,
    },
    'minimum-stability': 'stable',
    'prefer-stable': true,
  };
  return `${JSON.stringify(payload, null, 4)}\n`;
}

function envBody(projectName: string, db: BackendOptions['db']): string {
  const appName = projectName.replace(/[-_]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  const lines = [
    `APP_NAME="${appName}"`,
    'APP_ENV=local',
    'APP_KEY=',
    'APP_DEBUG=true',
    'APP_URL=http://localhost:8000',
    '',
    'LOG_CHANNEL=stack',
    'LOG_LEVEL=debug',
    '',
  ];
  if (db === 'sqlite') {
    // لا نضع DB_DATABASE فارغاً: وجود المتغيّر بقيمة فارغة يمنع Laravel من
    // استخدام مساره الافتراضي database/database.sqlite
    lines.push(
      'DB_CONNECTION=sqlite',
      '# DB_DATABASE is intentionally unset: Laravel then uses database/database.sqlite.',
      ''
    );
  } else if (db === 'postgres') {
    lines.push(
      'DB_CONNECTION=pgsql',
      'DB_HOST=127.0.0.1',
      'DB_PORT=5432',
      'DB_DATABASE=appdb',
      'DB_USERNAME=postgres',
      'DB_PASSWORD=',
      ''
    );
  } else {
    lines.push(
      'DB_CONNECTION=mysql',
      'DB_HOST=127.0.0.1',
      'DB_PORT=3306',
      'DB_DATABASE=appdb',
      'DB_USERNAME=root',
      'DB_PASSWORD=',
      ''
    );
  }
  // file/sync drivers keep the scaffold free of the default sessions/cache/jobs tables
  lines.push(
    'SESSION_DRIVER=file',
    'CACHE_STORE=file',
    'QUEUE_CONNECTION=sync',
    'FILESYSTEM_DISK=local',
    ''
  );
  return lines.join('\n');
}

/** الحد الأدنى المُختبَر: artisan + bootstrap/app.php + public/index.php يكفي للإقلاع بلا مجلد config */
export function buildLaravelScaffold(
  projectName: string,
  options: BackendOptions,
  auth: boolean
): GeneratedFile[] {
  const gitignore = [
    '/vendor',
    '/node_modules',
    '/public/storage',
    '/storage/*.key',
    '/storage/*.sqlite',
    '/.env',
    '/.env.backup',
    '/.phpunit.result.cache',
    '',
  ].join('\n');

  const files: GeneratedFile[] = [
    { path: 'composer.json', language: 'json', content: composerJson(projectName, auth) },
    {
      path: 'artisan',
      language: 'php',
      content: [
        '#!/usr/bin/env php',
        '<?php',
        '',
        'use Illuminate\\Foundation\\Application;',
        'use Symfony\\Component\\Console\\Input\\ArgvInput;',
        '',
        "define('LARAVEL_START', microtime(true));",
        '',
        "require __DIR__.'/vendor/autoload.php';",
        '',
        '/** @var Application $app */',
        "$app = require_once __DIR__.'/bootstrap/app.php';",
        '',
        '$status = $app->handleCommand(new ArgvInput);',
        '',
        'exit($status);',
        '',
      ].join('\n'),
    },
    {
      path: 'bootstrap/app.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'use Illuminate\\Foundation\\Application;',
        'use Illuminate\\Foundation\\Configuration\\Exceptions;',
        'use Illuminate\\Foundation\\Configuration\\Middleware;',
        '',
        'return Application::configure(basePath: dirname(__DIR__))',
        '    ->withRouting(',
        "        // routes/api.php is registered here — without this line every /api route is 404.",
        "        api: __DIR__.'/../routes/api.php',",
        "        commands: __DIR__.'/../routes/console.php',",
        "        health: '/up',",
        '    )',
        '    ->withMiddleware(function (Middleware $middleware): void {',
        '        //',
        '    })',
        '    ->withExceptions(function (Exceptions $exceptions): void {',
        '        //',
        '    })->create();',
        '',
      ].join('\n'),
    },
    {
      path: 'bootstrap/providers.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'return [',
        '    App\\Providers\\AppServiceProvider::class,',
        '];',
        '',
      ].join('\n'),
    },
    {
      // كل المتحكّمات المولّدة ترث هذا الصنف — Laravel 11/12 يوفّره، لكن مشروعاً مستقلاً يحتاجه صراحةً
      path: 'app/Http/Controllers/Controller.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'namespace App\\Http\\Controllers;',
        '',
        'abstract class Controller',
        '{',
        '    //',
        '}',
        '',
      ].join('\n'),
    },
    {
      path: 'app/Providers/AppServiceProvider.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'namespace App\\Providers;',
        '',
        'use Illuminate\\Support\\ServiceProvider;',
        '',
        'class AppServiceProvider extends ServiceProvider',
        '{',
        '    public function register(): void',
        '    {',
        '        //',
        '    }',
        '',
        '    public function boot(): void',
        '    {',
        '        //',
        '    }',
        '}',
        '',
      ].join('\n'),
    },
    {
      path: 'public/index.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'use Illuminate\\Foundation\\Application;',
        'use Illuminate\\Http\\Request;',
        '',
        "define('LARAVEL_START', microtime(true));",
        '',
        "if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {",
        '    require $maintenance;',
        '}',
        '',
        "require __DIR__.'/../vendor/autoload.php';",
        '',
        '/** @var Application $app */',
        "$app = require_once __DIR__.'/../bootstrap/app.php';",
        '',
        '$app->handleRequest(Request::capture());',
        '',
      ].join('\n'),
    },
    {
      path: 'routes/console.php',
      language: 'php',
      content: [
        '<?php',
        '',
        'use Illuminate\\Foundation\\Inspiring;',
        'use Illuminate\\Support\\Facades\\Artisan;',
        '',
        "Artisan::command('inspire', function () {",
        '    $this->comment(Inspiring::quote());',
        "})->purpose('Display an inspiring quote');",
        '',
      ].join('\n'),
    },
    { path: '.env', language: 'env', content: envBody(projectName, options.db) },
    { path: '.env.example', language: 'env', content: envBody(projectName, options.db) },
    { path: '.gitignore', language: 'text', content: gitignore },
  ];

  // مجلدات يجب أن توجد قبل الإقلاع: bootstrap/cache وstorage
  for (const directory of [
    'bootstrap/cache',
    'storage/framework/cache/data',
    'storage/framework/sessions',
    'storage/framework/views',
    'storage/logs',
  ]) {
    files.push({
      path: `${directory}/.gitignore`,
      language: 'text',
      content: '*\n!.gitignore\n',
    });
  }

  if (options.db === 'sqlite') {
    files.push({ path: 'database/database.sqlite', language: 'text', content: '' });
  }

  return files;
}

/** يجرد قيود CHECK غير القابلة للتنفيذ بعد إنشاء الجدول على SQLite */
export function sqliteCheckWarnings(model: BackendModel): string[] {
  const warnings: string[] = [];
  for (const table of model.tables) {
    const checks = [
      ...(table.tableChecks ?? []).filter(check => check.trim() !== ''),
      ...table.columns
        .filter(column => (column.check ?? '').trim() !== '')
        .map(column => `${column.name}: ${column.check!.trim()}`),
    ];
    if (checks.length > 0) {
      warnings.push(
        `SQLite cannot add CHECK constraints to an existing table, so these checks on \`${table.name}\` are documented in the migration but not enforced: ${checks.join('; ')}. Use MySQL/PostgreSQL to enforce them.`
      );
    }
  }
  return warnings;
}
