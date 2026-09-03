import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Workspace,
  Dataset,
  Dashboard,
  ChatSession,
  AuditLogEntry,
  FeatureFlags,
  WidgetConfig,
  Report,
  DataStory,
  ThemeVariant,
  LayoutSettings,
  ToastNotification,
  ToastType,
  AISettings,
  AIProviderId,
  AIPrivacyMode,
  AIProviderConfig,
  AIModelDefinition,
  AVAILABLE_AI_MODELS,
  INITIAL_AI_SETTINGS,
} from '../types';

import { INITIAL_DATASETS, generateProfile } from '../data/seedDatasets';
import { translations, Language } from '../i18n/translations';
import { checkOllamaEngineHealth } from '../services/aiService';

interface ToastMethods {
  success: (title: string, message?: string, options?: Partial<ToastNotification>) => string;
  info: (title: string, message?: string, options?: Partial<ToastNotification>) => string;
  warning: (title: string, message?: string, options?: Partial<ToastNotification>) => string;
  error: (title: string, message?: string, options?: Partial<ToastNotification>) => string;
}

interface AppContextType {
  user: User;
  setUser: (u: User) => void;
  usersList: User[];
  setUsersList: React.Dispatch<React.SetStateAction<User[]>>;
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  datasets: Dataset[];
  activeDataset: Dataset;
  setActiveDatasetId: (id: string) => void;
  addDataset: (dataset: Omit<Dataset, 'profile'>) => void;
  updateDataset: (dataset: Dataset) => void;
  deleteDataset: (id: string) => void;
  deleteDatasets: (ids: string[]) => void;
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  setActiveDashboardId: (id: string) => void;
  saveDashboard: (dashboard: Dashboard) => void;
  addWidgetToDashboard: (dashboardId: string, widget: WidgetConfig) => void;
  updateWidgetInDashboard: (dashboardId: string, widget: WidgetConfig) => void;
  deleteWidgetFromDashboard: (dashboardId: string, widgetId: string) => void;
  chatSessions: ChatSession[];
  activeChatSession: ChatSession;
  addChatMessage: (sessionId: string, message: any) => void;
  createNewChatSession: () => void;
  reports: Report[];
  saveReport: (report: Report) => void;
  dataStories: DataStory[];
  saveDataStory: (story: DataStory) => void;
  auditLogs: AuditLogEntry[];
  addAuditLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  featureFlags: FeatureFlags;
  updateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
  theme: ThemeVariant;
  setTheme: (theme: ThemeVariant) => void;
  layoutSettings: LayoutSettings;
  updateLayoutSettings: (settings: Partial<LayoutSettings>) => void;
  resetLayoutSettings: () => void;
  // Toast notifications
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  toast: ToastMethods;
  // Onboarding Tour
  isTourOpen: boolean;
  setIsTourOpen: (open: boolean) => void;
  startTour: () => void;
  completeTour: () => void;
  // Event Bridge
  subscribeToEvent: (eventName: string, handler: (data?: any) => void) => () => void;
  publishEvent: (eventName: string, data?: any) => void;
  // Modeling Result
  modelingResult: any | null;
  setModelingResult: (result: any | null) => void;
  // AI Settings & Multi-Provider Engine (Ollama, Gemini, DeepSeek, Qwen, OpenRouter)
  aiSettings: AISettings;
  availableAIModels: AIModelDefinition[];
  activeAIModelDef: AIModelDefinition;
  setActiveAIProvider: (providerId: AIProviderId) => void;
  setActiveAIModel: (modelId: string) => void;
  setAIPrivacyMode: (mode: AIPrivacyMode) => void;
  updateProviderConfig: (providerId: AIProviderId, updates: Partial<AIProviderConfig>) => void;
  testProviderConnection: (providerId: AIProviderId) => Promise<{ status: 'connected' | 'error'; message: string; latencyMs?: number }>;
  refreshOllamaModels: () => Promise<string[]>;
  t: typeof translations.ar;
}

const ACCENT_COLOR_MAP: Record<string, { primary: string; hover: string; active: string }> = {
  blue: { primary: '#0f62fe', hover: '#0353e9', active: '#002d9c' },
  teal: { primary: '#009d9a', hover: '#007d79', active: '#005d5d' },
  purple: { primary: '#8a3ffc', hover: '#6929c4', active: '#491d8b' },
  cyan: { primary: '#1192e8', hover: '#0072c3', active: '#00539a' },
  magenta: { primary: '#ee5396', hover: '#d12771', active: '#9f1853' },
  green: { primary: '#24a148', hover: '#198038', active: '#0e6027' },
  orange: { primary: '#ff832b', hover: '#eb6200', active: '#ba4e00' },
};

const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  chartGridColumns: 2,
  kpiPosition: 'top',
  chartHeight: 'standard',
  showFormulas: true,
  showCardBadges: true,
  sidebarCollapsed: false,
  compactMode: false,
  accentColor: 'blue',
};

const getInitialTheme = (): ThemeVariant => {
  try {
    const saved = localStorage.getItem('carbon_theme');
    if (saved && ['g100', 'g90', 'midnight', 'g10', 'white'].includes(saved)) {
      return saved as ThemeVariant;
    }
  } catch (e) {}
  return 'g100';
};

const getInitialLayout = (): LayoutSettings => {
  try {
    const saved = localStorage.getItem('carbon_layout_settings');
    if (saved) {
      return { ...DEFAULT_LAYOUT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {}
  return DEFAULT_LAYOUT_SETTINGS;
};

const getInitialLanguage = (): Language => {
  try {
    const saved = localStorage.getItem('carbon_language');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch (e) {}
  return 'ar';
};

const getInitialDashboards = (): Dashboard[] => {
  try {
    const saved = localStorage.getItem('carbon_dashboards');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [DEFAULT_DASHBOARD];
};

const sanitizeStoredModel = (modelId?: string): string => {
  if (!modelId) return 'gemini-3.8-flash';
  const clean = modelId.toLowerCase().trim();
  if (
    clean === 'gemini-2.5-flash' ||
    clean === 'gemini-2.0-flash' ||
    clean === 'gemini-1.5-flash' ||
    clean === 'gemini-flash'
  ) {
    return 'gemini-3.8-flash';
  }
  if (clean === 'gemini-1.5-pro' || clean === 'gemini-2.0-pro' || clean === 'gemini-pro') {
    return 'gemini-3.1-pro-preview';
  }
  return modelId;
};

const getInitialAISettings = (): AISettings => {
  try {
    const saved = localStorage.getItem('carbon_ai_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const activeModel = sanitizeStoredModel(parsed.activeModel);
      return {
        ...INITIAL_AI_SETTINGS,
        ...parsed,
        activeModel,
        providers: {
          ...INITIAL_AI_SETTINGS.providers,
          ...(parsed.providers || {}),
          gemini: {
            ...INITIAL_AI_SETTINGS.providers.gemini,
            defaultModelId: 'gemini-3.8-flash',
            ...(parsed.providers?.gemini || {}),
          },
        },
      };
    }
  } catch (e) {}
  return INITIAL_AI_SETTINGS;
};


const DEFAULT_USER: User = {
  id: 'usr-1',
  name: 'أحمد الفرحات',
  email: 'ahmad.farahat@enterprise-analytics.ai',
  role: 'admin',
  workspaceId: 'ws-main',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const DEFAULT_WORKSPACE: Workspace = {
  id: 'ws-main',
  name: 'Enterprise Analytics Hub',
  slug: 'enterprise-hub',
  description: 'المساحة الرئيسية لتحليلات المؤسسة وعمليات البيانات الذكية',
  createdAt: '2025-01-01T00:00:00.000Z',
  plan: 'enterprise',
  datasetCount: INITIAL_DATASETS.length,
};

const DEFAULT_FLAGS: FeatureFlags = {
  FF_AI_ENABLED: true,
  FF_NL2SQL_ENABLED: true,
  FF_STREAMING_ENABLED: true,
  FF_PROFILING_CACHE: true,
  FF_ANOMALY_DETECTION: true,
  FF_EXPORT_PDF_ENABLED: true,
  FF_SQL_SANDBOX_STRICT: true,
};

const DEFAULT_DASHBOARD: Dashboard = {
  id: 'dash-main',
  workspaceId: 'ws-main',
  title: 'Executive Sales & Performance Cockpit',
  titleAr: 'لوحة القيادة التنفيذية للمبيعات والأداء',
  description: 'مؤشرات الأداء الرئيسية للإيرادات وتوزيع المبيعات والأرباح الإقليمية',
  updatedAt: new Date().toISOString(),
  createdAt: '2025-01-20T10:00:00.000Z',
  widgets: [
    {
      id: 'w-kpi-1',
      title: 'Total Revenue',
      titleAr: 'إجمالي الإيرادات المحققة',
      type: 'kpi',
      datasetId: 'ds-retail-2025',
      w: 3,
      h: 1,
      kpiMetric: {
        value: '$23,450.49',
        label: 'Gross Sales Volume',
        trendPercentage: 18.4,
        trendDirection: 'up',
        prefix: '$',
      },
    },
    {
      id: 'w-kpi-2',
      title: 'Operating Profit',
      titleAr: 'صافي الأرباح التشغيلية',
      type: 'kpi',
      datasetId: 'ds-retail-2025',
      w: 3,
      h: 1,
      kpiMetric: {
        value: '$7,840.49',
        label: 'Profit Margin (33.4%)',
        trendPercentage: 12.1,
        trendDirection: 'up',
      },
    },
    {
      id: 'w-kpi-3',
      title: 'Avg Shipping Time',
      titleAr: 'متوسط زمن الشحن والتوصيل',
      type: 'kpi',
      datasetId: 'ds-retail-2025',
      w: 3,
      h: 1,
      kpiMetric: {
        value: '3.1 Days',
        label: 'Global Fulfillment',
        trendPercentage: -8.5,
        trendDirection: 'up',
      },
    },
    {
      id: 'w-kpi-4',
      title: 'Data Health Score',
      titleAr: 'مؤشر جودة البيانات',
      type: 'kpi',
      datasetId: 'ds-retail-2025',
      w: 3,
      h: 1,
      kpiMetric: {
        value: '98.5%',
        label: 'Completeness & Validity',
        trendPercentage: 2.3,
        trendDirection: 'up',
      },
    },
    {
      id: 'w-chart-1',
      title: 'Revenue & Profit by Category',
      titleAr: 'الإيرادات والأرباح حسب التصنيف',
      type: 'bar',
      datasetId: 'ds-retail-2025',
      xAxis: 'category',
      yAxis: 'revenue',
      w: 6,
      h: 2,
    },
    {
      id: 'w-chart-2',
      title: 'Regional Revenue Share',
      titleAr: 'الحصة السوقية للإيرادات حسب المنطقة',
      type: 'pie',
      datasetId: 'ds-retail-2025',
      categoryField: 'region',
      yAxis: 'revenue',
      w: 6,
      h: 2,
    },
  ],
};

const DEFAULT_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'audit-101',
    userId: 'usr-1',
    userName: 'أحمد الفرحات',
    workspaceId: 'ws-main',
    action: 'DATASET_INGEST',
    resourceType: 'dataset',
    resourceId: 'ds-retail-2025',
    status: 'SUCCESS',
    durationMs: 45,
    timestamp: '2025-02-05T14:30:00.000Z',
    payloadSummary: 'Ingested Global E-Commerce & Retail 2025 (21 records, 13 columns)',
    riskLevel: 'LOW',
  },
  {
    id: 'audit-102',
    userId: 'usr-1',
    userName: 'أحمد الفرحات',
    workspaceId: 'ws-main',
    action: 'NL2SQL_SANDBOX_EVAL',
    resourceType: 'sql_query',
    status: 'SUCCESS',
    durationMs: 12,
    timestamp: '2025-02-05T14:35:10.000Z',
    payloadSummary: 'Executed 9-layer security audit on query: "SELECT category, SUM(revenue) ..."',
    riskLevel: 'MEDIUM',
  },
  {
    id: 'audit-103',
    userId: 'usr-1',
    userName: 'أحمد الفرحات',
    workspaceId: 'ws-main',
    action: 'PROFILING_ANOMALY_RUN',
    resourceType: 'dataset',
    resourceId: 'ds-retail-2025',
    status: 'SUCCESS',
    durationMs: 28,
    timestamp: '2025-02-05T14:36:00.000Z',
    payloadSummary: 'Computed IQR & Z-Score anomaly scan on revenue column',
    riskLevel: 'LOW',
  },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);
  const [theme, setThemeState] = useState<ThemeVariant>(getInitialTheme);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(getInitialLayout);
  const [user, setUser] = useState<User>(DEFAULT_USER);
  const [usersList, setUsersList] = useState<User[]>([
    DEFAULT_USER,
    {
      id: 'usr-2',
      name: 'سارة المنصور',
      email: 'sara.almansoor@enterprise.ai',
      role: 'analyst',
      workspaceId: 'ws-main',
      createdAt: '2025-01-05T00:00:00.000Z',
    },
    {
      id: 'usr-3',
      name: 'طارق الزهراني',
      email: 'tariq.zahrani@enterprise.ai',
      role: 'engineer',
      workspaceId: 'ws-main',
      createdAt: '2025-01-10T00:00:00.000Z',
    },
    {
      id: 'usr-4',
      name: 'مها الشمري',
      email: 'maha.shammari@enterprise.ai',
      role: 'viewer',
      workspaceId: 'ws-main',
      createdAt: '2025-01-15T00:00:00.000Z',
    },
  ]);
  const [workspace, setWorkspace] = useState<Workspace>(DEFAULT_WORKSPACE);
  const [datasets, setDatasets] = useState<Dataset[]>(INITIAL_DATASETS);
  const [activeDatasetId, setActiveDatasetId] = useState<string>(INITIAL_DATASETS[0].id);
  const [dashboards, setDashboards] = useState<Dashboard[]>(getInitialDashboards);
  const [activeDashboardId, setActiveDashboardId] = useState<string>(
    getInitialDashboards()[0]?.id || DEFAULT_DASHBOARD.id
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [dataStories, setDataStories] = useState<DataStory[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(DEFAULT_AUDIT_LOGS);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [modelingResult, setModelingResult] = useState<any | null>(null);

  // AI Providers & Models State
  const [aiSettings, setAiSettings] = useState<AISettings>(getInitialAISettings);

  // Sync AI settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('carbon_ai_settings', JSON.stringify(aiSettings));
    } catch (e) {}
  }, [aiSettings]);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: 'sess-1',
      title: 'استكشاف الأنماط والتوصيف العام',
      datasetId: INITIAL_DATASETS[0].id,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: 'm-1',
          sender: 'assistant',
          content: 'أهلاً بك! أنا المساعد التحليلي الذكي لمنصة البيانات. كيف يمكنني مساعدتك اليوم في استكشاف مجموعة البيانات، كشف القيم الشاذة، أو إنشاء استعلامات ولوحات تحكم مخصصة؟',
          timestamp: new Date().toISOString(),
          suggestions: [
            'ما هي أعلى المنتجات والأقسام ربحية؟',
            'هل توجد قيم شاذة في تكاليف الشحن؟',
            'أنشئ استعلام SQL لتوزيع المبيعات حسب الدولة',
          ],
        },
      ],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('sess-1');

  // Event Bus
  const [eventHandlers, setEventHandlers] = useState<Record<string, Array<(data?: any) => void>>>({});

  const subscribeToEvent = (eventName: string, handler: (data?: any) => void) => {
    console.log(`Subscribed to event: ${eventName}`);
    setEventHandlers(prev => ({
      ...prev,
      [eventName]: [...(prev[eventName] || []), handler]
    }));
    return () => {
      setEventHandlers(prev => ({
        ...prev,
        [eventName]: (prev[eventName] || []).filter(h => h !== handler)
      }));
    };
  };

  const publishEvent = (eventName: string, data?: any) => {
    console.log(`Publishing event: ${eventName}`, data);
    if (eventHandlers[eventName]) {
      eventHandlers[eventName].forEach(handler => handler(data));
    }
  };

  // Derive active model definition
  const activeAIModelDef = AVAILABLE_AI_MODELS.find(m => m.id === aiSettings.activeModel) || AVAILABLE_AI_MODELS[0];

  const setActiveAIProvider = (providerId: AIProviderId) => {
    const defaultModel = sanitizeStoredModel(aiSettings.providers[providerId]?.defaultModelId || (providerId === 'gemini' ? 'gemini-3.8-flash' : 'gemini-3.8-flash'));
    setAiSettings(prev => ({
      ...prev,
      activeProvider: providerId,
      activeModel: defaultModel,
    }));
  };

  const setActiveAIModel = (modelId: string) => {
    const modelDef = AVAILABLE_AI_MODELS.find(m => m.id === modelId);
    setAiSettings(prev => ({
      ...prev,
      activeModel: modelId,
      activeProvider: modelDef ? modelDef.provider : prev.activeProvider,
    }));
  };

  const setAIPrivacyMode = (mode: AIPrivacyMode) => {
    setAiSettings(prev => {
      let activeProvider = prev.activeProvider;
      let activeModel = prev.activeModel;
      if (mode === 'strict_local') {
        activeProvider = 'ollama';
        activeModel = 'ollama/qwen2.5-coder:7b';
      }
      return {
        ...prev,
        privacyMode: mode,
        activeProvider,
        activeModel,
      };
    });
  };

  const updateProviderConfig = (providerId: AIProviderId, updates: Partial<AIProviderConfig>) => {
    setAiSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...prev.providers[providerId],
          ...updates,
        },
      },
    }));
  };

  const testProviderConnection = async (providerId: AIProviderId): Promise<{ status: 'connected' | 'error'; message: string; latencyMs?: number }> => {
    const config = aiSettings.providers[providerId];
    try {
      updateProviderConfig(providerId, { status: 'checking' });
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          endpointUrl: config?.endpointUrl,
          apiKey: config?.apiKey,
          model: config?.defaultModelId,
        }),
      });
      const data = await res.json();
      const isOk = data.status === 'connected';
      updateProviderConfig(providerId, {
        status: isOk ? 'connected' : 'error',
        lastPingMs: data.latencyMs,
        errorMessage: isOk ? undefined : data.message,
        installedLocalModels: data.models,
      });
      return {
        status: isOk ? 'connected' : 'error',
        message: data.message || (isOk ? 'Connection verified.' : 'Failed to connect.'),
        latencyMs: data.latencyMs,
      };
    } catch (err: any) {
      updateProviderConfig(providerId, {
        status: 'error',
        errorMessage: err?.message || 'Connection failed',
      });
      return {
        status: 'error',
        message: err?.message || 'Network error testing connection',
      };
    }
  };

  const refreshOllamaModels = async (): Promise<string[]> => {
    try {
      const endpoint = aiSettings.providers.ollama.endpointUrl || 'http://localhost:11434';
      const health = await checkOllamaEngineHealth(endpoint);
      if (health.engineReady && health.installedModels.length > 0) {
        updateProviderConfig('ollama', {
          status: 'connected',
          installedLocalModels: health.installedModels,
        });
        return health.installedModels;
      }
    } catch (e) {}
    return [];
  };


  // Sync language with HTML document
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    try {
      localStorage.setItem('carbon_language', language);
    } catch (e) {}
  }, [language]);

  // Sync theme, accent color, and compactMode with HTML document and body
  useEffect(() => {
    const themeClasses = ['theme-g100', 'theme-g90', 'theme-midnight', 'theme-g10', 'theme-white'];
    const activeClass = `theme-${theme}`;

    // Dynamically toggle the theme class on both document.documentElement and document.body
    [document.documentElement, document.body].forEach(element => {
      if (!element) return;
      themeClasses.forEach(cls => element.classList.remove(cls));
      element.classList.add(activeClass);
      element.setAttribute('data-theme', theme);
    });

    const accent = layoutSettings.accentColor || 'blue';
    const colors = ACCENT_COLOR_MAP[accent] || ACCENT_COLOR_MAP.blue;
    document.documentElement.style.setProperty('--cds-interactive-01', colors.primary);
    document.documentElement.style.setProperty('--cds-interactive-01-hover', colors.hover);
    document.documentElement.style.setProperty('--cds-interactive-01-active', colors.active);
    document.documentElement.style.setProperty('--cds-accent', colors.primary);

    if (layoutSettings.compactMode) {
      document.documentElement.classList.add('compact-mode');
      document.body?.classList.add('compact-mode');
    } else {
      document.documentElement.classList.remove('compact-mode');
      document.body?.classList.remove('compact-mode');
    }

    try {
      localStorage.setItem('carbon_theme', theme);
    } catch (e) {}
  }, [theme, layoutSettings.accentColor, layoutSettings.compactMode]);

  // Persist layout settings
  useEffect(() => {
    try {
      localStorage.setItem('carbon_layout_settings', JSON.stringify(layoutSettings));
    } catch (e) {}
  }, [layoutSettings]);

  // Persist dashboards
  useEffect(() => {
    try {
      localStorage.setItem('carbon_dashboards', JSON.stringify(dashboards));
    } catch (e) {}
  }, [dashboards]);

  const setTheme = (newTheme: ThemeVariant) => {
    setThemeState(newTheme);
  };

  const updateLayoutSettings = (settings: Partial<LayoutSettings>) => {
    setLayoutSettings(prev => ({ ...prev, ...settings }));
  };

  const resetLayoutSettings = () => {
    setLayoutSettings(DEFAULT_LAYOUT_SETTINGS);
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const activeDataset = datasets.find(d => d.id === activeDatasetId) || datasets[0];
  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || dashboards[0] || null;
  const activeChatSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];

  const addDataset = (newDsData: Omit<Dataset, 'profile'>) => {
    const profiled: Dataset = {
      ...newDsData,
      profile: generateProfile(newDsData),
    };
    setDatasets(prev => [profiled, ...prev]);
    setActiveDatasetId(profiled.id);
    addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: workspace.id,
      action: 'DATASET_CREATE',
      resourceType: 'dataset',
      resourceId: profiled.id,
      status: 'SUCCESS',
      durationMs: 35,
      payloadSummary: `Created dataset "${profiled.name}" with ${profiled.rowCount} records.`,
      riskLevel: 'LOW',
    });
  };

  const updateDataset = (updated: Dataset) => {
    setDatasets(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const deleteDataset = (id: string) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (activeDatasetId === id && datasets.length > 1) {
      const remaining = datasets.filter(d => d.id !== id);
      setActiveDatasetId(remaining[0].id);
    }
  };

  const deleteDatasets = (ids: string[]) => {
    const idsSet = new Set(ids);
    setDatasets(prev => {
      const remaining = prev.filter(d => !idsSet.has(d.id));
      if (idsSet.has(activeDatasetId) && remaining.length > 0) {
        setActiveDatasetId(remaining[0].id);
      }
      return remaining;
    });
    addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: workspace.id,
      action: 'DATASET_DELETE',
      resourceType: 'dataset',
      resourceId: ids.join(','),
      status: 'SUCCESS',
      durationMs: 40,
      payloadSummary: `Bulk deleted ${ids.length} datasets.`,
      riskLevel: 'MEDIUM',
    });
  };

  const saveDashboard = (d: Dashboard) => {
    setDashboards(prev => {
      const idx = prev.findIndex(item => item.id === d.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = d;
        return copy;
      }
      return [d, ...prev];
    });
  };

  const addWidgetToDashboard = (dashboardId: string, widget: WidgetConfig) => {
    setDashboards(prev =>
      prev.map(d => {
        if (d.id === dashboardId) {
          return {
            ...d,
            widgets: [...d.widgets, widget],
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );
  };

  const updateWidgetInDashboard = (dashboardId: string, widget: WidgetConfig) => {
    setDashboards(prev =>
      prev.map(d => {
        if (d.id === dashboardId) {
          return {
            ...d,
            widgets: d.widgets.map(w => (w.id === widget.id ? widget : w)),
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );
  };

  const deleteWidgetFromDashboard = (dashboardId: string, widgetId: string) => {
    setDashboards(prev =>
      prev.map(d => {
        if (d.id === dashboardId) {
          return {
            ...d,
            widgets: d.widgets.filter(w => w.id !== widgetId),
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );
  };

  const addChatMessage = (sessionId: string, message: any) => {
    setChatSessions(prev =>
      prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: [...s.messages, message],
          };
        }
        return s;
      })
    );
  };

  const createNewChatSession = () => {
    const newId = `sess-${Date.now()}`;
    const newSess: ChatSession = {
      id: newId,
      title: language === 'ar' ? 'جلسة تحليلية جديدة' : 'New Analytical Session',
      datasetId: activeDataset.id,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: 'assistant',
          content: language === 'ar'
            ? 'جلسة جديدة بدأت. كيف يمكنني مساعدتك في استكشاف وتحليل البيانات؟'
            : 'New session started. How can I assist you with your data intelligence today?',
          timestamp: new Date().toISOString(),
        },
      ],
    };
    setChatSessions(prev => [newSess, ...prev]);
    setActiveSessionId(newId);
  };

  const saveReport = (report: Report) => {
    setReports(prev => {
      const idx = prev.findIndex(r => r.id === report.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = report;
        return copy;
      }
      return [report, ...prev];
    });
  };

  const saveDataStory = (story: DataStory) => {
    setDataStories(prev => {
      const idx = prev.findIndex(s => s.id === story.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = story;
        return copy;
      }
      return [story, ...prev];
    });
  };

  const addAuditLog = (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    setAuditLogs(prev => [newEntry, ...prev]);
  };

  const updateFeatureFlags = (flags: Partial<FeatureFlags>) => {
    setFeatureFlags(prev => ({ ...prev, ...flags }));
  };

  // Toast Notifications State & Dispatchers
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const clearToasts = () => {
    setToasts([]);
  };

  const addToast = (toastData: Omit<ToastNotification, 'id' | 'timestamp'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastNotification = {
      id,
      timestamp: Date.now(),
      duration: toastData.duration ?? 4500,
      ...toastData,
    };
    setToasts(prev => [newToast, ...prev.slice(0, 4)]); // Keep max 5 active toasts
    return id;
  };

  const toast: ToastMethods = {
    success: (title: string, message?: string, options?: Partial<ToastNotification>) =>
      addToast({ type: 'success', title, message: message || '', ...options }),
    info: (title: string, message?: string, options?: Partial<ToastNotification>) =>
      addToast({ type: 'info', title, message: message || '', ...options }),
    warning: (title: string, message?: string, options?: Partial<ToastNotification>) =>
      addToast({ type: 'warning', title, message: message || '', ...options }),
    error: (title: string, message?: string, options?: Partial<ToastNotification>) =>
      addToast({ type: 'error', title, message: message || '', ...options }),
  };

  // Onboarding Tour State
  const [isTourOpen, setIsTourOpen] = useState<boolean>(() => {
    try {
      const tourCompleted = localStorage.getItem('carbon_onboarding_completed');
      return !tourCompleted;
    } catch {
      return false;
    }
  });

  const startTour = () => {
    setIsTourOpen(true);
  };

  const completeTour = () => {
    setIsTourOpen(false);
    try {
      localStorage.setItem('carbon_onboarding_completed', 'true');
    } catch {}
    toast.success(
      language === 'ar' ? 'اكتملت الجولة التعريفية بنجاح!' : 'Onboarding Tour Completed!',
      language === 'ar'
        ? 'يمكنك دائماً إعادة تشغيل الجولة من أيقونة المساعدة أو الشريط العلوي.'
        : 'You can relaunch the tour anytime from the top header or help menu.'
    );
  };

  const t = translations[language];

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        usersList,
        setUsersList,
        workspace,
        setWorkspace,
        datasets,
        activeDataset,
        setActiveDatasetId,
        addDataset,
        updateDataset,
        deleteDataset,
        deleteDatasets,
        dashboards,
        activeDashboard,
        setActiveDashboardId,
        saveDashboard,
        addWidgetToDashboard,
        updateWidgetInDashboard,
        deleteWidgetFromDashboard,
        chatSessions,
        activeChatSession,
        addChatMessage,
        createNewChatSession,
        reports,
        saveReport,
        dataStories,
        saveDataStory,
        auditLogs,
        addAuditLog,
        featureFlags,
        updateFeatureFlags,
        modelingResult,
        setModelingResult,
        language,
        setLanguage,
        activeTab,
        setActiveTab,
        isCopilotOpen,
        setIsCopilotOpen,
        theme,
        setTheme,
        layoutSettings,
        updateLayoutSettings,
        resetLayoutSettings,
        toasts,
        addToast,
        removeToast,
        clearToasts,
        toast,
        isTourOpen,
        setIsTourOpen,
        startTour,
        completeTour,
        subscribeToEvent,
        publishEvent,
        aiSettings,
        availableAIModels: AVAILABLE_AI_MODELS,
        activeAIModelDef,
        setActiveAIProvider,
        setActiveAIModel,
        setAIPrivacyMode,
        updateProviderConfig,
        testProviderConnection,
        refreshOllamaModels,
        t,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
