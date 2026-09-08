import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { FeatureFlagsModal } from './components/layout/FeatureFlagsModal';
import { LandingPage } from './features/landing/LandingPage';
import { DatasetsPage } from './features/datasets/DatasetsPage';
import { ProfilingPage } from './features/profiling/ProfilingPage';
import { ExplorerPage } from './features/explorer/ExplorerPage';
import { DashboardBuilder } from './features/dashboards/DashboardBuilder';
import { NL2SQLPage } from './features/nl2sql/NL2SQLPage';
import { AssistantPage } from './features/assistant/AssistantPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { AuditPage } from './features/audit/AuditPage';
import { AdminPage } from './features/admin/AdminPage';
import { ModelConfigPage } from './features/models/ModelConfigPage';
import { AdvancedModelingPage } from './features/datamodeling/AdvancedModelingPage';
import { UserGuidePage } from './features/help/UserGuidePage';
import { WorkflowStudio } from './features/workflow/WorkflowStudio';
import { ToastContainer } from './components/common/ToastContainer';
import { BackgroundMonitor } from './components/common/BackgroundMonitor';
import { CopilotDrawer } from './components/layout/CopilotDrawer';
import { OnboardingTour } from './components/common/OnboardingTour';
import { CommentsDrawer } from './components/collaboration/CommentsDrawer';
import { ProjectSnapshotModal } from './components/common/ProjectSnapshotModal';
import { DataRefreshScheduleModal } from './components/datasets/DataRefreshScheduleModal';
import { ExplainModelModal } from './components/models/ExplainModelModal';

const MainLayout: React.FC = () => {
  const { activeTab, setActiveTab, language } = useApp();
  const [flagsModalOpen, setFlagsModalOpen] = useState(false);

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
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Interactive Onboarding Tour */}
      <OnboardingTour />

      {/* Toast Notification Container */}
      <ToastContainer />
      <BackgroundMonitor />
      <CopilotDrawer />

      {/* Team Comments Drawer */}
      <CommentsDrawer />

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
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
