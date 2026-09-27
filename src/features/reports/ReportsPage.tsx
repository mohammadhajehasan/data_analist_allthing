import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DataStory, DataStoryChapter } from '../../types';
import { StoryChartRenderer } from '../../components/reports/StoryChartRenderer';
import {
  FileText,
  Sparkles,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Layers,
  Database,
  Cpu,
  Settings2,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Presentation,
  ListFilter,
  RefreshCw,
  ExternalLink,
  Zap,
} from 'lucide-react';

const FOCUS_ANGLES = [
  { id: 'comprehensive', labelAr: 'سرد تنفيذي استراتيجي شامل', labelEn: 'Comprehensive Executive Synthesis', icon: Layers },
  { id: 'financial_growth', labelAr: 'تعظيم الإيرادات وهوامش الربح', labelEn: 'Revenue & Margin Growth Optimization', icon: TrendingUp },
  { id: 'anomaly_risk', labelAr: 'كشف المخاطر والأنماط الشاذة', labelEn: 'Anomaly Audit & Risk Governance', icon: AlertTriangle },
  { id: 'customer_demographics', labelAr: 'ديناميكيات الشرائح وسلوك العملاء', labelEn: 'Customer Segmentation & Behavioral Dynamics', icon: Zap },
  { id: 'operational_efficiency', labelAr: 'الكفاءة التشغيلية وسلاسل الإمداد', labelEn: 'Operational & Supply Chain Velocity', icon: RefreshCw },
];

const TONES = [
  { id: 'executive', labelAr: 'تنفيذي استراتيجي رفيع المستوى', labelEn: 'High-Level Strategic Executive' },
  { id: 'technical', labelAr: 'علم بيانات وإحصاء تحليلي معمق', labelEn: 'Deep Data Science & Statistical' },
  { id: 'journalistic', labelAr: 'سرد قصصي استقصائي تفاعلي', labelEn: 'Journalistic & Scrollytelling' },
  { id: 'action_oriented', labelAr: 'إجرائي موجه للتنفيذ الفوري', labelEn: 'Action-Oriented Playbook' },
];

const PROVIDER_OPTIONS = [
  {
    id: 'gemini',
    name: 'Google Gemini (Cloud)',
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Ultra Fast & Analytical)' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Deep Strategic Reasoning)' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Low Latency)' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Private / On-Premise)',
    models: [
      { id: 'ollama/qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B (Fast Local)' },
      { id: 'ollama/llama3.3:70b', name: 'Llama 3.3 70B (High Reasoning)' },
      { id: 'ollama/deepseek-r1:14b', name: 'DeepSeek R1 14B (Distilled Reasoning)' },
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen AI (Alibaba Cloud)',
    models: [
      { id: 'qwen/qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B' },
      { id: 'qwen/qwen-max', name: 'Qwen Max (Flagship)' },
      { id: 'qwen/qwen-plus', name: 'Qwen Plus' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek AI (Cloud)',
    models: [
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (Enterprise Analytics)' },
      { id: 'deepseek/deepseek-reasoner', name: 'DeepSeek R1 (Advanced Chain-of-Thought)' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Multi-Model Gateway)',
    models: [
      { id: 'openrouter/anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (Anthropic)' },
      { id: 'openrouter/google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'openrouter/openai/gpt-4o', name: 'OpenAI GPT-4o' },
    ],
  },
];

export const ReportsPage: React.FC = () => {
  const {
    datasets,
    activeDataset,
    setActiveDataset,
    setActiveDatasetId,
     aiSettings,
    user,
    workspace,
    dataStories,
    saveDataStory,
    language,
    t,
    toast,
  } = useApp();

  const isAr = language === 'ar';

  // Story generation state & parameters
  const [selectedProvider, setSelectedProvider] = useState<string>(aiSettings?.activeProvider || 'gemini');
  const [selectedModel, setSelectedModel] = useState<string>(aiSettings?.activeModel || 'gemini-3.8-flash');
  const [selectedFocus, setSelectedFocus] = useState<string>('comprehensive');
  const [selectedTone, setSelectedTone] = useState<string>('executive');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'studio' | 'library'>('studio');
  const [viewMode, setViewMode] = useState<'scrolly' | 'slides' | 'markdown'>('scrolly');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Active Story selection
  const [activeStory, setActiveStory] = useState<DataStory | null>(
    dataStories.length > 0 ? dataStories[0] : null
  );

  // Audio speech synthesis
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Update selected model when provider changes
  useEffect(() => {
    const prov = PROVIDER_OPTIONS.find(p => p.id === selectedProvider);
    if (prov && prov.models.length > 0) {
      if (!prov.models.some(m => m.id === selectedModel)) {
        setSelectedModel(prov.models[0].id);
      }
    }
  }, [selectedProvider, selectedModel]);

  // Handle Speech Synthesis Read-Aloud
  const handleToggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      toast({
        title: isAr ? 'غير مدعوم' : 'Not Supported',
        description: isAr ? 'ميزة قراءة النصوص الصوتية غير مدعومة في متصفحك.' : 'Speech synthesis is not supported in this browser.',
        variant: 'warning',
      });
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!activeStory) return;

    const narrativeParts = [
      isAr ? (activeStory.titleAr || activeStory.title) : activeStory.title,
      isAr ? (activeStory.executiveSummaryAr || activeStory.executiveSummary) : activeStory.executiveSummary,
      ...(activeStory.chapters || activeStory.sections || []).map(ch =>
        `${isAr ? (ch.titleAr || ch.title) : ch.title}. ${isAr ? (ch.narrativeAr || ch.narrative) : ch.narrative}`
      ),
    ];

    const fullText = narrativeParts.join(' ... ');
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = isAr ? 'ar-SA' : 'en-US';
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // Stop speech when story changes
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [activeStory]);

  const handleGenerateStory = async () => {
    setIsGenerating(true);
    setGenerationStep(isAr ? '1/3: استخراج الخصائص الإحصائية والانحرافات المعيارية...' : '1/3: Extracting statistical variance & data distribution...');

    const stepTimer = setTimeout(() => {
      setGenerationStep(isAr ? `2/3: إرسال الطلب إلى مزود الذكاء الاصطناعي [${selectedModel}]...` : `2/3: Synthesizing narrative with [${selectedModel}]...`);
    }, 1200);

    const stepTimer2 = setTimeout(() => {
      setGenerationStep(isAr ? '3/3: بناء الفصول السردية وإعداد الرسوم البيانية التوضيحية...' : '3/3: Assembling chapters & illustrative chart points...');
    }, 2800);

    try {
      const res = await fetch('/api/datastory/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: activeDataset,
          language,
          provider: selectedProvider,
          model: selectedModel,
          focusAngle: selectedFocus,
          tone: selectedTone,
          endpointUrl: aiSettings?.providers?.[selectedProvider as any]?.endpointUrl,
          apiKey: aiSettings?.providers?.[selectedProvider as any]?.apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : (isAr ? 'تعذر توليد قصة البيانات' : 'Could not generate data story');
        throw new Error(errMsg);
      }
      if (data.story) {
        saveDataStory(data.story);
        setActiveStory(data.story);
        setActiveSlideIndex(0);
        toast({
          title: isAr ? 'تم توليد قصة البيانات بنجاح' : 'Data Story Synthesized Successfully',
          description: isAr
            ? `تم إنشاء تقرير سردي مدعوم بالرسوم البيانية باستخدام نموذج ${selectedModel}`
            : `Generated multi-chapter narrative with interactive charts via ${selectedModel}`,
          variant: 'success',
        });
      }
    } catch (err: any) {
      console.error('Report generation error:', err);
      toast({
        title: isAr ? 'خطأ في توليد القصة' : 'Story Generation Error',
        description: err?.message || (isAr ? 'تعذر الاتصال بمزود الذكاء الاصطناعي' : 'Could not reach AI provider'),
        variant: 'error',
      });
    } finally {
      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportJson = () => {
    if (!activeStory) return;
    const blob = new Blob([JSON.stringify(activeStory, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Data_Story_${activeStory.id}.json`;
    link.click();
  };

  const handleCopyMarkdown = () => {
    if (!activeStory) return;
    const chapters = activeStory.chapters || activeStory.sections || [];
    const md = `# ${isAr ? (activeStory.titleAr || activeStory.title) : activeStory.title}
*${isAr ? (activeStory.subtitleAr || activeStory.subtitle) : activeStory.subtitle}*

**Dataset**: ${activeStory.datasetName || activeDataset.name} | **Generated by**: ${activeStory.modelUsed || activeStory.author || 'AI Engine'}

## Executive Summary
${isAr ? (activeStory.executiveSummaryAr || activeStory.executiveSummary) : activeStory.executiveSummary}

---
${chapters.map((ch, idx) => `
### Chapter ${idx + 1}: ${isAr ? (ch.titleAr || ch.title) : ch.title}
${isAr ? (ch.narrativeAr || ch.narrative) : ch.narrative}

${ch.keyMetric ? `> **Key Metric**: ${ch.keyMetric.label} = ${ch.keyMetric.value} (${ch.keyMetric.context || ''})` : ''}

**Key Insights:**
${(ch.insights || []).map(ins => `- ${ins}`).join('\n')}

**Actionable Takeaway:** ${isAr ? (ch.takeawayAr || ch.takeaway) : ch.takeaway}
`).join('\n---\n')}

## Strategic Recommendations
${(activeStory.recommendations || []).map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
`;

    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2500);
    toast({
      title: isAr ? 'تم نسخ التقرير' : 'Copied to Clipboard',
      description: isAr ? 'تم نسخ التقرير السردي بصيغة Markdown' : 'Narrative markdown copied to clipboard',
      variant: 'info',
    });
  };

  const chapters: DataStoryChapter[] = activeStory
    ? (activeStory.chapters || activeStory.sections || [])
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#393939] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI DATA STORYTELLING &amp; EXECUTIVE NARRATIVES</span>
            </span>
            <span className="carbon-tag-teal text-[10px] uppercase font-mono">
              {activeDataset?.name || 'Dataset'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#f4f4f4] tracking-tight mt-1">
            {t.reports.title}
          </h2>
          <p className="text-xs sm:text-sm text-[#c6c6c6] mt-0.5">
            {t.reports.subtitle}
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Navigation Tabs */}
          <div className="flex items-center bg-[#262626] border border-[#393939] p-0.5">
            <button
              onClick={() => setActiveTab('studio')}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                activeTab === 'studio' ? 'bg-[#0f62fe] text-white' : 'text-[#c6c6c6] hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{isAr ? 'استوديو القصص' : 'Story Studio'}</span>
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                activeTab === 'library' ? 'bg-[#0f62fe] text-white' : 'text-[#c6c6c6] hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>{isAr ? `المكتبة (${dataStories.length})` : `Library (${dataStories.length})`}</span>
            </button>
          </div>

          {activeStory && (
            <>
              {/* Speech Synthesis Narration Button */}
              <button
                onClick={handleToggleSpeech}
                className={`carbon-btn-secondary text-xs font-mono font-bold gap-1.5 ${
                  isSpeaking ? 'border-[#0f62fe] bg-[#0f62fe]/20 text-[#33b1ff]' : ''
                }`}
                title={isSpeaking ? (isAr ? 'إيقاف القراءة الصوتية' : 'Stop Narration') : (isAr ? 'قراءة صوتية للتقرير' : 'Read Aloud Story')}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-[#33b1ff] animate-pulse" /> : <Volume2 className="w-3.5 h-3.5 text-[#0f62fe]" />}
                <span>{isSpeaking ? (isAr ? 'إيقاف القراءة' : 'Stop') : (isAr ? 'قراءة صوتية' : 'Read Aloud')}</span>
              </button>

              {/* Copy Markdown */}
              <button
                onClick={handleCopyMarkdown}
                className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
                title="Copy Markdown"
              >
                {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-[#42be65]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMarkdown ? (isAr ? 'تم النسخ' : 'Copied') : 'Markdown'}</span>
              </button>

              {/* Print / PDF */}
              <button
                onClick={handlePrint}
                className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
                title="Print or Save PDF"
              >
                <Printer className="w-3.5 h-3.5 text-[#0f62fe]" />
                <span>PDF / Print</span>
              </button>

              {/* Export JSON */}
              <button
                onClick={handleExportJson}
                className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
                title="Export JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Studio View */}
      {activeTab === 'studio' ? (
        <div className="space-y-6">
          {/* AI Generator Configuration Card */}
          <div className="bg-[#262626] border border-[#393939] p-4 sm:p-5">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#393939]">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-[#0f62fe]" />
                <h3 className="text-xs sm:text-sm font-mono font-bold uppercase tracking-wider text-[#f4f4f4]">
                  {isAr ? 'تخصيص محرك توليد قصة البيانات' : 'Data Story Intelligence Parameters'}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#8d8d8d]">
                Active Dataset: <strong className="text-[#f4f4f4]">{activeDataset?.name}</strong> ({activeDataset?.rowCount} rows)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Provider Picker */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#c6c6c6] uppercase tracking-wider mb-1">
                  {isAr ? 'مزود الخدمة (AI Provider)' : 'AI Provider'}
                </label>
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  className="w-full bg-[#161616] border border-[#525252] text-[#f4f4f4] text-xs font-mono px-2.5 py-2 focus:border-[#0f62fe] focus:outline-none"
                >
                  {PROVIDER_OPTIONS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Model Picker */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#c6c6c6] uppercase tracking-wider mb-1">
                  {isAr ? 'النموذج المختار (AI Model)' : 'Selected Model'}
                </label>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full bg-[#161616] border border-[#525252] text-[#f4f4f4] text-xs font-mono px-2.5 py-2 focus:border-[#0f62fe] focus:outline-none"
                >
                  {(PROVIDER_OPTIONS.find(p => p.id === selectedProvider)?.models || []).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Focus Angle Picker */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#c6c6c6] uppercase tracking-wider mb-1">
                  {isAr ? 'زاوية التركيز التحليلي' : 'Analytical Focus Angle'}
                </label>
                <select
                  value={selectedFocus}
                  onChange={e => setSelectedFocus(e.target.value)}
                  className="w-full bg-[#161616] border border-[#525252] text-[#f4f4f4] text-xs font-mono px-2.5 py-2 focus:border-[#0f62fe] focus:outline-none"
                >
                  {FOCUS_ANGLES.map(f => (
                    <option key={f.id} value={f.id}>
                      {isAr ? f.labelAr : f.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Tone / Style Picker */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#c6c6c6] uppercase tracking-wider mb-1">
                  {isAr ? 'أسلوب ونبرة السرد' : 'Narrative Tone & Style'}
                </label>
                <select
                  value={selectedTone}
                  onChange={e => setSelectedTone(e.target.value)}
                  className="w-full bg-[#161616] border border-[#525252] text-[#f4f4f4] text-xs font-mono px-2.5 py-2 focus:border-[#0f62fe] focus:outline-none"
                >
                  {TONES.map(tOption => (
                    <option key={tOption.id} value={tOption.id}>
                      {isAr ? tOption.labelAr : tOption.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ingestion Dataset Switcher Row */}
            <div className="mt-4 pt-3 border-t border-[#393939] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Database className="w-3.5 h-3.5 text-[#009d9a]" />
                <span className="text-xs font-mono text-[#c6c6c6]">
                  {isAr ? 'تغيير مجموعة البيانات النشطة:' : 'Switch Active Dataset:'}
                </span>
                <select
                  value={activeDataset.id}
                  onChange={e => {
                    const found = datasets.find(d => d.id === e.target.value);
                    if (found) setActiveDataset(found);
                  }}
                  className="bg-[#161616] border border-[#525252] text-[#f4f4f4] text-xs font-mono px-2 py-1 focus:border-[#0f62fe] focus:outline-none"
                >
                  {datasets.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.rowCount} {isAr ? 'سجل' : 'rows'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Generate Trigger Button */}
              <button
                onClick={handleGenerateStory}
                disabled={isGenerating}
                className="w-full sm:w-auto carbon-btn-primary text-xs font-mono font-bold uppercase tracking-wider gap-2 px-5 py-2.5 shadow-md"
              >
                <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin text-white' : 'text-white'}`} />
                <span>
                  {isGenerating
                    ? (isAr ? 'جارٍ المعالجة والتوليد...' : 'Synthesizing Story...')
                    : (isAr ? `توليد قصة بيانات عبر [${selectedModel.split('/').pop()}]` : `Generate Story with [${selectedModel.split('/').pop()}]`)}
                </span>
              </button>
            </div>

            {/* Live Progress Bar when Generating */}
            {isGenerating && (
              <div className="mt-4 p-3 bg-[#161616] border border-[#0f62fe] space-y-2 animate-pulse">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#33b1ff] font-bold flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{generationStep || (isAr ? 'جارٍ تحليل البيانات والتوليد السردي...' : 'Processing dataset insights...')}</span>
                  </span>
                  <span className="text-[#8d8d8d]">Provider: {selectedProvider.toUpperCase()}</span>
                </div>
                <div className="w-full bg-[#262626] h-1.5 overflow-hidden">
                  <div className="bg-[#0f62fe] h-full w-2/3 animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {/* Rendered Story View */}
          {activeStory ? (
            <div className="bg-[#262626] border border-[#393939] p-6 sm:p-8 space-y-6">
              {/* Story Meta Header */}
              <div className="border-b border-[#393939] pb-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="carbon-tag-blue uppercase text-[10px] font-mono">
                      {activeDataset?.format?.toUpperCase() || 'CSV'} Dataset Story
                    </span>
                    <span className="carbon-tag-teal uppercase text-[10px] font-mono flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      <span>{activeStory.modelUsed || activeStory.author || 'AI Engine'}</span>
                    </span>
                    {activeStory.durationMs && (
                      <span className="text-[11px] font-mono text-[#8d8d8d] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{activeStory.durationMs}ms latency</span>
                      </span>
                    )}
                  </div>

                  {/* Mode Selector (Scrollytelling vs Slides vs Markdown) */}
                  <div className="flex items-center bg-[#161616] border border-[#393939] p-0.5">
                    <button
                      onClick={() => setViewMode('scrolly')}
                      className={`px-2.5 py-1 text-xs font-mono font-bold gap-1 flex items-center transition-colors ${
                        viewMode === 'scrolly' ? 'bg-[#0f62fe] text-white' : 'text-[#c6c6c6] hover:text-white'
                      }`}
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>{isAr ? 'سرد تفاعلي' : 'Scrollytelling'}</span>
                    </button>
                    <button
                      onClick={() => setViewMode('slides')}
                      className={`px-2.5 py-1 text-xs font-mono font-bold gap-1 flex items-center transition-colors ${
                        viewMode === 'slides' ? 'bg-[#0f62fe] text-white' : 'text-[#c6c6c6] hover:text-white'
                      }`}
                    >
                      <Presentation className="w-3 h-3" />
                      <span>{isAr ? 'عرض شرائح' : 'Slide Deck'}</span>
                    </button>
                    <button
                      onClick={() => setViewMode('markdown')}
                      className={`px-2.5 py-1 text-xs font-mono font-bold gap-1 flex items-center transition-colors ${
                        viewMode === 'markdown' ? 'bg-[#0f62fe] text-white' : 'text-[#c6c6c6] hover:text-white'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      <span>Markdown</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#f4f4f4] tracking-tight">
                    {isAr ? activeStory.titleAr || activeStory.title : activeStory.title}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#33b1ff] font-mono mt-1">
                    {isAr ? activeStory.subtitleAr || activeStory.subtitle : activeStory.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-[#8d8d8d] font-mono">
                  <span>Dataset: <strong className="text-[#c6c6c6]">{activeStory.datasetName || activeDataset.name}</strong></span>
                  <span>•</span>
                  <span>Generated: {new Date(activeStory.generatedAt).toLocaleString()}</span>
                  {activeStory.qualityScore && (
                    <>
                      <span>•</span>
                      <span className="text-[#42be65]">Quality Score: {activeStory.qualityScore}%</span>
                    </>
                  )}
                </div>
              </div>

              {/* View Mode 1: Scrollytelling Mode */}
              {viewMode === 'scrolly' && (
                <div className="space-y-8">
                  {/* Executive Summary Callout */}
                  <div className="p-5 bg-[#161616] border-s-4 border-s-[#0f62fe] border border-[#393939] space-y-2 shadow-inner">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#33b1ff] flex items-center gap-1.5">
                        <Layers className="w-4 h-4" />
                        <span>{isAr ? 'الملخص التنفيذي والاستراتيجي' : 'Executive Analytical Summary'}</span>
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-[#f4f4f4] leading-relaxed font-sans">
                      {isAr ? activeStory.executiveSummaryAr || activeStory.executiveSummary : activeStory.executiveSummary}
                    </p>
                  </div>

                  {/* Multi-Chapter Cards with Interactive Recharts */}
                  <div className="space-y-8">
                    {chapters.map((chapter, index) => (
                      <div
                        key={chapter.id || `chapter-${index}`}
                        className="p-5 sm:p-6 bg-[#1f1f1f] border border-[#393939] space-y-5 transition-all hover:border-[#525252]"
                      >
                        {/* Chapter Header with Number Badge */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#333] pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 bg-[#0f62fe] text-white font-mono text-xs font-bold flex items-center justify-center">
                              {chapter.chapterNumber || index + 1}
                            </span>
                            <h3 className="text-base sm:text-lg font-bold text-[#f4f4f4]">
                              {isAr ? chapter.titleAr || chapter.title : chapter.title}
                            </h3>
                          </div>

                          {/* Key Metric Badge if present */}
                          {chapter.keyMetric && (
                            <div className="bg-[#161616] border border-[#393939] px-3 py-1.5 flex items-center gap-2.5 self-start sm:self-auto">
                              <span className="text-[10px] font-mono text-[#8d8d8d] uppercase">
                                {isAr ? chapter.keyMetric.labelAr || chapter.keyMetric.label : chapter.keyMetric.label}:
                              </span>
                              <span className="text-sm font-bold font-mono text-[#f4f4f4]">
                                {chapter.keyMetric.value}
                              </span>
                              {chapter.keyMetric.trend && (
                                <span className={`flex items-center text-[10px] font-mono font-bold ${
                                  chapter.keyMetric.trend === 'up' ? 'text-[#42be65]' : chapter.keyMetric.trend === 'down' ? 'text-[#fa4d56]' : 'text-[#33b1ff]'
                                }`}>
                                  {chapter.keyMetric.trend === 'up' ? <TrendingUp className="w-3 h-3 inline me-0.5" /> : <TrendingDown className="w-3 h-3 inline me-0.5" />}
                                  {chapter.keyMetric.trendPercentage ? `${chapter.keyMetric.trendPercentage}%` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Narrative Story & Chart Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                          {/* Left Column: Narrative Story and Key Takeaway */}
                          <div className="lg:col-span-6 space-y-4">
                            <div className="prose prose-invert max-w-none text-xs sm:text-sm text-[#c6c6c6] leading-relaxed">
                              {isAr ? chapter.narrativeAr || chapter.narrative : chapter.narrative}
                            </div>

                            {/* Bullet Insights */}
                            {((isAr ? chapter.insightsAr : chapter.insights) || chapter.insights) && (
                              <div className="space-y-1.5 pt-2">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8d8d8d]">
                                  {isAr ? 'الرؤى التحليلية المرصودة:' : 'Observed Analytical Insights:'}
                                </span>
                                <div className="space-y-1">
                                  {((isAr ? chapter.insightsAr : chapter.insights) || chapter.insights || []).map((ins, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-[#f4f4f4] bg-[#161616] p-2 border border-[#2a2a2a]">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65] shrink-0 mt-0.5" />
                                      <span>{ins}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Core Action Takeaway Box */}
                            {(chapter.takeaway || chapter.takeawayAr) && (
                              <div className="p-3 bg-[#161616] border-s-2 border-s-[#24a148] border border-[#393939] flex items-start gap-2 text-xs">
                                <Zap className="w-4 h-4 text-[#42be65] shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-mono font-bold text-[#42be65] uppercase text-[10px] block">
                                    {isAr ? 'الإجراء التنفيذي الموصى به للفصل' : 'Actionable Takeaway'}
                                  </span>
                                  <span className="text-[#f4f4f4]">
                                    {isAr ? chapter.takeawayAr || chapter.takeaway : chapter.takeaway}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Embedded Recharts Illustrative Visualization */}
                          <div className="lg:col-span-6">
                            <StoryChartRenderer
                              initialType={chapter.chartType || (index === 0 ? 'bar' : index === 1 ? 'line' : index === 2 ? 'pie' : 'area')}
                              data={chapter.chartData}
                              xAxis={chapter.xAxis}
                              yAxis={chapter.yAxis}
                              explanation={isAr ? chapter.chartExplanationAr || chapter.chartExplanation : chapter.chartExplanation}
                              language={language}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Strategic Recommendations Final Section */}
                  {((isAr ? activeStory.recommendationsAr : activeStory.recommendations) || activeStory.recommendations) && (
                    <div className="p-6 bg-[#161616] border border-[#393939] space-y-4">
                      <div className="flex items-center gap-2 border-b border-[#333] pb-3">
                        <TrendingUp className="w-5 h-5 text-[#42be65]" />
                        <div>
                          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#42be65]">
                            {isAr ? 'خارطة الطريق والتوصيات الاستراتيجية' : 'Strategic Recommendations & Executive Roadmap'}
                          </h3>
                          <p className="text-[11px] text-[#8d8d8d] font-mono">
                            {isAr ? 'الإجراءات ذات الأولوية القصوى لتعظيم القيمة التشغيلية والمالية' : 'High-impact interventions to optimize operational and financial velocity'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {((isAr ? activeStory.recommendationsAr : activeStory.recommendations) || activeStory.recommendations || []).map((rec, i) => (
                          <div key={i} className="p-3.5 bg-[#1f1f1f] border border-[#393939] flex items-start gap-3">
                            <span className="w-5 h-5 bg-[#24a148]/20 text-[#42be65] font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 border border-[#24a148]/30">
                              {i + 1}
                            </span>
                            <span className="text-xs text-[#f4f4f4] leading-relaxed">
                              {rec}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* View Mode 2: Presentation Slide Deck Mode */}
              {viewMode === 'slides' && (
                <div className="space-y-4">
                  {/* Slide Stepper Controls */}
                  <div className="flex items-center justify-between bg-[#161616] border border-[#393939] p-3">
                    <button
                      onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
                      disabled={activeSlideIndex === 0}
                      className="carbon-btn-secondary text-xs font-mono font-bold gap-1 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{isAr ? 'الشريحة السابقة' : 'Previous Slide'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[#33b1ff] font-bold">
                        {isAr ? `شريحة ${activeSlideIndex + 1} من ${chapters.length + 1}` : `Slide ${activeSlideIndex + 1} of ${chapters.length + 1}`}
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveSlideIndex(prev => Math.min(chapters.length, prev + 1))}
                      disabled={activeSlideIndex >= chapters.length}
                      className="carbon-btn-secondary text-xs font-mono font-bold gap-1 disabled:opacity-30"
                    >
                      <span>{isAr ? 'الشريحة التالية' : 'Next Slide'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Slide Content */}
                  {activeSlideIndex === 0 ? (
                    // Slide 0: Executive Overview
                    <div className="bg-[#161616] border border-[#0f62fe] p-8 sm:p-12 space-y-6 min-h-[420px] flex flex-col justify-center text-center">
                      <span className="text-xs font-mono uppercase tracking-widest text-[#0f62fe]">
                        EXECUTIVE DATA BRIEFING
                      </span>
                      <h2 className="text-2xl sm:text-4xl font-bold text-[#f4f4f4]">
                        {isAr ? activeStory.titleAr || activeStory.title : activeStory.title}
                      </h2>
                      <p className="text-sm sm:text-lg text-[#c6c6c6] max-w-3xl mx-auto leading-relaxed">
                        {isAr ? activeStory.executiveSummaryAr || activeStory.executiveSummary : activeStory.executiveSummary}
                      </p>
                      <div className="pt-4 flex items-center justify-center gap-4 text-xs font-mono text-[#8d8d8d]">
                        <span>Dataset: {activeStory.datasetName || activeDataset.name}</span>
                        <span>•</span>
                        <span>Model: {activeStory.modelUsed || activeStory.author}</span>
                      </div>
                    </div>
                  ) : (
                    // Slide N: Chapter Detail
                    (() => {
                      const ch = chapters[activeSlideIndex - 1];
                      if (!ch) return null;
                      return (
                        <div className="bg-[#161616] border border-[#393939] p-6 sm:p-8 space-y-6 min-h-[420px]">
                          <div className="flex items-center justify-between border-b border-[#333] pb-3">
                            <span className="text-xs font-mono uppercase text-[#0f62fe] font-bold">
                              {isAr ? `الفصل ${activeSlideIndex}` : `Chapter ${activeSlideIndex}`}
                            </span>
                            {ch.keyMetric && (
                              <span className="text-xs font-mono text-[#42be65] font-bold">
                                {ch.keyMetric.label}: {ch.keyMetric.value}
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl sm:text-2xl font-bold text-[#f4f4f4]">
                            {isAr ? ch.titleAr || ch.title : ch.title}
                          </h3>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                            <div className="lg:col-span-6 space-y-4">
                              <p className="text-sm text-[#c6c6c6] leading-relaxed">
                                {isAr ? ch.narrativeAr || ch.narrative : ch.narrative}
                              </p>
                              <div className="p-3 bg-[#1f1f1f] border-s-2 border-s-[#0f62fe] text-xs text-[#f4f4f4]">
                                <strong>Takeaway:</strong> {isAr ? ch.takeawayAr || ch.takeaway : ch.takeaway}
                              </div>
                            </div>
                            <div className="lg:col-span-6">
                              <StoryChartRenderer
                                initialType={ch.chartType || 'bar'}
                                data={ch.chartData}
                                xAxis={ch.xAxis}
                                yAxis={ch.yAxis}
                                explanation={isAr ? ch.chartExplanationAr || ch.chartExplanation : ch.chartExplanation}
                                language={language}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* View Mode 3: Raw Markdown View */}
              {viewMode === 'markdown' && (
                <div className="bg-[#161616] border border-[#393939] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-[#8d8d8d]">
                    <span>Raw Markdown Code Representation</span>
                    <button
                      onClick={handleCopyMarkdown}
                      className="text-[#0f62fe] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedMarkdown ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-[#c6c6c6] p-4 bg-[#111] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-[#262626]">
{`# ${isAr ? (activeStory.titleAr || activeStory.title) : activeStory.title}
*${isAr ? (activeStory.subtitleAr || activeStory.subtitle) : activeStory.subtitle}*

Dataset: ${activeStory.datasetName || activeDataset.name} | Model: ${activeStory.modelUsed || activeStory.author}

## Executive Summary
${isAr ? (activeStory.executiveSummaryAr || activeStory.executiveSummary) : activeStory.executiveSummary}

${chapters.map((ch, i) => `
### Chapter ${i + 1}: ${isAr ? (ch.titleAr || ch.title) : ch.title}
${isAr ? (ch.narrativeAr || ch.narrative) : ch.narrative}
- Metric: ${ch.keyMetric?.label} (${ch.keyMetric?.value})
- Takeaway: ${isAr ? (ch.takeawayAr || ch.takeaway) : ch.takeaway}
`).join('\n')}

## Strategic Recommendations
${(activeStory.recommendations || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}
`}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="carbon-tile p-12 text-center text-[#c6c6c6] space-y-4">
              <FileText className="w-12 h-12 text-[#0f62fe] mx-auto opacity-80" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#f4f4f4]">
                  {isAr ? 'لم يتم توليد قصة بيانات بعد' : 'No Data Story Generated Yet'}
                </p>
                <p className="text-xs text-[#8d8d8d] max-w-md mx-auto">
                  {isAr
                    ? 'اختر مزود الذكاء الاصطناعي والنموذج وزاوية التركيز أعلاه ثم انقر "توليد قصة بيانات" لبناء تقرير سردي ذكي مدعوم برسوم بيانية تفاعلية.'
                    : 'Select your preferred AI provider, model, and focus angle above, then click "Generate Story" to synthesize an automated executive analytics brief.'}
                </p>
              </div>
              <button
                onClick={handleGenerateStory}
                disabled={isGenerating}
                className="carbon-btn-primary text-xs font-mono font-bold uppercase tracking-wider gap-2 mx-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? 'توليد أول قصة بيانات الآن' : 'Synthesize First Data Story'}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Saved Stories Library Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
              {isAr ? `قصص البيانات المحفوظة (${dataStories.length})` : `Saved Data Stories (${dataStories.length})`}
            </h3>
            <span className="text-xs font-mono text-[#8d8d8d]">
              {isAr ? 'انقر على أي قصة لعرض تفاصيلها واستعراض الرسوم البيانية' : 'Click any story to open interactive scrollytelling'}
            </span>
          </div>

          {dataStories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dataStories.map(story => (
                <div
                  key={story.id}
                  onClick={() => {
                    setActiveStory(story);
                    setActiveTab('studio');
                  }}
                  className={`p-4 bg-[#262626] border cursor-pointer transition-all hover:border-[#0f62fe] space-y-3 ${
                    activeStory?.id === story.id ? 'border-[#0f62fe] ring-1 ring-[#0f62fe]' : 'border-[#393939]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="carbon-tag-teal text-[10px] font-mono uppercase">
                      {story.modelUsed || story.author || 'AI Model'}
                    </span>
                    <span className="text-[10px] font-mono text-[#8d8d8d]">
                      {new Date(story.generatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-[#f4f4f4] line-clamp-1">
                      {isAr ? story.titleAr || story.title : story.title}
                    </h4>
                    <p className="text-xs text-[#c6c6c6] line-clamp-2 mt-1">
                      {isAr ? story.executiveSummaryAr || story.executiveSummary : story.executiveSummary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#393939] text-xs font-mono text-[#8d8d8d]">
                    <span>Dataset: {story.datasetName || 'Active'}</span>
                    <span className="text-[#33b1ff] flex items-center gap-1">
                      <span>{isAr ? 'فتح القصة' : 'Open'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="carbon-tile p-8 text-center text-[#c6c6c6]">
              <ListFilter className="w-8 h-8 text-[#525252] mx-auto mb-2" />
              <p className="text-xs font-mono">{isAr ? 'لا توجد قصص محفوظة في هذه الجلسة' : 'No saved stories yet'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

