import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  X,
  RefreshCw,
  Sliders,
  CheckCircle2,
  HelpCircle,
  BarChart2,
} from 'lucide-react';
import { ModelExplanationRequest, ModelExplanationResult } from '../../types';

export const ExplainModelModal: React.FC = () => {
  const {
    isExplainModalOpen,
    setIsExplainModalOpen,
    activeExplainRequest,
    explainModel,
    language,
    activeAIModelDef,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<ModelExplanationResult | null>(null);

  const defaultReq: ModelExplanationRequest = activeExplainRequest || {
    modelName: 'نموذج الانحدار الخطي متعدد المتغيرات',
    modelType: 'Linear Regression (OLS)',
    targetColumn: 'المبيعات الإجمالية (Total Sales)',
    features: ['ميزانية التسويق (Marketing)', 'عدد العملاء النشطين (Active Customers)', 'معدل الخصم (Discount Rate)'],
    metrics: {
      r2: 0.914,
      rmse: 1420.5,
      mae: 980.2,
    },
    coefficients: {
      'Marketing': 4.28,
      'Active Customers': 18.5,
      'Discount Rate': -320.0,
    },
    decisionContext: 'تحليل جدوى توزيع الميزانية الترويجية للفترة القادمة.',
  };

  useEffect(() => {
    if (isExplainModalOpen) {
      loadExplanation();
    }
  }, [isExplainModalOpen, activeExplainRequest]);

  const loadExplanation = async () => {
    setLoading(true);
    try {
      const res = await explainModel(defaultReq);
      setExplanation(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isExplainModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-3xl bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        id="explain-model-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#8a3ffc]/15 text-[#8a3ffc]">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <span>{language === 'ar' ? 'تفسير النموذج الإحصائي والذكائي' : 'Explain Model Decision Engine'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#8a3ffc]/20 text-[#be95ff] font-mono">
                  {activeAIModelDef?.name || 'AI Copilot'}
                </span>
              </h3>
              <p className="text-xs text-[var(--cds-text-03)]">
                {language === 'ar'
                  ? 'ترجمة المعاملات الرياضية والقرارات التنبؤية إلى لغة بشرية واضحة وتوصيات قابلة للتنفيذ'
                  : 'Interpret mathematical coefficients and ML predictions into actionable insights'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsExplainModalOpen(false)}
            className="p-1.5 text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Target Model Meta Strip */}
          <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[var(--cds-text-03)] block">{language === 'ar' ? 'النموذج:' : 'Model:'}</span>
              <span className="font-semibold text-white">{defaultReq.modelName}</span>
            </div>
            <div>
              <span className="text-[var(--cds-text-03)] block">{language === 'ar' ? 'المتغير التابع:' : 'Target:'}</span>
              <span className="font-semibold text-[#0f62fe]">{defaultReq.targetColumn}</span>
            </div>
            <div>
              <span className="text-[var(--cds-text-03)] block">{language === 'ar' ? 'معامل التحديد R²:' : 'R² Score:'}</span>
              <span className="font-mono font-bold text-emerald-400">
                {((defaultReq.metrics.r2 ?? 0.88) * 100).toFixed(1)}%
              </span>
            </div>
            <button
              onClick={loadExplanation}
              disabled={loading}
              className="px-3 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-white rounded text-xs flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#8a3ffc]' : ''}`} />
              <span>{language === 'ar' ? 'إعادة التفسير' : 'Re-explain'}</span>
            </button>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Sparkles className="w-8 h-8 text-[#8a3ffc] animate-pulse" />
              <p className="text-sm font-semibold text-white">
                {language === 'ar' ? 'جاري تحليل الأوزان وبناء التفسير الإحصائي...' : 'Analyzing coefficients & generating explanation...'}
              </p>
              <p className="text-xs text-[var(--cds-text-03)]">
                {language === 'ar' ? 'يتم تفسير العلاقات الخطية ومستويات الدلالة' : 'Computing key drivers, confidence intervals, and what-if cases'}
              </p>
            </div>
          ) : explanation ? (
            <div className="space-y-5">
              {/* Executive Summary Card */}
              <div className="p-4 bg-[var(--cds-layer-02)] border-s-4 border-s-[#8a3ffc]">
                <h4 className="text-sm font-bold text-white mb-1.5">
                  {language === 'ar' ? explanation.headlineAr : explanation.headline}
                </h4>
                <p className="text-xs text-[var(--cds-text-01)] leading-relaxed">
                  {language === 'ar' ? explanation.plainLanguageSummaryAr : explanation.plainLanguageSummary}
                </p>
              </div>

              {/* Key Drivers (Feature Importance & Direct Interpretations) */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--cds-text-02)] uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#0f62fe]" />
                  <span>{language === 'ar' ? 'المحركات الأساسية وتأثير المتغيرات' : 'Key Drivers & Feature Impact'}</span>
                </h4>

                <div className="space-y-2">
                  {explanation.keyDriversExplanation.map((driver, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{driver.feature}</span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              driver.impact === 'positive'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                : 'bg-red-950/60 text-red-400 border border-red-800'
                            }`}
                          >
                            {driver.impact === 'positive' ? '+ أثر إيجابي' : '- أثر سلبي'}
                          </span>
                          <span className="text-[10px] text-[var(--cds-text-03)] uppercase">
                            {driver.strength}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--cds-text-02)]">
                          {language === 'ar' ? driver.interpretationAr : driver.interpretation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Statistical Reliability & Confidence */}
              <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                <h4 className="text-xs font-semibold text-[var(--cds-text-02)] uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{language === 'ar' ? 'الموثوقية الإحصائية والقيود' : 'Statistical Reliability & Verification'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">{language === 'ar' ? 'التقييم الإحصائي' : 'Verdict'}</span>
                    <span className="text-sm font-bold text-white">
                      {language === 'ar' ? explanation.statisticalReliability.verdictAr : explanation.statisticalReliability.verdict}
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">{language === 'ar' ? 'مستوى الثقة' : 'Confidence Level'}</span>
                    <span className="text-sm font-mono text-emerald-400">
                      {language === 'ar' ? explanation.statisticalReliability.confidenceLevelAr : explanation.statisticalReliability.confidenceLevel}
                    </span>
                  </div>
                </div>

                {explanation.statisticalReliability.risksOrBiases && (
                  <div className="space-y-1">
                    <span className="text-[11px] text-[var(--cds-text-03)] block font-medium">
                      {language === 'ar' ? 'تنبيهات وملاحظات العينة:' : 'Data & Model Caveats:'}
                    </span>
                    {explanation.statisticalReliability.risksOrBiases.map((risk, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-[var(--cds-text-02)]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{risk}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actionable Insights */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--cds-text-02)] uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span>{language === 'ar' ? 'التوصيات والقرارات المقترحة' : 'Actionable Recommendations'}</span>
                </h4>
                <div className="space-y-2">
                  {(language === 'ar' ? explanation.actionableInsightsAr : explanation.actionableInsights).map(
                    (insight, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[var(--cds-layer-02)] border-s-4 border-s-amber-400 text-xs text-white flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{insight}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* What-If Simulation Scenarios */}
              {explanation.whatIfScenarios && explanation.whatIfScenarios.length > 0 && (
                <div className="p-3.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                  <h4 className="text-xs font-semibold text-[#009d9a] mb-2 flex items-center gap-2">
                    <Sliders className="w-4 h-4" />
                    <span>{language === 'ar' ? 'محاكاة ماذا لو (What-If Scenario)' : 'What-If Simulation'}</span>
                  </h4>
                  {explanation.whatIfScenarios.map((sc, idx) => (
                    <div key={idx} className="text-xs space-y-1">
                      <p className="text-[var(--cds-text-01)] font-medium">
                        {language === 'ar' ? sc.changeAr : sc.change}
                      </p>
                      <p className="text-emerald-400 font-mono text-[11px]">
                        ➔ {language === 'ar' ? sc.expectedEffectAr : sc.expectedEffect}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <button
            onClick={() => setIsExplainModalOpen(false)}
            className="px-4 py-2 text-xs font-medium text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)] transition"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
