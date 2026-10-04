import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { validateSqlWithNineLayers } from '../../utils/sqlValidator';
import { executeAnalyticalQuery } from '../../utils/analyticsEngine';
import { analyzeSqlErrors } from '../../utils/sqlErrorParser';
import { generateExecutionPlan } from '../../utils/sqlPlanGenerator';
import { checkAiAccess, aiAccessBlockMessage, fetchServerAiProviders, aiAuthHeaders } from '../../utils/aiAccessGuard';
import { SQLValidationReport, QueryResult, SqlOptimizationResult, ExecutionPlanNode } from '../../types';
import { ChartFactory } from '../../components/charts/ChartFactory';
import { CarbonDataTable } from '../../components/common/CarbonDataTable';
import { SqlExecutionPlanVisualizer } from '../../components/nl2sql/SqlExecutionPlanVisualizer';
import { NineLayerLaserGate } from '../../components/nl2sql/NineLayerLaserGate';
import { audio } from '../../utils/audioEngine';
import { SqlOptimizerModal } from '../../components/nl2sql/SqlOptimizerModal';
import { optimizeSqlQuery } from '../../services/aiService';
import { MultiModelComparisonArena } from '../../components/ai/MultiModelComparisonArena';
import { AIModelSelector } from '../../components/ai/AIModelSelector';
import { ConfidenceScoreGauge, ConfidenceScoreBreakdown } from '../../components/ai/ConfidenceScoreGauge';
import { ModelConfigPage } from '../models/ModelConfigPage';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';
import { format } from 'sql-formatter';
import {
  Terminal,
  ShieldCheck,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  Layers,
  Copy,
  Check,
  Clock,
  BarChart3,
  TestTube2,
  Cpu,
  Database,
  ArrowRight,
  Zap,
  Lightbulb,
  Wrench,
  HelpCircle,
  RotateCcw,
  AlignLeft,
  Download,
} from 'lucide-react';

export const NL2SQLPage: React.FC = () => {
  const { activeDataset, user, workspace, addAuditLog, toast, language, t, activeAIModelDef, aiSettings, setActiveTab } = useApp();
  const isAr = language === 'ar';

  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'arena' | 'config'>('editor');

  const [question, setQuestion] = useState(
    language === 'ar'
      ? 'احسب إجمالي الإيرادات ومتوسط الأرباح لكل تصنيف ورتبها تنازلياً حسب الإيرادات'
      : 'Calculate total revenue and average profit margin grouped by category ordered descending'
  );

  const [sqlCode, setSqlCode] = useState(
    `SELECT category, SUM(revenue) AS total_revenue, AVG(profit) AS avg_profit, COUNT(*) AS order_count\nFROM ${activeDataset?.name?.replace(/\s+/g, '_')?.toLowerCase() || 'dataset'}\nGROUP BY category\nORDER BY total_revenue DESC\nLIMIT 20;`
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gateRunId, setGateRunId] = useState(0);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [showPlanVisualizer, setShowPlanVisualizer] = useState(true);
  const [generatedExplanation, setGeneratedExplanation] = useState<string>('');
  const [engineModel, setEngineModel] = useState<string>('');

  // Optimizer modal state
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<SqlOptimizationResult | null>(null);

  // Initial validation report
  const validationReport: SQLValidationReport = useMemo(() => {
    if (!activeDataset) {
      return {
        isValid: false,
        canExecute: false,
        layers: [],
        estimatedCost: { estimatedRows: 0, complexityScore: 0, executionRisk: 'LOW' },
        sanitizedSql: '',
        securityViolations: [],
      };
    }
    return validateSqlWithNineLayers(sqlCode, activeDataset);
  }, [sqlCode, activeDataset]);

  // Real-time Smart SQL Error Analysis & Suggestions
  const errorAnalysis = useMemo(() => {
    if (!activeDataset) return null;
    return analyzeSqlErrors(sqlCode, activeDataset, executionError || undefined);
  }, [sqlCode, activeDataset, executionError]);

  // Computed Confidence Score Breakdown for active AI model response
  const confidenceScore: ConfidenceScoreBreakdown = useMemo(() => {
    const passedLayers = validationReport.layers.filter(l => l.status === 'passed').length;
    const executionSafety = Math.round((passedLayers / 9) * 100);
    const syntaxValidity = errorAnalysis?.hasError ? 40 : 100;
    const schemaAlignment = errorAnalysis ? Math.max(50, 100 - (errorAnalysis.suggestions.length * 15)) : 95;
    const overallScore = Math.round(syntaxValidity * 0.35 + schemaAlignment * 0.35 + executionSafety * 0.3);
    const hallucinationRisk = errorAnalysis?.hasError ? (errorAnalysis.suggestions.length > 1 ? 'high' : 'medium') : 'low';

    return {
      overallScore,
      syntaxValidity,
      schemaAlignment,
      hallucinationRisk,
      executionSafety,
      semanticMatch: 92,
      modelName: activeAIModelDef.name,
      isLocalOnly: activeAIModelDef.isLocal,
      reliabilityVerdict: overallScore >= 85 ? 'High Confidence - Validated SQL' : overallScore >= 70 ? 'Moderate Confidence' : 'Low Confidence - Corrections Suggested',
      reliabilityVerdictAr: overallScore >= 85 ? 'درجة ثقة عالية - تم التحقق من سلامة الهيكل' : overallScore >= 70 ? 'درجة ثقة متوسطة' : 'درجة ثقة منخفضة - يتطلب مراجعة',
      recommendation: overallScore >= 85 ? 'Query is safe and ready for execution.' : 'Review error suggestions or use One-Click Auto-Fix.',
      recommendationAr: overallScore >= 85 ? 'الاستعلام آمن ومطابق للمخطط وجاهز للتنفيذ المباشر.' : 'يرجى مراجعة المقترحات التصحيحية أو استخدام الإصلاح التلقائي.',
    };
  }, [validationReport, errorAnalysis, activeAIModelDef]);

  // Generated D3 Execution Plan
  const executionPlan: ExecutionPlanNode = useMemo(() => {
    if (!activeDataset) {
      return {
        id: 'root',
        name: 'Empty Plan',
        type: 'OUTPUT',
        cost: 0,
        estimatedRows: 0,
        details: 'No dataset selected',
      };
    }
    return generateExecutionPlan(sqlCode, activeDataset);
  }, [sqlCode, activeDataset]);

  const handleGenerateSql = async () => {
    if (!question.trim() || !activeDataset) return;
    const serverProviders = await fetchServerAiProviders();
    const access = checkAiAccess(activeAIModelDef.provider, aiSettings.providers[activeAIModelDef.provider], serverProviders);
    if (!access.ok) {
      const { title, description } = aiAccessBlockMessage(access.reason || 'no-key', isAr, activeAIModelDef.providerName || String(activeAIModelDef.provider));
      toast.warning(title, description);
      setActiveTab('models');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch('/api/nl2sql/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiAuthHeaders() },
        body: JSON.stringify({
          question,
          datasetSchema: {
            name: activeDataset.name,
            columns: activeDataset.columns,
          },
          language,
          provider: activeAIModelDef.provider,
          model: activeAIModelDef.id,
          endpointUrl: aiSettings.providers[activeAIModelDef.provider]?.endpointUrl,
          apiKey: aiSettings.providers[activeAIModelDef.provider]?.apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : (isAr ? 'فشل توليد الاستعلام' : 'Generation Failed');
        toast.error(isAr ? 'فشل توليد الاستعلام' : 'Generation Failed', errMsg);
        return;
      }
      if (data.sql) {
        setSqlCode(data.sql);
        toast.success(
          isAr ? 'تم توليد استعلام SQL بنجاح' : 'SQL Generated',
          isAr ? 'تمت ترجمة السؤال الطبيعي وتحليله مع حواجز الحماية التساعية.' : 'Successfully synthesized SQL with 9-layer security checks.'
        );
      }
      if (data.explanation) {
        setGeneratedExplanation(data.explanation);
      } else {
        setGeneratedExplanation(
          language === 'ar'
            ? 'تم توليد استعلام SQL محسوب وفق معايير المخطط بدقة.'
            : 'SQL query generated per schema specifications.'
        );
      }
      if (data.model) {
        setEngineModel(data.model);
      }
    } catch (err) {
      console.error('Error generating SQL:', err);
      toast.error(
        isAr ? 'فشل توليد الاستعلام' : 'Generation Failed',
        isAr ? 'تعذر الاتصال بمحرك الذكاء الاصطناعي.' : 'Failed to reach AI engine.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptimizeSql = async () => {
    if (!sqlCode.trim() || !activeDataset) return;
    const serverProviders = await fetchServerAiProviders();
    const access = checkAiAccess(activeAIModelDef.provider, aiSettings.providers[activeAIModelDef.provider], serverProviders);
    if (!access.ok) {
      const { title, description } = aiAccessBlockMessage(access.reason || 'no-key', isAr, activeAIModelDef.providerName || String(activeAIModelDef.provider));
      toast.warning(title, description);
      setActiveTab('models');
      return;
    }
    setIsOptimizerOpen(true);
    setIsOptimizing(true);
    try {
      const providerCfg = aiSettings.providers[activeAIModelDef.provider];
      const data: SqlOptimizationResult = await optimizeSqlQuery({
        sql: sqlCode,
        datasetSchema: {
          name: activeDataset.name,
          columns: activeDataset.columns,
        },
        language,
        provider: activeAIModelDef.provider,
        model: activeAIModelDef.id,
        endpointUrl: providerCfg?.endpointUrl,
        apiKey: providerCfg?.apiKey,
      });
      setOptimizationResult(data);
    } catch (err) {
      console.error('Error optimizing SQL:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExecuteSql = () => {
    if (!activeDataset || !validationReport.canExecute) return;
    setIsExecuting(true);
    setExecutionError(null);
    // Launch the photon through the 9-layer laser gate
    setGateRunId(id => id + 1);
    setTimeout(() => {
      try {
        const result = executeAnalyticalQuery(activeDataset, {
          datasetId: activeDataset.id,
          rawSql: validationReport.sanitizedSql || sqlCode,
          limit: 500,
        });

        if (result.explainPlan && result.explainPlan[0]?.startsWith('Execution error:')) {
          setExecutionError(result.explainPlan[0]);
          toast.error(
            isAr ? 'فشل تنفيذ الاستعلام' : 'Execution Failed',
            result.explainPlan[0]
          );
        } else {
          setQueryResult(result);
          toast.success(
            isAr ? 'تم تنفيذ الاستعلام بنجاح!' : 'Query Executed Successfully!',
            isAr
              ? `تم استرجاع ${result.totalCount} صف في ${result.executionTimeMs} ملي ثانية.`
              : `Returned ${result.totalCount} records in ${result.executionTimeMs}ms.`
          );
          // Sonification: glass chime for light queries, deep boom for heavy ones
          if (result.executionTimeMs > 150 || result.totalCount > 200) {
            audio.chimeHeavy();
          } else {
            audio.chimeSuccess();
          }
          window.dispatchEvent(new CustomEvent('carbon-analytical-success'));
        }
        setIsExecuting(false);

        addAuditLog({
          userId: user.id,
          userName: user.name,
          workspaceId: workspace.id,
          action: 'SQL_EXECUTE',
          resourceType: 'sql_query',
          resourceId: activeDataset.id,
          status: 'SUCCESS',
          durationMs: result.executionTimeMs,
          payloadSummary: `Executed SQL query returning ${result.totalCount} rows in ${result.executionTimeMs}ms with ${validationReport.estimatedCost.executionRisk} risk`,
          riskLevel: validationReport.estimatedCost.executionRisk,
        });
      } catch (err: any) {
        setIsExecuting(false);
        const errMsg = err?.message || 'Query execution failed.';
        setExecutionError(errMsg);
        toast.error(isAr ? 'خطأ في التنفيذ' : 'Execution Error', errMsg);
        audio.chimeError();
        window.dispatchEvent(new CustomEvent('carbon-analytical-error', { detail: errMsg }));
      }
    }, 120);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    toast.info(isAr ? 'تم نسخ كود SQL' : 'SQL Copied', isAr ? 'تم حفظ الاستعلام في الحافظة.' : 'Copied SQL query to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportSqlFile = () => {
    if (!sqlCode.trim()) {
      toast.error(
        isAr ? 'لا يوجد استعلام للتصدير' : 'No Query to Export',
        isAr ? 'يرجى كتابة أو توليد استعلام أولاً.' : 'Please generate or write a SQL query first.'
      );
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeDatasetName = activeDataset?.name?.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_') || 'dataset';
    const filename = `query_${safeDatasetName}_${timestamp}.sql`;

    const headerComment = `-- =====================================================================
-- IBM Carbon Analytics Studio - NL2SQL Synthesized Query
-- Generated At: ${new Date().toISOString()} (${new Date().toLocaleString(isAr ? 'ar-EG' : 'en-US')})
-- Target Dataset: ${activeDataset?.name || 'Unknown'}
-- Prompt: ${question || 'N/A'}
-- 9-Layer Security Risk: ${validationReport.estimatedCost.executionRisk}
-- Overall Confidence Score: ${confidenceScore.overallScore}% (${confidenceScore.reliabilityVerdict})
-- =====================================================================\n\n`;

    const fullContent = `${headerComment}${sqlCode.trim()}\n`;
    const blob = new Blob([fullContent], { type: 'application/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      isAr ? 'تم تصدير ملف SQL بنجاح' : 'SQL File Exported',
      isAr ? `تم تنزيل ${filename}` : `Saved as ${filename}`
    );

addAuditLog({
          userId: user.id,
          userName: user.name,
          workspaceId: workspace.id,
          action: 'EXPORT_SQL_FILE',
          resourceType: 'sql_query',
          resourceId: activeDataset.id,
          status: 'SUCCESS',
          durationMs: 0,
          payloadSummary: `Exported ${filename} with SQL length ${sqlCode.length} for dataset ${activeDataset.name}`,
          riskLevel: 'LOW',
        });
  };

  const applyCorrection = (fixedSql?: string) => {
    if (fixedSql) {
      setSqlCode(fixedSql);
      setExecutionError(null);
      toast.success(
        isAr ? 'تم تطبيق المقترح الذكي' : 'Suggestion Applied',
        isAr ? 'تم تحديث كود SQL وإصلاح البنية وفق التوصية.' : 'SQL syntax updated with the smart correction.'
      );
    }
  };

  // Sample query presets
  const loadPresetQuery = (type: 'standard' | 'typo' | 'missingGroup' | 'orderByMisplaced') => {
    const tableName = activeDataset?.name?.replace(/\s+/g, '_')?.toLowerCase() || 'dataset';
    if (type === 'standard') {
      setSqlCode(`SELECT category, SUM(revenue) AS total_revenue, AVG(profit) AS avg_profit\nFROM ${tableName}\nWHERE revenue > 100\nGROUP BY category\nORDER BY total_revenue DESC\nLIMIT 15;`);
      setExecutionError(null);
    } else if (type === 'typo') {
      setSqlCode(`SEELCT categry, SUM(revenu) AS total_revenue\nFROMM ${tableName}\nWHER revenu > 50\nGRUP BY categry\nLIMT 10;`);
    } else if (type === 'missingGroup') {
      setSqlCode(`SELECT category, region, SUM(revenue) AS total_revenue, COUNT(*)\nFROM ${tableName}\nLIMIT 20;`);
    } else if (type === 'orderByMisplaced') {
      setSqlCode(`SELECT category, SUM(revenue) AS total_revenue\nFROM ${tableName}\nGROUP BY category\nWHERE revenue > 500;`);
    }
  };

  if (!activeDataset) {
    return (
      <div className="carbon-tile p-12 text-center text-[var(--cds-text-02)]">
        <Database className="w-12 h-12 text-[#0f62fe] mx-auto mb-3" />
        <p className="text-sm font-bold">No active dataset selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              IBM CARBON / 9-LAYER SECURE NL2SQL PIPELINE
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--cds-text-01)] tracking-tight mt-1">{t.nl2sql.title}</h2>
          <p className="text-xs sm:text-sm text-[var(--cds-text-02)] mt-0.5">{t.nl2sql.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <AIModelSelector compact />
          <span className="carbon-tag-blue uppercase text-[11px]">
            Target: {activeDataset.name}
          </span>
        </div>
      </div>

      {/* Mode Sub-Tabs */}
      <div className="flex border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
        <button
          onClick={() => setActiveSubTab('editor')}
          className={`px-4 py-2.5 text-xs font-mono font-bold uppercase transition-colors flex items-center gap-2 border-b-2 ${
            activeSubTab === 'editor'
              ? 'border-[#0f62fe] text-[#0f62fe] bg-[var(--cds-layer-02)]'
              : 'border-transparent text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{isAr ? 'محرر SQL وتوليد الاستعلام' : 'SQL Generation & 9-Layer Sandbox'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('arena')}
          className={`px-4 py-2.5 text-xs font-mono font-bold uppercase transition-colors flex items-center gap-2 border-b-2 ${
            activeSubTab === 'arena'
              ? 'border-[#0f62fe] text-[#0f62fe] bg-[var(--cds-layer-02)]'
              : 'border-transparent text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#ff832b]" />
          <span>{isAr ? 'حلبة مقارنة النماذج (Model Arena)' : 'Model Arena (Benchmark)'}</span>
          <span className="px-1.5 py-0.2 text-[9px] bg-[#ff832b]/20 text-[#ff832b] border border-[#ff832b]/40">
            Multi-LLM
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('config')}
          className={`px-4 py-2.5 text-xs font-mono font-bold uppercase transition-colors flex items-center gap-2 border-b-2 ${
            activeSubTab === 'config'
              ? 'border-[#0f62fe] text-[#0f62fe] bg-[var(--cds-layer-02)]'
              : 'border-transparent text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)]'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-[#42be65]" />
          <span>{isAr ? 'إعدادات ومزودات النماذج (Model Config)' : 'AI Model Configuration'}</span>
          <span className="px-1.5 py-0.2 text-[9px] bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/40">
            Ollama
          </span>
        </button>
      </div>

      {activeSubTab === 'arena' ? (
        <MultiModelComparisonArena />
      ) : activeSubTab === 'config' ? (
        <ModelConfigPage />
      ) : (
        <>

      {/* NL2SQL Prompt Bar */}
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4 space-y-3">
        <label className="block text-xs font-mono font-bold uppercase text-[var(--cds-text-02)]">
          {t.nl2sql.promptLabel}
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={t.nl2sql.promptPlaceholder}
            className="carbon-input flex-1 text-xs"
            onKeyDown={e => e.key === 'Enter' && handleGenerateSql()}
          />
          <button
            onClick={handleGenerateSql}
            disabled={isGenerating}
            className="carbon-btn-primary gap-2 shrink-0 text-xs font-mono font-bold uppercase"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? t.common.loading : t.nl2sql.generateBtn}</span>
          </button>
        </div>

        {generatedExplanation && (
          <div className="pt-2 border-t border-[var(--cds-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
            <span className="text-[var(--cds-text-02)]">{generatedExplanation}</span>
            {engineModel && (
              <span className="carbon-tag-blue text-[10px] uppercase font-bold shrink-0">
                Engine: {engineModel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Query Presets & Quick Testing Bar */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--cds-text-03)]">
          <TestTube2 className="w-3.5 h-3.5 text-[#0f62fe]" />
          <span>{isAr ? 'نماذج استعلام سريعة للفحص:' : 'Quick Query Scenarios:'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => loadPresetQuery('standard')}
            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] text-[11px] font-mono border border-[var(--cds-border-subtle)] transition-colors"
          >
            {isAr ? 'استعلام قياسي سليم' : 'Standard Aggregation'}
          </button>
          <button
            onClick={() => loadPresetQuery('typo')}
            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[#f1c21b] text-[11px] font-mono border border-[#f1c21b]/30 transition-colors"
            title="Test Typo Auto-Fix"
          >
            {isAr ? 'أخطاء إملائية (فحص المقترحات)' : 'Typo Error Test'}
          </button>
          <button
            onClick={() => loadPresetQuery('missingGroup')}
            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[#ff8389] text-[11px] font-mono border border-[#da1e28]/30 transition-colors"
            title="Test Missing GROUP BY Detection"
          >
            {isAr ? 'تجميع ناقص (GROUP BY)' : 'Missing GROUP BY'}
          </button>
          <button
            onClick={() => loadPresetQuery('orderByMisplaced')}
            className="px-2 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[#be95ff] text-[11px] font-mono border border-[#8a3ffc]/30 transition-colors"
            title="Test Misplaced Clauses"
          >
            {isAr ? 'ترتيب عبارات غير صالح' : 'Clause Order Bug'}
          </button>
        </div>
      </div>

      {/* SMART ERROR SUGGESTIONS BANNER (If syntax or logical errors are detected) */}
      {errorAnalysis && errorAnalysis.hasError && (
        <div className="bg-[var(--cds-layer-02)] border border-[#da1e28] p-4 space-y-3 animate-fade-in shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[#da1e28]/20 border border-[#da1e28] text-[#ff8389] shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#da1e28] text-white font-mono text-[10px] font-bold uppercase">
                    {errorAnalysis.errorCategory}
                  </span>
                  <h4 className="text-xs font-mono font-bold text-[#ff8389] uppercase">
                    {isAr ? 'تم رصد مشكلة في استعلام SQL ومقترحات ذكية للإصلاح' : 'SQL Syntax Issue Detected - Actionable Smart Suggestions'}
                  </h4>
                </div>
                <p className="text-xs font-mono text-[var(--cds-text-01)] leading-relaxed">
                  {isAr ? errorAnalysis.messageAr : errorAnalysis.messageEn}
                </p>
              </div>
            </div>

            {errorAnalysis.suggestions.some(s => s.autoFixAvailable && s.fixedSql) && (
              <button
                onClick={() => applyCorrection(errorAnalysis.suggestions.find(s => s.autoFixAvailable)?.fixedSql)}
                className="px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold uppercase shrink-0 flex items-center gap-1.5 shadow transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>{isAr ? 'تطبيق الإصلاح التلقائي' : 'One-Click Auto-Fix'}</span>
              </button>
            )}
          </div>

          {/* Actionable Suggestions List */}
          {errorAnalysis.suggestions.length > 0 && (
            <div className="pt-2 border-t border-[var(--cds-border-subtle)] space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--cds-text-02)] uppercase">
                <Lightbulb className="w-3.5 h-3.5 text-[#f1c21b]" />
                <span>{isAr ? 'المقترحات والإجراءات التصحيحية الموصى بها:' : 'Smart Correction Recommendations:'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {errorAnalysis.suggestions.map(sug => (
                  <div
                    key={sug.id}
                    className="p-2.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] flex flex-col justify-between transition-colors"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-[var(--cds-text-01)] block">
                        {isAr ? sug.titleAr : sug.title}
                      </span>
                      <p className="text-[11px] font-mono text-[var(--cds-text-03)] mt-0.5 leading-relaxed">
                        {isAr ? sug.explanationAr : sug.explanation}
                      </p>
                    </div>

                    {sug.autoFixAvailable && sug.fixedSql && (
                      <div className="mt-2 pt-2 border-t border-[var(--cds-border-subtle)] flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#42be65]">
                          ✓ {isAr ? 'تصحيح مباشر متاح' : 'Instant Patch Available'}
                        </span>
                        <button
                          onClick={() => applyCorrection(sug.fixedSql)}
                          className="px-2 py-0.5 bg-[var(--cds-layer-03)] hover:bg-[#0f62fe] text-white text-[10px] font-mono flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          <span>{isAr ? 'تطبيق هذا المقترح' : 'Apply Fix'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confidence Score Gauge Component */}
      <ConfidenceScoreGauge score={confidenceScore} />

      {/* SQL Editor & 9-Layer Security Verification Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left SQL Code Console */}
        <div className="lg:col-span-7 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex flex-col justify-between">
          <div className="p-3 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#0f62fe]" />
              <span className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase">
                Synthesized SQL Query
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  try {
                    const formatted = format(sqlCode, { language: 'sql', keywordCase: 'upper' });
                    setSqlCode(formatted);
                  } catch (e) {
                    console.error("Format error", e);
                  }
                }}
                disabled={!sqlCode.trim()}
                className="px-2.5 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 transition-colors"
                title="Format Query"
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>{isAr ? 'تنسيق' : 'Format'}</span>
              </button>

              {/* Optimize Query with Gemini Button */}
              <button
                onClick={handleOptimizeSql}
                disabled={!sqlCode.trim()}
                className="px-2.5 py-1 bg-[#0f62fe]/20 hover:bg-[#0f62fe]/30 border border-[#0f62fe] text-[#78a9ff] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                title="Optimize Query with Gemini AI"
                id="nl2sql-optimize-btn"
              >
                <Zap className="w-3.5 h-3.5 fill-current text-[#78a9ff]" />
                <span>{isAr ? 'تحسين الاستعلام (Gemini)' : 'Optimize Query'}</span>
              </button>

              {/* Export as .sql File Button */}
              <button
                onClick={handleExportSqlFile}
                disabled={!sqlCode.trim()}
                className="px-2.5 py-1 bg-[#24a148]/20 hover:bg-[#24a148]/30 border border-[#24a148] text-[#42be65] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                title={isAr ? 'تصدير وحفظ الاستعلام كملف .sql' : 'Export query as .sql file'}
                id="nl2sql-export-sql-btn"
              >
                <Download className="w-3.5 h-3.5 text-[#42be65]" />
                <span>{isAr ? 'تصدير .sql' : 'Export .sql'}</span>
              </button>

              <button
                onClick={handleCopy}
                className="px-2 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1 transition-colors"
                title="Copy SQL"
                id="nl2sql-copy-btn"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#42be65]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 flex-1">
            <div className={`w-full bg-[var(--cds-layer-01)] border text-xs font-mono outline-none leading-relaxed transition-colors overflow-auto max-h-[300px] ${
                errorAnalysis?.hasError
                  ? 'border-[#da1e28] text-[#ff8389] focus-within:border-[#ff8389]'
                  : 'border-[var(--cds-border-subtle)] focus-within:border-[#0f62fe]'
              }`}>
              <Editor
                value={sqlCode}
                onValueChange={(code) => {
                  setSqlCode(code);
                  setExecutionError(null);
                }}
                highlight={(code) => Prism.highlight(code, Prism.languages.sql, 'sql')}
                padding={12}
                style={{
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  fontSize: 12,
                  minHeight: '100%',
                }}
              />
            </div>
          </div>

          {/* Execution Bar */}
          <div className="p-4 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 uppercase ${
                  validationReport.canExecute && !errorAnalysis?.hasError
                    ? 'bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40'
                    : 'bg-[#da1e28]/20 text-[#ff8389] border border-[#da1e28]/40'
                }`}
              >
                {validationReport.canExecute && !errorAnalysis?.hasError ? 'Safe for Execution' : 'Execution Blocked'}
              </span>
              <span className="text-[11px] font-mono text-[var(--cds-text-03)]">
                Risk: {validationReport.estimatedCost.executionRisk}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSqlFile}
                disabled={!sqlCode.trim()}
                className="px-3 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#42be65]/40 text-[#42be65] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-30"
                title={isAr ? 'تصدير وحفظ كود SQL كملف .sql' : 'Export and save SQL as .sql file'}
                id="nl2sql-bar-export-sql-btn"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تصدير .sql' : 'Export .sql'}</span>
              </button>

              <button
                onClick={handleExecuteSql}
                disabled={!validationReport.canExecute || isExecuting}
                className="carbon-btn-primary gap-2 text-xs font-mono font-bold uppercase disabled:opacity-30"
                id="nl2sql-execute-btn"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${isExecuting ? 'animate-pulse' : ''}`} />
                <span>{isExecuting ? 'Executing...' : t.nl2sql.executeBtn}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 9-Layers Inspection Status + Laser Gate */}
        <div className="lg:col-span-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4 space-y-3">
          {/* 9-Layer Laser Gate — the query as a photon crossing security rings */}
          <div className="rounded-lg overflow-hidden border border-[var(--cds-border-subtle)]">
            <div className="px-3 py-1.5 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                {isAr ? 'البوابة الليزرية — 9 طبقات' : 'Laser Gate — 9 Layers'}
              </span>
              <span className="text-[9px] font-mono text-[var(--cds-text-03)]">
                {isAr ? 'الاستعلام كجسيم ضوئي' : 'query as photon'}
              </span>
            </div>
            <NineLayerLaserGate report={validationReport} runId={gateRunId} language={language} compact />
          </div>
          <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#42be65]" />
<h3 className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase">
  {t.nl2sql.safetyReport}
</h3>
            </div>
            <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {validationReport.layers.filter(l => l.status === 'passed').length}/9 Layers Passed
            </span>
          </div>

          <div className="space-y-1.5 max-h-[340px] overflow-y-auto font-mono text-xs">
            {validationReport.layers.map(layer => {
              const isPassed = layer.status === 'passed';
              const isWarning = layer.status === 'warning';
              return (
                <div
                  key={layer.layer}
                  className={`p-2 border flex items-center justify-between ${
                    isPassed
                      ? 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                      : isWarning
                      ? 'bg-[#f1c21b]/10 border-[#f1c21b]/40 text-[#f1c21b]'
                      : 'bg-[#da1e28]/10 border-[#da1e28] text-[#ff8389]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-[var(--cds-text-03)] w-4">L{layer.layer}</span>
                    <span className="truncate">{language === 'ar' ? layer.nameAr || layer.name : layer.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isPassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65]" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#f1c21b]" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-[#da1e28]" />
                    )}
                    <span className="text-[10px] text-[var(--cds-text-03)] uppercase">{layer.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* D3.js VISUAL SQL EXECUTION PLAN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0f62fe]" />
            <h3 className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase">
              {isAr ? 'خطة المعالجة والتنفيذ لمحرك البيانات (Visual Execution Engine)' : 'Visual SQL Execution Plan (D3 Engine)'}
            </h3>
          </div>

          <button
            onClick={() => setShowPlanVisualizer(!showPlanVisualizer)}
            className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] text-xs font-mono transition-colors"
          >
            {showPlanVisualizer ? (isAr ? 'إخفاء المخطط' : 'Hide Execution Plan') : (isAr ? 'إظهار المخطط التفاعلي' : 'Show Execution Plan')}
          </button>
        </div>

        {showPlanVisualizer && (
          <SqlExecutionPlanVisualizer plan={executionPlan} language={language} />
        )}
      </div>

      {/* Query Execution Result */}
      {queryResult && (
        <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-3 p-4">
          <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase">
                Query Execution Result
              </h3>
              <span className="text-xs font-mono text-[var(--cds-text-03)]">
                {queryResult.totalCount.toLocaleString()} rows returned in {queryResult.executionTimeMs}ms
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSqlFile}
                className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#42be65]/40 text-[#42be65] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                title={isAr ? 'تصدير وحفظ استعلام SQL كملف .sql' : 'Export and save SQL as .sql file'}
                id="nl2sql-result-export-sql-btn"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تصدير .sql' : 'Export .sql'}</span>
              </button>

              <button
                onClick={() => setShowChart(!showChart)}
                className="px-3 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#0f62fe]" />
                <span>{showChart ? 'Show Table' : 'Visualize Chart'}</span>
              </button>
            </div>
          </div>

          {showChart ? (
            <div className="h-72">
              <ChartFactory
                dataset={activeDataset}
                customData={queryResult.rows}
                widget={{
                  id: 'res-chart',
                  title: 'Query Result Visualization',
                  type: 'bar',
                  datasetId: activeDataset.id,
                  xAxis: queryResult.columns[0],
                  yAxis: queryResult.columns[1],
                  w: 12,
                  h: 2,
                }}
              />
            </div>
          ) : (
            <CarbonDataTable
              id="nl2sql-result-table"
              data={queryResult.rows}
              columnMeta={activeDataset.columns}
              maxHeight={320}
              language={language}
              initialPageSize={10}
              title={language === 'ar' ? 'سجلات استعلام SQL' : 'SQL Execution Results'}
            />
          )}
        </div>
      )}

      {/* Optimize Query Modal */}
      <SqlOptimizerModal
        isOpen={isOptimizerOpen}
        onClose={() => setIsOptimizerOpen(false)}
        result={optimizationResult}
        isLoading={isOptimizing}
        onApplyOptimizedSql={optSql => {
          setSqlCode(optSql);
          setExecutionError(null);
        }}
        language={language}
      />
      </>
      )}
    </div>
  );
};

