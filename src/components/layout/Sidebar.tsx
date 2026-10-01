import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Compass,
  Database,
  Workflow,
  BarChart2,
  Table,
  LayoutDashboard,
  Terminal,
  Bot,
  FileText,
  ShieldAlert,
  Settings,
  Activity,
  HelpCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  MessagesSquare,
} from 'lucide-react';
import { DiscussionsBadge } from './DiscussionsBadge';
import { SnapshotBadge } from './SnapshotBadge';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, startTour, layoutSettings, updateLayoutSettings, language, t } = useApp();

  const isCollapsed = !!layoutSettings.sidebarCollapsed;

  const navItems = [
    { id: 'landing', label: t.nav.landing, icon: Compass },
    { id: 'datasets', label: t.nav.datasets, icon: Database },
    { id: 'datamodeling', label: t.nav.datamodeling, icon: Workflow, badge: 'AI ERD' },
    { id: 'profiling', label: t.nav.profiling, icon: BarChart2 },
    { id: 'explorer', label: t.nav.explorer, icon: Table },
    { id: 'dashboards', label: t.nav.dashboards, icon: LayoutDashboard },
    { id: 'nl2sql', label: t.nav.nl2sql, icon: Terminal, badge: '9-Layer' },
    { id: 'models', label: t.nav.models, icon: Cpu, badge: 'Ollama' },
    { id: 'guide', label: t.nav.guide, icon: HelpCircle, badge: 'New' },
    { id: 'assistant', label: t.nav.assistant, icon: Bot, badge: 'AI' },
    { id: 'discussions', label: t.nav.discussions, icon: MessagesSquare, badge: 'Groups' },
    { id: 'workflow', label: t.nav.workflow, icon: Workflow, badge: 'Agent' },
    { id: 'reports', label: t.nav.reports, icon: FileText },
    { id: 'audit', label: t.nav.audit, icon: ShieldAlert },
    { id: 'admin', label: t.nav.admin, icon: Settings },
  ];

  return (
    <aside
      className={`bg-[var(--cds-sidebar-bg)] border-e border-[var(--cds-border-subtle)] flex flex-col justify-between shrink-0 select-none transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="py-2 space-y-0.5 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-4 py-2 text-[10px] font-mono font-bold text-[var(--cds-text-03)] uppercase tracking-wider">
            WORKSPACE NAVIGATION
          </div>
        )}
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center mx-auto w-10 h-10 my-1' : 'justify-between px-3 py-2 mx-2 w-[calc(100%-1rem)] my-0.5'
              } text-xs font-sans transition-all relative rounded-lg ${
                isActive
                  ? 'bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] font-bold'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] font-medium'
              }`}
            >

              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[var(--cds-interactive-01)]' : 'text-[var(--cds-text-03)]'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!isCollapsed && item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 font-mono font-bold shrink-0 rounded-md ${
                    isActive
                      ? 'bg-[var(--cds-interactive-01)] text-white'
                      : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {/* Total unread messages across all groups — Discussions tab only */}
              {item.id === 'discussions' && (
                isCollapsed
                  ? <DiscussionsBadge className="absolute top-1 end-1" />
                  : <DiscussionsBadge />
              )}
              {/* Unread shared-snapshot mini badges — Dashboards & Reports tabs */}
              {(item.id === 'dashboards' || item.id === 'reports') && (
                isCollapsed
                  ? <SnapshotBadge source={item.id === 'dashboards' ? 'dashboard' : 'reports'} className="absolute top-1 end-1" />
                  : <SnapshotBadge source={item.id === 'dashboards' ? 'dashboard' : 'reports'} />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer System Status & Tour Trigger */}
      <div className="p-2.5 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-sidebar-bg)] space-y-2">
        {/* Interactive Tour Trigger */}
        <button
          onClick={startTour}
          title={language === 'ar' ? 'جولة تعريفية تفاعلية' : 'Interactive Tour'}
          className={`w-full flex items-center ${
            isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
          } rounded-lg bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] text-xs font-medium text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors`}
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] shrink-0" />
            {!isCollapsed && <span>{language === 'ar' ? 'جولة تعريفية' : 'Platform Tour'}</span>}
          </div>
          {!isCollapsed && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
        </button>

        {/* Engine Status */}
        {!isCollapsed && (
          <div className="bg-[var(--cds-layer-01)] p-2 rounded-lg border border-[var(--cds-border-subtle)] flex items-center justify-between text-[11px] text-[var(--cds-text-02)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs" />
              <span className="font-medium">OLAP Engine</span>
            </div>
            <span className="text-[var(--cds-interactive-01)] font-mono text-[10px] font-semibold">&lt; 5ms</span>
          </div>
        )}

        {/* Collapse / Expand Toggle Button */}
        <button
          onClick={() => updateLayoutSettings({ sidebarCollapsed: !isCollapsed })}
          title={
            isCollapsed
              ? language === 'ar'
                ? 'توسيع القائمة الجانبية'
                : 'Expand Sidebar'
              : language === 'ar'
              ? 'طي القائمة الجانبية'
              : 'Collapse Sidebar'
          }
          className="w-full flex items-center justify-center py-1.5 rounded-lg text-xs text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] border border-transparent hover:border-[var(--cds-border-subtle)] transition-colors"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <PanelLeftClose className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'طي القائمة' : 'Collapse'}</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
