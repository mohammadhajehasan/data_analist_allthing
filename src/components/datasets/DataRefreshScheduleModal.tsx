import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  RefreshCw,
  Clock,
  Radio,
  X,
  Play,
  CheckCircle,
  AlertTriangle,
  Globe,
  Database,
  Sliders,
  Sparkles,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react';
import { ScheduledDataRefresh } from '../../types';

export const DataRefreshScheduleModal: React.FC = () => {
  const {
    isRefreshModalOpen,
    setIsRefreshModalOpen,
    datasets,
    scheduledRefreshes,
    saveScheduledRefresh,
    deleteScheduledRefresh,
    executeDataRefresh,
    language,
    formatDate,
  } = useApp();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    datasets[0]?.id || ''
  );
  const [interval, setInterval] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '1d' | 'manual'>('5m');
  const [apiUrl, setApiUrl] = useState('https://api.enterprise-analytics.internal/v2/stream/feed');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [autoImpute, setAutoImpute] = useState(true);
  const [notifyOnAnomaly, setNotifyOnAnomaly] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);

  if (!isRefreshModalOpen) return null;

  const currentDataset = datasets.find(d => d.id === selectedDatasetId);
  const existingSchedule = scheduledRefreshes.find(r => r.datasetId === selectedDatasetId);

  const getIntervalMinutes = (intVal: string) => {
    switch (intVal) {
      case '1m': return 1;
      case '5m': return 5;
      case '15m': return 15;
      case '30m': return 30;
      case '1h': return 60;
      case '6h': return 360;
      case '1d': return 1440;
      default: return 0;
    }
  };

  const handleSaveSchedule = () => {
    if (!currentDataset) return;
    const item: ScheduledDataRefresh = {
      id: existingSchedule ? existingSchedule.id : `ref-${Date.now()}`,
      datasetId: currentDataset.id,
      datasetName: currentDataset.name,
      apiUrl,
      method,
      interval,
      intervalMinutes: getIntervalMinutes(interval),
      enabled: true,
      status: 'connected',
      lastRefreshAt: new Date().toISOString(),
      nextRefreshAt: new Date(Date.now() + getIntervalMinutes(interval) * 60000).toISOString(),
      autoImpute,
      notifyOnAnomaly,
    };

    saveScheduledRefresh(item);
    setIsRefreshModalOpen(false);
  };

  const handleTestRunNow = async (datasetId: string) => {
    setIsExecuting(true);
    await executeDataRefresh(datasetId);
    setIsExecuting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-3xl bg-[#161616] text-[#f4f4f4] border border-[#393939] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        id="data-refresh-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#393939] bg-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#009d9a]/15 text-[#009d9a]">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">
                {language === 'ar' ? 'نظام التحديث التلقائي للبيانات (Data Refresh & Live Sync)' : 'Scheduled Data Refresh & Live API Sync'}
              </h3>
              <p className="text-xs text-[#8d8d8d]">
                {language === 'ar'
                  ? 'جدولة المزامنة الحية لمصادر البيانات عبر API ومراقبة مؤشرات الاتصال الفوري'
                  : 'Automate periodic API streaming, data ingestion, and monitor live connection health'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsRefreshModalOpen(false)}
            className="p-1.5 text-[#c6c6c6] hover:text-white hover:bg-[#393939] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Active Refreshes Overview Cards */}
          <div>
            <h4 className="text-xs font-semibold text-[#c6c6c6] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#009d9a]" />
              <span>{language === 'ar' ? 'حالة المصادر المرتبطة والمجدولة' : 'Active Connected Feeds'}</span>
            </h4>

            <div className="space-y-2">
              {scheduledRefreshes.length === 0 ? (
                <div className="p-4 bg-[#262626] text-center text-xs text-[#8d8d8d]">
                  {language === 'ar' ? 'لا توجد مصادر مجدولة حالياً.' : 'No active refresh schedules.'}
                </div>
              ) : (
                scheduledRefreshes.map(r => (
                  <div
                    key={r.id}
                    className="p-3.5 bg-[#262626] border border-[#393939] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      {/* Connection status indicator */}
                      <div className="relative">
                        <span
                          className={`w-3 h-3 rounded-full block ${
                            r.status === 'connected'
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                              : r.status === 'syncing'
                              ? 'bg-amber-400 animate-ping'
                              : 'bg-red-500'
                          }`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{r.datasetName}</span>
                          <span className="px-2 py-0.5 rounded bg-[#161616] text-[#009d9a] font-mono text-[10px] border border-[#393939]">
                            {r.interval}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8d8d8d] truncate max-w-sm mt-0.5 font-mono">
                          {r.apiUrl || 'Internal Stream'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-[#8d8d8d] block">
                          {language === 'ar' ? 'آخر مزامنة' : 'Last sync'}
                        </span>
                        <span className="text-[11px] text-white">
                          {r.lastRefreshAt ? formatDate(r.lastRefreshAt, { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleTestRunNow(r.datasetId)}
                        disabled={isExecuting}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#393939] hover:bg-[#4c4c4c] text-white rounded text-xs transition"
                        title={language === 'ar' ? 'تحديث فوري' : 'Sync now'}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin text-[#009d9a]' : ''}`} />
                        <span>{language === 'ar' ? 'تحديث الآن' : 'Sync'}</span>
                      </button>

                      <button
                        onClick={() => deleteScheduledRefresh(r.id)}
                        className="p-1.5 text-[#8d8d8d] hover:text-red-400 transition"
                        title={language === 'ar' ? 'إلغاء' : 'Remove'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schedule Configuration Form */}
          <div className="p-4 bg-[#262626] border border-[#393939] space-y-4">
            <h4 className="text-xs font-semibold text-[#f4f4f4] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0f62fe]" />
              <span>{language === 'ar' ? 'إنشاء أو تعديل جدولة تحديث لمجموعة بيانات' : 'Configure New Refresh Schedule'}</span>
            </h4>

            {/* Target Dataset Selection */}
            <div>
              <label className="block text-xs font-medium text-[#c6c6c6] mb-1">
                {language === 'ar' ? 'مجموعة البيانات المستهدفة' : 'Target Dataset'}
              </label>
              <select
                value={selectedDatasetId}
                onChange={e => setSelectedDatasetId(e.target.value)}
                className="w-full bg-[#161616] border border-[#393939] focus:border-[#0f62fe] px-3 py-2 text-xs text-white outline-hidden"
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.rowCount || d.data?.length || 0} {language === 'ar' ? 'سجل' : 'rows'})
                  </option>
                ))}
              </select>
            </div>

            {/* API Endpoint & Method */}
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-[#c6c6c6] mb-1">
                  {language === 'ar' ? 'البروتوكول' : 'Method'}
                </label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as any)}
                  className="w-full bg-[#161616] border border-[#393939] focus:border-[#0f62fe] px-3 py-2 text-xs text-white outline-hidden"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>

              <div className="col-span-3">
                <label className="block text-xs font-medium text-[#c6c6c6] mb-1">
                  {language === 'ar' ? 'رابط الواجهة البرمجية (REST / GraphQL API Endpoint)' : 'API Endpoint URL'}
                </label>
                <div className="flex items-center bg-[#161616] border border-[#393939] px-2.5">
                  <Globe className="w-3.5 h-3.5 text-[#8d8d8d] ml-1 shrink-0" />
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://api.enterprise.com/v1/metrics"
                    className="w-full bg-transparent p-2 text-xs text-white font-mono outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Interval Preset Buttons */}
            <div>
              <label className="block text-xs font-medium text-[#c6c6c6] mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#009d9a]" />
                <span>{language === 'ar' ? 'تكرار التحديث التلقائي' : 'Refresh Frequency'}</span>
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {(['1m', '5m', '15m', '30m', '1h', '6h', '1d'] as const).map(intOption => (
                  <button
                    key={intOption}
                    type="button"
                    onClick={() => setInterval(intOption)}
                    className={`py-1.5 px-2 text-xs font-medium rounded-none border transition ${
                      interval === intOption
                        ? 'bg-[#009d9a] text-white border-[#009d9a]'
                        : 'bg-[#161616] text-[#c6c6c6] border-[#393939] hover:bg-[#333]'
                    }`}
                  >
                    {intOption}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Auto Processing Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-[#161616] border border-[#333]">
                <input
                  type="checkbox"
                  checked={autoImpute}
                  onChange={e => setAutoImpute(e.target.checked)}
                  className="rounded text-[#0f62fe] focus:ring-0"
                />
                <span className="text-xs text-[#c6c6c6]">
                  {language === 'ar' ? 'تنظيف وتعويض القيم المفقودة آلياً' : 'Auto-impute missing values'}
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-[#161616] border border-[#333]">
                <input
                  type="checkbox"
                  checked={notifyOnAnomaly}
                  onChange={e => setNotifyOnAnomaly(e.target.checked)}
                  className="rounded text-[#0f62fe] focus:ring-0"
                />
                <span className="text-xs text-[#c6c6c6]">
                  {language === 'ar' ? 'تنبيه فوري عند اكتشاف شذوذ إحصائي' : 'Alert on anomaly detection'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#393939] bg-[#262626]">
          <button
            onClick={() => setIsRefreshModalOpen(false)}
            className="px-4 py-2 text-xs font-medium text-[#c6c6c6] hover:bg-[#393939] transition"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>

          <button
            onClick={handleSaveSchedule}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#009d9a] text-white text-xs font-semibold hover:bg-[#007d79] transition"
            id="save-refresh-schedule-btn"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{language === 'ar' ? 'حفظ وتفعيل الجدولة' : 'Save & Activate Schedule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
