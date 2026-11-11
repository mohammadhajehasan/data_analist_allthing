import React from 'react';
import { Cpu, Globe, Server, Shield, Sparkles, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ActiveAiBadgeProps {
  className?: string;
  /** يعرض المزوّد فقط عند ضيق المساحة */
  compact?: boolean;
  /** شاشة تختار مزوّداً/نموذجاً خاصاً بها بدل الإعداد النشط العام */
  provider?: string;
  model?: string;
}

/**
 * شارة موحّدة تعرض المزوّد والنموذج النشطين فعلاً.
 * تُستخدم في كل شاشة تُرسل طلباً للخادم بالذكاء الاصطناعي حتى لا يظن
 * المستخدم أن الطلب يذهب إلى مزوّد آخر بينما الشاشة تستعمل إعداداً مختلفاً.
 */
const ActiveAiBadge: React.FC<ActiveAiBadgeProps> = ({ className = '', compact = false, provider: providerOverride, model: modelOverride }) => {
  const { language, aiSettings, activeAIModelDef, availableAIModels } = useApp();
  const isAr = language === 'ar';
  if (!aiSettings) return null;

  const providerId = providerOverride || aiSettings.activeProvider;
  const provider = aiSettings.providers[providerId as keyof typeof aiSettings.providers];
  const providerName = (isAr ? provider?.nameAr : provider?.name) || provider?.name || providerId;
  const modelId = modelOverride || aiSettings.activeModel;
  const modelName =
    availableAIModels.find(candidate => candidate.id === modelId)?.name ||
    (!modelOverride ? activeAIModelDef?.name : undefined) ||
    modelId;
  const isLocal = Boolean(activeAIModelDef?.isLocal || provider?.isLocalOnly);

  const Icon =
    providerId === 'ollama'
      ? Shield
      : providerId === 'gemini'
        ? Sparkles
        : providerId === 'deepseek'
          ? Zap
          : providerId === 'qwen'
            ? Server
            : providerId === 'openrouter'
              ? Globe
              : Cpu;

  const label = isAr
    ? `المزوّد النشط: ${providerName} — النموذج: ${modelName}`
    : `Active provider: ${providerName} — model: ${modelName}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-[280px] px-2 py-1 text-[10px] font-mono border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] ${className}`}
      title={`${label}${isLocal ? (isAr ? ' (محلي)' : ' (local)') : ''}`}
      aria-label={label}
      data-testid="active-ai-badge"
      data-provider={providerId}
      data-model={modelId}
    >
      <Icon className="w-3 h-3 shrink-0 text-[var(--cds-interactive-01)]" aria-hidden="true" />
      {!compact && <span className="truncate">{providerName}</span>}
      <span className="text-[var(--cds-text-03)]" aria-hidden="true">·</span>
      <span className="truncate text-[var(--cds-text-01)]">{modelName}</span>
      {isLocal && (
        <span className="shrink-0 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#42be65] border border-[#42be65]/40 bg-[#42be65]/10">
          {isAr ? 'محلي' : 'Local'}
        </span>
      )}
    </span>
  );
};

export default ActiveAiBadge;
