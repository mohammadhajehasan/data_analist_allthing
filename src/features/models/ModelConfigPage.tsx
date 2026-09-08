import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Shield,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Globe,
  Sliders,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Save,
  HelpCircle,
  Activity,
  FileCode,
  DollarSign,
  Play,
  PieChart,
  BarChart3,
  MessageSquare,
  Clock,
  Layers,
  ArrowRight,
  Calculator,
  RotateCcw,
  Sparkle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AIProviderId, AIPrivacyMode, AIModelDefinition } from '../../types';
import { checkOllamaEngineHealth, OllamaHealthResult } from '../../services/aiService';
import { JsonRpcGatewayPanel } from '../../components/ai/JsonRpcGatewayPanel';

// Interface for Token Consumption Tracking
interface TokenUsageEntry {
  id: string;
  timestamp: string;
  provider: AIProviderId;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  isLocal: boolean;
  queryType: 'sandbox' | 'nl2sql' | 'chat' | 'optimize' | 'modeling';
}

interface ProviderCostSummary {
  providerId: AIProviderId;
  name: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  queriesCount: number;
  isLocal: boolean;
}

export const ModelConfigPage: React.FC = () => {
  const {
    language,
    aiSettings,
    availableAIModels,
    activeAIModelDef,
    setActiveAIProvider,
    setActiveAIModel,
    setAIPrivacyMode,
    updateProviderConfig,
    testProviderConnection,
    refreshOllamaModels,
    toast,
  } = useApp();

  const isAr = language === 'ar';

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'providers' | 'sandbox' | 'tokens' | 'privacy' | 'docs' | 'jsonrpc'>('providers');

  // Provider config sub-selection
  const [selectedProviderId, setSelectedProviderId] = useState<AIProviderId>('ollama');
  const [testingId, setTestingId] = useState<AIProviderId | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);

  // Ollama Health Ping State
  const [ollamaPing, setOllamaPing] = useState<OllamaHealthResult>({
    status: 'idle' as any,
    engineReady: false,
    modelCount: 0,
    installedModels: [],
    latencyMs: null,
    endpointUrl: 'http://localhost:11434',
    lastPingTime: null as any,
    details: '',
  });

  // ----------------------------------------------------
  // Sandbox State
  // ----------------------------------------------------
  const [sandboxModelId, setSandboxModelId] = useState<string>(activeAIModelDef.id || 'gemini-3.8-flash');
  const [sandboxSystemInstruction, setSandboxSystemInstruction] = useState<string>(
    isAr
      ? 'أنت مساعد خبير في تحليل البيانات واستعلامات SQL وذكاء الأعمال. أجب بوضوح واحترافية.'
      : 'You are an expert AI data analyst & SQL engineer. Respond with clean markdown and actionable insights.'
  );
  const [sandboxPrompt, setSandboxPrompt] = useState<string>('');
  const [sandboxTemperature, setSandboxTemperature] = useState<number>(0.2);
  const [sandboxMaxTokens, setSandboxMaxTokens] = useState<number>(1024);
  const [sandboxIsRunning, setSandboxIsRunning] = useState<boolean>(false);
  const [sandboxResponse, setSandboxResponse] = useState<{
    text: string;
    durationMs: number | null;
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    isLocal: boolean;
    error?: string;
  } | null>(null);

  // ----------------------------------------------------
  // Token Consumption & Cost Tracker State
  // ----------------------------------------------------
  const [usageHistory, setUsageHistory] = useState<TokenUsageEntry[]>(() => {
    try {
      const saved = localStorage.getItem('carbon_ai_token_usage_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    // Initial Seed Stats for demonstration
    return [
      {
        id: 'seed-1',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        provider: 'gemini',
        modelId: 'gemini-3.8-flash',
        promptTokens: 1420,
        completionTokens: 380,
        totalTokens: 1800,
        costUsd: 0.00022,
        isLocal: false,
        queryType: 'nl2sql',
      },
      {
        id: 'seed-2',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        provider: 'ollama',
        modelId: 'ollama/qwen2.5-coder:7b',
        promptTokens: 2100,
        completionTokens: 850,
        totalTokens: 2950,
        costUsd: 0,
        isLocal: true,
        queryType: 'optimize',
      },
      {
        id: 'seed-3',
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        provider: 'deepseek',
        modelId: 'deepseek/deepseek-r1',
        promptTokens: 3400,
        completionTokens: 1200,
        totalTokens: 4600,
        costUsd: 0.0045,
        isLocal: false,
        queryType: 'chat',
      },
      {
        id: 'seed-4',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        provider: 'gemini',
        modelId: 'gemini-3.1-pro-preview',
        promptTokens: 5200,
        completionTokens: 1800,
        totalTokens: 7000,
        costUsd: 0.0155,
        isLocal: false,
        queryType: 'modeling',
      },
    ];
  });

  // Simulator State
  const [simDailyQueries, setSimDailyQueries] = useState<number>(150);
  const [simAvgTokensPerQuery, setSimAvgTokensPerQuery] = useState<number>(2500);

  // Save Usage History to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('carbon_ai_token_usage_v1', JSON.stringify(usageHistory));
    } catch (e) {}
  }, [usageHistory]);

  // Handle Ollama Ping
  const handlePingOllamaBaseUrl = async () => {
    setOllamaPing(prev => ({ ...prev, status: 'pinging' }));
    const endpoint = aiSettings.providers.ollama.endpointUrl || 'http://localhost:11434';
    const result = await checkOllamaEngineHealth(endpoint);
    setOllamaPing(result);
  };

  useEffect(() => {
    if (selectedProviderId === 'ollama') {
      handlePingOllamaBaseUrl();
      const interval = setInterval(() => {
        handlePingOllamaBaseUrl();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedProviderId, aiSettings.providers.ollama.endpointUrl]);

  const handleTestConnection = async (providerId: AIProviderId) => {
    setTestingId(providerId);
    const res = await testProviderConnection(providerId);
    setTestingId(null);
    if (providerId === 'ollama') {
      handlePingOllamaBaseUrl();
    }
    if (res.status === 'connected') {
      toast.success(
        isAr ? 'تم التحقق من الاتصال بنجاح' : 'Connection Verified',
        isAr ? `المزود ${providerId} متصل بزمن استجابة ${res.latencyMs || 0}ms.` : `Connected in ${res.latencyMs || 0}ms.`
      );
    } else {
      toast.error(
        isAr ? 'تعذر الاتصال بالمزود' : 'Connection Failed',
        res.message || (isAr ? 'يرجى مراجعة الرابط أو مفتاح الـ API.' : 'Verify Base URL or API Key.')
      );
    }
  };

  const handleRefreshOllama = async () => {
    setIsRefreshingOllama(true);
    const models = await refreshOllamaModels();
    setIsRefreshingOllama(false);
    if (models.length > 0) {
      toast.success(
        isAr ? 'تم اكتشاف نماذج محلية' : 'Local Models Discovered',
        isAr ? `تم الكشف عن ${models.length} نموذج محلي مثبت في Ollama.` : `Discovered ${models.length} installed Ollama models.`
      );
    } else {
      toast.warning(
        isAr ? 'تعذر العثور على نماذج' : 'No Local Models Found',
        isAr ? 'تأكد من تشغيل أمر "ollama serve" على منفذ 11434.' : 'Ensure "ollama serve" is active on port 11434.'
      );
    }
  };

  const copyCmd = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
    toast.info(isAr ? 'تم النسخ إلى الحافظة' : 'Copied Command', text);
  };

  // Record Token Usage Utility
  const recordTokenUsage = (entry: Omit<TokenUsageEntry, 'id' | 'timestamp'>) => {
    const newEntry: TokenUsageEntry = {
      ...entry,
      id: `usage-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    setUsageHistory(prev => [newEntry, ...prev]);
  };

  // Run Sandbox Query
  const handleRunSandbox = async () => {
    if (!sandboxPrompt.trim()) {
      toast.warning(
        isAr ? 'حقل النص فارغ' : 'Empty Prompt',
        isAr ? 'يرجى إدخال استعلام أو سؤال تجريبي لاختبار النموذج.' : 'Please enter a test prompt.'
      );
      return;
    }

    const selectedModelDef = availableAIModels.find(m => m.id === sandboxModelId) || availableAIModels[0];
    const providerConfig = aiSettings.providers[selectedModelDef.provider];

    setSandboxIsRunning(true);
    setSandboxResponse(null);

    try {
      const res = await fetch('/api/ai/sandbox/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedModelDef.provider,
          model: selectedModelDef.id,
          prompt: sandboxPrompt,
          systemInstruction: sandboxSystemInstruction,
          endpointUrl: providerConfig?.endpointUrl,
          apiKey: providerConfig?.apiKey,
          temperature: sandboxTemperature,
          maxTokens: sandboxMaxTokens,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSandboxResponse({
          text: data.text,
          durationMs: data.durationMs,
          modelUsed: data.modelUsed,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          totalTokens: data.totalTokens,
          estimatedCostUsd: data.estimatedCostUsd,
          isLocal: data.isLocal,
        });

        // Track in stats
        recordTokenUsage({
          provider: selectedModelDef.provider,
          modelId: selectedModelDef.id,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          totalTokens: data.totalTokens,
          costUsd: data.estimatedCostUsd,
          isLocal: data.isLocal,
          queryType: 'sandbox',
        });

        toast.success(
          isAr ? 'تم استلام الاستجابة بنجاح' : 'Response Received',
          isAr ? `النموذج: ${data.modelUsed} (${data.durationMs}ms)` : `Model: ${data.modelUsed} in ${data.durationMs}ms`
        );
      } else {
        setSandboxResponse({
          text: '',
          durationMs: data.durationMs || 0,
          modelUsed: selectedModelDef.name,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          isLocal: selectedModelDef.isLocal,
          error: data.error || (isAr ? 'فشل استلام استجابة من النموذج' : 'Model response failed'),
        });
        toast.error(
          isAr ? 'فشل اختبار النموذج' : 'Test Failed',
          data.error || (isAr ? 'تأكد من الاتصال بالمزود وضبط الإعدادات' : 'Verify provider connection')
        );
      }
    } catch (err: any) {
      setSandboxResponse({
        text: '',
        durationMs: 0,
        modelUsed: selectedModelDef.name,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        isLocal: selectedModelDef.isLocal,
        error: err?.message || 'Network exception occurred',
      });
      toast.error(
        isAr ? 'خطأ في الشبكة' : 'Network Error',
        err?.message || 'Failed to reach AI Sandbox backend'
      );
    } finally {
      setSandboxIsRunning(false);
    }
  };

  // Compute Token Stats Summary
  const totalTokensConsumed = usageHistory.reduce((acc, curr) => acc + curr.totalTokens, 0);
  const totalCostUsd = usageHistory.reduce((acc, curr) => acc + curr.costUsd, 0);
  const totalCostSar = totalCostUsd * 3.75;
  const localQueriesCount = usageHistory.filter(u => u.isLocal).length;
  
  // Calculate Savings from Local Models (assuming avg cloud cost $0.00025 per 1k tokens)
  const localTokensCount = usageHistory.filter(u => u.isLocal).reduce((acc, curr) => acc + curr.totalTokens, 0);
  const estimatedSavingsUsd = (localTokensCount / 1000) * 0.00035;

  // Group Usage by Provider
  const providerSummaries: Record<string, ProviderCostSummary> = {
    gemini: { providerId: 'gemini', name: 'Google Gemini', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: false },
    ollama: { providerId: 'ollama', name: 'Ollama (Local)', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: true },
    deepseek: { providerId: 'deepseek', name: 'DeepSeek / Z.AI', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: false },
    qwen: { providerId: 'qwen', name: 'Qwen AI', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: false },
    openrouter: { providerId: 'openrouter', name: 'OpenRouter', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: false },
    custom_openai: { providerId: 'custom_openai', name: 'Custom OpenAI', promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, queriesCount: 0, isLocal: true },
  };

  usageHistory.forEach(entry => {
    const key = entry.provider || 'gemini';
    if (providerSummaries[key]) {
      providerSummaries[key].promptTokens += entry.promptTokens;
      providerSummaries[key].completionTokens += entry.completionTokens;
      providerSummaries[key].totalTokens += entry.totalTokens;
      providerSummaries[key].costUsd += entry.costUsd;
      providerSummaries[key].queriesCount += 1;
    }
  });

  const currentProvider = aiSettings.providers[selectedProviderId];
  const providerModels = availableAIModels.filter(m => m.provider === selectedProviderId);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      
      {/* Page Header Banner */}
      <div className="bg-[#161616] p-5 sm:p-6 border border-[#2d2d2d] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-[#0f62fe]/15 text-[#78a9ff] flex items-center justify-center border border-[#0f62fe]/40 shrink-0 rounded-xs">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-[#f4f4f4] tracking-tight">
                {isAr ? 'إدارة ونماذج الذكاء الاصطناعي (AI Model Hub)' : 'AI Model & Operations Hub'}
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 rounded-xs">
                Ollama Local + Gemini Cloud + Multi-LLM
              </span>
            </div>
            <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
              {isAr
                ? 'تهيئة محركات الذكاء الاصطناعي، تجربة النماذج في مختبر الـ Sandbox، ومراقبة استهلاك التوكنات والتكاليف المالية المباشرة.'
                : 'Manage AI model providers, test models in the interactive Sandbox, and monitor token consumption & cloud budgets.'}
            </p>
          </div>
        </div>

        {/* Global Active Engine Indicator */}
        <div className="flex items-center gap-3 bg-[#262626] px-3.5 py-2 border border-[#393939] text-xs rounded-xs shrink-0">
          <span className="text-[#8d8d8d] font-medium">{isAr ? 'المحرك النشط:' : 'Active Engine:'}</span>
          <div className="font-semibold text-[#f4f4f4] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeAIModelDef.isLocal ? 'bg-[#42be65]' : 'bg-[#0f62fe]'}`} />
            <span>{activeAIModelDef.name}</span>
          </div>
        </div>
      </div>

      {/* Primary Top Navigation Tabs (System Design Polish) */}
      <div className="flex items-center gap-1 sm:gap-2 bg-[#161616] p-1.5 border border-[#2d2d2d] overflow-x-auto">
        <button
          onClick={() => setActiveTab('providers')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'providers'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>{isAr ? 'المزودات والنماذج' : 'Providers & Models'}</span>
        </button>

        <button
          onClick={() => setActiveTab('sandbox')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'sandbox'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <Play className="w-4 h-4 text-[#ff832b]" />
          <span>{isAr ? 'منطقة التجربة السريعة (Sandbox)' : 'AI Model Sandbox'}</span>
          <span className="px-1.5 py-0.2 text-[9px] bg-[#ff832b]/20 text-[#ff832b] border border-[#ff832b]/40 rounded-xs font-mono">
            New
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tokens')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'tokens'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <DollarSign className="w-4 h-4 text-[#24a148]" />
          <span>{isAr ? 'مراقبة التوكنات والتكاليف' : 'Token & Cost Monitor'}</span>
          <span className="px-1.5 py-0.2 text-[9px] bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 rounded-xs font-mono">
            ${totalCostUsd.toFixed(3)}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'privacy'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <Lock className="w-4 h-4 text-[#42be65]" />
          <span>{isAr ? 'سياسة الخصوصية' : 'Data Privacy'}</span>
        </button>

        <button
          onClick={() => setActiveTab('jsonrpc')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'jsonrpc'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <Server className="w-4 h-4 text-[#be95ff]" />
          <span>{isAr ? 'بوابة JSON-RPC الخارجية' : 'JSON-RPC AI Gateway'}</span>
          <span className="px-1.5 py-0.2 text-[9px] bg-purple-500/20 text-[#be95ff] border border-purple-500/40 rounded-xs font-mono">
            RPC 2.0
          </span>
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`h-9 px-3.5 sm:px-4 text-xs font-semibold flex items-center gap-2 transition-all rounded-xs whitespace-nowrap cursor-pointer ${
            activeTab === 'docs'
              ? 'bg-[#0f62fe] text-white shadow-xs'
              : 'text-[#a8a8a8] hover:text-[#f4f4f4] hover:bg-[#262626]'
          }`}
        >
          <FileCode className="w-4 h-4 text-[#78a9ff]" />
          <span>{isAr ? 'دليل الربط البرمجي' : 'API Integration Guide'}</span>
        </button>
      </div>

      {/* TAB 1: PROVIDERS & MODEL CONFIGURATION */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Sidebar Provider Switcher */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-[#161616] border border-[#2d2d2d] p-3 space-y-1">
              <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-[#8d8d8d] uppercase">
                {isAr ? 'مزودو الخدمة النماذج (AI Providers)' : 'AI Service Providers'}
              </div>

              {/* Ollama Local */}
              <button
                onClick={() => setSelectedProviderId('ollama')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'ollama'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#42be65]" />
                  <div>
                    <div className="font-semibold">Ollama (Local Engine)</div>
                    <div className="text-[10px] opacity-80">{isAr ? '🔒 خصوصية محلية 100%' : '🔒 100% Zero-Egress'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'ollama' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>

              {/* Google Gemini */}
              <button
                onClick={() => setSelectedProviderId('gemini')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'gemini'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#78a9ff]" />
                  <div>
                    <div className="font-semibold">Google Gemini</div>
                    <div className="text-[10px] opacity-80">{isAr ? '⚡ مدمج وسريع سحابياً' : '⚡ Native & High Throughput'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'gemini' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>

              {/* DeepSeek */}
              <button
                onClick={() => setSelectedProviderId('deepseek')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'deepseek'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-[#ff832b]" />
                  <div>
                    <div className="font-semibold">DeepSeek / Z.AI</div>
                    <div className="text-[10px] opacity-80">{isAr ? '🧠 استدلال عميق R1 & V3' : '🧠 Deep Reasoning R1 & V3'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'deepseek' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>

              {/* Qwen */}
              <button
                onClick={() => setSelectedProviderId('qwen')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'qwen'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Server className="w-4 h-4 text-[#be95ff]" />
                  <div>
                    <div className="font-semibold">Qwen AI (Alibaba)</div>
                    <div className="text-[10px] opacity-80">{isAr ? '📊 متخصص في لغة SQL' : '📊 Specialized SQL Coder'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'qwen' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>

              {/* OpenRouter */}
              <button
                onClick={() => setSelectedProviderId('openrouter')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'openrouter'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-[#33b1ff]" />
                  <div>
                    <div className="font-semibold">OpenRouter Gateway</div>
                    <div className="text-[10px] opacity-80">{isAr ? '🌐 بوابة النماذج العالمية' : '🌐 Universal LLM Gateway'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'openrouter' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>

              {/* Custom OpenAI */}
              <button
                onClick={() => setSelectedProviderId('custom_openai')}
                className={`w-full flex items-center justify-between px-3 py-3 text-xs text-start transition-all border rounded-xs cursor-pointer ${
                  selectedProviderId === 'custom_openai'
                    ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-semibold'
                    : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:bg-[#393939] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 text-[#a8a8a8]" />
                  <div>
                    <div className="font-semibold">{isAr ? 'خادم خاص (vLLM / LM Studio)' : 'Custom OpenAI / vLLM'}</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'خوادم داخلية On-Premise' : 'Private On-Premise Endpoint'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'custom_openai' && (
                  <span className="px-2 py-0.5 text-[9px] bg-white/20 text-white font-mono font-bold rounded-xs">Active</span>
                )}
              </button>
            </div>
          </div>

          {/* Right Provider Details Canvas */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-6 shadow-sm">
              
              {/* Provider Header Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#2d2d2d] pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-[#f4f4f4]">
                      {isAr ? currentProvider.nameAr : currentProvider.name}
                    </h2>
                    <span className="px-2.5 py-0.5 text-[10px] font-semibold bg-[#262626] text-[#78a9ff] border border-[#393939] rounded-xs">
                      {isAr ? currentProvider.badgeAr : currentProvider.badge}
                    </span>
                  </div>
                  <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
                    {isAr ? currentProvider.descriptionAr : currentProvider.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleTestConnection(currentProvider.providerId)}
                    disabled={testingId === currentProvider.providerId}
                    className="h-9 px-3.5 text-xs font-semibold bg-[#262626] hover:bg-[#393939] text-[#f4f4f4] border border-[#525252] flex items-center gap-2 transition-all rounded-xs disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingId === currentProvider.providerId ? 'animate-spin' : ''}`} />
                    {testingId === currentProvider.providerId
                      ? (isAr ? 'جاري الفحص...' : 'Testing...')
                      : (isAr ? 'اختبار الاتصال' : 'Test Connection')}
                  </button>

                  {aiSettings.activeProvider !== currentProvider.providerId ? (
                    <button
                      onClick={() => {
                        setActiveAIProvider(currentProvider.providerId);
                        toast.success(
                          isAr ? 'تم تعيين المزود النشط' : 'Active Provider Set',
                          isAr ? currentProvider.nameAr : currentProvider.name
                        );
                      }}
                      className="h-9 px-4 text-xs font-semibold bg-[#0f62fe] hover:bg-[#0353e9] text-white transition-all rounded-xs cursor-pointer shadow-xs"
                    >
                      {isAr ? 'تعيين كمزود نشط' : 'Set as Active'}
                    </button>
                  ) : (
                    <span className="h-9 px-3.5 text-xs font-semibold bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 flex items-center gap-1.5 rounded-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isAr ? 'المزود النشط حالياً' : 'Active Provider'}
                    </span>
                  )}
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 text-xs flex items-center justify-between border rounded-xs ${
                currentProvider.status === 'connected'
                  ? 'bg-[#24a148]/10 border-[#24a148]/30 text-[#42be65]'
                  : currentProvider.status === 'error'
                  ? 'bg-[#da1e28]/10 border-[#da1e28]/30 text-[#ff8389]'
                  : 'bg-[#262626] border-[#393939] text-[#c6c6c6]'
              }`}>
                <div className="flex items-center gap-2.5">
                  {currentProvider.status === 'connected' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : currentProvider.status === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <Server className="w-4 h-4 shrink-0 text-[#8d8d8d]" />
                  )}
                  <span>
                    {currentProvider.status === 'connected'
                      ? (isAr ? `الاتصال جاهز ومفعل (زمن الاستجابة: ${currentProvider.lastPingMs || 8}ms)` : `Connected and verified (${currentProvider.lastPingMs || 8}ms latency)`)
                      : currentProvider.status === 'error'
                      ? (currentProvider.errorMessage || (isAr ? 'فشل الاتصال بالمزود، تحقق من الإعدادات' : 'Connection failed'))
                      : (isAr ? 'لم يتم فحص الاتصال بعد' : 'Not verified yet')}
                  </span>
                </div>
              </div>

              {/* Ollama Live Health Widget */}
              {currentProvider.providerId === 'ollama' && (
                <div className="p-4 bg-[#1e1e1e] border border-[#24a148]/40 space-y-3.5 rounded-xs">
                  <div className="flex items-center justify-between border-b border-[#393939] pb-2">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[#f4f4f4]">
                      <Activity className="w-4 h-4 text-[#42be65]" />
                      <span>{isAr ? 'حالة محرك أولاما المحلي (Ollama Engine Health)' : 'Ollama Engine Health'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#8d8d8d]">
                      {isAr ? 'مراقبة حية كل 10 ثوان' : 'Live 10s Poll'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex items-center justify-center w-3 h-3">
                        {ollamaPing.status === 'online' ? (
                          <>
                            <span className="absolute inline-flex h-full w-full rounded-full bg-[#42be65] opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#42be65]" />
                          </>
                        ) : ollamaPing.status === 'pinging' ? (
                          <span className="w-3 h-3 border-2 border-[#78a9ff] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#da1e28]" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[#f4f4f4]">
                            {isAr ? 'حالة منفذ الاتصال (Ollama Port 11434 Status):' : 'Ollama Port 11434 Status:'}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 text-xs font-mono font-bold border rounded-xs flex items-center gap-1.5 ${
                              ollamaPing.status === 'online'
                                ? 'bg-[#24a148]/20 text-[#42be65] border-[#24a148]/40'
                                : ollamaPing.status === 'pinging'
                                ? 'bg-[#0f62fe]/20 text-[#78a9ff] border-[#0f62fe]/40'
                                : 'bg-[#da1e28]/20 text-[#ff8389] border-[#da1e28]/40'
                            }`}
                          >
                            {ollamaPing.status === 'online' && `ONLINE (${ollamaPing.latencyMs || 0}ms)`}
                            {ollamaPing.status === 'offline' && 'OFFLINE'}
                            {ollamaPing.status === 'pinging' && 'PINGING...'}
                            {ollamaPing.status === 'idle' && 'UNCHECKED'}
                          </span>
                        </div>

                        <p className="text-[11px] font-mono text-[#8d8d8d] mt-1 break-all">
                          {ollamaPing.details || (isAr ? 'فحص خادم أولاما المحلي واستعلام النماذج عبر /api/tags' : 'Monitoring localhost port 11434 and /api/tags')}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handlePingOllamaBaseUrl}
                      disabled={ollamaPing.status === 'pinging'}
                      className="h-8 px-3 text-xs font-mono bg-[#262626] hover:bg-[#393939] text-[#78a9ff] border border-[#0f62fe]/40 flex items-center gap-1.5 transition-all rounded-xs disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${ollamaPing.status === 'pinging' ? 'animate-spin' : ''}`} />
                      {isAr ? 'إعادة الفحص' : 'Re-ping'}
                    </button>
                  </div>

                  {/* Installed Models List */}
                  {ollamaPing.status === 'online' && ollamaPing.installedModels && ollamaPing.installedModels.length > 0 && (
                    <div className="pt-2 border-t border-[#393939] flex items-center gap-2 flex-wrap text-xs font-mono">
                      <span className="text-[#8d8d8d]">{isAr ? 'النماذج المكتشفة في جهازك:' : 'Installed Models via /api/tags:'}</span>
                      {ollamaPing.installedModels.map((m, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-[#262626] text-[#78a9ff] border border-[#393939] text-[10px] rounded-xs">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Provider Config Inputs */}
              <div className="space-y-4 bg-[#1e1e1e] p-4 border border-[#2d2d2d] rounded-xs">
                {currentProvider.providerId !== 'gemini' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#f4f4f4] mb-1.5">
                      {isAr ? 'عنوان نقطة النهاية (Base Endpoint URL):' : 'Base Endpoint URL:'}
                    </label>
                    <input
                      type="text"
                      value={currentProvider.endpointUrl || ''}
                      onChange={(e) => updateProviderConfig(currentProvider.providerId, { endpointUrl: e.target.value })}
                      placeholder="e.g. http://localhost:11434 or https://openrouter.ai/api/v1"
                      className="w-full h-9 px-3 text-xs bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-xs"
                    />
                    
                    {(currentProvider.isLocalOnly || currentProvider.providerId === 'custom_openai') && (
                      <div className="mt-3 p-3 bg-[#0f62fe]/10 border border-[#0f62fe]/30 rounded-xs text-[#f4f4f4] text-xs">
                         <div className="font-semibold text-[#78a9ff] mb-1.5 flex items-center gap-1.5">
                           <Globe className="w-3.5 h-3.5" />
                           {isAr ? 'إرشادات الربط: إنشاء نفق (Tunnel) للأجهزة المحلية' : 'Connection Guide: Tunneling Local Devices'}
                         </div>
                         <p className="text-[#c6c6c6] mb-2 leading-relaxed">
                           {isAr 
                             ? 'لأن هذا التطبيق يعمل في السحابة، لا يمكنه الوصول إلى localhost على جهازك مباشرة. يجب تشغيل ngrok في جهازك لفتح بوابة اتصال:'
                             : 'Since this app is cloud-hosted, it cannot directly reach your machine\'s localhost. You must run ngrok locally to bridge the connection:'}
                         </p>
                         <div className="bg-[#161616] p-2 rounded-xs border border-[#393939] font-mono text-[10px] text-[#8d8d8d] leading-relaxed">
                            <span className="text-purple-400"># 1. Authenticate ngrok (run once)</span><br/>
                            ngrok config add-authtoken &lt;YOUR_TOKEN&gt;<br/><br/>
                            
                            <span className="text-purple-400"># 2. Start the tunnel on Ollama/vLLM port</span><br/>
                            ngrok http 11434<br/><br/>
                            
                            <span className="text-purple-400"># 3. {isAr ? 'انسخ رابط https الناتج والصقه في الحقل أعلاه.' : 'Copy the generated https URL and paste it in the field above.'}</span>
                         </div>
                      </div>
                    )}
                  </div>
                )}

                {!currentProvider.isLocalOnly && currentProvider.providerId !== 'gemini' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#f4f4f4]">
                        {isAr ? 'مفتاح الـ API الخاص بهذا المزود (API Key):' : 'Provider API Key:'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowKeys(p => ({ ...p, [currentProvider.providerId]: !p[currentProvider.providerId] }))}
                        className="text-[11px] text-[#78a9ff] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        {showKeys[currentProvider.providerId] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showKeys[currentProvider.providerId] ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                      </button>
                    </div>
                    <input
                      type={showKeys[currentProvider.providerId] ? 'text' : 'password'}
                      value={currentProvider.apiKey || ''}
                      onChange={(e) => updateProviderConfig(currentProvider.providerId, { apiKey: e.target.value })}
                      placeholder="sk-or-v1-... or your API token"
                      className="w-full h-9 px-3 text-xs bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-xs"
                    />
                  </div>
                )}
              </div>

              {/* Models List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#f4f4f4] uppercase tracking-wider">
                  {isAr ? 'النماذج المتوفرة تحت هذا المزود' : 'Available Models'}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {providerModels.map((model) => {
                    const isSelected = aiSettings.activeModel === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() => {
                          setActiveAIModel(model.id);
                          toast.success(
                            isAr ? 'تم تحديد النموذج النشط' : 'Model Activated',
                            model.name
                          );
                        }}
                        className={`p-4 border cursor-pointer transition-all rounded-xs ${
                          isSelected
                            ? 'border-[#0f62fe] bg-[#0f62fe]/10 shadow-xs ring-1 ring-[#0f62fe]'
                            : 'border-[#2d2d2d] bg-[#1e1e1e] hover:border-[#525252]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-xs text-[#f4f4f4]">{model.name}</div>
                            <div className="text-[11px] text-[#8d8d8d] mt-1 leading-relaxed">
                              {isAr ? model.descriptionAr : model.description}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="w-3 h-3 rounded-full bg-[#0f62fe] shrink-0 mt-0.5" />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-[#2d2d2d]">
                          {model.isLocal && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/30 rounded-xs">
                              🔒 Local
                            </span>
                          )}
                          {model.parameterSize && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono bg-[#262626] text-[#c6c6c6] border border-[#393939] rounded-xs">
                              {model.parameterSize}
                            </span>
                          )}
                          {model.capabilities.map((cap, ci) => (
                            <span key={ci} className="px-1.5 py-0.2 text-[10px] font-mono bg-[#161616] text-[#78a9ff] border border-[#393939] rounded-xs">
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI SANDBOX (منطقة التجربة السريعة) */}
      {activeTab === 'sandbox' && (
        <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-6 shadow-sm">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#2d2d2d] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#f4f4f4] flex items-center gap-2">
                <Play className="w-5 h-5 text-[#ff832b]" />
                {isAr ? 'منطقة التجربة السريعة للنماذج (AI Model Sandbox)' : 'AI Model Interactive Playground'}
              </h2>
              <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
                {isAr
                  ? 'إرسال استعلام تجريبي واختبار جودة استجابة أي نموذج (محلي عبر Ollama أو سحابي) ومعاينة زمن الاستجابة والتوكنات المستهلكة.'
                  : 'Test prompt responses across any connected AI model (Ollama local, Gemini, DeepSeek, OpenRouter) and inspect latency & token costs.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8d8d8d]">{isAr ? 'النموذج المحدد:' : 'Target Model:'}</span>
              <select
                value={sandboxModelId}
                onChange={(e) => setSandboxModelId(e.target.value)}
                className="h-9 px-3 text-xs bg-[#262626] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-xs cursor-pointer"
              >
                {availableAIModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.isLocal ? 'Local' : 'Cloud'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Preset Prompt Chips */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#8d8d8d]">
              {isAr ? 'قوالب أسئلة واختبارات سريعة (Preset Templates):' : 'Quick Test Prompts:'}
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  labelAr: '📊 استعلام SQL معقد',
                  labelEn: '📊 Complex SQL Query',
                  prompt: 'اكتب استعلام SQL لحساب إجمالي المبيعات والمتوسط لكل فئة مع إظهار أعلى 3 قطاعات ترتيباً.',
                },
                {
                  labelAr: '🔍 تحليل جودة البيانات',
                  labelEn: '🔍 Data Profiling Audit',
                  prompt: 'كيف يمكن الكشف عن القيم الشاذة (Anomalies) باستخدام تقنيات Z-Score و IQR في قواعد البيانات؟',
                },
                {
                  labelAr: '🧠 مقارنة نماذج الذكاء الاصطناعي',
                  labelEn: '🧠 Model Architecture',
                  prompt: 'اشرح باختصار الفرق بين نماذج التفكير الاستدلالي (Reasoning Models) والنماذج السريعة (Flash Models).',
                },
                {
                  labelAr: '💻 كود Python للتحليل',
                  labelEn: '💻 Python Moving Average',
                  prompt: 'Write a clean Python function using pandas to calculate a 7-day rolling moving average on sales data.',
                },
              ].map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => setSandboxPrompt(chip.prompt)}
                  className="px-3 py-1.5 text-xs bg-[#262626] hover:bg-[#393939] text-[#c6c6c6] hover:text-white border border-[#393939] transition-all rounded-xs cursor-pointer"
                >
                  {isAr ? chip.labelAr : chip.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Controls Accordion / Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[#1e1e1e] p-4 border border-[#2d2d2d] rounded-xs">
            
            {/* System Instruction */}
            <div className="md:col-span-6 space-y-1">
              <label className="text-xs font-semibold text-[#f4f4f4]">
                {isAr ? 'تعليمات النظام (System Instruction):' : 'System Instruction:'}
              </label>
              <input
                type="text"
                value={sandboxSystemInstruction}
                onChange={(e) => setSandboxSystemInstruction(e.target.value)}
                placeholder="Set background persona or rules..."
                className="w-full h-9 px-3 text-xs bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-xs"
              />
            </div>

            {/* Temperature Slider */}
            <div className="md:col-span-3 space-y-1">
              <div className="flex justify-between text-xs font-semibold text-[#f4f4f4]">
                <span>{isAr ? 'حرارة الإبداع (Temperature):' : 'Temperature:'}</span>
                <span className="font-mono text-[#78a9ff]">{sandboxTemperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sandboxTemperature}
                onChange={(e) => setSandboxTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#0f62fe] cursor-pointer mt-2"
              />
            </div>

            {/* Max Tokens Slider */}
            <div className="md:col-span-3 space-y-1">
              <div className="flex justify-between text-xs font-semibold text-[#f4f4f4]">
                <span>{isAr ? 'حد التوكنات (Max Tokens):' : 'Max Tokens:'}</span>
                <span className="font-mono text-[#78a9ff]">{sandboxMaxTokens}</span>
              </div>
              <input
                type="range"
                min="128"
                max="4096"
                step="128"
                value={sandboxMaxTokens}
                onChange={(e) => setSandboxMaxTokens(parseInt(e.target.value))}
                className="w-full accent-[#0f62fe] cursor-pointer mt-2"
              />
            </div>

          </div>

          {/* Prompt Textarea */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-semibold text-[#f4f4f4]">
              <span>{isAr ? 'نص الاستعلام / السؤال (Prompt Input):' : 'Prompt Input:'}</span>
              <span className="text-[10px] text-[#8d8d8d] font-mono">{sandboxPrompt.length} chars</span>
            </div>
            <textarea
              rows={4}
              value={sandboxPrompt}
              onChange={(e) => setSandboxPrompt(e.target.value)}
              placeholder={isAr ? 'أدخل استعلامك هنا لاختبار استجابة النموذج...' : 'Enter your prompt here to test model response...'}
              className="w-full p-3 text-xs bg-[#1e1e1e] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono leading-relaxed rounded-xs"
            />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setSandboxPrompt('');
                setSandboxResponse(null);
              }}
              className="h-9 px-3.5 text-xs font-medium bg-[#262626] hover:bg-[#393939] text-[#c6c6c6] hover:text-white border border-[#393939] flex items-center gap-1.5 transition-all rounded-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح المدخلات' : 'Clear Form'}</span>
            </button>

            <button
              onClick={handleRunSandbox}
              disabled={sandboxIsRunning}
              className="h-10 px-6 text-xs font-bold bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center justify-center gap-2 transition-all rounded-xs shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {sandboxIsRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري معالجة الاستعلام...' : 'Running Query...'}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isAr ? 'تشغيل الاستعلام التجريبي (Run Test)' : 'Execute Sandbox Test'}</span>
                </>
              )}
            </button>
          </div>

          {/* Execution Result Box */}
          {sandboxResponse && (
            <div className="mt-6 border border-[#2d2d2d] bg-[#1e1e1e] p-5 space-y-4 rounded-xs animate-in fade-in duration-200">
              
              {/* Stats Metrics Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2d2d2d] pb-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#f4f4f4]">{sandboxResponse.modelUsed}</span>
                  {sandboxResponse.isLocal ? (
                    <span className="px-2 py-0.5 bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 text-[10px] font-bold rounded-xs">
                      🔒 100% Local (Free)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#0f62fe]/20 text-[#78a9ff] border border-[#0f62fe]/40 text-[10px] font-bold rounded-xs">
                      ☁️ Cloud Model
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-[#c6c6c6] flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#78a9ff]" />
                    <span>{sandboxResponse.durationMs}ms</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-[#be95ff]" />
                    <span>{sandboxResponse.totalTokens} Tokens</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-[#42be65]" />
                    <span className="font-bold text-[#42be65]">
                      {sandboxResponse.isLocal ? '$0.0000 (Free)' : `$${sandboxResponse.estimatedCostUsd.toFixed(6)} USD`}
                    </span>
                  </span>
                </div>
              </div>

              {/* Response Text Display */}
              {sandboxResponse.error ? (
                <div className="p-4 bg-[#da1e28]/10 border border-[#da1e28]/30 text-[#ff8389] text-xs font-mono rounded-xs">
                  <div className="font-bold mb-1">{isAr ? 'تعذر الحصول على استجابة:' : 'Execution Error:'}</div>
                  <div>{sandboxResponse.error}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
                    <span>{isAr ? 'استجابة النموذج (Model Response Output):' : 'Output Text:'}</span>
                    <button
                      onClick={() => copyCmd(sandboxResponse.text, 'res-text')}
                      className="px-2.5 py-1 bg-[#262626] hover:bg-[#393939] text-white text-[10px] flex items-center gap-1 border border-[#393939] rounded-xs cursor-pointer"
                    >
                      {copiedCmd === 'res-text' ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                      {copiedCmd === 'res-text' ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ الاستجابة' : 'Copy Text')}
                    </button>
                  </div>

                  <pre className="p-4 bg-[#161616] border border-[#2d2d2d] text-xs text-[#f4f4f4] font-mono leading-relaxed whitespace-pre-wrap break-words rounded-xs max-h-96 overflow-y-auto">
                    {sandboxResponse.text}
                  </pre>
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* TAB 3: TOKEN CONSUMPTION & COST MONITORING */}
      {activeTab === 'tokens' && (
        <div className="space-y-6">
          
          {/* Top 4 KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Total Tokens */}
            <div className="bg-[#161616] p-5 border border-[#2d2d2d] space-y-2 rounded-xs shadow-sm">
              <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
                <span>{isAr ? 'إجمالي التوكنات المستهلكة' : 'Total Tokens Consumed'}</span>
                <Layers className="w-4 h-4 text-[#78a9ff]" />
              </div>
              <div className="text-xl font-mono font-bold text-[#f4f4f4]">
                {totalTokensConsumed.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#8d8d8d] font-mono">
                {isAr ? 'خلال الجلسة الحالية والعمليات' : 'Current session & API usage'}
              </div>
            </div>

            {/* Card 2: Total Cost */}
            <div className="bg-[#161616] p-5 border border-[#2d2d2d] space-y-2 rounded-xs shadow-sm">
              <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
                <span>{isAr ? 'التكلفة السحابية المباشرة' : 'Direct Cloud Cost'}</span>
                <DollarSign className="w-4 h-4 text-[#24a148]" />
              </div>
              <div className="text-xl font-mono font-bold text-[#42be65]">
                ${totalCostUsd.toFixed(4)} <span className="text-xs font-normal text-[#8d8d8d]">USD</span>
              </div>
              <div className="text-[11px] text-[#8d8d8d] font-mono">
                ≈ {totalCostSar.toFixed(2)} SAR
              </div>
            </div>

            {/* Card 3: Local Savings */}
            <div className="bg-[#161616] p-5 border border-[#2d2d2d] space-y-2 rounded-xs shadow-sm">
              <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
                <span>{isAr ? 'التوفير المالي من Ollama' : 'Local Ollama Cost Savings'}</span>
                <Shield className="w-4 h-4 text-[#42be65]" />
              </div>
              <div className="text-xl font-mono font-bold text-[#f4f4f4]">
                ${estimatedSavingsUsd.toFixed(3)} <span className="text-xs font-normal text-[#42be65]">Saved</span>
              </div>
              <div className="text-[11px] text-[#8d8d8d] font-mono">
                {localQueriesCount} {isAr ? 'استعلام محلي مجاني 100%' : 'queries executed 100% free'}
              </div>
            </div>

            {/* Card 4: Total Queries */}
            <div className="bg-[#161616] p-5 border border-[#2d2d2d] space-y-2 rounded-xs shadow-sm">
              <div className="flex items-center justify-between text-xs text-[#8d8d8d]">
                <span>{isAr ? 'إجمالي الاستعلامات المنجزة' : 'Total Queries Processed'}</span>
                <Activity className="w-4 h-4 text-[#be95ff]" />
              </div>
              <div className="text-xl font-mono font-bold text-[#f4f4f4]">
                {usageHistory.length} <span className="text-xs font-normal text-[#8d8d8d]">Queries</span>
              </div>
              <div className="text-[11px] text-[#8d8d8d] font-mono">
                {localQueriesCount} Local / {usageHistory.length - localQueriesCount} Cloud
              </div>
            </div>

          </div>

          {/* Usage Breakdown by Provider */}
          <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-5 rounded-xs shadow-sm">
            <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-3">
              <h2 className="text-sm font-bold text-[#f4f4f4] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#78a9ff]" />
                {isAr ? 'توزيع الاستهلاك والتكاليف حسب المزود (Consumption Breakdown)' : 'Consumption & Cost Breakdown by Provider'}
              </h2>
              <button
                onClick={() => {
                  setUsageHistory([]);
                  toast.info(isAr ? 'تم إعادة تعيين السجل' : 'Stats Reset');
                }}
                className="h-8 px-3 text-xs bg-[#262626] hover:bg-[#393939] text-[#c6c6c6] border border-[#393939] transition-all rounded-xs cursor-pointer"
              >
                {isAr ? 'إعادة تعيين السجل' : 'Reset Counters'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(providerSummaries).map((prov) => {
                const percentage = totalTokensConsumed > 0 ? (prov.totalTokens / totalTokensConsumed) * 100 : 0;
                return (
                  <div key={prov.providerId} className="p-4 bg-[#1e1e1e] border border-[#2d2d2d] space-y-3 rounded-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#f4f4f4]">{prov.name}</span>
                      {prov.isLocal ? (
                        <span className="px-2 py-0.5 bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 text-[10px] font-mono font-bold rounded-xs">
                          Free / Local
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-[#42be65]">
                          ${prov.costUsd.toFixed(4)}
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#161616] h-2 rounded-xs overflow-hidden border border-[#393939]">
                      <div
                        className={`h-full ${prov.isLocal ? 'bg-[#42be65]' : 'bg-[#0f62fe]'}`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] font-mono text-[#8d8d8d]">
                      <span>{prov.totalTokens.toLocaleString()} Tokens ({percentage.toFixed(1)}%)</span>
                      <span>{prov.queriesCount} {isAr ? 'طلب' : 'calls'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Monthly Cost Estimator */}
          <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-5 rounded-xs shadow-sm">
            <div className="border-b border-[#2d2d2d] pb-3">
              <h2 className="text-sm font-bold text-[#f4f4f4] flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#ff832b]" />
                {isAr ? 'حاسبة تقدير التكاليف الشهرية (Monthly Budget Simulator)' : 'Monthly Cost Budget Simulator'}
              </h2>
              <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
                {isAr
                  ? 'محاكاة تقديرية للتكاليف الشهرية بناءً على حجم الاستعلامات اليومية ومتوسط التوكنات المقدر لكل استعلام.'
                  : 'Estimate monthly expenditure based on projected daily query volume & average prompt size.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              
              {/* Sliders */}
              <div className="space-y-4 bg-[#1e1e1e] p-4 border border-[#2d2d2d] rounded-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-[#f4f4f4]">
                    <span>{isAr ? 'عدد الاستعلامات اليومية المقدرة:' : 'Estimated Daily Queries:'}</span>
                    <span className="font-mono text-[#78a9ff]">{simDailyQueries}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="2000"
                    step="10"
                    value={simDailyQueries}
                    onChange={(e) => setSimDailyQueries(parseInt(e.target.value))}
                    className="w-full accent-[#0f62fe] cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-[#f4f4f4]">
                    <span>{isAr ? 'متوسط التوكنات لكل استعلام:' : 'Avg Tokens per Query:'}</span>
                    <span className="font-mono text-[#78a9ff]">{simAvgTokensPerQuery}</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="250"
                    value={simAvgTokensPerQuery}
                    onChange={(e) => setSimAvgTokensPerQuery(parseInt(e.target.value))}
                    className="w-full accent-[#0f62fe] cursor-pointer"
                  />
                </div>
              </div>

              {/* Monthly Estimates Comparison Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#8d8d8d] uppercase">
                  {isAr ? 'التقدير المالي الشهري لكل نموذج (Monthly USD Estimate):' : 'Monthly Estimated Expenditure:'}
                </div>

                {(() => {
                  const monthlyTokens = simDailyQueries * simAvgTokensPerQuery * 30; // 30 days
                  const geminiFlashCost = (monthlyTokens / 1000000) * 0.15;
                  const geminiProCost = (monthlyTokens / 1000000) * 2.50;
                  const deepseekCost = (monthlyTokens / 1000000) * 0.85;

                  return (
                    <div className="space-y-2 font-mono text-xs">
                      
                      {/* Ollama Local */}
                      <div className="p-3 bg-[#1e1e1e] border border-[#24a148]/50 flex justify-between items-center rounded-xs">
                        <div>
                          <div className="font-bold text-[#42be65]">🔒 Ollama Local (Qwen / DeepSeek-R1)</div>
                          <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'استضافة محلية 100%' : '100% On-Premise'}</div>
                        </div>
                        <div className="text-sm font-bold text-[#42be65]">$0.00 / mo</div>
                      </div>

                      {/* Gemini 3.8 Flash */}
                      <div className="p-3 bg-[#1e1e1e] border border-[#2d2d2d] flex justify-between items-center rounded-xs">
                        <div>
                          <div className="font-bold text-[#f4f4f4]">⚡ Gemini 3.8 Flash</div>
                          <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'عالي السرعة واقتصادي' : 'High Speed & Efficiency'}</div>
                        </div>
                        <div className="text-sm font-bold text-[#f4f4f4]">${geminiFlashCost.toFixed(2)} / mo</div>
                      </div>

                      {/* DeepSeek R1 */}
                      <div className="p-3 bg-[#1e1e1e] border border-[#2d2d2d] flex justify-between items-center rounded-xs">
                        <div>
                          <div className="font-bold text-[#f4f4f4]">🧠 DeepSeek-R1</div>
                          <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'نموذج استدلال عميق' : 'Deep Reasoning'}</div>
                        </div>
                        <div className="text-sm font-bold text-[#f4f4f4]">${deepseekCost.toFixed(2)} / mo</div>
                      </div>

                      {/* Gemini Pro */}
                      <div className="p-3 bg-[#1e1e1e] border border-[#2d2d2d] flex justify-between items-center rounded-xs">
                        <div>
                          <div className="font-bold text-[#f4f4f4]">👑 Gemini 3.1 Pro</div>
                          <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'النموذج المتقدم الرائد' : 'Flagship Architecture'}</div>
                        </div>
                        <div className="text-sm font-bold text-[#ff832b]">${geminiProCost.toFixed(2)} / mo</div>
                      </div>

                    </div>
                  );
                })()}
              </div>

            </div>
          </div>

        </div>
      )}

      {/* TAB 4: DATA PRIVACY & ZERO-EGRESS GUARDRAILS */}
      {activeTab === 'privacy' && (
        <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-6 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-[#f4f4f4] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#42be65]" />
              {isAr ? 'حماية خصوصية بيانات المؤسسة (Enterprise Zero-Egress Guardrails)' : 'Enterprise Data Privacy & Zero-Egress Guardrails'}
            </h2>
            <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
              {isAr
                ? 'حدد قواعد تصدير البيانات والمخططات عند استخدام أدوات الذكاء الاصطناعي التوليدي والـ NL2SQL.'
                : 'Configure how schema metadata and data queries interact with local vs external AI models.'}
            </p>
          </div>

          <div className="space-y-3">
            {/* 1. Strict Local */}
            <div
              onClick={() => {
                setAIPrivacyMode('strict_local');
                toast.success(
                  isAr ? 'تم تفعيل وضع الخصوصية الصارم' : 'Strict Local Mode Enabled',
                  isAr ? 'يتم توجيه جميع العمليات حصرياً إلى Ollama المحلي بدون اتصال خارجي.' : 'All AI calls restricted to local Ollama.'
                );
              }}
              className={`p-4 border cursor-pointer transition-all rounded-xs ${
                aiSettings.privacyMode === 'strict_local'
                  ? 'border-[#42be65] bg-[#42be65]/10 ring-1 ring-[#42be65]'
                  : 'border-[#2d2d2d] bg-[#1e1e1e] hover:border-[#525252]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#42be65]" />
                  <span className="font-bold text-xs text-[#f4f4f4]">
                    {isAr ? '🔒 وضع الخصوصية المحلي الصارم (Local-Only Zero-Egress)' : '🔒 Strict Local-Only Mode (Zero-Egress)'}
                  </span>
                </div>
                {aiSettings.privacyMode === 'strict_local' && (
                  <span className="text-[10px] bg-[#42be65] text-black font-bold px-2 py-0.5 rounded-xs">
                    {isAr ? 'مفعل حالياً' : 'Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#c6c6c6] mt-2 leading-relaxed">
                {isAr
                  ? 'تُرسل كافة الاستعلامات حصرياً إلى Ollama المحلي أو خوادم vLLM الخاصة. لن يتم إرسال أي بيانات أو مخططات إلى الإنترنت مطلقاً.'
                  : 'All queries and schema data execute purely on your local machine via Ollama or private server. No cloud egress.'}
              </p>
            </div>

            {/* 2. Hybrid */}
            <div
              onClick={() => {
                setAIPrivacyMode('hybrid');
                toast.info(
                  isAr ? 'تم تفعيل الوضع الهجين الذكي' : 'Smart Hybrid Mode Enabled',
                  isAr ? 'استخدام النماذج السحابية مع حجب السجلات الحساسة.' : 'Cloud models allowed with data masking.'
                );
              }}
              className={`p-4 border cursor-pointer transition-all rounded-xs ${
                aiSettings.privacyMode === 'hybrid'
                  ? 'border-[#0f62fe] bg-[#0f62fe]/10 ring-1 ring-[#0f62fe]'
                  : 'border-[#2d2d2d] bg-[#1e1e1e] hover:border-[#525252]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#78a9ff]" />
                  <span className="font-bold text-xs text-[#f4f4f4]">
                    {isAr ? '⚡ هجين ذكي مع حجب البيانات (Smart Hybrid with Masking)' : '⚡ Smart Hybrid with Schema Masking'}
                  </span>
                </div>
                {aiSettings.privacyMode === 'hybrid' && (
                  <span className="text-[10px] bg-[#0f62fe] text-white font-bold px-2 py-0.5 rounded-xs">
                    {isAr ? 'مفعل حالياً' : 'Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#c6c6c6] mt-2 leading-relaxed">
                {isAr
                  ? 'يتيح الاستفادة من سرعة النماذج السحابية مع حجب سجلات البيانات الفعلية وإرسال البنية الهيكلية للإحصائيات فقط.'
                  : 'Allows fast cloud reasoning for complex SQL synthesis while keeping raw data records private.'}
              </p>
            </div>

            {/* 3. Cloud Allowed */}
            <div
              onClick={() => {
                setAIPrivacyMode('cloud_allowed');
                toast.info(
                  isAr ? 'تم تفعيل الوضع السحابي عالي الأداء' : 'High Performance Cloud Mode Enabled'
                );
              }}
              className={`p-4 border cursor-pointer transition-all rounded-xs ${
                aiSettings.privacyMode === 'cloud_allowed'
                  ? 'border-[#ff832b] bg-[#ff832b]/10 ring-1 ring-[#ff832b]'
                  : 'border-[#2d2d2d] bg-[#1e1e1e] hover:border-[#525252]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff832b]" />
                  <span className="font-bold text-xs text-[#f4f4f4]">
                    {isAr ? '☁️ سرعة وأداء سحابي غير مقيد (Cloud High Performance)' : '☁️ Full Cloud Performance'}
                  </span>
                </div>
                {aiSettings.privacyMode === 'cloud_allowed' && (
                  <span className="text-[10px] bg-[#ff832b] text-black font-bold px-2 py-0.5 rounded-xs">
                    {isAr ? 'مفعل حالياً' : 'Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#c6c6c6] mt-2 leading-relaxed">
                {isAr
                  ? 'الوصول الكامل إلى أقوى النماذج العالمية مثل Gemini 3.8 و DeepSeek-R1 و Qwen Max لأعلى سرعة ودقة.'
                  : 'Unrestricted access to state-of-the-art enterprise cloud models for maximum analysis speed.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INTEGRATION DOCS */}
      {activeTab === 'docs' && (
        <div className="bg-[#161616] p-6 border border-[#2d2d2d] space-y-6 shadow-sm">
          <div className="border-b border-[#2d2d2d] pb-4">
            <h2 className="text-base font-bold text-[#f4f4f4] flex items-center gap-2">
              <FileCode className="w-5 h-5 text-[#78a9ff]" />
              {isAr ? 'دليل ربط وإعدادات مزودات الذكاء الاصطناعي التوليدي' : 'AI Multi-Provider API Integration Guide'}
            </h2>
            <p className="text-xs text-[#8d8d8d] mt-1 leading-relaxed">
              {isAr 
                ? 'دليل المطورين وخطة التكامل مع محركات vLLM و Ollama ومسارات البروكسي العكسي لتفادي CORS.'
                : 'Developer guide for custom LLM configuration, proxy routes, and CORS resolution.'}
            </p>
          </div>

          <div className="space-y-5 text-xs text-[#c6c6c6] leading-relaxed">
            
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#f4f4f4] border-b border-[#262626] pb-1">
                {isAr ? '1. نظرة عامة على البنية الهيكلية' : '1. Architecture Overview'}
              </h3>
              <pre className="bg-[#1e1e1e] p-4 border border-[#2d2d2d] text-[#78a9ff] font-mono rounded-xs overflow-x-auto text-[11px] leading-relaxed">
{`   [واجهة المتصفح الأمامية (React)] 
              │
              │ (طلب توجيه آلي عبر البروكسي عند فحص خادم محلي)
              ▼
   [خادم التطبيق الخلفي (Express - المنفذ 3000)]
      ├── [Google Gemini] ─── (API سحابي)
      ├── [Ollama Proxy]  ─── (مستضاف محلياً :11434)
      └── [Custom OpenAI] ─── (خوادم vLLM / LM Studio ومنافذ خاصة)`}
              </pre>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#f4f4f4] border-b border-[#262626] pb-1">
                {isAr ? '2. تفادي قيود المتصفحات وقيود CORS' : '2. Resolving Browser CORS Restrictions'}
              </h3>
              <p>
                {isAr
                  ? 'تمنع متصفحات الويب الحديثة إرسال طلبات HTTP مباشرة من المتصفح إلى الروابط المحلية localhost نتيجة لقيود CORS. تقوم المنصة بتغليف الطلبات آلياً عبر خادم البروكسي الخلفي بالرابط /api/proxy/ollama لتجاوز هذه العقبة بسلاسة.'
                  : 'Browsers restrict cross-origin requests to local ports. The application routes traffic via the backend Express proxy endpoint /api/proxy/ollama to maintain seamless execution.'}
              </p>
            </div>

          </div>
        </div>
      )}

      {/* TAB 6: EXTERNAL AI JSON-RPC 2.0 GATEWAY */}
      {activeTab === 'jsonrpc' && (
        <div className="space-y-4">
          <JsonRpcGatewayPanel />
        </div>
      )}

    </div>
  );
};
