import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Shield,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  ExternalLink,
  Key,
  Globe,
  Sliders,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AIProviderId, AIPrivacyMode, AIModelDefinition } from '../../types';

interface AIProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIProviderModal: React.FC<AIProviderModalProps> = ({ isOpen, onClose }) => {
  const {
    language,
    aiSettings,
    availableAIModels,
    setActiveAIProvider,
    setActiveAIModel,
    setAIPrivacyMode,
    updateProviderConfig,
    testProviderConnection,
    refreshOllamaModels,
    toast,
  } = useApp();

  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<AIProviderId | 'privacy'>('ollama');
  const [testingId, setTestingId] = useState<AIProviderId | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);

  // Live OpenRouter account balance (usage / remaining free quota)
  interface ORBalance {
    label?: string;
    isFreeTier: boolean;
    usageUsd: number;
    limitUsd: number | null;
    limitRemainingUsd: number | null;
    freeDailyRequests?: { used: number; limit: number; remaining: number } | null;
    expiresAt?: string | null;
  }
  const [orBalance, setOrBalance] = useState<ORBalance | null>(null);
  const [orBalanceError, setOrBalanceError] = useState<string | null>(null);
  const openrouterKey = (aiSettings.providers.openrouter.apiKey || '').trim();

  useEffect(() => {
    if (!isOpen || activeTab !== 'openrouter') return;
    let cancelled = false;
    setOrBalance(null);
    setOrBalanceError(null);
    fetch(`/api/ai/openrouter/balance?apiKey=${encodeURIComponent(openrouterKey)}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancelled) setOrBalance(j);
      })
      .catch((e) => { if (!cancelled) setOrBalanceError(e.message); });
    return () => { cancelled = true; };
    // Re-fetch whenever the stored key changes so the balance always matches the key
  }, [isOpen, activeTab, openrouterKey]);

  if (!isOpen) return null;

  const handleTest = async (providerId: AIProviderId) => {
    setTestingId(providerId);
    const result = await testProviderConnection(providerId);
    setTestingId(null);
    if (result.status === 'connected') {
      toast.success(
        isAr ? 'تم الاتصال بنجاح' : 'Connection Successful',
        isAr ? `تم التحقق من مزود ${providerId} بزمن استجابة ${result.latencyMs || 0}ms.` : `Connected to ${providerId} in ${result.latencyMs || 0}ms.`
      );
    } else {
      toast.error(
        isAr ? 'فشل الاتصال' : 'Connection Failed',
        result.message || (isAr ? 'يرجى التحقق من العنوان أو مفتاح الـ API.' : 'Check endpoint URL or API key.')
      );
    }
  };

  const handleRefreshOllama = async () => {
    setIsRefreshingOllama(true);
    const models = await refreshOllamaModels();
    setIsRefreshingOllama(false);
    if (models.length > 0) {
      toast.success(
        isAr ? 'تم العثور على نماذج محلية' : 'Local Models Discovered',
        isAr ? `تم الكشف عن ${models.length} نموذج في أولاما المحلي.` : `Found ${models.length} installed Ollama models.`
      );
    } else {
      toast.warning(
        isAr ? 'تعذر جلب النماذج' : 'Could Not Fetch Models',
        isAr ? 'تأكد من تشغيل أمر "ollama serve" على جهازك.' : 'Ensure "ollama serve" is running on your machine.'
      );
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
    toast.info(isAr ? 'تم النسخ للحافظة' : 'Copied to clipboard', text);
  };

  const currentProvider = aiSettings.providers[activeTab !== 'privacy' ? activeTab : 'ollama'];
  const providerModels = availableAIModels.filter(m => m.provider === (activeTab !== 'privacy' ? activeTab : 'ollama'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl rounded-none">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-none bg-[#0f62fe]/20 text-[#78a9ff] flex items-center justify-center border border-[#0f62fe]/40">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-[var(--cds-text-01)]">
                  {isAr ? 'مركز مزودي نماذج الذكاء الاصطناعي والخصوصية' : 'AI Models & Privacy Provider Hub'}
                </h2>
                <span className="px-2 py-0.5 text-xs bg-[#0f62fe]/20 text-[#78a9ff] border border-[#0f62fe]/30">
                  Multi-Provider V2
                </span>
              </div>
              <p className="text-xs text-[var(--cds-text-03)]">
                {isAr
                  ? 'إدارة محركات الذكاء الاصطناعي (Ollama المحلي، Qwen، DeepSeek، OpenRouter، Gemini) والتحكم في خصوصية البيانات'
                  : 'Manage AI engines (Local Ollama, Qwen, DeepSeek, OpenRouter, Gemini) and privacy zero-egress policies'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] transition-colors"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar Nav */}
          <div className="w-64 border-e border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] flex flex-col justify-between p-2 shrink-0">
            <div className="space-y-1">
              <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-[var(--cds-text-03)] uppercase">
                {isAr ? 'مزودو الخدمة المدعومون' : 'Supported Providers'}
              </div>

              {/* 1. Ollama */}
              <button
                onClick={() => setActiveTab('ollama')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'ollama'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#42be65]" />
                  <div>
                    <div className="font-medium">Ollama (Local)</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'خصوصية محلية 100%' : '100% Zero-Egress'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'ollama' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>

              {/* 2. Google Gemini */}
              <button
                onClick={() => setActiveTab('gemini')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'gemini'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#78a9ff]" />
                  <div>
                    <div className="font-medium">Google Gemini</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'مدمج وسحابي سريع' : 'Built-in Cloud'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'gemini' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>

              {/* 3. DeepSeek / Z.AI */}
              <button
                onClick={() => setActiveTab('deepseek')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'deepseek'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff832b]" />
                  <div>
                    <div className="font-medium">DeepSeek / Z.AI</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'R1 الاستدلال العميق' : 'R1 Reasoning & V3'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'deepseek' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>

              {/* 4. Qwen AI */}
              <button
                onClick={() => setActiveTab('qwen')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'qwen'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#be95ff]" />
                  <div>
                    <div className="font-medium">Qwen AI (Alibaba)</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'نماذج برمجة الـ SQL' : 'Coder 32B & Max'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'qwen' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>

              {/* 5. OpenRouter */}
              <button
                onClick={() => setActiveTab('openrouter')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'openrouter'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#33b1ff]" />
                  <div>
                    <div className="font-medium">OpenRouter</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'بوابة النماذج المتعددة' : 'Universal Gateway'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'openrouter' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>

              {/* 6. Custom OpenAI */}
              <button
                onClick={() => setActiveTab('custom_openai')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'custom_openai'
                    ? 'bg-[#0f62fe] text-white font-medium'
                    : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[var(--cds-text-02)]" />
                  <div>
                    <div className="font-medium">{isAr ? 'خادم خاص (vLLM / LM Studio)' : 'Custom OpenAI API'}</div>
                    <div className="text-[10px] opacity-80">{isAr ? 'خوادم الشركات الداخلية' : 'Self-Hosted / LocalAI'}</div>
                  </div>
                </div>
                {aiSettings.activeProvider === 'custom_openai' && (
                  <span className="w-2 h-2 rounded-full bg-[#42be65]" />
                )}
              </button>
            </div>

            {/* Privacy Policy Tab */}
            <div className="pt-2 border-t border-[var(--cds-border-subtle)]">
              <button
                onClick={() => setActiveTab('privacy')}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-start transition-colors ${
                  activeTab === 'privacy'
                    ? 'bg-[var(--cds-layer-02)] text-[#42be65] font-medium border border-[#42be65]/40'
                    : 'text-[var(--cds-text-03)] hover:bg-[var(--cds-layer-02)] hover:text-[var(--cds-text-01)]'
                }`}
              >
                <Lock className="w-4 h-4 text-[#42be65]" />
                <div>
                  <div className="font-medium">{isAr ? 'سياسة خصوصية البيانات' : 'Data Privacy & Egress'}</div>
                  <div className="text-[10px] opacity-70">{aiSettings.privacyMode}</div>
                </div>
              </button>
            </div>
          </div>

          {/* Main Configuration Panel */}
          <div className="flex-1 p-6 overflow-y-auto bg-[var(--cds-layer-01)]">
            {activeTab === 'privacy' ? (
              /* Privacy Mode Settings */
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--cds-text-01)] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#42be65]" />
                    {isAr ? 'درجات الأمان وحماية خصوصية بيانات المؤسسة' : 'Enterprise Data Privacy & Zero-Egress Guardrails'}
                  </h3>
                  <p className="text-xs text-[var(--cds-text-02)] mt-1">
                    {isAr
                      ? 'حدد كيف يتعامل النظام مع مخططات البيانات واستعلامات الـ SQL عند مخاطبة نماذج الذكاء الاصطناعي.'
                      : 'Define how schemas, profiling metrics, and query prompts are routed across local vs cloud models.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Mode 1: Strict Local */}
                  <div
                    onClick={() => setAIPrivacyMode('strict_local')}
                    className={`p-4 border cursor-pointer transition-all ${
                      aiSettings.privacyMode === 'strict_local'
                        ? 'border-[#42be65] bg-[#42be65]/10 shadow-xs'
                        : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:border-[var(--cds-border-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#42be65]" />
                        <span className="font-semibold text-xs text-[var(--cds-text-01)]">
                          {isAr ? '🔒 خصوصية محلية صارمة (Strict Local - Zero Egress)' : '🔒 Strict Local Privacy (Zero Data Egress)'}
                        </span>
                      </div>
                      {aiSettings.privacyMode === 'strict_local' && (
                        <span className="text-[11px] bg-[#42be65] text-black font-semibold px-2 py-0.5">
                          {isAr ? 'مفعل حالياً' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)] mt-2">
                      {isAr
                        ? 'تُرسل جميع الاستعلامات والمخططات حصرياً إلى محرك Ollama المحلي أو خوادم vLLM الداخلية. يُحظر تماماً خروج أي حرف خارج شبكتك الخاصة.'
                        : 'All NL2SQL and analytical operations execute strictly on your local machine via Ollama or on-premise vLLM. No external API calls are made.'}
                    </p>
                  </div>

                  {/* Mode 2: Hybrid */}
                  <div
                    onClick={() => setAIPrivacyMode('hybrid')}
                    className={`p-4 border cursor-pointer transition-all ${
                      aiSettings.privacyMode === 'hybrid'
                        ? 'border-[#0f62fe] bg-[#0f62fe]/10 shadow-xs'
                        : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:border-[var(--cds-border-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-[#78a9ff]" />
                        <span className="font-semibold text-xs text-[var(--cds-text-01)]">
                          {isAr ? '⚡ هجين ذكي مع إخفاء البيانات (Smart Hybrid)' : '⚡ Smart Hybrid with Schema Masking (Recommended)'}
                        </span>
                      </div>
                      {aiSettings.privacyMode === 'hybrid' && (
                        <span className="text-[11px] bg-[#0f62fe] text-white font-semibold px-2 py-0.5">
                          {isAr ? 'مفعل حالياً' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)] mt-2">
                      {isAr
                        ? 'إمكانية استخدام النماذج السحابية السريعة مع حجب بيانات الصفوف وإرسال المخطط الهيكلي الإحصائي فقط دون كشف السجلات الحقيقية.'
                        : 'Allows fast cloud reasoning for complex SQL synthesis while masking raw records and sending only structural metadata.'}
                    </p>
                  </div>

                  {/* Mode 3: Cloud Allowed */}
                  <div
                    onClick={() => setAIPrivacyMode('cloud_allowed')}
                    className={`p-4 border cursor-pointer transition-all ${
                      aiSettings.privacyMode === 'cloud_allowed'
                        ? 'border-[#ff832b] bg-[#ff832b]/10 shadow-xs'
                        : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:border-[var(--cds-border-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#ff832b]" />
                        <span className="font-semibold text-xs text-[var(--cds-text-01)]">
                          {isAr ? '☁️ سرعة وأداء سحابي غير مقيد (High-Performance Cloud)' : '☁️ High-Performance Cloud Model Access'}
                        </span>
                      </div>
                      {aiSettings.privacyMode === 'cloud_allowed' && (
                        <span className="text-[11px] bg-[#ff832b] text-black font-semibold px-2 py-0.5">
                          {isAr ? 'مفعل حالياً' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)] mt-2">
                      {isAr
                        ? 'الوصول الكامل لجميع النماذج السحابية (Gemini 3.7 Flash, Claude 3.7, DeepSeek-R1, Qwen Max) لتحقيق أعلى دقة وسرعة في استخراج الأفكار.'
                        : 'Full access to state-of-the-art enterprise cloud models for maximum throughput, reasoning depth, and speed.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Specific Provider Config */
              <div className="space-y-6">
                
                {/* Header of Provider */}
                <div className="flex items-start justify-between border-b border-[var(--cds-border-subtle)] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-[var(--cds-text-01)]">
                        {isAr ? currentProvider.nameAr : currentProvider.name}
                      </h3>
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-[var(--cds-layer-02)] text-[#78a9ff] border border-[var(--cds-border-subtle)]">
                        {isAr ? currentProvider.badgeAr : currentProvider.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)] mt-1 max-w-xl">
                      {isAr ? currentProvider.descriptionAr : currentProvider.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(currentProvider.providerId)}
                      disabled={testingId === currentProvider.providerId}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingId === currentProvider.providerId ? 'animate-spin' : ''}`} />
                      {testingId === currentProvider.providerId
                        ? (isAr ? 'جاري الفحص...' : 'Pinging...')
                        : (isAr ? 'فحص الاتصال' : 'Test Connection')}
                    </button>

                    {aiSettings.activeProvider !== currentProvider.providerId ? (
                      <button
                        onClick={() => {
                          setActiveAIProvider(currentProvider.providerId);
                          toast.success(
                            isAr ? 'تم تغيير المزود النشط' : 'Active Provider Changed',
                            isAr ? `المزود النشط الآن هو ${currentProvider.nameAr}` : `Active provider set to ${currentProvider.name}`
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-[#0f62fe] hover:bg-[#0353e9] text-white transition-colors"
                      >
                        {isAr ? 'تعيين كمزود نشط' : 'Set as Active Provider'}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 text-xs font-medium bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? 'المزود النشط حالياً' : 'Currently Active'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Connection Status Banner */}
                <div className={`p-3 text-xs flex items-center justify-between border ${
                  currentProvider.status === 'connected'
                    ? 'bg-[#42be65]/10 border-[#42be65]/30 text-[#42be65]'
                    : currentProvider.status === 'error'
                    ? 'bg-[#da1e28]/10 border-[#da1e28]/30 text-[#ff8389]'
                    : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                }`}>
                  <div className="flex items-center gap-2">
                    {currentProvider.status === 'connected' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : currentProvider.status === 'error' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    ) : (
                      <Server className="w-4 h-4 shrink-0 text-[var(--cds-text-03)]" />
                    )}
                    <span>
                      {currentProvider.status === 'connected'
                        ? (isAr ? `متصل وجاهز للاستخدام (${currentProvider.lastPingMs || 12}ms)` : `Connected and ready (${currentProvider.lastPingMs || 12}ms)`)
                        : currentProvider.status === 'error'
                        ? (currentProvider.errorMessage || (isAr ? 'تعذر الاتصال بالمزود' : 'Unable to connect to provider'))
                        : (isAr ? 'لم يتم فحص الاتصال بعد' : 'Not verified yet')}
                    </span>
                  </div>
                  {currentProvider.isLocalOnly && (
                    <span className="text-[10px] bg-[#42be65]/20 text-[#42be65] px-2 py-0.5 border border-[#42be65]/30">
                      {isAr ? '🔒 معالجة محلية' : '🔒 Local Only'}
                    </span>
                  )}
                </div>

                {/* Configuration Inputs */}
                <div className="space-y-4 bg-[var(--cds-layer-02)] p-4 border border-[var(--cds-border-subtle)]">
                  {/* Endpoint URL (for Ollama / OpenRouter / Custom) */}
                  {currentProvider.providerId !== 'gemini' && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--cds-text-02)] mb-1">
                        {isAr ? 'عنوان نقطة النهاية (Endpoint URL):' : 'Endpoint Base URL:'}
                      </label>
                      <input
                        type="text"
                        value={currentProvider.endpointUrl || ''}
                        onChange={(e) => updateProviderConfig(currentProvider.providerId, { endpointUrl: e.target.value })}
                        placeholder="e.g. http://localhost:11434 or https://api.deepseek.com/v1"
                        className="w-full px-3 py-2 text-xs bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] focus:outline-hidden font-mono"
                      />
                      <p className="text-[11px] text-[var(--cds-text-03)] mt-1">
                        {currentProvider.providerId === 'ollama'
                          ? (isAr ? 'العنوان الافتراضي لـ Ollama المحلي هو http://localhost:11434' : 'Default Ollama daemon runs on http://localhost:11434')
                          : (isAr ? 'عنوان واجهة الـ API المتوافقة مع بروتوكول REST / OpenAI' : 'OpenAI-compatible REST API endpoint base')}
                      </p>
                    </div>
                  )}

                  {/* API Key Input (if not local Ollama) */}
                  {!currentProvider.isLocalOnly && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--cds-text-02)] mb-1 flex items-center justify-between">
                        <span>{isAr ? 'مفتاح الـ API (API Key):' : 'API Key:'}</span>
                        <button
                          type="button"
                          onClick={() => setShowKey(prev => ({ ...prev, [currentProvider.providerId]: !prev[currentProvider.providerId] }))}
                          className="text-[11px] text-[#78a9ff] flex items-center gap-1 hover:underline"
                        >
                          {showKey[currentProvider.providerId] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {showKey[currentProvider.providerId] ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                        </button>
                      </label>
                      <div className="relative">
                        <input
                          type={showKey[currentProvider.providerId] ? 'text' : 'password'}
                          value={currentProvider.apiKey || ''}
                          onChange={(e) => updateProviderConfig(currentProvider.providerId, { apiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 text-xs bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] focus:outline-hidden font-mono"
                        />
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-03)] mt-1">
                        {isAr ? 'يتم حفظ المفتاح محلياً في متصفحك بشكل آمن ولا يرسل لأي طرف ثالث.' : 'Keys are safely held in local browser storage and used solely to proxy query requests.'}
                      </p>
                    </div>
                  )}

                  {/* Live OpenRouter Balance */}
                  {currentProvider.providerId === 'openrouter' && (
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                      <div className="text-xs font-medium text-[var(--cds-text-02)] mb-2 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-[#33b1ff]" />
                        {isAr ? 'الرصيد الحي للحساب:' : 'Live Account Balance:'}
                      </div>
                      {orBalanceError ? (
                        <div className="text-[11px] text-[#ff8389]">{orBalanceError}</div>
                      ) : !orBalance ? (
                        <div className="text-[11px] text-[var(--cds-text-03)]">{isAr ? 'جاري جلب الرصيد...' : 'Fetching balance...'}</div>
                      ) : (
                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-[var(--cds-text-03)]">{isAr ? 'النوع:' : 'Tier:'}</span>
                            <span className={orBalance.isFreeTier ? 'text-[#42be65] font-medium' : 'text-[#78a9ff] font-medium'}>
                              {orBalance.isFreeTier ? (isAr ? 'مجاني (Free Tier)' : 'Free Tier') : (isAr ? 'مدفوع' : 'Paid')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[var(--cds-text-03)]">{isAr ? 'الاستهلاك التراكمي:' : 'Total Usage:'}</span>
                            <span className="font-mono text-[var(--cds-text-01)]">${orBalance.usageUsd.toFixed(4)}</span>
                          </div>
                          {orBalance.limitUsd !== null && (
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--cds-text-03)]">{isAr ? 'الحد المتبقي:' : 'Credit Remaining:'}</span>
                              <span className="font-mono text-[var(--cds-text-01)]">${orBalance.limitRemainingUsd?.toFixed(4)}</span>
                            </div>
                          )}
                          {orBalance.freeDailyRequests && (
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--cds-text-03)]">{isAr ? 'حصة النماذج المجانية اليومية:' : 'Free Daily Requests:'}</span>
                              <span className="font-mono text-[var(--cds-text-01)]">
                                {orBalance.freeDailyRequests.used} / {orBalance.freeDailyRequests.limit}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ollama CLI Helper Box */}
                  {currentProvider.providerId === 'ollama' && (
                    <div className="mt-4 p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-medium text-[var(--cds-text-01)]">
                          <Terminal className="w-4 h-4 text-[#78a9ff]" />
                          <span>{isAr ? 'أوامر تثبيت النماذج المحلية في أولاما:' : 'Ollama Local Model Run Commands:'}</span>
                        </div>
                        <button
                          onClick={handleRefreshOllama}
                          disabled={isRefreshingOllama}
                          className="text-[11px] text-[#78a9ff] hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshingOllama ? 'animate-spin' : ''}`} />
                          {isAr ? 'تحديث قائمة النماذج المثبتة' : 'Refresh Installed Models'}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {[
                          { name: 'Qwen 2.5 Coder (7B - SQL & Code)', cmd: 'ollama run qwen2.5-coder:7b' },
                          { name: 'DeepSeek-R1 (8B - Local Reasoning)', cmd: 'ollama run deepseek-r1:8b' },
                          { name: 'Mistral Nemo (12B - Bilingual)', cmd: 'ollama run mistral-nemo:12b' },
                          { name: 'Llama 3.3 (70B - Enterprise)', cmd: 'ollama run llama3.3' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-[var(--cds-layer-02)] p-2 border border-[var(--cds-border-subtle)] text-xs">
                            <div>
                              <div className="font-medium text-[var(--cds-text-01)]">{item.name}</div>
                              <code className="text-[11px] text-[#78a9ff] font-mono">{item.cmd}</code>
                            </div>
                            <button
                              onClick={() => copyToClipboard(item.cmd, `cmd-${idx}`)}
                              className="px-2 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-[11px] flex items-center gap-1 transition-colors"
                            >
                              {copiedCmd === `cmd-${idx}` ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                              {copiedCmd === `cmd-${idx}` ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Display Discovered Installed Ollama Models */}
                      {currentProvider.installedLocalModels && currentProvider.installedLocalModels.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--cds-border-subtle)]">
                          <div className="text-xs text-[var(--cds-text-03)] mb-1.5">
                            {isAr ? 'النماذج المكتشفة على جهازك حالياً:' : 'Installed models detected on your machine:'}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {currentProvider.installedLocalModels.map((mName, i) => (
                              <span key={i} className="px-2 py-0.5 text-[11px] bg-[#42be65]/10 text-[#42be65] border border-[#42be65]/30 font-mono">
                                {mName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Available Models Under this Provider */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--cds-text-01)] tracking-wider uppercase">
                    {isAr ? 'النماذج المتاحة من هذا المزود' : 'Models Available for this Provider'}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {providerModels.map((model) => {
                      const isSelected = aiSettings.activeModel === model.id;
                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            setActiveAIModel(model.id);
                            toast.success(
                              isAr ? 'تم اختيار النموذج' : 'Model Selected',
                              isAr ? `النموذج النشط الآن: ${model.name}` : `Active model: ${model.name}`
                            );
                          }}
                          className={`p-3 border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#0f62fe] bg-[#0f62fe]/10 shadow-xs'
                              : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:border-[var(--cds-border-strong)]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-semibold text-xs text-[var(--cds-text-01)]">{model.name}</div>
                              <div className="text-[11px] text-[var(--cds-text-03)] mt-0.5">
                                {isAr ? model.descriptionAr : model.description}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-[#0f62fe] shrink-0 mt-1" />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            {model.isLocal && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/30">
                                🔒 Local
                              </span>
                            )}
                            {model.parameterSize && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-[var(--cds-layer-03)] text-[var(--cds-text-02)]">
                                {model.parameterSize}
                              </span>
                            )}
                            {model.capabilities.map((cap, ci) => (
                              <span key={ci} className="px-1.5 py-0.5 text-[10px] bg-[var(--cds-layer-01)] text-[#78a9ff] border border-[var(--cds-border-subtle)]">
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
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <div className="text-xs text-[var(--cds-text-03)] flex items-center gap-2">
            <span>{isAr ? 'النموذج النشط عالمياً:' : 'Active Global Engine:'}</span>
            <span className="font-semibold text-[var(--cds-text-01)] bg-[var(--cds-layer-01)] px-2 py-0.5 border border-[var(--cds-border-subtle)]">
              {availableAIModels.find(m => m.id === aiSettings.activeModel)?.name || aiSettings.activeModel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium bg-[#0f62fe] hover:bg-[#0353e9] text-white transition-colors"
            >
              {isAr ? 'تم وحفظ الإعدادات' : 'Done & Apply'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
