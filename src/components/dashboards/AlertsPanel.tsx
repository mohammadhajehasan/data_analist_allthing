import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Condition = 'above' | 'below' | 'change_above' | 'change_below';

interface AlertRow {
  id: string;
  dataset_id: string;
  dataset_name: string;
  column: string;
  condition: Condition;
  threshold: number;
  email: string;
  enabled: number;
  last_checked_at: string | null;
  last_value: number | null;
  last_triggered_at: string | null;
  created_at: string;
}

const CONDITIONS: Array<{ value: Condition; ar: string; en: string }> = [
  { value: 'above', ar: 'أعلى من', en: 'Above' },
  { value: 'below', ar: 'أدنى من', en: 'Below' },
  { value: 'change_above', ar: 'ارتفاع نسبي أكبر من', en: 'Rises more than' },
  { value: 'change_below', ar: 'انخفاض نسبي أكبر من', en: 'Falls more than' },
];

/**
 * تنبيهات القيم: تُحفظ خادمياً وتُفحص دورياً، فيصل البريد عند تجاوز الشرط
 * بدل أن يفتح المستخدم اللوحة كل يوم ليتحقق بنفسه.
 */
export const AlertsPanel: React.FC = () => {
  const { language, datasets, user, toast } = useApp();
  const ar = language === 'ar';
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [column, setColumn] = useState('');
  const [condition, setCondition] = useState<Condition>('above');
  const [threshold, setThreshold] = useState('0');
  const [email, setEmail] = useState('');

  const activeDataset = datasets.find((dataset) => dataset.id === datasetId) ?? datasets[0];
  const numericColumns = activeDataset
    ? activeDataset.columns.filter((column) => column.type === 'integer' || column.type === 'float')
    : [];

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/alerts', { credentials: 'include' });
      if (response.status === 401) {
        setAlerts([]);
        setError(ar ? 'سجّل الدخول لعرض التنبيهات.' : 'Sign in to see alerts.');
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      setAlerts(payload.alerts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    const first = numericColumns[0]?.name ?? '';
    if (column && numericColumns.some((item) => item.name === column)) return;
    setColumn(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, datasets]);

  const createAlert = async () => {
    if (!activeDataset || !column) {
      toast.warning(ar ? 'اختر مجموعة وعمودًا' : 'Pick a dataset and a column');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          datasetId: activeDataset.id,
          datasetName: activeDataset.name,
          column,
          condition,
          threshold: Number(threshold),
          email: email || user?.email,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      toast.success(ar ? 'أُنشئ التنبيه' : 'Alert created');
      await load();
    } catch (err) {
      toast.error(ar ? 'تعذّر إنشاء التنبيه' : 'Could not create the alert', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const removeAlert = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleAlert = async (alert: AlertRow) => {
    setBusy(true);
    try {
      await fetch(`/api/alerts/${alert.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: alert.enabled === 1 ? false : true }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/alerts/check-now', { method: 'POST', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      const result = payload.result as { checked: number; triggered: number; emails: number };
      toast.success(
        ar ? 'تم الفحص' : 'Check complete',
        ar
          ? `${result.checked} تنبيه · ${result.triggered} تجاوز · ${result.emails} بريد`
          : `${result.checked} checked · ${result.triggered} triggered · ${result.emails} emailed`
      );
      await load();
    } catch (err) {
      toast.error(ar ? 'تعذّر الفحص' : 'Check failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-5 space-y-4" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--cds-text-01)]">
          <Bell className="w-4 h-4 text-amber-500" />
          {ar ? 'تنبيهات القيم' : 'Value alerts'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={busy || alerts.length === 0}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
            {ar ? 'افحص الآن' : 'Check now'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)]"
          >
            {ar ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <label className="md:col-span-2 text-[11px] font-semibold text-[var(--cds-text-02)]">
          {ar ? 'المجموعة' : 'Dataset'}
          <select
            value={activeDataset?.id ?? ''}
            onChange={(event) => setDatasetId(event.target.value)}
            className="mt-1 w-full h-8 rounded-md bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 text-[11px] font-normal"
          >
            {datasets.length === 0 && <option value="">{ar ? 'لا توجد مجموعات' : 'No datasets'}</option>}
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-[var(--cds-text-02)]">
          {ar ? 'العمود' : 'Column'}
          <select
            value={column}
            onChange={(event) => setColumn(event.target.value)}
            className="mt-1 w-full h-8 rounded-md bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 text-[11px] font-normal"
          >
            {numericColumns.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-[var(--cds-text-02)]">
          {ar ? 'الشرط' : 'Condition'}
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value as Condition)}
            className="mt-1 w-full h-8 rounded-md bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 text-[11px] font-normal"
          >
            {CONDITIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {ar ? item.ar : item.en}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-[var(--cds-text-02)]">
          {ar ? 'الحد' : 'Threshold'}
          <input
            type="number"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="mt-1 w-full h-8 rounded-md bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 text-[11px] font-normal font-mono"
          />
        </label>
        <label className="text-[11px] font-semibold text-[var(--cds-text-02)]">
          {ar ? 'البريد' : 'Email'}
          <div className="flex items-center gap-1">
            <input
              type="email"
              value={email}
              placeholder={user?.email ?? ''}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full h-8 rounded-md bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 text-[11px] font-normal"
            />
            <button
              type="button"
              onClick={() => void createAlert()}
              disabled={busy || datasets.length === 0}
              className="mt-1 h-8 px-2 rounded-md bg-amber-500 text-black font-bold text-[11px] disabled:opacity-50 flex items-center gap-1"
              title={ar ? 'إضافة تنبيه' : 'Add alert'}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </label>
      </div>

      {error && (
        <div className="text-[11px] text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-md px-2.5 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[11px] text-[var(--cds-text-03)] flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {ar ? 'جارٍ التحميل…' : 'Loading…'}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-[11px] text-[var(--cds-text-03)]">
          {ar
            ? 'لا توجد تنبيهات بعد. أنشئ تنبيهًا ليصلك بريد عند تجاوز القيمة للحد الذي تحدده.'
            : 'No alerts yet. Create one and you will be emailed when the value crosses your threshold.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[var(--cds-text-03)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-start px-2 py-1.5">{ar ? 'المجموعة' : 'Dataset'}</th>
                <th className="text-start px-2 py-1.5">{ar ? 'العمود' : 'Column'}</th>
                <th className="text-start px-2 py-1.5">{ar ? 'الشرط' : 'Condition'}</th>
                <th className="text-start px-2 py-1.5">{ar ? 'آخر قيمة' : 'Last value'}</th>
                <th className="text-start px-2 py-1.5">{ar ? 'آخر فحص' : 'Checked'}</th>
                <th className="text-start px-2 py-1.5">{ar ? 'آخر تنبيه' : 'Triggered'}</th>
                <th className="text-end px-2 py-1.5">{ar ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-t border-[var(--cds-border-subtle)]/60 text-[var(--cds-text-01)]">
                  <td className="px-2 py-1.5 font-semibold">{alert.dataset_name}</td>
                  <td className="px-2 py-1.5 font-mono">{alert.column}</td>
                  <td className="px-2 py-1.5">
                    {(ar ? CONDITIONS.find((c) => c.value === alert.condition)?.ar : CONDITIONS.find((c) => c.value === alert.condition)?.en) ?? alert.condition}{' '}
                    <span className="font-mono">{alert.threshold}</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono">{alert.last_value ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {alert.last_checked_at ? alert.last_checked_at.slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {alert.last_triggered_at ? alert.last_triggered_at.slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void toggleAlert(alert)}
                        className={`p-1 rounded ${alert.enabled === 1 ? 'text-emerald-600' : 'text-[var(--cds-text-03)]'}`}
                        title={alert.enabled === 1 ? (ar ? 'مفعّل — إيقاف' : 'Enabled — pause') : ar ? 'متوقف — تفعيل' : 'Paused — enable'}
                      >
                        {alert.enabled === 1 ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAlert(alert.id)}
                        className="p-1 rounded text-rose-500"
                        title={ar ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-[var(--cds-text-03)] flex items-center gap-1.5">
        <Check className="w-3 h-3" />
        {ar
          ? 'الفحص يعمل تلقائيًا كل ساعة على الخادم، وبريد واحد لكل تنبيه كل 6 ساعات كحد أقصى.'
          : 'The server sweeps alerts hourly, with at most one email per alert every 6 hours.'}
      </div>
    </div>
  );
};

export default AlertsPanel;
