import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileCode2,
  FolderTree,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { ErModel } from '../../utils/drawioImporter';
import type { SqlDialect } from '../../utils/ddlGenerator';
import {
  analyzeBackendModel,
  BackendCodegenError,
  generateBackendProject,
  groupFilesByDirectory,
  resolveFramework,
  type AiSeedRows,
  type BackendDb,
  type BackendFramework,
  type BackendMode,
  type BackendProject,
} from '../../utils/backendCodegen';
import { createZip } from '../../utils/zipStore';
import { aiAuthHeaders } from '../../utils/aiAccessGuard';
import { useApp } from '../../context/AppContext';

interface BackendFactoryPanelProps {
  model: ErModel;
  dialect: SqlDialect;
  fileName?: string;
}

const DB_OPTIONS: { id: BackendDb; label: string; labelAr: string }[] = [
  { id: 'postgres', label: 'PostgreSQL', labelAr: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL', labelAr: 'MySQL' },
  { id: 'sqlite', label: 'SQLite', labelAr: 'SQLite' },
];

const FRAMEWORK_OPTIONS: { id: BackendFramework | 'auto'; label: string; hintAr: string; hintEn: string }[] = [
  { id: 'auto', label: 'تلقائي', hintAr: 'حسب قاعدة البيانات', hintEn: 'Based on the database' },
  { id: 'fastapi', label: 'FastAPI', hintAr: 'Python · SQLAlchemy · Pydantic', hintEn: 'Python · SQLAlchemy · Pydantic' },
  { id: 'django', label: 'Django', hintAr: 'Python · Django ORM · DRF', hintEn: 'Python · Django ORM · DRF' },
  { id: 'laravel', label: 'Laravel', hintAr: 'PHP · Eloquent · Migrations', hintEn: 'PHP · Eloquent · Migrations' },
  { id: 'pdo', label: 'PHP PDO', hintAr: 'PHP خام بلا إطار', hintEn: 'Plain PHP, no framework' },
];

function mapDialect(dialect: SqlDialect): BackendDb {
  if (dialect === 'postgres') return 'postgres';
  if (dialect === 'sqlite') return 'sqlite';
  return 'mysql';
}

function defaultProjectName(fileName?: string): string {
  const base = (fileName || '').trim().replace(/\.[a-z0-9]+$/i, '').trim();
  return base || 'schema-api';
}

function formatBytes(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const BackendFactoryPanel: React.FC<BackendFactoryPanelProps> = ({ model, dialect, fileName }) => {
  const { language, toast, aiSettings } = useApp();
  const isAr = language === 'ar';
  // نفس المزوّد/النموذج المختارين في صفحة النماذج — لا نثبّت مزوّداً واحداً للإثراء
  const activeAiConfig = aiSettings.providers[aiSettings.activeProvider];
  const activeAiLabel = `${aiSettings.activeProvider} · ${aiSettings.activeModel}`;

  const [projectName, setProjectName] = useState<string>(() => defaultProjectName(fileName));
  const [db, setDb] = useState<BackendDb>(() => mapDialect(dialect));
  const [framework, setFramework] = useState<BackendFramework | 'auto'>('auto');
  const [mode, setMode] = useState<BackendMode>('full');
  const [auth, setAuth] = useState<boolean>(false);
  const [project, setProject] = useState<BackendProject | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [generatedSignature, setGeneratedSignature] = useState<string>('');
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [isOpeningVscode, setIsOpeningVscode] = useState<boolean>(false);
  const [aiEnrichment, setAiEnrichment] = useState<boolean>(true);
  const [aiNotice, setAiNotice] = useState<string>('');
  const [buildStage, setBuildStage] = useState<'idle' | 'templates' | 'ai' | 'packaging'>('idle');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set());
  const copyTimer = useRef<number | null>(null);

  // Django is offered for PostgreSQL — the stack where Django + DRF fits best.
  const visibleFrameworkOptions = useMemo(
    () => FRAMEWORK_OPTIONS.filter(option => option.id !== 'django' || db === 'postgres'),
    [db]
  );

  const effectiveFramework = useMemo(() => resolveFramework(db, framework), [db, framework]);
  const analysis = useMemo(() => analyzeBackendModel(model), [model]);
  const currentSignature = useMemo(
    () => JSON.stringify({ projectName: projectName.trim(), db, framework, mode, auth: auth && mode === 'full', aiEnrichment }),
    [projectName, db, framework, mode, auth, aiEnrichment]
  );
  const isStale = project !== null && generatedSignature !== '' && generatedSignature !== currentSignature;

  useEffect(() => {
    setProject(null);
    setSelectedPath('');
    setGeneratedSignature('');
  }, [model]);

  useEffect(() => {
    setDb(mapDialect(dialect));
  }, [dialect]);

  useEffect(() => {
    if (db !== 'postgres' && framework === 'django') setFramework('auto');
  }, [db, framework]);

  useEffect(() => {
    setProjectName(defaultProjectName(fileName));
  }, [fileName]);

  const grouped = useMemo(() => (project ? groupFilesByDirectory(project.files) : []), [project]);

  const selectedFile = useMemo(
    () => project?.files.find(file => file.path === selectedPath) ?? project?.files[0] ?? null,
    [project, selectedPath]
  );

  const handleGenerate = async (): Promise<void> => {
    setIsBuilding(true);
    setBuildStage('templates');
    setAiNotice('');
    let aiSeedRows: AiSeedRows | undefined;
    let aiNotes: string[] = [];
    let aiFailureNote = '';
    try {
      // 1) توليد حتمي من القوالب أولاً — لا يتأخر بانتظار أي مزوّد ذكاء اصطناعي.
      generateBackendProject({
        model,
        projectName: projectName.trim() || 'schema-api',
        options: { db, framework, mode, auth: auth && mode === 'full' },
      });

      // 2) إثراء اختياري: صفوف بذر فقط، تُفحص على الخادم والعميل قبل حقنها في القوالب.
      if (aiEnrichment) {
        setBuildStage('ai');
        try {
          const response = await fetch('/api/backend/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...aiAuthHeaders() },
            body: JSON.stringify({
              // المزوّد والنموذج والمفتاح من الإعدادات النشطة للمستخدم
              provider: aiSettings.activeProvider,
              model: aiSettings.activeModel,
              apiKey: activeAiConfig?.apiKey,
              endpointUrl: activeAiConfig?.endpointUrl,
              language,
              tables: analysis.tables.map(table => ({
                name: table.name,
                columns: table.columns.map(column => ({
                  name: column.name,
                  type: column.rawType,
                  primaryKey: column.primaryKey,
                  autoIncrement: column.autoIncrement,
                  nullable: column.nullable,
                  foreignKey: Boolean(column.fk),
                })),
              })),
            }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
          if (payload?.available && payload.seedRows) {
            aiSeedRows = payload.seedRows as AiSeedRows;
            aiNotes = Array.isArray(payload.notes) ? payload.notes : [];
            const enrichedTables = Object.keys(aiSeedRows).length;
            const usedModel = typeof payload.modelUsed === 'string' && payload.modelUsed ? payload.modelUsed : activeAiLabel;
            setAiNotice(
              isAr
                ? `إثراء ذكي: بيانات بذر لـ ${enrichedTables} جدولاً عبر ${usedModel} (مُصفّاة على السكيما).`
                : `AI enrichment: seed rows for ${enrichedTables} table(s) via ${usedModel}, schema-filtered.`
            );
          } else {
            const unavailableNotes = Array.isArray(payload?.notes) && payload.notes.length > 0
              ? payload.notes
              : ['AI enrichment returned no data — deterministic templates only.'];
            aiFailureNote = String(unavailableNotes[0]);
            setAiNotice(aiFailureNote);
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          aiFailureNote = `AI enrichment unavailable: ${reason}`;
          setAiNotice(isAr ? `تعذّر الإثراء الذكي (${reason}) — أكملنا التوليد قالبياً.` : `AI enrichment unavailable (${reason}) — generated template-only.`);
        }
      }

      setBuildStage('packaging');
      const next = generateBackendProject({
        model,
        projectName: projectName.trim() || 'schema-api',
        options: {
          db,
          framework,
          mode,
          auth: auth && mode === 'full',
          aiSeedRows,
          aiNotes,
          extraWarnings: aiFailureNote ? [aiFailureNote] : [],
        },
      });
      setProject(next);
      setSelectedPath(next.files.find(file => file.path === 'MANIFEST.json')?.path ?? next.files[0]?.path ?? '');
      setGeneratedSignature(currentSignature);
      setCollapsedDirs(new Set());
      toast.success(
        isAr ? 'تم توليد مشروع الـBackend' : 'Backend project generated',
        isAr
          ? `${next.stats.files} ملفاً · ${next.stats.tables} جدولاً · ${next.stats.endpoints} مساراً`
          : `${next.stats.files} files · ${next.stats.tables} tables · ${next.stats.endpoints} endpoints`
      );
    } catch (error) {
      const message =
        error instanceof BackendCodegenError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      toast.error(isAr ? 'تعذّر توليد المشروع' : 'Project generation failed', message);
    } finally {
      setBuildStage('idle');
      setIsBuilding(false);
    }
  };

  const handleDownload = (options: { silent?: boolean } = {}): void => {
    if (!project) return;
    try {
      const archive = createZip(project.files.map(file => ({ path: file.path, content: file.content })));
      const blob = new Blob([archive as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.projectName}-${project.framework}-backend.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      if (!options.silent) {
        toast.success(
          isAr ? 'تم تنزيل المشروع' : 'Project downloaded',
          isAr ? 'فكّ الضغط ثم اتبع README للتشغيل.' : 'Unzip it, then follow the README to run it.'
        );
      }
    } catch (error) {
      toast.error(
        isAr ? 'تعذّر إنشاء الملف المضغوط' : 'Could not build the archive',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  /**
   * يحفظ الملفات محلياً عبر الخادم ثم يفتح المجلد بمخطط vscode://.
   * أي فشل (خادم سحابي، VS Code غير مثبّت، صلاحية) يعود تلقائياً إلى ZIP.
   */
  const handleOpenInVscode = async (): Promise<void> => {
    if (!project) return;
    setIsOpeningVscode(true);
    try {
      const response = await fetch('/api/backend/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiAuthHeaders() },
        body: JSON.stringify({
          projectName: project.projectName,
          files: project.files.map(file => ({ path: file.path, content: file.content })),
        }),
      });
      const payload = await response.json().catch(() => null) as { uri?: string; path?: string; message?: string; error?: string } | null;
      if (!response.ok || !payload?.uri) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
      }
      const anchor = document.createElement('a');
      anchor.href = payload.uri;
      anchor.rel = 'noopener';
      anchor.click();
      toast.success(
        isAr ? 'تم تجهيز المشروع وفتحه في VS Code' : 'Project prepared and opened in VS Code',
        payload.path ?? ''
      );
    } catch {
      handleDownload({ silent: true });
      toast.error(
        isAr ? 'تعذّر الفتح المباشر في VS Code' : 'Could not open VS Code directly',
        isAr ? 'نزّلنا الحزمة بدلاً من ذلك — فكّ الضغط وافتح المجلد في VS Code.' : 'Downloaded the archive instead — unzip it and open the folder in VS Code.'
      );
    } finally {
      setIsOpeningVscode(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(isAr ? 'تعذّر النسخ' : 'Copy failed', isAr ? 'انسخ يدوياً من المعاينة.' : 'Select and copy manually.');
    }
  };

  const toggleDir = (directory: string): void => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(directory)) next.delete(directory);
      else next.add(directory);
      return next;
    });
  };

  const autoLabel = resolveFramework(db, 'auto');
  const manualOverride = framework !== 'auto' && framework !== autoLabel;

  return (
    <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
      {/* رأس اللوحة */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
        <Server className="w-4 h-4 text-[var(--cds-interactive-01)] shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-interactive-01)]">
              BACKEND FACTORY
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]">
              {isAr ? 'من السكيمّا إلى مشروع كامل' : 'From schema to full project'}
            </span>
          </div>
          <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
            {isAr
              ? 'Models + Migrations + CRUD API + Validation + اتصال DB + README — بلا كتابة سطر واحد.'
              : 'Models + Migrations + CRUD API + Validation + DB connection + README — with no boilerplate.'}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-2 text-[10px] font-mono text-[var(--cds-text-03)]">
          <Boxes className="w-3.5 h-3.5" />
          {model.tables.length} {isAr ? 'جدولاً' : 'tables'}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* اسم المشروع — يُستخدم في README وأسماء الملفات */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label
            htmlFor="backend-project-name"
            className="text-[10px] font-mono uppercase tracking-widest text-[var(--cds-text-03)] sm:w-40 shrink-0"
          >
            {isAr ? 'اسم المشروع' : 'Project name'}
          </label>
          <input
            id="backend-project-name"
            type="text"
            dir="ltr"
            value={projectName}
            onChange={event => setProjectName(event.target.value)}
            maxLength={64}
            spellCheck={false}
            placeholder="my-shop-api"
            className="w-full max-w-md bg-[var(--cds-field-01)] border border-[var(--cds-border-subtle)] focus:border-[var(--cds-interactive-01)] outline-none px-2.5 py-1.5 text-[11px] font-mono text-[var(--cds-text-01)]"
          />
          <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
            {isAr ? 'يُستخدم في README والملفات' : 'Used in README and files'}
          </span>
        </div>

        {/* الأسئلة السريعة */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cds-text-03)]">
              {isAr ? 'قاعدة البيانات' : 'Database'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DB_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDb(option.id)}
                  className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border transition-colors ${
                    db === option.id
                      ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
                      : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
                  }`}
                >
                  {isAr ? option.labelAr : option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cds-text-03)]">
              {isAr ? 'التقنية' : 'Stack'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {visibleFrameworkOptions.map(option => {
                const active = framework === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFramework(option.id)}
                    title={isAr ? option.hintAr : option.hintEn}
                    className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border transition-colors ${
                      active
                        ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
                        : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
                    }`}
                  >
                    {option.id === 'auto' ? (isAr ? 'تلقائي' : 'Auto') : option.label}
                    {option.id === 'auto' && (
                      <span className="ms-1 opacity-70">
                        ({autoLabel === 'fastapi' ? 'FastAPI' : autoLabel === 'django' ? 'Django' : autoLabel === 'laravel' ? 'Laravel' : 'PDO'})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--cds-border-subtle)] pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--cds-text-03)]">
              {isAr ? 'النطاق' : 'Scope'}
            </span>
            {(['full', 'models'] as BackendMode[]).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  if (value === 'models') setAuth(false);
                }}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-bold border transition-colors ${
                  mode === value
                    ? 'bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] border-[var(--cds-interactive-01)]'
                    : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-03)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
                }`}
              >
                {value === 'full' ? (isAr ? 'REST API كامل' : 'Full REST API') : isAr ? 'Models فقط' : 'Models only'}
              </button>
            ))}
          </div>

          <label
            className={`flex items-center gap-2 text-[11px] font-mono ${
              mode === 'full' ? 'text-[var(--cds-text-02)] cursor-pointer' : 'text-[var(--cds-text-03)] opacity-60 cursor-not-allowed'
            }`}
            title={mode === 'full' ? undefined : isAr ? 'التوثيق يتطلب REST API' : 'Authentication requires the REST API'}
          >
            <input
              type="checkbox"
              checked={auth && mode === 'full'}
              disabled={mode !== 'full'}
              onChange={event => setAuth(event.target.checked)}
              className="accent-[var(--cds-interactive-01)]"
            />
            <ShieldCheck className="w-3.5 h-3.5" />
            {isAr ? 'تسجيل الدخول والتوثيق' : 'Auth (login + tokens)'}
          </label>

          <label
            className="flex items-center gap-2 text-[11px] font-mono text-[var(--cds-text-02)] cursor-pointer"
            title={isAr ? 'إثراء اختياري: بيانات بذر واقعية فقط — يفشل بأمان إلى القوالب.' : 'Optional: realistic seed rows only — fails safe to templates.'}
          >
            <input
              type="checkbox"
              checked={aiEnrichment}
              onChange={event => setAiEnrichment(event.target.checked)}
              className="accent-[var(--cds-interactive-01)]"
            />
            <Sparkles className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
            {isAr ? 'إثراء ذكي (بيانات بذر)' : 'AI enrichment (seed data)'}
            <span className="text-[9px] text-[var(--cds-text-03)] font-mono" title={isAr ? 'المزوّد والنموذج النشطان في صفحة النماذج' : 'Active provider and model from Model Config'}>
              {activeAiLabel}
            </span>
          </label>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {project && isStale && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#f1c21b]">
                <AlertTriangle className="w-3 h-3" />
                {isAr ? 'الخيارات تغيّرت — أعد التوليد' : 'Options changed — regenerate'}
              </span>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isBuilding}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-[var(--cds-interactive-01)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isBuilding
                ? buildStage === 'ai'
                  ? (isAr ? 'إثراء البيانات…' : 'Enriching data…')
                  : buildStage === 'packaging'
                    ? (isAr ? 'تغليف الحزمة…' : 'Packaging…')
                    : (isAr ? 'توليد القوالب…' : 'Rendering templates…')
                : project
                  ? (isAr ? 'أعد التوليد' : 'Regenerate')
                  : isAr ? 'ولّد مشروع الـBackend' : 'Generate backend'}
            </button>
          </div>
        </div>

        {/* ملخّص القرار الذكي */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[var(--cds-text-03)]">
          <span className="px-1.5 py-0.5 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
            {isAr ? 'القرار:' : 'Decision:'} {effectiveFramework === 'fastapi' ? 'FastAPI + SQLAlchemy' : effectiveFramework === 'django' ? 'Django + DRF' : effectiveFramework === 'laravel' ? 'Laravel + Eloquent' : 'PHP 8 + PDO'}
          </span>
          <span>
            {manualOverride
              ? isAr
                ? 'اختيار يدوي — يتغلّب على القاعدة التلقائية.'
                : 'Manual choice — overrides the automatic rule.'
              : isAr
                ? 'اختيار تلقائي بحسب قاعدة البيانات.'
                : 'Chosen automatically from the database engine.'}
          </span>
          {project && (
            <span className="px-1.5 py-0.5 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]" dir="ltr">
              OP {project.generation.operationId.slice(0, 18)}…
            </span>
          )}
          {aiNotice && (
            <span className={aiNotice.startsWith('تعذّر') || aiNotice.startsWith('AI enrichment unavailable') ? 'text-[#f1c21b]' : 'text-[#42be65]'}>
              {aiNotice}
            </span>
          )}
        </div>

        {/* نتيجة التوليد */}
        {project && (
          <div className="border border-[var(--cds-border-subtle)]">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
              <FileCode2 className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              <span className="text-[11px] font-mono font-bold text-[var(--cds-text-01)]">{project.label}</span>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[var(--cds-text-03)]">
                <span>{project.stats.files} {isAr ? 'ملف' : 'files'}</span>
                <span>·</span>
                <span>{project.stats.tables} {isAr ? 'جداول' : 'tables'}</span>
                <span>·</span>
                <span>{project.stats.endpoints} {isAr ? 'مسار' : 'endpoints'}</span>
                {project.stats.junctionTables > 0 && (
                  <>
                    <span>·</span>
                    <span>{project.stats.junctionTables} {isAr ? 'جدول ربط' : 'junction'}</span>
                  </>
                )}
                {project.stats.indexes > 0 && (
                  <>
                    <span>·</span>
                    <span>{project.stats.indexes} {isAr ? 'فهرس' : 'indexes'}</span>
                  </>
                )}
                {project.stats.views > 0 && (
                  <>
                    <span>·</span>
                    <span>{project.stats.views} {isAr ? 'عرض' : 'views'}</span>
                  </>
                )}
                {project.stats.triggers > 0 && (
                  <>
                    <span>·</span>
                    <span>{project.stats.triggers} {isAr ? 'Trigger' : 'triggers'}</span>
                  </>
                )}
              </div>
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleCopy(); }}
                  disabled={!selectedFile}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] disabled:opacity-40"
                >
                  {copied ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                  {copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الملف' : 'Copy file'}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleOpenInVscode(); }}
                  disabled={isOpeningVscode}
                  title={isAr ? 'يحفظ المشروع محلياً ويفتحه في VS Code — مع مهام وإضافات جاهزة' : 'Save locally and open in VS Code — with tasks and extensions ready'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold bg-[var(--cds-layer-01)] border border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/10 disabled:opacity-50"
                >
                  {isOpeningVscode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Code2 className="w-3 h-3" />}
                  VS Code
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold bg-[var(--cds-interactive-01)] text-white hover:opacity-90"
                >
                  <Download className="w-3 h-3" />
                  .zip
                </button>
              </div>
            </div>

            {project.warnings.length > 0 && (
              <div className="px-3 py-2 border-b border-[var(--cds-border-subtle)] bg-[#f1c21b]/10">
                <div className="flex items-start gap-2 text-[10px] font-mono text-[var(--cds-text-02)]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#f1c21b] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {project.warnings.slice(0, 4).map((warning, index) => (
                      <p key={index}>• {warning}</p>
                    ))}
                    {project.warnings.length > 4 && <p>… +{project.warnings.length - 4}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,32%)_1fr] min-h-[320px]">
              {/* شجرة الملفات */}
              <div className="border-b lg:border-b-0 lg:border-e border-[var(--cds-border-subtle)] max-h-[420px] overflow-auto bg-[var(--cds-layer-02)]">
                <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-[var(--cds-text-03)] sticky top-0 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
                  <FolderTree className="w-3 h-3" />
                  {isAr ? 'شجرة المشروع' : 'Project tree'}
                </div>
                {grouped.map(group => {
                  const collapsed = collapsedDirs.has(group.directory);
                  return (
                    <div key={group.directory} className="border-b border-[var(--cds-border-subtle)] last:border-b-0">
                      <button
                        type="button"
                        onClick={() => toggleDir(group.directory)}
                        className="w-full flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-mono font-bold text-[var(--cds-text-02)] hover:text-[var(--cds-interactive-01)]"
                      >
                        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span className="truncate">{group.directory}/</span>
                      </button>
                      {!collapsed &&
                        group.files.map(file => {
                          const active = selectedFile?.path === file.path;
                          return (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => setSelectedPath(file.path)}
                              title={file.path}
                              className={`w-full flex items-center gap-1.5 ps-6 pe-2.5 py-1 text-[10px] font-mono text-left transition-colors ${
                                active
                                  ? 'bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] border-s-2 border-[var(--cds-interactive-01)]'
                                  : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)] border-s-2 border-transparent'
                              }`}
                            >
                              <FileCode2 className="w-3 h-3 shrink-0 opacity-70" />
                              <span className="truncate">{file.path.split('/').pop()}</span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>

              {/* معاينة الملف */}
              <div className="min-w-0 flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                  <Terminal className="w-3 h-3 text-[var(--cds-interactive-01)]" />
                  <span className="text-[10px] font-mono text-[var(--cds-text-02)] truncate" dir="ltr">
                    {selectedFile?.path ?? '—'}
                  </span>
                  <span className="ms-auto text-[9px] font-mono text-[var(--cds-text-03)] shrink-0">
                    {selectedFile ? formatBytes(selectedFile.content) : ''}
                  </span>
                </div>
                <pre
                  dir="ltr"
                  className="m-0 p-3 text-[10.5px] leading-relaxed font-mono text-[var(--cds-text-01)] overflow-auto flex-1 max-h-[420px] min-h-[280px] bg-[var(--cds-layer-01)]"
                >
                  {selectedFile?.content ?? ''}
                </pre>
              </div>
            </div>
          </div>
        )}

        {!project && (
          <div className="flex items-start gap-2 px-3 py-2.5 border border-dashed border-[var(--cds-border-strong)] bg-[var(--cds-layer-02)] text-[10px] font-mono text-[var(--cds-text-03)]">
            <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--cds-interactive-01)]" />
            <p>
              {isAr
                ? 'اضغط «ولّد مشروع الـBackend» لإنشاء مشروع كامل من السكيمّا الحالية. كل تعديلاتك على الجداول والحقول والقيود والعلاقات تُترجم تلقائياً إلى Models وMigrations وCRUD.'
                : 'Click “Generate backend” to turn the current schema into a full project. Every table, column, constraint and relation you edited is translated into models, migrations and CRUD automatically.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackendFactoryPanel;
