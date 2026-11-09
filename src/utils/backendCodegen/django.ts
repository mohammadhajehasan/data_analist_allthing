/**
 * Django + Django REST Framework generator.
 * ---------------------------------------------------------------
 * The SQL file `migrations/001_init.sql` is the source of truth for the
 * database schema, so business models are emitted with `managed = False`.
 * Django therefore queries the exact tables created by the SQL migration
 * (including composite keys) instead of re-creating a slightly different
 * schema through its own migration engine.
 *
 * Supported out of the box:
 *   • one model class per table, with relations and db_column fidelity
 *   • ModelSerializer validation (required/null/unique/e-mail/FK)
 *   • ModelViewSet CRUD for single-primary-key tables
 *   • list/create + explicit detail routes for composite-primary-key tables
 *   • optional TokenAuthentication register/login/me/logout
 *   • optional AI seed command that calls the ORM, never raw SQL
 */

import type { BackendColumn, BackendModel, BackendOptions, BackendTable } from './model';
import { frameworkLabel, looksLikeEmail } from './model';
import type { GeneratedFile } from './types';
import { generateDdl } from '../ddlGenerator';

const pyStr = (value: string): string => JSON.stringify(value);

// ---------------------------------------------------------------------------
// أسماء الحقول والأنواع
// ---------------------------------------------------------------------------

function relationFor(table: BackendTable, col: BackendColumn) {
  return table.belongsTo.find(relation => relation.fkColumn === col);
}

/** Django field name (not the DB column). ForeignKey uses the relation name. */
function fieldName(table: BackendTable, col: BackendColumn): string {
  if (col.fk) {
    const relation = relationFor(table, col);
    if (relation) return relation.attr;
    const fallback = col.codeName.replace(/_id$/i, '');
    return fallback || `${col.codeName}_ref`;
  }
  // `pk` is reserved by Django's model API; keep the SQL column via db_column.
  return col.codeName === 'pk' ? 'pk_value' : col.codeName;
}

function supportsForeignKey(col: BackendColumn): boolean {
  return Boolean(col.fk && col.fk.parent.primaryKey.length === 1);
}

function dbColumnFor(table: BackendTable, col: BackendColumn): string | null {
  const name = fieldName(table, col);
  if (col.fk && supportsForeignKey(col)) {
    return col.name !== `${name}_id` ? col.name : null;
  }
  return col.name !== name ? col.name : null;
}

function onDeleteCode(col: BackendColumn): string {
  switch (col.fk?.onDelete) {
    case 'CASCADE':
      return 'models.CASCADE';
    case 'SET NULL':
      return 'models.SET_NULL';
    default:
      return 'models.DO_NOTHING';
  }
}

function baseFieldType(col: BackendColumn): string {
  switch (col.kind) {
    case 'int':
      return 'models.IntegerField()';
    case 'bigint':
      return 'models.BigIntegerField()';
    case 'smallint':
      return 'models.SmallIntegerField()';
    case 'float':
      return 'models.FloatField()';
    case 'decimal':
      return `models.DecimalField(max_digits=${col.precision ?? 18}, decimal_places=${col.scale ?? 2})`;
    case 'bool':
      return 'models.BooleanField()';
    case 'date':
      return 'models.DateField()';
    case 'datetime':
      return 'models.DateTimeField()';
    case 'time':
      return 'models.TimeField()';
    case 'json':
      return 'models.JSONField()';
    case 'uuid':
      return 'models.UUIDField()';
    case 'binary':
      return 'models.BinaryField()';
    case 'string':
      return `models.CharField(max_length=${col.length ?? 255})`;
    case 'text':
    case 'unknown':
    default:
      return 'models.TextField()';
  }
}

type DefaultCode = { code: string; timezone: boolean } | { warning: string } | null;

/**
 * Convert simple SQL defaults to Python values. Complex expressions stay in
 * the SQL migration and are documented instead of being silently changed.
 */
function defaultCode(col: BackendColumn): DefaultCode {
  const raw = (col.defaultValue || '').trim();
  if (!raw || col.autoIncrement) return null;
  const lower = raw.toLowerCase();
  if (lower === 'current_timestamp' || lower === 'current_timestamp()' || lower === 'now()' || lower === 'localtimestamp') {
    if (col.kind === 'date') return { code: 'timezone.localdate', timezone: true };
    return { code: 'timezone.now', timezone: true };
  }
  if (lower === 'current_date') return { code: 'timezone.localdate', timezone: true };
  if (/^'(.*)'$/.test(raw)) return { code: pyStr(raw.slice(1, -1).replace(/''/g, "'")), timezone: false };
  if (/^"(.*)"$/.test(raw)) return { code: pyStr(raw.slice(1, -1).replace(/""/g, '"')), timezone: false };
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { code: raw, timezone: false };
  if (/^(true|false)$/i.test(raw)) return { code: lower === 'true' ? 'True' : 'False', timezone: false };
  if (lower === 'null') return null;
  return { warning: raw };
}

type FieldCode = { code: string; warning?: string };

function scalaFieldCode(
  table: BackendTable,
  col: BackendColumn,
  options: { forcePrimary?: boolean; composite: boolean }
): FieldCode {
  const name = fieldName(table, col);
  const singlePk = table.primaryKey.length === 1 && table.primaryKey[0] === col;
  const primary = Boolean(options.forcePrimary || singlePk);
  const auto = col.autoIncrement && primary;
  const type = auto
    ? col.kind === 'bigint'
      ? 'models.BigAutoField()'
      : 'models.AutoField()'
    : baseFieldType(col);
  const args: string[] = [];

  if (primary) args.push('primary_key=True');
  if (col.unique && !primary && !options.composite) args.push('unique=True');
  if (col.nullable && !primary) {
    args.push('null=True', 'blank=True');
  }
  const dbColumn = dbColumnFor(table, col);
  if (dbColumn) args.push(`db_column=${pyStr(dbColumn)}`);

  const def = defaultCode(col);
  if (def && 'code' in def) {
    args.push(`default=${def.code}`);
  }

  // Field types already contain parentheses (e.g. CharField(max_length=120));
  // insert the remaining keyword arguments before the closing parenthesis.
  const constructor = args.length === 0
    ? type
    : type.endsWith('()')
      ? `${type.slice(0, -1)}${args.join(', ')})`
      : type.replace(/\)$/, `, ${args.join(', ')})`);
  return {
    code: `    ${name} = ${constructor}`,
    warning: def && 'warning' in def ? `Default ${pyStr(def.warning)} for ${table.name}.${col.name} is kept in SQL only.` : undefined,
  };
}

function foreignKeyCode(table: BackendTable, col: BackendColumn, composite: boolean, forcePrimary = false): FieldCode {
  if (!col.fk || !supportsForeignKey(col)) {
    return scalaFieldCode(table, col, { composite, forcePrimary });
  }
  const name = fieldName(table, col);
  const singlePk = table.primaryKey.length === 1 && table.primaryKey[0] === col;
  const primary = (singlePk && !composite) || forcePrimary;
  const args = [
    col.fk.parent.className,
    `on_delete=${onDeleteCode(col)}`,
  ];
  if (primary) args.push('primary_key=True');
  if (col.nullable && !primary) args.push('null=True', 'blank=True');
  if (col.unique && !primary && !composite) args.push('unique=True');
  const dbColumn = dbColumnFor(table, col);
  if (dbColumn) args.push(`db_column=${pyStr(dbColumn)}`);
  const relation = relationFor(table, col);
  if (relation) args.push(`related_name=${pyStr(relation.backAttr)}`);
  return {
    code: `    ${name} = models.${primary ? 'OneToOneField' : 'ForeignKey'}(\n${args.map(arg => `        ${arg},`).join('\n')}\n    )`,
  };
}

function fieldCode(table: BackendTable, col: BackendColumn, forcePrimary: boolean, composite: boolean): FieldCode {
  const fk = foreignKeyCode(table, col, composite, forcePrimary);
  if (!forcePrimary) return fk;
  // A table without a primary key needs an ORM identity. Reuse its first
  // existing column instead of inventing an `id` column absent from SQL.
  return fk;
}

// ---------------------------------------------------------------------------
// models.py
// ---------------------------------------------------------------------------

function metaIndexes(table: BackendTable): { indexes: string[]; constraints: string[]; warnings: string[] } {
  const indexes: string[] = [];
  const constraints: string[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();
  const fieldForColumn = (name: string): string | null => {
    const col = table.columns.find(column => column.name === name);
    if (!col) return null;
    return fieldName(table, col);
  };
  const safeName = (prefix: string, columns: string[]): string => {
    let base = `${prefix}_${table.name}_${columns.join('_')}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 30);
    let candidate = base;
    let counter = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${base.slice(0, 27)}_${counter++}`;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  };

  for (const index of table.indexes ?? []) {
    const columns = index.columns
      .map(name => ({ name, field: fieldForColumn(name) }))
      .filter((entry): entry is { name: string; field: string } => Boolean(entry.field));
    if (columns.length === 0) continue;
    const fields = columns.map(entry => entry.field);
    if (columns.length === 1) {
      const col = table.columns.find(column => column.name === columns[0].name);
      if (col?.primaryKey) continue;
      if (col?.unique) continue; // covered by the model field
    }
    const name = index.name && /^[A-Za-z0-9_]+$/.test(index.name)
      ? (usedNames.has(index.name.toLowerCase()) ? safeName('idx', fields) : index.name.slice(0, 30))
      : safeName(index.unique ? 'ux' : 'ix', fields);
    usedNames.add(name.toLowerCase());
    if (index.unique) {
      constraints.push(`            models.UniqueConstraint(fields=${JSON.stringify(fields)}, name=${pyStr(name)}),`);
    } else {
      indexes.push(`            models.Index(fields=${JSON.stringify(fields)}, name=${pyStr(name)}),`);
    }
  }

  for (const check of table.tableChecks ?? []) {
    warnings.push(`Table CHECK on ${table.name} is enforced by migrations/001_init.sql, not by the Django model: ${check}`);
  }
  for (const col of table.columns) {
    if (col.check && col.check.trim()) {
      warnings.push(`Column CHECK on ${table.name}.${col.name} is enforced by migrations/001_init.sql, not by the Django model: ${col.check}`);
    }
    if (col.fk && !supportsForeignKey(col)) {
      warnings.push(`${table.name}.${col.name} references a composite primary key; Django cannot express that ForeignKey, so it is emitted as a plain DB column.`);
    }
  }
  return { indexes, constraints, warnings };
}

function modelsFile(model: BackendModel): { content: string; warnings: string[] } {
  const lines: string[] = [
    '"""Django ORM models — managed=False because migrations/001_init.sql owns the schema."""',
    'from django.db import models',
    'from django.utils import timezone',
    '',
    '',
  ];
  const warnings: string[] = [];

  for (const table of model.tables) {
    const composite = table.primaryKey.length > 1;
    const implicitPrimary = table.primaryKey.length === 0 ? table.columns[0] : null;
    lines.push(`class ${table.className}(models.Model):`);
    if (implicitPrimary) {
      lines.push(`    # No primary key in the schema: ${implicitPrimary.name} is used as the ORM identity.`);
      warnings.push(`Table "${table.name}" has no primary key; Django uses "${implicitPrimary.name}" as its ORM identity.`);
    }
    if (table.columns.length === 0) {
      lines.push('    pass');
    } else {
      for (const col of table.columns) {
        const field = fieldCode(table, col, implicitPrimary === col, composite);
        if (field.warning) warnings.push(field.warning);
        lines.push(field.code);
      }
    }
    if (composite) {
      const pkFields = table.primaryKey.map(col => fieldName(table, col));
      lines.push(`    pk = models.CompositePrimaryKey(${pkFields.map(pyStr).join(', ')})`);
    }

    const meta = metaIndexes(table);
    warnings.push(...meta.warnings);
    lines.push('');
    lines.push('    class Meta:');
    lines.push('        managed = False');
    lines.push(`        db_table = ${pyStr(table.name)}`);
    if (meta.indexes.length > 0) {
      lines.push('        indexes = [');
      lines.push(...meta.indexes);
      lines.push('        ]');
    }
    if (meta.constraints.length > 0) {
      lines.push('        constraints = [');
      lines.push(...meta.constraints);
      lines.push('        ]');
    }
    lines.push('');
    lines.push('');
  }

  return { content: lines.join('\n').trimEnd() + '\n', warnings };
}

// ---------------------------------------------------------------------------
// serializers.py / views.py
// ---------------------------------------------------------------------------

function serializerFieldNames(table: BackendTable): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const col of table.columns) {
    const autoSinglePk = col.primaryKey && col.autoIncrement && table.primaryKey.length === 1;
    if (autoSinglePk) continue;
    const name = fieldName(table, col);
    if (name === 'pk' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function serializerClass(table: BackendTable): string {
  const fields = ['pk', ...serializerFieldNames(table)];
  const extraFields = new Map<string, string[]>();
  const addExtra = (field: string, entry: string): void => {
    const current = extraFields.get(field) ?? [];
    current.push(entry);
    extraFields.set(field, current);
  };
  for (const col of table.columns) {
    const name = fieldName(table, col);
    if (col.kind === 'string' && looksLikeEmail(col.name)) {
      addExtra(name, '"validators": [validate_email]');
    }
    if (col.nullable && !col.primaryKey) {
      addExtra(name, '"required": False');
      addExtra(name, '"allow_null": True');
    }
  }
  const extra = [...extraFields.entries()]
    .map(([name, entries]) => `            ${pyStr(name)}: {${entries.join(', ')}},`);
  const lines = [
    `class ${table.className}Serializer(serializers.ModelSerializer):`,
    '    pk = serializers.SerializerMethodField()',
    '',
    '    class Meta:',
    `        model = ${table.className}`,
    `        fields = ${JSON.stringify(fields)}`,
    "        read_only_fields = [\"pk\"]",
  ];
  if (extra.length > 0) {
    lines.push('        extra_kwargs = {');
    lines.push(...extra);
    lines.push('        }');
  }
  lines.push('');
  lines.push('    def get_pk(self, obj):');
  lines.push('        return list(obj.pk) if isinstance(obj.pk, tuple) else obj.pk');
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

function serializersFile(model: BackendModel): string {
  const usesEmail = model.tables.some(table =>
    table.columns.some(col => col.kind === 'string' && looksLikeEmail(col.name))
  );
  const lines = [
    '"""DRF serializers — validation mirrors the SQL constraints."""',
    'from rest_framework import serializers',
  ];
  if (usesEmail) lines.push('from django.core.validators import validate_email');
  lines.push('', `from .models import ${model.tables.map(table => table.className).join(', ')}`, '', '');
  for (const table of model.tables) lines.push(serializerClass(table));
  return lines.join('\n').trimEnd() + '\n';
}

function lookupField(table: BackendTable, col: BackendColumn): string {
  const name = fieldName(table, col);
  return col.fk && supportsForeignKey(col) ? `${name}_id` : name;
}

function viewsFile(model: BackendModel, options: BackendOptions): string {
  const singlePkTables = model.tables.filter(table => table.primaryKey.length === 1);
  const compositeTables = model.tables.filter(table => table.primaryKey.length > 1);
  const noPkTables = model.tables.filter(table => table.primaryKey.length === 0);
  const lines = [
    '"""DRF views — one CRUD surface per table."""',
    'from django.shortcuts import get_object_or_404',
    'from rest_framework import generics, viewsets',
    'from rest_framework.decorators import api_view, permission_classes',
    'from rest_framework.permissions import AllowAny',
    'from rest_framework.response import Response',
    '',
    `from .models import ${model.tables.map(table => table.className).join(', ')}`,
    `from .serializers import ${model.tables.map(table => `${table.className}Serializer`).join(', ')}`,
    '',
    '',
    '@api_view(["GET"])',
    '@permission_classes([AllowAny])',
    'def health(request):',
    '    return Response({"status": "ok"})',
    '',
    '',
  ];

  for (const table of singlePkTables) {
    lines.push(`class ${table.className}ViewSet(viewsets.ModelViewSet):`);
    lines.push(`    queryset = ${table.className}.objects.all()`);
    lines.push(`    serializer_class = ${table.className}Serializer`);
    lines.push('');
    lines.push('');
  }

  for (const table of compositeTables) {
    lines.push(`class ${table.className}ListCreateView(generics.ListCreateAPIView):`);
    lines.push(`    queryset = ${table.className}.objects.all()`);
    lines.push(`    serializer_class = ${table.className}Serializer`);
    lines.push('');
    lines.push('');
    lines.push(`class ${table.className}DetailView(generics.RetrieveUpdateDestroyAPIView):`);
    lines.push(`    queryset = ${table.className}.objects.all()`);
    lines.push(`    serializer_class = ${table.className}Serializer`);
    lines.push('');
    lines.push('    def get_object(self):');
    const filters = table.primaryKey.map(col => `${lookupField(table, col)}=self.kwargs[${pyStr(fieldName(table, col))}]`);
    lines.push(`        obj = get_object_or_404(self.get_queryset(), ${filters.join(', ')})`);
    lines.push('        self.check_object_permissions(self.request, obj)');
    lines.push('        return obj');
    lines.push('');
    lines.push('');
  }

  for (const table of noPkTables) {
    lines.push(`class ${table.className}ListCreateView(generics.ListCreateAPIView):`);
    lines.push(`    queryset = ${table.className}.objects.all()`);
    lines.push(`    serializer_class = ${table.className}Serializer`);
    lines.push('');
    lines.push('');
  }

  if (singlePkTables.length === 0 && compositeTables.length === 0 && noPkTables.length === 0) {
    lines.push('# No tables were generated.');
  }
  // `options` stays in the signature for future auth-specific view hooks.
  void options;
  return lines.join('\n').trimEnd() + '\n';
}

function urlsFile(model: BackendModel, options: BackendOptions): string {
  const singlePkTables = model.tables.filter(table => table.primaryKey.length === 1);
  const compositeTables = model.tables.filter(table => table.primaryKey.length > 1);
  const noPkTables = model.tables.filter(table => table.primaryKey.length === 0);
  const lines = [
    '"""API routes: DRF router for single keys, explicit paths for composite keys."""',
    'from django.urls import include, path',
    'from rest_framework.routers import DefaultRouter',
    '',
    'from . import views',
    '',
    'router = DefaultRouter()',
  ];
  for (const table of singlePkTables) {
    const route = table.name.replace(/_/g, '-');
    lines.push(`router.register(r${pyStr(route)}, views.${table.className}ViewSet, basename=${pyStr(route)})`);
  }
  lines.push('');
  lines.push('urlpatterns = [');
  lines.push('    path("health/", views.health, name="health"),');
  lines.push('    path("api/", include(router.urls)),');
  for (const table of compositeTables) {
    const route = table.name.replace(/_/g, '-');
    const params = table.primaryKey.map(col => `<str:${fieldName(table, col)}>`).join('/');
    lines.push(`    path("api/${route}/", views.${table.className}ListCreateView.as_view(), name=${pyStr(`${table.name}_list`)}),`);
    lines.push(`    path("api/${route}/${params}/", views.${table.className}DetailView.as_view(), name=${pyStr(`${table.name}_detail`)}),`);
  }
  for (const table of noPkTables) {
    const route = table.name.replace(/_/g, '-');
    lines.push(`    path("api/${route}/", views.${table.className}ListCreateView.as_view(), name=${pyStr(`${table.name}_list`)}),`);
  }
  if (options.auth && options.mode === 'full') {
    lines.push('    path("api/auth/", include("api.auth_urls")),');
  }
  lines.push(']');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function authFiles(): GeneratedFile[] {
  return [
    {
      path: 'api/auth_urls.py',
      language: 'python',
      content: [
        'from django.urls import path',
        '',
        'from .auth_views import LoginView, LogoutView, MeView, RegisterView',
        '',
        'urlpatterns = [',
        '    path("register/", RegisterView.as_view(), name="register"),',
        '    path("login/", LoginView.as_view(), name="login"),',
        '    path("me/", MeView.as_view(), name="me"),',
        '    path("logout/", LogoutView.as_view(), name="logout"),',
        ']',
        '',
      ].join('\n'),
    },
    {
      path: 'api/auth_views.py',
      language: 'python',
      content: [
        '"""Token auth: register, login, me and logout (DRF TokenAuthentication)."""',
        'from django.contrib.auth import authenticate, get_user_model, password_validation',
        'from django.core.exceptions import ValidationError',
        'from rest_framework import serializers, status',
        'from rest_framework.authtoken.models import Token',
        'from rest_framework.permissions import AllowAny, IsAuthenticated',
        'from rest_framework.response import Response',
        'from rest_framework.views import APIView',
        '',
        'User = get_user_model()',
        '',
        '',
        'class RegisterSerializer(serializers.Serializer):',
        '    email = serializers.EmailField()',
        '    password = serializers.CharField(write_only=True, min_length=8, max_length=128)',
        '',
        '    def validate_email(self, value):',
        '        email = value.strip().lower()',
        '        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():',
        '            raise serializers.ValidationError("Email is already registered")',
        '        return email',
        '',
        '    def validate_password(self, value):',
        '        try:',
        '            password_validation.validate_password(value)',
        '        except ValidationError as exc:',
        '            raise serializers.ValidationError(list(exc.messages)) from exc',
        '        return value',
        '',
        '',
        'class LoginSerializer(serializers.Serializer):',
        '    email = serializers.EmailField()',
        '    password = serializers.CharField(write_only=True)',
        '',
        '',
        'def token_response(user):',
        '    token, _ = Token.objects.get_or_create(user=user)',
        '    return Response({"token": token.key, "token_type": "Token", "user": {"id": user.id, "email": user.email}})',
        '',
        '',
        'class RegisterView(APIView):',
        '    permission_classes = [AllowAny]',
        '',
        '    def post(self, request):',
        '        serializer = RegisterSerializer(data=request.data)',
        '        serializer.is_valid(raise_exception=True)',
        '        email = serializer.validated_data["email"]',
        '        user = User.objects.create_user(username=email, email=email, password=serializer.validated_data["password"])',
        '        return token_response(user)',
        '',
        '',
        'class LoginView(APIView):',
        '    permission_classes = [AllowAny]',
        '',
        '    def post(self, request):',
        '        serializer = LoginSerializer(data=request.data)',
        '        serializer.is_valid(raise_exception=True)',
        '        user = authenticate(request, username=serializer.validated_data["email"].lower(), password=serializer.validated_data["password"])',
        '        if user is None:',
        '            return Response({"detail": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)',
        '        return token_response(user)',
        '',
        '',
        'class MeView(APIView):',
        '    permission_classes = [IsAuthenticated]',
        '',
        '    def get(self, request):',
        '        return Response({"id": request.user.id, "email": request.user.email})',
        '',
        '',
        'class LogoutView(APIView):',
        '    permission_classes = [IsAuthenticated]',
        '',
        '    def post(self, request):',
        '        Token.objects.filter(user=request.user).delete()',
        '        return Response(status=status.HTTP_204_NO_CONTENT)',
        '',
      ].join('\n'),
    },
  ];
}

// ---------------------------------------------------------------------------
// Project configuration
// ---------------------------------------------------------------------------

function settingsFile(options: BackendOptions, projectName: string): string {
  const defaultUrl =
    options.db === 'postgres'
      ? 'postgres://postgres:postgres@localhost:5432/appdb'
      : options.db === 'mysql'
        ? 'mysql://root:root@localhost:3306/appdb'
        : 'sqlite:///./app.db';
  const apps = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'rest_framework',
  ];
  if (options.auth && options.mode === 'full') apps.push('rest_framework.authtoken');
  apps.push('corsheaders', 'api');
  const lines = [
    `"""Django settings for ${projectName}."""`,
    'import os',
    'from pathlib import Path',
    'from urllib.parse import unquote, urlparse',
    '',
    'from dotenv import load_dotenv',
    '',
    'load_dotenv()',
    '',
    'BASE_DIR = Path(__file__).resolve().parent.parent',
    `SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-change-me-${projectName}")`,
    'DEBUG = os.getenv("DJANGO_DEBUG", "1").lower() in {"1", "true", "yes", "on"}',
    'ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]',
    '',
    'INSTALLED_APPS = [',
    ...apps.map(app => `    ${pyStr(app)},`),
    ']',
    '',
    'MIDDLEWARE = [',
    '    "django.middleware.security.SecurityMiddleware",',
    '    "corsheaders.middleware.CorsMiddleware",',
    '    "django.contrib.sessions.middleware.SessionMiddleware",',
    '    "django.middleware.common.CommonMiddleware",',
    '    "django.middleware.csrf.CsrfViewMiddleware",',
    '    "django.contrib.auth.middleware.AuthenticationMiddleware",',
    '    "django.contrib.messages.middleware.MessageMiddleware",',
    ']',
    '',
    'ROOT_URLCONF = "config.urls"',
    'WSGI_APPLICATION = "config.wsgi.application"',
    'ASGI_APPLICATION = "config.asgi.application"',
    '',
    'TEMPLATES = [',
    '    {',
    '        "BACKEND": "django.template.backends.django.DjangoTemplates",',
    '        "DIRS": [],',
    '        "APP_DIRS": True,',
    '        "OPTIONS": {"context_processors": [',
    '            "django.template.context_processors.request",',
    '            "django.contrib.auth.context_processors.auth",',
    '            "django.contrib.messages.context_processors.messages",',
    '        ]},',
    '    },',
    ']',
    '',
    `DATABASE_URL = os.getenv("DATABASE_URL", ${pyStr(defaultUrl)})`,
    '',
    '',
    'def _database_config(url):',
    '    parsed = urlparse(url)',
    '    scheme = parsed.scheme.split("+", 1)[0]',
    '    if scheme == "sqlite":',
    '        name = url.split(":///", 1)[1] if ":///" in url else parsed.path',
    '        return {"ENGINE": "django.db.backends.sqlite3", "NAME": name}',
    '    engines = {',
    '        "postgres": "django.db.backends.postgresql",',
    '        "postgresql": "django.db.backends.postgresql",',
    '        "mysql": "django.db.backends.mysql",',
    '    }',
    '    if scheme not in engines:',
    '        raise ValueError(f"Unsupported DATABASE_URL scheme: {scheme}")',
    '    config = {',
    '        "ENGINE": engines[scheme],',
    '        "NAME": unquote(parsed.path.lstrip("/")),',
    '        "USER": unquote(parsed.username or ""),',
    '        "PASSWORD": unquote(parsed.password or ""),',
    '        "HOST": parsed.hostname or "",',
    '        "PORT": str(parsed.port) if parsed.port else "",',
    '        "CONN_MAX_AGE": 60,',
    '    }',
    '    return config',
    '',
    '',
    'DATABASES = {"default": _database_config(DATABASE_URL)}',
    '',
    'CORS_ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]',
    'CORS_ALLOW_ALL_ORIGINS = "*" in CORS_ALLOWED_ORIGINS',
    '',
    'AUTH_PASSWORD_VALIDATORS = [',
    '    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},',
    '    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},',
    ']',
    '',
    'LANGUAGE_CODE = "en-us"',
    'TIME_ZONE = "UTC"',
    'USE_I18N = True',
    'USE_TZ = True',
    'STATIC_URL = "static/"',
    'DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"',
    '',
  ];
  if (options.mode === 'full') {
    lines.push('REST_FRAMEWORK = {');
    if (options.auth) {
      lines.push('    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.TokenAuthentication"],');
      lines.push('    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],');
    } else {
      lines.push('    "DEFAULT_AUTHENTICATION_CLASSES": [],');
      lines.push('    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],');
    }
    lines.push('    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",');
    lines.push('    "PAGE_SIZE": 50,');
    lines.push('    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",');
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

function exceptionsFile(): string {
  return [
    '"""Map database constraint failures to a stable 409 response."""',
    'from django.db import IntegrityError',
    'from rest_framework.response import Response',
    'from rest_framework.views import exception_handler',
    '',
    '',
    'def api_exception_handler(exc, context):',
    '    response = exception_handler(exc, context)',
    '    if response is not None:',
    '        return response',
    '    if isinstance(exc, IntegrityError):',
    '        return Response({"detail": "Database constraint violated."}, status=409)',
    '    return None',
    '',
  ].join('\n');
}

function managePy(): string {
  return [
    '#!/usr/bin/env python',
    '"""Django management entrypoint."""',
    'import os',
    'import sys',
    '',
    '',
    'def main():',
    '    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")',
    '    from django.core.management import execute_from_command_line',
    '    execute_from_command_line(sys.argv)',
    '',
    '',
    'if __name__ == "__main__":',
    '    main()',
    '',
  ].join('\n');
}

function requirementsFile(options: BackendOptions): string {
  const rows = [
    'Django>=5.2',
    'djangorestframework>=3.15',
    'django-cors-headers>=4.4',
    'python-dotenv>=1.0',
  ];
  if (options.db === 'postgres') rows.push('psycopg[binary]>=3.2');
  if (options.db === 'mysql') rows.push('mysqlclient>=2.2');
  return rows.join('\n') + '\n';
}

function envFile(options: BackendOptions): string {
  const url =
    options.db === 'postgres'
      ? 'postgres://postgres:postgres@localhost:5432/appdb'
      : options.db === 'mysql'
        ? 'mysql://root:root@localhost:3306/appdb'
        : 'sqlite:///./app.db';
  return [
    'DJANGO_SECRET_KEY=change-me-in-production',
    'DJANGO_DEBUG=1',
    'DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1',
    `DATABASE_URL=${url}`,
    'CORS_ALLOWED_ORIGINS=http://localhost:5173',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------

function readme(model: BackendModel, options: BackendOptions, projectName: string, warnings: string[]): string {
  const title = projectName.replace(/-/g, ' ');
  const full = options.mode === 'full';
  const tableRows = model.tables
    .map(table => `| \`${table.name}\` | ${table.columns.length} | ${table.primaryKey.map(pk => `\`${pk.name}\``).join(', ') || '—'} | ${table.belongsTo.length} |`)
    .join('\n');
  const structure = full
    ? `config/
  settings.py        env, database, DRF and CORS setup
  urls.py            root URL configuration
  exceptions.py      409 for database constraint failures
  wsgi.py / asgi.py
api/
  models.py           One managed=False model per table (${model.tables.length} tables)
  serializers.py      DRF validation mirroring SQL constraints
  views.py            ModelViewSet / list-create / composite detail views
  urls.py             API routes${options.auth ? '\n  auth_views.py       Token auth (register/login/me/logout)' : ''}
  migrations/         Empty package — schema lives in ../migrations/001_init.sql
migrations/
  001_init.sql        Source-of-truth DDL for the whole database
requirements.txt
.env.example
manage.py`
    : `config/
  settings.py
  urls.py
api/
  models.py           One managed=False model per table (${model.tables.length} tables)
  migrations/
migrations/
  001_init.sql        Source-of-truth DDL
requirements.txt
.env.example
manage.py`;
  const endpointBlock = full
    ? `## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | \`/api/<table>/\` | Paginated list |
| POST | \`/api/<table>/\` | Create, validates constraints |
| GET | \`/api/<table>/<pk>/\` | Single row for single-key tables |
| PUT/PATCH | \`/api/<table>/<pk>/\` | Update |
| DELETE | \`/api/<table>/<pk>/\` | Delete |

Composite-key tables expose \`/api/<table>/<key1>/<key2>/\` for detail,
update and delete; their list/create endpoint is \`/api/<table>/\`.

Validation mirrors the schema: required fields, \`max_length\`, e-mail format,
unique columns, foreign keys and database \`CHECK\` constraints. A database
constraint failure is returned as **409** by \`config/exceptions.py\`.`
    : 'This is a models-only project: import `api.models` from your own Django app.';
  const authBlock = options.auth && full
    ? `## Authentication

\`POST /api/auth/register/\` and \`POST /api/auth/login/\` return
\`{ "token": "...", "token_type": "Token" }\`. Send it as:

\`\`\`
Authorization: Token <token>
\`\`\`

\`GET /api/auth/me/\` returns the current user; \`POST /api/auth/logout/\` revokes
the token. All business endpoints require authentication.`
    : '';
  const warningsList = [...model.warnings, ...warnings, ...(options.extraWarnings ?? [])];
  return `# ${title}

Generated by Schema Studio — **${frameworkLabel('django', options.db)}**${full ? '' : ' · models-only project'}.

## قرار التوجيه / Routing decision

- **AR:** ${options.routingReason === 'manual' ? 'اختيار يدوي من المستخدم — Django + DRF.' : 'توجيه تلقائي إلى Django + DRF.'}
- **EN:** ${options.routingReason === 'manual' ? 'Manual choice by the user — Django + DRF.' : 'Automatic routing to Django + DRF.'}

## العربية — نظرة سريعة

حزمة Django جاهزة تحتوي نموذج ORM لكل جدول، ومخططات DRF للتحقق،
وراوتر CRUD، وإعدادات قاعدة البيانات والتوثيق. ملف \`migrations/001_init.sql\`
هو مصدر الحقيقة للسكيما؛ لذلك كل النماذج \`managed = False\` ولا يعيد Django
إنشاء الجداول أو تغييرها.

> **مهم:** طبّق \`migrations/001_init.sql\` أولاً. Django لا ينشئ جداول العمل
> لأنه لا يملك ملكية السكيما؛ \`manage.py migrate\` ينشئ فقط جداول
> المصادقة المدمجة عند تفعيل Auth.

## Structure

\`\`\`
${structure}
\`\`\`

## Quick start

\`\`\`bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env

# 1) create the database and apply the generated schema
# PostgreSQL:
createdb appdb && psql appdb -f migrations/001_init.sql
# MySQL:
mysql -u root -p -e "CREATE DATABASE appdb" && mysql -u root -p appdb < migrations/001_init.sql
# SQLite:
sqlite3 app.db < migrations/001_init.sql

# 2) auth tables (only when auth is enabled)
${options.auth ? 'python manage.py migrate' : '# python manage.py migrate  (no auth enabled)'}

# 3) run
python manage.py runserver
\`\`\`

Open http://127.0.0.1:8000/api/ for the DRF browsable API.
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '\nAfter the SQL schema exists: `python manage.py seed_demo`.\n' : ''}

## Tables

| Table | Columns | Primary key | Relations |
|---|---|---|---|
${tableRows}

${endpointBlock}

${authBlock}

## Django-specific notes

- **Schema ownership:** business models are \`managed = False\`; edit
  \`migrations/001_init.sql\` (or create a new SQL migration) and keep model
  fields in sync.
- **Composite keys:** Django 5.2+ supports \`CompositePrimaryKey\`; detail
  routes use one path segment per key. Django cannot create a \`ForeignKey\`
  to a model with a composite primary key, so such columns are emitted as
  plain database columns with a warning.
- **Tables without a primary key:** the first column becomes the ORM
  identity. The database still may not enforce uniqueness; add a real key.
- **CHECK constraints, indexes, views and triggers:** the SQL file is
  authoritative. Model \`Meta\` mirrors ordinary indexes and unique indexes,
  but CHECK expressions and database views/triggers remain in SQL.
- **Authentication:** DRF \`TokenAuthentication\` with \`Authorization: Token ...\`.
  Passwords use Django's validators and hashing.

## ملاحظات عربية

- المشروع مولّد من ${model.baseTables.length} جدولاً أصلياً و${model.source.relationships.length} علاقة معلنة.
- ${model.tables.length - model.baseTables.length} جدول ربط أُنشئ تلقائياً لعلاقات N-M.
${warningsList.length ? warningsList.map(warning => `- ⚠ ${warning}`).join('\n') : '- لا توجد تحذيرات على السكيما.'}
- كل ملف يحمل رأس توليد يتضمن رقم العملية وتاريخها، وMANIFEST.json يجرد الملفات ومصدرها.

## Notes

- Generated from ${model.baseTables.length} base tables and ${model.source.relationships.length} declared relations.
- ${model.tables.length - model.baseTables.length} junction table(s) were synthesised for N-M relations.
${warningsList.length ? warningsList.map(warning => `- ⚠ ${warning}`).join('\n') : '- No schema warnings.'}
- Keep this project in version control and apply schema changes through new SQL migration files.
`;
}

// ---------------------------------------------------------------------------
// Demo seed command
// ---------------------------------------------------------------------------

function pyLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  return JSON.stringify(value);
}

function seedCommand(model: BackendModel, options: BackendOptions): GeneratedFile | null {
  const rows = options.aiSeedRows ?? {};
  const tables = model.tables.filter(table => (rows[table.name] ?? []).length > 0);
  if (tables.length === 0) return null;
  const blocks: string[] = [];
  for (const table of tables) {
    const allowed = new Map(table.columns.map(col => [col.name, col]));
    const entries = (rows[table.name] ?? [])
      .map(row => {
        const mapped: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries(row)) {
          const col = allowed.get(key);
          if (!col || col.autoIncrement) continue;
          const field = col.fk && supportsForeignKey(col)
            ? `${fieldName(table, col)}_id`
            : fieldName(table, col);
          mapped[field] = value;
        }
        return mapped;
      })
      .filter(row => Object.keys(row).length > 0)
      .slice(0, 25);
    const rowText = entries
      .map(row => `        {${Object.entries(row).map(([key, value]) => `${pyStr(key)}: ${pyLiteral(value)}`).join(', ')}},`)
      .join('\n');
    blocks.push(`    ${pyStr(table.name)}: [\n${rowText}\n    ],`);
  }
  return {
    path: 'api/management/commands/seed_demo.py',
    language: 'python',
    source: 'ai',
    content: [
      '"""Optional AI-generated demo rows — validated as plain data before insertion."""',
      'from django.apps import apps',
      'from django.core.management.base import BaseCommand',
      '',
      '',
      '_ROWS = {',
      ...blocks,
      '}',
      '',
      '_MODELS = {',
      ...tables.map(table => `    ${pyStr(table.name)}: ${pyStr(table.className)},`),
      '}',
      '',
      '',
      'class Command(BaseCommand):',
      '    help = "Insert the optional AI demo rows into the existing SQL schema."',
      '',
      '    def handle(self, *args, **options):',
      '        inserted = 0',
      '        for table_name, rows in _ROWS.items():',
      '            model = apps.get_model("api", _MODELS[table_name])',
      '            for row in rows:',
      '                model.objects.create(**row)',
      '                inserted += 1',
      '        self.stdout.write(f"Inserted {inserted} demo row(s).")',
      '',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

export function generateDjango(model: BackendModel, options: BackendOptions, projectName: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const full = options.mode === 'full';
  const models = modelsFile(model);
  const frameworkWarnings = [...models.warnings];

  files.push({ path: 'manage.py', language: 'python', content: managePy() });
  files.push({ path: 'config/__init__.py', language: 'python', content: '' });
  files.push({ path: 'config/settings.py', language: 'python', content: settingsFile(options, projectName) });
  files.push({
    path: 'config/urls.py',
    language: 'python',
    content: [
      'from django.urls import include, path',
      '',
      'urlpatterns = [',
      '    path("", include("api.urls")),',
      ']',
      '',
    ].join('\n'),
  });
  files.push({
    path: 'config/wsgi.py',
    language: 'python',
    content: [
      'import os',
      '',
      'from django.core.wsgi import get_wsgi_application',
      '',
      'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")',
      'application = get_wsgi_application()',
      '',
    ].join('\n'),
  });
  files.push({
    path: 'config/asgi.py',
    language: 'python',
    content: [
      'import os',
      '',
      'from django.core.asgi import get_asgi_application',
      '',
      'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")',
      'application = get_asgi_application()',
      '',
    ].join('\n'),
  });
  files.push({ path: 'api/__init__.py', language: 'python', content: '' });
  files.push({
    path: 'api/apps.py',
    language: 'python',
    content: [
      'from django.apps import AppConfig',
      '',
      '',
      'class ApiConfig(AppConfig):',
      '    default_auto_field = "django.db.models.BigAutoField"',
      '    name = "api"',
      '',
    ].join('\n'),
  });
  files.push({ path: 'api/models.py', language: 'python', content: models.content });
  files.push({ path: 'api/migrations/__init__.py', language: 'python', content: '' });

  if (full) {
    files.push({ path: 'api/serializers.py', language: 'python', content: serializersFile(model) });
    files.push({ path: 'api/views.py', language: 'python', content: viewsFile(model, options) });
    files.push({ path: 'api/urls.py', language: 'python', content: urlsFile(model, options) });
    files.push({ path: 'config/exceptions.py', language: 'python', content: exceptionsFile() });
    if (options.auth) files.push(...authFiles());
  } else {
    files.push({
      path: 'api/urls.py',
      language: 'python',
      content: [
        '"""Models-only project: no API routes are generated."""',
        'urlpatterns = []',
        '',
      ].join('\n'),
    });
  }

  const ddl = generateDdl(model.source, options.db, {
    dropIfExists: false,
    createJunctionTables: true,
    deferCyclicForeignKeys: true,
  });
  files.push({
    path: 'migrations/001_init.sql',
    language: 'sql',
    content: `-- Schema generated by Schema Studio (${options.db}) on ${new Date().toISOString().slice(0, 10)}\n\n${ddl.code}\n`,
  });

  const seed = seedCommand(model, options);
  if (seed) {
    files.push({ path: 'api/management/__init__.py', language: 'python', content: '' });
    files.push({ path: 'api/management/commands/__init__.py', language: 'python', content: '' });
    files.push(seed);
  }

  files.push({ path: 'requirements.txt', language: 'text', content: requirementsFile(options) });
  files.push({ path: '.env.example', language: 'env', content: envFile(options) });
  files.push({ path: 'README.md', language: 'markdown', content: readme(model, options, projectName, frameworkWarnings) });
  return files;
}
