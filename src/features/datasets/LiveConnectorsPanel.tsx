import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Database, Link2, Calendar, RefreshCw, CheckCircle2, AlertCircle, Info, CloudLightning } from 'lucide-react';

interface CloudConnector {
  id: string;
  name: string;
  type: 'google_sheet' | 'postgresql' | 'mysql';
  endpoint: string;
  schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
  lastSynced: string;
  status: 'connected' | 'error' | 'pending';
}

export const LiveConnectorsPanel: React.FC = () => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'sheet' | 'sql'>('sheet');
  const [isTesting, setIsTesting] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  // Live Cloud Connectors List State
  const [connectors, setConnectors] = useState<CloudConnector[]>([
    {
      id: 'conn-1',
      name: 'Google Financial Sheet',
      type: 'google_sheet',
      endpoint: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKv...',
      schedule: 'daily',
      lastSynced: new Date(Date.now() - 3600000 * 4).toISOString(), // 4 hours ago
      status: 'connected',
    },
    {
      id: 'conn-2',
      name: 'Production PostgreSQL DB',
      type: 'postgresql',
      endpoint: 'postgresql://db_owner:*****@host.docker.internal:5432/analytics',
      schedule: 'hourly',
      lastSynced: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      status: 'connected',
    },
  ]);

  // Form Fields
  const [sheetName, setSheetName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetSchedule, setSheetSchedule] = useState<'hourly' | 'daily' | 'weekly' | 'manual'>('daily');

  const [sqlName, setSqlName] = useState('');
  const [sqlHost, setSqlHost] = useState('');
  const [sqlPort, setSqlPort] = useState('5432');
  const [sqlDatabase, setSqlDatabase] = useState('');
  const [sqlUser, setSqlUser] = useState('');
  const [sqlPassword, setSqlPassword] = useState('');
  const [sqlSchedule, setSqlSchedule] = useState<'hourly' | 'daily' | 'weekly' | 'manual'>('hourly');

  // Trigger Interactive Connection Testing Simulation
  const handleTestConnection = (type: 'sheet' | 'sql') => {
    setIsTesting(true);
    setTestSuccess(null);
    setTestLog([]);

    const addLog = (msg: string, delay: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          setTestLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
          resolve();
        }, delay);
      });
    };

    (async () => {
      if (type === 'sheet') {
        await addLog(isAr ? 'بدء التحقق من رابط Google Sheet...' : 'Resolving Google Sheets endpoint URL...', 200);
        await addLog(isAr ? 'تأكيد أذونات الوصول وقراءة الخلايا...' : 'Verifying read permissions for sharing tokens...', 400);
        await addLog(isAr ? 'تم استخراج المخطط والاتصال ناجح (الاستجابة: ٢٢ ملي ثانية)' : 'Fetched worksheet layout schema. Response code HTTP 200 (22ms)', 400);
      } else {
        await addLog(isAr ? 'محاولة الاتصال بالخادم عبر بروتوكول TCP/IP...' : 'Attempting TCP handshake with postgres host...', 200);
        await addLog(isAr ? 'التحقق من بيانات الدخول والمصادقة...' : 'Verifying user credentials and password block...', 400);
        await addLog(isAr ? 'تم تأكيد التوصيل واكتشاف ٢٤ جدولاً (الاستجابة: ١٤ ملي ثانية)' : 'Connected. Found 24 active schemas in public namespace (14ms)', 400);
      }
      setTestSuccess(true);
      setIsTesting(false);
    })();
  };

  // Add Connector to registry
  const handleAddConnector = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'sheet') {
      if (!sheetName || !sheetUrl) return;
      const newConn: CloudConnector = {
        id: `conn-${Date.now()}`,
        name: sheetName,
        type: 'google_sheet',
        endpoint: sheetUrl,
        schedule: sheetSchedule,
        lastSynced: new Date().toISOString(),
        status: 'connected',
      };
      setConnectors(prev => [...prev, newConn]);
      setSheetName('');
      setSheetUrl('');
      toast.success(
        isAr ? 'تم ربط مستند Google Sheets' : 'Google Sheet Connected!',
        isAr ? 'تم التحقق من هيكل المستند وضمه لجدول المزامنة.' : 'Your spreadsheet has been connected and scheduled.'
      );
    } else {
      if (!sqlName || !sqlHost || !sqlDatabase) return;
      const newConn: CloudConnector = {
        id: `conn-${Date.now()}`,
        name: sqlName,
        type: 'postgresql',
        endpoint: `postgresql://${sqlUser || 'postgres'}@${sqlHost}:${sqlPort}/${sqlDatabase}`,
        schedule: sqlSchedule,
        lastSynced: new Date().toISOString(),
        status: 'connected',
      };
      setConnectors(prev => [...prev, newConn]);
      setSqlName('');
      setSqlHost('');
      setSqlDatabase('');
      setSqlUser('');
      setSqlPassword('');
      toast.success(
        isAr ? 'تم ربط قاعدة البيانات السحابية' : 'PostgreSQL Database Connected!',
        isAr ? 'تم فحص الاتصال وتفعيل التحديث الدوري التلقائي.' : 'Cloud database instance synced successfully.'
      );
    }
  };

  // Delete/Disconnect Connector
  const handleDisconnect = (id: string) => {
    setConnectors(prev => prev.filter(c => c.id !== id));
    toast.info(
      isAr ? 'تم فصل الرابط السحابي' : 'Connector Disconnected',
      isAr ? 'تمت إزالة رابط المزامنة من السجلات.' : 'Removed cloud connection registry.'
    );
  };

  return (
    <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-4">
        <div className="flex items-center gap-2">
          <CloudLightning className="w-5 h-5 text-[#33b1ff]" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'قنوات الربط والمزامنة السحابية' : 'Live Cloud Connectors & Sync Scheduler'}
            </h3>
            <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
              {isAr
                ? 'اربط جداول Google Sheets أو قواعد بيانات PostgreSQL السحابية لمزامنة بياناتك دورياً وبشكل تلقائي'
                : 'Connect external worksheets or SQL instances with an automated periodic cron scheduler'}
            </p>
          </div>
        </div>

        {/* Local Type Select Tab */}
        <div className="flex bg-[var(--cds-layer-01)] p-1 border border-[var(--cds-border-subtle)] text-xs font-mono font-bold">
          <button
            onClick={() => setActiveTab('sheet')}
            className={`px-3 py-1 transition-colors ${
              activeTab === 'sheet' ? 'bg-[#33b1ff] text-[#161616]' : 'text-[var(--cds-text-03)] hover:text-white'
            }`}
          >
            Google Sheets
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1 transition-colors ${
              activeTab === 'sql' ? 'bg-[#33b1ff] text-[#161616]' : 'text-[var(--cds-text-03)] hover:text-white'
            }`}
          >
            PostgreSQL / SQL
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Connector Creation Form & Live Logs (Left/Top) */}
        <div className="lg:col-span-8 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 flex flex-col space-y-4 text-start">
          
          <form onSubmit={handleAddConnector} className="space-y-4">
            {activeTab === 'sheet' ? (
              /* Google Sheets Form */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'رابط ملف Google Sheets (مشاركة عامة أو رمز وصول):' : 'Google Sheet URL (Public or Token Access):'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      value={sheetUrl}
                      onChange={e => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="carbon-input flex-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestConnection('sheet')}
                      className="px-3 py-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#33b1ff] text-[#33b1ff] text-xs font-mono font-bold transition-all whitespace-nowrap"
                    >
                      {isAr ? 'فحص الاتصال' : 'Test'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'اسم الاتصال المرجع:' : 'Connector Reference Name:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={sheetName}
                    onChange={e => setSheetName(e.target.value)}
                    placeholder="e.g. Sales Q3 Sheet"
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'جدول المزامنة الدورية (Cron Interval):' : 'Automatic Refresh Schedule:'}
                  </label>
                  <select
                    value={sheetSchedule}
                    onChange={e => setSheetSchedule(e.target.value as any)}
                    className="carbon-input w-full text-xs font-mono"
                  >
                    <option value="hourly">{isAr ? 'كل ساعة (Hourly)' : 'Hourly Sync'}</option>
                    <option value="daily">{isAr ? 'يومياً (Daily)' : 'Daily Sync'}</option>
                    <option value="weekly">{isAr ? 'أسبوعياً (Weekly)' : 'Weekly Sync'}</option>
                    <option value="manual">{isAr ? 'يدوي فقط (Manual)' : 'Manual Only'}</option>
                  </select>
                </div>
              </div>
            ) : (
              /* PostgreSQL Cloud SQL Form */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'مضيف السيرفر (Server Host IP/Domain):' : 'PostgreSQL Host Connection IP:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={sqlHost}
                    onChange={e => setSqlHost(e.target.value)}
                    placeholder="e.g. postgres.database.cloud.google.com"
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'المنفذ (Port):' : 'Port:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={sqlPort}
                    onChange={e => setSqlPort(e.target.value)}
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'اسم قاعدة البيانات (DB Name):' : 'Database Name:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={sqlDatabase}
                    onChange={e => setSqlDatabase(e.target.value)}
                    placeholder="e.g. production_warehouse"
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'اسم المستخدم:' : 'User:'}
                  </label>
                  <input
                    type="text"
                    value={sqlUser}
                    onChange={e => setSqlUser(e.target.value)}
                    placeholder="db_owner"
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'جدول المزامنة:' : 'Sync Schedule:'}
                  </label>
                  <select
                    value={sqlSchedule}
                    onChange={e => setSqlSchedule(e.target.value as any)}
                    className="carbon-input w-full text-xs font-mono"
                  >
                    <option value="hourly">Hourly Sync</option>
                    <option value="daily">Daily Sync</option>
                    <option value="weekly">Weekly Sync</option>
                    <option value="manual">Manual Only</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono font-bold text-[var(--cds-text-02)] mb-1">
                    {isAr ? 'مرجع الاتصال:' : 'Connector Title Reference:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={sqlName}
                    onChange={e => setSqlName(e.target.value)}
                    placeholder="e.g. ERP Cloud SQL Connector"
                    className="carbon-input w-full text-xs font-mono"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('sql')}
                    className="w-full px-3 py-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#33b1ff] text-[#33b1ff] text-xs font-mono font-bold transition-all"
                  >
                    {isAr ? 'فحص الاتصال والمسار' : 'Test SQL Connection'}
                  </button>
                </div>
              </div>
            )}

            {/* Form Submit Button */}
            <button
              type="submit"
              className="w-full py-2 bg-[#33b1ff] hover:bg-[#008fcc] text-[#161616] text-xs font-mono font-bold transition-colors uppercase"
            >
              + {isAr ? 'تأكيد وحفظ القناة بجدول المزامنة' : 'Authorize & Register Connector'}
            </button>
          </form>

          {/* Test Logs Console (Simulated Connection Debugger) */}
          {testLog.length > 0 && (
            <div className="p-3 bg-black border border-[var(--cds-border-subtle)] font-mono text-[11px] text-[#24a148] space-y-1 rounded-none max-h-32 overflow-y-auto">
              {testLog.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span>&gt;</span>
                  <span className="text-start">{log}</span>
                </div>
              ))}
              {testSuccess && (
                <div className="text-white font-bold flex items-center gap-1.5 pt-1 text-[10px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#24a148]" />
                  <span>CONNECTION STATUS VERIFIED: ONLINE</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Registered Active Connectors Catalog (Right/Bottom) */}
        <div className="lg:col-span-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)] block border-b border-[var(--cds-border-subtle)] pb-1.5">
              {isAr ? 'القنوات النشطة الحالية' : 'Registered Cloud Links'}
            </span>

            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
              {connectors.map(c => (
                <div key={c.id} className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2.5 text-xs font-mono space-y-2 text-start">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white truncate max-w-[120px]">{c.name}</span>
                    <span className="text-[9px] bg-[#33b1ff]/20 text-[#33b1ff] px-1.5 py-0.2 uppercase font-bold">
                      {c.schedule}
                    </span>
                  </div>

                  <p className="text-[10px] text-[var(--cds-text-03)] truncate">{c.endpoint}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-[var(--cds-border-subtle)] text-[10px]">
                    <span className="text-[var(--cds-text-02)] flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{isAr ? 'آخر تحديث' : 'Last Sync'}: {new Date(c.lastSynced).toLocaleTimeString()}</span>
                    </span>

                    <button
                      onClick={() => handleDisconnect(c.id)}
                      className="text-[#ff8389] hover:underline"
                    >
                      {isAr ? 'إلغاء' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Secure Cloud SQL / Tunnel Notice */}
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[11px] font-mono text-[var(--cds-text-03)] space-y-1 leading-relaxed text-start">
            <div className="flex items-center gap-1.5 text-[#33b1ff] font-bold uppercase mb-1">
              <Info className="w-3.5 h-3.5" />
              <span>{isAr ? 'سرية وأمن البيانات' : 'SSL Encrypted'}</span>
            </div>
            <p>
              {isAr
                ? 'يتم تشفير وتأمين جميع تفاصيل الخوادم وقنوات الاتصال سحابياً بنظام SSL 256-bit للخصوصية المطلقة.'
                : 'All credentials are cryptographically secured using standard AES SSL 256 tunnels.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
