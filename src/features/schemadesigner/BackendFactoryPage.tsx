import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  FileCode2,
  FileUp,
  GitBranch,
  KeyRound,
  Layers,
  Loader2,
  ScrollText,
  Server,
  Sparkles,
  Table as TableIcon,
  Wand2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import BackendFactoryPanel from './BackendFactoryPanel';
import {
  parseSqlSchema,
  type ParsedSqlSchema,
  type SqlBackendDialect,
} from '../../utils/sqlSchemaParser';
import type { ErModel } from '../../utils/drawioImporter';

const MAX_SQL_BYTES = 2 * 1024 * 1024;
const MAX_TABLES = 100;

const SAMPLE_SQL = `-- مثال: متجر إلكتروني صغير (MySQL)
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT price_non_negative CHECK (price >= 0)
);

CREATE INDEX ix_products_title ON products (title);`;

const DIALECTS: { id: SqlBackendDialect; label: string }[] = [
  { id: 'mysql', label: 'MySQL' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'sqlite', label: 'SQLite' },
];

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function confidenceLabel(value: number, isAr: boolean): string {
  if (value >= 0.75) return isAr ? 'ثقة عالية' : 'High confidence';
  if (value >= 0.45) return isAr ? 'ثقة متوسطة' : 'Medium confidence';
  return isAr ? 'ثقة منخفضة' : 'Low confidence';
}

const BackendFactoryPage: React.FC = () => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';
  const [sqlText, setSqlText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedSqlSchema | null>(null);
  const [dialectOverride, setDialectOverride] = useState<SqlBackendDialect | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = sqlText.trim();
    if (!text) {
      setParsed(null);
      setParseError('');
      setIsParsing(false);
      return;
    }
    const bytes = new TextEncoder().encode(sqlText).length;
    if (bytes > MAX_SQL_BYTES) {
      setParsed(null);
      setParseError(
        isAr
          ? `حجم SQL ${(bytes / 1024 / 1024).toFixed(2)}MB يتجاوز 2MB — قسّم السكيما أو احذف الأجزاء غير اللازمة.`
          : `SQL is ${(bytes / 1024 / 1024).toFixed(2)}MB; the limit is 2MB — split the schema.`
      );
      return;
    }
    setIsParsing(true);
    const timer = window.setTimeout(() => {
      try {
        const result = parseSqlSchema(sqlText, { maxTables: MAX_TABLES });
        setParsed(result);
        setParseError('');
      } catch (error) {
        setParsed(null);
        setParseError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsParsing(false);
      }
    }, 380);
    return () => window.clearTimeout(timer);
  }, [sqlText, isAr, dialectOverride]);

  const model: ErModel | null = parsed?.ok ? parsed.model : null;
  const effectiveDialect = dialectOverride ?? parsed?.dialect.dialect ?? 'mysql';
  // PRD §4.4: عند غموض اللهجة لا نكمل التوليد قبل اختيار صريح من المستخدم.
  const awaitingDialectConfirmation = Boolean(parsed?.ok && parsed.dialect.needsConfirmation && !dialectOverride);

  const tablePreview = useMemo(() => parsed?.model.tables ?? [], [parsed]);

  const acceptFile = async (file: File | null | undefined): Promise<void> => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.sql') && !lower.endsWith('.txt') && !lower.endsWith('.ddl')) {
      toast.warning(
        isAr ? 'صيغة غير مدعومة' : 'Unsupported file',
        isAr ? 'ارفع ملفاً بامتداد .sql أو .txt.' : 'Upload a .sql or .txt file.'
      );
      return;
    }
    if (file.size > MAX_SQL_BYTES) {
      toast.error(
        isAr ? 'الملف كبير جداً' : 'File too large',
        isAr ? 'الحد الأقصى 2 ميغابايت.' : 'The limit is 2MB.'
      );
      return;
    }
    const text = await file.text();
    setSqlText(text);
    setFileName(file.name);
    setDialectOverride(null);
    toast.info(isAr ? 'تم تحميل الملف' : 'File loaded', `${file.name} · ${formatBytes(text)}`);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    void acceptFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
          <div className="p-1.5 bg-[var(--cds-interactive-01)]/10 border border-[var(--cds-interactive-01)]/30">
            <Server className="w-4 h-4 text-[var(--cds-interactive-01)]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold text-[var(--cds-text-01)]">
                {isAr ? 'مصنع الـBackend من SQL' : 'SQL → Backend Factory'}
              </h1>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border border-[var(--cds-interactive-01)]/40 text-[var(--cds-interactive-01)]">
                PRD v1.0
              </span>
            </div>
            <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5 max-w-3xl">
              {isAr
                ? 'الصق SQL DDL أو ارفع ملف .sql: يُحلّل نصياً بلا تنفيذ، يكشف اللهجة، ثم يولّد مشروع Laravel أو FastAPI كاملاً مع Models وMigrations وCRUD وValidation وMANIFEST.'
                : 'Paste SQL DDL or upload a .sql file. It is parsed statically (never executed), the dialect is detected, and a full Laravel or FastAPI project is generated with models, migrations, CRUD, validation and a MANIFEST.'}
            </p>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2 text-[9px] font-mono text-[var(--cds-text-03)]">
            <span className="px-1.5 py-0.5 border border-[var(--cds-border-subtle)]">MySQL → Laravel</span>
            <span className="px-1.5 py-0.5 border border-[var(--cds-border-subtle)]">PostgreSQL / SQLite → FastAPI</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {/* Input */}
          <div className="p-4 border-b xl:border-b-0 xl:border-e border-[var(--cds-border-subtle)] space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ScrollText className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-02)]">
                {isAr ? 'كود SQL / DDL' : 'SQL / DDL source'}
              </span>
              {fileName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--cds-text-03)]">
                  <FileCode2 className="w-3 h-3" />
                  {fileName}
                  <button
                    type="button"
                    onClick={() => { setFileName(''); setSqlText(''); setParsed(null); setDialectOverride(null); }}
                    className="text-[var(--cds-text-03)] hover:text-[#fa4d56]"
                    title={isAr ? 'مسح' : 'Clear'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <span className="ms-auto text-[9px] font-mono text-[var(--cds-text-03)]">
                {formatBytes(sqlText)} / 2MB · {isAr ? 'حد الجداول' : 'table cap'} {MAX_TABLES}
              </span>
            </div>

            <textarea
              value={sqlText}
              onChange={event => { setSqlText(event.target.value); setDialectOverride(null); }}
              dir="ltr"
              spellCheck={false}
              placeholder={SAMPLE_SQL}
              className="w-full h-[300px] resize-y bg-[var(--cds-field-01)] border border-[var(--cds-border-subtle)] focus:border-[var(--cds-interactive-01)] outline-none p-3 text-[11px] leading-relaxed font-mono text-[var(--cds-text-01)]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql,.txt,.ddl,text/plain,application/sql"
                className="hidden"
                onChange={event => { void acceptFile(event.target.files?.[0]); event.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]"
              >
                <FileUp className="w-3 h-3" />
                {isAr ? 'رفع ملف .sql' : 'Upload .sql'}
              </button>
              <button
                type="button"
                onClick={() => { setSqlText(SAMPLE_SQL); setFileName('example.sql'); setDialectOverride(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]"
              >
                <Wand2 className="w-3 h-3" />
                {isAr ? 'مثال جاهز' : 'Load example'}
              </button>
              {isParsing && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--cds-text-03)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> {isAr ? 'تحليل…' : 'Parsing…'}
                </span>
              )}
              <span className="ms-auto text-[9px] font-mono text-[var(--cds-text-03)]">
                {isAr ? 'تحليل نصي فقط — لا اتصال بقاعدة بيانات ولا تنفيذ SQL.' : 'Static parsing only — no DB connection, no SQL execution.'}
              </span>
            </div>

            <div
              onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border border-dashed px-3 py-3 text-[10px] font-mono text-center transition-colors ${
                isDragging
                  ? 'border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/5 text-[var(--cds-interactive-01)]'
                  : 'border-[var(--cds-border-strong)] text-[var(--cds-text-03)]'
              }`}
            >
              {isAr ? 'أو أفلت ملف .sql هنا مباشرة' : 'Or drop a .sql file here'}
            </div>

            {parseError && (
              <div className="flex items-start gap-2 border border-[#fa4d56]/40 bg-[#fa4d56]/10 px-3 py-2 text-[10px] font-mono text-[#fa4d56]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="p-4 space-y-3 bg-[var(--cds-layer-02)]/40">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-02)]">
                {isAr ? 'المعاينة قبل التوليد' : 'Preview before generation'}
              </span>
              {parsed?.ok && (
                <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-mono text-[#42be65]">
                  <CheckCircle2 className="w-3 h-3" /> {isAr ? 'سكيما صالحة' : 'Schema valid'}
                </span>
              )}
            </div>

            {!parsed && !parseError && (
              <div className="border border-dashed border-[var(--cds-border-strong)] px-4 py-10 text-center space-y-2">
                <Sparkles className="w-5 h-5 mx-auto text-[var(--cds-interactive-01)]" />
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {isAr ? 'ستظهر هنا الجداول والأعمدة والعلاقات والقيود فور لصق SQL.' : 'Tables, columns, relations and constraints appear here as soon as you paste SQL.'}
                </p>
                <p className="text-[9px] font-mono text-[var(--cds-text-03)]">
                  CREATE TABLE · ALTER TABLE · PRIMARY KEY · FOREIGN KEY · UNIQUE · CHECK · INDEX
                </p>
              </div>
            )}

            {parsed && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: isAr ? 'جداول' : 'Tables', value: parsed.stats.tables, icon: TableIcon },
                    { label: isAr ? 'أعمدة' : 'Columns', value: parsed.stats.columns, icon: Layers },
                    { label: isAr ? 'علاقات' : 'Relations', value: parsed.stats.relationships, icon: GitBranch },
                    { label: isAr ? 'فهارس' : 'Indexes', value: parsed.stats.indexes, icon: KeyRound },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-2.5 py-2">
                        <div className="flex items-center gap-1 text-[9px] font-mono text-[var(--cds-text-03)]">
                          <Icon className="w-3 h-3" /> {item.label}
                        </div>
                        <p className="text-lg font-mono font-bold text-[var(--cds-text-01)] leading-tight">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                {(parsed.stats.views > 0 || parsed.stats.triggers > 0) && (
                  <div className="flex flex-wrap items-center gap-2 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-3 py-2 text-[10px] font-mono text-[var(--cds-text-02)]">
                    {parsed.stats.views > 0 && (
                      <span>
                        {isAr ? 'عروض:' : 'Views:'} <b>{parsed.stats.views}</b>
                        {parsed.model.views && parsed.model.views.length > 0 && (
                          <span className="text-[var(--cds-text-03)]" dir="ltr"> · {parsed.model.views.slice(0, 4).map(view => view.name).join(', ')}{parsed.model.views.length > 4 ? '…' : ''}</span>
                        )}
                      </span>
                    )}
                    {parsed.stats.triggers > 0 && (
                      <span>
                        {isAr ? 'Triggers:' : 'Triggers:'} <b>{parsed.stats.triggers}</b>
                        {parsed.model.triggers && parsed.model.triggers.length > 0 && (
                          <span className="text-[var(--cds-text-03)]" dir="ltr"> · {parsed.model.triggers.slice(0, 4).map(trigger => trigger.name).join(', ')}{parsed.model.triggers.length > 4 ? '…' : ''}</span>
                        )}
                      </span>
                    )}
                  </div>
                )}

                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="text-[var(--cds-text-03)]">{isAr ? 'اللهجة المكتشفة:' : 'Detected dialect:'}</span>
                    <span className="font-bold text-[var(--cds-text-01)]">{parsed.dialect.dialect.toUpperCase()}</span>
                    <span className={`px-1.5 py-0.5 border ${
                      parsed.dialect.confidence >= 0.75
                        ? 'border-[#42be65]/40 text-[#42be65]'
                        : 'border-[#f1c21b]/40 text-[#f1c21b]'
                    }`}>
                      {confidenceLabel(parsed.dialect.confidence, isAr)} · {(parsed.dialect.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[var(--cds-text-03)]">
                      {isAr ? 'قرار التوليد:' : 'Routing:'} {effectiveDialect === 'mysql' ? 'Laravel (PHP)' : 'FastAPI (Python)'}
                    </span>
                  </div>
                  <div className="h-1 bg-[var(--cds-layer-03)] w-full">
                    <div
                      className="h-1 bg-[var(--cds-interactive-01)]"
                      style={{ width: `${Math.max(4, Math.min(100, parsed.dialect.confidence * 100))}%` }}
                    />
                  </div>
                  {parsed.dialect.reasons.length > 0 && (
                    <p className="text-[9px] font-mono text-[var(--cds-text-03)]" dir="ltr">
                      {parsed.dialect.reasons.slice(0, 4).join(' · ')}
                    </p>
                  )}
                  {parsed.dialect.needsConfirmation && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cds-border-subtle)] pt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#f1c21b]">
                        <AlertTriangle className="w-3 h-3" />
                        {isAr ? 'إشارات اللهجة ضعيفة — أكّد قاعدة البيانات:' : 'Weak dialect signals — confirm the database:'}
                      </span>
                      {DIALECTS.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDialectOverride(item.id)}
                          className={`px-2 py-1 text-[10px] font-mono font-bold border ${
                            effectiveDialect === item.id
                              ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
                              : 'border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {parsed.errors.length > 0 && (
                  <div className="border border-[#fa4d56]/40 bg-[#fa4d56]/10 px-3 py-2 text-[10px] font-mono text-[#fa4d56] space-y-1">
                    {parsed.errors.map((error, index) => <p key={index}>• {error}</p>)}
                  </div>
                )}

                <div className="max-h-[210px] overflow-auto border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                  {tablePreview.map(table => (
                    <div key={table.name} className="px-3 py-2 border-b border-[var(--cds-border-subtle)] last:border-b-0">
                      <div className="flex items-center gap-2">
                        <TableIcon className="w-3 h-3 text-[var(--cds-interactive-01)]" />
                        <span className="text-[11px] font-mono font-bold text-[var(--cds-text-01)]" dir="ltr">{table.name}</span>
                        <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
                          {table.columns.length} {isAr ? 'عمود' : 'cols'}
                        </span>
                        {table.indexes && table.indexes.length > 0 && (
                          <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
                            · {table.indexes.length} {isAr ? 'فهرس' : 'idx'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {table.columns.slice(0, 10).map(column => (
                          <span
                            key={column.name}
                            dir="ltr"
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono border ${
                              column.isPrimaryKey
                                ? 'border-[#f1c21b]/50 text-[#f1c21b]'
                                : column.isForeignKey
                                  ? 'border-[#33b1ff]/50 text-[#33b1ff]'
                                  : 'border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                            }`}
                            title={`${column.type}${column.isNullable ? ' NULL' : ' NOT NULL'}${column.isUnique ? ' UNIQUE' : ''}`}
                          >
                            {column.isPrimaryKey && <KeyRound className="w-2.5 h-2.5" />}
                            {column.isForeignKey && <ArrowRightLeft className="w-2.5 h-2.5" />}
                            {column.name}
                            <span className="opacity-60">{column.type}</span>
                          </span>
                        ))}
                        {table.columns.length > 10 && (
                          <span className="text-[9px] font-mono text-[var(--cds-text-03)]">+{table.columns.length - 10}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {parsed.issues.length > 0 && (
                  <details className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                    <summary className="cursor-pointer px-3 py-2 text-[10px] font-mono text-[var(--cds-text-02)]">
                      {isAr ? `ملاحظات التحليل (${parsed.issues.length})` : `Parser notes (${parsed.issues.length})`}
                    </summary>
                    <div className="px-3 pb-2 space-y-1 max-h-[140px] overflow-auto">
                      {parsed.issues.slice(0, 20).map((issue, index) => (
                        <p key={index} className={`text-[9px] font-mono ${issue.severity === 'error' ? 'text-[#fa4d56]' : 'text-[#f1c21b]'}`} dir="ltr">
                          L{issue.line} · {issue.message}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {awaitingDialectConfirmation && (
        <div className="flex items-start gap-2 border border-[#f1c21b]/40 bg-[#f1c21b]/10 px-3 py-2 text-[10px] font-mono text-[#f1c21b]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {isAr
              ? 'إشارات اللهجة غير حاسمة — اختر قاعدة البيانات أعلاه لتفعيل التوليد. لن نخمّن نوع القاعدة بدلاً منك.'
              : 'Dialect signals are inconclusive — pick the database above to enable generation. We will not guess the engine for you.'}
          </span>
        </div>
      )}

      {model && !awaitingDialectConfirmation && (
        <BackendFactoryPanel
          key={`${effectiveDialect}-${model.tables.length}`}
          model={model}
          dialect={effectiveDialect}
          fileName={fileName}
        />
      )}

      {!parsed && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              title: isAr ? 'تحليل بلا تنفيذ' : 'Static-only analysis',
              body: isAr ? 'لا اتصال بقاعدة بيانات ولا تنفيذ لأي أمر SQL — النص يُحلّل ويُحوّل إلى نموذج وسيط.' : 'No database connection and no SQL execution — text is parsed into an intermediate model.',
            },
            {
              title: isAr ? 'قواعد التوجيه' : 'Routing rules',
              body: isAr ? 'MySQL → PHP/Laravel، وPostgreSQL/SQLite → Python/FastAPI. الاختيار اليدوي للغة يتغلّب دائماً.' : 'MySQL → PHP/Laravel; PostgreSQL/SQLite → Python/FastAPI. A manual language choice always wins.',
            },
            {
              title: isAr ? 'حزمة قابلة للتدقيق' : 'Auditable package',
              body: isAr ? 'كل ملف يحمل رأس توليد، وMANIFEST.json يوضّح مصدر كل ملف (قالب أو إثراء ذكي).' : 'Every file carries a generation header; MANIFEST.json records each file’s source (template or AI).',
            },
          ].map(card => (
            <div key={card.title} className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-3">
              <p className="text-[11px] font-bold text-[var(--cds-text-01)]">{card.title}</p>
              <p className="text-[10px] text-[var(--cds-text-02)] mt-1 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BackendFactoryPage;
