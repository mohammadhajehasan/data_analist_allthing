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
} from 'lucide-react';
import { CarbonDataTable, CarbonDataTableColumn } from '../../components/common/CarbonDataTable';
import { motion } from 'motion/react';

export const AdminPage: React.FC = () => {
  const { workspace, setWorkspace, usersList, setUsersList, user, language, t } = useApp();
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('analyst');
  
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
