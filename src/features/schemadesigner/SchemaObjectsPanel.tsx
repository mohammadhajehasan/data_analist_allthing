import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  Download,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { ErIndex, ErModel, ErTrigger, ErView } from '../../utils/drawioImporter';
import {
  schemaIndexStatement,
  schemaTriggerStatement,
  schemaViewStatement,
  type SqlDialect,
} from '../../utils/ddlGenerator';
import {
  applyObjectSuggestion,
  bulkSuggestionsSqlDiff,
  revertObjectSuggestion,
  suggestSchemaObjects,
  suggestionSqlDiff,
  type ObjectSuggestion,
} from '../../utils/schemaObjectSuggestions';

/**
 * محرّر كائنات السكيمّا: الفهارس (على مستوى الجدول) والعروض والـTriggers
 * (على مستوى المخطط) — إضافة/تعديل/حذف مع معاينة SQL مباشرة تتحدّث مع كل حرف.
 * كل التعديلات تذهب إلى نفس نموذج المصمّم، فتُعيد توليد DDL ومشروع الـBackend.
 */

type ObjectTab = 'index' | 'view' | 'trigger';

interface IndexDraft {
  editKey: string | null;
  tableId: string;
  name: string;
  columns: string[];
  unique: boolean;
}

interface ViewDraft {
  editIndex: number | null;
  name: string;
  columns: string;
  query: string;
}

interface TriggerDraft {
  editIndex: number | null;
  name: string;
  table: string;
  timing: string;
  event: string;
  rawSql: string;
}

const TIMINGS = ['BEFORE', 'AFTER', 'INSTEAD OF'];
const EVENTS = ['INSERT', 'UPDATE', 'DELETE'];

/** تنظيف اسم كائن: فراغات → شرطات سفلية وإزالة الأقواس والفواصل */
function cleanName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[;,()"'`]/g, '');
}

function indexKey(tableId: string, index: number): string {
  return `${tableId}::${index}`;
}

function indexNameFor(tableName: string, columns: string[]): string {
  return `ix_${tableName}_${columns.join('_')}`;
}

function triggerTemplate(draft: TriggerDraft): string {
  const table = draft.table ? ` ON ${draft.table}` : '';
  return `CREATE TRIGGER ${draft.name || 'trg_name'} ${draft.timing} ${draft.event}${table}\nFOR EACH ROW\nBEGIN\n  -- statements\nEND`;
}

/** يطبّق مسودة الفهرس على النموذج (للمعاينة فقط — لا يغيّر الحالة) */
function modelWithIndexDraft(model: ErModel, draft: IndexDraft): ErModel {
  const value: ErIndex = {
    name: cleanName(draft.name) || indexNameFor(
      model.tables.find(table => table.id === draft.tableId)?.name ?? 'table',
      draft.columns
    ),
    columns: draft.columns,
    unique: draft.unique,
  };
  return {
    ...model,
    tables: model.tables.map(table => {
      if (table.id !== draft.tableId) return table;
      const indexes = table.indexes ?? [];
      if (draft.editKey === null) return { ...table, indexes: [...indexes, value] };
      return { ...table, indexes: indexes.map((item, i) => (indexKey(table.id, i) === draft.editKey ? value : item)) };
    }),
  };
}

function modelWithViewDraft(model: ErModel, draft: ViewDraft): ErModel {
  const columns = draft.columns.split(',').map(cleanName).filter(Boolean);
  const value: ErView = { name: cleanName(draft.name), columns: columns.length > 0 ? columns : undefined, query: draft.query };
  const views = model.views ?? [];
  return {
    ...model,
    views: draft.editIndex === null ? [...views, value] : views.map((item, i) => (i === draft.editIndex ? value : item)),
  };
}

function modelWithTriggerDraft(model: ErModel, draft: TriggerDraft): ErModel {
  const value: ErTrigger = {
    name: cleanName(draft.name),
    table: draft.table || undefined,
    timing: draft.timing || undefined,
    event: draft.event || undefined,
    rawSql: draft.rawSql.trim(),
  };
  const triggers = model.triggers ?? [];
  return {
    ...model,
    triggers: draft.editIndex === null ? [...triggers, value] : triggers.map((item, i) => (i === draft.editIndex ? value : item)),
  };
}

const TAB_META: { id: ObjectTab; ar: string; en: string; icon: React.ElementType }[] = [
  { id: 'index', ar: 'الفهارس', en: 'Indexes', icon: KeyRound },
  { id: 'view', ar: 'العروض', en: 'Views', icon: Eye },
  { id: 'trigger', ar: 'Triggers', en: 'Triggers', icon: Zap },
];

interface SchemaObjectsPanelProps {
  model: ErModel;
  dialect: SqlDialect;
  isAr: boolean;
  onChange: (mutate: (model: ErModel) => ErModel) => void;
}

const SchemaObjectsPanel: React.FC<SchemaObjectsPanelProps> = ({ model, dialect, isAr, onChange }) => {
  const { toast } = useApp();
  const [tab, setTab] = useState<ObjectTab>('index');
  const [error, setError] = useState<string>('');
  const [armed, setArmed] = useState<string | null>(null);
  const [indexForm, setIndexForm] = useState<IndexDraft | null>(null);
  const [viewForm, setViewForm] = useState<ViewDraft | null>(null);
  const [triggerForm, setTriggerForm] = useState<TriggerDraft | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  // معاينة فرق SQL — اقتراح واحد مفتوح في وقت واحد كي لا تتكدّس الفروقات
  const [previewSuggestionId, setPreviewSuggestionId] = useState<string | null>(null);
  // مراجعة الدفعة كاملة قبل «تطبيق الكل» — لا يُطبَّق شيء حتى التأكيد
  const [showBulkPreview, setShowBulkPreview] = useState<boolean>(false);
  // كومة تراجع: كل عنصر دفعة اقتراحات طُبّقت معاً (فردي أو «تطبيق الكل»)
  const [undoStack, setUndoStack] = useState<ObjectSuggestion[][]>([]);

  const viewList = model.views ?? [];
  const triggerList = model.triggers ?? [];
  const indexCount = model.tables.reduce((sum, table) => sum + (table.indexes?.length ?? 0), 0);
  const counts: Record<ObjectTab, number> = { index: indexCount, view: viewList.length, trigger: triggerList.length };

  // اقتراحات حتمية من النموذج الحالي — تختفي تلقائياً بمجرد تطبيقها، ويستطيع المستخدم تجاهلها.
  const suggestions = useMemo(
    () => suggestSchemaObjects(model, dialect).filter(suggestion => !dismissedSuggestions.has(suggestion.id)),
    [model, dialect, dismissedSuggestions]
  );

  // الدفعة تُقاس على النموذج بعد كل اقتراح، تماماً كما يفعل التطبيق الفعلي
  const bulkDiff = useMemo(
    () => (showBulkPreview && suggestions.length > 0 ? bulkSuggestionsSqlDiff(model, suggestions, dialect) : null),
    [showBulkPreview, model, suggestions, dialect]
  );

  const tableNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of model.tables) map.set(table.id, table.name);
    return map;
  }, [model.tables]);

  const previewLines = useMemo(() => {
    const statements: string[] = [];
    if (tab === 'index') {
      const previewModel = indexForm && indexForm.tableId && indexForm.columns.length > 0
        ? modelWithIndexDraft(model, indexForm)
        : model;
      const used = new Set<string>();
      for (const table of previewModel.tables) {
        for (const index of table.indexes ?? []) {
          const statement = schemaIndexStatement(table, index, dialect, used);
          if (statement) statements.push(statement);
          else if ((index.columns ?? []).length === 1 && index.unique) {
            statements.push(`-- ${index.name || 'index'} — skipped: UNIQUE is already declared on ${index.columns[0]}`);
          }
        }
      }
    } else if (tab === 'view') {
      const previewModel = viewForm && cleanName(viewForm.name) && viewForm.query.trim()
        ? modelWithViewDraft(model, viewForm)
        : model;
      for (const view of previewModel.views ?? []) {
        if (!cleanName(view.name)) continue;
        statements.push(schemaViewStatement(view, dialect));
      }
    } else {
      const previewModel = triggerForm && cleanName(triggerForm.name) && triggerForm.rawSql.trim()
        ? modelWithTriggerDraft(model, triggerForm)
        : model;
      for (const trigger of previewModel.triggers ?? []) {
        if (!trigger.rawSql.trim()) continue;
        statements.push(schemaTriggerStatement(trigger));
      }
    }
    return statements.join('\n\n');
  }, [tab, model, dialect, indexForm, viewForm, triggerForm]);

  const pushUndoBatch = (batch: ObjectSuggestion[]): void => {
    setUndoStack(previous => [...previous, batch].slice(-20));
  };

  const applySuggestion = (suggestion: ObjectSuggestion): void => {
    pushUndoBatch([suggestion]);
    setPreviewSuggestionId(null);
    onChange(current => applyObjectSuggestion(current, suggestion));
    toast.success(
      suggestion.dropIndex
        ? isAr ? 'حُذف الفهرس' : 'Index dropped'
        : isAr ? 'طُبّق الاقتراح' : 'Suggestion applied',
      suggestion.name
    );
  };

  const applyAllSuggestions = (): void => {
    if (suggestions.length === 0) return;
    pushUndoBatch(suggestions);
    setPreviewSuggestionId(null);
    setShowBulkPreview(false);
    onChange(current => suggestions.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), current));
    toast.success(
      isAr ? 'طُبّقت كل الاقتراحات' : 'All suggestions applied',
      isAr ? `${suggestions.length} اقتراحاً طُبّق على السكيما — يمكنك التراجع من الشريط أعلاه` : `${suggestions.length} suggestion(s) applied to the schema — undo from the bar above`
    );
  };

  const copyBulkSql = (): void => {
    if (!bulkDiff) return;
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      toast.error(isAr ? 'تعذّر النسخ' : 'Copy failed', isAr ? 'انسخ من المعاينة يدوياً.' : 'Select and copy from the preview.');
      return;
    }
    clipboard.writeText(bulkDiff.sql).then(
      () => toast.success(
        isAr ? 'نُسخ ملف SQL' : 'SQL file copied',
        isAr ? `${bulkDiff.added.length} عبارة بترتيب التطبيق` : `${bulkDiff.added.length} statement(s) in apply order`
      ),
      () => toast.error(isAr ? 'تعذّر النسخ' : 'Copy failed', isAr ? 'انسخ من المعاينة يدوياً.' : 'Select and copy from the preview.')
    );
  };

  const downloadBulkSql = (): void => {
    if (!bulkDiff) return;
    try {
      const blob = new Blob([`${bulkDiff.sql}\n`], { type: 'application/sql;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `schema-object-changes-${dialect}.sql`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(
        isAr ? 'نُزّل ملف SQL' : 'SQL file downloaded',
        isAr ? `${bulkDiff.added.length} عبارة بترتيب التطبيق` : `${bulkDiff.added.length} statement(s) in apply order`
      );
    } catch (error) {
      toast.error(
        isAr ? 'تعذّر تنزيل الملف' : 'Could not download the file',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const undoLastApply = (): void => {
    const batch = undoStack[undoStack.length - 1];
    if (!batch) return;
    setUndoStack(previous => previous.slice(0, -1));
    onChange(current => batch.reduceRight((next, suggestion) => revertObjectSuggestion(next, suggestion), current));
    toast.success(
      isAr ? 'تم التراجع' : 'Undone',
      batch.length === 1 ? batch[0].name : isAr ? `${batch.length} اقتراحات` : `${batch.length} suggestions`
    );
  };

  const dismissSuggestion = (id: string): void => {
    setDismissedSuggestions(previous => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  };

  const resetForms = (): void => {
    setIndexForm(null);
    setViewForm(null);
    setTriggerForm(null);
    setError('');
  };

  const armDelete = (key: string, action: () => void): void => {
    if (armed === key) {
      setArmed(null);
      action();
      return;
    }
    setArmed(key);
    window.setTimeout(() => setArmed(current => (current === key ? null : current)), 3000);
  };

  /* ------------------------------ الفهارس ------------------------------ */

  const startAddIndex = (): void => {
    const firstTable = model.tables[0];
    if (!firstTable) {
      setError(isAr ? 'أضف جدولاً أولاً — الفهرس يتبع جدولاً.' : 'Add a table first — an index belongs to a table.');
      return;
    }
    setError('');
    setViewForm(null);
    setTriggerForm(null);
    setIndexForm({ editKey: null, tableId: firstTable.id, name: '', columns: [], unique: false });
  };

  const startEditIndex = (tableId: string, position: number, index: ErIndex): void => {
    setError('');
    setViewForm(null);
    setTriggerForm(null);
    setIndexForm({
      editKey: indexKey(tableId, position),
      tableId,
      name: index.name,
      columns: [...(index.columns ?? [])],
      unique: Boolean(index.unique),
    });
  };

  const saveIndex = (): void => {
    const draft = indexForm;
    if (!draft) return;
    const table = model.tables.find(item => item.id === draft.tableId);
    if (!table) {
      setError(isAr ? 'اختر جدولاً صالحاً للفهرس.' : 'Pick a valid table for the index.');
      return;
    }
    if (draft.columns.length === 0) {
      setError(isAr ? 'اختر عموداً واحداً على الأقل للفهرس.' : 'Select at least one column for the index.');
      return;
    }
    const name = cleanName(draft.name);
    if (name) {
      const duplicate = model.tables.some(item =>
        (item.indexes ?? []).some((index, position) =>
          indexKey(item.id, position) !== draft.editKey && index.name.toLowerCase() === name.toLowerCase()
        )
      );
      if (duplicate) {
        setError(isAr ? `يوجد فهرس باسم «${name}» بالفعل — اختر اسماً فريداً.` : `An index named "${name}" already exists — pick a unique name.`);
        return;
      }
    }
    const value: ErIndex = {
      name: name || indexNameFor(table.name, draft.columns),
      columns: [...draft.columns],
      unique: draft.unique,
    };
    const editKey = draft.editKey;
    onChange(current => ({
      ...current,
      tables: current.tables.map(item => {
        if (item.id !== draft.tableId) return item;
        const indexes = item.indexes ?? [];
        if (editKey === null) return { ...item, indexes: [...indexes, value] };
        return { ...item, indexes: indexes.map((entry, i) => (indexKey(item.id, i) === editKey ? value : entry)) };
      }),
    }));
    toast.success(
      isAr ? (editKey ? 'تحديث الفهرس' : 'إضافة فهرس') : editKey ? 'Index updated' : 'Index added',
      `${value.name} · ${table.name} (${value.columns.join(', ')})`
    );
    resetForms();
  };

  const deleteIndex = (tableId: string, position: number): void => {
    onChange(current => ({
      ...current,
      tables: current.tables.map(table =>
        table.id === tableId
          ? { ...table, indexes: (table.indexes ?? []).filter((_entry, i) => i !== position) }
          : table
      ),
    }));
    toast.success(isAr ? 'حُذف الفهرس' : 'Index deleted', '');
    if (indexForm?.editKey === indexKey(tableId, position)) resetForms();
  };

  /* ------------------------------- العروض ------------------------------ */

  const startAddView = (): void => {
    setError('');
    setIndexForm(null);
    setTriggerForm(null);
    setViewForm({ editIndex: null, name: '', columns: '', query: 'SELECT ' });
  };

  const startEditView = (position: number, view: ErView): void => {
    setError('');
    setIndexForm(null);
    setTriggerForm(null);
    setViewForm({
      editIndex: position,
      name: view.name,
      columns: (view.columns ?? []).join(', '),
      query: view.rawSql?.trim() || view.query,
    });
  };

  const saveView = (): void => {
    const draft = viewForm;
    if (!draft) return;
    const name = cleanName(draft.name);
    if (!name) {
      setError(isAr ? 'اسم العرض مطلوب.' : 'View name is required.');
      return;
    }
    if (!draft.query.trim()) {
      setError(isAr ? 'استعلام SELECT مطلوب لإنشاء العرض.' : 'A SELECT query is required to create the view.');
      return;
    }
    const duplicate = viewList.some((view, position) => position !== draft.editIndex && view.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError(isAr ? `يوجد عرض باسم «${name}» بالفعل.` : `A view named "${name}" already exists.`);
      return;
    }
    const columns = draft.columns.split(',').map(cleanName).filter(Boolean);
    const value: ErView = { name, columns: columns.length > 0 ? columns : undefined, query: draft.query.trim() };
    const editIndex = draft.editIndex;
    onChange(current => {
      const views = current.views ?? [];
      return {
        ...current,
        views: editIndex === null ? [...views, value] : views.map((view, i) => (i === editIndex ? value : view)),
      };
    });
    toast.success(
      isAr ? (editIndex ? 'تحديث العرض' : 'إضافة عرض') : editIndex ? 'View updated' : 'View added',
      name
    );
    resetForms();
  };

  const deleteView = (position: number): void => {
    onChange(current => ({ ...current, views: (current.views ?? []).filter((_view, i) => i !== position) }));
    toast.success(isAr ? 'حُذف العرض' : 'View deleted', '');
    if (viewForm?.editIndex === position) resetForms();
  };

  /* ------------------------------ Triggers ----------------------------- */

  const startAddTrigger = (): void => {
    setError('');
    setIndexForm(null);
    setViewForm(null);
    setTriggerForm({
      editIndex: null,
      name: '',
      table: model.tables[0]?.name ?? '',
      timing: 'AFTER',
      event: 'INSERT',
      rawSql: '',
    });
  };

  const startEditTrigger = (position: number, trigger: ErTrigger): void => {
    setError('');
    setIndexForm(null);
    setViewForm(null);
    setTriggerForm({
      editIndex: position,
      name: trigger.name,
      table: trigger.table ?? '',
      timing: trigger.timing ?? 'AFTER',
      event: trigger.event ?? 'INSERT',
      rawSql: trigger.rawSql,
    });
  };

  const saveTrigger = (): void => {
    const draft = triggerForm;
    if (!draft) return;
    const name = cleanName(draft.name);
    if (!name) {
      setError(isAr ? 'اسم الـTrigger مطلوب.' : 'Trigger name is required.');
      return;
    }
    if (!draft.rawSql.trim()) {
      setError(isAr ? 'تعريف SQL للـTrigger مطلوب.' : 'The trigger SQL definition is required.');
      return;
    }
    const duplicate = triggerList.some((trigger, position) => position !== draft.editIndex && trigger.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError(isAr ? `يوجد Trigger باسم «${name}» بالفعل.` : `A trigger named "${name}" already exists.`);
      return;
    }
    const value: ErTrigger = {
      name,
      table: draft.table || undefined,
      timing: draft.timing || undefined,
      event: draft.event || undefined,
      rawSql: draft.rawSql.trim(),
    };
    const editIndex = draft.editIndex;
    onChange(current => {
      const triggers = current.triggers ?? [];
      return {
        ...current,
        triggers: editIndex === null ? [...triggers, value] : triggers.map((trigger, i) => (i === editIndex ? value : trigger)),
      };
    });
    toast.success(
      isAr ? (editIndex ? 'تحديث الـTrigger' : 'إضافة Trigger') : editIndex ? 'Trigger updated' : 'Trigger added',
      name
    );
    resetForms();
  };

  const deleteTrigger = (position: number): void => {
    onChange(current => ({ ...current, triggers: (current.triggers ?? []).filter((_trigger, i) => i !== position) }));
    toast.success(isAr ? 'حُذف الـTrigger' : 'Trigger deleted', '');
    if (triggerForm?.editIndex === position) resetForms();
  };

  /* ------------------------------- العرض ------------------------------- */

  const inputClass =
    'px-2 py-1 text-[11px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none';
  const labelClass = 'block text-[10px] font-mono font-bold text-[var(--cds-text-02)] mb-1';
  const smallButton = 'inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors';
  const selectedTable = indexForm ? model.tables.find(table => table.id === indexForm.tableId) : undefined;
  const draftTriggerSql = triggerForm ? triggerTemplate(triggerForm) : '';

  return (
    <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Code2 className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
          {isAr ? 'كائنات السكيما' : 'Schema objects'}
        </span>
        <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
          {isAr
            ? 'أضف وحرّر الفهارس والعروض والـTriggers — المعاينة تتحدّث فوراً بنفس لهجة SQL المختارة'
            : 'Add and edit indexes, views and triggers — the preview updates live in the selected SQL dialect'}
        </span>
        <button
          type="button"
          onClick={() => {
            if (showSuggestions) setShowBulkPreview(false);
            setShowSuggestions(!showSuggestions);
          }}
          aria-expanded={showSuggestions}
          className={`${smallButton} ms-auto border ${
            showSuggestions
              ? 'border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)]'
              : 'border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)]'
          }`}
        >
          <Sparkles className="w-3 h-3 text-[var(--cds-interactive-01)]" />
          {isAr ? 'اقتراحات ذكية' : 'Smart suggestions'}
          <span className={`px-1 border ${suggestions.length > 0 ? 'border-[var(--cds-interactive-01)]/40 text-[var(--cds-interactive-01)]' : 'border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]'}`}>
            {suggestions.length}
          </span>
        </button>
      </div>

      {undoStack.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 px-2 py-1.5 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
          <Undo2 className="w-3 h-3 text-[var(--cds-interactive-01)]" />
          <span className="text-[10px] font-mono text-[var(--cds-text-02)]">
            {isAr ? 'آخر تطبيق:' : 'Last apply:'}{' '}
            <span dir="ltr" className="font-bold text-[var(--cds-text-01)]">
              {undoStack[undoStack.length - 1].length === 1
                ? undoStack[undoStack.length - 1][0].name
                : isAr
                  ? `${undoStack[undoStack.length - 1].length} اقتراحات`
                  : `${undoStack[undoStack.length - 1].length} suggestions`}
            </span>
          </span>
          <button
            type="button"
            onClick={undoLastApply}
            className={`${smallButton} ms-auto border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)] hover:text-[var(--cds-interactive-01)]`}
          >
            <Undo2 className="w-3 h-3" /> {isAr ? 'تراجع' : 'Undo'}
          </button>
        </div>
      )}

      {showSuggestions && (
        <div className="mb-2 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
          <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <Sparkles className="w-3 h-3 text-[var(--cds-interactive-01)]" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-02)]">
              {isAr ? 'اقتراحات كائنات السكيما' : 'Schema object suggestions'}
            </span>
            <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'مشتقة من العلاقات والأعمدة والقواعد — راجعها قبل التطبيق' : 'Derived from relations, columns and conventions — review before applying'}
            </span>
            <button
              type="button"
              onClick={() => setShowBulkPreview(true)}
              disabled={suggestions.length === 0}
              aria-expanded={showBulkPreview}
              className={`${smallButton} ms-auto bg-[var(--cds-interactive-01)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Code2 className="w-3 h-3" />
              {isAr ? `مراجعة وتطبيق الكل (${suggestions.length})` : `Review & apply all (${suggestions.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSuggestions(false);
                setShowBulkPreview(false);
              }}
              className="p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]"
              aria-label={isAr ? 'إغلاق الاقتراحات' : 'Close suggestions'}
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {bulkDiff && (
            <div className="border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Code2 className="w-3 h-3 text-[var(--cds-interactive-01)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-02)]">
                  {isAr ? 'فرق مجمّع قبل التطبيق' : 'Combined diff before apply'}
                </span>
                <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
                  {isAr
                    ? `${dialect} · ${bulkDiff.counts.add} إضافة · ${bulkDiff.counts.drop} حذف · ${bulkDiff.added.length} عبارة`
                    : `${dialect} · ${bulkDiff.counts.add} added · ${bulkDiff.counts.drop} dropped · ${bulkDiff.added.length} statement(s)`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowBulkPreview(false)}
                  className="ms-auto p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]"
                  aria-label={isAr ? 'إغلاق الفرق المجمّع' : 'Close combined diff'}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <p className="mt-1 text-[9px] font-mono text-[var(--cds-text-03)]">
                {isAr
                  ? 'هذا كل ما سيُنفَّذ في ملف واحد، بترتيب التطبيق — لن يتغيّر النموذج قبل التأكيد.'
                  : 'Everything that will run, in one file and in apply order — the model stays untouched until you confirm.'}
              </p>

              {bulkDiff.removed.length > 0 && (
                <div className="mt-1 max-h-24 overflow-auto">
                  {bulkDiff.removed.map((line, index) => (
                    <pre
                      key={`bulk-removed-${index}`}
                      dir="ltr"
                      className="text-[10px] font-mono whitespace-pre-wrap break-words text-[#fa4d56]"
                    >{`− ${line}`}</pre>
                  ))}
                </div>
              )}

              {bulkDiff.added.length > 0 ? (
                <pre
                  dir="ltr"
                  className="mt-1 max-h-64 overflow-auto border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-2 text-[10px] font-mono whitespace-pre-wrap break-words text-[#42be65]"
                >{bulkDiff.added.map(line => `+ ${line}`).join('\n\n')}</pre>
              ) : (
                <p className="mt-1 text-[10px] font-mono text-[var(--cds-text-03)]">
                  {isAr ? 'لا SQL قابل للتنفيذ في هذه الدفعة — التغيير على النموذج فقط.' : 'No executable SQL in this batch — the change is model-only.'}
                </p>
              )}

              {bulkDiff.note && (
                <p className="mt-1 text-[9px] font-mono text-[var(--cds-text-03)]">
                  {isAr ? bulkDiff.note.ar : bulkDiff.note.en}
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={applyAllSuggestions}
                  className={`${smallButton} border border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)] text-white hover:opacity-90`}
                >
                  <Plus className="w-3 h-3" />
                  {isAr ? `تأكيد تطبيق الكل (${suggestions.length})` : `Confirm apply all (${suggestions.length})`}
                </button>
                <button
                  type="button"
                  onClick={copyBulkSql}
                  className={`${smallButton} border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)] hover:text-[var(--cds-interactive-01)]`}
                >
                  <Code2 className="w-3 h-3" />
                  {isAr ? 'نسخ ملف SQL' : 'Copy SQL file'}
                </button>
                <button
                  type="button"
                  onClick={downloadBulkSql}
                  className={`${smallButton} border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)] hover:text-[var(--cds-interactive-01)]`}
                >
                  <Download className="w-3 h-3" />
                  {isAr ? 'تنزيل .sql' : 'Download .sql'}
                </button>
                <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
                  {isAr ? 'يمكن التراجع بعد التطبيق' : 'Undo stays available after applying'}
                </span>
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-auto divide-y divide-[var(--cds-border-subtle)]">
            {suggestions.map(suggestion => {
              const diff = previewSuggestionId === suggestion.id
                ? suggestionSqlDiff(model, suggestion, dialect)
                : null;
              const accent =
                suggestion.kind === 'index-cleanup'
                  ? 'text-[#fa4d56] border-[#fa4d56]/40'
                  : suggestion.kind === 'index'
                    ? 'text-[var(--cds-interactive-01)] border-[var(--cds-interactive-01)]/40'
                    : suggestion.kind === 'view'
                      ? 'text-[#42be65] border-[#42be65]/40'
                      : 'text-[#f1c21b] border-[#f1c21b]/40';
              return (
                <div key={suggestion.id} className="flex flex-wrap items-start gap-2 px-2 py-1.5">
                  <span className={`mt-0.5 text-[9px] font-mono font-bold px-1 border shrink-0 ${accent}`}>
                    {suggestion.kind === 'index-cleanup'
                      ? isAr ? 'تنظيف' : 'CLEANUP'
                      : suggestion.kind === 'index'
                        ? isAr ? 'فهرس' : 'INDEX'
                        : suggestion.kind === 'view'
                          ? isAr ? 'عرض' : 'VIEW'
                          : 'TRIGGER'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold text-[var(--cds-text-01)]" dir="ltr">{suggestion.name}</span>
                      <span className="text-[9px] font-mono px-1 border border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--cds-text-02)] leading-snug mt-0.5">
                      {isAr ? suggestion.detailAr : suggestion.detailEn}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPreviewSuggestionId(current => (current === suggestion.id ? null : suggestion.id))}
                      aria-expanded={previewSuggestionId === suggestion.id}
                      className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--cds-text-03)] hover:text-[var(--cds-interactive-01)]"
                    >
                      <Code2 className="w-3 h-3" />
                      {previewSuggestionId === suggestion.id
                        ? isAr ? 'إخفاء الفرق' : 'Hide diff'
                        : isAr ? 'معاينة فرق SQL' : 'Preview SQL diff'}
                    </button>
                    {diff && (
                      <div className="mt-1 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-2 mb-1 text-[9px] font-mono uppercase tracking-wider">
                          <span className="text-[var(--cds-text-03)]">{dialect}</span>
                          <span className="text-[#fa4d56]">− {isAr ? 'يزول من التعريف' : 'removed'}</span>
                          <span className="text-[#42be65]">+ {isAr ? 'يُنفَّذ عند التطبيق' : 'added on apply'}</span>
                        </div>
                        {diff.removed.map((line, index) => (
                          <pre
                            key={`removed-${index}`}
                            dir="ltr"
                            className="text-[10px] font-mono whitespace-pre-wrap break-words text-[#fa4d56]"
                          >{`− ${line}`}</pre>
                        ))}
                        {diff.added.map((line, index) => (
                          <pre
                            key={`added-${index}`}
                            dir="ltr"
                            className="text-[10px] font-mono whitespace-pre-wrap break-words text-[#42be65]"
                          >{`+ ${line}`}</pre>
                        ))}
                        {diff.note && (
                          <p className="mt-1 text-[9px] font-mono text-[var(--cds-text-03)]">
                            {isAr ? diff.note.ar : diff.note.en}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className={`${smallButton} shrink-0 border ${
                      suggestion.dropIndex
                        ? 'border-[#fa4d56] text-[#fa4d56] hover:bg-[#fa4d56] hover:text-white'
                        : 'border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)] hover:text-white'
                    }`}
                  >
                    {suggestion.dropIndex ? <Trash2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {suggestion.dropIndex ? (isAr ? 'حذف' : 'Drop') : isAr ? 'تطبيق' : 'Apply'}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestion(suggestion.id)}
                    title={isAr ? 'تجاهل هذا الاقتراح' : 'Dismiss this suggestion'}
                    aria-label={isAr ? 'تجاهل الاقتراح' : 'Dismiss suggestion'}
                    className="p-1 shrink-0 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {suggestions.length === 0 && (
              <p className="px-2 py-3 text-[10px] font-mono text-[var(--cds-text-03)]">
                {isAr
                  ? 'لا اقتراحات جديدة — مفاتيحك الأجنبية مفهرسة، ولا فهارس مكررة/غير مستخدمة، ولا أعمدة نشاط/تحديث ناقصة. عدّل السكيما أو تجاهل الاقتراحات السابقة لتعود.'
                  : 'No new suggestions — your foreign keys are indexed, no duplicate/unused indexes were found, and no activity/update columns are missing. Change the schema or clear dismissals to see them again.'}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--cds-border-subtle)] pb-2">
        {TAB_META.map(meta => {
          const Icon = meta.icon;
          const active = tab === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => { setTab(meta.id); setError(''); }}
              aria-pressed={active}
              className={`${smallButton} border ${
                active
                  ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
                  : 'text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
              }`}
            >
              <Icon className="w-3 h-3" />
              {isAr ? meta.ar : meta.en}
              <span className={`px-1 ${active ? 'text-white/80' : 'text-[var(--cds-text-03)]'}`}>{counts[meta.id]}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={tab === 'index' ? startAddIndex : tab === 'view' ? startAddView : startAddTrigger}
          className={`${smallButton} ms-auto border border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)] hover:text-white`}
        >
          <Plus className="w-3 h-3" />
          {tab === 'index'
            ? isAr ? 'إضافة فهرس' : 'Add index'
            : tab === 'view'
              ? isAr ? 'إضافة عرض' : 'Add view'
              : isAr ? 'إضافة Trigger' : 'Add trigger'}
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 border border-[#fa4d56]/40 bg-[#fa4d56]/10 px-2 py-1.5 text-[10px] font-mono text-[#fa4d56]">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ============================ الفهارس ============================ */}
      {tab === 'index' && (
        <div className="mt-2 space-y-2">
          {indexForm && (
            <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className={labelClass} htmlFor="idx-table">{isAr ? 'الجدول' : 'Table'}</label>
                  <select
                    id="idx-table"
                    value={indexForm.tableId}
                    onChange={event => setIndexForm({ ...indexForm, tableId: event.target.value, columns: [] })}
                    className={`${inputClass} w-40`}
                  >
                    {model.tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="idx-name">{isAr ? 'اسم الفهرس (اختياري)' : 'Index name (optional)'}</label>
                  <input
                    id="idx-name"
                    value={indexForm.name}
                    onChange={event => setIndexForm({ ...indexForm, name: event.target.value })}
                    placeholder={selectedTable ? indexNameFor(selectedTable.name, indexForm.columns.length > 0 ? indexForm.columns : ['col']) : 'ix_table_col'}
                    dir="ltr"
                    className={`${inputClass} w-56`}
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--cds-text-02)]">
                  <input
                    type="checkbox"
                    checked={indexForm.unique}
                    onChange={event => setIndexForm({ ...indexForm, unique: event.target.checked })}
                    className="accent-[var(--cds-interactive-01)]"
                  />
                  UNIQUE
                </label>
                <div className="ms-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={saveIndex}
                    className={`${smallButton} bg-[var(--cds-interactive-01)] text-white hover:opacity-90`}
                  >
                    {indexForm.editKey ? (isAr ? 'حفظ التعديل' : 'Save changes') : isAr ? 'أضف' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIndexForm(null); setError(''); }}
                    className={`${smallButton} border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]`}
                  >
                    <X className="w-3 h-3" /> {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
              <div>
                <span className={labelClass}>{isAr ? 'الأعمدة (بالترتيب)' : 'Columns (in order)'}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedTable?.columns ?? []).map(column => {
                    const active = indexForm.columns.includes(column.name);
                    return (
                      <button
                        key={column.name}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setIndexForm(current => {
                            if (!current) return current;
                            return {
                              ...current,
                              columns: active
                                ? current.columns.filter(name => name !== column.name)
                                : [...current.columns, column.name],
                            };
                          })
                        }
                        className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                          active
                            ? 'border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)]'
                            : 'border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                        }`}
                      >
                        {column.name}
                      </button>
                    );
                  })}
                  {(selectedTable?.columns ?? []).length === 0 && (
                    <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
                      {isAr ? 'الجدول بلا أعمدة — أضف حقلاً أولاً.' : 'This table has no columns yet — add one first.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {model.tables.map(table => {
            const indexes = table.indexes ?? [];
            if (indexes.length === 0) return null;
            return (
              <div key={table.id} className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                <div className="px-2 py-1 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[10px] font-mono font-bold text-[var(--cds-text-02)]" dir="ltr">
                  {table.name}
                </div>
                <div className="divide-y divide-[var(--cds-border-subtle)]">
                  {indexes.map((index, position) => {
                    const key = `idx:${indexKey(table.id, position)}`;
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-2 px-2 py-1">
                        <KeyRound className="w-3 h-3 text-[var(--cds-interactive-01)] shrink-0" />
                        <span className="text-[11px] font-mono text-[var(--cds-text-01)]" dir="ltr">{index.name}</span>
                        <span className="text-[10px] font-mono text-[var(--cds-text-03)]" dir="ltr">({index.columns.join(', ')})</span>
                        {index.unique && (
                          <span className="text-[9px] font-mono px-1 border border-[#42be65]/40 text-[#42be65]">UNIQUE</span>
                        )}
                        <div className="ms-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditIndex(table.id, position, index)}
                            title={isAr ? 'تعديل الفهرس' : 'Edit index'}
                            aria-label={isAr ? 'تعديل الفهرس' : 'Edit index'}
                            className="p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-interactive-01)] transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => armDelete(key, () => deleteIndex(table.id, position))}
                            title={armed === key ? (isAr ? 'انقر مرة أخرى للتأكيد' : 'Click again to confirm') : (isAr ? 'حذف الفهرس' : 'Delete index')}
                            aria-label={isAr ? 'حذف الفهرس' : 'Delete index'}
                            className={`p-1 transition-colors ${armed === key ? 'text-[#da1e28]' : 'text-[var(--cds-text-03)] hover:text-[#da1e28]'}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {indexCount === 0 && !indexForm && (
            <p className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'لا فهارس بعد — أضف فهرساً لتحسين الاستعلامات أو فرض فرادة مركّبة.' : 'No indexes yet — add one to speed up queries or enforce composite uniqueness.'}
            </p>
          )}
        </div>
      )}

      {/* ============================= العروض ============================= */}
      {tab === 'view' && (
        <div className="mt-2 space-y-2">
          {viewForm && (
            <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className={labelClass} htmlFor="view-name">{isAr ? 'اسم العرض' : 'View name'}</label>
                  <input
                    id="view-name"
                    value={viewForm.name}
                    onChange={event => setViewForm({ ...viewForm, name: event.target.value })}
                    placeholder="active_users"
                    dir="ltr"
                    className={`${inputClass} w-48`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="view-columns">{isAr ? 'أعمدة العرض (اختياري، بفواصل)' : 'View columns (optional, comma-separated)'}</label>
                  <input
                    id="view-columns"
                    value={viewForm.columns}
                    onChange={event => setViewForm({ ...viewForm, columns: event.target.value })}
                    placeholder="id, email"
                    dir="ltr"
                    className={`${inputClass} w-56`}
                  />
                </div>
                <div className="ms-auto flex items-center gap-1.5">
                  <button type="button" onClick={saveView} className={`${smallButton} bg-[var(--cds-interactive-01)] text-white hover:opacity-90`}>
                    {viewForm.editIndex !== null ? (isAr ? 'حفظ التعديل' : 'Save changes') : isAr ? 'أضف' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewForm(null); setError(''); }}
                    className={`${smallButton} border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]`}
                  >
                    <X className="w-3 h-3" /> {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="view-query">{isAr ? 'استعلام SELECT' : 'SELECT query'}</label>
                <textarea
                  id="view-query"
                  value={viewForm.query}
                  onChange={event => setViewForm({ ...viewForm, query: event.target.value })}
                  rows={4}
                  dir="ltr"
                  spellCheck={false}
                  className={`${inputClass} w-full resize-y leading-relaxed`}
                />
              </div>
            </div>
          )}

          {viewList.map((view, position) => {
            const key = `view:${position}:${view.name}`;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 px-2 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                <Eye className="w-3 h-3 text-[var(--cds-interactive-01)] shrink-0" />
                <span className="text-[11px] font-mono text-[var(--cds-text-01)]" dir="ltr">{view.name}</span>
                {view.columns && view.columns.length > 0 && (
                  <span className="text-[10px] font-mono text-[var(--cds-text-03)]" dir="ltr">({view.columns.join(', ')})</span>
                )}
                <span className="text-[10px] font-mono text-[var(--cds-text-03)] truncate max-w-[45%]" dir="ltr">{view.query.replace(/\s+/g, ' ').slice(0, 90)}</span>
                <div className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditView(position, view)}
                    title={isAr ? 'تعديل العرض' : 'Edit view'}
                    aria-label={isAr ? 'تعديل العرض' : 'Edit view'}
                    className="p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-interactive-01)] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => armDelete(key, () => deleteView(position))}
                    title={armed === key ? (isAr ? 'انقر مرة أخرى للتأكيد' : 'Click again to confirm') : (isAr ? 'حذف العرض' : 'Delete view')}
                    aria-label={isAr ? 'حذف العرض' : 'Delete view'}
                    className={`p-1 transition-colors ${armed === key ? 'text-[#da1e28]' : 'text-[var(--cds-text-03)] hover:text-[#da1e28]'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}

          {viewList.length === 0 && !viewForm && (
            <p className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'لا عروض بعد — العرض يحفظ استعلام SELECT قابلاً لإعادة الاستخدام.' : 'No views yet — a view stores a reusable SELECT query.'}
            </p>
          )}
        </div>
      )}

      {/* ============================ Triggers ============================ */}
      {tab === 'trigger' && (
        <div className="mt-2 space-y-2">
          {triggerForm && (
            <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className={labelClass} htmlFor="trg-name">{isAr ? 'اسم الـTrigger' : 'Trigger name'}</label>
                  <input
                    id="trg-name"
                    value={triggerForm.name}
                    onChange={event => setTriggerForm({ ...triggerForm, name: event.target.value })}
                    placeholder="trg_users_audit"
                    dir="ltr"
                    className={`${inputClass} w-48`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="trg-table">{isAr ? 'الجدول' : 'Table'}</label>
                  <select
                    id="trg-table"
                    value={triggerForm.table}
                    onChange={event => setTriggerForm({ ...triggerForm, table: event.target.value })}
                    className={`${inputClass} w-40`}
                  >
                    <option value="">{isAr ? 'بدون جدول' : 'No table'}</option>
                    {model.tables.map(table => <option key={table.id} value={table.name}>{table.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="trg-timing">{isAr ? 'التوقيت' : 'Timing'}</label>
                  <select
                    id="trg-timing"
                    value={triggerForm.timing}
                    onChange={event => setTriggerForm({ ...triggerForm, timing: event.target.value })}
                    className={`${inputClass} w-28`}
                  >
                    {TIMINGS.map(timing => <option key={timing} value={timing}>{timing}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="trg-event">{isAr ? 'الحدث' : 'Event'}</label>
                  <select
                    id="trg-event"
                    value={triggerForm.event}
                    onChange={event => setTriggerForm({ ...triggerForm, event: event.target.value })}
                    className={`${inputClass} w-28`}
                  >
                    {EVENTS.map(event => <option key={event} value={event}>{event}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setTriggerForm({ ...triggerForm, rawSql: draftTriggerSql })}
                  className={`${smallButton} border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:border-[var(--cds-interactive-01)]`}
                >
                  {isAr ? 'قالب من الحقول' : 'Template from fields'}
                </button>
                <div className="ms-auto flex items-center gap-1.5">
                  <button type="button" onClick={saveTrigger} className={`${smallButton} bg-[var(--cds-interactive-01)] text-white hover:opacity-90`}>
                    {triggerForm.editIndex !== null ? (isAr ? 'حفظ التعديل' : 'Save changes') : isAr ? 'أضف' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTriggerForm(null); setError(''); }}
                    className={`${smallButton} border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]`}
                  >
                    <X className="w-3 h-3" /> {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="trg-sql">{isAr ? 'تعريف SQL (يُنقل حرفياً)' : 'SQL definition (copied verbatim)'}</label>
                <textarea
                  id="trg-sql"
                  value={triggerForm.rawSql}
                  onChange={event => setTriggerForm({ ...triggerForm, rawSql: event.target.value })}
                  rows={5}
                  dir="ltr"
                  spellCheck={false}
                  placeholder="CREATE TRIGGER trg_users_audit AFTER INSERT ON users FOR EACH ROW ..."
                  className={`${inputClass} w-full resize-y leading-relaxed`}
                />
              </div>
              {!triggerForm.rawSql.trim() && (
                <p className="text-[10px] font-mono text-[#f1c21b]">
                  {isAr ? 'الحقول أعلاه تُنشئ قالباً فقط — عدّل الـSQL أو اضغط «قالب من الحقول» ثم احفظ.' : 'The fields above only build a template — edit the SQL or press “Template from fields”, then save.'}
                </p>
              )}
            </div>
          )}

          {triggerList.map((trigger, position) => {
            const key = `trg:${position}:${trigger.name}`;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 px-2 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                <Zap className="w-3 h-3 text-[var(--cds-interactive-01)] shrink-0" />
                <span className="text-[11px] font-mono text-[var(--cds-text-01)]" dir="ltr">{trigger.name}</span>
                {trigger.table && <span className="text-[10px] font-mono text-[var(--cds-text-03)]" dir="ltr">ON {trigger.table}</span>}
                {(trigger.timing || trigger.event) && (
                  <span className="text-[9px] font-mono px-1 border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]" dir="ltr">
                    {[trigger.timing, trigger.event].filter(Boolean).join(' ')}
                  </span>
                )}
                <span className="text-[10px] font-mono text-[var(--cds-text-03)] truncate max-w-[40%]" dir="ltr">{trigger.rawSql.replace(/\s+/g, ' ').slice(0, 90)}</span>
                <div className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditTrigger(position, trigger)}
                    title={isAr ? 'تعديل الـTrigger' : 'Edit trigger'}
                    aria-label={isAr ? 'تعديل الـTrigger' : 'Edit trigger'}
                    className="p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-interactive-01)] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => armDelete(key, () => deleteTrigger(position))}
                    title={armed === key ? (isAr ? 'انقر مرة أخرى للتأكيد' : 'Click again to confirm') : (isAr ? 'حذف الـTrigger' : 'Delete trigger')}
                    aria-label={isAr ? 'حذف الـTrigger' : 'Delete trigger'}
                    className={`p-1 transition-colors ${armed === key ? 'text-[#da1e28]' : 'text-[var(--cds-text-03)] hover:text-[#da1e28]'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}

          {triggerList.length === 0 && !triggerForm && (
            <p className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'لا Triggers بعد — التعريف الخام يُنقل كما هو إلى SQL النهائي.' : 'No triggers yet — the raw definition is copied into the final SQL as-is.'}
            </p>
          )}
        </div>
      )}

      {/* ======================= معاينة SQL مباشرة ======================= */}
      <div className="mt-3 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
        <div className="flex flex-wrap items-center gap-2 px-2 py-1 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-interactive-01)]">
            {isAr ? 'معاينة SQL مباشرة' : 'Live SQL preview'}
          </span>
          <span className="text-[9px] font-mono px-1 border border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]">
            {dialect.toUpperCase()}
          </span>
          <span className="ms-auto text-[9px] font-mono text-[var(--cds-text-03)]">
            {isAr ? 'يشمل التعديل غير المحفوظ' : 'Includes the unsaved draft'}
          </span>
        </div>
        <pre className="m-0 p-2 text-[10px] leading-relaxed font-mono text-[var(--cds-text-01)] max-h-52 overflow-auto text-left whitespace-pre-wrap" dir="ltr">
          {previewLines || (isAr ? '-- لا عبارات في هذا التبويب بعد' : '-- No statements in this tab yet')}
        </pre>
      </div>
    </div>
  );
};

export default SchemaObjectsPanel;
