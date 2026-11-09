import type { BackendColumn, BackendModel, BackendTable, BackendOptions } from './model';
import { frameworkLabel, looksLikeEmail, singularTableName } from './model';
import type { GeneratedFile } from './types';
import { generateDdl } from '../ddlGenerator';

const pyStr = (value: string): string => JSON.stringify(value);

function pyType(col: BackendColumn): string {
  switch (col.kind) {
    case 'int':
    case 'bigint':
    case 'smallint':
      return 'int';
    case 'float':
      return 'float';
    case 'decimal':
      return 'Decimal';
    case 'bool':
      return 'bool';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'time':
      return 'time';
    case 'json':
      return 'dict[str, Any]';
    case 'binary':
      return 'bytes';
    default:
      return 'str';
  }
}

function pyPathType(col: BackendColumn): string {
  return col.kind === 'int' || col.kind === 'bigint' || col.kind === 'smallint' ? 'int' : 'str';
}

function saType(col: BackendColumn, db: BackendOptions['db']): string {
  switch (col.kind) {
    case 'int':
      return 'Integer';
    case 'bigint':
      // SQLite لا يصعد تلقائياً إلا لـINTEGER PRIMARY KEY — نستخدم variant آمناً
      return db === 'sqlite' ? 'BigInteger().with_variant(Integer, "sqlite")' : 'BigInteger';
    case 'smallint':
      return 'SmallInteger';
    case 'decimal':
      return col.precision !== undefined
        ? `Numeric(${col.precision}${col.scale !== undefined ? `, ${col.scale}` : ''})`
        : 'Numeric';
    case 'float':
      return 'Float';
    case 'bool':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'datetime':
      return 'DateTime';
    case 'time':
      return 'Time';
    case 'json':
      return 'JSON';
    case 'binary':
      return 'LargeBinary';
    case 'text':
    case 'unknown':
      return 'Text';
    case 'uuid':
      return 'String(36)';
    case 'string':
      return `String(${col.length ?? 255})`;
    default:
      return 'Text';
  }
}

function fieldConstraint(col: BackendColumn): string | null {
  if ((col.kind === 'string' || col.kind === 'text') && col.length !== undefined) {
    return `max_length=${col.length}`;
  }
  return null;
}

function schemaField(col: BackendColumn, mode: 'create' | 'update' | 'out'): string {
  const annotation =
    mode !== 'out' && col.kind === 'string' && looksLikeEmail(col.name) ? 'EmailStr' : pyType(col);
  const optional = mode === 'update' || col.nullable || (mode === 'create' && col.defaultValue !== undefined && col.defaultValue !== '');
  const typeText = optional ? `${annotation} | None` : annotation;
  const constraint = fieldConstraint(col);
  const field = constraint ? (optional ? `Field(default=None, ${constraint})` : `Field(${constraint})`) : optional ? 'None' : '';
  return `    ${col.codeName}: ${typeText}${field ? ` = ${field}` : ''}`;
}

function excludeSelfExpression(table: BackendTable): string {
  const cls = table.className;
  if (table.primaryKey.length === 1) {
    return `${cls}.${table.primaryKey[0].codeName} != item.${table.primaryKey[0].codeName}`;
  }
  const conj = table.primaryKey
    .map(pk => `(${cls}.${pk.codeName} == item.${pk.codeName})`)
    .join(' & ');
  return `~(${conj})`;
}

function pkLookup(table: BackendTable, args: string): string {
  const cls = table.className;
  if (table.primaryKey.length === 1) return `db.get(${cls}, ${args})`;
  const where = table.primaryKey.map(pk => `${cls}.${pk.codeName} == ${pk.codeName}`).join(', ');
  return `db.scalar(select(${cls}).where(${where}))`;
}

function listOrder(table: BackendTable): string {
  const cls = table.className;
  const first = table.primaryKey[0];
  if (!first) return '';
  if (table.primaryKey.length > 1) {
    return `.order_by(${table.primaryKey.map(pk => `${cls}.${pk.codeName}.asc()`).join(', ')})`;
  }
  const numeric = first.kind === 'int' || first.kind === 'bigint' || first.kind === 'smallint';
  return `.order_by(${cls}.${first.codeName}.${numeric ? 'desc' : 'asc'}())`;
}

function uniqueChecks(table: BackendTable, mode: 'create' | 'update'): string[] {
  const lines: string[] = [];
  const cls = table.className;
  for (const col of table.columns) {
    if (!col.unique || col.primaryKey) continue;
    const access = `data.get(${pyStr(col.codeName)})`;
    const conditions = [`${cls}.${col.codeName} == ${access}`];
    if (mode === 'update') conditions.push(excludeSelfExpression(table));
    lines.push(`    if ${access} is not None:`);
    lines.push(`        conflict = db.scalar(select(${cls}).where(${conditions.join(', ')}))`);
    lines.push('        if conflict is not None:');
    lines.push(
      `            raise HTTPException(status_code=409, detail=${pyStr(`${col.name} must be unique`)})`
    );
  }
  return lines;
}

function fkChecks(table: BackendTable, mode: 'create' | 'update'): string[] {
  void mode;
  const lines: string[] = [];
  for (const col of table.columns) {
    if (!col.fk || col.primaryKey) continue;
    const parent = col.fk.parent;
    if (parent.primaryKey.length !== 1) continue;
    const access = `data.get(${pyStr(col.codeName)})`;
    lines.push(`    if ${access} is not None and db.get(${parent.className}, ${access}) is None:`);
    lines.push(
      `        raise HTTPException(status_code=400, detail=${pyStr(`${col.name} references a missing ${parent.className}`)})`
    );
  }
  return lines;
}

function modelsFile(model: BackendModel, db: BackendOptions['db']): string {
  const lines: string[] = [
    '"""SQLAlchemy ORM models — generated from the schema, one class per table."""',
    'from __future__ import annotations',
    '',
    'from datetime import date, datetime, time',
    'from decimal import Decimal',
    'from typing import Any, Optional',
    '',
    'from sqlalchemy import (',
    '    BigInteger,',
    '    Boolean,',
    '    CheckConstraint,',
    '    Date,',
    '    DateTime,',
    '    Float,',
    '    ForeignKey,',
    '    Index,',
    '    Integer,',
    '    JSON,',
    '    LargeBinary,',
    '    Numeric,',
    '    SmallInteger,',
    '    String,',
    '    Text,',
    '    Time,',
    '    text,',
    ')',
    'from sqlalchemy.orm import Mapped, mapped_column, relationship',
    '',
    'from .database import Base',
    '',
    '',
  ];

  for (const table of model.tables) {
    lines.push(`class ${table.className}(Base):`);
    lines.push(`    __tablename__ = ${pyStr(table.name)}`);

    const checks = table.columns.filter(col => col.check && col.check.trim() !== '');
    const tableChecks = (table.tableChecks ?? []).filter(check => (check || '').trim() !== '');
    const usedIndexes = new Set<string>();
    const indexLines: string[] = [];
    for (const index of table.indexes ?? []) {
      const columns = index.columns.filter(column => table.columns.some(col => col.name === column));
      if (columns.length === 0) continue;
      const single = columns.length === 1 ? table.columns.find(col => col.name === columns[0]) : undefined;
      // unique=True أو index=True على العمود يغطي الفهر المفرد مسبقاً
      if (single && ((index.unique && single.unique) || (!index.unique && single.fk && !single.primaryKey))) continue;
      let name = index.name || `ix_${table.name}_${columns.join('_')}`;
      let n = 2;
      while (usedIndexes.has(name.toLowerCase())) name = `${index.name}_${n++}`;
      usedIndexes.add(name.toLowerCase());
      indexLines.push(
        `        Index(${pyStr(name)}, ${columns.map(pyStr).join(', ')}${index.unique ? ', unique=True' : ''}),`
      );
    }
    if (checks.length > 0 || tableChecks.length > 0 || indexLines.length > 0) {
      lines.push('');
      lines.push('    __table_args__ = (');
      for (const col of checks) {
        const name = `ck_${table.name}_${col.name}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
        lines.push(`        CheckConstraint(${pyStr(col.check!.trim())}, name=${pyStr(name)}),`);
      }
      tableChecks.forEach((check, index) => {
        const name = `ck_${table.name}_table_${index + 1}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
        lines.push(`        CheckConstraint(${pyStr(check.trim())}, name=${pyStr(name)}),`);
      });
      lines.push(...indexLines);
      lines.push('    )');
    }

    lines.push('');
    const compositePk = table.primaryKey.length > 1;
    for (const col of table.columns) {
      // ForeignKey يجب أن يبقى positional قبل أي keyword (قاعدة بايثون)
      const args: string[] = [saType(col, db)];
      if (col.fk) {
        args.push(
          `ForeignKey(${pyStr(`${col.fk.parent.name}.${col.fk.parentColumn.name}`)}${
            col.fk.onDelete ? `, ondelete=${pyStr(col.fk.onDelete)}` : ''
          })`
        );
      }
      if (col.primaryKey) {
        args.push('primary_key=True');
        if (compositePk) args.push('autoincrement=False');
      }
      if (col.autoIncrement) {
        args.push('autoincrement=True');
      }
      if (!col.primaryKey) {
        args.push(col.nullable ? 'nullable=True' : 'nullable=False');
      }
      if (col.unique) args.push('unique=True');
      if (col.fk && !col.primaryKey) args.push('index=True');
      if (col.defaultValue && col.defaultValue.trim() !== '' && !col.autoIncrement) {
        args.push(`server_default=text(${pyStr(col.defaultValue.trim())})`);
      }
      const annotation = `Mapped[${col.nullable ? 'Optional[' : ''}${pyType(col)}${col.nullable ? ']' : ''}]`;
      lines.push(`    ${col.codeName}: ${annotation} = mapped_column(${args.join(', ')})`);
    }

    for (const rel of table.belongsTo) {
      const foreignKeys = rel.ambiguous
        ? `, foreign_keys=${pyStr(`${table.className}.${rel.fkColumn.codeName}`)}`
        : '';
      lines.push(
        `    ${rel.attr}: Mapped[Optional["${rel.parent.className}"]] = relationship(back_populates=${pyStr(rel.backAttr)}${foreignKeys})`
      );
    }
    for (const rel of table.hasMany) {
      const foreignKeys = rel.ambiguous
        ? `, foreign_keys=${pyStr(`${rel.child.className}.${rel.fkColumn.codeName}`)}`
        : '';
      // passive_deletes يترك قاعدة البيانات تفرض القيد بدل محاولة تصفير مفاتيح الأبناء
      lines.push(
        `    ${rel.attr}: Mapped[list["${rel.child.className}"]] = relationship(back_populates=${pyStr(rel.backAttr)}${foreignKeys}, passive_deletes=True)`
      );
    }
    lines.push('');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function schemasFile(model: BackendModel): string {
  const usesEmail = model.tables.some(t => t.columns.some(c => c.kind === 'string' && looksLikeEmail(c.name)));
  const usesField = model.tables.some(t => t.columns.some(c => fieldConstraint(c) !== null));
  const usesAny = model.tables.some(t => t.columns.some(c => c.kind === 'json'));
  const usesDecimal = model.tables.some(t => t.columns.some(c => c.kind === 'decimal'));
  const usesDate = model.tables.some(t => t.columns.some(c => c.kind === 'date' || c.kind === 'datetime' || c.kind === 'time'));

  const pydanticImports = ['BaseModel', 'ConfigDict'];
  if (usesEmail) pydanticImports.push('EmailStr');
  if (usesField) pydanticImports.push('Field');

  const lines: string[] = ['"""Pydantic request/response schemas — validation mirrors the SQL constraints."""'];
  if (usesDate) lines.push('from datetime import date, datetime, time');
  if (usesDecimal) lines.push('from decimal import Decimal');
  if (usesAny) lines.push('from typing import Any');
  lines.push('');
  lines.push(`from pydantic import ${pydanticImports.join(', ')}`);
  lines.push('');
  lines.push('');

  for (const table of model.tables) {
    const autoPkNames = new Set(table.columns.filter(c => c.autoIncrement).map(c => c.codeName));
    const createColumns = table.columns.filter(c => !autoPkNames.has(c.codeName));
    const baseName = `${table.className}Base`;
    lines.push(`class ${baseName}(BaseModel):`);
    lines.push(`    """Fields accepted when creating a ${table.name} row."""`);
    if (createColumns.length === 0) lines.push('    pass');
    else for (const col of createColumns) lines.push(schemaField(col, 'create'));
    lines.push('');
    lines.push('');
    lines.push(`class ${table.className}Create(${baseName}):`);
    lines.push('    pass');
    lines.push('');
    lines.push('');
    lines.push(`class ${table.className}Update(BaseModel):`);
    lines.push('    """Partial update — every field is optional."""');
    const updateColumns = table.columns.filter(c => !c.primaryKey);
    if (updateColumns.length === 0) lines.push('    pass');
    else for (const col of updateColumns) lines.push(schemaField(col, 'update'));
    lines.push('');
    lines.push('');
    lines.push(`class ${table.className}Out(BaseModel):`);
    lines.push(`    """Serialized ${table.name} row returned by the API."""`);
    for (const col of table.columns) lines.push(schemaField(col, 'out'));
    lines.push(`    model_config = ConfigDict(from_attributes=True)`);
    lines.push('');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function routerFile(table: BackendTable, options: BackendOptions): string {
  const cls = table.className;
  const module = table.moduleName;
  const singularModule = singularTableName(table.moduleName);
  const routePath = table.name.replace(/_/g, '-');
  const hasPk = table.primaryKey.length > 0;
  const pathParams = table.primaryKey.map(pk => `{${pk.codeName}}`).join('/');
  const path = pathParams ? `/${pathParams}` : '';
  const functionParams = table.primaryKey.map(pk => `${pk.codeName}: ${pyPathType(pk)}`).join(', ');
  const pkArgs = table.primaryKey.map(pk => pk.codeName).join(', ');
  const parentClasses = Array.from(
    new Set(table.columns.filter(c => c.fk && !c.primaryKey).map(c => c.fk!.parent.className))
  );

  const imports: string[] = [
    'from fastapi import APIRouter, Depends, HTTPException, Query, Response, status',
    'from sqlalchemy import select',
    'from sqlalchemy.exc import IntegrityError',
    'from sqlalchemy.orm import Session',
    '',
    'from ..database import get_db',
  ];
  if (options.auth) imports.push('from ..dependencies import get_current_user');
  imports.push(`from ..models import ${[cls, ...parentClasses].join(', ')}`);
  imports.push(`from ..schemas import ${cls}Create, ${cls}Out, ${cls}Update`);

  const lines: string[] = [
    `"""CRUD endpoints for ${table.name}."""`,
    ...imports,
    '',
    `router = APIRouter(prefix="/api/${routePath}", tags=[${pyStr(table.name)}]${options.auth ? ', dependencies=[Depends(get_current_user)]' : ''})`,
    '',
    '',
    `@router.get("", response_model=list[${cls}Out])`,
    `def list_${module}(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):`,
    `    stmt = select(${cls})${listOrder(table)}.offset(skip).limit(limit)`,
    '    return db.scalars(stmt).all()',
    '',
    '',
    `@router.post("", response_model=${cls}Out, status_code=status.HTTP_201_CREATED)`,
    `def create_${singularModule}(payload: ${cls}Create, db: Session = Depends(get_db)):`,
    '    data = payload.model_dump(exclude_unset=True)',
    ...uniqueChecks(table, 'create'),
    ...fkChecks(table, 'create'),
    `    item = ${cls}(**data)`,
    '    db.add(item)',
    '    try:',
    '        db.commit()',
    '    except IntegrityError as exc:',
    '        db.rollback()',
    `        raise HTTPException(status_code=409, detail=${pyStr('A database constraint was violated')}) from exc`,
    ...(hasPk ? ['    db.refresh(item)'] : []),
    '    return item',
    '',
  ];

  if (hasPk) {
    lines.push(
      '',
      `@router.get("${path}", response_model=${cls}Out)`,
      `def get_${singularModule}(${functionParams}, db: Session = Depends(get_db)):`,
      `    item = ${pkLookup(table, pkArgs)}`,
      '    if item is None:',
      `        raise HTTPException(status_code=404, detail=${pyStr(`${cls} not found`)})`,
      '    return item',
      '',
      '',
      `@router.put("${path}", response_model=${cls}Out)`,
      `def update_${singularModule}(${functionParams}, payload: ${cls}Update, db: Session = Depends(get_db)):`,
      `    item = ${pkLookup(table, pkArgs)}`,
      '    if item is None:',
      `        raise HTTPException(status_code=404, detail=${pyStr(`${cls} not found`)})`,
      '    data = payload.model_dump(exclude_unset=True)',
      ...uniqueChecks(table, 'update'),
      ...fkChecks(table, 'update'),
      '    for field, value in data.items():',
      '        setattr(item, field, value)',
      '    try:',
      '        db.commit()',
      '    except IntegrityError as exc:',
      '        db.rollback()',
      `        raise HTTPException(status_code=409, detail=${pyStr('A database constraint was violated')}) from exc`,
      '    db.refresh(item)',
      '    return item',
      '',
      '',
      `@router.delete("${path}", status_code=status.HTTP_204_NO_CONTENT)`,
      `def delete_${singularModule}(${functionParams}, db: Session = Depends(get_db)):`,
      `    item = ${pkLookup(table, pkArgs)}`,
      '    if item is None:',
      `        raise HTTPException(status_code=404, detail=${pyStr(`${cls} not found`)})`,
      '    db.delete(item)',
      '    try:',
      '        db.commit()',
      '    except IntegrityError as exc:',
      '        db.rollback()',
      `        raise HTTPException(status_code=409, detail=${pyStr('Delete blocked by related records')}) from exc`,
      '    return Response(status_code=status.HTTP_204_NO_CONTENT)',
      ''
    );
  }
  return lines.join('\n');
}

function databaseFile(options: BackendOptions): string {
  const defaultUrl =
    options.db === 'postgres'
      ? 'postgresql+psycopg://postgres:postgres@localhost:5432/appdb'
      : options.db === 'mysql'
        ? 'mysql+pymysql://root:root@localhost:3306/appdb'
        : 'sqlite:///./app.db';
  return [
    '"""Database engine, session factory and declarative base."""',
    'import os',
    '',
    'from dotenv import load_dotenv',
    'from sqlalchemy import create_engine, event',
    'from sqlalchemy.orm import DeclarativeBase, sessionmaker',
    '',
    'load_dotenv()',
    '',
    `DATABASE_URL = os.getenv("DATABASE_URL", ${JSON.stringify(defaultUrl)})`,
    'connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}',
    '',
    'engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)',
    '',
    '',
    '@event.listens_for(engine, "connect")',
    'def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):',
    '    """SQLite يترك قيود FK معطّلة افتراضياً — نفعّلها لكل اتصال."""',
    '    if engine.dialect.name == "sqlite":',
    '        cursor = dbapi_connection.cursor()',
    '        cursor.execute("PRAGMA foreign_keys=ON")',
    '        cursor.close()',
    '',
    '',
    'SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)',
    '',
    '',
    'class Base(DeclarativeBase):',
    '    pass',
    '',
    '',
    'def get_db():',
    '    db = SessionLocal()',
    '    try:',
    '        yield db',
    '    finally:',
    '        db.close()',
    '',
  ].join('\n');
}

function mainFile(projectTitle: string, model: BackendModel, options: BackendOptions): string {
  const modules = options.mode === 'full' ? model.tables.map(t => t.moduleName) : [];
  const imports = [
    'import os',
    'from contextlib import asynccontextmanager',
    '',
    'from fastapi import FastAPI',
    'from fastapi.middleware.cors import CORSMiddleware',
    '',
    'from .database import Base, engine',
  ];
  if (options.auth && options.mode === 'full') {
    imports.push('from . import auth_models  # noqa: F401  (registers auth tables)');
    imports.push(`from .routers import ${[...modules, 'auth'].join(', ')}`);
  } else if (modules.length > 0) {
    imports.push(`from .routers import ${modules.join(', ')}`);
  }

  const includes = [...modules, ...(options.auth && options.mode === 'full' ? ['auth'] : [])].map(
    m => `app.include_router(${m}.router)`
  );
  return [
    `"""${projectTitle} — FastAPI application entrypoint."""`,
    ...imports,
    '',
    '',
    '@asynccontextmanager',
    'async def lifespan(_app: FastAPI):',
    '    if os.getenv("AUTO_CREATE_TABLES", "1") == "1":',
    '        Base.metadata.create_all(bind=engine)',
    '    yield',
    '',
    '',
    `app = FastAPI(title=${pyStr(projectTitle)}, version="1.0.0", lifespan=lifespan)`,
    '',
    'origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]',
    'app.add_middleware(',
    '    CORSMiddleware,',
    '    allow_origins=origins or ["*"],',
    '    allow_credentials=origins != ["*"],',
    '    allow_methods=["*"],',
    '    allow_headers=["*"],',
    ')',
    '',
    ...includes,
    '',
    '',
    '@app.get("/health")',
    'def health():',
    '    return {"status": "ok"}',
    '',
  ].join('\n');
}

function requirementsFile(options: BackendOptions): string {
  const rows = [
    'fastapi>=0.115',
    'uvicorn[standard]>=0.30',
    'SQLAlchemy>=2.0',
    'pydantic>=2.7',
    'python-dotenv>=1.0',
  ];
  if (options.db === 'postgres') rows.push('psycopg[binary]>=3.2');
  if (options.db === 'mysql') rows.push('PyMySQL>=1.1');
  rows.push('email-validator>=2.1');
  return rows.join('\n') + '\n';
}

function envFile(options: BackendOptions): string {
  const url =
    options.db === 'postgres'
      ? 'postgresql+psycopg://postgres:postgres@localhost:5432/appdb'
      : options.db === 'mysql'
        ? 'mysql+pymysql://root:root@localhost:3306/appdb'
        : 'sqlite:///./app.db';
  return [
    `DATABASE_URL=${url}`,
    'CORS_ORIGINS=http://localhost:5173',
    'AUTO_CREATE_TABLES=1',
    'AUTH_TOKEN_TTL_DAYS=7',
    '',
  ].join('\n');
}

function authFiles(options: BackendOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: 'app/auth_models.py',
    language: 'python',
    content: [
      '"""Authentication tables — kept separate from the business schema."""',
      'from __future__ import annotations',
      '',
      'from datetime import datetime',
      '',
      'from sqlalchemy import DateTime, ForeignKey, Integer, String, func',
      'from sqlalchemy.orm import Mapped, mapped_column',
      '',
      'from .database import Base',
      '',
      '',
      'class AuthUser(Base):',
      '    __tablename__ = "auth_users"',
      '',
      '    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)',
      '    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)',
      '    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)',
      '    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)',
      '',
      '',
      'class AuthToken(Base):',
      '    __tablename__ = "auth_tokens"',
      '',
    '    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)',
    '    user_id: Mapped[int] = mapped_column(',
      '        ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True',
      '    )',
      '    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)',
      '    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)',
      '    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)',
      '',
    ].join('\n'),
  });

  files.push({
    path: 'app/security.py',
    language: 'python',
    content: [
      '"""Password hashing (PBKDF2-SHA256) and opaque API tokens — stdlib only."""',
      'import hashlib',
      'import hmac',
      'import secrets',
      '',
      '_ITERATIONS = 390_000',
      '',
      '',
      'def hash_password(password: str) -> str:',
      '    salt = secrets.token_hex(16)',
      '    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS)',
      '    return "pbkdf2_sha256$" + str(_ITERATIONS) + "$" + salt + "$" + digest.hex()',
      '',
      '',
      'def verify_password(password: str, stored: str) -> bool:',
      '    try:',
      '        algorithm, iterations, salt, expected = stored.split("$", 3)',
      '    except ValueError:',
      '        return False',
      '    if algorithm != "pbkdf2_sha256":',
      '        return False',
      '    try:',
      '        rounds = int(iterations)',
      '    except ValueError:',
      '        return False',
      '    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)',
      '    return hmac.compare_digest(digest.hex(), expected)',
      '',
      '',
      'def new_token() -> tuple[str, str]:',
      '    """Returns (raw token, sha256 digest to store)."""',
      '    raw = secrets.token_urlsafe(32)',
      '    return raw, token_digest(raw)',
      '',
      '',
      'def token_digest(raw: str) -> str:',
      '    return hashlib.sha256(raw.encode("utf-8")).hexdigest()',
      '',
    ].join('\n'),
  });

  files.push({
    path: 'app/dependencies.py',
    language: 'python',
    content: [
      '"""Shared FastAPI dependencies."""',
      'from datetime import datetime',
      'from typing import Optional',
      '',
      'from fastapi import Depends, HTTPException, status',
      'from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer',
      'from sqlalchemy import select',
      'from sqlalchemy.orm import Session',
      '',
      'from .auth_models import AuthToken, AuthUser',
      'from .database import get_db',
      'from .security import token_digest',
      '',
      'bearer_scheme = HTTPBearer(auto_error=False)',
      '',
      '',
      'def get_current_user(',
      '    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),',
      '    db: Session = Depends(get_db),',
      ') -> AuthUser:',
      '    if credentials is None:',
      '        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")',
      '    row = db.scalar(',
      '        select(AuthToken).where(',
      '            AuthToken.token_hash == token_digest(credentials.credentials),',
      '            AuthToken.expires_at > datetime.utcnow(),',
      '        )',
      '    )',
      '    if row is None:',
      '        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")',
      '    user = db.get(AuthUser, row.user_id)',
      '    if user is None:',
      '        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")',
      '    return user',
      '',
    ].join('\n'),
  });

  files.push({
    path: 'app/routers/auth.py',
    language: 'python',
    content: [
      '"""Register / login / me / logout endpoints backed by opaque bearer tokens."""',
      'import os',
      'from datetime import datetime, timedelta',
      '',
      'from fastapi import APIRouter, Depends, HTTPException, Response, status',
      'from pydantic import BaseModel, ConfigDict, EmailStr, Field',
      'from sqlalchemy import delete, select',
      'from sqlalchemy.orm import Session',
      '',
      'from ..auth_models import AuthToken, AuthUser',
      'from ..database import get_db',
      'from ..dependencies import get_current_user',
      'from ..security import hash_password, new_token, verify_password',
      '',
      'router = APIRouter(prefix="/api/auth", tags=["auth"])',
      'TOKEN_TTL_DAYS = int(os.getenv("AUTH_TOKEN_TTL_DAYS", "7"))',
      '',
      '',
      'class RegisterPayload(BaseModel):',
      '    email: EmailStr',
      '    password: str = Field(min_length=8, max_length=128)',
      '',
      '',
      'class LoginPayload(BaseModel):',
      '    email: EmailStr',
      '    password: str',
      '',
      '',
      'class TokenResponse(BaseModel):',
      '    token: str',
      '    token_type: str = "bearer"',
      '    expires_at: datetime',
      '',
      '',
      'class UserOut(BaseModel):',
      '    id: int',
      '    email: EmailStr',
      '    model_config = ConfigDict(from_attributes=True)',
      '',
      '',
      'def issue_token(user: AuthUser, db: Session) -> TokenResponse:',
      '    raw, digest = new_token()',
      '    expires_at = datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)',
      '    db.add(AuthToken(user_id=user.id, token_hash=digest, expires_at=expires_at))',
      '    db.commit()',
      '    return TokenResponse(token=raw, expires_at=expires_at)',
      '',
      '',
      '@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)',
      'def register(payload: RegisterPayload, db: Session = Depends(get_db)):',
      '    email = payload.email.lower()',
      '    if db.scalar(select(AuthUser).where(AuthUser.email == email)) is not None:',
      '        raise HTTPException(status_code=409, detail="Email is already registered")',
      '    user = AuthUser(email=email, password_hash=hash_password(payload.password))',
      '    db.add(user)',
      '    db.commit()',
      '    db.refresh(user)',
      '    return issue_token(user, db)',
      '',
      '',
      '@router.post("/login", response_model=TokenResponse)',
      'def login(payload: LoginPayload, db: Session = Depends(get_db)):',
      '    email = payload.email.lower()',
      '    user = db.scalar(select(AuthUser).where(AuthUser.email == email))',
      '    if user is None or not verify_password(payload.password, user.password_hash):',
      '        raise HTTPException(status_code=401, detail="Invalid email or password")',
      '    return issue_token(user, db)',
      '',
      '',
      '@router.get("/me", response_model=UserOut)',
      'def me(user: AuthUser = Depends(get_current_user)):',
      '    return user',
      '',
      '',
      '@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)',
      'def logout(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):',
      '    db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))',
      '    db.commit()',
      '    return Response(status_code=status.HTTP_204_NO_CONTENT)',
      '',
    ].join('\n'),
  });

  const mysql = options.db === 'mysql';
  const postgres = options.db === 'postgres';
  const pk = mysql
    ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY'
    : postgres
      ? 'SERIAL PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const tokenId = mysql ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY' : postgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const engine = mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
  files.push({
    path: 'migrations/002_auth.sql',
    language: 'sql',
    content: [
      '-- Authentication tables (optional). Apply after 001_init.sql.',
      'CREATE TABLE IF NOT EXISTS auth_users (',
      `  id ${pk},`,
      '  email VARCHAR(255) NOT NULL UNIQUE,',
      '  password_hash VARCHAR(255) NOT NULL,',
      '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      `)${engine};`,
      '',
      'CREATE TABLE IF NOT EXISTS auth_tokens (',
      `  id ${tokenId},`,
      '  user_id INT NOT NULL,',
      '  token_hash CHAR(64) NOT NULL UNIQUE,',
      '  expires_at TIMESTAMP NOT NULL,',
      '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE',
      `)${engine};`,
      '',
      'CREATE INDEX IF NOT EXISTS ix_auth_tokens_user ON auth_tokens (user_id);',
      '',
    ].join('\n'),
  });

  return files;
}

function readme(model: BackendModel, options: BackendOptions, projectName: string): string {
  const title = projectName.replace(/-/g, ' ');
  const full = options.mode === 'full';
  const tableRows = model.tables
    .map(t => `| \`${t.name}\` | ${t.columns.length} | ${t.primaryKey.map(pk => `\`${pk.name}\``).join(', ') || '—'} | ${t.belongsTo.length} |`)
    .join('\n');
  const baseUrl = options.db === 'sqlite' ? 'sqlite:///./app.db' : options.db === 'postgres' ? 'postgresql+psycopg://user:password@localhost:5432/appdb' : 'mysql+pymysql://user:password@localhost:3306/appdb';
  const structure = full
    ? `app/
  main.py            FastAPI app, CORS and router wiring
  database.py        SQLAlchemy engine + session factory
  models.py          One ORM class per table (${model.tables.length} tables)
  schemas.py         Pydantic create/update/read models with validation
  routers/           One CRUD router per table${options.auth ? '\n  dependencies.py    Bearer-token auth dependency\n  auth_models.py     Auth tables\n  security.py        PBKDF2 password hashing + opaque tokens' : ''}${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '\n  seed_demo.py       Optional AI demo seed rows (data only)' : ''}
 migrations/
   001_init.sql       Full schema DDL (source of truth)${options.auth ? '\n   002_auth.sql       Authentication tables' : ''}
${options.aiNotes && options.aiNotes.length > 0 ? '\n docs/\n   AI_NOTES.md       AI documentation notes (not executable)' : ''}`
    : `app/
  database.py        SQLAlchemy engine + session factory
  models.py          One ORM class per table (${model.tables.length} tables)
 migrations/
   001_init.sql       Full schema DDL (source of truth)`;
  return `# ${title}

Generated by Schema Studio — **${frameworkLabel('fastapi', options.db)}**${full ? '' : ' · models-only project'}.

## قرار التوجيه / Routing decision

- **AR:** ${options.routingReason === 'manual' ? 'اختيار يدوي من المستخدم — يتغلّب على قاعدة نوع قاعدة البيانات.' : `توجيه تلقائي: ${options.db} → Python/FastAPI + SQLAlchemy.`}
- **EN:** ${options.routingReason === 'manual' ? 'Manual choice by the user — overrides the database rule.' : `Automatic: ${options.db} → Python/FastAPI + SQLAlchemy.`}
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? `- **AI enrichment:** demo seed rows were generated by AI, then filtered against the schema and kept as data only.\n${(options.aiNotes ?? []).map(note => `  - ${note}`).join('\n')}` : '- **AI enrichment:** disabled — every file comes from deterministic templates.'}

## العربية — نظرة سريعة

حزمة FastAPI جاهزة تحتوي نماذج SQLAlchemy لكل جدول، ومخططات Pydantic
للتحقق، وراوتر CRUD لكل جدول، وإعداد الاتصال وملف .env.example.
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '\n> بيانات البذر التجريبية (app/seed_demo.py) مُثراة بالذكاء الاصطناعي: شغّلها بعد إنشاء الجداول عبر python -m app.seed_demo.' : ''}

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
${options.aiSeedRows && Object.keys(options.aiSeedRows).length > 0 ? '# after creating the tables:\npython -m app.seed_demo\n' : ''}\`\`\`

Set \`DATABASE_URL\` in \`.env\` to \`${baseUrl}\`.

${(model.source.views?.length || model.source.triggers?.length) ? '> \`migrations/001_init.sql\` creates the source indexes, views and triggers after the tables; apply it as-is.\n' : ''}
Create the database, then apply the schema:

\`\`\`bash
# PostgreSQL
createdb appdb && psql appdb -f migrations/001_init.sql
# MySQL
mysql -u root -p -e "CREATE DATABASE appdb" && mysql -u root -p appdb < migrations/001_init.sql
# SQLite (no server needed)
sqlite3 app.db < migrations/001_init.sql
\`\`\`

${full ? `Run the API:

\`\`\`bash
uvicorn app.main:app --reload
\`\`\`

Open http://127.0.0.1:8000/docs for the interactive OpenAPI console.` : 'Import `app.database` and `app.models` from your own entrypoint — this project was generated in models-only mode.'}

> \`AUTO_CREATE_TABLES=1\` lets SQLAlchemy create missing tables on startup for quick
> local experiments. For real deployments apply \`migrations/001_init.sql\` and set it to \`0\`.

## Tables

| Table | Columns | Primary key | Relations |
|---|---|---|---|
${tableRows}

${full ? `## Endpoints

Every table gets five REST endpoints (tables without a primary key get list + create only):

| Method | Path | Description |
|---|---|---|
| GET | \`/api/<table>\` | Paginated list (\`skip\`, \`limit\` ≤ 200) |
| GET | \`/api/<table>/{id}\` | Single row (404 when missing) |
| POST | \`/api/<table>\` | Create, validates constraints, 201 |
| PUT | \`/api/<table>/{id}\` | Partial update |
| DELETE | \`/api/<table>/{id}\` | Delete, 204 |

Validation mirrors the schema: required fields, \`max_length\`, e-mail format,
unique columns (409 on conflict), foreign keys (400 on missing parent) and
database \`CHECK\` constraints.` : ''}

${options.auth ? `## Authentication

\`POST /api/auth/register\` and \`POST /api/auth/login\` return
\`{ "token": "...", "expires_at": "..." }\`. Send it as:

\`\`\`
Authorization: Bearer <token>
\`\`\`

\`GET /api/auth/me\` returns the current user; \`POST /api/auth/logout\` revokes
every token of that user. All business endpoints require a valid token.
` : ''}
## ملاحظات عربية

- المشروع مولّد من ${model.baseTables.length} جدولاً أصلياً و${model.source.relationships.length} علاقة معلنة.
- ${model.tables.length - model.baseTables.length} جدول ربط أُنشئ تلقائياً لعلاقات N-M.
${[...model.warnings, ...(options.extraWarnings ?? [])].length ? [...model.warnings, ...(options.extraWarnings ?? [])].map(w => `- ⚠ ${w}`).join('\n') : '- لا توجد تحذيرات على السكيما.'}
- كل ملف يحمل رأس توليد يتضمن رقم العملية وتاريخها، وMANIFEST.json يجرد الملفات ومصدرها.

## Notes

- Generated from ${model.baseTables.length} base tables and ${model.source.relationships.length} declared relations.
- ${model.tables.length - model.baseTables.length} junction table(s) were synthesised for N-M relations.
${[...model.warnings, ...(options.extraWarnings ?? [])].length ? [...model.warnings, ...(options.extraWarnings ?? [])].map(w => `- ⚠ ${w}`).join('\n') : '- No schema warnings.'}
- Keep this project in version control and apply schema changes through new migration files.
`;
}

function pyLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  return JSON.stringify(value);
}

function demoSeedFile(model: BackendModel, options: BackendOptions): GeneratedFile | null {
  const rows = options.aiSeedRows ?? {};
  const tables = model.tables.filter(table => (rows[table.name] ?? []).length > 0);
  if (tables.length === 0) return null;
  const quote = options.db === 'mysql'
    ? 'def _quote(name: str) -> str:\n    return "`" + name.replace("`", "``") + "`"'
    : `def _quote(name: str) -> str:\n    return '"' + name.replace('"', '""') + '"'`;

  const rowsLiteral = tables
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
      const entries = tableRows
        .map(row => `        {${Object.entries(row).map(([key, value]) => `${JSON.stringify(key)}: ${pyLiteral(value)}`).join(', ')}},`)
        .join('\n');
      return `    ${JSON.stringify(table.name)}: [\n${entries}\n    ],`;
    })
    .join('\n');

  return {
    path: 'app/seed_demo.py',
    language: 'python',
    source: 'ai',
    content: [
      '"""Demo seed data — enriched by AI and reviewed as plain data only.',
      '',
      'Run after the schema exists:  python -m app.seed_demo',
      'Every value is bound as a SQL parameter; table/column names are whitelisted',
      'from the generated model and quoted for the target dialect.',
      '"""',
      'from __future__ import annotations',
      '',
      'from sqlalchemy import text',
      '',
      'from .database import engine',
      '',
      '',
      quote,
      '',
      '',
      '_DEMO_ROWS: dict[str, list[dict[str, object]]] = {',
      rowsLiteral,
      '}',
      '',
      '',
      'def seed_demo() -> int:',
      '    inserted = 0',
      '    with engine.begin() as connection:',
      '        for table_name, table_rows in _DEMO_ROWS.items():',
      '            for row in table_rows:',
      '                columns = list(row.keys())',
      '                quoted = ", ".join(_quote(name) for name in columns)',
      '                placeholders = ", ".join(f":v{index}" for index in range(len(columns)))',
      '                params = {f"v{index}": value for index, value in enumerate(row.values())}',
      '                connection.execute(',
      '                    text(f"INSERT INTO {_quote(table_name)} ({quoted}) VALUES ({placeholders})"),',
      '                    params,',
      '                )',
      '                inserted += 1',
      '    return inserted',
      '',
      '',
      'if __name__ == "__main__":',
      '    print(f"Inserted {seed_demo()} demo row(s).")',
      '',
    ].join('\n'),
  };
}

export function generateFastApi(model: BackendModel, options: BackendOptions, projectName: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const projectTitle = projectName.replace(/-/g, ' ') + ' API';

  files.push({ path: 'app/__init__.py', language: 'python', content: '' });
  files.push({ path: 'app/database.py', language: 'python', content: databaseFile(options) });
  files.push({ path: 'app/models.py', language: 'python', content: modelsFile(model, options.db) });

  if (options.mode === 'full') {
    files.push({ path: 'app/routers/__init__.py', language: 'python', content: '' });
    files.push({ path: 'app/schemas.py', language: 'python', content: schemasFile(model) });
    files.push({ path: 'app/main.py', language: 'python', content: mainFile(projectTitle, model, options) });
    for (const table of model.tables) {
      files.push({
        path: `app/routers/${table.moduleName}.py`,
        language: 'python',
        content: routerFile(table, options),
      });
    }
    if (options.auth) files.push(...authFiles(options));
  }

  const ddl = generateDdl(model.source, options.db, { dropIfExists: false, createJunctionTables: true, deferCyclicForeignKeys: true });
  files.push({
    path: 'migrations/001_init.sql',
    language: 'sql',
    content: `-- Schema generated from the ER model on ${new Date().toISOString().slice(0, 10)}\n\n${ddl.code}\n`,
  });

  const demoSeed = demoSeedFile(model, options);
  if (demoSeed) files.push(demoSeed);

  files.push({ path: 'requirements.txt', language: 'text', content: requirementsFile(options) });
  files.push({ path: '.env.example', language: 'env', content: envFile(options) });
  files.push({ path: 'README.md', language: 'markdown', content: readme(model, options, projectName) });

  return files;
}
