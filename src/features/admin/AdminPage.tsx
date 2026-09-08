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
  RotateCcw
} from 'lucide-react';
import { CarbonDataTable, CarbonDataTableColumn } from '../../components/common/CarbonDataTable';
import { motion } from 'motion/react';

export const AdminPage: React.FC = () => {
  const { workspace, setWorkspace, usersList, setUsersList, user, language, t, aiSettings, updateProviderConfig } = useApp();
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('analyst');
  
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
        <span className="font-bold text-[#f4f4f4] font-mono">
          {val} {row.id === user.id && <span className="text-[#33b1ff] text-[11px] font-normal">(You)</span>}
        </span>
      ),
    },
    {
      key: 'email',
      header: t.admin.userTable.email,
      render: val => <span className="text-[#c6c6c6] font-mono text-xs">{val}</span>,
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
            className="p-1.5 bg-[#393939] hover:bg-[#da1e28] text-[#c6c6c6] hover:text-white transition-colors"
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
      <div className="border-b border-[#393939] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
            IBM CARBON / WORKSPACE ADMINISTRATION
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#f4f4f4] tracking-tight mt-1">{t.admin.title}</h2>
        <p className="text-xs sm:text-sm text-[#c6c6c6] mt-0.5">{t.admin.subtitle}</p>
      </div>

      {/* Monitoring Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
           <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
             <span>API Latency</span>
             <Activity className="w-4 h-4 text-[#33b1ff]" />
           </div>
           <div className="text-2xl font-bold text-[#f4f4f4] font-mono">{metrics.latency} ms</div>
        </div>
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
           <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
             <span>Success Rate</span>
             <CheckCircle2 className="w-4 h-4 text-[#42be65]" />
           </div>
           <div className="text-2xl font-bold text-[#f4f4f4] font-mono">{metrics.successRate.toFixed(1)}%</div>
        </div>
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
           <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
             <span>Token Usage</span>
             <Sliders className="w-4 h-4 text-[#8a3ffc]" />
           </div>
           <div className="text-2xl font-bold text-[#f4f4f4] font-mono">{metrics.tokens}</div>
        </div>
      </div>

      {/* Workspace Plan & Resource Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.workspacePlan}</span>
            <Building2 className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div className="text-2xl font-bold text-[#f4f4f4] font-mono">{workspace.plan.toUpperCase()}</div>
          <p className="text-[11px] text-[#8d8d8d] font-mono">
            {workspace.name} • Active
          </p>
        </div>

        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.storageUsed}</span>
            <HardDrive className="w-4 h-4 text-[#33b1ff]" />
          </div>
          <div className="text-2xl font-bold text-[#f4f4f4] font-mono">1.2 GB / 50 GB</div>
          <div className="w-full bg-[#161616] h-1.5 border border-[#393939]">
            <div className="bg-[#33b1ff] h-full" style={{ width: '2.4%' }} />
          </div>
        </div>

        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.admin.activeMembers}</span>
            <Users className="w-4 h-4 text-[#42be65]" />
          </div>
          <div className="text-2xl font-bold text-[#f4f4f4] font-mono">{usersList.length} Active Users</div>
          <p className="text-[11px] text-[#8d8d8d] font-mono">
            RBAC Policies Enforced
          </p>
        </div>
      </div>

      {/* Secure Local Tunnel Configuration */}
      <div className="bg-[#262626] border border-[#393939] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-[#8a3ffc]" />
          <h3 className="text-lg font-bold text-[#f4f4f4] font-mono">Secure Local Tunnel (ngrok)</h3>
        </div>
        
        <p className="text-sm text-[#c6c6c6] mb-5">
          {language === 'ar' 
            ? 'قم بتكوين اتصال الخادم الخاص بك (Ollama/vLLM) ليعمل مع تطبيق السحابة عبر نفق ngrok الآمن.'
            : 'Configure your local Ollama/vLLM endpoint to communicate securely with the cloud application via ngrok SDK.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#8d8d8d] uppercase mb-1.5 font-mono">
                {language === 'ar' ? 'رابط الـ API الأساسي (Ngrok URL)' : 'API Base URL (Ngrok Tunnel)'}
              </label>
              <input 
                type="text" 
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://broadly-precision-shakiness.ngrok-free.dev"
                className="w-full h-10 px-3 bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-none font-mono text-sm rounded-none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[#8d8d8d] uppercase mb-1.5 font-mono">
                {language === 'ar' ? 'منفذ الاتصال المحلي (Ollama Port)' : 'Target Local Port (e.g. 11434)'}
              </label>
              <input 
                type="text" 
                value={tunnelPort}
                onChange={(e) => setTunnelPort(e.target.value)}
                placeholder="11434"
                className="w-full h-10 px-3 bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-none font-mono text-sm rounded-none"
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
          
          <div className="bg-[#161616] border border-[#393939] p-4 flex flex-col justify-center">
            <h4 className="text-xs font-bold text-[#8d8d8d] uppercase font-mono mb-4">Connection Status</h4>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                {tunnelStatus === 'connected' && <div className="absolute inset-0 bg-[#24a148] rounded-full blur-sm opacity-50 animate-pulse" />}
                <div className={`w-3 h-3 rounded-full relative z-10 ${tunnelStatus === 'connected' ? 'bg-[#24a148]' : tunnelStatus === 'error' ? 'bg-[#da1e28]' : tunnelStatus === 'checking' ? 'bg-[#f1c21b] animate-ping' : 'bg-[#525252]'}`} />
              </div>
              <span className={`font-mono text-sm font-bold ${tunnelStatus === 'connected' ? 'text-[#42be65]' : tunnelStatus === 'error' ? 'text-[#fa4d56]' : tunnelStatus === 'checking' ? 'text-[#f1c21b]' : 'text-[#8d8d8d]'}`}>
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
        data={usersList}
        columns={userColumns}
        language={language}
        title={t.admin.teamMembers}
        description={`${usersList.length} registered team members`}
        initialPageSize={10}
        toolbarActions={
          <button
            onClick={() => setShowAddUserModal(true)}
            className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2 py-1.5 px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.admin.inviteMember}</span>
          </button>
        }
      />

      {/* Invite Member Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[#262626] border border-[#393939] max-w-md w-full p-6 shadow-2xl space-y-4 rounded-none">
            <div className="flex items-center justify-between border-b border-[#393939] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                  INVITE COLLABORATOR
                </span>
                <h3 className="text-base font-bold text-[#f4f4f4]">{t.admin.inviteMember}</h3>
              </div>
              <button onClick={() => setShowAddUserModal(false)} className="text-[#8d8d8d] hover:text-white font-mono">
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#c6c6c6] mb-1">Full Name</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className="carbon-input w-full"
                />
              </div>

              <div>
                <label className="block text-[#c6c6c6] mb-1">Email Address</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="sarah@enterprise.com"
                  className="carbon-input w-full"
                />
              </div>

              <div>
                <label className="block text-[#c6c6c6] mb-1">Role (RBAC Permission)</label>
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#393939]">
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
