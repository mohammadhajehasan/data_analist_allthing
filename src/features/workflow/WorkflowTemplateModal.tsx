import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Layers, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Search, 
  Clock, 
  ShieldCheck, 
  Wand2, 
  FileText, 
  TrendingUp, 
  Database, 
  AlertTriangle,
  Zap,
  Play
} from 'lucide-react';
import { WorkflowTemplateItem, WORKFLOW_TEMPLATES } from './WorkflowTemplates';
import { WorkflowDefinition } from './types';

interface WorkflowTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: WorkflowTemplateItem) => void;
  activeTemplateId?: string;
  isAr?: boolean;
}

export const WorkflowTemplateModal: React.FC<WorkflowTemplateModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  activeTemplateId,
  isAr = true,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = useMemo(() => [
    { id: 'all', label: isAr ? 'جميع القوالب' : 'All Templates', count: WORKFLOW_TEMPLATES.length },
    { id: 'cleaning', label: isAr ? 'تنظيف وتحليل البيانات' : 'Data Cleaning', icon: Wand2 },
    { id: 'reporting', label: isAr ? 'تقارير دورية وتنفيذية' : 'Executive Reporting', icon: FileText },
    { id: 'etl', label: isAr ? 'تحويل وتصفية البيانات' : 'ETL & Transformation', icon: Database },
    { id: 'alerts', label: isAr ? 'كشف الشذوذ والإنذار' : 'Anomaly & Alerts', icon: AlertTriangle },
    { id: 'privacy', label: isAr ? 'حماية الخصوصية (Zero-Egress)' : 'Privacy & Compliance', icon: ShieldCheck },
    { id: 'forecasting', label: isAr ? 'تنبؤات واتجاهات النمو' : 'AI Forecasting', icon: TrendingUp },
  ], [isAr]);

  const filteredTemplates = useMemo(() => {
    return WORKFLOW_TEMPLATES.filter((tpl) => {
      const matchCat = selectedCategory === 'all' || tpl.category === selectedCategory;
      const matchQuery =
        searchQuery === '' ||
        tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpl.nameAr.includes(searchQuery) ||
        tpl.descriptionAr.includes(searchQuery) ||
        tpl.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpl.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="p-5 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {isAr ? 'مكتبة القوالب الجاهزة لسلاسل الأتمتة' : 'Workflow Templates Library'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#0f62fe]/20 text-[#78a9ff] border border-[#0f62fe]/30">
                  {WORKFLOW_TEMPLATES.length} {isAr ? 'قوالب معتمدة' : 'Verified Templates'}
                </span>
              </div>
              <p className="text-xs text-[var(--cds-text-02)] mt-0.5">
                {isAr
                  ? 'اختر من بين سلاسل العمل الذكية سابقة الإعداد للمهام الشائعة للبدء فوراً بنقرة واحدة'
                  : 'Select from pre-configured production workflows for common analytics, cleaning, and reporting tasks'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)] rounded-lg transition-colors"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Categories Tab Pill */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === c.id
                    ? 'bg-[#0f62fe] text-white font-bold shadow-md'
                    : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)]'
                }`}
              >
                {c.icon && <c.icon className="w-3.5 h-3.5" />}
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 md:flex-initial">
            <Search className={`w-4 h-4 text-[var(--cds-text-03)] absolute top-1/2 -translate-y-1/2 ${isAr ? 'right-3' : 'left-3'}`} />
            <input
              type="text"
              placeholder={isAr ? 'بحث في القوالب والمهام...' : 'Search templates...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg py-1.5 text-xs text-white placeholder-[#8d8d8d] focus:outline-none focus:border-[#0f62fe] ${
                isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'
              }`}
            />
          </div>
        </div>

        {/* Templates Grid / Gallery */}
        <div className="flex-1 overflow-y-auto p-5 bg-[var(--cds-background)]">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-16 text-[var(--cds-text-03)] space-y-2">
              <Layers className="w-10 h-10 mx-auto opacity-40 text-[#0f62fe]" />
              <p className="text-sm">{isAr ? 'لم يتم العثور على قوالب تطابق معايير البحث.' : 'No templates match your search criteria.'}</p>
              <button
                onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                className="text-xs text-[#78a9ff] hover:underline"
              >
                {isAr ? 'إعادة ضبط التصفية' : 'Reset filters'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((template) => {
                const isActive = template.id === activeTemplateId;
                const steps = isAr ? template.stepSummaryAr : template.stepSummaryEn;

                return (
                  <div
                    key={template.id}
                    className={`p-4 rounded-lg border transition-all duration-200 flex flex-col justify-between group ${
                      isActive
                        ? 'bg-[#0f62fe]/10 border-[#0f62fe] shadow-[0_0_20px_rgba(15,98,254,0.25)]'
                        : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] hover:bg-[var(--cds-layer-02)]'
                    }`}
                  >
                    <div>
                      {/* Card Header & Badges */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30">
                              {isAr ? template.categoryAr : template.category}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[var(--cds-layer-03)] text-[var(--cds-text-02)]">
                              {isAr ? template.difficulty : template.difficultyEn}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--cds-text-03)]">
                              <Clock className="w-3 h-3 text-[#42be65]" />
                              {template.estimatedTime}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white group-hover:text-[#78a9ff] transition-colors leading-snug">
                            {isAr ? template.nameAr : template.name}
                          </h3>
                        </div>

                        {isActive && (
                          <span className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {isAr ? 'محمّل حالياً' : 'Current'}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-[var(--cds-text-02)] leading-relaxed mb-3">
                        {isAr ? template.descriptionAr : template.description}
                      </p>

                      {/* Visual Steps Chain */}
                      <div className="mb-3.5 p-2.5 bg-[var(--cds-layer-01)] rounded-lg border border-[var(--cds-border-subtle)]">
                        <span className="text-[10px] font-mono text-[var(--cds-text-03)] block mb-1.5 font-bold">
                          {isAr ? 'تسلسل خطوات ومسار السلسلة:' : 'Pipeline Execution Steps:'}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {steps.map((step, idx) => (
                            <React.Fragment key={idx}>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)]">
                                {step}
                              </span>
                              {idx < steps.length - 1 && (
                                isAr ? <ArrowLeft className="w-3 h-3 text-[#0f62fe] shrink-0" /> : <ArrowRight className="w-3 h-3 text-[#0f62fe] shrink-0" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-4">
                        {template.tags.map((tag, i) => (
                          <span key={i} className="text-[10px] font-mono text-[var(--cds-text-03)] bg-[var(--cds-layer-02)] px-2 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer Button */}
                    <div className="pt-3 border-t border-[var(--cds-border-subtle)]/70 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-mono text-[var(--cds-text-03)]">
                        <span>{template.nodes.length} {isAr ? 'عقد' : 'nodes'}</span>
                        <span className="mx-1.5">•</span>
                        <span>{template.edges.length} {isAr ? 'روابط' : 'links'}</span>
                      </div>

                      <button
                        onClick={() => {
                          onSelectTemplate(template);
                          onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[var(--cds-layer-02)] text-white hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-strong)]'
                            : 'bg-[#0f62fe] hover:bg-[#0353e9] text-white shadow-md'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{isAr ? 'استخدام وتطبيق القالب' : 'Use This Template'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer Tip */}
        <div className="p-3.5 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between px-5 text-xs text-[var(--cds-text-02)] shrink-0 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#78a9ff]">💡 {isAr ? 'تلميح ذكي:' : 'Pro Tip:'}</span>
            <span>{isAr ? 'يمكنك دائماً تعديل وتوصيل العقد وإضافة مراحل جديدة بعد تحميل أي قالب.' : 'You can customize, connect, or add more nodes freely after loading any template.'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] text-xs transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
