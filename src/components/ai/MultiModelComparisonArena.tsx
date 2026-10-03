import React, { useState } from 'react';
import {
  Cpu,
  Zap,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Trophy,
  BarChart3,
  Sliders,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Eye,
  Terminal,
  ThumbsUp,
  Award,
  Clock,
  Gauge,
  Activity,
  TrendingUp,
  PieChart as PieIcon,
  Server,
  Lock,
  Pin,
  Star,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { checkAiAccess, aiAccessBlockMessage, fetchServerAiProviders } from '../../utils/aiAccessGuard';
import {
  AIModelDefinition,
  ModelBenchmarkResult,
  MultiModelComparisonSession,
} from '../../types';

interface MultiModelComparisonArenaProps {
  initialQuestion?: string;
  onApplySql?: (sql: string) => void;
}

export const MultiModelComparisonArena: React.FC<MultiModelComparisonArenaProps> = ({
  initialQuestion = '',
  onApplySql,
}) => {
  const {
    language,
    activeDataset,
    availableAIModels,
    aiSettings,
    testProviderConnection,
    toast,
    setActiveTab: navigateToTab,
  } = useApp();

  const isAr = language === 'ar';
  const [question, setQuestion] = useState(initialQuestion || (isAr ? 'احسب إجمالي المبيعات ومتوسط الإيراد مصنفة حسب الفئة والمنطقة لأعلى 10 سجلات' : 'Calculate total revenue and average sales grouped by category and region top 10'));
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([
    'gemini-3.8-flash',
    'ollama/qwen2.5-coder:7b',
    'deepseek/deepseek-r1',
    'qwen/qwen-2.5-coder-32b',
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [session, setSession] = useState<MultiModelComparisonSession | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'winner'>>({});
  const [activeTab, setActiveTab] = useState<'grid' | 'table' | 'charts' | 'latency'>('grid');
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>(['ollama/qwen2.5-coder:7b']);
  const [isPingingProviders, setIsPingingProviders] = useState(false);
  const [providerLatencies, setProviderLatencies] = useState<Record<string, number>>({
    ollama: 38,
    gemini: 220,
    deepseek: 840,
    qwen: 410,
    openrouter: 290,
  });

  // Default Session Results for Immediate Visual Exploration
  const defaultSessionResults: ModelBenchmarkResult[] = [
    {
      modelId: 'ollama/qwen2.5-coder:7b',
      modelName: 'Qwen 2.5 Coder 7B (Ollama)',
      providerId: 'ollama',
      providerName: 'Ollama (Local Engine)',
      isLocal: true,
      isPrivacyFirst: true,
      status: 'success',
      durationMs: providerLatencies.ollama || 38,
      sql: `SELECT category, region, SUM(sales) AS total_sales, AVG(revenue) AS avg_revenue\nFROM sales_records\nGROUP BY category, region\nORDER BY total_sales DESC\nLIMIT 10;`,
      explanation: 'Executed locally with Zero-Egress isolation on Ollama daemon.',
      score: { accuracy: 96, safety: 100, efficiency: 98, overallScore: 97 },
      insights: ['🔒 Zero-Egress Data Protection', '⚡ Ultra-Low Latency (38ms)', 'Passed 9-Layer Safety Verification'],
    },
    {
      modelId: 'gemini-3.8-flash',
      modelName: 'Google Gemini 3.8 Flash',
      providerId: 'gemini',
      providerName: 'Google AI Cloud',
      isLocal: false,
      isPrivacyFirst: false,
      status: 'success',
      durationMs: providerLatencies.gemini || 220,
      sql: `SELECT category, region, SUM(sales) AS total_sales, AVG(revenue) AS avg_revenue\nFROM sales_records\nGROUP BY category, region\nORDER BY total_sales DESC\nLIMIT 10;`,
      explanation: 'High-speed cloud processing with multi-modal schema awareness.',
      score: { accuracy: 98, safety: 95, efficiency: 92, overallScore: 95 },
      insights: ['☁️ High Speed Cloud', 'Complex SQL Schema Synthesis', 'Grounded in Grounding Engine'],
    },
    {
      modelId: 'deepseek/deepseek-r1',
      modelName: 'DeepSeek-R1 (Reasoning)',
      providerId: 'deepseek',
      providerName: 'DeepSeek Cloud',
      isLocal: false,
      isPrivacyFirst: false,
      status: 'success',
      durationMs: providerLatencies.deepseek || 840,
      sql: `SELECT category, region, SUM(sales) AS total_sales, AVG(revenue) AS avg_revenue\nFROM sales_records\nGROUP BY category, region\nORDER BY total_sales DESC\nLIMIT 10;`,
      explanation: 'Deep step-by-step chain-of-thought analysis for multi-stage queries.',
      score: { accuracy: 99, safety: 90, efficiency: 86, overallScore: 92 },
      insights: ['🧠 Chain-of-Thought (CoT)', 'Strict ANSI SQL Conformance'],
    },
    {
      modelId: 'qwen/qwen-2.5-coder-32b',
      modelName: 'Qwen 2.5 Coder 32B',
      providerId: 'qwen',
      providerName: 'Alibaba Cloud AI',
      isLocal: false,
      isPrivacyFirst: false,
      status: 'success',
      durationMs: providerLatencies.qwen || 410,
      sql: `SELECT category, region, SUM(sales) AS total_sales, AVG(revenue) AS avg_revenue\nFROM sales_records\nGROUP BY category, region\nORDER BY total_sales DESC\nLIMIT 10;`,
      explanation: 'Specialized SQL coding model with high benchmark score.',
      score: { accuracy: 97, safety: 92, efficiency: 90, overallScore: 93 },
      insights: ['📊 Specialized SQL LLM', 'High Syntax Precision'],
    },
  ];

  const activeResults = session && session.results.length > 0 ? session.results : defaultSessionResults;
  const activeWinnerId = session?.winnerModelId || 'ollama/qwen2.5-coder:7b';

  const togglePinModel = (modelId: string) => {
    setPinnedModelIds(prev => {
      const isPinned = prev.includes(modelId);
      const next = isPinned ? prev.filter(id => id !== modelId) : [...prev, modelId];
      toast.success(
        isPinned ? (isAr ? 'تم إزالة التثبيت' : 'Unpinned Model') : (isAr ? 'تم تثبيت النموذج في الأعلى' : 'Pinned Model to Top'),
        isPinned ? undefined : (isAr ? 'سيظهر هذا النموذج في مقدمة البطاقات لسهولة الوصول.' : 'This model will now stick to the top of the grid.')
      );
      return next;
    });
  };

  const sortedActiveResults = React.useMemo(() => {
    return [...activeResults].sort((a, b) => {
      const aPinned = pinnedModelIds.includes(a.modelId);
      const bPinned = pinnedModelIds.includes(b.modelId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [activeResults, pinnedModelIds]);

  const handlePingAllProviders = async () => {
    setIsPingingProviders(true);
    const providers = ['ollama', 'gemini', 'deepseek', 'qwen', 'openrouter'] as const;
    const newLatencies: Record<string, number> = { ...providerLatencies };

    for (const pId of providers) {
      try {
        const res = await testProviderConnection(pId as any);
        if (res.latencyMs) {
          newLatencies[pId] = res.latencyMs;
        }
      } catch (err) {}
    }

    setProviderLatencies(newLatencies);
    setIsPingingProviders(false);
    toast.success(
      isAr ? 'تم تحديث أزمنة الاستجابة للمزودين' : 'Provider Latency Updated',
      isAr ? 'تم فحص أزمنة الاتصال المباشرة لجميع المحركات.' : 'Measured live ping latency across AI providers.'
    );
  };

  const toggleModelSelection = (id: string) => {
    if (selectedModelIds.includes(id)) {
      if (selectedModelIds.length <= 2) {
        toast.warning(
          isAr ? 'يجب اختيار نموذجين على الأقل' : 'Select at least 2 models',
          isAr ? 'المقارنة تتطلب نموذجين على الأقل لإجراء التقييم المتعدد.' : 'Comparison requires at least 2 models.'
        );
        return;
      }
      setSelectedModelIds(prev => prev.filter(mId => mId !== id));
    } else {
      if (selectedModelIds.length >= 6) {
        toast.warning(
          isAr ? 'الحد الأقصى 6 نماذج' : 'Max 6 models allowed',
          isAr ? 'يمكنك مقارنة حتى 6 نماذج في نفس الجولة.' : 'You can compare up to 6 models concurrently.'
        );
        return;
      }
      setSelectedModelIds(prev => [...prev, id]);
    }
  };

  const handleRunComparison = async () => {
    if (!question.trim()) {
      toast.warning(
        isAr ? 'يرجى إدخال السؤال' : 'Enter a query',
        isAr ? 'اكتب السؤال التحليلي الذي ترغب في مقارنة أداء النماذج عليه.' : 'Provide the analytical prompt to benchmark.'
      );
      return;
    }

    // الحرس: النماذج السحابية المختارة تحتاج مفاتيح — تحقق قبل إطلاق الطلبات المتوازية
    const serverProviders = await fetchServerAiProviders();
    const missingKeyModel = selectedModelIds
      .map(id => availableAIModels.find(m => m.id === id))
      .find(def => def && !checkAiAccess(def.provider, aiSettings.providers[def.provider], serverProviders).ok);
    if (missingKeyModel) {
      const { title, description } = aiAccessBlockMessage('no-key', isAr, missingKeyModel.providerName || missingKeyModel.provider);
      toast.warning(title, isAr ? `${description} (النموذج الناقص: ${missingKeyModel.name})` : `${description} (missing: ${missingKeyModel.name})`);
      navigateToTab('models');
      return;
    }

    setIsRunning(true);
    const toastId = toast.info(
      isAr ? 'جاري تشغيل حلبة المقارنة المتعددة...' : 'Running Multi-Model Benchmark Arena...',
      isAr ? `يتم إرسال السؤال إلى ${selectedModelIds.length} نماذج بالتوازي وفحص الأداء والـ SQL.` : `Querying ${selectedModelIds.length} models concurrently.`
    );

    try {
      const candidateModels = selectedModelIds.map(id => {
        const def = availableAIModels.find(m => m.id === id);
        const providerConfig = def ? aiSettings.providers[def.provider] : undefined;
        return {
          id,
          name: def?.name || id,
          provider: def?.provider || 'gemini',
          providerName: def?.providerName || 'AI',
          isLocal: def?.isLocal || false,
          isPrivacyFirst: def?.isPrivacyFirst || false,
          endpointUrl: providerConfig?.endpointUrl,
          apiKey: providerConfig?.apiKey,
        };
      });

      const res = await fetch('/api/nl2sql/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          datasetSchema: activeDataset,
          language,
          models: candidateModels,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : (isAr ? 'تعذر تشغيل مقارنة النماذج' : 'Failed to run model comparison');
        throw new Error(errMsg);
      }
      if (data && Array.isArray(data.results)) {
        const newSession: MultiModelComparisonSession = {
          id: `comp-${Date.now()}`,
          timestamp: new Date().toISOString(),
          question,
          datasetName: activeDataset.name,
          modelsTested: selectedModelIds,
          results: data.results,
          winnerModelId: data.winnerModelId,
        };
        setSession(newSession);
        toast.success(
          isAr ? 'اكتملت المقارنة بنجاح' : 'Multi-Model Benchmark Completed',
          isAr
            ? `النموذج الفائز بأعلى تقييم: ${availableAIModels.find(m => m.id === data.winnerModelId)?.name || data.winnerModelId}`
            : `Winner model: ${availableAIModels.find(m => m.id === data.winnerModelId)?.name || data.winnerModelId}`
        );
      }
    } catch (err: any) {
      toast.error(
        isAr ? 'خطأ في تشغيل المقارنة' : 'Comparison Error',
        err?.message || (isAr ? 'تعذر إكمال تقييم النماذج.' : 'Failed to benchmark models.')
      );
    } finally {
      setIsRunning(false);
    }
  };

  const copySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.info(isAr ? 'تم نسخ استعلام SQL' : 'SQL Copied to Clipboard');
  };

  const exportSql = (sql: string, modelId: string) => {
    if (!sql || !sql.trim()) {
      toast.error(isAr ? 'لا يوجد استعلام للتصدير' : 'No query to export');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeModel = modelId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `query_${safeModel}_${timestamp}.sql`;
    const headerComment = `-- =====================================================================
-- IBM Carbon Analytics Studio - Multi-Model Benchmark Generated Query
-- Model: ${modelId}
-- Prompt: ${question}
-- Dataset: ${activeDataset.name}
-- Generated At: ${new Date().toISOString()}
-- =====================================================================\n\n`;
    const blob = new Blob([`${headerComment}${sql.trim()}\n`], { type: 'application/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(isAr ? 'تم تصدير ملف SQL بنجاح' : 'SQL File Exported', filename);
  };

  const handleVoteWinner = (modelId: string) => {
    setUserVotes(prev => ({
      ...prev,
      [modelId]: 'winner',
    }));
    toast.success(
      isAr ? 'تم تسجيل تقييمك' : 'Vote Recorded',
      isAr ? 'تم تحديد هذا النموذج كإجابة مثالية ومفضلة لديك.' : 'Marked this model as your preferred winner.'
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Strategy Intro */}
      <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0f62fe]/20 text-[#78a9ff] flex items-center justify-center border border-[#0f62fe]/40 shrink-0">
            <Trophy className="w-5 h-5 text-[#ff832b]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--cds-text-01)]">
                {isAr ? 'حلبة مقارنة النماذج الذكية (Multi-Model Evaluation Arena)' : 'Multi-Model Benchmark & Evaluation Arena'}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/30">
                Ollama Privacy + Multi-LLM
              </span>
            </div>
            <p className="text-xs text-[var(--cds-text-02)] mt-0.5">
              {isAr
                ? 'قارن دقة استعلامات SQL، الأداء، الأمان (9-Layers)، وسرعة الاستجابة بين Ollama المحلي، Gemini، DeepSeek-R1، و Qwen جنباً إلى جنب.'
                : 'Benchmark SQL accuracy, 9-layer security conformance, latency, and syntax quality across local Ollama, Gemini, DeepSeek, and Qwen.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('grid')}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              activeTab === 'grid'
                ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isAr ? 'بطاقات جنباً إلى جنب' : 'Side-by-Side Cards'}</span>
          </button>

          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              activeTab === 'table'
                ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)]'
            }`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>{isAr ? 'جدول المقارنة الشامل' : 'Scorecard Matrix'}</span>
          </button>

          <button
            onClick={() => setActiveTab('charts')}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              activeTab === 'charts'
                ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#42be65]" />
            <span>{isAr ? 'رسوم بيانية للأداء (D3 / Recharts)' : 'Performance Metrics (D3/Recharts)'}</span>
          </button>

          <button
            onClick={() => setActiveTab('latency')}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              activeTab === 'latency'
                ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-[#ff832b]" />
            <span>{isAr ? 'راصد زمن الاستجابة (Latency Tracker)' : 'Model Latency Tracker'}</span>
          </button>
        </div>
      </div>

      {/* Model Selection Multi-Chip Bar */}
      <div className="bg-[var(--cds-layer-02)] p-4 border border-[var(--cds-border-subtle)] space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--cds-text-01)] uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-[#78a9ff]" />
            {isAr ? 'اختر النماذج للمقارنة المباشرة (2 إلى 6 نماذج):' : 'Select Models to Benchmark (2 to 6):'}
          </label>
          <span className="text-xs text-[var(--cds-text-03)]">
            {isAr ? `تم تحديد ${selectedModelIds.length} نماذج` : `${selectedModelIds.length} models active`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {availableAIModels.map((m) => {
            const isSelected = selectedModelIds.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleModelSelection(m.id)}
                className={`p-2 text-start text-xs border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#0f62fe] bg-[#0f62fe]/15 text-[var(--cds-text-01)] shadow-xs'
                    : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] text-[var(--cds-text-03)] hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-02)]'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-medium text-xs truncate max-w-[120px]">{m.name}</div>
                  {isSelected ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0f62fe] shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-[var(--cds-border-strong)] shrink-0" />
                  )}
                </div>

                <div className="flex items-center gap-1 mt-2 text-[10px]">
                  {m.isLocal ? (
                    <span className="px-1 py-0.2 bg-[#42be65]/20 text-[#42be65] font-mono">
                      🔒 Local
                    </span>
                  ) : (
                    <span className="px-1 py-0.2 bg-[var(--cds-layer-03)] text-[#78a9ff]">
                      ☁️ Cloud
                    </span>
                  )}
                  {m.parameterSize && (
                    <span className="text-[var(--cds-text-03)] font-mono">{m.parameterSize}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Query Input Box & Execution Controls */}
      <div className="bg-[var(--cds-layer-01)] p-4 border border-[var(--cds-border-subtle)] space-y-3">
        <label className="block text-xs font-semibold text-[var(--cds-text-01)] uppercase tracking-wider">
          {isAr ? 'السؤال التحليلي لاختبار النماذج (Prompt under Test):' : 'Analytical Query Prompt under Test:'}
        </label>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={isAr ? 'اكتب سؤالك باللغة الطبيعية...' : 'Type natural language analytical query...'}
            className="flex-1 px-4 py-2.5 text-xs bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] focus:outline-hidden"
          />

          <button
            onClick={handleRunComparison}
            disabled={isRunning}
            className="px-6 py-2.5 text-xs font-semibold bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {isRunning
              ? (isAr ? 'جاري تقييم النماذج بالتوازي...' : 'Benchmarking Models...')
              : (isAr ? 'بدء المقارنة والتسابق' : 'Run Benchmark Battle')}
          </button>
        </div>

        {/* Quick Sample Presets */}
        <div className="flex items-center gap-2 pt-1 text-xs text-[var(--cds-text-03)] overflow-x-auto">
          <span className="shrink-0">{isAr ? 'أمثلة سريعة:' : 'Quick Presets:'}</span>
          {[
            isAr ? 'أعلى 5 فئات مبيعاً ومتوسط الأرباح' : 'Top 5 categories by sales and profit',
            isAr ? 'معدل النمو الشهري وتوزيع المبيعات الإقليمية' : 'Monthly growth & regional sales breakdown',
            isAr ? 'حساب نسبة تكلفة الشحن إلى إجمالي الإيراد' : 'Calculate shipping cost ratio to revenue',
          ].map((sample, idx) => (
            <button
              key={idx}
              onClick={() => setQuestion(sample)}
              className="px-2 py-0.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] text-[11px] whitespace-nowrap transition-colors"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* Benchmark Results Display */}
      {sortedActiveResults.length > 0 && (
        <div className="space-y-6">
          
          {/* Winner Banner */}
          {session && (
            <div className="p-4 bg-linear-to-r from-[#0f62fe]/20 via-[#262626] to-[var(--cds-layer-01)] border border-[#0f62fe]/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#f1c21b]/20 text-[#f1c21b] flex items-center justify-center border border-[#f1c21b]/40">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[var(--cds-text-03)] uppercase tracking-wider">
                    {isAr ? 'النموذج الفائز في الجولة الحالية' : 'Benchmark Winner Model'}
                  </div>
                  <div className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                    <span>{availableAIModels.find(m => m.id === session.winnerModelId)?.name || session.winnerModelId}</span>
                    <span className="px-2 py-0.2 text-[10px] bg-[#42be65]/20 text-[#42be65] font-normal border border-[#42be65]/30">
                      🏆 Top Composite Score
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-end">
                <div className="text-xs text-[var(--cds-text-03)]">{isAr ? 'زمن التنفيذ الإجمالي' : 'Total Execution Latency'}</div>
                <div className="text-sm font-mono font-bold text-[#78a9ff]">{session.results[0]?.durationMs || 0} ms</div>
              </div>
            </div>
          )}

          {/* View 1: Responsive Grid Cards View with Pin Model Support */}
          {activeTab === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedActiveResults.map((res) => {
                const isWinner = res.modelId === activeWinnerId;
                const isUserVoted = userVotes[res.modelId] === 'winner';
                const isPinned = pinnedModelIds.includes(res.modelId);

                return (
                  <div
                    key={res.modelId}
                    className={`bg-[var(--cds-layer-01)] border transition-all flex flex-col justify-between ${
                      isPinned
                        ? 'border-[#f1c21b] ring-1 ring-[#f1c21b]/40 bg-[#f1c21b]/5'
                        : isWinner
                        ? 'border-[#0f62fe] shadow-md ring-1 ring-[#0f62fe]/50'
                        : 'border-[var(--cds-border-subtle)]'
                    }`}
                  >
                    {/* Model Header */}
                    <div className="p-4 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-xs text-[var(--cds-text-01)] truncate">{res.modelName}</h3>
                          {isPinned && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-[#f1c21b]/20 text-[#f1c21b] border border-[#f1c21b]/40 font-semibold flex items-center gap-1">
                              <Pin className="w-2.5 h-2.5 fill-current" /> Pinned
                            </span>
                          )}
                          {res.isLocal && (
                            <span className="px-1.5 py-0.2 text-[10px] bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/30">
                              🔒 Local
                            </span>
                          )}
                          {isWinner && (
                            <span className="px-1.5 py-0.2 text-[10px] bg-[#f1c21b]/20 text-[#f1c21b] border border-[#f1c21b]/40 font-semibold flex items-center gap-1">
                              <Trophy className="w-3 h-3" /> Winner
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--cds-text-03)]">
                          {res.providerName} • {res.durationMs}ms
                        </div>
                      </div>

                      {/* Right Header Actions: Pin Toggle + Overall Score */}
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => togglePinModel(res.modelId)}
                          title={isPinned ? (isAr ? 'إلغاء تثبيت النموذج' : 'Unpin Model') : (isAr ? 'تثبيت النموذج في الأعلى' : 'Pin Model to Top')}
                          className={`p-1.5 border transition-colors ${
                            isPinned
                              ? 'bg-[#f1c21b]/20 text-[#f1c21b] border-[#f1c21b]/50'
                              : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-03)] border-[var(--cds-border-subtle)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
                          }`}
                        >
                          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current rotate-45' : ''}`} />
                        </button>

                        <div className="text-end">
                          <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'التقييم الإجمالي' : 'Overall Score'}</div>
                          <div className={`text-base font-mono font-bold ${
                            res.score.overallScore >= 90 ? 'text-[#42be65]' : res.score.overallScore >= 75 ? 'text-[#78a9ff]' : 'text-[#ff832b]'
                          }`}>
                            {res.score.overallScore}/100
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Bar Breakdown */}
                    <div className="p-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'الدقة المنطقية' : 'Accuracy'}</div>
                        <div className="font-mono font-bold text-[#42be65] mt-0.5">{res.score.accuracy}%</div>
                      </div>
                      <div className="p-2 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'أمان 9-طبقات' : '9-Layer Safety'}</div>
                        <div className="font-mono font-bold text-[#78a9ff] mt-0.5">{res.score.safety}%</div>
                      </div>
                      <div className="p-2 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'كفاءة الاستعلام' : 'Efficiency'}</div>
                        <div className="font-mono font-bold text-[#ff832b] mt-0.5">{res.score.efficiency}%</div>
                      </div>
                    </div>

                    {/* SQL Code Block */}
                    <div className="p-4 space-y-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--cds-text-02)] uppercase tracking-wider">
                          Generated SQL Query:
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => exportSql(res.sql || '', res.modelId)}
                            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#42be65]/40 text-[#42be65] text-[11px] font-mono flex items-center gap-1 transition-colors"
                            title={isAr ? 'تصدير الاستعلام كملف .sql' : 'Export query as .sql file'}
                          >
                            <Download className="w-3 h-3 text-[#42be65]" />
                            <span>{isAr ? 'تصدير .sql' : 'Export .sql'}</span>
                          </button>
                          <button
                            onClick={() => copySql(res.sql || '', res.modelId)}
                            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] text-[11px] flex items-center gap-1 transition-colors"
                          >
                            {copiedId === res.modelId ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                            {copiedId === res.modelId ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <pre className="p-3 bg-[#0a0a0a] border border-[var(--cds-border-subtle)] text-xs font-mono text-[#42be65] overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {res.sql || '-- No SQL generated'}
                        </pre>
                      </div>

                      {/* Explanation */}
                      {res.explanation && (
                        <div className="text-xs text-[var(--cds-text-02)] bg-[var(--cds-layer-02)] p-2.5 border border-[var(--cds-border-subtle)]">
                          <span className="font-semibold text-[var(--cds-text-01)] block mb-0.5">
                            {isAr ? 'تفسير منطق الاستعلام:' : 'Logic Explanation:'}
                          </span>
                          {res.explanation}
                        </div>
                      )}

                      {/* Insights Badges */}
                      {res.insights && res.insights.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {res.insights.map((ins, ii) => (
                            <span key={ii} className="px-2 py-0.5 text-[10px] bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)]">
                              {ins}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="p-3 bg-[var(--cds-layer-02)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleVoteWinner(res.modelId)}
                        className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                          isUserVoted
                            ? 'bg-[#42be65] text-black font-semibold'
                            : 'bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {isUserVoted
                          ? (isAr ? 'اختيارك المفضل' : 'Your Choice')
                          : (isAr ? 'تصويت كأفضل إجابة' : 'Vote as Best')}
                      </button>

                      {onApplySql && res.sql && (
                        <button
                          onClick={() => {
                            onApplySql(res.sql || '');
                            toast.success(
                              isAr ? 'تم نقل الـ SQL للمحرر' : 'SQL Transferred to Sandbox',
                              isAr ? `تم تحميل كود استعلام ${res.modelName} في بيئة التنفيذ.` : `Loaded SQL from ${res.modelName}.`
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center gap-1.5 transition-colors"
                        >
                          <span>{isAr ? 'تطبيق في المحرر' : 'Apply in Editor'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* View 2: Comprehensive Scorecard Matrix */}
          {activeTab === 'table' && (
            <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'النموذج الذكي' : 'AI Model'}</th>
                    <th className="p-3 text-start">{isAr ? 'مزود الخدمة' : 'Provider'}</th>
                    <th className="p-3 text-start">{isAr ? 'نوع الاستضافة' : 'Hosting'}</th>
                    <th className="p-3 text-start">{isAr ? 'السرعة (Latency)' : 'Latency'}</th>
                    <th className="p-3 text-start">{isAr ? 'الدقة' : 'Accuracy'}</th>
                    <th className="p-3 text-start">{isAr ? 'الأمان' : 'Safety'}</th>
                    <th className="p-3 text-start">{isAr ? 'الكفاءة' : 'Efficiency'}</th>
                    <th className="p-3 text-start">{isAr ? 'التقييم الإجمالي' : 'Overall Score'}</th>
                    <th className="p-3 text-start">{isAr ? 'الإجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                  {sortedActiveResults.map((res) => {
                    const isWinner = res.modelId === activeWinnerId;
                    const isPinned = pinnedModelIds.includes(res.modelId);

                    return (
                      <tr key={res.modelId} className={`hover:bg-[var(--cds-layer-02)] ${isPinned ? 'bg-[#f1c21b]/5 font-medium' : isWinner ? 'bg-[#0f62fe]/5 font-medium' : ''}`}>
                        <td className="p-3 flex items-center gap-2">
                          <button
                            onClick={() => togglePinModel(res.modelId)}
                            title={isPinned ? (isAr ? 'إلغاء التثبيت' : 'Unpin') : (isAr ? 'تثبيت' : 'Pin')}
                            className={`p-1 border transition-colors ${
                              isPinned ? 'bg-[#f1c21b]/20 text-[#f1c21b] border-[#f1c21b]/40' : 'text-[var(--cds-text-03)] border-[var(--cds-border-subtle)] hover:text-[var(--cds-text-01)]'
                            }`}
                          >
                            <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
                          </button>
                          {isWinner && <Trophy className="w-3.5 h-3.5 text-[#f1c21b]" />}
                          <span className="text-[var(--cds-text-01)] font-semibold">{res.modelName}</span>
                        </td>
                        <td className="p-3 text-[var(--cds-text-02)]">{res.providerName}</td>
                        <td className="p-3">
                          {res.isLocal ? (
                            <span className="px-2 py-0.5 text-[10px] bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/30">
                              🔒 Local Zero-Egress
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] bg-[var(--cds-layer-03)] text-[#78a9ff]">
                              ☁️ Cloud Managed
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[var(--cds-text-02)]">{res.durationMs} ms</td>
                        <td className="p-3 font-mono text-[#42be65] font-bold">{res.score.accuracy}%</td>
                        <td className="p-3 font-mono text-[#78a9ff] font-bold">{res.score.safety}%</td>
                        <td className="p-3 font-mono text-[#ff832b] font-bold">{res.score.efficiency}%</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 font-mono font-bold ${
                            res.score.overallScore >= 90 ? 'bg-[#42be65]/20 text-[#42be65]' : 'bg-[#78a9ff]/20 text-[#78a9ff]'
                          }`}>
                            {res.score.overallScore}/100
                          </span>
                        </td>
                        <td className="p-3">
                          {onApplySql && res.sql && (
                            <button
                              onClick={() => {
                                onApplySql(res.sql || '');
                                toast.success(
                                  isAr ? 'تم نقل الـ SQL للمحرر' : 'Applied to Editor',
                                  res.modelName
                                );
                              }}
                              className="px-2 py-1 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[11px] transition-colors"
                            >
                              {isAr ? 'تطبيق SQL' : 'Apply SQL'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* View 3: D3 / Recharts Side-by-Side Performance Metrics */}
          {activeTab === 'charts' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Header Info */}
              <div className="bg-[var(--cds-layer-01)] p-4 border border-[var(--cds-border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#42be65]" />
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--cds-text-01)]">
                      {isAr ? 'مقارنة مقاييس الأداء التنافسية (Multi-Model D3/Recharts Visualizer)' : 'Multi-Model Performance Metrics Visualizer'}
                    </h3>
                    <p className="text-xs text-[var(--cds-text-03)]">
                      {isAr
                        ? 'تحليل مرئي شامل لدقة استعلامات SQL، درجات درع الأمان التساعي، كفاءة الاستعلام، والتقييم المركّب.'
                        : 'Side-by-side visualization of SQL accuracy, 9-layer security scores, query efficiency, and composite quality index.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] bg-[#42be65]/20 text-[#42be65] font-mono border border-[#42be65]/40">
                    Live D3/Recharts Engine
                  </span>
                </div>
              </div>

              {/* Main Grouped Bar Chart */}
              <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cds-text-02)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#78a9ff]" />
                  {isAr ? 'مقارنة النواحي الأربعة: الدقة، الأمان، الكفاءة، والنتيجة الإجمالية' : 'Side-by-Side Scores: Accuracy, 9-Layer Safety, Efficiency, & Overall Quality'}
                </h4>

                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeResults.map(r => ({
                        name: r.modelName.replace(/\(.*\)/, '').replace('Google ', '').replace('Qwen ', '').trim(),
                        fullModelName: r.modelName,
                        Accuracy: r.score.accuracy,
                        Safety: r.score.safety,
                        Efficiency: r.score.efficiency,
                        Overall: r.score.overallScore,
                      }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey="name" stroke="#8d8d8d" tick={{ fill: '#c6c6c6', fontSize: 11 }} />
                      <YAxis stroke="#8d8d8d" domain={[0, 100]} tick={{ fill: '#c6c6c6', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#161616', borderColor: '#393939', color: '#f4f4f4', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Bar dataKey="Accuracy" name={isAr ? 'الدقة المنطقية %' : 'Accuracy %'} fill="#42be65" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Safety" name={isAr ? 'أمان 9-طبقات %' : '9-Layer Safety %'} fill="#78a9ff" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Efficiency" name={isAr ? 'كفاءة الاستعلام %' : 'Efficiency %'} fill="#ff832b" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Overall" name={isAr ? 'التقييم الشامل %' : 'Overall Index %'} fill="#be95ff" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grid with Radar Chart & Token Throughput */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Multidimensional Radar Chart */}
                <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cds-text-02)] flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-[#be95ff]" />
                    {isAr ? 'مخطط الرادار المتعدد الأبعاد للمهارات (Multidimensional Capability Radar)' : 'Multidimensional Capability Radar'}
                  </h4>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        data={[
                          {
                            subject: isAr ? 'دقة الصياغة' : 'Syntax Accuracy',
                            ...Object.fromEntries(activeResults.map(r => [r.modelName, r.score.accuracy]))
                          },
                          {
                            subject: isAr ? 'حماية 9-طبقات' : '9-Layer Safety',
                            ...Object.fromEntries(activeResults.map(r => [r.modelName, r.score.safety]))
                          },
                          {
                            subject: isAr ? 'كفاءة التنفيذ' : 'Efficiency',
                            ...Object.fromEntries(activeResults.map(r => [r.modelName, r.score.efficiency]))
                          },
                          {
                            subject: isAr ? 'السرعة (مقلوب ms)' : 'Speed Index',
                            ...Object.fromEntries(activeResults.map(r => [r.modelName, Math.min(100, Math.round(100000 / (r.durationMs || 100)))]))
                          },
                          {
                            subject: isAr ? 'التقييم الشامل' : 'Overall Quality',
                            ...Object.fromEntries(activeResults.map(r => [r.modelName, r.score.overallScore]))
                          },
                        ]}
                      >
                        <PolarGrid stroke="#393939" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#c6c6c6', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#525252" />
                        {activeResults.map((r, idx) => {
                          const colors = ['#42be65', '#0f62fe', '#ff832b', '#be95ff', '#33b1ff', '#f1c21b'];
                          const color = colors[idx % colors.length];
                          return (
                            <Radar
                              key={r.modelId}
                              name={r.modelName}
                              dataKey={r.modelName}
                              stroke={color}
                              fill={color}
                              fillOpacity={0.25}
                            />
                          );
                        })}
                        <Tooltip contentStyle={{ backgroundColor: '#161616', borderColor: '#393939', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Token Throughput & Token Counts */}
                <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cds-text-02)] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#33b1ff]" />
                    {isAr ? 'عدد التوكينات والسرعة النسبية (Tokens Produced & Tokens/sec)' : 'Token Count & Output Throughput (Tokens/sec)'}
                  </h4>

                  <div className="h-64 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={activeResults.map(r => {
                          const estimatedTokens = Math.round((r.sql?.length || 100) / 4) + 60;
                          const tps = Math.round(estimatedTokens / ((r.durationMs || 100) / 1000));
                          return {
                            name: r.modelName.replace(/\(.*\)/, '').trim(),
                            Tokens: estimatedTokens,
                            TPS: tps,
                          };
                        })}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="name" stroke="#8d8d8d" tick={{ fill: '#c6c6c6', fontSize: 10 }} />
                        <YAxis stroke="#8d8d8d" tick={{ fill: '#c6c6c6', fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#161616', borderColor: '#393939', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="Tokens" name={isAr ? 'عدد التوكينات' : 'Generated Tokens'} fill="#33b1ff" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="TPS" name={isAr ? 'معدل التوكين/ثانية (TPS)' : 'Tokens / Sec (TPS)'} fill="#42be65" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* View 4: Dedicated Model Latency Tracker Dashboard */}
          {activeTab === 'latency' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Header Banner & Live Ping Control */}
              <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#ff832b]/20 text-[#ff832b] flex items-center justify-center border border-[#ff832b]/40 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--cds-text-01)]">
                      {isAr ? 'راصد زمن الاستجابة والسرعة (Model Latency Tracker Dashboard)' : 'Model Latency & Speed Tracker Dashboard'}
                    </h3>
                    <p className="text-xs text-[var(--cds-text-03)] mt-0.5">
                      {isAr
                        ? 'مراقبة ومقارنة زمن استجابة الاستعلامات (بالمللي ثانية ms) بين خادم Ollama المحلي والشبكات السحابية (Gemini, DeepSeek, Qwen).'
                        : 'Monitor and benchmark response time (in milliseconds) across local Ollama vs cloud AI providers.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handlePingAllProviders}
                  disabled={isPingingProviders}
                  className="px-4 py-2 text-xs font-semibold bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[#78a9ff] border border-[#0f62fe]/50 flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${isPingingProviders ? 'animate-spin' : ''}`} />
                  {isPingingProviders
                    ? (isAr ? 'جاري فحص السرعة...' : 'Pinging Providers...')
                    : (isAr ? 'قياس أزمنة المزودين الحية' : 'Ping All Providers Live')}
                </button>
              </div>

              {/* Latency Classification Tiers */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-[var(--cds-layer-01)] border border-[#42be65]/40 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#42be65] animate-pulse" />
                  <div>
                    <div className="text-[11px] text-[var(--cds-text-03)] uppercase">{isAr ? 'استجابة محلي فائقة' : 'Local Low-Latency'}</div>
                    <div className="text-sm font-bold text-[#42be65] font-mono">&lt; 50 ms</div>
                    <div className="text-[10px] text-[var(--cds-text-02)]">🔒 Ollama Zero-Egress</div>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--cds-layer-01)] border border-[#0f62fe]/40 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#0f62fe]" />
                  <div>
                    <div className="text-[11px] text-[var(--cds-text-03)] uppercase">{isAr ? 'سحابي سريع' : 'Fast Cloud'}</div>
                    <div className="text-sm font-bold text-[#78a9ff] font-mono">150 - 300 ms</div>
                    <div className="text-[10px] text-[var(--cds-text-02)]">☁️ Gemini Flash</div>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--cds-layer-01)] border border-[#be95ff]/40 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#be95ff]" />
                  <div>
                    <div className="text-[11px] text-[var(--cds-text-03)] uppercase">{isAr ? 'نماذج متخصصة' : 'Specialized SQL LLM'}</div>
                    <div className="text-sm font-bold text-[#be95ff] font-mono">300 - 600 ms</div>
                    <div className="text-[10px] text-[var(--cds-text-02)]">📊 Qwen Coder 32B</div>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--cds-layer-01)] border border-[#ff832b]/40 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#ff832b]" />
                  <div>
                    <div className="text-[11px] text-[var(--cds-text-03)] uppercase">{isAr ? 'استدلال عميق' : 'Deep CoT Reasoning'}</div>
                    <div className="text-sm font-bold text-[#ff832b] font-mono">600 - 1500 ms</div>
                    <div className="text-[10px] text-[var(--cds-text-02)]">🧠 DeepSeek-R1</div>
                  </div>
                </div>
              </div>

              {/* Main Latency Comparison Chart */}
              <div className="bg-[var(--cds-layer-01)] p-5 border border-[var(--cds-border-subtle)] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cds-text-02)] flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-[#ff832b]" />
                    {isAr ? 'مخطط مقارنة وقت الاستجابة بالمللي ثانية (Response Latency ms per Model)' : 'Response Latency Comparison (ms per Model)'}
                  </h4>
                  <span className="text-xs text-[var(--cds-text-03)] font-mono">Lower is Faster ⚡</span>
                </div>

                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={activeResults.map(r => ({
                        name: r.modelName,
                        latencyMs: r.durationMs,
                        isLocal: r.isLocal,
                        provider: r.providerName,
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis type="number" stroke="#8d8d8d" tick={{ fill: '#c6c6c6', fontSize: 11 }} unit=" ms" />
                      <YAxis dataKey="name" type="category" stroke="#8d8d8d" width={180} tick={{ fill: '#c6c6c6', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#161616', borderColor: '#393939', color: '#f4f4f4', fontSize: '12px' }}
                        formatter={(val: any) => [`${val} ms`, 'Response Time']}
                      />
                      <Bar dataKey="latencyMs" name="Latency (ms)" radius={[0, 4, 4, 0]}>
                        {activeResults.map((entry, index) => {
                          const val = entry.durationMs;
                          const fill = val < 50 ? '#42be65' : val < 300 ? '#0f62fe' : val < 600 ? '#be95ff' : '#ff832b';
                          return <Cell key={`cell-${index}`} fill={fill} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Individual Provider Speed Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {activeResults.map((r) => {
                  const isLocal = r.isLocal;
                  const speedMultiplier = (activeResults.find(x => x.durationMs > 500)?.durationMs || 800) / (r.durationMs || 1);

                  return (
                    <div
                      key={r.modelId}
                      className={`p-4 bg-[var(--cds-layer-01)] border flex flex-col justify-between ${
                        isLocal ? 'border-[#42be65]/50 bg-[#42be65]/5' : 'border-[var(--cds-border-subtle)]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--cds-text-01)] truncate max-w-[140px]">{r.modelName}</span>
                          {isLocal ? (
                            <span className="px-1.5 py-0.2 text-[9px] bg-[#42be65]/20 text-[#42be65] font-mono border border-[#42be65]/30 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Local
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 text-[9px] bg-[var(--cds-layer-03)] text-[#78a9ff] font-mono">
                              Cloud
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-mono font-bold ${
                            r.durationMs < 50 ? 'text-[#42be65]' : r.durationMs < 300 ? 'text-[#78a9ff]' : 'text-[#ff832b]'
                          }`}>
                            {r.durationMs}
                          </span>
                          <span className="text-xs text-[var(--cds-text-03)] font-mono">ms</span>
                        </div>

                        <div className="text-[11px] text-[var(--cds-text-02)]">
                          {isLocal
                            ? (isAr ? '⚡ 0ms تأخير شبكة خارجي' : '⚡ Zero network egress latency')
                            : (isAr ? `سرعة استجابة المزود ${r.providerName}` : `${r.providerName} API network trip`)}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[var(--cds-border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--cds-text-03)]">
                        <span>Relative Speed:</span>
                        <span className="text-[var(--cds-text-01)] font-bold">{speedMultiplier.toFixed(1)}x baseline</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary Insight Box */}
              <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-2">
                <h4 className="text-xs font-semibold text-[var(--cds-text-01)] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff832b]" />
                  {isAr ? 'تحليل مقارنة السرعة: Ollama المحلي مقابل المحركات السحابية:' : 'Speed Benchmark Summary: Local Ollama vs Cloud AI:'}
                </h4>
                <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
                  {isAr
                    ? 'يتميز محرك Ollama المحلي بعدم وجود أي تأخير ناتج عن الاتصال بالإنترنت أو تشفير SSL عبر الشبكة (Zero Network Hop Latency)، مما يجعله الخيار الأسرع للاستعلامات الفورية والأكثر أماناً لحماية خصوصية المؤسسة. في المقابل، تتيح النماذج السحابية مثل Gemini 3.7 و DeepSeek-R1 قدرات استدلال أعمق للطلبات المعقدة جداً.'
                    : 'Local Ollama engines bypass network handshakes, DNS resolution, and cloud API gateway queues, rendering instantaneous response times (<40ms) with zero egress. Cloud models (Gemini 3.7, DeepSeek-R1) offer extended reasoning depth for massive multi-table analytical tasks.'}
                </p>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
};
