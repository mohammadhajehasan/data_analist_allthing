import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sparkles,
  Zap,
  Terminal,
  Database,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Layers,
  Cpu,
  CheckCircle2,
  FileText,
  Bot,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { setActiveTab, language, t } = useApp();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section - IBM Carbon Style */}
      <section className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-6 sm:p-10 relative">
        <div className="max-w-4xl space-y-5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[#0f62fe] text-xs font-mono font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.landing.badge}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-[var(--cds-text-01)] tracking-tight leading-tight">
            {t.landing.heroTitle}
          </h1>

          <p className="text-sm sm:text-base text-[var(--cds-text-02)] leading-relaxed max-w-3xl font-sans">
            {t.landing.heroSubtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('datasets')}
              className="carbon-btn-primary text-xs uppercase font-mono font-bold tracking-wider"
            >
              <span>{t.landing.exploreDemo}</span>
              <ArrowIcon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setActiveTab('nl2sql')}
              className="carbon-btn-secondary text-xs uppercase font-mono font-bold tracking-wider"
            >
              <Terminal className="w-3.5 h-3.5 text-[#0f62fe]" />
              <span>{t.landing.viewNl2sql}</span>
            </button>
          </div>
        </div>

        {/* Carbon Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[var(--cds-border-subtle)]">
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
            <div className="text-2xl font-bold text-[#0f62fe] font-mono">100K+</div>
            <div className="text-[11px] text-[var(--cds-text-03)] font-mono mt-0.5">{t.landing.stats.datasets}</div>
          </div>
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
            <div className="text-2xl font-bold text-[#33b1ff] font-mono">&lt; 5ms</div>
            <div className="text-[11px] text-[var(--cds-text-03)] font-mono mt-0.5">{t.landing.stats.speed}</div>
          </div>
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
            <div className="text-2xl font-bold text-[#42be65] font-mono">9 Layers</div>
            <div className="text-[11px] text-[var(--cds-text-03)] font-mono mt-0.5">{t.landing.stats.layers}</div>
          </div>
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
            <div className="text-2xl font-bold text-[#be95ff] font-mono">99.4%</div>
            <div className="text-[11px] text-[var(--cds-text-03)] font-mono mt-0.5">{t.landing.stats.accuracy}</div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--cds-text-01)] tracking-tight">
            {t.landing.featuresTitle}
          </h2>
          <p className="text-xs text-[var(--cds-text-03)] mt-0.5 font-mono">
            {language === 'ar' ? 'معمارية متكاملة مصممة لفرق البيانات والمحللين وصناع القرار' : 'Production-grade stack built for data engineers, analysts and leaders'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => setActiveTab('explorer')}
            className="p-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] transition-colors cursor-pointer space-y-3"
          >
            <div className="w-9 h-9 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe]">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--cds-text-01)]">{t.landing.features.olap.title}</h3>
            <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
              {t.landing.features.olap.desc}
            </p>
          </div>

          <div
            onClick={() => setActiveTab('nl2sql')}
            className="p-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] transition-colors cursor-pointer space-y-3"
          >
            <div className="w-9 h-9 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe]">
              <Terminal className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--cds-text-01)]">{t.landing.features.nl2sql.title}</h3>
            <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
              {t.landing.features.nl2sql.desc}
            </p>
          </div>

          <div
            onClick={() => setActiveTab('profiling')}
            className="p-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] transition-colors cursor-pointer space-y-3"
          >
            <div className="w-9 h-9 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe]">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--cds-text-01)]">{t.landing.features.profiling.title}</h3>
            <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
              {t.landing.features.profiling.desc}
            </p>
          </div>

          <div
            onClick={() => setActiveTab('assistant')}
            className="p-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] transition-colors cursor-pointer space-y-3"
          >
            <div className="w-9 h-9 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe]">
              <Bot className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--cds-text-01)]">{t.landing.features.ai.title}</h3>
            <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
              {t.landing.features.ai.desc}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
