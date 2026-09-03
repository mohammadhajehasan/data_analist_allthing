import React, { useState } from 'react';
import { SqlOptimizationResult } from '../../types';
import {
  Sparkles,
  Zap,
  Check,
  Copy,
  ArrowRight,
  Database,
  ShieldAlert,
  Sliders,
  X,
  Code2,
  ListChecks,
} from 'lucide-react';

interface SqlOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: SqlOptimizationResult | null;
  isLoading: boolean;
  onApplyOptimizedSql: (sql: string) => void;
  language?: 'ar' | 'en';
}

export const SqlOptimizerModal: React.FC<SqlOptimizerModalProps> = ({
  isOpen,
  onClose,
  result,
  isLoading,
  onApplyOptimizedSql,
  language = 'ar',
}) => {
  const [copiedIndexDdl, setCopiedIndexDdl] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'diff' | 'indexes' | 'notes'>('diff');

  if (!isOpen) return null;

  const isAr = language === 'ar';

  const handleCopyDdl = (ddl: string) => {
    navigator.clipboard.writeText(ddl);
    setCopiedIndexDdl(ddl);
    setTimeout(() => setCopiedIndexDdl(null), 2000);
  };

  const handleCopyOptimizedSql = () => {
    if (!result?.optimizedSql) return;
    navigator.clipboard.writeText(result.optimizedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#262626] border border-[#393939] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 bg-[#1f1f1f] border-b border-[#393939] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#78a9ff]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                  {isAr ? `مُحسّن استعلامات SQL الذكي (${result?.model || 'AI Engine'})` : `AI SQL Query Optimizer (${result?.model || 'AI Engine'})`}
                </h3>
                {result?.estimatedSpeedup && (
                  <span className="px-2 py-0.5 bg-[#24a148]/20 border border-[#24a148]/40 text-[#42be65] text-[10px] font-mono font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-current" />
                    <span>{result.estimatedSpeedup}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#c6c6c6] mt-0.5">
                {isAr
                  ? 'تحليل عميق لأداء الاستعلام، توصيات الفهرسة، وإعادة الهيكلة للتنفيذ فائق السرعة'
                  : 'Deep execution plan analysis, index recommendations, and vector optimization'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#393939] text-[#c6c6c6] hover:text-[#f4f4f4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <div className="inline-block p-4 bg-[#161616] border border-[#393939] animate-pulse">
                <Sparkles className="w-8 h-8 text-[#0f62fe] animate-spin mx-auto" />
              </div>
              <h4 className="text-sm font-mono font-bold text-[#f4f4f4]">
                {isAr ? 'جاري فحص الاستعلام واقتراح التحسينات عبر نموذج الذكاء الاصطناعي...' : 'Analyzing Query & Synthesizing Optimizations with AI Engine...'}
              </h4>
              <p className="text-xs font-mono text-[#8d8d8d]">
                {isAr ? 'فحص تمرير شروط التصفية، فهارس B-Tree، وإدارة الذاكرة' : 'Evaluating Predicate Pushdown, B-Tree Indexes & SIMD Buffers'}
              </p>
            </div>
          ) : result ? (
            <>
              {/* Summary Banner */}
              <div className="bg-[#161616] border border-[#393939] p-3 flex items-start gap-3">
                <Zap className="w-5 h-5 text-[#f1c21b] shrink-0 mt-0.5" />
                <div className="text-xs font-mono leading-relaxed">
                  <span className="font-bold text-[#f4f4f4] block mb-0.5">
                    {isAr ? 'ملخص التحسينات الهيكلية:' : 'Optimization Audit Summary:'}
                  </span>
                  <p className="text-[#c6c6c6]">
                    {isAr ? result.summaryAr || result.summaryEn : result.summaryEn}
                  </p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#393939] gap-1 bg-[#1f1f1f] p-1">
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    activeTab === 'diff'
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[#c6c6c6] hover:bg-[#393939]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'مقارنة الاستعلام (Before / After)' : 'SQL Comparison (Diff)'}</span>
                </button>
                <button
                  onClick={() => setActiveTab('indexes')}
                  className={`px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    activeTab === 'indexes'
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[#c6c6c6] hover:bg-[#393939]'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{isAr ? `توصيات الفهرسة (${result.indexingRecommendations.length})` : `Indexes (${result.indexingRecommendations.length})`}</span>
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    activeTab === 'notes'
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[#c6c6c6] hover:bg-[#393939]'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{isAr ? 'ملاحظات إعادة الهيكلة' : 'Refactoring Notes'}</span>
                </button>
              </div>

              {/* TAB 1: Diff / Side-by-Side */}
              {activeTab === 'diff' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original SQL */}
                  <div className="bg-[#161616] border border-[#393939] flex flex-col">
                    <div className="p-2 bg-[#1f1f1f] border-b border-[#393939] flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase text-[#8d8d8d]">
                        {isAr ? 'الاستعلام الأصلي' : 'Original Query'}
                      </span>
                    </div>
                    <pre className="p-3 text-xs font-mono text-[#8d8d8d] overflow-x-auto whitespace-pre-wrap leading-relaxed flex-1">
                      {result.originalSql}
                    </pre>
                  </div>

                  {/* Optimized SQL */}
                  <div className="bg-[#161616] border border-[#0f62fe] flex flex-col">
                    <div className="p-2 bg-[#0f62fe]/10 border-b border-[#0f62fe] flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase text-[#78a9ff] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isAr ? 'الاستعلام المُحسّن' : 'Optimized Query'}</span>
                      </span>
                      <button
                        onClick={handleCopyOptimizedSql}
                        className="px-2 py-0.5 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[10px] font-mono flex items-center gap-1 transition-colors"
                      >
                        {copiedSql ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSql ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="p-3 text-xs font-mono text-[#33b1ff] overflow-x-auto whitespace-pre-wrap leading-relaxed flex-1">
                      {result.optimizedSql}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 2: Indexing Recommendations */}
              {activeTab === 'indexes' && (
                <div className="space-y-3">
                  {result.indexingRecommendations.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-[#8d8d8d] bg-[#161616] border border-[#393939]">
                      {isAr ? 'لا توجد فهارس إضافية مطلوبة لهذا الاستعلام.' : 'No additional indexes required for this query pattern.'}
                    </div>
                  ) : (
                    result.indexingRecommendations.map((idx, i) => (
                      <div key={i} className="bg-[#161616] border border-[#393939] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#8a3ffc]/20 border border-[#8a3ffc]/40 text-[#be95ff] text-[10px] font-mono font-bold">
                              {idx.indexType} INDEX
                            </span>
                            <span className="text-xs font-mono font-bold text-[#f4f4f4]">
                              Target: {idx.table}.{idx.column}
                            </span>
                          </div>

                          <button
                            onClick={() => handleCopyDdl(idx.ddl)}
                            className="px-2 py-1 bg-[#393939] hover:bg-[#4c4c4c] text-white text-xs font-mono flex items-center gap-1 transition-colors"
                          >
                            {copiedIndexDdl === idx.ddl ? (
                              <Check className="w-3 h-3 text-[#42be65]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedIndexDdl === idx.ddl ? 'Copied DDL' : 'Copy DDL'}</span>
                          </button>
                        </div>

                        <div className="p-2 bg-[#0f141c] border border-[#26354a]">
                          <code className="text-xs font-mono text-[#78a9ff]">{idx.ddl}</code>
                        </div>

                        <p className="text-xs text-[#c6c6c6] font-mono leading-relaxed">
                          {isAr ? idx.reasonAr || idx.reasonEn : idx.reasonEn}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: Refactoring Notes & Anti-Patterns */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  {/* Anti-Patterns */}
                  {result.antiPatternsDetected && result.antiPatternsDetected.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-mono font-bold uppercase text-[#ff8389] flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-[#da1e28]" />
                        <span>{isAr ? 'الأنماط غير المرغوبة المرصودة' : 'Anti-Patterns Detected'}</span>
                      </h5>
                      <div className="space-y-2">
                        {result.antiPatternsDetected.map((ap, i) => (
                          <div key={i} className="p-3 bg-[#da1e28]/10 border border-[#da1e28]/40 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-[#ff8389]">
                                {isAr ? ap.patternAr || ap.pattern : ap.pattern}
                              </span>
                              <span className="text-[10px] font-mono uppercase bg-[#da1e28] text-white px-1.5 py-0.5">
                                {ap.severity}
                              </span>
                            </div>
                            <p className="text-xs text-[#f4f4f4] font-mono">
                              <span className="text-[#8d8d8d]">{isAr ? 'الحل المطبق: ' : 'Fix: '}</span>
                              {isAr ? ap.fixAr || ap.fix : ap.fix}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Refactoring Notes */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-mono font-bold uppercase text-[#f4f4f4] flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-[#0f62fe]" />
                      <span>{isAr ? 'تفاصيل التحسينات التقنية' : 'Refactoring Actions Taken'}</span>
                    </h5>
                    <div className="space-y-2">
                      {result.refactoringNotes.map((note, i) => (
                        <div key={i} className="p-3 bg-[#161616] border border-[#393939] space-y-1">
                          <span className="text-xs font-mono font-bold text-[#33b1ff]">
                            {isAr ? note.categoryAr || note.category : note.category}
                          </span>
                          <p className="text-xs text-[#c6c6c6] font-mono leading-relaxed">
                            {isAr ? note.noteAr || note.noteEn : note.noteEn}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-[#1f1f1f] border-t border-[#393939] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-xs font-mono transition-colors"
          >
            {isAr ? 'إلغاء / إغلاق' : 'Close'}
          </button>

          {result?.optimizedSql && (
            <button
              onClick={() => {
                onApplyOptimizedSql(result.optimizedSql);
                onClose();
              }}
              className="carbon-btn-primary gap-2 text-xs font-mono font-bold uppercase"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isAr ? 'تطبيق الاستعلام المُحسّن على المحرر' : 'Apply Optimized SQL to Editor'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
