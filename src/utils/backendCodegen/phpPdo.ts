import type { BackendColumn, BackendModel, BackendOptions, BackendTable } from './model';
import { frameworkLabel, phpSingleQuote } from './model';
import type { GeneratedFile } from './types';
import { generateDdl } from '../ddlGenerator';

const phpStr = (value: string): string => phpSingleQuote(value);
const qid = (name: string): string => `Database::quote(${phpStr(name)})`;

function kebab(name: string): string {
  return name.replace(/_/g, '-');
}

function keyVar(index: number): string {
  return `$key${index + 1}`;
}

/** أسماء معاملات المفتاح في المتحكّم: $id للمفتاح المفرد و$key1.. للمركّب */
function keyArgs(table: BackendTable): string {
  return table.primaryKey.length === 1
    ? '$id'
    : table.primaryKey.map((_, index) => keyVar(index)).join(', ');
}

function keyArgAt(table: BackendTable, index: number): string {
  return table.primaryKey.length === 1 ? '$id' : keyVar(index);
}

function intKey(col: BackendColumn): boolean {
  return col.kind === 'int' || col.kind === 'bigint' || col.kind === 'smallint';
}

function bootstrapFile(): string {
  return `<?php
declare(strict_types=1);

/**
 * Small zero-dependency bootstrap: PSR-4 autoloading, .env parsing,
 * JSON/CORS headers and a safe exception handler.
 */

define('BASE_PATH', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = BASE_PATH . '/src/' . str_replace('\\\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

$envFile = BASE_PATH . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }
        if (getenv($key) === false) {
            putenv($key . '=' . $value);
        }
        $_ENV[$key] = $value;
    }
}

function env(string $key, ?string $default = null): ?string
{
    $value = $_ENV[$key] ?? getenv($key);
    if ($value === false || $value === null || $value === '') {
        return $default;
    }
    return (string) $value;
}

date_default_timezone_set(env('APP_TIMEZONE', 'UTC'));

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . env('CORS_ORIGIN', '*'));
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

set_exception_handler(static function (Throwable $exception): void {
    error_log((string) $exception);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    http_response_code(500);
    echo json_encode(['message' => 'Internal server error'], JSON_UNESCAPED_UNICODE);
});
`;
}

function responseFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

final class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        if ($status === 204) {
            return;
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(string $message, int $status = 400, array $errors = []): never
    {
        $payload = ['message' => $message];
        if ($errors !== []) {
            $payload['errors'] = $errors;
        }
        self::json($payload, $status);
        exit;
    }
}
`;
}

function requestFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

final class Request
{
    public static function json(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\\JsonException) {
            Response::error('Invalid JSON body', 400);
        }
        if (!is_array($data)) {
            Response::error('JSON body must be an object', 400);
        }
        return $data;
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (isset($_SERVER[$key])) {
            return (string) $_SERVER[$key];
        }
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $header => $value) {
                if (strcasecmp($header, $name) === 0) {
                    return (string) $value;
                }
            }
        }
        return null;
    }
}
`;
}

function databaseFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

use PDO;

final class Database
{
    private static ?PDO $connection = null;

    public static function driver(): string
    {
        return (string) env('DB_CONNECTION', 'mysql');
    }

    public static function pdo(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $driver = self::driver();
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        if ($driver === 'sqlite') {
            $database = (string) env('DB_DATABASE', BASE_PATH . '/database.sqlite');
            $pdo = new PDO('sqlite:' . $database, null, null, $options);
        } else {
            $host = (string) env('DB_HOST', '127.0.0.1');
            $port = (string) env('DB_PORT', $driver === 'pgsql' ? '5432' : '3306');
            $database = (string) env('DB_DATABASE', 'appdb');
            $dsn = $driver . ':host=' . $host . ';port=' . $port . ';dbname=' . $database;
            if ($driver === 'mysql') {
                $dsn .= ';charset=utf8mb4';
            }
            $pdo = new PDO(
                $dsn,
                (string) env('DB_USERNAME', 'root'),
                (string) env('DB_PASSWORD', ''),
                $options
            );
        }

        self::$connection = $pdo;
        return $pdo;
    }

    public static function quote(string $identifier): string
    {
        $quote = self::driver() === 'mysql' ? '\`' : '"';
        return $quote . str_replace($quote, $quote . $quote, $identifier) . $quote;
    }
}
`;
}

function routerFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

final class Router
{
    /** @var array<int, array{method: string, path: string, handler: array{0: class-string, 1: string}, auth: bool}> */
    private array $routes = [];

    public function get(string $path, array $handler, bool $auth = false): void
    {
        $this->add('GET', $path, $handler, $auth);
    }

    public function post(string $path, array $handler, bool $auth = false): void
    {
        $this->add('POST', $path, $handler, $auth);
    }

    public function put(string $path, array $handler, bool $auth = false): void
    {
        $this->add('PUT', $path, $handler, $auth);
    }

    public function delete(string $path, array $handler, bool $auth = false): void
    {
        $this->add('DELETE', $path, $handler, $auth);
    }

    private function add(string $method, string $path, array $handler, bool $auth): void
    {
        $this->routes[] = [
            'method' => $method,
            'path' => '/' . trim($path, '/'),
            'handler' => $handler,
            'auth' => $auth,
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        $method = strtoupper($method);
        if ($method === 'PATCH') {
            $method = 'PUT';
        }
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = '/' . trim($path, '/');

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            $pattern = preg_replace('#\\{([a-zA-Z_][a-zA-Z0-9_]*)\\}#', '(?P<$1>[^/]+)', $route['path']);
            if (preg_match('#^' . $pattern . '$#', $path, $matches) !== 1) {
                continue;
            }
            if ($route['auth']) {
                Auth::requireUser();
            }
            $params = [];
            foreach ($matches as $key => $value) {
                if (!is_int($key)) {
                    $params[$key] = $value;
                }
            }
            [$class, $action] = $route['handler'];
            // معاملات موضعية: أسماء المتغيّرات في المتحكّم قد تختلف عن أسماء المسار
            (new $class())->{$action}(...array_values($params));
            return;
        }

        Response::error('Not found', 404);
    }
}
`;
}

function validatorFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

use PDO;

final class Validator
{
    /**
     * @param array<string, mixed> $data
     * @param array<string, array<int, string>> $rules
     * @return array<string, mixed>
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        $clean = [];

        foreach ($rules as $field => $fieldRules) {
            $present = array_key_exists($field, $data);
            $value = $present ? $data[$field] : null;
            $required = in_array('required', $fieldRules, true);
            $nullable = in_array('nullable', $fieldRules, true);
            $sometimes = in_array('sometimes', $fieldRules, true);

            if (!$present) {
                if ($required && !$sometimes && !$nullable) {
                    $errors[$field][] = 'This field is required.';
                }
                continue;
            }

            if ($value === null || $value === '') {
                if ($nullable) {
                    $clean[$field] = null;
                    continue;
                }
                if ($required) {
                    $errors[$field][] = 'This field is required.';
                }
                continue;
            }

            $current = $value;
            foreach ($fieldRules as $rule) {
                if (in_array($rule, ['required', 'nullable', 'sometimes'], true)) {
                    continue;
                }
                [$name, $argument] = array_pad(explode(':', $rule, 2), 2, '');
                switch ($name) {
                    case 'string':
                        if (!is_string($current)) {
                            $errors[$field][] = 'Must be a string.';
                        }
                        break;
                    case 'integer':
                        if (filter_var($current, FILTER_VALIDATE_INT) === false) {
                            $errors[$field][] = 'Must be an integer.';
                        } else {
                            $current = (int) $current;
                        }
                        break;
                    case 'numeric':
                        if (!is_numeric($current)) {
                            $errors[$field][] = 'Must be a number.';
                        } else {
                            $current = str_contains((string) $current, '.') ? (float) $current : (int) $current;
                        }
                        break;
                    case 'boolean':
                        $bool = filter_var($current, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                        if ($bool === null) {
                            $errors[$field][] = 'Must be a boolean.';
                        } else {
                            $current = $bool;
                        }
                        break;
                    case 'email':
                        if (!filter_var($current, FILTER_VALIDATE_EMAIL)) {
                            $errors[$field][] = 'Must be a valid e-mail address.';
                        }
                        break;
                    case 'date':
                        if (strtotime((string) $current) === false) {
                            $errors[$field][] = 'Must be a valid date.';
                        }
                        break;
                    case 'array':
                        if (!is_array($current)) {
                            $errors[$field][] = 'Must be an array.';
                        }
                        break;
                    case 'uuid':
                        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', (string) $current)) {
                            $errors[$field][] = 'Must be a valid UUID.';
                        }
                        break;
                    case 'max':
                        if (is_string($current) && mb_strlen($current) > (int) $argument) {
                            $errors[$field][] = 'Must be at most ' . $argument . ' characters.';
                        }
                        break;
                    case 'min':
                        if (is_string($current) && mb_strlen($current) < (int) $argument) {
                            $errors[$field][] = 'Must be at least ' . $argument . ' characters.';
                        }
                        break;
                    case 'in':
                        if (!in_array((string) $current, explode(',', $argument), true)) {
                            $errors[$field][] = 'Must be one of: ' . $argument . '.';
                        }
                        break;
                    case 'unique':
                        if (!self::isUnique($argument, $current)) {
                            $errors[$field][] = 'This value is already taken.';
                        }
                        break;
                    case 'exists':
                        if (!self::exists($argument, $current)) {
                            $errors[$field][] = 'The selected value does not exist.';
                        }
                        break;
                }
            }

            if (!isset($errors[$field])) {
                $clean[$field] = $current;
            }
        }

        if ($errors !== []) {
            Response::error('Validation failed', 422, $errors);
        }
        return $clean;
    }

    private static function isUnique(string $argument, mixed $value): bool
    {
        $parts = explode(',', $argument);
        if (count($parts) < 2) {
            return true;
        }
        [$table, $column] = $parts;
        $sql = 'SELECT COUNT(*) FROM ' . Database::quote($table) . ' WHERE ' . Database::quote($column) . ' = ?';
        $params = [$value];

        $ignore = array_slice($parts, 2);
        if (count($ignore) >= 2 && count($ignore) % 2 === 0) {
            $conditions = [];
            for ($index = 0; $index < count($ignore); $index += 2) {
                $conditions[] = Database::quote($ignore[$index]) . ' = ?';
                $params[] = $ignore[$index + 1];
            }
            $sql .= ' AND NOT (' . implode(' AND ', $conditions) . ')';
        }

        $statement = Database::pdo()->prepare($sql);
        $statement->execute($params);
        return (int) $statement->fetchColumn() === 0;
    }

    private static function exists(string $argument, mixed $value): bool
    {
        $parts = explode(',', $argument);
        if (count($parts) < 2) {
            return true;
        }
        [$table, $column] = $parts;
        $sql = 'SELECT 1 FROM ' . Database::quote($table) . ' WHERE ' . Database::quote($column) . ' = ? LIMIT 1';
        $statement = Database::pdo()->prepare($sql);
        $statement->execute([$value]);
        return $statement->fetchColumn() !== false;
    }
}
`;
}

function authFile(): string {
  return `<?php
declare(strict_types=1);

namespace App;

use PDO;

final class Auth
{
    public static function user(): ?array
    {
        $header = Request::header('Authorization');
        if ($header === null || preg_match('/^Bearer\\s+(.+)$/i', $header, $matches) !== 1) {
            return null;
        }
        $digest = hash('sha256', trim($matches[1]));
        $sql = 'SELECT u.id, u.email, u.created_at FROM ' . Database::quote('auth_tokens') . ' t'
            . ' INNER JOIN ' . Database::quote('auth_users') . ' u ON u.id = t.user_id'
            . ' WHERE t.token_hash = ? AND t.expires_at > ? LIMIT 1';
        $statement = Database::pdo()->prepare($sql);
        $statement->execute([$digest, gmdate('Y-m-d H:i:s')]);
        $row = $statement->fetch();
        return $row === false ? null : $row;
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if ($user === null) {
            Response::error('Unauthenticated', 401);
        }
        return $user;
    }
}
`;
}

function authControllerFile(): string {
  return `<?php
declare(strict_types=1);

namespace App\\Controllers;

use App\\Auth;
use App\\Database;
use App\\Request;
use App\\Response;
use App\\Validator;
use PDOException;

final class AuthController
{
    public function register(): void
    {
        $data = Request::json();
        $clean = Validator::validate($data, [
            'email' => ['required', 'string', 'max:255', 'email', 'unique:auth_users,email'],
            'password' => ['required', 'string', 'min:8', 'max:128'],
        ]);

        $statement = Database::pdo()->prepare(
            'INSERT INTO ' . Database::quote('auth_users') . ' (email, password_hash) VALUES (?, ?)'
        );
        try {
            $statement->execute([
                strtolower((string) $clean['email']),
                password_hash((string) $clean['password'], PASSWORD_DEFAULT),
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                Response::error('Email is already registered', 409);
            }
            throw $exception;
        }

        $userId = (int) Database::pdo()->lastInsertId();
        Response::json([
            'token' => $this->issueToken($userId),
            'user' => ['id' => $userId, 'email' => strtolower((string) $clean['email'])],
        ], 201);
    }

    public function login(): void
    {
        $data = Request::json();
        $clean = Validator::validate($data, [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $statement = Database::pdo()->prepare(
            'SELECT id, email, password_hash FROM ' . Database::quote('auth_users') . ' WHERE email = ? LIMIT 1'
        );
        $statement->execute([strtolower((string) $clean['email'])]);
        $user = $statement->fetch();

        if ($user === false || !password_verify((string) $clean['password'], (string) $user['password_hash'])) {
            Response::error('Invalid email or password', 401);
        }

        Response::json([
            'token' => $this->issueToken((int) $user['id']),
            'user' => ['id' => (int) $user['id'], 'email' => $user['email']],
        ]);
    }

    public function me(): void
    {
        Response::json(Auth::requireUser());
    }

    public function logout(): void
    {
        $user = Auth::requireUser();
        $statement = Database::pdo()->prepare(
            'DELETE FROM ' . Database::quote('auth_tokens') . ' WHERE user_id = ?'
        );
        $statement->execute([$user['id']]);
        Response::json(null, 204);
    }

    private function issueToken(int $userId): string
    {
        $raw = bin2hex(random_bytes(32));
        $digest = hash('sha256', $raw);
        $days = max(1, (int) env('AUTH_TOKEN_TTL_DAYS', '7'));
        $expires = gmdate('Y-m-d H:i:s', time() + $days * 86400);

        $statement = Database::pdo()->prepare(
            'INSERT INTO ' . Database::quote('auth_tokens') . ' (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        );
        $statement->execute([$userId, $digest, $expires]);
        return $raw;
    }
}
`;
}

function rulesFor(table: BackendTable, col: BackendColumn, mode: 'store' | 'update'): string[] {
  const rules: string[] = [];
  if (mode === 'update') rules.push("'sometimes'");

  const hasDefault = col.defaultValue !== undefined && col.defaultValue !== '';
  if (mode === 'store' && !col.nullable && !hasDefault) rules.push("'required'");
  if (col.nullable) rules.push("'nullable'");
  if (mode === 'store' && !col.nullable && hasDefault) rules.push("'sometimes'");

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
    case 'time':
      rules.push("'date'");
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
    if (mode === 'store' || table.primaryKey.length === 0) {
      rules.push(`'unique:${table.name},${col.name}'`);
    } else {
      let expression = `'unique:${table.name},${col.name}`;
      table.primaryKey.forEach((pk, index) => {
        expression += `,${pk.name},' . ${keyArgAt(table, index)} . '`;
      });
      expression += `'`;
      rules.push(expression);
    }
  }

  return rules;
}

function controllerFile(table: BackendTable, options: BackendOptions): string {
  const cls = table.className;
  const hasPk = table.primaryKey.length > 0;
  const composite = table.primaryKey.length > 1;
  const keySignature = composite
    ? table.primaryKey.map((_, index) => `string ${keyVar(index)}`).join(', ')
    : 'string $id';
  const whereConditions = table.primaryKey.length
    ? table.primaryKey.map(pk => `${qid(pk.name)} . ' = ?'`).join(` . ' AND ' . `)
    : `${qid('id')} . ' = ?'`;
  const whereSql = `' WHERE ' . ${whereConditions}`;
  const keyValues = composite
    ? table.primaryKey.map((pk, index) => `${keyVar(index)} = ${intKey(pk) ? '(int) ' + keyVar(index) : keyVar(index)};`).join('\n        ')
    : `$id = ${intKey(table.primaryKey[0] ?? table.columns[0]) ? '(int) $id' : '$id'};`;
  const orderClause = table.primaryKey.length === 1 && table.primaryKey[0].autoIncrement
    ? `' ORDER BY ' . ${qid(table.primaryKey[0].name)} . ' DESC'`
    : table.primaryKey.length > 0
      ? `' ORDER BY ' . ` + table.primaryKey.map(pk => `${qid(pk.name)} . ' ASC'`).join(" . ', ' . ")
      : "''";

  const storeRules = table.columns
    .filter(col => !col.autoIncrement)
    .map(col => `            ${phpStr(col.name)} => [${rulesFor(table, col, 'store').join(', ')}],`);

  const updateRules = table.columns
    .filter(col => !col.primaryKey)
    .map(col => `            ${phpStr(col.name)} => [${rulesFor(table, col, 'update').join(', ')}],`);

  const lines: string[] = [
    '<?php',
    'declare(strict_types=1);',
    '',
    'namespace App\\Controllers;',
    '',
    'use App\\Database;',
    'use App\\Request;',
    'use App\\Response;',
    'use App\\Validator;',
    'use PDOException;',
    '',
    `final class ${cls}Controller`,
    '{',
    '    public function index(): void',
    '    {',
    "        $page = max(1, (int) ($_GET['page'] ?? 1));",
    "        $perPage = min(200, max(1, (int) ($_GET['per_page'] ?? 50)));",
    '        $offset = ($page - 1) * $perPage;',
    '        $pdo = Database::pdo();',
    `        $total = (int) $pdo->query('SELECT COUNT(*) FROM ' . ${qid(table.name)})->fetchColumn();`,
    `        $statement = $pdo->query('SELECT * FROM ' . ${qid(table.name)} . ${orderClause} . ' LIMIT ' . $perPage . ' OFFSET ' . $offset);`,
    "        Response::json(['data' => $statement->fetchAll(), 'meta' => ['page' => $page, 'per_page' => $perPage, 'total' => $total]]);",
    '    }',
    '',
  ];

  if (options.mode === 'full') {
    lines.push(
      '    public function store(): void',
      '    {',
      '        $data = Request::json();',
      '        $clean = Validator::validate($data, $this->storeRules());',
      '',
      '        if ($clean === []) {',
      "            Response::error('No fields to insert', 422);",
      '        }',
      '',
      '        $columns = array_keys($clean);',
      `        $sql = 'INSERT INTO ' . ${qid(table.name)} . ' (' . implode(', ', array_map([Database::class, 'quote'], $columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')';`,
      '',
      '        try {',
      '            $statement = Database::pdo()->prepare($sql);',
      '            $statement->execute(array_values($clean));',
      '        } catch (PDOException $exception) {',
      "            if ($exception->getCode() === '23000') {",
      "                Response::error('A database constraint was violated', 409);",
      '            }',
      '            throw $exception;',
      '        }',
      ''
    );

    if (!hasPk) {
      lines.push(
        "        Response::json(['id' => Database::pdo()->lastInsertId()], 201);",
        '    }',
        ''
      );
    } else {
      const pkValues = table.primaryKey
        .map(pk => (pk.autoIncrement ? 'Database::pdo()->lastInsertId()' : `$clean[${phpStr(pk.name)}]`))
        .join(', ');
      lines.push(
        `        Response::json($this->findOrFail(${pkValues}), 201);`,
        '    }',
        ''
      );
    }
  }

  if (hasPk) {
    lines.push(
      `    public function show(${keySignature}): void`,
      '    {',
      `        ${keyValues}`,
      `        Response::json($this->findOrFail(${keyArgs(table)}));`,
      '    }',
      '',
      `    public function update(${keySignature}): void`,
      '    {',
      `        ${keyValues}`,
      `        $this->findOrFail(${keyArgs(table)});`,
      '        $data = Request::json();',
      '        $clean = Validator::validate($data, $this->updateRules());',
      '',
      '        if ($clean !== []) {',
      "            $assignments = implode(', ', array_map(static fn (string $column): string => Database::quote($column) . ' = ?', array_keys($clean)));",
      `            $sql = 'UPDATE ' . ${qid(table.name)} . ' SET ' . $assignments . ${whereSql};`,
      `            $params = array_values($clean);`,
      ...table.primaryKey.map((_, index) => `            $params[] = ${keyArgAt(table, index)};`),
      '',
      '            try {',
      '                $statement = Database::pdo()->prepare($sql);',
      '                $statement->execute($params);',
      '            } catch (PDOException $exception) {',
      "                if ($exception->getCode() === '23000') {",
      "                    Response::error('A database constraint was violated', 409);",
      '                }',
      '                throw $exception;',
      '            }',
      '        }',
      '',
      `        Response::json($this->findOrFail(${keyArgs(table)}));`,
      '    }',
      '',
      `    public function destroy(${keySignature}): void`,
      '    {',
      `        ${keyValues}`,
      `        $this->findOrFail(${keyArgs(table)});`,
      `        $statement = Database::pdo()->prepare('DELETE FROM ' . ${qid(table.name)} . ${whereSql});`,
      `        $statement->execute([${keyArgs(table)}]);`,
      '        Response::json(null, 204);',
      '    }',
      ''
    );
  }

  if (hasPk) {
    const findSignature = composite
      ? table.primaryKey.map((_, index) => `string|int ${keyVar(index)}`).join(', ')
      : 'string|int $id';
    lines.push(
      `    private function findOrFail(${findSignature}): array`,
      '    {',
      `        $sql = 'SELECT * FROM ' . ${qid(table.name)} . ${whereSql} . ' LIMIT 1';`,
      `        $statement = Database::pdo()->prepare($sql);`,
      `        $statement->execute([${keyArgs(table)}]);`,
      '        $row = $statement->fetch();',
      '        if ($row === false) {',
      `            Response::error(${phpStr(`${cls} not found`)}, 404);`,
      '        }',
      '        return $row;',
      '    }',
      ''
    );
  }

  if (options.mode === 'full') {
    lines.push(
      '    private function storeRules(): array',
      '    {',
      '        return [',
      ...storeRules,
      '        ];',
      '    }',
      '',
      '    private function updateRules(): array',
      '    {',
      '        return [',
      ...updateRules,
      '        ];',
      '    }',
      ''
    );
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function routesFile(model: BackendModel, options: BackendOptions): string {
  const authRoutes = options.auth && options.mode === 'full';
  const lines: string[] = ['<?php', 'declare(strict_types=1);', '', 'use App\\Router;'];
  if (authRoutes) lines.push('use App\\Controllers\\AuthController;');
  for (const table of model.tables) {
    lines.push(`use App\\Controllers\\${table.className}Controller;`);
  }
  lines.push('', 'return static function (Router $router): void {');
  lines.push("    $router->get('/health', [\\App\\Controllers\\HealthController::class, 'show']);", '');
  if (authRoutes) {
    lines.push(
      "    $router->post('/api/auth/register', [AuthController::class, 'register']);",
      "    $router->post('/api/auth/login', [AuthController::class, 'login']);",
      "    $router->get('/api/auth/me', [AuthController::class, 'me'], true);",
      "    $router->post('/api/auth/logout', [AuthController::class, 'logout'], true);",
      ''
    );
  }
  if (options.mode === 'full') {
    for (const table of model.tables) {
      const path = kebab(table.name);
      const controller = `${table.className}Controller::class`;
      const auth = options.auth ? ', true' : '';
      lines.push(`    $router->get('/api/${path}', [${controller}, 'index']${auth});`);
      lines.push(`    $router->post('/api/${path}', [${controller}, 'store']${auth});`);
      if (table.primaryKey.length > 0) {
        const params = table.primaryKey.map((_, index) => `{key${index + 1}}`).join('/');
        lines.push(`    $router->get('/api/${path}/${params}', [${controller}, 'show']${auth});`);
        lines.push(`    $router->put('/api/${path}/${params}', [${controller}, 'update']${auth});`);
        lines.push(`    $router->delete('/api/${path}/${params}', [${controller}, 'destroy']${auth});`);
      }
    }
  }
  lines.push('};', '');
  return lines.join('\n');
}

function healthControllerFile(): string {
  return `<?php
declare(strict_types=1);

namespace App\\Controllers;

use App\\Response;

final class HealthController
{
    public function show(): void
    {
        Response::json(['status' => 'ok']);
    }
}
`;
}

function indexFile(): string {
  return `<?php
declare(strict_types=1);

use App\\Router;

require __DIR__ . '/../src/bootstrap.php';

$router = new Router();
$registerRoutes = require __DIR__ . '/../routes/api.php';
$registerRoutes($router);
$router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
`;
}

function htaccessFile(): string {
  return `RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [QSA,L]
`;
}

function authMigrationFile(options: BackendOptions): string {
  const mysql = options.db === 'mysql';
  const postgres = options.db === 'postgres';
  const userPk = mysql ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY' : postgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const tokenPk = mysql ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY' : postgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const engine = mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
  const lines = [
    '-- Authentication tables. Apply after 001_init.sql.',
    'CREATE TABLE IF NOT EXISTS auth_users (',
    `  id ${userPk},`,
    '  email VARCHAR(255) NOT NULL UNIQUE,',
    '  password_hash VARCHAR(255) NOT NULL,',
    '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    `)${engine};`,
    '',
    'CREATE TABLE IF NOT EXISTS auth_tokens (',
    `  id ${tokenPk},`,
    '  user_id INT NOT NULL,',
    '  token_hash CHAR(64) NOT NULL UNIQUE,',
    '  expires_at TIMESTAMP NOT NULL,',
    '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE',
    `)${engine};`,
    '',
  ];
  if (mysql) {
    lines.push('CREATE INDEX ix_auth_tokens_user ON auth_tokens (user_id);');
  } else {
    lines.push('CREATE INDEX IF NOT EXISTS ix_auth_tokens_user ON auth_tokens (user_id);');
  }
  lines.push('');
  return lines.join('\n');
}

function envFile(options: BackendOptions): string {
  if (options.db === 'sqlite') {
    return [
      'APP_URL=http://localhost:8000',
      'DB_CONNECTION=sqlite',
      'DB_DATABASE=/absolute/path/to/database.sqlite',
      'CORS_ORIGIN=*',
      'AUTH_TOKEN_TTL_DAYS=7',
      '',
    ].join('\n');
  }
  return [
    'APP_URL=http://localhost:8000',
    `DB_CONNECTION=${options.db === 'postgres' ? 'pgsql' : 'mysql'}`,
    'DB_HOST=127.0.0.1',
    `DB_PORT=${options.db === 'postgres' ? '5432' : '3306'}`,
    'DB_DATABASE=appdb',
    `DB_USERNAME=${options.db === 'postgres' ? 'postgres' : 'root'}`,
    'DB_PASSWORD=',
    'CORS_ORIGIN=*',
    'AUTH_TOKEN_TTL_DAYS=7',
    '',
  ].join('\n');
}

function readme(model: BackendModel, options: BackendOptions, projectName: string): string {
  const full = options.mode === 'full';
  const tableRows = model.tables
    .map(t => `| \`${t.name}\` | ${t.columns.length} | ${t.primaryKey.map(pk => `\`${pk.name}\``).join(', ') || '—'} |`)
    .join('\n');
  return `# ${projectName.replace(/-/g, ' ')} — PHP PDO API

Generated by Schema Studio — **${frameworkLabel('pdo', options.db)}**.

A dependency-free PHP 8.1+ REST API: no Composer packages, no framework,
prepared statements everywhere.

## Structure

\`\`\`
public/
  index.php          Front controller
  .htaccess          Apache rewrite (optional)
src/
  bootstrap.php      Autoloader, .env parser, JSON/CORS, error handler
  Database.php       PDO connection + identifier quoting
  Router.php         Tiny router with auth middleware flag
  Request.php        JSON body + headers
  Response.php       JSON responses
  Validator.php      Constraint-aware validation
  Auth.php           Bearer-token guard${options.auth ? '' : ' (not generated)'}
  Controllers/       One CRUD controller per table${full ? '' : ' (not generated)'}
routes/
  api.php            Route table
migrations/
  001_init.sql       Full schema DDL
  ${options.auth ? '002_auth.sql       Authentication tables' : ''}
\`\`\`

## Run

\`\`\`bash
cp .env.example .env
# create the database, then:
mysql -u root -p appdb < migrations/001_init.sql   # or: psql appdb -f migrations/001_init.sql
php -S localhost:8000 -t public
\`\`\`

Apache users can point the document root at \`public/\`; \`.htaccess\` is included.
Nginx users should route everything to \`public/index.php\`.

## Endpoints

${full ? `Every table gets list/create plus detail/update/delete when it has a primary key.

| Method | Path | Description |
|---|---|---|
| GET | \`/api/<table>\` | Paginated list (\`page\`, \`per_page\` ≤ 200) |
| POST | \`/api/<table>\` | Create with validation, 201 |
| GET | \`/api/<table>/{key}\` | Single row, 404 when missing |
| PUT | \`/api/<table>/{key}\` | Partial update (PATCH accepted) |
| DELETE | \`/api/<table>/{key}\` | Delete, 204 |

Composite primary keys use one path segment per key. Validation mirrors the
schema (required/nullable, lengths, numeric/boolean/date types, e-mail,
unique values including update-ignore, foreign keys) and returns 422 with
field-level errors. Duplicate-key races return 409.` : 'Models/migrations-only mode: the SQL migration is the deliverable; no HTTP routes are generated.'}

## Tables

| Table | Columns | Primary key |
|---|---|---|
${tableRows}

${options.auth ? `## Authentication

\`POST /api/auth/register\` and \`POST /api/auth/login\` return a bearer token.
Send \`Authorization: Bearer <token>\` on every business endpoint.
\`GET /api/auth/me\` returns the current user and \`POST /api/auth/logout\`
revokes all of that user's tokens. Passwords use PHP's \`password_hash\`/\`password_verify\`.
` : ''}
## Notes

- Generated from ${model.baseTables.length} base tables and ${model.source.relationships.length} declared relations.
- ${model.tables.length - model.baseTables.length} junction table(s) were synthesised for N-M relations.
${model.warnings.length ? model.warnings.map(w => `- ⚠ ${w}`).join('\n') : '- No schema warnings.'}
`;
}

function composerFile(): string {
  return `${JSON.stringify(
    {
      name: 'schema-studio/php-pdo-api',
      description: 'Zero-dependency PHP PDO REST API generated by Schema Studio',
      type: 'project',
      require: { php: '>=8.1', 'ext-pdo': '*' },
      autoload: { 'psr-4': { 'App\\': 'src/' } },
    },
    null,
    2
  )}\n`;
}

export function generatePhpPdo(model: BackendModel, options: BackendOptions, projectName: string): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: 'public/index.php', language: 'php', content: indexFile() },
    { path: 'public/.htaccess', language: 'text', content: htaccessFile() },
    { path: 'src/bootstrap.php', language: 'php', content: bootstrapFile() },
    { path: 'src/Response.php', language: 'php', content: responseFile() },
    { path: 'src/Request.php', language: 'php', content: requestFile() },
    { path: 'src/Database.php', language: 'php', content: databaseFile() },
    { path: 'src/Router.php', language: 'php', content: routerFile() },
    { path: 'src/Validator.php', language: 'php', content: validatorFile() },
    { path: 'src/Controllers/HealthController.php', language: 'php', content: healthControllerFile() },
    { path: 'routes/api.php', language: 'php', content: routesFile(model, options) },
    { path: 'composer.json', language: 'json', content: composerFile() },
    { path: '.env.example', language: 'env', content: envFile(options) },
    { path: 'README.md', language: 'markdown', content: readme(model, options, projectName) },
  ];

  if (options.mode === 'full') {
    for (const table of model.tables) {
      files.push({
        path: `src/Controllers/${table.className}Controller.php`,
        language: 'php',
        content: controllerFile(table, options),
      });
    }
  }

  // Auth.php يُولَّد دائماً كي يبقى Router قابلاً للتحميل؛ المسارات لا تستخدمه بلا تفعيل
  files.push({ path: 'src/Auth.php', language: 'php', content: authFile() });
  if (options.auth) {
    if (options.mode === 'full') {
      files.push({
        path: 'src/Controllers/AuthController.php',
        language: 'php',
        content: authControllerFile(),
      });
    }
    files.push({ path: 'migrations/002_auth.sql', language: 'sql', content: authMigrationFile(options) });
  }

  const ddl = generateDdl(model.source, options.db, { dropIfExists: false, createJunctionTables: true, deferCyclicForeignKeys: true });
  files.push({
    path: 'migrations/001_init.sql',
    language: 'sql',
    content: `-- Schema generated from the ER model on ${new Date().toISOString().slice(0, 10)}\n\n${ddl.code}\n`,
  });

  return files;
}
