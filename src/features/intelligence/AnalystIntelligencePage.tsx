/**
 * مختبر الذكاء التحليلي — واجهة واحدة تجمع 20 قدرة أُضيفت فوق المنصة.
 *
 * لماذا صفحة واحدة: القدرات مترابطة (تعريف المقياس ← سؤال توضيحي ← إثبات ←
 * نقد التمثيل)، وتفريقها على عشر صفحات كان سيجعل المستخدم لا يجدها. هنا كل
 * تبويب يُظهر: ماذا يفعل، ولماذا يستحق الاستخدام، ونتيجة حقيقية فورًا.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Brain, CheckCircle2, ClipboardCheck, Copy, Database,
  FlaskConical, FolderOpen, GitBranch, HelpCircle, History, Layers, Lightbulb, ListChecks, Lock,
  Radar, RefreshCw, Search, ShieldCheck, Scale, Sparkles, TrendingUp, Workflow as WorkflowIcon,
} from 'lucide-react';
import { getStoredToken } from '../auth/LoginPage';
import { useApp } from '../../context/AppContext';

// ---------------------------------------------------------------------------
// طبقة الاتصال — كل المسارات محميّة بالجلسة (Authorization: Bearer)
// ---------------------------------------------------------------------------

async function api<T>(path: string, body?: unknown, method: 'GET' | 'POST' | 'DELETE' = body ? 'POST' : 'GET'): Promise<T> {
  const token = getStoredToken();
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `فشل الطلب (${response.status})`);
  return data as T;
}

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const json = <T,>(text: string, fallback: T): T => {
  try { return JSON.parse(text) as T; } catch { return fallback; }
};
const numbers = (text: string) => text.split(/[,\n\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));

// ---------------------------------------------------------------------------
// مكوّنات عرض صغيرة — بنفس لغة تصميم المنصة (متغيّرات --cds-*)
// ---------------------------------------------------------------------------

const Card: React.FC<{ title: string; hint?: string; icon?: React.ElementType; children: React.ReactNode }> = ({ title, hint, icon: Icon, children }) => (
  <section className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-4 space-y-3">
    <header className="flex items-start gap-2">
      {Icon && <Icon size={16} className="mt-0.5 text-[var(--cds-interactive-01)] shrink-0" />}
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[var(--cds-text-01)]">{title}</h3>
        {hint && <p className="text-[11px] leading-relaxed text-[var(--cds-text-03)] mt-1">{hint}</p>}
      </div>
    </header>
    {children}
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-medium text-[var(--cds-text-02)]">{label}</span>
    {children}
  </label>
);

// السابق: متغيّر حقل (‎--cds-field-01‎) غير معرَّف في أي ثيم، مع سقوط إلى
// #f4f4f4 — رمادي فاتح تحته نص `text-01` الأبيض في الثيمات الداكنة، أي حقل
// غير مقروء. الآن تُستخدم متغيّرات الحقول الفعلية في المشروع.
const inputClass =
  'w-full rounded-lg border border-[var(--cds-border-strong)] bg-[var(--cds-input-bg)] px-3 py-2 text-xs text-[var(--cds-text-01)] placeholder:text-[var(--cds-text-03)] outline-none transition focus:border-[var(--cds-interactive-01)] focus:ring-1 focus:ring-[var(--cds-interactive-01)] disabled:opacity-60 disabled:cursor-not-allowed';

const Btn: React.FC<{ onClick: () => void; busy?: boolean; children: React.ReactNode; tone?: 'primary' | 'ghost' }> = ({ onClick, busy, children, tone = 'primary' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
      tone === 'primary'
        ? 'bg-[var(--cds-interactive-01)] text-white hover:opacity-90'
        : 'border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
    }`}
  >
    {busy ? '…' : children}
  </button>
);

const Err: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p className="text-[11px] text-[var(--cds-danger)] flex items-center gap-1">
      <AlertTriangle size={12} /> {message}
    </p>
  ) : null;

const Out: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre dir="auto" className="whitespace-pre-wrap break-words rounded-lg bg-[var(--cds-layer-02,#f4f4f4)] p-3 text-[11px] leading-relaxed text-[var(--cds-text-01)] max-h-72 overflow-auto">
    {children}
  </pre>
);

const Badge: React.FC<{ tone: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode }> = ({ tone, children }) => {
  const map = {
    ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    warn: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    bad: 'bg-red-500/10 text-red-600 border-red-500/30',
    info: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${map[tone]}`}>{children}</span>;
};

interface Metric {
  id: string; name: string; formula: string; grain: string; aliases: string[]; caveats: string[]; requiredFilters: string[]; currency?: string;
  status?: 'draft' | 'approved' | 'deprecated'; version?: number; owner?: string;
}

// ---------------------------------------------------------------------------
// 1) المقاييس: الطبقة الدلالية + تعارض التعريفات + حسم السؤال
// ---------------------------------------------------------------------------
const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', formula: '', grain: 'order', aliases: '', caveats: '', currency: '' });
  const [question, setQuestion] = useState('كم إيراد هذا الشهر؟');
  const [resolution, setResolution] = useState<any>(null);

  const load = async () => {
    try {
      const data = await api<{ metrics: Metric[]; conflicts: any[] }>('/api/analyst/metrics');
      setMetrics(data.metrics);
      setConflicts(data.conflicts);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/analyst/metrics', {
        metric: {
          ...form,
          aliases: form.aliases.split(',').map((s) => s.trim()).filter(Boolean),
          caveats: form.caveats.split(',').map((s) => s.trim()).filter(Boolean),
          sourceTables: [],
        },
      });
      setForm({ name: '', formula: '', grain: 'order', aliases: '', caveats: '', currency: '' });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const resolve = async () => {
    try {
      const data = await api<any>('/api/analyst/metrics/resolve', { question });
      setResolution(data.resolution);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={Layers} title="تعريف مقياس معتمد" hint="الصيغة والحبيبية والفلاتر تُعرَّف مرة واحدة، فكل سؤال لاحق يقرأ منها بدل أن يخترع تعريفًا جديدًا.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="الاسم"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الإيراد الصافي" /></Field>
          <Field label="الحبيبية">
            <select className={inputClass} value={form.grain} onChange={(e) => setForm({ ...form, grain: e.target.value })}>
              {['row', 'order', 'customer', 'day', 'week', 'month', 'quarter', 'year'].map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="الصيغة"><input className={inputClass} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="SUM(net_amount) / COUNT(DISTINCT order_id)" /></Field>
          <Field label="العملة"><input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" /></Field>
          <Field label="أسماء بديلة (بفاصلة)"><input className={inputClass} value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="revenue, إيراد, مبيعات" /></Field>
          <Field label="تحذيرات (بفاصلة)"><input className={inputClass} value={form.caveats} onChange={(e) => setForm({ ...form, caveats: e.target.value })} placeholder="بلا مرتجعات, بلا ضريبة" /></Field>
        </div>
        <Btn onClick={save} busy={busy}>حفظ المقياس</Btn>
        <Err message={error} />
      </Card>

      <Card icon={Search} title="حسم سؤال حرّ إلى مقياس" hint="إن وُجد أكثر من مقياس بنفس الاسم، يسأل بدل أن يخمّن — وهذا أهم فرق بين مساعد خبير ومولّد SQL.">
        <div className="flex gap-2">
          <input className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <Btn onClick={resolve}>حلّل</Btn>
        </div>
        {resolution && (
          <div className="space-y-2 text-[11px]">
            <Badge tone={resolution.chosen ? 'ok' : 'warn'}>{resolution.chosen ? `المقياس: ${resolution.chosen.name}` : 'غموض يحتاج سؤالًا'}</Badge>
            <p className="text-[var(--cds-text-02)]">{resolution.reason}</p>
            {resolution.clarifyingQuestion && <Out>{resolution.clarifyingQuestion}</Out>}
            {resolution.caveats?.length > 0 && <p className="text-[var(--cds-text-03)]">تحذيرات: {resolution.caveats.join(' — ')}</p>}
          </div>
        )}
      </Card>

      <Card icon={ListChecks} title={`المقاييس المعتمدة (${metrics.length})`} hint="أي مقياس هنا يُستخدم في التقارير كلها؛ حذفه يوقف الاعتماد عليه.">
        {metrics.length === 0 ? <p className="text-[11px] text-[var(--cds-text-03)]">لا مقاييس بعد — أضف واحدًا أعلاه.</p> : (
          <ul className="space-y-2">
            {metrics.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--cds-layer-02)] p-2">
                <div className="min-w-0 text-[11px]">
                  <p className="font-bold flex items-center gap-1.5 flex-wrap">
                    {m.name} <span className="text-[var(--cds-text-03)]">({m.grain})</span>
                    <Badge tone={m.status === 'approved' ? 'ok' : m.status === 'deprecated' ? 'bad' : 'warn'}>
                      {m.status === 'approved' ? 'معتمد' : m.status === 'deprecated' ? 'متقاعد' : 'مسودّة'} v{m.version || 1}
                    </Badge>
                    {m.owner && <span className="text-[10px] text-[var(--cds-text-03)]">المالك: {m.owner}</span>}
                  </p>
                  <code className="block truncate text-[10px] text-[var(--cds-text-02)]">{m.formula}</code>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {m.status !== 'approved' && (
                    <button
                      className="text-[10px] text-emerald-600 font-bold"
                      onClick={async () => {
                        try { await api(`/api/analyst/metrics/${m.id}/approve`, {}); await load(); }
                        catch (e) { setError((e as Error).message); }
                      }}
                    >اعتماد</button>
                  )}
                  <button className="text-[10px] text-red-500" onClick={async () => { await api(`/api/analyst/metrics/${m.id}`, undefined, 'DELETE'); await load(); }}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={AlertTriangle} title={`تعارضات التعريف (${conflicts.length})`} hint="نفس الاسم بصيغتين يعني أن تقريرين قد يعرضان رقمين مختلفين — الكشف هنا يمنع الجدل لاحقًا.">
        {conflicts.length === 0 ? <p className="text-[11px] text-emerald-600">لا تعارض: كل اسم له تعريف واحد.</p> : (
          <ul className="space-y-2 text-[11px]">
            {conflicts.map((c) => (
              <li key={c.name} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                <Badge tone={c.severity === 'high' ? 'bad' : 'warn'}>{c.name}</Badge>
                <p className="mt-1 text-[var(--cds-text-02)]">{c.note}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2) تدقيق البيانات + أول 10 دقائق
// ---------------------------------------------------------------------------
const rowsSample = `[
  {"city":"دمشق","sales":1200,"visits":40},
  {"city":"حلب","sales":980,"visits":31},
  {"city":"دمشق","sales":1200,"visits":40},
  {"city":"حمص","sales":-999,"visits":12}
]`;

const DossierPanel: React.FC = () => {
  const [text, setText] = useState(rowsSample);
  const [target, setTarget] = useState('');
  const [dossier, setDossier] = useState<any>(null);
  const [brief, setBrief] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** تشغيل الفحص على صفوف محدّدة — نفسه للمصدر الحقيقي واللصق. */
  const runRows = async (rows: any[], label?: string) => {
    setBusy(true);
    try {
      const data = await api<any>('/api/analyst/dossier', { rows, target: target || undefined });
      setDossier({ ...data.dossier, truncated: data.truncated, analyzedRows: data.analyzedRows });
      const onboarding = await api<any>('/api/analyst/onboarding', {
        profile: { rowCount: data.dossier.rowCount, columns: data.dossier.columns, qualityScore: data.dossier.qualityScore },
      });
      setBrief(onboarding.brief);
      setSourceName(label || null);
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const run = () => runRows(json<any[]>(text, []));

  /** قراءة مجموعة البيانات من الخادم بدل لصق الصفوف: المصدر الحقيقي للمستخدم. */
  const loadFromDataset = async () => {
    setBusy(true);
    try {
      const data = await api<any>('/api/analyst/dataset');
      setText(JSON.stringify(data.sampleRows ?? [], null, 2));
      setBusy(false);
      await runRows(data.sampleRows ?? [], `${data.dataset.name} (${data.dataset.rowCount.toLocaleString('en-US')} صفًا)`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const tone = dossier && dossier.qualityScore >= 80 ? 'ok' : dossier && dossier.qualityScore >= 55 ? 'warn' : 'bad';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={Database} title="ملف تدقيق البيانات" hint="صفوف JSON (أو نتيجة استعلامك). يُخرج مشكلات مرتّبة بالخطورة مع سببها وأثرها على الرقم.">
        <textarea className={`${inputClass} h-40 font-mono`} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
        <Field label="عمود الهدف (اختياري — يفتح فحص التسريب والتوازن)">
          <input className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="sales" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={run} busy={busy}>افحص البيانات</Btn>
          <Btn tone="ghost" onClick={loadFromDataset} busy={busy}>من مجموعة بياناتي</Btn>
        </div>
        <Err message={error} />
      </Card>

      <Card icon={ClipboardCheck} title="النتيجة" hint="كل مشكلة تحمل «لماذا يهم» و«كيف تُصلح» — لا أرقامًا بلا معنى.">
        {!dossier ? <p className="text-[11px] text-[var(--cds-text-03)]">شغّل الفحص لعرض النتيجة.</p> : (
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={tone as any}>جودة {dossier.qualityScore}/100</Badge>
              <span className="text-[var(--cds-text-02)]">{dossier.summary}</span>
            </div>
            {sourceName && (
              <p className="text-[10px] text-[var(--cds-text-03)]">
                المصدر: {sourceName}
                {dossier.analyzedRows ? ` — حُلّل ${dossier.analyzedRows.toLocaleString('en-US')} صفًا` : ''}
                {dossier.truncated ? ' (قُصّت الصفوف عند سقف الأمان)' : ''}
              </p>
            )}
            <ul className="space-y-2">
              {dossier.issues.slice(0, 8).map((issue: any) => (
                <li key={issue.id} className="rounded-lg border border-[var(--cds-border-subtle)] p-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={issue.severity === 'critical' ? 'bad' : issue.severity === 'high' ? 'warn' : 'info'}>{issue.severity}</Badge>
                    <span className="font-bold">{issue.title}</span>
                  </div>
                  <p className="mt-1 text-[var(--cds-text-02)]">{issue.why}</p>
                  <p className="mt-1 text-[var(--cds-text-03)]">الإصلاح: {issue.fix}</p>
                  {issue.impact && <p className="mt-1 text-[10px] text-[var(--cds-text-03)]">الأثر: {issue.impact}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {brief && (
        <Card icon={Sparkles} title="أول 10 دقائق" hint="أول ما يراه المستخدم بعد الاستيراد: ثلاث ملاحظات صحيحة + السؤال التالي المقترح.">
          <p className="text-xs font-bold">{brief.greeting}</p>
          <ul className="space-y-2 text-[11px]">
            {brief.insights.map((i: any) => (
              <li key={i.id} className="rounded-lg bg-[var(--cds-layer-02)] p-2">
                <p className="font-bold">{i.headline}</p>
                <p className="text-[var(--cds-text-02)]">{i.detail}</p>
                <p className="text-[10px] text-[var(--cds-text-03)]">الدليل: {i.evidence}</p>
                <p className="text-[10px] text-[var(--cds-interactive-01)]">اسأل بعدها: {i.nextQuestion}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[var(--cds-text-02)]">اللوحة المقترحة: {brief.suggestedDashboard.title} ({brief.suggestedDashboard.chart}) — {brief.suggestedDashboard.reason}</p>
        </Card>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3) الذاكرة
// ---------------------------------------------------------------------------
const MemoryPanel: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([]);
  const [form, setForm] = useState({ question: '', answer: '', outcome: 'positive', tags: '' });
  const [query, setQuery] = useState('إيراد الشهر الماضي');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { const d = await api<any>('/api/analyst/memory'); setEntries(d.entries); setError(null); }
    catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={Brain} title="أضف إلى ذاكرة المحلل" hint="كل تحليل يُخزَّن مع نتيجته وقراره — فيتذكّر المساعد ما جُرِّب ولماذا فشل.">
        <Field label="السؤال"><input className={inputClass} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></Field>
        <Field label="الاستنتاج"><textarea className={`${inputClass} h-20`} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="النتيجة">
            <select className={inputClass} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              <option value="positive">إيجابية</option>
              <option value="negative">سلبية/نُفيت</option>
              <option value="inconclusive">غير حاسمة</option>
            </select>
          </Field>
          <Field label="وسوم (بفاصلة)"><input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
        </div>
        <Btn onClick={async () => {
          try {
            await api('/api/analyst/memory', { ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) });
            setForm({ question: '', answer: '', outcome: 'positive', tags: '' });
            await load();
          } catch (e) { setError((e as Error).message); }
        }}>حفظ في الذاكرة</Btn>
        <Err message={error} />
      </Card>

      <Card icon={Search} title={`استرجاع بالصلة (${entries.length} عنصرًا)`} hint="البحث يعمل بالتشابه الدلالي على الكلمات لا بمطابقة حرفية، ويحذّرك إن جُرّب السؤال ونُفي.">
        <div className="flex gap-2">
          <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Btn onClick={async () => {
            try { setResult(await api<any>('/api/analyst/memory/search', { question: query })); }
            catch (e) { setError((e as Error).message); }
          }}>ابحث</Btn>
        </div>
        {result && (
          <div className="space-y-2 text-[11px]">
            {result.hits.length === 0 && <p className="text-[var(--cds-text-03)]">لا نتائج قريبة — سؤال جديد فعلًا.</p>}
            {result.hits.map((h: any) => (
              <div key={h.entry.id} className="rounded-lg bg-[var(--cds-layer-02)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{h.entry.question}</span>
                  <Badge tone="info">{Math.round(h.score * 100)}%</Badge>
                </div>
                <p className="text-[var(--cds-text-02)]">{h.entry.answer}</p>
                <p className="text-[10px] text-[var(--cds-text-03)]">{h.reason} • {new Date(h.entry.createdAt).toLocaleDateString('ar')}</p>
              </div>
            ))}
            {result.warnings?.map((w: any, i: number) => (
              <p key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700">{w.message}</p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4) الشذوذ
// ---------------------------------------------------------------------------
const AnomalyPanel: React.FC = () => {
  const [text, setText] = useState('2026-11-01,120\n2026-11-02,132\n2026-11-03,128\n2026-11-04,140\n2026-11-05,135\n2026-11-06,126\n2026-11-07,118\n2026-11-08,131\n2026-11-09,129\n2026-11-10,420');
  const [period, setPeriod] = useState(7);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  /** سلسلة حقيقية من مجموعة البيانات (عمود التسمية × عمود القيمة) بدل اللصق. */
  const loadFromDataset = async () => {
    try {
      const data = await api<any>('/api/analyst/dataset');
      const series = (data.series || []).slice(0, 400);
      if (!series.length) throw new Error('لا عمود رقمي في المجموعة — اختر مجموعة تحتوي قيمًا رقمية.');
      setText(series.map((p: any) => `${p.label},${p.value}`).join('\n'));
      setSourceNote(`${data.dataset.name} — ${data.numericColumns?.[0] || 'قيمة'} (${series.length} نقطة)`);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Card icon={Activity} title="كشف الشذوذ بعد فصل الاتجاه والموسمية" hint="لا عتبة ثابتة: يقارن كل نقطة بما كان متوقعًا لها، ثم يشرح الفرق. العتبة تُرفع تلقائيًا للسلاسل القصيرة تفاديًا للإنذارات الكاذبة.">
      <textarea className={`${inputClass} h-40 font-mono`} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder="label,value" />
      <div className="flex items-end gap-2">
        <Field label="الدورة الموسمية (أيام)"><input type="number" className={inputClass} value={period} onChange={(e) => setPeriod(Number(e.target.value))} /></Field>
        <Btn onClick={async () => {
          try {
            const series = lines(text).map((l) => { const [label, value] = l.split(','); return { label: label?.trim(), value: Number(value) }; });
            setResult(await api<any>('/api/analyst/anomalies', { series, period }));
            setError(null);
          } catch (e) { setError((e as Error).message); }
        }}>اكشف</Btn>
        <Btn tone="ghost" onClick={loadFromDataset}>من بياناتي</Btn>
      </div>
      {sourceNote && <p className="text-[10px] text-[var(--cds-text-03)]">المصدر: {sourceNote}</p>}
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <p className="font-bold">{result.report.summary}</p>
          {result.report.points.map((p: any) => (
            <div key={p.index} className="rounded-lg border border-[var(--cds-border-subtle)] p-2">
              <Badge tone={p.severity === 'high' ? 'bad' : 'warn'}>{p.direction === 'spike' ? 'ارتفاع' : 'انخفاض'} • z={p.score}</Badge>
              <p className="mt-1">{p.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 5) الصرامة الإحصائية + التجارب
// ---------------------------------------------------------------------------
const RigorPanel: React.FC = () => {
  const [values, setValues] = useState('12,15,11,18,14,13,17,16');
  const [claim, setClaim] = useState('النسخة الجديدة أفضل بشكل واضح وتؤدي إلى تحسّن المبيعات.');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={Scale} title="فترة ثقة + تدقيق عبارات" hint="كل متوسط بلا فترة ثقة هو ادّعاء بلا حدود؛ ونصّك يُفحص ضد الأرقام لا ضد الأسلوب.">
        <Field label="قيم رقمية (بفاصلة)"><input className={inputClass} dir="ltr" value={values} onChange={(e) => setValues(e.target.value)} /></Field>
        <Field label="العبارة المراد تدقيقها"><textarea className={`${inputClass} h-20`} value={claim} onChange={(e) => setClaim(e.target.value)} /></Field>
        <Btn onClick={async () => {
          try { setResult(await api<any>('/api/analyst/rigor', { values: numbers(values), text: claim })); setError(null); }
          catch (e) { setError((e as Error).message); }
        }}>افحص</Btn>
        <Err message={error} />
      </Card>
      <Card icon={ShieldCheck} title="النتيجة">
        {!result ? <p className="text-[11px] text-[var(--cds-text-03)]">شغّل الفحص.</p> : (
          <div className="space-y-2 text-[11px]">
            {result.interval && (
              <p>المتوسط {Number(result.mean).toFixed(2)} — فترة 95%: [{result.interval.lower.toFixed(2)}، {result.interval.upper.toFixed(2)}]، n={result.interval.n}، sd={Number(result.sd).toFixed(2)}</p>
            )}
            {result.findings?.length === 0 && <p className="text-emerald-600">لا ادّعاءات غير مسندة في النص.</p>}
            {result.findings?.map((f: any) => (
              <div key={f.id + f.claim} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                <Badge tone="warn">{f.id}</Badge>
                <p className="mt-1">{f.message}</p>
                <p className="text-[10px] text-[var(--cds-text-02)]">بديل: {f.rewrite}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const ExperimentPanel: React.FC = () => {
  const [form, setForm] = useState({ nA: 1000, cA: 100, nB: 1000, cB: 120 });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={FlaskConical} title="قراءة تجربة A/B بالاختبار المتسلسل" hint="قيمة p صالحة للاطّلاع اليومي — لا «فوز» وهمي عند النظر المتكرر. يفحص SRM قبل أي حكم، ثم المقاييس الحارسة.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([['nA', 'زوار الضابطة'], ['cA', 'تحويلات الضابطة'], ['nB', 'زوار المعالجة'], ['cB', 'تحويلات المعالجة']] as const).map(([key, label]) => (
          <Field key={key} label={label}>
            <input type="number" className={inputClass} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <Btn onClick={async () => {
        try {
          setResult(await api<any>('/api/analyst/experiment', {
            control: { name: 'control', visitors: form.nA, conversions: form.cA },
            treatment: { name: 'treatment', visitors: form.nB, conversions: form.cB },
          }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>اقرأ التجربة</Btn>
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <Badge tone={result.readout.verdict === 'ship' ? 'ok' : result.readout.verdict === 'invalid' ? 'bad' : 'warn'}>{result.readout.verdict}</Badge>
          <p className="font-bold">{result.readout.headline}</p>
          <p className="text-[var(--cds-text-02)]">p متسلسلة = {result.readout.primary.pValue.toFixed(4)} • تحسّن نسبي {result.readout.primary.relativeLiftPct.toFixed(2)}%</p>
          <p className="text-[10px] text-[var(--cds-text-03)]">{result.readout.peekingNote}</p>
          <p className="text-[10px]">زوار مطلوبون لكشف تحسّن 10%: {result.visitorsFor10pct?.toLocaleString('en-US')}</p>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 6) المُوضِّح + الإثبات
// ---------------------------------------------------------------------------
const ClarifyPanel: React.FC = () => {
  const [question, setQuestion] = useState('ما أداء المبيعات خلال الشهر الماضي مقارنة بالسابق؟');
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={HelpCircle} title="كشف الغموض قبل الإجابة" hint="سؤال واحد بخيارات، والباقي يُعلَن كافتراضات — لا افتراض صامت يقلب الرقم.">
      <input className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <Btn onClick={async () => {
        try { setPlan(await api<any>('/api/analyst/clarify', { question })); setError(null); }
        catch (e) { setError((e as Error).message); }
      }}>حلّل الغموض</Btn>
      <Err message={error} />
      {plan && (
        <div className="space-y-2 text-[11px]">
          {plan.plan.needsClarification ? (
            <>
              <Badge tone="warn">يحتاج توضيحًا</Badge>
              <Out>{plan.plan.prompt}</Out>
              {plan.plan.questions[0]?.defaultAssumption && <p className="text-[var(--cds-text-02)]">إن لم تُجب: {plan.plan.questions[0].defaultAssumption}</p>}
            </>
          ) : <Badge tone="ok">السؤال واضح بما يكفي</Badge>}
          {plan.footer && <p className="text-[10px] text-[var(--cds-text-03)]">{plan.footer}</p>}
        </div>
      )}
    </Card>
  );
};

const ProofPanel: React.FC = () => {
  const [form, setForm] = useState({ metricName: 'الإيراد الصافي', value: 128400, unit: 'USD', formula: 'SUM(net_amount) WHERE refunded = 0', grain: 'order', datasetName: 'sales_2026', updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString() });
  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={CheckCircle2} title="سلسلة إثبات لرقم" hint="رقم ← صيغة ← حبيبية ← فلاتر ← مصدر ← طزاجة، مع ما ينقص السلسلة بصراحة.">
        <div className="grid gap-2 sm:grid-cols-2">
          {([['metricName', 'المقياس'], ['value', 'القيمة'], ['formula', 'الصيغة'], ['grain', 'الحبيبية'], ['datasetName', 'المصدر'], ['unit', 'الوحدة']] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input className={inputClass} value={String((form as any)[key])} onChange={(e) => setForm({ ...form, [key]: key === 'value' ? Number(e.target.value) : e.target.value })} />
            </Field>
          ))}
        </div>
        <Btn onClick={async () => {
          try {
            setCard(await api<any>('/api/analyst/proof', {
              proof: { metricName: form.metricName, value: form.value, unit: form.unit, formula: form.formula, grain: form.grain, source: { datasetName: form.datasetName }, updatedAt: form.updatedAt, filters: [{ column: 'refunded', operator: '=', value: '0' }] },
            }));
            setError(null);
          } catch (e) { setError((e as Error).message); }
        }}>ابنِ الإثبات</Btn>
        <Err message={error} />
      </Card>
      <Card icon={ClipboardCheck} title="بطاقة الدليل">
        {!card ? <p className="text-[11px] text-[var(--cds-text-03)]">لم تُبنَ بعد.</p> : (
          <div className="space-y-2 text-[11px]">
            <Badge tone={card.readiness.ready ? 'ok' : 'warn'}>{card.readiness.ready ? 'جاهز للاجتماع' : 'ناقص'}</Badge>
            <p className="text-[var(--cds-text-02)]">{card.readiness.reason}</p>
            <Out>{card.card.shareText}</Out>
            <div className="flex flex-wrap gap-2">
              <Btn
                tone="ghost"
                onClick={async () => {
                  try {
                    await api('/api/analyst/proof/save', { card: card.card, metricName: form.metricName, value: form.value });
                    setSaved('حُفظت البطاقة — تجدها في تبويب «السجل والإثبات».');
                    setError(null);
                  } catch (e) { setError((e as Error).message); }
                }}
              >حفظ البطاقة</Btn>
              <Btn tone="ghost" onClick={() => void navigator.clipboard?.writeText(card.card.shareText)}>نسخ النص</Btn>
            </div>
            {saved && <p className="text-[10px] text-emerald-600">{saved}</p>}
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7) نقد التمثيل
// ---------------------------------------------------------------------------
const ChartCriticPanel: React.FC = () => {
  const [spec, setSpec] = useState({ type: 'pie', categories: 'A,B,C,D,E,F,G', values: '30,25,15,12,10,5,3', startsAtZero: true, dualAxis: false });
  const [verdict, setVerdict] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={BarChart3} title="افحص مخططك قبل اجتماعك" hint="محور مقطوع، محورَان للقيم، دائري بـ7 شرائح… كلها أخطاء تُقرأ كضعف تحليلي حتى لو كان الرقم صحيحًا.">
        <Field label="نوع المخطط">
          <select className={inputClass} value={spec.type} onChange={(e) => setSpec({ ...spec, type: e.target.value })}>
            {['line', 'bar', 'pie', 'donut', 'scatter', 'area', 'map', 'histogram'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="الفئات (بفاصلة)"><input className={inputClass} value={spec.categories} onChange={(e) => setSpec({ ...spec, categories: e.target.value })} /></Field>
        <Field label="القيم (بفاصلة)"><input className={inputClass} value={spec.values} onChange={(e) => setSpec({ ...spec, values: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={spec.dualAxis} onChange={(e) => setSpec({ ...spec, dualAxis: e.target.checked })} /> محوران للقيم (سلسلتان)
        </label>
        <Btn onClick={async () => {
          try {
            const categories = spec.categories.split(',').map((s) => s.trim());
            const values = spec.values.split(',').map((v) => Number(v));
            const series = spec.dualAxis
              ? [{ name: 'A', values, unit: 'ريال' }, { name: 'B', values: values.map((v) => v * 2), unit: 'عدد', axis: 'secondary' as const }]
              : [{ name: 'A', values, unit: 'ريال' }];
            setVerdict(await api<any>('/api/analyst/chart-critic', { spec: { type: spec.type, categories, series, title: 'مخطط', yAxis: { startsAtZero: spec.startsAtZero } } }));
            setError(null);
          } catch (e) { setError((e as Error).message); }
        }}>راجع المخطط</Btn>
        <Err message={error} />
      </Card>
      <Card icon={ListChecks} title="الملاحظات">
        {!verdict ? <p className="text-[11px] text-[var(--cds-text-03)]">شغّل المراجعة.</p> : (
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center gap-2">
              <Badge tone={verdict.verdict.score >= 80 ? 'ok' : verdict.verdict.score >= 55 ? 'warn' : 'bad'}>درجة {verdict.verdict.score}/100</Badge>
              <span>{verdict.verdict.summary}</span>
            </div>
            {verdict.verdict.findings.map((f: any) => (
              <div key={f.id} className="rounded-lg border border-[var(--cds-border-subtle)] p-2">
                <p className="font-bold">{f.issue}</p>
                <p className="text-[var(--cds-text-02)]">{f.why}</p>
                <p className="text-[10px] text-[var(--cds-text-03)]">الإصلاح: {f.fix}</p>
              </div>
            ))}
            {verdict.verdict.suggestion && <p className="text-[var(--cds-interactive-01)]">اقتراح: استخدم {verdict.verdict.suggestion.type} — {verdict.verdict.suggestion.reason}</p>}
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8) السيناريو + الأثر
// ---------------------------------------------------------------------------
const ScenarioPanel: React.FC = () => {
  const [form, setForm] = useState({ baseRevenue: 100000, basePrice: 50, baseUnits: 2000, priceChangePct: 5, marginPct: 40, elasticity: -1.2 });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={TrendingUp} title="ماذا لو رفعنا السعر؟ (بافتراضات معلنة)" hint="المرونة والهامش يُعلَنان صراحةً، والناتج نطاق لا رقم — أداة قرار لا عرّافة.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {([['baseRevenue', 'الإيراد الحالي'], ['basePrice', 'السعر'], ['baseUnits', 'الوحدات'], ['priceChangePct', '% تغيّر السعر'], ['marginPct', 'هامش المساهمة %'], ['elasticity', 'المرونة']] as const).map(([key, label]) => (
          <Field key={key} label={label}>
            <input type="number" step="0.1" className={inputClass} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <Btn onClick={async () => {
        try {
          setResult(await api<any>('/api/analyst/scenario', {
            scenario: {
              baseRevenue: form.baseRevenue, basePrice: form.basePrice, baseUnits: form.baseUnits,
              priceChangePct: form.priceChangePct, contributionMarginPct: form.marginPct,
              elasticity: { priceToDemand: form.elasticity, source: 'assumed', confidence: 'low' },
            },
          }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>احسب السيناريو</Btn>
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <p className="font-bold">{result.result.narrative}</p>
          {result.result.warnings.map((w: string, i: number) => <p key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">{w}</p>)}
          <Out>{result.result.assumptions.join('\n')}</Out>
        </div>
      )}
    </Card>
  );
};

const ImpactPanel: React.FC = () => {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: 'لوحة المبيعات', kind: 'dashboard', table: 'orders', columns: 'net_amount,city' });
  const [impact, setImpact] = useState({ table: 'orders', column: 'net_amount', change: 'drop-column' });
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { const d = await api<any>('/api/analyst/artifacts'); setArtifacts(d.artifacts); }
    catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <Card icon={GitBranch} title="من ينكسر لو غيّرنا المخطط؟" hint="سجّل التقارير/النماذج/المسارات ومصادرها، ثم اسأل عن عمود قبل حذفه. أرخص قيمة في الأتمتة وأكثرها إنقاذًا.">
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="اسم الأثر"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="النوع">
          <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {['report', 'dashboard', 'nl2sql', 'model', 'workflow', 'metric', 'view'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="الجدول"><input className={inputClass} value={form.table} onChange={(e) => setForm({ ...form, table: e.target.value })} /></Field>
        <Field label="الأعمدة (بفاصلة)"><input className={inputClass} value={form.columns} onChange={(e) => setForm({ ...form, columns: e.target.value })} /></Field>
      </div>
      <Btn tone="ghost" onClick={async () => {
        try {
          await api('/api/analyst/artifacts', { artifact: { name: form.name, kind: form.kind, reads: [{ table: form.table, columns: form.columns.split(',').map((c) => c.trim()) }] } });
          await load();
        } catch (e) { setError((e as Error).message); }
      }}>سجّل الأثر</Btn>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="جدول"><input className={inputClass} value={impact.table} onChange={(e) => setImpact({ ...impact, table: e.target.value })} /></Field>
        <Field label="عمود"><input className={inputClass} value={impact.column} onChange={(e) => setImpact({ ...impact, column: e.target.value })} /></Field>
        <Field label="التغيير">
          <select className={inputClass} value={impact.change} onChange={(e) => setImpact({ ...impact, change: e.target.value })}>
            {['drop-column', 'drop-table', 'rename-column', 'type-change'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Btn onClick={async () => {
        try { setReport(await api<any>('/api/analyst/artifacts/impact', { impact })); setError(null); }
        catch (e) { setError((e as Error).message); }
      }}>حلّل الأثر ({artifacts.length} أثرًا مسجّلًا)</Btn>
      <Err message={error} />
      {report && (
        <div className="space-y-2 text-[11px]">
          <Badge tone={report.report.verdict === 'safe' ? 'ok' : report.report.verdict === 'risky' ? 'warn' : 'bad'}>{report.report.verdict}</Badge>
          <p className="font-bold">{report.report.headline}</p>
          {report.report.impacted.map((i: any) => (
            <div key={i.artifact.id} className="rounded-lg bg-[var(--cds-layer-02)] p-2">
              <p className="font-bold">{i.artifact.name} <span className="text-[10px] text-[var(--cds-text-03)]">({i.artifact.kind})</span></p>
              <p>{i.reason}</p>
            </div>
          ))}
          {report.report.remediation.map((r: string, i: number) => <p key={i} className="text-[10px] text-[var(--cds-text-02)]">• {r}</p>)}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 9) الأتمتة + التقييم
// ---------------------------------------------------------------------------
const workflowSample = `{
  "id": "wf-demo",
  "name": "تقرير أسبوعي",
  "nodes": [
    {"id": "src", "kind": "source", "label": "قراءة الطلبات", "inputs": []},
    {"id": "agg", "kind": "sql", "label": "تجميع أسبوعي", "inputs": ["src"]},
    {"id": "ai", "kind": "ai", "label": "صياغة الملخص", "inputs": ["agg"], "costUsd": 0.02},
    {"id": "send", "kind": "notify", "label": "إرسال بالبريد", "inputs": ["ai"], "sideEffect": true}
  ],
  "edges": [{"from":"src","to":"agg"},{"from":"agg","to":"ai"},{"from":"ai","to":"send"}]
}`;

const WorkflowPanel: React.FC = () => {
  const [text, setText] = useState(workflowSample);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={WorkflowIcon} title="تحقّق مسار الأتمتة قبل تشغيله" hint="دورات، مراجع معلّقة، تكلفة، خطوات تحتاج تأكيدًا، ومفتاح منع تكرار — قبل أن يُرسل شيء بالخطأ.">
      <textarea className={`${inputClass} h-52 font-mono`} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
      <Btn onClick={async () => {
        try {
          const workflow = json<any>(text, {});
          setResult(await api<any>('/api/analyst/workflow/validate', { workflow, sampleRows: 100 }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>تحقّق</Btn>
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <Badge tone={result.plan.valid ? 'ok' : 'bad'}>{result.plan.valid ? 'صالح للتشغيل' : 'غير صالح'}</Badge>
          <p>{result.plan.summary}</p>
          <p className="text-[10px] text-[var(--cds-text-03)]">تكلفة {result.plan.estimatedCostUsd}$ • زمن {result.plan.estimatedMinutes} دقيقة • مفتاح التكرار {result.idempotencyKey}</p>
          {result.plan.issues.map((i: any) => (
            <div key={i.id} className="rounded-lg border border-[var(--cds-border-subtle)] p-2">
              <p className="font-bold">{i.severity} — {i.message}</p>
              <p className="text-[10px] text-[var(--cds-text-02)]">{i.fix}</p>
            </div>
          ))}
          {result.dryRun.steps.map((s: any) => (
            <p key={s.nodeId} className="text-[10px] text-[var(--cds-text-02)]">• {s.label}: {s.rowsIn} → {s.rowsOut} — {s.note}</p>
          ))}
        </div>
      )}
    </Card>
  );
};

const EvalPanel: React.FC = () => {
  const [cases, setCases] = useState<Array<{ id: string; question: string; expected: string; actual: string; task: string }>>([
    { id: 'g1', question: 'كم مبيعات آذار؟', expected: '12,400', actual: '12,410', task: 'reasoning' },
    { id: 'g2', question: 'من أفضل مدينة؟', expected: 'دمشق', actual: 'حلب', task: 'reasoning' },
  ]);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={ClipboardCheck} title="حاضنة تقييم (Golden Set)" hint="بدون قياس، «تحسين المساعد» ظنّ. كل حالة: سؤال + إجابة معتمدة + إجابة النظام، والنتيجة قابلة للمقارنة بين النسخ.">
      <div className="space-y-2">
        {cases.map((c, index) => (
          <div key={c.id} className="grid gap-2 rounded-lg bg-[var(--cds-layer-02)] p-2 sm:grid-cols-4">
            <input className={inputClass} value={c.question} onChange={(e) => setCases(cases.map((x, i) => (i === index ? { ...x, question: e.target.value } : x)))} placeholder="السؤال" />
            <input className={inputClass} value={c.expected} onChange={(e) => setCases(cases.map((x, i) => (i === index ? { ...x, expected: e.target.value } : x)))} placeholder="المعتمد" />
            <input className={inputClass} value={c.actual} onChange={(e) => setCases(cases.map((x, i) => (i === index ? { ...x, actual: e.target.value } : x)))} placeholder="إجابة النظام" />
            <button className="text-[10px] text-red-500" onClick={() => setCases(cases.filter((_, i) => i !== index))}>حذف</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Btn tone="ghost" onClick={() => setCases([...cases, { id: `g${cases.length + 1}`, question: '', expected: '', actual: '', task: 'reasoning' }])}>+ أضف حالة</Btn>
        <Btn onClick={async () => {
          try { setReport(await api<any>('/api/analyst/golden/evaluate', { cases })); setError(null); }
          catch (e) { setError((e as Error).message); }
        }}>قيّم</Btn>
      </div>
      <Err message={error} />
      {report && (
        <div className="space-y-1 text-[11px]">
          <Badge tone={report.report.accuracy >= 80 ? 'ok' : 'warn'}>دقة {report.report.accuracy}%</Badge>
          <p>{report.report.summary}</p>
          <p className="text-[10px] text-[var(--cds-text-02)]">التوجيه المقترح: {report.router.model} — {report.router.reason}</p>
          {report.report.failures.map((f: any) => <p key={f.caseId} className="text-[10px] text-[var(--cds-text-02)]">• {f.caseId}: {f.detail}</p>)}
          {report.trend && (
            <p className={`text-[10px] ${report.trend.regression ? 'text-red-600' : 'text-[var(--cds-text-03)]'}`}>
              {report.trend.prior === null
                ? 'أول لقطة — الأساس للمقارنات القادمة.'
                : `مقابل التشغيل السابق (${report.trend.prior}%): ${report.trend.delta > 0 ? '+' : ''}${report.trend.delta} نقطة${report.trend.regression ? ' — انحدار يستدعي مراجعة التعليمات' : ''}`}
            </p>
          )}
          <p className="text-[10px] text-[var(--cds-text-03)]">كل تشغيل يُحفظ كلقطة، ويهبّ تنبيه عند هبوط 5 نقاط أو أكثر.</p>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 10) الخصوصية + الحكم + السرد
// ---------------------------------------------------------------------------
const piiSample = `[
  {"name":"أحمد","email":"ahmad@example.com","phone":"+963991234567","amount":120},
  {"name":"سارة","email":"sara@example.com","phone":"+963998765432","amount":80}
]`;

const PrivacyPanel: React.FC = () => {
  const [text, setText] = useState(piiSample);
  const [allow, setAllow] = useState(false);
  const [decision, setDecision] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  /** تصدير يمرّ إلزاميًّا بحاجز الخصوصية على الخادم — لا تصدير خام من المتصفح. */
  const exportSafe = async () => {
    try {
      const token = getStoredToken();
      const response = await fetch('/api/analyst/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          rows: json<any[]>(text, []),
          format: 'csv',
          policy: { allowExternalWithPii: allow, maxRows: 500 },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `فشل التصدير (${response.status})`);
      }
      const csv = await response.text();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'analyst-export.csv';
      link.click();
      URL.revokeObjectURL(url);
      const dropped = decodeURIComponent(response.headers.get('X-Analyst-Dropped') || '');
      setExportNote(`صُدرت النسخة المقنّعة${dropped ? ` — أعمدة مستبعدة: ${dropped}` : ''}.`);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Card icon={Lock} title="هل يجوز إرسال هذه البيانات لنموذج خارجي؟" hint="يكشف الإيميل/الهاتف/الاسم/IBAN، ويُرسل نسخة مقنّعة فقط افتراضيًا، ويقترح المسار المحلي حين تلزم القيم نفسها.">
      <textarea className={`${inputClass} h-32 font-mono`} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
      <label className="flex items-center gap-2 text-[11px]">
        <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} /> السياسة تسمح بالبيانات الشخصية خارجيًّا
      </label>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={async () => {
          try {
            setDecision(await api<any>('/api/analyst/pii-gate', { rows: json<any[]>(text, []), policy: { allowExternalWithPii: allow, maxRows: 200 } }));
            setError(null);
          } catch (e) { setError((e as Error).message); }
        }}>افحص وأقنّع</Btn>
        <Btn tone="ghost" onClick={exportSafe}>تصدير آمن (CSV)</Btn>
      </div>
      <Err message={error} />
      {exportNote && <p className="text-[10px] text-emerald-600">{exportNote}</p>}
      {decision && (
        <div className="space-y-2 text-[11px]">
          <Badge tone={decision.decision.droppedColumns.length ? 'warn' : 'ok'}>{decision.decision.findings.length} عمودًا شخصيًّا</Badge>
          <p>{decision.decision.reason}</p>
          {decision.decision.requiredAction && <p className="text-[10px] text-[var(--cds-text-02)]">{decision.decision.requiredAction}</p>}
          <Out>{JSON.stringify(decision.decision.sanitizedRows, null, 2)}</Out>
        </div>
      )}
    </Card>
  );
};

const ArbiterPanel: React.FC = () => {
  const [a, setA] = useState({ author: 'التقرير المالي', value: 128400, filters: 'بلا مرتجعات', grain: 'order', period: 'نوفمبر' });
  const [b, setB] = useState({ author: 'لوحة التشغيل', value: 132900, filters: 'مع المرتجعات', grain: 'order', period: 'نوفمبر' });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={Scale} title="تحليلان متعارضان: أيّهما الصحيح؟" hint="يفصل «تعريف مختلف» عن «خطأ حقيقي» — الحكم الذي يوفّر اجتماعًا كاملًا.">
      <div className="grid gap-2 sm:grid-cols-2">
        {([[a, setA, 'التحليل الأول'], [b, setB, 'التحليل الثاني']] as const).map(([state, setter, label], index) => (
          <div key={index} className="space-y-2 rounded-lg bg-[var(--cds-layer-02)] p-2">
            <p className="text-[11px] font-bold">{label}</p>
            <Field label="الرقم"><input type="number" className={inputClass} value={state.value} onChange={(e) => setter({ ...state, value: Number(e.target.value) })} /></Field>
            <Field label="الفلاتر (بفاصلة)"><input className={inputClass} value={state.filters} onChange={(e) => setter({ ...state, filters: e.target.value })} /></Field>
            <Field label="الحبيبية"><input className={inputClass} value={state.grain} onChange={(e) => setter({ ...state, grain: e.target.value })} /></Field>
            <Field label="الفترة"><input className={inputClass} value={state.period} onChange={(e) => setter({ ...state, period: e.target.value })} /></Field>
          </div>
        ))}
      </div>
      <Btn onClick={async () => {
        try {
          const toClaim = (c: typeof a, id: string) => ({ id, author: c.author, value: c.value, filters: c.filters.split(',').map((f) => f.trim()).filter(Boolean), grain: c.grain, period: c.period });
          setResult(await api<any>('/api/analyst/arbitrate', { a: toClaim(a, 'a'), b: toClaim(b, 'b') }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>احكم</Btn>
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <Badge tone={result.arbitration.verdict === 'contradiction' ? 'bad' : result.arbitration.verdict === 'explainable' ? 'info' : 'ok'}>{result.arbitration.verdict}</Badge>
          <p className="font-bold">{result.arbitration.headline}</p>
          {result.arbitration.explanations.map((x: string, i: number) => <p key={i} className="text-[var(--cds-text-02)]">• {x}</p>)}
          <p className="text-[10px] text-[var(--cds-text-03)]">{result.arbitration.resolution}</p>
        </div>
      )}
    </Card>
  );
};

const NarrativePanel: React.FC = () => {
  const [signals, setSignals] = useState('الإيراد,128400,120000,higher\nالطلبات,1840,1950,higher\nزمن التجهيز,3.2,2.8,lower');
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={Lightbulb} title="تقرير أسبوعي بنبرة إنسان" hint="حركة + تفسير مرجَّح + ثلاث توصيات مرتّبة بالأثر، مع أسئلة مفتوحة لا يمكن الحكم فيها بعد.">
      <Field label="المقاييس: الاسم, الحالي, السابق, أفضل-عندما(higher/lower)">
        <textarea className={`${inputClass} h-24 font-mono`} dir="ltr" value={signals} onChange={(e) => setSignals(e.target.value)} />
      </Field>
      <Btn onClick={async () => {
        try {
          const parsed = lines(signals).map((l) => {
            const [name, current, previous, betterWhen] = l.split(',');
            return { name: name?.trim(), current: Number(current), previous: Number(previous), betterWhen: betterWhen?.trim() === 'lower' ? 'lower' : 'higher' };
          });
          setReport(await api<any>('/api/analyst/weekly', { signals: parsed }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>اكتب التقرير</Btn>
      <Err message={error} />
      {report && (
        <div className="space-y-2 text-[11px]">
          <p className="font-bold">{report.report.narrative}</p>
          {report.report.recommendations.map((r: any, i: number) => (
            <div key={i} className="rounded-lg bg-[var(--cds-layer-02)] p-2">
              <Badge tone={r.expectedImpact === 'high' ? 'warn' : 'info'}>{r.expectedImpact}</Badge>
              <p className="mt-1">{r.action}</p>
              <p className="text-[10px] text-[var(--cds-text-03)]">الدليل: {r.evidence} — الخطر: {r.risk}</p>
            </div>
          ))}
          {report.report.openQuestions.map((q: string, i: number) => <p key={i} className="text-[10px] text-[var(--cds-text-02)]">؟ {q}</p>)}
        </div>
      )}
    </Card>
  );
};

const ModelPanel: React.FC = () => {
  const [features, setFeatures] = useState('مدة الاشتراك,0.31,positive,12,شهر\nعدد الاستخدامات الأسبوعية,0.28,positive,3,استخدام\nشكاوى الدعم,0.18,negative,2,شكوى');
  const [target, setTarget] = useState('الاحتفاظ');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={Brain} title="تفسير النموذج باللغة الإنسانية" hint="«أهمية 0.31» لا تُفيد صاحب القرار؛ الجملة التي تُفيد: «الاحتفاظ يقفز بعد 3 استخدامات أسبوعية».">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="الهدف"><input className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="حجم البيانات (اختياري)"><input className={inputClass} placeholder="1200" id="model-rows" disabled /></Field>
      </div>
      <Field label="الميزات: الاسم, الأهمية, الاتجاه, العتبة, الوحدة">
        <textarea className={`${inputClass} h-24 font-mono`} dir="ltr" value={features} onChange={(e) => setFeatures(e.target.value)} />
      </Field>
      <Btn onClick={async () => {
        try {
          const parsed = lines(features).map((l) => {
            const [feature, importance, direction, threshold, unit] = l.split(',');
            return { feature: feature?.trim(), importance: Number(importance), direction: direction?.trim(), threshold: threshold ? Number(threshold) : undefined, unit: unit?.trim() || undefined };
          });
          setResult(await api<any>('/api/analyst/explain-model', { model: { target, task: 'classification', features: parsed } }));
          setError(null);
        } catch (e) { setError((e as Error).message); }
      }}>اشرح</Btn>
      <Err message={error} />
      {result && (
        <div className="space-y-2 text-[11px]">
          <p className="font-bold">{result.explanation.headline}</p>
          {result.explanation.paragraphs.map((p: string, i: number) => <p key={i} className="text-[var(--cds-text-02)]">{p}</p>)}
          {result.explanation.cautions.map((c: string, i: number) => <p key={i} className="text-[10px] text-amber-600">⚠ {c}</p>)}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 11) بياناتي: مصدر حقيقي + مراقبات مستمرة
// ---------------------------------------------------------------------------
const SourcesPanel: React.FC = () => {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [valueColumn, setValueColumn] = useState('');
  const [labelColumn, setLabelColumn] = useState('');
  const [period, setPeriod] = useState(7);
  const [sensitivity, setSensitivity] = useState<'normal' | 'strict'>('normal');
  const [sweep, setSweep] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMonitors = async () => {
    try { setMonitors((await api<any>('/api/analyst/monitors')).monitors); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    void api<any>('/api/analyst/datasets')
      .then((d) => {
        const list = d.datasets || [];
        setDatasets(list);
        // إشعار الشذوذ يفتح الصفحة على مجموعته تحديدًا (اكتبها NotificationBell).
        let focus: string | null = null;
        try {
          focus = localStorage.getItem('analyst_focus_dataset');
          if (focus) localStorage.removeItem('analyst_focus_dataset');
        } catch { /* التخزين غير متاح */ }
        const preferred = focus && list.some((x: any) => x.id === focus) ? focus : list[0]?.id;
        if (preferred) setSelected(preferred);
      })
      .catch((e) => setError((e as Error).message));
    void loadMonitors();
  }, []);

  useEffect(() => {
    if (!selected) return;
    void api<any>(`/api/analyst/dataset?id=${encodeURIComponent(selected)}`)
      .then((d) => {
        setDetail(d);
        setValueColumn((prev) => prev || d.numericColumns?.[0] || '');
        setLabelColumn((prev) => prev || d.labelColumns?.[0] || '');
      })
      .catch((e) => setError((e as Error).message));
  }, [selected]);

  const createMonitor = async () => {
    setBusy(true);
    try {
      await api('/api/analyst/monitors', {
        datasetId: selected,
        valueColumn,
        labelColumn: labelColumn || undefined,
        period,
        sensitivity,
      });
      await loadMonitors();
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const data = await api<any>('/api/analyst/monitors/run', {});
      setSweep(data.sweep);
      await loadMonitors();
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={FolderOpen} title="بياناتك، لا لصقك" hint="هنا تُقرأ مجموعة البيانات من الخادم ويُبنى منها مدخل كل أداة: عيّنة للعرض، أعمدة رقمية للسلاسل، تسميات للمقارنة.">
        <Field label="مجموعة البيانات">
          <select className={inputClass} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {datasets.length === 0 && <option value="">لا مجموعات محمّلة</option>}
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.rowCount.toLocaleString('en-US')} صف</option>)}
          </select>
        </Field>
        {detail && (
          <div className="space-y-2 text-[11px]">
            {detail.freshness && (
              <Badge tone={detail.freshness.level === 'fresh' ? 'ok' : detail.freshness.level === 'aging' ? 'warn' : detail.freshness.level === 'stale' ? 'bad' : 'info'}>
                {detail.freshness.labelAr}
              </Badge>
            )}
            <div className="flex flex-wrap gap-1">
              {detail.dataset.columns.slice(0, 14).map((c: any) => (
                <span key={c.name} className="rounded-md bg-[var(--cds-layer-02)] px-2 py-0.5 text-[10px] font-mono">{c.name}<span className="text-[var(--cds-text-03)]"> · {c.type}</span></span>
              ))}
            </div>
            <p className="text-[10px] text-[var(--cds-text-03)]">
              يحلّل {detail.dataset.analyzedRows.toLocaleString('en-US')} صفًا من {detail.dataset.rowCount.toLocaleString('en-US')}
              {detail.dataset.truncated ? ' (سقف الأمان)' : ''} — أعمدة رقمية: {detail.numericColumns.join('، ') || 'لا شيء'}
            </p>
            {detail.series?.length > 0 && (
              <Out>{detail.series.slice(0, 8).map((p: any) => `${p.label} → ${p.value}`).join('\n')}</Out>
            )}
          </div>
        )}
        <Err message={error} />
      </Card>

      <Card icon={Radar} title={`مراقبات الشذوذ (${monitors.length})`} hint="مراقب = مجموعة + عمود + دورة. يفحصه الخادم كل نصف ساعة ويُنبّه داخل المنصة عند نقطة شاذة جديدة، بلا فتح الصفحة.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="عمود القيمة (رقمي)">
            <select className={inputClass} value={valueColumn} onChange={(e) => setValueColumn(e.target.value)}>
              {(detail?.numericColumns || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
              {!detail?.numericColumns?.length && <option value="">لا أعمدة رقمية</option>}
            </select>
          </Field>
          <Field label="عمود التسمية/التاريخ">
            <select className={inputClass} value={labelColumn} onChange={(e) => setLabelColumn(e.target.value)}>
              <option value="">تلقائي</option>
              {(detail?.labelColumns || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="الدورة الموسمية (أيام)">
            <input type="number" className={inputClass} value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
          </Field>
          <Field label="الحساسية">
            <select className={inputClass} value={sensitivity} onChange={(e) => setSensitivity(e.target.value as 'normal' | 'strict')}>
              <option value="normal">عادية — الشذوذ القوي فقط</option>
              <option value="strict">مشدّدة — كل نقطة متوسطة</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={createMonitor} busy={busy}>أضف مراقبًا</Btn>
          <Btn tone="ghost" onClick={runNow} busy={busy}>افحص الآن</Btn>
        </div>
        {sweep && (
          <p className="text-[10px] text-[var(--cds-text-02)]">
            فُحص {sweep.checked} مراقبًا — {sweep.triggered} تنبيهًا جديدًا{sweep.skipped ? `، ${sweep.skipped} داخل فترة التهدئة` : ''}.
          </p>
        )}
        {monitors.length > 0 && (
          <ul className="space-y-2 text-[11px]">
            {monitors.map((m) => (
              <li key={m.id} className="rounded-lg bg-[var(--cds-layer-02)] p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{m.datasetName} · {m.valueColumn}</span>
                  <Badge tone={m.enabled ? 'ok' : 'info'}>{m.enabled ? 'يعمل' : 'موقوف'}</Badge>
                </div>
                <p className="text-[10px] text-[var(--cds-text-03)]">
                  دورة {m.period} • {m.sensitivity === 'strict' ? 'مشدّدة' : 'عادية'}
                  {m.lastCheckedAt ? ` • آخر فحص ${new Date(m.lastCheckedAt).toLocaleString('ar')}` : ' • لم يُفحص بعد'}
                  {m.lastScore !== null && m.lastScore !== undefined ? ` • آخر z=${m.lastScore}` : ''}
                </p>
                <div className="flex gap-3 text-[10px]">
                  <button className="text-[var(--cds-interactive-01)]" onClick={async () => { await api(`/api/analyst/monitors/${m.id}/toggle`, { enabled: !m.enabled }); await loadMonitors(); }}>
                    {m.enabled ? 'إيقاف' : 'تشغيل'}
                  </button>
                  <button className="text-red-500" onClick={async () => { await api(`/api/analyst/monitors/${m.id}`, undefined, 'DELETE'); await loadMonitors(); }}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 12) السجل والإثبات المحفوظ
// ---------------------------------------------------------------------------
const RunsPanel: React.FC = () => {
  const [runs, setRuns] = useState<any[]>([]);
  const [proofs, setProofs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const [r, p] = await Promise.all([
        api<any>('/api/analyst/runs?limit=40'),
        api<any>('/api/analyst/proofs'),
      ]);
      setRuns(r.runs || []);
      setProofs(p.proofs || []);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon={History} title={`سجل التشغيل (${runs.length})`} hint="ماذا شُغّل على بياناتك، ومتى، وبأي زمن استجابة. سجل يُقرأ داخل المنتج لا في ملف خادم.">
        <div className="flex gap-2">
          <Btn tone="ghost" onClick={load}><RefreshCw size={12} /></Btn>
        </div>
        <Err message={error} />
        {runs.length === 0 ? <p className="text-[11px] text-[var(--cds-text-03)]">لا تشغيلات بعد — شغّل أي أداة وستظهر هنا.</p> : (
          <ul className="space-y-1 text-[11px]">
            {runs.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--cds-layer-02)] p-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-[var(--cds-interactive-01)]">{r.tool}</p>
                  <p className="text-[var(--cds-text-02)] truncate">{r.summary}</p>
                </div>
                <div className="text-end shrink-0">
                  <Badge tone={r.status < 400 ? 'ok' : 'bad'}>{r.status}</Badge>
                  <p className="text-[9px] text-[var(--cds-text-03)]">{r.latencyMs}ms • {new Date(r.createdAt).toLocaleTimeString('ar')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={CheckCircle2} title={`بطاقات الإثبات المحفوظة (${proofs.length})`} hint="بطاقة إثبات محفوظة تُرفق بتقرير أو تُرسل في محادثة بعد أسبوع — الدليل لا يذوب في الواجهة.">
        {proofs.length === 0 ? <p className="text-[11px] text-[var(--cds-text-03)]">لا بطاقات محفوظة — ابنِ واحدة من تبويب «الغموض والإثبات» ثم احفظها.</p> : (
          <ul className="space-y-2 text-[11px]">
            {proofs.map((p) => (
              <li key={p.id} className="rounded-lg border border-[var(--cds-border-subtle)] p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{p.metricName}</span>
                  <span className="text-[10px] text-[var(--cds-text-03)]">{new Date(p.createdAt).toLocaleDateString('ar')}</span>
                </div>
                <p className="text-[10px] text-[var(--cds-text-02)] line-clamp-3">{p.card?.shareText}</p>
                <div className="flex gap-3 text-[10px]">
                  <button
                    className="text-[var(--cds-interactive-01)] inline-flex items-center gap-1"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(String(p.card?.shareText || ''));
                      setCopied(p.id);
                    }}
                  ><Copy size={11} /> نسخ</button>
                  <button className="text-red-500" onClick={async () => { await api(`/api/analyst/proofs/${p.id}`, undefined, 'DELETE'); await load(); }}>حذف</button>
                  {copied === p.id && <span className="text-emerald-600">نُسخ</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// الصفحة
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'sources', labelAr: 'بياناتي والمراقبات', labelEn: 'My data & monitors', icon: FolderOpen },
  { id: 'metrics', labelAr: 'المقاييس', labelEn: 'Metrics', icon: Layers },
  { id: 'data', labelAr: 'تدقيق البيانات', labelEn: 'Data audit', icon: Database },
  { id: 'memory', labelAr: 'ذاكرة المحلل', labelEn: 'Analyst memory', icon: Brain },
  { id: 'signals', labelAr: 'الشذوذ والتجارب', labelEn: 'Anomalies & tests', icon: Activity },
  { id: 'rigor', labelAr: 'الصرامة الإحصائية', labelEn: 'Statistical rigor', icon: Scale },
  { id: 'answers', labelAr: 'الغموض والإثبات', labelEn: 'Clarity & proof', icon: HelpCircle },
  { id: 'visuals', labelAr: 'التمثيل والسيناريو', labelEn: 'Charts & scenarios', icon: BarChart3 },
  { id: 'ops', labelAr: 'الأثر والأتمتة', labelEn: 'Impact & automation', icon: GitBranch },
  { id: 'quality', labelAr: 'التقييم والخصوصية', labelEn: 'Eval & privacy', icon: ClipboardCheck },
  { id: 'judgement', labelAr: 'الحكم والسرد', labelEn: 'Arbitration & narrative', icon: Sparkles },
  { id: 'runs', labelAr: 'السجل والإثبات', labelEn: 'Run log & proofs', icon: History },
] as const;

export const AnalystIntelligencePage: React.FC = () => {
  const { language } = useApp();
  const isAr = language === 'ar';
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('sources');
  const [overview, setOverview] = useState<{ metrics: number; memory: number; golden: number; artifacts: number; runs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<any>('/api/analyst/overview')
      .then((d) => setOverview(d.overview))
      .catch((e) => setError((e as Error).message));
  }, []);

  const counts = useMemo(() => [
    { labelAr: 'مقاييس', labelEn: 'metrics', value: overview?.metrics ?? 0 },
    { labelAr: 'ذاكرة', labelEn: 'memory', value: overview?.memory ?? 0 },
    { labelAr: 'ذهبية', labelEn: 'golden', value: overview?.golden ?? 0 },
    { labelAr: 'تشغيلات', labelEn: 'runs', value: overview?.runs ?? 0 },
  ], [overview]);

  return (
    <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--cds-text-01)] flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--cds-interactive-01)]" />
              {isAr ? 'مختبر الذكاء التحليلي' : 'Analyst Intelligence Lab'}
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--cds-text-03)] max-w-3xl">
              {isAr
                ? 'عشرون قدرة تعمل على بياناتك: طبقة مقاييس معتمدة، تحقّق ذاتي لـSQL، تدقيق جودة، ذاكرة تحليلات، كشف شذوذ بإسناد السبب ومراقبة مستمرة، صرامة إحصائية، اختبار A/B متسلسل، سؤال توضيحي واحد، سلسلة إثبات محفوظة، نقد تمثيل، سيناريوهات بافتراضات معلنة، أثر تغيير المخطط، موثوقية أتمتة، تقييم آلي مقابل مجموعة ذهبية، حاجز خصوصية وتصدير آمن، انطباع أول، محكّم بين تحليلين، تقرير أسبوعي، تفسير النموذج، وكشف تعارض التعريفات.'
                : 'Twenty capabilities running on your own data: governed metrics, SQL self-checks, quality audit, analyst memory, anomaly detection with attribution and continuous monitors, statistical rigor, sequential A/B reads, one clarifying question, saved proof chains, chart critique, declared-assumption scenarios, schema impact, workflow reliability, automated golden-set evaluation, a PII gate with safe export, first-ten-minutes onboarding, arbitration, weekly narrative, model explanation, and metric-conflict detection.'}
            </p>
          </div>
          <div className="flex gap-2">
            {counts.map((c) => (
              <div key={c.labelEn} className="rounded-lg bg-[var(--cds-layer-02)] px-3 py-2 text-center">
                <p className="text-sm font-bold text-[var(--cds-text-01)]">{c.value}</p>
                <p className="text-[10px] text-[var(--cds-text-03)]">{isAr ? c.labelAr : c.labelEn}</p>
              </div>
            ))}
          </div>
        </div>
        <Err message={error} />
      </header>

      <nav className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                active ? 'bg-[var(--cds-interactive-01)] text-white' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              <Icon size={13} /> {isAr ? t.labelAr : t.labelEn}
            </button>
          );
        })}
      </nav>

      {tab === 'sources' && <SourcesPanel />}
      {tab === 'metrics' && <MetricsPanel />}
      {tab === 'data' && <DossierPanel />}
      {tab === 'memory' && <MemoryPanel />}
      {tab === 'signals' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AnomalyPanel />
          <ExperimentPanel />
        </div>
      )}
      {tab === 'rigor' && <RigorPanel />}
      {tab === 'answers' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ClarifyPanel />
          <ProofPanel />
        </div>
      )}
      {tab === 'visuals' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCriticPanel />
          <ScenarioPanel />
        </div>
      )}
      {tab === 'ops' && (
        <div className="grid gap-4">
          <ImpactPanel />
          <WorkflowPanel />
        </div>
      )}
      {tab === 'quality' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EvalPanel />
          <PrivacyPanel />
        </div>
      )}
      {tab === 'judgement' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ArbiterPanel />
          <NarrativePanel />
          <ModelPanel />
        </div>
      )}
      {tab === 'runs' && <RunsPanel />}
    </div>
  );
};

export default AnalystIntelligencePage;
