import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  MessagesSquare,
  X,
} from 'lucide-react';
import { DiscussionsBadge } from './DiscussionsBadge';
import { SnapshotBadge } from './SnapshotBadge';

/** الحد الأدنى لعرض الشاشة الذي يتحول عنده الـ Sidebar من Drawer منزلق إلى عمود ثابت (Tailwind: md) */
export const MOBILE_SIDEBAR_BREAKPOINT = 768;

/** حدث عام يُفتح به الـ Drawer على الموبايل — يرسله زر الهمبرغر في الهيدر */
export const OPEN_MOBILE_SIDEBAR_EVENT = 'carbon-open-mobile-sidebar';

/**
 * قائمة التنقل المشتركة — تُستخدم مرتين:
 *  1) العمود الثابت على الشاشات >= md
 *  2) الـ Drawer المنزلق على الموبايل (< md)
 */
const SidebarNavList: React.FC<{ isCollapsed?: boolean; isMobile?: boolean; onNavigate?: () => void }> = ({
  isCollapsed = false,
  isMobile = false,
  onNavigate,
}) => {
  const { activeTab, setActiveTab, startTour, language, t } = useApp();

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
    <div className="space-y-0.5">
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
            onClick={() => {
              setActiveTab(item.id);
              onNavigate?.();
            }}
            title={isCollapsed ? item.label : undefined}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center mx-auto w-10 h-10 my-1' : 'justify-between px-3 py-2.5 mx-2 w-[calc(100%-1rem)] my-0.5'
            } text-xs font-sans transition-all relative rounded-lg ${
              isActive
                ? 'bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] font-bold'
                : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] font-medium'
            }`}
          >
            <div className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
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
            {isMobile && isActive && (
              <span className="absolute inset-y-1 start-0 w-0.5 rounded-full bg-[var(--cds-interactive-01)]" data-testid="mobile-sidebar-active-indicator" />
            )}
          </button>
        );
      })}

      {/* Interactive Tour Trigger — footer of both variants */}
      {(!isCollapsed || isMobile) && (
        <button
          onClick={() => {
            startTour();
            onNavigate?.();
          }}
          title={language === 'ar' ? 'جولة تعريفية تفاعلية' : 'Interactive Tour'}
          className="w-full flex items-center justify-between px-3 py-2.5 mx-2 w-[calc(100%-1rem)] my-0.5 rounded-lg bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] text-xs font-medium text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] shrink-0" />
            <span>{language === 'ar' ? 'جولة تعريفية' : 'Platform Tour'}</span>
          </div>
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        </button>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { layoutSettings, updateLayoutSettings, setActiveTab, language } = useApp();

  const isCollapsed = !!layoutSettings.sidebarCollapsed;

  // ---------------------------------------------------------------
  // الموبايل: Drawer منزلق أقل من 768px — يُفتح بحدث الهمبرغر من الهيدر،
  // ويُغلق بالنقر خارجه أو Escape أو عند اختيار عنصر، ويُقفل scroll الصفحة.
  // ---------------------------------------------------------------
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isAr = language === 'ar';

  // فتح عبر الحدث العام (زر الهيدر)
  React.useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(OPEN_MOBILE_SIDEBAR_EVENT, open);
    return () => window.removeEventListener(OPEN_MOBILE_SIDEBAR_EVENT, open);
  }, []);

  // إغلاق تلقائي عند تجاوز نقطة الفصل (تحوير/تدوير الجهاز)
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_SIDEBAR_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Escape يغلق الـ Drawer
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // قفل تمرير الصفحة الخلفية أثناء فتح الـ Drawer
  React.useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // اتجاه الانزلاق: القائمة في جهة البداية (start) — يمين في RTL وشمال في LTR
  const slideX = isAr ? '110%' : '-110%';

  return (
    <>
      {/* ============ العمود الثابت — الشاشات >= md فقط ============ */}
      <aside
        className={`hidden md:flex bg-[var(--cds-sidebar-bg)] border-e border-[var(--cds-border-subtle)] flex-col justify-between shrink-0 select-none transition-all duration-200 ${
          isCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="py-2 overflow-y-auto">
          <SidebarNavList isCollapsed={isCollapsed} />
        </div>

        {/* Footer System Status & Collapse Toggle */}
        <div className="p-2.5 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-sidebar-bg)] space-y-2">
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

      {/* ============ الموبايل — Drawer منزلق (< md) ============ */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
              data-testid="mobile-sidebar-backdrop"
              className="fixed inset-0 z-[55] bg-black/50 md:hidden"
            />

            {/* Drawer Panel */}
            <motion.aside
              key="mobile-sidebar-panel"
              role="dialog"
              aria-modal="true"
              aria-label={language === 'ar' ? 'قائمة التنقل' : 'Navigation menu'}
              initial={{ x: slideX }}
              animate={{ x: 0 }}
              exit={{ x: slideX }}
              transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.25 }}
              data-testid="mobile-sidebar-drawer"
              className="fixed inset-y-0 start-0 w-[280px] max-w-[85vw] z-[60] md:hidden flex flex-col bg-[var(--cds-sidebar-bg)] border-e border-[var(--cds-border-subtle)] shadow-2xl select-none"
            >
              {/* Drawer Header */}
              <div className="px-3 py-3 border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--cds-interactive-01)] flex items-center justify-center text-white shrink-0">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[var(--cds-text-01)] truncate">
                    {language === 'ar' ? 'منصة ذكاء وتحليل البيانات' : 'Enterprise AI Analytics'}
                  </span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label={language === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
                  data-testid="mobile-sidebar-close"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Drawer Navigation */}
              <div className="flex-1 overflow-y-auto py-2">
                <SidebarNavList isMobile onNavigate={() => setMobileOpen(false)} />
              </div>

              {/* Drawer Footer: quick jump to Admin */}
              <div className="p-2.5 border-t border-[var(--cds-border-subtle)]">
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setMobileOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'الإعدادات والإدارة' : 'Settings & Admin'}</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
