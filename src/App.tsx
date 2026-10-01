import React, { Suspense, lazy, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage, getStoredToken, clearStoredToken } from './features/auth/LoginPage';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { FeatureFlagsModal } from './components/layout/FeatureFlagsModal';
import { LandingPage } from './features/landing/LandingPage';

// ---------------------------------------------------------------------------
// Code-splitting: feature pages are loaded on demand. The initial tab is
// 'landing' (kept eager above) and the login page is the first guest screen —
// everything else — and the heavy charting/export libraries each page pulls
// (Plotly, xlsx, jspdf, d3, xyflow, ...) — ships in its own async chunk.
// ---------------------------------------------------------------------------
const DatasetsPage = lazy(() => import('./features/datasets/DatasetsPage').then(m => ({ default: m.DatasetsPage })));
const ProfilingPage = lazy(() => import('./features/profiling/ProfilingPage').then(m => ({ default: m.ProfilingPage })));
const ExplorerPage = lazy(() => import('./features/explorer/ExplorerPage').then(m => ({ default: m.ExplorerPage })));
const DashboardBuilder = lazy(() => import('./features/dashboards/DashboardBuilder').then(m => ({ default: m.DashboardBuilder })));
const NL2SQLPage = lazy(() => import('./features/nl2sql/NL2SQLPage').then(m => ({ default: m.NL2SQLPage })));
const AssistantPage = lazy(() => import('./features/assistant/AssistantPage').then(m => ({ default: m.AssistantPage })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const AuditPage = lazy(() => import('./features/audit/AuditPage').then(m => ({ default: m.AuditPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then(m => ({ default: m.AdminPage })));
const ModelConfigPage = lazy(() => import('./features/models/ModelConfigPage').then(m => ({ default: m.ModelConfigPage })));
const AdvancedModelingPage = lazy(() => import('./features/datamodeling/AdvancedModelingPage').then(m => ({ default: m.AdvancedModelingPage })));
const UserGuidePage = lazy(() => import('./features/help/UserGuidePage').then(m => ({ default: m.UserGuidePage })));
const WorkflowStudio = lazy(() => import('./features/workflow/WorkflowStudio').then(m => ({ default: m.WorkflowStudio })));
const DiscussionsPage = lazy(() => import('./features/discussions/DiscussionsPage').then(m => ({ default: m.DiscussionsPage })));
const JoinGroupPage = lazy(() => import('./features/discussions/JoinGroupPage').then(m => ({ default: m.JoinGroupPage })));

const ViewFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24" dir="rtl">
    <div className="text-center space-y-3">
      <div className="w-8 h-8 mx-auto border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">جاري تحميل القسم...</p>
    </div>
  </div>
);
import { ToastContainer } from './components/common/ToastContainer';
import { BackgroundMonitor } from './components/common/BackgroundMonitor';
import { CopilotDrawer } from './components/layout/CopilotDrawer';
import { LiquidCopilotOrb } from './components/ai/LiquidCopilotOrb';
import { ZenFocusMode } from './components/common/ZenFocusMode';
import { OnboardingTour } from './components/common/OnboardingTour';
import { ProjectSnapshotModal } from './components/common/ProjectSnapshotModal';
import { DataRefreshScheduleModal } from './components/datasets/DataRefreshScheduleModal';
import { ExplainModelModal } from './components/models/ExplainModelModal';

const MainLayout: React.FC = () => {
  const { activeTab, setActiveTab, language } = useApp();
  const [flagsModalOpen, setFlagsModalOpen] = useState(false);
  const [zenOpen, setZenOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setActiveTab('datasets');
            break;
          case '2':
            e.preventDefault();
            setActiveTab('datamodeling');
            break;
          case '3':
            e.preventDefault();
            setActiveTab('profiling');
            break;
          case '4':
            e.preventDefault();
            setActiveTab('dashboards');
            break;
          case '5':
            e.preventDefault();
            setActiveTab('nl2sql');
            break;
          case '6':
            e.preventDefault();
            setActiveTab('models');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  // Global Zen Mode open event (dispatched from the Header moon button)
  useEffect(() => {
    const openZen = () => setZenOpen(true);
    window.addEventListener('carbon-open-zen', openZen);
    return () => window.removeEventListener('carbon-open-zen', openZen);
  }, []);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'landing':
        return <LandingPage />;
      case 'datasets':
        return <DatasetsPage />;
      case 'datamodeling':
        return <AdvancedModelingPage />;
      case 'profiling':
        return <ProfilingPage />;
      case 'explorer':
        return <ExplorerPage />;
      case 'dashboards':
        return <DashboardBuilder />;
      case 'nl2sql':
        return <NL2SQLPage />;
      case 'assistant':
        return <AssistantPage />;
      case 'discussions':
        return <DiscussionsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'audit':
        return <AuditPage />;
      case 'admin':
        return <AdminPage />;
      case 'models':
        return <ModelConfigPage />;
      case 'guide':
        return <UserGuidePage />;
      case 'workflow':
        return <WorkflowStudio />;
      default:
        return <LandingPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--cds-background)] text-[var(--cds-text-01)] flex flex-col font-sans selection:bg-[var(--cds-interactive-01)] selection:text-white transition-colors duration-150">
      {/* Top IBM Carbon Shell Header */}
      <Header onOpenFlags={() => setFlagsModalOpen(true)} />

      {/* Main Workspace Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Carbon Sidenav Navigation */}
        <Sidebar />

        {/* Dynamic View Canvas */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[var(--cds-background)] transition-colors duration-150">
          <div className="max-w-7xl mx-auto">
            <Suspense fallback={<ViewFallback />}>
              {renderActiveView()}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Liquid Copilot Orb (hidden while drawer is open) */}
      <LiquidCopilotOrb />

      {/* Zen Focus Mode — distraction-free analytical sanctuary */}
      <AnimatePresence>{zenOpen && <ZenFocusMode isOpen={zenOpen} onClose={() => setZenOpen(false)} />}</AnimatePresence>

      {/* Interactive Onboarding Tour */}
      <OnboardingTour />

      {/* Toast Notification Container */}
      <ToastContainer />
      <BackgroundMonitor />
      <CopilotDrawer />

      {/* Project Snapshot (Export/Import State JSON) */}
      <ProjectSnapshotModal />

      {/* Scheduled Data Refresh & Live Sync Modal */}
      <DataRefreshScheduleModal />

      {/* Explain Model AI & Statistical Engine Modal */}
      <ExplainModelModal />

      {/* Feature Flags Toggle Modal */}
      <FeatureFlagsModal
        isOpen={flagsModalOpen}
        onClose={() => setFlagsModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  // Auth gate: check any stored session against the server before rendering the app.
  const [authState, setAuthState] = useState<'checking' | 'guest' | 'authed'>('checking');
  const [authUser, setAuthUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  // Secret invite link (/join/:code) — survives the login flow
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]+)$/);
    if (m) setPendingInviteCode(m[1]);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setAuthState('guest'); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('invalid session');
        const data = await res.json();
        setAuthUser(data.user);
        setAuthState('authed');
      })
      .catch(() => {
        clearStoredToken();
        setAuthState('guest');
      });
  }, []);

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cds-background,#161616)]" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (authState === 'guest') {
    return (
      <LoginPage
        onAuthSuccess={(user) => {
          setAuthUser(user);
          setAuthState('authed');
        }}
      />
    );
  }

  // Secret invite landing: available once logged in (login form shows first for guests)
  if (pendingInviteCode && authState === 'authed') {
    return (
      <AppProvider authUser={authUser}>
        <Suspense fallback={<ViewFallback />}>
        <JoinGroupPage
          code={pendingInviteCode}
          onJoined={() => {
            window.history.replaceState({}, '', '/');
            setPendingInviteCode(null);
            // Open the discussions tab after joining
            window.dispatchEvent(new CustomEvent('carbon-open-discussions'));
          }}
        />
        </Suspense>
      </AppProvider>
    );
  }

  return (
    <AppProvider authUser={authUser} onLogout={() => {
      const token = getStoredToken();
      if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      clearStoredToken();
      setAuthUser(null);
      setAuthState('guest');
    }}>
      <MainLayout />
    </AppProvider>
  );
}
