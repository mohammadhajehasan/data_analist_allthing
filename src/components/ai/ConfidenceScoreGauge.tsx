import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Info,
  TrendingUp,
  Lock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ConfidenceScoreBreakdown {
  overallScore: number; // 0 - 100
  syntaxValidity: number; // 0 - 100
  schemaAlignment: number; // 0 - 100
  hallucinationRisk: 'low' | 'medium' | 'high';
  executionSafety: number; // 0 - 100
  semanticMatch: number; // 0 - 100
  modelName: string;
  isLocalOnly?: boolean;
  reliabilityVerdict: string;
  reliabilityVerdictAr: string;
  recommendation?: string;
  recommendationAr?: string;
}

interface ConfidenceScoreGaugeProps {
  score: ConfidenceScoreBreakdown;
  compact?: boolean;
  className?: string;
}

export const ConfidenceScoreGauge: React.FC<ConfidenceScoreGaugeProps> = ({
  score,
  compact = false,
  className = '',
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  const getScoreColor = (val: number) => {
    if (val >= 85) return 'text-[#42be65] bg-[#42be65]/10 border-[#42be65]/30';
    if (val >= 70) return 'text-[#78a9ff] bg-[#0f62fe]/10 border-[#0f62fe]/30';
    if (val >= 50) return 'text-[#ff832b] bg-[#ff832b]/10 border-[#ff832b]/30';
    return 'text-[#ff8389] bg-[#da1e28]/10 border-[#da1e28]/30';
  };

  const getBarColor = (val: number) => {
    if (val >= 85) return 'bg-[#42be65]';
    if (val >= 70) return 'bg-[#0f62fe]';
    if (val >= 50) return 'bg-[#ff832b]';
    return 'bg-[#da1e28]';
  };

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-2.5 py-1 border text-xs ${getScoreColor(
          score.overallScore
        )} ${className}`}
        title={isAr ? `درجة موثوقية النموذج: ${score.overallScore}%` : `Confidence Score: ${score.overallScore}%`}
      >
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="font-semibold">{score.overallScore}%</span>
        <span className="text-[10px] opacity-80">
          {isAr ? 'مقياس الثقة' : 'Confidence'}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-[#161616] border border-[#393939] p-4 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#393939] pb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 flex items-center justify-center border ${getScoreColor(score.overallScore)}`}>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-[#f4f4f4] uppercase tracking-wider">
                {isAr ? 'مقياس موثوقية وثقة الاستجابة' : 'Model Response Confidence Score'}
              </h4>
              {score.isLocalOnly && (
                <span className="px-1.5 py-0.2 text-[9px] bg-[#42be65]/20 text-[#42be65] border border-[#42be65]/30 flex items-center gap-1 font-mono">
                  <Lock className="w-2.5 h-2.5" />
                  {isAr ? 'خصوصية محلية 100%' : '100% Local'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8d8d8d]">
              {isAr
                ? `تقييم تقديري لدقة ومطابقة استجابة نموذج (${score.modelName}) مع مخطط البيانات`
                : `Estimated accuracy & schema conformance score for ${score.modelName}`}
            </p>
          </div>
        </div>

        {/* Big Score Gauge */}
        <div className="text-end">
          <div className="text-[10px] text-[#8d8d8d] uppercase">
            {isAr ? 'الدرجة التقديرية' : 'Overall Index'}
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-mono font-bold ${
              score.overallScore >= 85 ? 'text-[#42be65]' : score.overallScore >= 70 ? 'text-[#78a9ff]' : 'text-[#ff832b]'
            }`}>
              {score.overallScore}%
            </span>
          </div>
        </div>
      </div>

      {/* Primary Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#c6c6c6] font-medium">
            {isAr ? score.reliabilityVerdictAr : score.reliabilityVerdict}
          </span>
          <span className="text-[#8d8d8d] text-[11px] font-mono">
            {score.overallScore >= 85
              ? (isAr ? 'موثوقية عالية جداً' : 'High Reliability')
              : score.overallScore >= 70
              ? (isAr ? 'موثوقية جيدة' : 'Moderate Reliability')
              : (isAr ? 'يوصى بالمراجعة' : 'Review Recommended')}
          </span>
        </div>
        <div className="w-full h-2 bg-[#262626] border border-[#393939] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getBarColor(score.overallScore)}`}
            style={{ width: `${score.overallScore}%` }}
          />
        </div>
      </div>

      {/* Dimensional Breakdown Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* 1. Syntax */}
        <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
          <div className="text-[10px] text-[#8d8d8d] uppercase">
            {isAr ? 'صحة صياغة الـ SQL' : 'Syntax Validity'}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#42be65]">{score.syntaxValidity}%</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65]" />
          </div>
        </div>

        {/* 2. Schema Alignment */}
        <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
          <div className="text-[10px] text-[#8d8d8d] uppercase">
            {isAr ? 'تطابق أسماء الأعمدة' : 'Schema Alignment'}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#78a9ff]">{score.schemaAlignment}%</span>
            <Cpu className="w-3.5 h-3.5 text-[#78a9ff]" />
          </div>
        </div>

        {/* 3. Hallucination Risk */}
        <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
          <div className="text-[10px] text-[#8d8d8d] uppercase">
            {isAr ? 'مخاطر الهلوسة' : 'Hallucination Risk'}
          </div>
          <div className="flex items-center justify-between">
            <span className={`font-mono text-xs font-bold ${
              score.hallucinationRisk === 'low' ? 'text-[#42be65]' : score.hallucinationRisk === 'medium' ? 'text-[#ff832b]' : 'text-[#ff8389]'
            }`}>
              {score.hallucinationRisk === 'low'
                ? (isAr ? 'منخفضة (آمن)' : 'Low (Safe)')
                : score.hallucinationRisk === 'medium'
                ? (isAr ? 'متوسطة' : 'Medium')
                : (isAr ? 'مرتفعة' : 'High')}
            </span>
            <AlertTriangle className={`w-3.5 h-3.5 ${
              score.hallucinationRisk === 'low' ? 'text-[#42be65]' : 'text-[#ff832b]'
            }`} />
          </div>
        </div>

        {/* 4. Execution Safety */}
        <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
          <div className="text-[10px] text-[#8d8d8d] uppercase">
            {isAr ? 'أمان التنفيذ (9-طبقات)' : '9-Layer Safety'}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#78a9ff]">{score.executionSafety}%</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#78a9ff]" />
          </div>
        </div>
      </div>

      {/* Model Recommendation Hint */}
      {(score.recommendation || score.recommendationAr) && (
        <div className="p-2.5 bg-[#262626] border border-[#393939] flex items-start gap-2 text-xs text-[#c6c6c6]">
          <Info className="w-4 h-4 text-[#78a9ff] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#f4f4f4]">
              {isAr ? 'توصية النظام لتحسين الثقة: ' : 'Recommendation: '}
            </span>
            <span>{isAr ? score.recommendationAr : score.recommendation}</span>
          </div>
        </div>
      )}
    </div>
  );
};
