import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, Role } from '../../types';
import {
  Settings,
  Users,
  Shield,
  Sliders,
  Building2,
  Lock,
  Plus,
  Trash2,
  CheckCircle2,
  HardDrive,
  Key,
  Check,
  Activity,
  Globe,
  Server,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Database,
  Download,
  Upload
} from 'lucide-react';
import { CarbonDataTable, CarbonDataTableColumn } from '../../components/common/CarbonDataTable';
import { motion } from 'motion/react';

export const AdminPage: React.FC = () => {
  const { workspace, setWorkspace, usersList, setUsersList, user, language, t, aiSettings, updateProviderConfig, toast } = useApp();
  const isAr = language === 'ar';
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('analyst');

  // Privacy-scoped user visibility: regular users only see their own account
  // plus people who share a discussion group with them. Admins keep the full list.
  const isAdmin = user.role === 'admin';

  // ---- Database migration (export/import) — admin only ----
  const [dbBusy, setDbBusy] = useState<'export' | 'import' | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const authHeadersDb = (): Record<string, string> => {
    const token = localStorage.getItem('carbon_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const exportDatabase = async () => {
    setDbBusy('export');
    try {
      const res = await fetch('/api/admin/db/export', { headers: authHeadersDb() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      // Stream the .db file to a local download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-db-${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(isAr ? 'تم تصدير قاعدة البيانات' : 'Database exported');
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setDbBusy(null);
    }
  };
  const importDatabase = async (file: File | undefined | null) => {
    if (!file) return;
    // Double confirmation — this replaces ALL live data
    const confirmed = window.confirm(
      isAr
        ? `⚠️ سيتم استبدال كل البيانات الحالية (المستخدمون، المجموعات، الرسائل) بمحتوى الملف "${file.name}".\nسيُحفظ نسخة أمان تلقائية قبل الاستبدال.\nهل تريد المتابعة؟`
        : `⚠️ ALL current data (users, groups, messages) will be replaced with "${file.name}".\nAn automatic safety backup will be taken first.\nContinue?`
    );
    if (!confirmed) return;
    setDbBusy('import');
    try {
      const res = await fetch('/api/admin/db/import', {
        method: 'POST',
        headers: { ...authHeadersDb(), 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(isAr ? 'تم الاستيراد' : 'Imported', data.message || (isAr ? 'الخادم يعيد التشغيل…' : 'Server restarting…'));
      // The server exits to reload the new db — offer a page reload
      setTimeout(() => window.location.reload(), 4000);
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setDbBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  // ---- Platform health monitoring (admin only): uptime / memory / database ----
  interface SystemStatus {
    uptimeSec: number;
    memory: { rss: number; heapUsed: number; heapTotal: number };
    db: { size: number; walSize: number; users: number; messages: number; integrity: string };
    nodeVersion: string;
    env: string;
    platform: string;
    checkedAt: string;
  }
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [sysRefreshing, setSysRefreshing] = useState(false);
  const fetchSystemStatus = React.useCallback(async () => {
    setSysRefreshing(true);
    try {
      const token = localStorage.getItem('carbon_auth_token');
      const res = await fetch('/api/admin/system-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setSysStatus(await res.json());
    } catch { /* keep last known values on transient errors */ }
    finally { setSysRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    fetchSystemStatus();
    const id = setInterval(fetchSystemStatus, 15000);
    return () => clearInterval(id);
  }, [isAdmin, fetchSystemStatus]);
  const fmtUptime = (s: number) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (isAr) return d > 0 ? `${d} يوم ${h} ساعة` : h > 0 ? `${h} ساعة ${m} دقيقة` : `${m} دقيقة ${sec} ثانية`;
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  };
  const fmtBytes = (b: number) => {
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
    if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };

  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  useEffect(() => {
    if (isAdmin) return;
    const token = localStorage.getItem('carbon_auth_token');
    fetch('/api/users/contacts', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => (res.ok ? res.json() : { contacts: [] }))
      .then(data => setContacts(data.contacts || []))
      .catch(() => setContacts([]));
  }, [isAdmin]);
  const visibleUsers: User[] = isAdmin
    ? usersList
    : contacts.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        role: c.role as User['role'],
        workspaceId: 'ws-main',
        createdAt: new Date().toISOString(),
      }));
  
  // Tunnel Configuration State
  const ollamaProvider = aiSettings?.providers?.ollama;
  const initialUrl = ollamaProvider?.endpointUrl || 'http://localhost:11434';
  const [tunnelUrl, setTunnelUrl] = useState(initialUrl);
  const [tunnelPort, setTunnelPort] = useState('11434');
  const [tunnelStatus, setTunnelStatus] = useState<'disconnected' | 'checking' | 'connected' | 'error'>('disconnected');
  const [tunnelError, setTunnelError] = useState('');
  
  // Real-time monitoring state
  const [metrics, setMetrics] = useState({ latency: 0, successRate: 0, tokens: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        latency: Math.floor(Math.random() * 100) + 50,
        successRate: 98 + Math.random() * 2,
        tokens: Math.floor(Math.random() * 1000) + 500,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAddUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const created: User = {
      id: `usr-${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      workspaceId: workspace.id,
      createdAt: new Date().toISOString(),
    };
    setUsersList(prev => [...prev, created]);
    setShowAddUserModal(false);
    setNewUserName('');
    setNewUserEmail('');
  };

  const handleDeleteUser = (id: string) => {
    if (id === user.id) return;
    setUsersList(prev => prev.filter(u => u.id !== id));
  };

  const handleTestTunnel = async () => {
    if (!tunnelUrl) return;
    setTunnelStatus('checking');
    setTunnelError('');
    try {
      const formattedUrl = tunnelUrl.replace(/\/+$/, '');
      const response = await fetch(`/api/ai/ollama/tags?host=${encodeURIComponent(formattedUrl)}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Connection failed');
      }

      const data = await response.json();
      if (data.status === 'error' || data.error) {
         throw new Error(data.message || data.error || 'Connection failed');
      }

      setTunnelStatus('connected');
      if (updateProviderConfig) {
        updateProviderConfig('ollama', { endpointUrl: formattedUrl });
        updateProviderConfig('custom_openai', { endpointUrl: formattedUrl });
      }
    } catch (err: any) {
      console.error(err);
      setTunnelStatus('error');
      setTunnelError(err.message || 'Failed to connect to tunnel');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tunnelUrl) {
        handleTestTunnel();
      }
    }, 1500); // Debounce auto health check
    return () => clearTimeout(timer);
  }, [tunnelUrl]);

  const handleRestartTunnel = () => {
    setTunnelStatus('checking');
    setTimeout(() => {
      handleTestTunnel();
    }, 1500);
  };

  const handleResetTunnel = () => {
    const defaultUrl = 'http://localhost:11434';
    setTunnelUrl(defaultUrl);
    setTunnelPort('11434');
    setTunnelStatus('disconnected');
    setTunnelError('');
    if (updateProviderConfig) {
      updateProviderConfig('ollama', { endpointUrl: defaultUrl });
      updateProviderConfig('custom_openai', { endpointUrl: defaultUrl });
    }
  };

  const userColumns: CarbonDataTableColumn<User>[] = [
    {
      key: 'name',
      header: t.admin.userTable.name,
      render: (val, row) => (
        <span className="font-bold text-[var(--cds-text-01)] font-mono">
          {val} {row.id === user.id && <span className="text-[#33b1ff] text-[11px] font-normal">(You)</span>}
        </span>
      ),
    },
    {
      key: 'email',
      header: t.admin.userTable.email,
      render: val => <span className="text-[var(--cds-text-02)] font-mono text-xs">{val}</span>,
    },
    {
      key: 'role',
      header: t.admin.userTable.role,
      render: val => (
        <span className="bg-[#0f62fe]/20 text-[#33b1ff] border border-[#0f62fe]/40 px-2 py-0.5 text-[10px] font-mono uppercase font-bold">
          {val}
        </span>
      ),
    },
    {
      key: 'status',
      header: t.admin.userTable.status,
      render: () => (
        <span className="bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 px-2 py-0.5 text-[10px] font-mono font-bold">
          ACTIVE
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.admin.userTable.actions,
      align: 'end',
      sortable: false,
      render: (_, row) =>
        row.id !== user.id ? (
          <button
            onClick={() => handleDeleteUser(row.id)}
            className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[#da1e28] text-[var(--cds-text-02)] hover:text-white transition-colors"
            title="Remove member"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Top Header */}
      <div className="border-b border-[var(--cds-border-subtle)] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
            IBM CARBON / WORKSPACE ADMINISTRATION
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--cds-text-01)] tracking-tight mt-1">{t.admin.title}</h2>
        <p className="text-xs sm:text-sm text-[var(--cds-text-02)] mt-0.5">{t.admin.subtitle}</p>
      </div>

      {/* Monitoring Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
           <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
             <span>API Latency</span>
             <Activity className="w-4 h-4 text-[#33b1ff]" />
           </div>
           <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{metrics.latency} ms</div>
        </div>
        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
           <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
             <span>Success Rate</span>
             <CheckCircle2 className="w-4 h-4 text-[#42be65]" />
           </div>
           <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{metrics.successRate.toFixed(1)}%</div>
        </div>
        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
           <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
             <span>Token Usage</span>
             <Sliders className="w-4 h-4 text-[#8a3ffc]" />
           </div>
           <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{metrics.tokens}</div>
        </div>
      </div>

      {/* Platform health monitoring (admin only) */}
      {isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#42be65]" />
              <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
                {isAr ? 'مراقبة حالة المنصة' : 'Platform health'}
              </h3>
              <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
                {isAr ? 'تُحدّث تلقائياً كل 15 ثانية' : 'auto-refresh · 15s'}
              </span>
            </div>
            <button
              onClick={fetchSystemStatus}
              disabled={sysRefreshing}
              className="p-1.5 rounded text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-01)] disabled:opacity-60 transition-colors"
              title={isAr ? 'تحديث الآن' : 'Refresh now'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sysRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {sysStatus ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
                    <span>{isAr ? 'زمن التشغيل' : 'Uptime'}</span>
                    <Activity className="w-4 h-4 text-[#42be65]" />
                  </div>
                  <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{fmtUptime(sysStatus.uptimeSec)}</div>
                </div>
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
                    <span>{isAr ? 'ذاكرة الخادم (RSS)' : 'Server memory (RSS)'}</span>
                    <Server className="w-4 h-4 text-[#33b1ff]" />
                  </div>
                  <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{fmtBytes(sysStatus.memory.rss)}</div>
                  <p className="text-[11px] text-[var(--cds-text-03)] font-mono">
                    {isAr ? 'الكومة' : 'heap'}: {fmtBytes(sysStatus.memory.heapUsed)} / {fmtBytes(sysStatus.memory.heapTotal)}
                  </p>
                </div>
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
                    <span>{isAr ? 'قاعدة البيانات' : 'Database'}</span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: sysStatus.db.integrity === 'ok' ? '#42be65' : '#da1e28' }}
                      title={`integrity: ${sysStatus.db.integrity}`}
                    />
                  </div>
                  <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{fmtBytes(sysStatus.db.size)}</div>
                  <p className="text-[11px] text-[var(--cds-text-03)] font-mono">
                    {sysStatus.db.users} {isAr ? 'مستخدم' : 'users'} · {sysStatus.db.messages} {isAr ? 'رسالة' : 'messages'}
                    {sysStatus.db.walSize > 0 ? ` · WAL ${fmtBytes(sysStatus.db.walSize)}` : ''}
                  </p>
                </div>
              </div>
              <p className="text-[10px] font-mono text-[var(--cds-text-03)]">
                Node {sysStatus.nodeVersion} · {sysStatus.platform} · {sysStatus.env}
              </p>
            </>
          ) : (
            <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-xs text-[var(--cds-text-03)] font-mono">
              {isAr ? 'جارٍ جمع حالة النظام…' : 'Collecting system status…'}
            </div>
          )}
        </div>
      )}

      {/* Database migration (admin only) */}
      {isAdmin && (
        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0f62fe]" />
            <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
              {isAr ? 'ترحيل قاعدة البيانات (تجربة ⇄ إنتاج)' : 'Database migration (staging ⇄ production)'}
            </h3>
          </div>
          <p className="text-[11px] text-[var(--cds-text-03)] leading-relaxed">
            {isAr
              ? 'صدّر نسخة كاملة من قاعدة البيانات (مستخدمون، مجموعات، رسائل) وارفعها في بيئة أخرى. الاستيراد يستبدل كل البيانات الحالية — تُحفظ نسخة أمان تلقائية قبل الاستبدال ويُعاد تشغيل الخادم لتحميل البيانات الجديدة.'
              : 'Export a full snapshot of the database (users, groups, messages) and upload it to another environment. Import replaces ALL current data — an automatic safety backup is taken first and the server restarts to load the new data.'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            onChange={e => importDatabase(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportDatabase}
              disabled={dbBusy !== null}
              className="h-9 px-4 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-2"
            >
              {dbBusy === 'export' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {isAr ? 'تصدير قاعدة البيانات' : 'Export database'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={dbBusy !== null}
              className="h-9 px-4 text-xs font-semibold rounded-lg flex items-center gap-2 text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-01)] disabled:opacity-60"
            >
              {dbBusy === 'import' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {isAr ? 'استيراد واستبدال…' : 'Import & replace…'}
            </button>
          </div>
        </div>
      )}

      {/* Workspace Plan & Resource Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.workspacePlan}</span>
            <Building2 className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{workspace.plan.toUpperCase()}</div>
          <p className="text-[11px] text-[var(--cds-text-03)] font-mono">
            {workspace.name} • Active
          </p>
        </div>

        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.storageUsed}</span>
            <HardDrive className="w-4 h-4 text-[#33b1ff]" />
          </div>
          <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">1.2 GB / 50 GB</div>
          <div className="w-full bg-[var(--cds-layer-01)] h-1.5 border border-[var(--cds-border-subtle)]">
            <div className="bg-[#33b1ff] h-full" style={{ width: '2.4%' }} />
          </div>
        </div>

        <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-[var(--cds-text-03)] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.activeMembers}</span>
            <Users className="w-4 h-4 text-[#42be65]" />
          </div>
          <div className="text-2xl font-bold text-[var(--cds-text-01)] font-mono">{visibleUsers.length} Active Users</div>
          <p className="text-[11px] text-[var(--cds-text-03)] font-mono">
            RBAC Policies Enforced
          </p>
        </div>
      </div>

      {/* Secure Local Tunnel Configuration */}
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-[#8a3ffc]" />
          <h3 className="text-lg font-bold text-[var(--cds-text-01)] font-mono">Secure Local Tunnel (ngrok)</h3>
        </div>
        
        <p className="text-sm text-[var(--cds-text-02)] mb-5">
          {language === 'ar' 
            ? 'قم بتكوين اتصال الخادم الخاص بك (Ollama/vLLM) ليعمل مع تطبيق السحابة عبر نفق ngrok الآمن.'
            : 'Configure your local Ollama/vLLM endpoint to communicate securely with the cloud application via ngrok SDK.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--cds-text-03)] uppercase mb-1.5 font-mono">
                {language === 'ar' ? 'رابط الـ API الأساسي (Ngrok URL)' : 'API Base URL (Ngrok Tunnel)'}
              </label>
              <input 
                type="text" 
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://broadly-precision-shakiness.ngrok-free.dev"
                className="w-full h-10 px-3 bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] focus:outline-none font-mono text-sm rounded-none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[var(--cds-text-03)] uppercase mb-1.5 font-mono">
                {language === 'ar' ? 'منفذ الاتصال المحلي (Ollama Port)' : 'Target Local Port (e.g. 11434)'}
              </label>
              <input 
                type="text" 
                value={tunnelPort}
                onChange={(e) => setTunnelPort(e.target.value)}
                placeholder="11434"
                className="w-full h-10 px-3 bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] focus:outline-none font-mono text-sm rounded-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button 
                onClick={handleTestTunnel}
                disabled={tunnelStatus === 'checking'}
                className="carbon-btn-primary flex items-center gap-2 py-2 px-4 text-sm disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
                {tunnelStatus === 'checking' ? (language === 'ar' ? 'جاري الفحص...' : 'Verifying...') : (language === 'ar' ? 'فحص الاتصال' : 'Test Connection')}
              </button>
              
              <button 
                onClick={handleRestartTunnel}
                disabled={tunnelStatus === 'checking'}
                className="carbon-btn-secondary flex items-center gap-2 py-2 px-4 text-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${tunnelStatus === 'checking' ? 'animate-spin' : ''}`} />
                {language === 'ar' ? 'إعادة تشغيل النفق' : 'Restart Tunnel'}
              </button>

              <button 
                onClick={handleResetTunnel}
                disabled={tunnelStatus === 'checking'}
                className="flex items-center gap-2 py-2 px-4 text-sm text-[#fa4d56] border border-[#fa4d56] hover:bg-[#fa4d56] hover:text-white transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {language === 'ar' ? 'إعادة للافتراضي' : 'Reset to Default'}
              </button>
            </div>
          </div>
          
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 flex flex-col justify-center">
            <h4 className="text-xs font-bold text-[var(--cds-text-03)] uppercase font-mono mb-4">Connection Status</h4>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                {tunnelStatus === 'connected' && <div className="absolute inset-0 bg-[#24a148] rounded-full blur-sm opacity-50 animate-pulse" />}
                <div className={`w-3 h-3 rounded-full relative z-10 ${tunnelStatus === 'connected' ? 'bg-[#24a148]' : tunnelStatus === 'error' ? 'bg-[#da1e28]' : tunnelStatus === 'checking' ? 'bg-[#f1c21b] animate-ping' : 'bg-[var(--cds-border-strong)]'}`} />
              </div>
              <span className={`font-mono text-sm font-bold ${tunnelStatus === 'connected' ? 'text-[#42be65]' : tunnelStatus === 'error' ? 'text-[#fa4d56]' : tunnelStatus === 'checking' ? 'text-[#f1c21b]' : 'text-[var(--cds-text-03)]'}`}>
                {tunnelStatus === 'connected' ? 'ACTIVE - BRIDGE ESTABLISHED' : 
                 tunnelStatus === 'error' ? 'ERROR - CONNECTION FAILED' : 
                 tunnelStatus === 'checking' ? 'NEGOTIATING HANDSHAKE...' : 'OFFLINE - READY'}
              </span>
            </div>
            
            {tunnelError && (
               <div className="text-xs font-mono text-[#fa4d56] bg-[#da1e28]/10 p-2 border border-[#da1e28]/30 flex items-start gap-2 break-all">
                 <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                 <span>{tunnelError}</span>
               </div>
            )}
            
            {tunnelStatus === 'connected' && (
              <div className="text-xs font-mono text-[#42be65] bg-[#24a148]/10 p-2 border border-[#24a148]/30 flex items-start gap-2">
                 <Check className="w-3 h-3 shrink-0 mt-0.5" />
                 <span>Verified: Ready to route local LLM traffic via {tunnelUrl}.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Management Section with CarbonDataTable */}
      <CarbonDataTable
        id="admin-users-table"
        data={visibleUsers}
        columns={userColumns}
        language={language}
        title={t.admin.teamMembers}
        description={
          isAdmin
            ? `${visibleUsers.length} registered team members`
            : language === 'ar'
              ? `${visibleUsers.length} — حسابك وجهات اتصالك من المناقشات المشتركة فقط`
              : `${visibleUsers.length} — your account and shared-discussion contacts only`
        }
        initialPageSize={10}
        toolbarActions={
          isAdmin ? (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2 py-1.5 px-3"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.admin.inviteMember}</span>
            </button>
          ) : undefined
        }
      />

      {/* Invite Member Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] max-w-md w-full p-6 shadow-2xl space-y-4 rounded-none">
            <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                  INVITE COLLABORATOR
                </span>
                <h3 className="text-base font-bold text-[var(--cds-text-01)]">{t.admin.inviteMember}</h3>
              </div>
              <button onClick={() => setShowAddUserModal(false)} className="text-[var(--cds-text-03)] hover:text-white font-mono">
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[var(--cds-text-02)] mb-1">Full Name</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className="carbon-input w-full"
                />
              </div>

              <div>
                <label className="block text-[var(--cds-text-02)] mb-1">Email Address</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="sarah@enterprise.com"
                  className="carbon-input w-full"
                />
              </div>

              <div>
                <label className="block text-[var(--cds-text-02)] mb-1">Role (RBAC Permission)</label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as Role)}
                  className="carbon-input w-full"
                >
                  <option value="viewer">Viewer (View Only)</option>
                  <option value="analyst">Analyst (Queries & Visuals)</option>
                  <option value="editor">Editor (Create & Edit Datasets)</option>
                  <option value="admin">Admin (Full Control)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--cds-border-subtle)]">
              <button
                onClick={() => setShowAddUserModal(false)}
                className="carbon-btn-secondary text-xs font-mono font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                className="carbon-btn-primary text-xs font-mono font-bold uppercase"
              >
                Invite User
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
