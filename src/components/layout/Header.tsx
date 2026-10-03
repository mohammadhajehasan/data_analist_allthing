import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import {
  Sparkles,
  Globe,
  Sliders,
  Database,
  Layers,
  ShieldCheck,
  Check,
  X,
  ChevronDown,
  Building2,
  Cpu,
  UserCheck,
  Palette,
  LayoutGrid,
  FileSpreadsheet,
  HelpCircle,
  Sun,
  Moon,
  SlidersHorizontal,
  HardDrive,
  Radio,
  LogOut,
} from 'lucide-react';
import { THEME_OPTIONS, DashboardLayoutModal } from '../dashboards/DashboardLayoutModal';
import { LocalCsvImportModal } from '../datasets/LocalCsvImportModal';
import { AIModelSelector } from '../ai/AIModelSelector';
import { SonificationToggle } from '../common/SonificationToggle';
import { NotificationBell } from './NotificationBell';
import { useAiReadiness } from '../../hooks/useAiReadiness';

export const Header: React.FC<{ onOpenFlags: () => void }> = ({ onOpenFlags }) => {
  const {
    user,
    setUser,
    usersList,
    workspace,
    datasets,
    activeDataset,
    setActiveDatasetId,
    language,
    setLanguage,
    toggleLanguage,
    theme,
    setTheme,
    startTour,
    t,
    setIsSnapshotModalOpen,
    setIsRefreshModalOpen,
    scheduledRefreshes,
    logout,
    aiSettings,
    activeAIModelDef,
    setActiveTab,
  } = useApp();

  // شارة جاهزية AI الدائمة: مفتاح المستخدم أو مفتاح الخادم الاحتياطي
  const aiReadiness = useAiReadiness(aiSettings, activeAIModelDef);
  const activeProviderCfg = aiSettings.providers[aiReadiness.providerId];
  const aiProviderLabel =
    language === 'ar'
      ? activeProviderCfg?.nameAr || activeAIModelDef.providerName
      : activeProviderCfg?.name || activeAIModelDef.providerName;
  const aiBadgeTooltip = aiReadiness.ready
    ? (language === 'ar'
        ? `الذكاء الاصطناعي جاهز عبر ${aiProviderLabel}${
            aiReadiness.reason === 'server-key' ? ' (مفتاح الخادم)' : aiReadiness.reason === 'local' ? ' (محرك محلي)' : ''
          } — انقر لفتح صفحة النماذج`
        : `AI ready via ${aiProviderLabel} — click to open Model Config`)
    : (language === 'ar'
        ? aiReadiness.reason === 'no-endpoint'
          ? `مزوّد ${aiProviderLabel} يحتاج عنوان نقطة نهاية — انقر لإعداده من صفحة النماذج`
          : `مفتاح ${aiProviderLabel} غير مُعد — انقر لإضافته من صفحة النماذج (حفظ واختبار)`
        : `${aiProviderLabel} key is missing — click to add it in Model Config`);

  const [showDatasetMenu, setShowDatasetMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showQuickActionsMenu, setShowQuickActionsMenu] = useState(false);
  
  const [committedTheme, setCommittedTheme] = useState(theme);
  
  useEffect(() => {
    setCommittedTheme(theme);
  }, [theme]);

  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const datasetDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setTheme(committedTheme);
        setShowThemeMenu(false);
      }
      if (datasetDropdownRef.current && !datasetDropdownRef.current.contains(event.target as Node)) {
        setShowDatasetMenu(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setShowQuickActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [committedTheme, setTheme]);

  const toggleThemeMenu = () => {
    if (!showThemeMenu) {
      setCommittedTheme(theme);
    } else {
      setTheme(committedTheme);
    }
    setShowThemeMenu(!showThemeMenu);
  };

  const activeThemeOption = THEME_OPTIONS.find(t => t.id === theme) || THEME_OPTIONS[0];

  return (
    <header className="h-16 bg-[var(--cds-header-bg)] border-b border-[var(--cds-border-subtle)] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shadow-xs select-none transition-colors duration-150">
      {/* Brand & Workspace */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--cds-interactive-01)] flex items-center justify-center text-white font-bold text-sm shadow-sm">
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[var(--cds-text-01)] tracking-tight">
              {language === 'ar' ? 'منصة ذكاء وتحليل البيانات' : 'Enterprise AI Analytics'}
            </span>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[var(--cds-layer-02)] text-[var(--cds-interactive-01)] border border-[var(--cds-border-subtle)]">
              {workspace.plan}
            </span>
          </div>
          <span className="text-[11px] text-[var(--cds-text-03)] hidden sm:inline">
            {workspace.name}
          </span>
        </div>
      </div>

      {/* AI Model & Dataset Selector Center Cluster */}
      <div className="flex items-center gap-2">
        {/* شارة جاهزية AI الدائمة (أخضر/أحمر) — تنقل لصفحة النماذج */}
        <button
          type="button"
          onClick={() => setActiveTab('models')}
          title={aiBadgeTooltip}
          aria-label={aiBadgeTooltip}
          className={`h-9 px-3 hidden md:flex items-center gap-2 text-xs font-semibold border rounded-xs transition-all cursor-pointer shrink-0 ${
            aiReadiness.ready
              ? 'bg-[#24a148]/10 hover:bg-[#24a148]/20 text-[#42be65] border-[#24a148]/40'
              : 'bg-[#da1e28]/10 hover:bg-[#da1e28]/20 text-[#ff8389] border-[#da1e28]/40'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              aiReadiness.ready ? 'bg-[#42be65]' : 'bg-[#ff8389] animate-pulse'
            }`}
          />
          {aiReadiness.ready
            ? (language === 'ar' ? 'AI جاهز' : 'AI Ready')
            : (language === 'ar' ? 'AI غير مُفعّل' : 'AI Off')}
        </button>

        {/* Global AI Engine Selector */}
        <AIModelSelector />

        {/* Active Dataset Dropdown */}
        <div className="relative" ref={datasetDropdownRef}>
          <button
            onClick={() => setShowDatasetMenu(!showDatasetMenu)}
            className="h-9 flex items-center gap-2 px-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] rounded-lg text-xs font-medium text-[var(--cds-text-01)] transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
            <span className="truncate max-w-[120px] sm:max-w-[170px]">
              {activeDataset ? activeDataset.name : t.common.activeDataset}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--cds-text-03)] shrink-0" />
          </button>

          {showDatasetMenu && (
            <div
              className={`absolute top-full mt-1.5 w-80 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg shadow-2xl p-2 z-50 animate-in fade-in duration-100 ${
                language === 'ar' ? 'left-0' : 'right-0'
              }`}
            >
              <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--cds-text-03)] uppercase tracking-wider border-b border-[var(--cds-border-subtle)] mb-1">
                {t.common.activeDataset} ({datasets.length})
              </div>
              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {datasets.map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => {
                      setActiveDatasetId(ds.id);
                      setShowDatasetMenu(false);
                    }}
                    className={`w-full text-start px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors ${
                      ds.id === activeDataset.id
                        ? 'bg-[var(--cds-interactive-01)] text-white font-semibold'
                        : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)] hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-medium truncate">{ds.name}</div>
                      <div className={`text-[10px] ${ds.id === activeDataset.id ? 'text-white/80' : 'text-[var(--cds-text-03)]'}`}>
                        {ds.format.toUpperCase()} • {ds.rowCount.toLocaleString()} {t.common.rows} • {ds.columnCount} {t.common.columns}
                      </div>
                    </div>
                    {ds.id === activeDataset.id && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Visual Theme Selector Dropdown */}
        <div className="relative" ref={themeDropdownRef}>
          <button
            onClick={toggleThemeMenu}
            className="h-9 flex items-center gap-2 px-3 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] rounded-lg text-xs font-medium text-[var(--cds-text-01)] transition-all cursor-pointer"
            title={language === 'ar' ? 'تغيير نمط وألوان المظهر (Themes)' : 'Switch Theme Variant'}
            aria-label="Theme Selector"
          >
            {/* Visual Swatch Pill */}
            <div
              className="w-4 h-4 rounded-sm border border-[var(--cds-border-strong)] flex flex-col overflow-hidden shrink-0 shadow-xs"
              style={{ backgroundColor: activeThemeOption.bgHex }}
            >
              <div className="h-1/2 w-full" style={{ backgroundColor: activeThemeOption.cardHex }} />
              <div className="h-1/2 w-full flex">
                <div className="w-1/2 h-full" style={{ backgroundColor: activeThemeOption.accentHex }} />
                <div className="w-1/2 h-full" style={{ backgroundColor: activeThemeOption.bgHex }} />
              </div>
            </div>

            <span className="hidden sm:inline text-xs font-medium text-[var(--cds-text-01)] truncate max-w-[90px]">
              {language === 'ar' ? activeThemeOption.nameAr.split(' ')[0] : activeThemeOption.nameEn.split(' ')[0]}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--cds-text-03)] shrink-0" />
          </button>

          <AnimatePresence>
          {showThemeMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              onMouseLeave={() => setTheme(committedTheme)}
              className={`absolute top-full mt-1.5 w-76 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg shadow-2xl p-2 z-50 ${
                language === 'ar' ? 'left-0' : 'right-0'
              }`}
            >
              {/* Header */}
              <div className="px-2.5 py-1.5 text-[10px] font-semibold text-[var(--cds-text-03)] uppercase tracking-wider border-b border-[var(--cds-border-subtle)] mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
                  <span>{language === 'ar' ? 'أنماط المظهر' : 'Theme Presets'}</span>
                </div>
                <span className="text-[10px] bg-[var(--cds-layer-02)] px-1.5 py-0.5 rounded text-[var(--cds-text-02)]">
                  {THEME_OPTIONS.length}
                </span>
              </div>

              {/* Theme List with Visual Swatches */}
              <div className="space-y-1">
                {THEME_OPTIONS.map(opt => {
                  const isSelected = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onMouseEnter={() => setTheme(opt.id)}
                      onClick={() => {
                        setTheme(opt.id);
                        setCommittedTheme(opt.id);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full text-start p-2 rounded-lg text-xs flex items-center gap-2.5 transition-all border ${
                        isSelected
                          ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] font-semibold shadow-xs'
                          : 'bg-transparent border-transparent text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)] hover:text-[var(--cds-text-01)]'
                      }`}
                    >
                      {/* Multi-layered Visual Swatch */}
                      <div
                        className="w-6 h-6 rounded-md border border-[var(--cds-border-strong)] flex flex-col overflow-hidden shrink-0 shadow-inner"
                        style={{ backgroundColor: opt.bgHex }}
                      >
                        <div className="h-1/2 w-full" style={{ backgroundColor: opt.cardHex }} />
                        <div className="h-1/2 w-full flex">
                          <div className="w-1/2 h-full" style={{ backgroundColor: opt.accentHex }} />
                          <div className="w-1/2 h-full" style={{ backgroundColor: opt.borderHex }} />
                        </div>
                      </div>

                      {/* Theme Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-[var(--cds-text-01)] truncate">
                            {language === 'ar' ? opt.nameAr : opt.nameEn}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                            opt.isDark 
                              ? 'bg-blue-950/60 text-blue-300 border border-blue-800/40' 
                              : 'bg-slate-100 text-slate-700 border border-slate-300'
                          }`}>
                            {opt.isDark ? (language === 'ar' ? 'داكن' : 'Dark') : (language === 'ar' ? 'فاتح' : 'Light')}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] shrink-0 ms-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer: Quick Customization Shortcut */}
              <div className="pt-2 mt-1.5 border-t border-[var(--cds-border-subtle)]">
                <button
                  onClick={() => {
                    setShowThemeMenu(false);
                    setShowLayoutModal(true);
                  }}
                  className="w-full text-center py-1.5 text-xs text-[var(--cds-interactive-01)] hover:bg-[var(--cds-layer-02)] rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تخصيص الألوان والتخطيط...' : 'Full Appearance Settings...'}</span>
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Side: Quick Actions, Comments, Overflow Menu, Settings, User */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Secondary actions grouped and hidden below xl (moved into overflow menu) */}
        <div className="hidden xl:flex items-center gap-1.5 sm:gap-2">
          {/* Project Snapshot (Save/Load Workspace State) */}
          <button
            onClick={() => setIsSnapshotModalOpen(true)}
            className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] rounded-lg text-xs font-semibold text-[var(--cds-text-01)] transition-colors"
            title={language === 'ar' ? 'لقطة حالة المشروع - تصدير واستعادة ملف JSON' : 'Project Snapshot (JSON Export & Import)'}
            id="header-project-snapshot-btn"
          >
            <HardDrive className="w-4 h-4 text-[var(--cds-interactive-01)]" />
            <span>{language === 'ar' ? 'لقطة المشروع' : 'Snapshot'}</span>
          </button>

          {/* Live Data Refresh & API Scheduling Indicator */}
          <button
            onClick={() => setIsRefreshModalOpen(true)}
            className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#009d9a] rounded-lg text-xs font-semibold text-[var(--cds-text-01)] transition-colors relative"
            title={language === 'ar' ? 'نظام التحديث التلقائي وجدولة API' : 'Scheduled Data Refresh & Live API Feeds'}
            id="header-data-refresh-btn"
          >
            <Radio className="w-4 h-4 text-[#009d9a]" />
            {scheduledRefreshes.some(r => r.status === 'connected') && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
            <span>{language === 'ar' ? 'التحديث الحي' : 'Live Sync'}</span>
          </button>

          {/* Quick CSV Local Ingestion Shortcut */}
          <button
            onClick={() => setShowCsvModal(true)}
            className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] rounded-lg text-xs font-semibold text-[var(--cds-text-01)] transition-colors"
            title={language === 'ar' ? 'استيراد ومعالجة ملف CSV محلياً دون رفع للخادم' : 'Local In-Memory CSV Ingestion (Zero-Upload)'}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>{language === 'ar' ? 'استيراد CSV' : 'Import CSV'}</span>
          </button>

          {/* Onboarding Tour Trigger Button */}
          <button
            onClick={startTour}
            className="h-9 px-2.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] rounded-lg text-xs font-medium text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] flex items-center gap-1.5 transition-colors"
            title={language === 'ar' ? 'بدء الجولة التعريفية التفاعلية للمنصة' : 'Start Platform Interactive Tour'}
          >
            <HelpCircle className="w-4 h-4 text-[var(--cds-interactive-01)]" />
            <span>{language === 'ar' ? 'جولة' : 'Tour'}</span>
          </button>

          {/* Layout & Display Preferences Quick Trigger */}
          <button
            onClick={() => setShowLayoutModal(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] transition-colors"
            title={language === 'ar' ? 'تخصيص التخطيط والمظهر وحفظ التفضيلات' : 'Layout & Display Preferences'}
          >
            <LayoutGrid className="w-4 h-4 text-emerald-500" />
          </button>
        </div>

        {/* Ambient Data Sonification Toggle */}
        <div className="hidden sm:block">
          <SonificationToggle compact />
        </div>

        {/* Zen Focus Mode Trigger */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('carbon-open-zen'))}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#8a3ffc] text-[var(--cds-text-02)] hover:text-[#be95ff] transition-colors"
          title={language === 'ar' ? 'نمط الزن — مساحة تحليلية هادئة بلا مشتتات' : 'Zen Focus Mode — distraction-free analytical space'}
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Team Comments drawer removed from header — group discussions live in the sidebar tab */}

        {/* Overflow "More Options" menu for medium/small screens (below xl) */}
        <div className="xl:hidden relative" ref={quickActionsRef}>
          <button
            onClick={() => setShowQuickActionsMenu(!showQuickActionsMenu)}
            className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
            title={language === 'ar' ? 'خيارات إضافية' : 'Quick Actions'}
            aria-label={language === 'ar' ? 'خيارات إضافية' : 'Quick Actions'}
            aria-expanded={showQuickActionsMenu}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {showQuickActionsMenu && (
            <div
              className={`absolute top-full mt-1.5 w-60 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg shadow-2xl p-2 z-50 ${
                language === 'ar' ? 'left-0' : 'right-0'
              }`}
            >
              <div className="px-2 py-1.5 text-[10px] font-semibold text-[var(--cds-text-03)] uppercase tracking-wider border-b border-[var(--cds-border-subtle)] mb-1">
                {language === 'ar' ? 'خيارات سريعة' : 'Quick Actions'}
              </div>
              <button
                onClick={() => { setIsSnapshotModalOpen(true); setShowQuickActionsMenu(false); }}
                className="w-full text-start p-2 hover:bg-[var(--cds-layer-02)] rounded-lg text-xs flex items-center gap-2 text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
              >
                <HardDrive className="w-4 h-4 text-[var(--cds-interactive-01)] shrink-0" />
                {language === 'ar' ? 'لقطة المشروع' : 'Snapshot'}
              </button>
              <button
                onClick={() => { setIsRefreshModalOpen(true); setShowQuickActionsMenu(false); }}
                className="w-full text-start p-2 hover:bg-[var(--cds-layer-02)] rounded-lg text-xs flex items-center gap-2 text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
              >
                <Radio className="w-4 h-4 text-[#009d9a] shrink-0" />
                {language === 'ar' ? 'التحديث الحي' : 'Live Sync'}
              </button>
              <button
                onClick={() => { setShowCsvModal(true); setShowQuickActionsMenu(false); }}
                className="w-full text-start p-2 hover:bg-[var(--cds-layer-02)] rounded-lg text-xs flex items-center gap-2 text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                {language === 'ar' ? 'استيراد CSV' : 'Import CSV'}
              </button>
              <button
                onClick={() => { startTour(); setShowQuickActionsMenu(false); }}
                className="w-full text-start p-2 hover:bg-[var(--cds-layer-02)] rounded-lg text-xs flex items-center gap-2 text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-[var(--cds-interactive-01)] shrink-0" />
                {language === 'ar' ? 'الجولة التعريفية' : 'Onboarding Tour'}
              </button>
              <button
                onClick={() => { setShowLayoutModal(true); setShowQuickActionsMenu(false); }}
                className="w-full text-start p-2 hover:bg-[var(--cds-layer-02)] rounded-lg text-xs flex items-center gap-2 text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] transition-colors"
              >
                <LayoutGrid className="w-4 h-4 text-emerald-500 shrink-0" />
                {language === 'ar' ? 'تخصيص التخطيط' : 'Layout Preferences'}
              </button>
            </div>
          )}
        </div>

        {/* Feature Flags Button */}
        <button
          onClick={onOpenFlags}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] transition-colors"
          title="Feature Flags & Governance"
        >
          <Sliders className="w-4 h-4 text-[var(--cds-interactive-01)]" />
        </button>

        {/* Notifications (live via SSE) */}
        <NotificationBell />

        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="h-9 px-3 rounded-lg flex items-center gap-1.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] text-xs font-semibold text-[var(--cds-text-01)] transition-colors cursor-pointer"
          title={t.header.languageSwitch}
          aria-label={t.header.languageSwitch}
        >
          <Globe className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
          <span className="font-mono font-bold tracking-wide">
            {language === 'ar' ? 'English' : 'العربية'}
          </span>
        </button>

        {/* User Profile Trigger */}
        <div className="relative" ref={userDropdownRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="h-9 flex items-center gap-2 px-2.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] rounded-lg text-xs text-[var(--cds-text-01)] transition-colors"
          >
            <div className="w-6 h-6 rounded-md bg-[var(--cds-interactive-01)] text-white flex items-center justify-center text-xs font-bold shadow-xs">
              {user.name.charAt(0)}
            </div>
            <span className="hidden sm:inline text-xs font-medium">{user.name}</span>
            <span className="carbon-tag-blue hidden md:inline">
              {user.role}
            </span>
          </button>

          {showUserMenu && (
            <div
              className={`absolute top-full mt-1.5 w-64 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg shadow-2xl p-2 z-50 animate-in fade-in duration-100 ${
                language === 'ar' ? 'left-0' : 'right-0'
              }`}
            >
              <div className="px-3 py-2 border-b border-[var(--cds-border-subtle)] text-xs">
                <p className="font-semibold text-[var(--cds-text-01)]">{user.name}</p>
                <p className="text-[11px] text-[var(--cds-text-03)] font-mono">{user.email}</p>
                <p className="text-[10px] uppercase text-[var(--cds-interactive-01)] mt-0.5 font-semibold">Role: {user.role}</p>
              </div>

              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full text-start px-2 py-2 text-xs font-semibold text-[#ff8389] hover:bg-[#da1e28]/15 rounded-md flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'تسجيل الخروج' : 'Log Out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Layout Modal */}
      <DashboardLayoutModal
        isOpen={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
      />

      {/* Local Zero-Upload CSV Ingestion Modal */}
      <LocalCsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
      />
    </header>
  );
};
