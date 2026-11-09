import type { BackendColumn, BackendModel, BackendOptions, BackendTable } from './model';
import { frameworkLabel, phpSingleQuote, singularTableName } from './model';
import type { GeneratedFile } from './types';
import {
  generateDdl,
  schemaDropTriggerStatement,
  schemaDropViewStatement,
  schemaTriggerStatement,
  schemaViewStatement,
} from '../ddlGenerator';

function camel(text: string): string {
  const parts = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'relation';
  const first = parts[0].charAt(0).toLowerCase() + parts[0].slice(1);
  return [first, ...parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1))].join('');
}

function relationMethod(attr: string, used: Set<string>): string {
  let name = camel(attr);
  if (!/^[A-Za-z_]/.test(name)) name = 'rel' + name;
  const reserved = new Set(['list', 'print', 'echo', 'class', 'function', 'new', 'clone', 'include', 'require', 'return', 'match', 'static', 'parent', 'self']);
  if (reserved.has(name.toLowerCase())) name += 'Relation';
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${name}${n++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function phpString(value: string): string {
  return phpSingleQuote(value);
}

function kebab(name: string): string {
  return name.replace(/_/g, '-');
}

function singleKey(table: BackendTable): boolean {
  return table.primaryKey.length === 1;
}

function firstKey(table: BackendTable): BackendColumn | undefined {
  return table.primaryKey[0];
}

function keyType(table: BackendTable): string {
  const pk = firstKey(table);
  if (!pk) return 'string';
  return pk.kind === 'int' || pk.kind === 'bigint' || pk.kind === 'smallint' ? 'int' : 'string';
}

function modelFile(table: BackendTable): string {
  const lines: string[] = [
    '<?php',
    '',
    'namespace App\\Models;',
    '',
    'use Illuminate\\Database\\Eloquent\\Model;',
    'use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;',
    'use Illuminate\\Database\\Eloquent\\Relations\\HasMany;',
    '',
    `class ${table.className} extends Model`,
    '{',
    `    protected $table = ${phpString(table.name)};`,
    '',
  ];

  const pk = firstKey(table);
  if (singleKey(table) && pk) {
    lines.push(`    protected $primaryKey = ${phpString(pk.name)};`);
    lines.push(`    public $incrementing = ${pk.autoIncrement ? 'true' : 'false'};`);
    lines.push(`    protected $keyType = ${phpString(keyType(table))};`);
  } else if (pk) {
    lines.push('    // Eloquent لا يدعم مفاتيح مركّبة — المتحكّم يستعلم بالعمودين معاً.');
    lines.push(`    protected $primaryKey = ${phpString(pk.name)};`);
    lines.push('    public $incrementing = false;');
    lines.push(`    protected $keyType = ${phpString(keyType(table))};`);
  } else {
    lines.push('    // لا يوجد مفتاح أساسي في هذا الجدول.');
    lines.push('    protected $primaryKey = null;');
    lines.push('    public $incrementing = false;');
  }

  lines.push('    public $timestamps = false;');
  lines.push('');
  const fillable = table.columns.filter(c => !c.autoIncrement).map(c => `        ${phpString(c.name)},`);
  lines.push('    protected $fillable = [');
  lines.push(...(fillable.length ? fillable : ["        // لا توجد أعمدة قابلة للتعبئة"]));
  lines.push('    ];');

  const casts: string[] = [];
  for (const col of table.columns) {
    if (col.kind === 'decimal') {
      casts.push(`        ${phpString(col.name)} => 'decimal:${col.scale ?? 2}',`);
    } else if (col.kind === 'bool') {
      casts.push(`        ${phpString(col.name)} => 'boolean',`);
    } else if (col.kind === 'json') {
      casts.push(`        ${phpString(col.name)} => 'array',`);
    } else if (col.kind === 'date') {
      casts.push(`        ${phpString(col.name)} => 'date',`);
    } else if (col.kind === 'datetime') {
      casts.push(`        ${phpString(col.name)} => 'datetime',`);
    } else if (col.kind === 'int' || col.kind === 'bigint' || col.kind === 'smallint') {
      casts.push(`        ${phpString(col.name)} => 'integer',`);
    } else if (col.kind === 'float') {
      casts.push(`        ${phpString(col.name)} => 'float',`);
    }
  }
  if (casts.length > 0) {
    lines.push('');
    lines.push('    protected $casts = [');
    lines.push(...casts);
    lines.push('    ];');
  }

  const hidden = table.columns.filter(c => /password|secret|token|hash/i.test(c.name)).map(c => `        ${phpString(c.name)},`);
  if (hidden.length > 0) {
    lines.push('');
    lines.push('    protected $hidden = [');
    lines.push(...hidden);
    lines.push('    ];');
  }

  const used = new Set<string>();
  for (const rel of table.belongsTo) {
    lines.push('');
    lines.push(`    public function ${relationMethod(rel.attr, used)}(): BelongsTo`);
    lines.push('    {');
    lines.push(
      `        return $this->belongsTo(${rel.parent.className}::class, ${phpString(rel.fkColumn.name)}, ${phpString(rel.fkColumn.fk!.parentColumn.name)});`
    );
    lines.push('    }');
  }
  for (const rel of table.hasMany) {
    lines.push('');
    lines.push(`    public function ${relationMethod(rel.attr, used)}(): HasMany`);
    lines.push('    {');
    lines.push(
      `        return $this->hasMany(${rel.child.className}::class, ${phpString(rel.fkColumn.name)}, ${phpString(rel.fkColumn.fk!.parentColumn.name)});`
    );
    lines.push('    }');
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function columnLine(col: BackendColumn, table: BackendTable): string {
  const name = `'${col.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  let method: string;
  switch (col.kind) {
    case 'int':
      method = `$table->integer(${name})`;
      break;
    case 'bigint':
      method = `$table->bigInteger(${name})`;
      break;
    case 'smallint':
      method = `$table->smallInteger(${name})`;
      break;
    case 'bool':
      method = `$table->boolean(${name})`;
      break;
    case 'decimal':
      method = col.precision !== undefined
        ? `$table->decimal(${name}, ${col.precision}${col.scale !== undefined ? `, ${col.scale}` : ''})`
        : `$table->decimal(${name}, 10, 2)`;
      break;
    case 'float':
      method = `$table->float(${name})`;
      break;
    case 'string':
      method = `$table->string(${name}${col.length !== undefined ? `, ${col.length}` : ''})`;
      break;
    case 'text':
    case 'unknown':
      method = `$table->text(${name})`;
      break;
    case 'date':
      method = `$table->date(${name})`;
      break;
    case 'datetime':
      method = `$table->dateTime(${name})`;
      break;
    case 'time':
      method = `$table->time(${name})`;
      break;
    case 'json':
      method = `$table->json(${name})`;
      break;
    case 'uuid':
      method = `$table->uuid(${name})`;
      break;
    case 'binary':
      method = `$table->binary(${name})`;
      break;
  }

  // مفتاح أساسي وحيد غير تلقائي: نضيف ->primary() على السطر
  const autoPk = col.autoIncrement && table.primaryKey.length === 1;
  if (autoPk) {
    const methodName = col.kind === 'bigint' ? 'bigIncrements' : 'increments';
    return `            $table->${methodName}(${name});`;
  }

  if (col.nullable) method += '->nullable()';

  const def = defaultExpression(col);
  if (def) method += def;
  if (col.unique && !col.primaryKey) method += '->unique()';
  if (col.primaryKey && table.primaryKey.length === 1) method += '->primary()';

  return `            ${method};`;
}

function defaultExpression(col: BackendColumn): string {
  const raw = (col.defaultValue ?? '').trim();
  if (!raw || /^null$/i.test(raw)) return '';
  if (/^(current_timestamp|current_timestamp\(\)|now\(\)|getdate\(\)|sysdate)$/i.test(raw)) return '->useCurrent()';
  if (/^(current_date|current_time)$/i.test(raw)) return `->default(DB::raw(${phpString(raw)}))`;
  if (/^(true|false)$/i.test(raw)) return `->default(${raw.toLowerCase()})`;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `->default(${raw})`;
  if (/^'(.*)'$/s.test(raw)) {
    const inner = raw.slice(1, -1).replace(/''/g, "'");
    return `->default(${phpString(inner)})`;
  }
  if (/^"(.*)"$/s.test(raw)) {
    const inner = raw.slice(1, -1);
    return `->default(${phpString(inner)})`;
  }
  return `->default(DB::raw(${phpString(raw)}))`;
}

function quoteSqlIdentifier(name: string, db: BackendOptions['db']): string {
  if (db === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

function migrationFile(table: BackendTable, stamp: string, db: BackendOptions['db'], deferredFks: Set<string> = new Set()): string {
  const needsDb =
    table.columns.some(col => defaultExpression(col).includes('DB::raw') || Boolean(col.check)) ||
    (table.tableChecks?.length ?? 0) > 0;
  const lines: string[] = [
    '<?php',
    '',
    'use Illuminate\\Database\\Migrations\\Migration;',
    'use Illuminate\\Database\\Schema\\Blueprint;',
    'use Illuminate\\Support\\Facades\\Schema;',
  ];
  if (needsDb) lines.push('use Illuminate\\Support\\Facades\\DB;');
  lines.push(
    '',
    'return new class extends Migration',
    '{',
    '    public function up(): void',
    '    {',
    `        Schema::create(${phpString(table.name)}, function (Blueprint $table) {`
  );

  for (const col of table.columns) {
    if (col.kind === 'unknown') {
      lines.push(`            // Note: unsupported SQL type "${col.rawType.replace(/\//g, '')}" mapped to text.`);
    }
    lines.push(columnLine(col, table));
  }

  if (table.primaryKey.length > 1) {
    lines.push('');
    lines.push(`            $table->primary([${table.primaryKey.map(pk => phpString(pk.name)).join(', ')}]);`);
  }

  const fks = table.columns.filter(c => c.fk);
  const inlineFks = fks.filter(col => !deferredFks.has(`${table.id}:${col.name.toLowerCase()}`));
  if (inlineFks.length > 0) lines.push('');
  for (const col of fks) {
    const fk = col.fk!;
    const deferred = deferredFks.has(`${table.id}:${col.name.toLowerCase()}`);
    if (!deferred) {
      let line = `            $table->foreign(${phpString(col.name)})->references(${phpString(fk.parentColumn.name)})->on(${phpString(fk.parent.name)})`;
      if (fk.onDelete === 'CASCADE') line += '->cascadeOnDelete()';
      else if (fk.onDelete === 'SET NULL') line += '->nullOnDelete()';
      lines.push(line + ';');
    }
    if (!col.unique && !col.primaryKey) lines.push(`            $table->index(${phpString(col.name)});`);
  }

  const usedIndexNames = new Set<string>();
  const indexLines: string[] = [];
  for (const index of table.indexes ?? []) {
    const columns = index.columns.filter(column => table.columns.some(col => col.name === column));
    if (columns.length === 0) continue;
    const single = columns.length === 1 ? table.columns.find(col => col.name === columns[0]) : undefined;
    if (single && ((index.unique && single.unique) || (!index.unique && single.fk && !single.primaryKey))) continue;
    let name = index.name || `ix_${table.name}_${columns.join('_')}`;
    let n = 2;
    while (usedIndexNames.has(name.toLowerCase())) name = `${index.name}_${n++}`;
    usedIndexNames.add(name.toLowerCase());
    const method = index.unique ? 'unique' : 'index';
    indexLines.push(
      `            $table->${method}([${columns.map(phpString).join(', ')}], ${phpString(name)});`
    );
  }
  if (indexLines.length > 0) {
    lines.push('', ...indexLines);
  }

  lines.push('        });');
  if (db !== 'sqlite') {
    (table.tableChecks ?? []).forEach((check, index) => {
      lines.push(
        '        if (DB::getDriverName() !== \'sqlite\') {',
        `            DB::statement(${phpString(
          `ALTER TABLE ${quoteSqlIdentifier(table.name, db)} ADD CONSTRAINT ${quoteSqlIdentifier(
            `ck_${table.name}_table_${index + 1}`,
            db
          )} CHECK (${check})`
        )});`,
        '        }'
      );
    });
    table.columns.filter(col => col.check).forEach(col => {
      lines.push(
        '        if (DB::getDriverName() !== \'sqlite\') {',
        `            DB::statement(${phpString(
          `ALTER TABLE ${quoteSqlIdentifier(table.name, db)} ADD CONSTRAINT ${quoteSqlIdentifier(
            `ck_${table.name}_${col.name}`,
            db
          )} CHECK (${col.check})`
        )});`,
        '        }'
      );
    });
  }
  lines.push(
    '    }',
    '',
    '    public function down(): void',
    '    {',
    `        Schema::dropIfExists(${phpString(table.name)});`,
    '    }',
    '};',
    ''
  );
  return lines.join('\n');
}

function ruleList(table: BackendTable, col: BackendColumn, mode: 'store' | 'update'): string[] {
  const rules: string[] = [];
  if (mode === 'update') rules.push("'sometimes'");

  const required = mode === 'store' && !col.nullable && !(col.defaultValue !== undefined && col.defaultValue !== '');
  if (required) rules.push("'required'");
  if (col.nullable) rules.push("'nullable'");
  if (mode === 'store' && !required && !col.nullable) rules.push("'sometimes'");

  switch (col.kind) {
    case 'int':
    case 'bigint':
    case 'smallint':
      rules.push("'integer'");
      break;
    case 'decimal':
    case 'float':
      rules.push("'numeric'");
      break;
    case 'bool':
      rules.push("'boolean'");
      break;
    case 'date':
    case 'datetime':
      rules.push("'date'");
      break;
    case 'time':
      rules.push("'date_format:H:i:s'");
      break;
    case 'json':
      rules.push("'array'");
      break;
    case 'uuid':
      rules.push("'uuid'");
      break;
    case 'binary':
      break;
    default:
      rules.push("'string'");
      if (col.length !== undefined) rules.push(`'max:${col.length}'`);
      if (/email/i.test(col.name)) rules.push("'email'");
      break;
  }

  if (col.fk) rules.push(`'exists:${col.fk.parent.name},${col.fk.parentColumn.name}'`);

  if (col.unique && !col.primaryKey) {
    const base = `Rule::unique(${phpString(table.name)}, ${phpString(col.name)})`;
    if (mode === 'store') {
      rules.push(base);
    } else if (table.primaryKey.length === 1) {
      rules.push(`${base}->ignore($id, ${phpString(table.primaryKey[0].name)})`);
    } else if (table.primaryKey.length > 1) {
      const rests = table.primaryKey
        .slice(1)
        .map((pk, index) => `->where(fn ($query) => $query->where(${phpString(pk.name)}, $key${index + 2}))`)
        .join('');
      rules.push(`${base}->ignore($key1, ${phpString(table.primaryKey[0].name)})${rests}`);
    }
  }

  return rules;
}

function formRequestFile(table: BackendTable, mode: 'store' | 'update', _options: BackendOptions): string {
  const cls = table.className;
  const rules = table.columns
    .filter(c => !c.autoIncrement && (mode === 'store' || !c.primaryKey))
    .map(c => `            ${phpString(c.name)} => [${ruleList(table, c, mode).join(', ')}],`);

  const routeBindings: string[] = [];
  if (mode === 'update') {
    if (table.primaryKey.length <= 1) {
      routeBindings.push(`        $id = $this->route('id');`);
    } else {
      table.primaryKey.forEach((_, index) => {
        routeBindings.push(`        $key${index + 1} = $this->route('key${index + 1}');`);
      });
    }
    routeBindings.push('');
  }

  const lines = [
    '<?php',
    '',
    'namespace App\\Http\\Requests;',
    '',
    'use Illuminate\\Foundation\\Http\\FormRequest;',
    'use Illuminate\\Validation\\Rule;',
    '',
    '/**',
    ` * التحقق من المدخلات لـ ${table.name} (${mode === 'store' ? 'إنشاء' : 'تحديث'}) — مولّد من قيود السكيما.`,
    ' */',
    `class ${mode === 'store' ? 'Store' : 'Update'}${cls}Request extends FormRequest`,
    '{',
    '    public function authorize(): bool',
    '    {',
    '        return true;',
    '    }',
    '',
    '    public function rules(): array',
    '    {',
    ...routeBindings,
    '        return [',
    ...(rules.length > 0 ? rules : ['            // لا أعمدة قابلة للتحقق.']),
    '        ];',
    '    }',
    '}',
    '',
  ];
  return lines.join('\n');
}

function controllerFile(table: BackendTable, options: BackendOptions): string {
  const cls = table.className;
  const isComposite = table.primaryKey.length > 1;
  const hasPk = table.primaryKey.length > 0;
  const parameters = isComposite
    ? table.primaryKey.map((_, index) => `$key${index + 1}`).join(', ')
    : '$id';
  const finder = isComposite
    ? table.primaryKey.map((pk, index) => `->where(${phpString(pk.name)}, $key${index + 1})`).join('')
    : '';
  const findExpression = isComposite
    ? `${cls}::query()${finder}->firstOrFail()`
    : `${cls}::query()->findOrFail($id)`;
  const indexOrder = table.primaryKey.length === 1 && table.primaryKey[0].autoIncrement
    ? `->orderByDesc(${phpString(table.primaryKey[0].name)})`
    : table.primaryKey.length > 0
      ? table.primaryKey.map(pk => `->orderBy(${phpString(pk.name)})`).join('')
      : '';

  const imports = [
    '<?php',
    '',
    'namespace App\\Http\\Controllers;',
    '',
    `use App\\Models\\${cls};`,
    `use App\\Http\\Requests\\Store${cls}Request;`,
    `use App\\Http\\Requests\\Update${cls}Request;`,
    'use Illuminate\\Database\\QueryException;',
    'use Illuminate\\Http\\JsonResponse;',
    '',
  ];

  const lines: string[] = [
    ...imports,
    `class ${cls}Controller extends Controller`,
    '{',
    '    public function index(): JsonResponse',
    '    {',
    `        return response()->json(${cls}::query()${indexOrder}->paginate(50));`,
    '    }',
    '',
  ];

  if (modeIsFull(options)) {
    lines.push(
      `    public function store(Store${cls}Request $request): JsonResponse`,
      '    {',
      '        $data = $request->validated();',
      '',
      '        try {',
      `            $item = ${cls}::query()->create($data);`,
      '        } catch (QueryException $exception) {',
      "            if ($exception->getCode() === '23000') {",
      "                return response()->json(['message' => 'A unique constraint was violated.'], 409);",
      '            }',
      '            throw $exception;',
      '        }',
      '',
      '        return response()->json($item, 201);',
      '    }',
      ''
    );
  }

  if (hasPk) {
    lines.push(
      `    public function show(${parameters}): JsonResponse`,
      '    {',
      `        return response()->json(${findExpression});`,
      '    }',
      '',
      `    public function update(Update${cls}Request $request, ${parameters}): JsonResponse`,
      '    {',
      ...(isComposite ? [] : [`        $item = ${findExpression};`]),
      '',
      '        $data = $request->validated();',
      '',
      '        try {'
    );

    if (isComposite) {
      // Eloquent لا يدعم مفاتيح مركّبة في save/delete — نستعمل Query Builder على المفتاحين
      lines.push(
        `            ${cls}::query()${finder}->update($data);`
      );
    } else {
      lines.push('            $item->fill($data);', '            $item->save();');
    }

    lines.push(
      '        } catch (QueryException $exception) {',
      "            if ($exception->getCode() === '23000') {",
      "                return response()->json(['message' => 'A unique constraint was violated.'], 409);",
      '            }',
      '            throw $exception;',
      '        }',
      '',
      `        return response()->json(${findExpression});`,
      '    }',
      '',
      `    public function destroy(${parameters}): JsonResponse`,
      '    {',
      ...(isComposite
        ? [`        ${cls}::query()${finder}->delete();`]
        : [`        $item = ${findExpression};`, '        $item->delete();']),
      '',
      '        return response()->json(null, 204);',
      '    }',
      ''
    );
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function modeIsFull(options: BackendOptions): boolean {
  return options.mode === 'full';
}

function routesFile(model: BackendModel, options: BackendOptions): string {
  const lines: string[] = [
    '<?php',
    '',
    'use Illuminate\\Support\\Facades\\Route;',
  ];
  if (options.auth) lines.push('use App\\Http\\Controllers\\AuthController;');
  for (const table of model.tables) {
    lines.push(`use App\\Http\\Controllers\\${table.className}Controller;`);
  }
  lines.push('', '');

  const pushResources = (indent: string): void => {
    for (const table of model.tables) {
      if (table.primaryKey.length === 1) {
        lines.push(
          `${indent}Route::apiResource(${phpString(kebab(table.name))}, ${table.className}Controller::class)->parameters([${phpString(
            kebab(table.name)
          )} => 'id']);`
        );
      } else if (table.primaryKey.length > 1) {
        const path = kebab(table.name);
        const params = table.primaryKey.map((_, index) => `{key${index + 1}}`).join('/');
        const controller = `${table.className}Controller::class`;
        lines.push(`${indent}Route::get(${phpString(path)}, [${controller}, 'index']);`);
        if (options.mode === 'full') lines.push(`${indent}Route::post(${phpString(path)}, [${controller}, 'store']);`);
        lines.push(`${indent}Route::get(${phpString(`${path}/${params}`)}, [${controller}, 'show']);`);
        if (options.mode === 'full') {
          lines.push(`${indent}Route::put(${phpString(`${path}/${params}`)}, [${controller}, 'update']);`);
          lines.push(`${indent}Route::delete(${phpString(`${path}/${params}`)}, [${controller}, 'destroy']);`);
        }
      } else {
        const path = kebab(table.name);
        const controller = `${table.className}Controller::class`;
        lines.push(`${indent}Route::get(${phpString(path)}, [${controller}, 'index']);`);
        if (options.mode === 'full') lines.push(`${indent}Route::post(${phpString(path)}, [${controller}, 'store']);`);
      }
    }
  };

  if (options.auth) {
    lines.push(
      "Route::post('auth/register', [AuthController::class, 'register']);",
      "Route::post('auth/login', [AuthController::class, 'login']);",
      '',
      "Route::middleware('auth:sanctum')->group(function () {",
      "    Route::get('auth/me', [AuthController::class, 'me']);",
      "    Route::post('auth/logout', [AuthController::class, 'logout']);",
      ''
    );
    pushResources('    ');
    lines.push('});');
  } else {
    pushResources('');
  }

  lines.push('');
  return lines.join('\n');
}

function authControllerFile(): string {
  return [
    '<?php',
    '',
    'namespace App\\Http\\Controllers;',
    '',
    'use App\\Models\\User;',
    'use Illuminate\\Http\\JsonResponse;',
    'use Illuminate\\Http\\Request;',
    'use Illuminate\\Support\\Facades\\Hash;',
    'use Illuminate\\Validation\\ValidationException;',
    '',
    'class AuthController extends Controller',
    '{',
    '    public function register(Request $request): JsonResponse',
    '    {',
    '        $data = $request->validate([',
    "            'name' => ['required', 'string', 'max:120'],",
    "            'email' => ['required', 'email', 'max:255', 'unique:users,email'],",
    "            'password' => ['required', 'string', 'min:8', 'max:128'],",
    '        ]);',
    '',
    '        $user = User::query()->create([',
    "            'name' => $data['name'],",
    "            'email' => $data['email'],",
    "            'password' => Hash::make($data['password']),",
    '        ]);',
    '',
    "        $token = $user->createToken('api')->plainTextToken;",
    '',
    "        return response()->json(['token' => $token, 'user' => $user], 201);",
    '    }',
    '',
    '    public function login(Request $request): JsonResponse',
    '    {',
    '        $data = $request->validate([',
    "            'email' => ['required', 'email'],",
    "            'password' => ['required', 'string'],",
    '        ]);',
    '',
    "        $user = User::query()->where('email', $data['email'])->first();",
    '',
    '        if (! $user || ! Hash::check($data[\'password\'], $user->password)) {',
    '            throw ValidationException::withMessages([',
    "                'email' => ['The provided credentials are incorrect.'],",
    '            ]);',
    '        }',
    '',
    "        $token = $user->createToken('api')->plainTextToken;",
    '',
    "        return response()->json(['token' => $token, 'user' => $user]);",
    '    }',
    '',
    '    public function me(Request $request): JsonResponse',
    '    {',
    '        return response()->json($request->user());',
    '    }',
    '',
    '    public function logout(Request $request): JsonResponse',
    '    {',
    '        $request->user()->currentAccessToken()->delete();',
    '',
    '        return response()->json(null, 204);',
    '    }',
    '}',
    '',
  ].join('\n');
}

function envFile(options: BackendOptions): string {
  if (options.db === 'sqlite') {
    return [
      'APP_NAME="Schema API"',
      'APP_ENV=local',
      'APP_KEY=',
      'APP_DEBUG=true',
      'APP_URL=http://localhost:8000',
      '',
      'DB_CONNECTION=sqlite',
      'DB_DATABASE=/absolute/path/to/database.sqlite',
      '',
      'CORS_ALLOWED_ORIGINS=http://localhost:5173',
      '',
    ].join('\n');
  }
  return [
    'APP_NAME="Schema API"',
    'APP_ENV=local',
    'APP_KEY=',
    'APP_DEBUG=true',
    'APP_URL=http://localhost:8000',
    '',
    `DB_CONNECTION=${options.db === 'postgres' ? 'pgsql' : 'mysql'}`,
    'DB_HOST=127.0.0.1',
    `DB_PORT=${options.db === 'postgres' ? '5432' : '3306'}`,
    'DB_DATABASE=appdb',
    `DB_USERNAME=${options.db === 'postgres' ? 'postgres' : 'root'}`,
    'DB_PASSWORD=',
    '',
    'CORS_ALLOWED_ORIGINS=http://localhost:5173',
    '',
  ].join('\n');
}

function readme(model: BackendModel, options: BackendOptions, projectName: string): string {
  const full = options.mode === 'full';
  const tableRows = model.tables
    .map(t => `| \`${t.name}\` | ${t.columns.length} | ${t.primaryKey.map(pk => `\`${pk.name}\``).join(', ') || '—'} |`)
    .join('\n');
  return `# ${projectName.replace(/-/g, ' ')} — Laravel API

Generated by Schema Studio — **${frameworkLabel('laravel', options.db)}**${full ? '' : ' · models-only project'}.

## قرار التوجيه / Routing decision

- **AR:** ${options.routingReason === 'manual' ? 'اختيار يدوي من المستخدم — يتغلّب على قاعدة نوع قاعدة البيانات.' : `توجيه تلقائي: ${options.db} → PHP/Laravel + Eloquent.`}
- **EN:** ${options.routingReason === 'manual' ? 'Manual choice by the user — overrides the database rule.' : `Automatic: ${options.db} → PHP/Laravel + Eloquent.`}
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? `- **AI enrichment:** demo seed rows were generated by AI, then filtered against the schema and kept as data only.\n${(options.aiNotes ?? []).map(note => `  - ${note}`).join('\n')}` : '- **AI enrichment:** disabled — every file comes from deterministic templates.'}

## العربية — نظرة سريعة

حزمة Laravel جاهزة تحتوي نموذج Eloquent لكل جدول، وترحيلاً بكل القيود
والمفاتيح والفهارس، ومتحكّمات CRUD مع أصناف FormRequest للتحقق، ومسارات
routes/api.php، وملف اتصال .env.example. العروض وTriggers تُنقل في ترحيل
مستقل باسم create_views_and_triggers. قرار التوجيه موثّق أعلاه.

خطوات التشغيل: أنشئ مشروع Laravel جديد، انسخ المجلدات كما هو موضّح في قسم
التثبيت، اضبط .env، ثم نفّذ php artisan key:generate وphp artisan migrate.
بيانات البذر الاختيارية تُشغّل بـ php artisan db:seed بعد الترحيل.
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '\n> بيانات البذر التجريبية (database/seeders) مُثراة بالذكاء الاصطناعي: شغّل php artisan db:seed بعد الترحيل.' : ''}

## What is included

- Eloquent models for **${model.tables.length}** tables (relations, casts, fillable, hidden).
- One migration per table with columns, primary keys, indexes and foreign keys.
- Views and triggers from the source DDL are recreated verbatim in a dedicated migration (\`create_views_and_triggers\`).
- ${full ? 'REST controllers + `routes/api.php` + `FormRequest` validation classes for every table.' : 'Models and migrations only (no controllers/routes).'}
- ${options.auth ? 'Sanctum login/register/logout endpoints and protected API routes.' : 'No authentication layer (add Sanctum later if needed).'}
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '- Optional AI seeders in `database/seeders` (plain data only).\n' : ''}- The original SQL DDL in \`migrations/001_init.sql\` for reference.
- \`MANIFEST.json\` lists every file and whether it came from a template or AI enrichment.

## Install into a Laravel app

These files are meant to be copied into a fresh Laravel project:

\`\`\`bash
composer create-project laravel/laravel backend
cd backend
\`\`\`

Copy from this package:

\`\`\`bash
cp -R app/Models/* backend/app/Models/
cp -R app/Http/Controllers/* backend/app/Http/Controllers/
cp -R app/Http/Requests/* backend/app/Http/Requests/
cp -R database/migrations/* backend/database/migrations/
cp -R database/seeders/* backend/database/seeders/
cp -R docs/* backend/docs/
cp routes/api.php backend/routes/api.php
\`\`\`

${options.auth ? `Install Sanctum and expose the API routes:

\`\`\`bash
composer require laravel/sanctum
php artisan install:api
\`\`\`

Add the token trait to \`app/Models/User.php\`:

\`\`\`php
use Laravel\\Sanctum\\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    // ...
}
\`\`\`
` : ''}
Configure \`.env\` (see \`.env.example\`), create the database, then:

\`\`\`bash
php artisan key:generate
php artisan migrate
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? 'php artisan db:seed\n' : ''}php artisan serve
\`\`\`

> If your Laravel skeleton already has a migration that creates a table with one of
> these names (for example \`users\`), remove the duplicate before running
> \`php artisan migrate\`.

## Tables

| Table | Columns | Primary key |
|---|---|---|
${tableRows}

${full ? `## Endpoints

Single-key tables use \`Route::apiResource\`; composite-key tables get explicit
\`GET/POST/PUT/DELETE\` routes with one path segment per key.

| Method | Path | Description |
|---|---|---|
| GET | \`/api/<table>\` | Paginated list (50 per page) |
| GET | \`/api/<table>/{key}\` | Single row (404 when missing) |
| POST | \`/api/<table>\` | Create with validation, 201 |
| PUT | \`/api/<table>/{key}\` | Partial update with validation |
| DELETE | \`/api/<table>/{key}\` | Delete, 204 |

Validation mirrors the schema: required/nullable, string lengths, numeric and
boolean types, e-mail, \`unique\` (with the current row ignored on update),
\`exists\` for foreign keys and 409 on a duplicate-key race.${options.auth ? ' All business routes are behind `auth:sanctum`; authenticate with `Authorization: Bearer <token>`.':''}` : ''}

## ملاحظات عربية

- المشروع مولّد من ${model.baseTables.length} جدولاً أصلياً و${model.source.relationships.length} علاقة معلنة.
- ${model.tables.length - model.baseTables.length} جدول ربط أُنشئ تلقائياً لعلاقات N-M.
${[...model.warnings, ...(options.extraWarnings ?? [])].length ? [...model.warnings, ...(options.extraWarnings ?? [])].map(w => `- ⚠ ${w}`).join('\n') : '- لا توجد تحذيرات على السكيما.'}
- كل ملف يحمل رأس توليد يتضمن رقم العملية وتاريخها، وMANIFEST.json يجرد الملفات ومصدرها.

## Notes

- Generated from ${model.baseTables.length} base tables and ${model.source.relationships.length} declared relations.
- ${model.tables.length - model.baseTables.length} junction table(s) were synthesised for N-M relations.
${[...model.warnings, ...(options.extraWarnings ?? [])].length ? [...model.warnings, ...(options.extraWarnings ?? [])].map(w => `- ⚠ ${w}`).join('\n') : '- No schema warnings.'}
`;
}

function phpValue(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function aiSeederFiles(model: BackendModel, options: BackendOptions): GeneratedFile[] {
  const rows = options.aiSeedRows ?? {};
  const tables = model.tables.filter(table => (rows[table.name] ?? []).length > 0);
  if (tables.length === 0) return [];

  const inserts = tables
    .map(table => {
      const allowed = new Map(table.columns.map(column => [column.name, column]));
      const tableRows = (rows[table.name] ?? [])
        .map(row => Object.fromEntries(
          Object.entries(row).filter(([key]) => {
            const column = allowed.get(key);
            return Boolean(column) && !column!.autoIncrement;
          })
        ))
        .filter(row => Object.keys(row).length > 0)
        .slice(0, 25);
      if (tableRows.length === 0) return '';
      const rowsPhp = tableRows
        .map(row => `            [${Object.entries(row).map(([key, value]) => `${phpString(key)} => ${phpValue(value)}`).join(', ')}],`)
        .join('\n');
      return `        DB::table(${phpString(table.name)})->insert([\n${rowsPhp}\n        ]);`;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!inserts) return [];

  const seeder = [
    '<?php',
    '',
    'namespace Database\\Seeders;',
    '',
    'use Illuminate\\Database\\Seeder;',
    'use Illuminate\\Support\\Facades\\DB;',
    '',
    '/**',
    ' * Demo rows enriched by AI. All values are plain data and every table/column',
    ' * is whitelisted from the generated model before it reaches this seeder.',
    ' */',
    'class DemoDataSeeder extends Seeder',
    '{',
    '    public function run(): void',
    '    {',
    inserts,
    '    }',
    '}',
    '',
  ].join('\n');

  return [
    { path: 'database/seeders/DemoDataSeeder.php', language: 'php', source: 'ai', content: seeder },
    {
      path: 'database/seeders/DatabaseSeeder.php',
      language: 'php',
      source: 'ai',
      content: [
        '<?php',
        '',
        'namespace Database\\Seeders;',
        '',
        'use Illuminate\\Database\\Seeder;',
        '',
        'class DatabaseSeeder extends Seeder',
        '{',
        '    public function run(): void',
        '    {',
        '        $this->call([DemoDataSeeder::class]);',
        '    }',
        '}',
        '',
      ].join('\n'),
    },
  ];
}

/** مفاتيح أجنبية تشير إلى جدول يُنشأ في نفس المرحلة أو بعده — تُؤجَّل لترحيل ثانٍ */
function deferredForeignKeys(model: BackendModel, db: BackendOptions['db']): Set<string> {
  const deferred = new Set<string>();
  // SQLite تسمح بالمراجع الأمامية، وLaravel لا يستطيع إضافة FK لاحقاً عليها
  if (db === 'sqlite') return deferred;
  const position = new Map(model.order.map((table, index) => [table.id, index]));
  for (const table of model.order) {
    const childIndex = position.get(table.id) ?? -1;
    for (const col of table.columns) {
      if (!col.fk) continue;
      const parentIndex = position.get(col.fk.parent.id) ?? -1;
      if (parentIndex < 0 || parentIndex >= childIndex) {
        deferred.add(`${table.id}:${col.name.toLowerCase()}`);
      }
    }
  }
  return deferred;
}

function deferredForeignKeysMigration(model: BackendModel, deferred: Set<string>): string | null {
  const groups: { table: BackendTable; columns: BackendColumn[] }[] = [];
  for (const table of model.order) {
    const columns = table.columns.filter(col => col.fk && deferred.has(`${table.id}:${col.name.toLowerCase()}`));
    if (columns.length > 0) groups.push({ table, columns });
  }
  if (groups.length === 0) return null;

  const lines: string[] = [
    '<?php',
    '',
    'use Illuminate\\Database\\Migrations\\Migration;',
    'use Illuminate\\Database\\Schema\\Blueprint;',
    'use Illuminate\\Support\\Facades\\Schema;',
    '',
    'return new class extends Migration',
    '{',
    '    public function up(): void',
    '    {',
  ];
  for (const group of groups) {
    lines.push(`        Schema::table(${phpString(group.table.name)}, function (Blueprint $table) {`);
    for (const col of group.columns) {
      const fk = col.fk!;
      let line = `            $table->foreign(${phpString(col.name)})->references(${phpString(fk.parentColumn.name)})->on(${phpString(fk.parent.name)})`;
      if (fk.onDelete === 'CASCADE') line += '->cascadeOnDelete()';
      else if (fk.onDelete === 'SET NULL') line += '->nullOnDelete()';
      lines.push(line + ';');
    }
    lines.push('        });');
  }
  lines.push(
    '    }',
    '',
    '    public function down(): void',
    '    {',
  );
  for (const group of groups) {
    lines.push(`        Schema::table(${phpString(group.table.name)}, function (Blueprint $table) {`);
    for (const col of group.columns) {
      lines.push(`            $table->dropForeign([${phpString(col.name)}]);`);
    }
    lines.push('        });');
  }
  lines.push('    }', '};', '');
  return lines.join('\n');
}

function databaseObjectsMigration(source: BackendModel['source'], db: BackendOptions['db']): string | null {
  const views = source.views ?? [];
  const triggers = source.triggers ?? [];
  if (views.length === 0 && triggers.length === 0) return null;

  const lines: string[] = [
    '<?php',
    '',
    'use Illuminate\\Database\\Migrations\\Migration;',
    'use Illuminate\\Support\\Facades\\DB;',
    '',
    '// Views and triggers are emitted verbatim from the source SQL schema.',
    'return new class extends Migration',
    '{',
    '    public function up(): void',
    '    {',
  ];
  for (const view of views) {
    lines.push(`        DB::unprepared(${phpString(schemaViewStatement(view, db))});`);
  }
  for (const trigger of triggers) {
    lines.push(`        DB::unprepared(${phpString(schemaTriggerStatement(trigger))});`);
  }
  lines.push('    }', '', '    public function down(): void', '    {');
  for (const trigger of [...triggers].reverse()) {
    lines.push(`        DB::unprepared(${phpString(schemaDropTriggerStatement(trigger, db))});`);
  }
  for (const view of [...views].reverse()) {
    lines.push(`        DB::unprepared(${phpString(schemaDropViewStatement(view, db))});`);
  }
  lines.push('    }', '};', '');
  return lines.join('\n');
}

function formatStamp(index: number): string {
  const now = new Date();
  const date = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
  return `${date}_${String(index).padStart(6, '0')}`;
}

export function generateLaravel(model: BackendModel, options: BackendOptions, projectName: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const table of model.order) {
    const path = `app/Models/${table.className}.php`;
    files.push({ path, language: 'php', content: modelFile(table) });
  }

  const deferredFks = deferredForeignKeys(model, options.db);
  model.order.forEach((table, index) => {
    files.push({
      path: `database/migrations/${formatStamp(index + 1)}_create_${table.name}_table.php`,
      language: 'php',
      content: migrationFile(table, formatStamp(index + 1), options.db, deferredFks),
    });
  });
  let nextStamp = model.order.length + 1;
  const deferredMigration = deferredForeignKeysMigration(model, deferredFks);
  if (deferredMigration) {
    files.push({
      path: `database/migrations/${formatStamp(nextStamp)}_add_deferred_foreign_keys.php`,
      language: 'php',
      content: deferredMigration,
    });
    nextStamp += 1;
  }
  const objectsMigration = databaseObjectsMigration(model.source, options.db);
  if (objectsMigration) {
    files.push({
      path: `database/migrations/${formatStamp(nextStamp)}_create_views_and_triggers.php`,
      language: 'php',
      content: objectsMigration,
    });
  }

  if (options.mode === 'full') {
    for (const table of model.order) {
      files.push({
        path: `app/Http/Controllers/${table.className}Controller.php`,
        language: 'php',
        content: controllerFile(table, options),
      });
    }
    files.push({ path: 'routes/api.php', language: 'php', content: routesFile(model, options) });
    if (options.auth) {
      files.push({
        path: 'app/Http/Controllers/AuthController.php',
        language: 'php',
        content: authControllerFile(),
      });
    }
  }

  // Request classes: واجهة Laravel الأصلية للتحقق بدل حشو القواعد داخل المتحكّم
  if (options.mode === 'full') {
    for (const table of model.order) {
      files.push({
        path: `app/Http/Requests/Store${table.className}Request.php`,
        language: 'php',
        content: formRequestFile(table, 'store', options),
      });
      files.push({
        path: `app/Http/Requests/Update${table.className}Request.php`,
        language: 'php',
        content: formRequestFile(table, 'update', options),
      });
    }
  }

  const ddl = generateDdl(model.source, options.db, { dropIfExists: false, createJunctionTables: true, deferCyclicForeignKeys: true });
  files.push({
    path: 'migrations/001_init.sql',
    language: 'sql',
    content: `-- Reference DDL generated from the ER model on ${new Date().toISOString().slice(0, 10)}\n\n${ddl.code}\n`,
  });

  files.push(...aiSeederFiles(model, options));
  files.push({ path: '.env.example', language: 'env', content: envFile(options) });
  files.push({ path: 'README.md', language: 'markdown', content: readme(model, options, projectName) });
  return files;
}

void singularTableName;
