import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BarChart2,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Activity,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Database,
  CheckCircle,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { CARBON_PALETTE } from '../../components/charts/ChartFactory';

export const ProfilingPage: React.FC = () => {
  const { activeDataset, language, t, aiSettings } = useApp();
  const activeProviderConf = aiSettings.providers[aiSettings.activeProvider];
  const [selectedColumn, setSelectedColumn] = useState<string | null>(
    activeDataset?.columns?.[0]?.name || null
  );
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState<string>(
    activeDataset?.profile?.aiSummary || ''
  );

  const profile = activeDataset?.profile;
  if (!profile) {
    return (
      <div className="carbon-tile p-12 text-center text-[#c6c6c6]">
        <Database className="w-12 h-12 text-[#0f62fe] mx-auto mb-3" />
        <p className="text-sm font-bold">
          {language === 'ar' ? 'لا يوجد توصيف إحصائي لمجموعة البيانات الحالية.' : 'No profiling stats available for active dataset.'}
        </p>
      </div>
    );
  }

  const handleRefreshAiSummary = async () => {
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/profiling/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: activeDataset,
          language,
          provider: aiSettings.activeProvider,
          model: aiSettings.activeModel,
          endpointUrl: activeProviderConf?.endpointUrl,
          apiKey: activeProviderConf?.apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to summarize profiling');
      }
      if (data.summary) {
        setAiSummaryText(data.summary);
      }
    } catch (err) {
      console.error('Failed to summarize profiling:', err);
    } finally {
      setIsSummarizing(false);
    }
  };

  const activeColStats = selectedColumn ? profile.columnStats[selectedColumn] : null;

  return (
    <div className="space-y-6">
      {/* Top Header - IBM Carbon Style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#393939] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              IBM CARBON / STATISTICAL PROFILER
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#f4f4f4] tracking-tight mt-1">{t.profiling.title}</h2>
          <p className="text-xs sm:text-sm text-[#c6c6c6] mt-0.5">
            {language === 'ar' ? `المجموعة: ${activeDataset.name} • ${profile.rowCount.toLocaleString()} صفاً • ${profile.columnCount} حقلاً` : `Dataset: ${activeDataset.name} • ${profile.rowCount.toLocaleString()} rows • ${profile.columnCount} columns`}
          </p>
        </div>

        <button
          onClick={handleRefreshAiSummary}
          disabled={isSummarizing}
          className="carbon-btn-secondary gap-2 text-xs font-mono font-bold uppercase tracking-wider"
        >
          <Sparkles className={`w-3.5 h-3.5 text-[#0f62fe] ${isSummarizing ? 'animate-spin' : ''}`} />
          <span>{isSummarizing ? t.common.loading : language === 'ar' ? 'تحديث التلخيص الذكي' : 'Refresh AI Insights'}</span>
        </button>
      </div>

      {/* AI Profiling Summary Banner - Carbon Callout Style */}
      <div className="p-4 bg-[#262626] border-s-4 border-s-[#0f62fe] border border-[#393939] flex items-start gap-3">
        <div className="w-8 h-8 bg-[#161616] border border-[#393939] flex items-center justify-center text-[#0f62fe] shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-1 flex-1">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#33b1ff]">
            {t.profiling.aiSummaryTitle}
          </h4>
          <p className="text-xs sm:text-sm text-[#f4f4f4] leading-relaxed font-sans">
            {aiSummaryText || profile.aiSummary}
          </p>
        </div>
      </div>

      {/* Quality Score Breakdown & Anomaly Overview - Carbon Tile Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Health Card */}
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.profiling.qualityBadge}</span>
            <ShieldCheck className="w-4 h-4 text-[#42be65]" />
          </div>
          <div className="text-3xl font-black text-[#f4f4f4] font-mono">
            {profile.quality.overallScore}%
          </div>
          <div className="w-full bg-[#161616] h-1.5 border border-[#393939]">
            <div
              className="bg-[#24a148] h-full"
              style={{ width: `${profile.quality.overallScore}%` }}
            />
          </div>
          <div className="text-[11px] text-[#8d8d8d] font-mono flex justify-between">
            <span>Completeness: {profile.quality.completenessScore}%</span>
            <span>Validity: {profile.quality.validityScore}%</span>
          </div>
        </div>

        {/* Total Records */}
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.profiling.totalRows}</span>
            <Database className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div className="text-3xl font-black text-[#f4f4f4] font-mono">
            {profile.rowCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-[#8d8d8d] font-mono">
            {profile.columnCount} columns ingested ({activeDataset.format.toUpperCase()})
          </p>
        </div>

        {/* Null / Missing Values */}
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>Missing / Nulls</span>
            <AlertTriangle className="w-4 h-4 text-[#f1c21b]" />
          </div>
          <div className="text-3xl font-black text-[#f4f4f4] font-mono">
            {Object.values(profile.columnStats).reduce((acc: number, c: any) => acc + (c?.nullCount || 0), 0)}
          </div>
          <p className="text-[11px] text-[#8d8d8d] font-mono">
            Consistency score: {profile.quality.validityScore}%
          </p>
        </div>

        {/* Total Anomalies */}
        <div className="p-4 bg-[#262626] border border-[#393939] space-y-2">
          <div className="flex items-center justify-between text-[#8d8d8d] text-xs font-mono font-semibold uppercase">
            <span>{t.profiling.anomaliesTitle}</span>
            <Activity className="w-4 h-4 text-[#ff8389]" />
          </div>
          <div className="text-3xl font-black text-[#ff8389] font-mono">
            {profile.anomalies.length}
          </div>
          <p className="text-[11px] text-[#8d8d8d] font-mono">
            IQR &amp; Z-score variance outliers
          </p>
        </div>
      </div>

      {/* Column Deep-Dive Analyzer & Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column Selector */}
        <div className="bg-[#262626] border border-[#393939] p-4 space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#c6c6c6] border-b border-[#393939] pb-2 flex items-center justify-between">
            <span>{t.profiling.columnMetrics}</span>
            <span className="text-[10px] text-[#8d8d8d]">{activeDataset.columns.length} columns</span>
          </div>

          <div className="space-y-1 max-h-[480px] overflow-y-auto font-mono text-xs">
            {activeDataset.columns.map(col => {
              const stats = profile.columnStats[col.name];
              const isSelected = selectedColumn === col.name;
              return (
                <button
                  key={col.name}
                  onClick={() => setSelectedColumn(col.name)}
                  className={`w-full text-start p-2.5 flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[#c6c6c6] hover:bg-[#353535]'
                  }`}
                >
                  <div className="truncate">
                    <div className="truncate">{col.name}</div>
                    <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-[#8d8d8d]'}`}>
                      {col.type} • {stats?.uniqueCount ?? 0} distinct
                    </div>
                  </div>
                  {stats && stats.nullCount > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 ${isSelected ? 'bg-black/30' : 'bg-[#da1e28]/20 text-[#ff8389]'}`}>
                      {stats.nullCount} nulls
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column Stats & Distribution */}
        <div className="lg:col-span-2 bg-[#262626] border border-[#393939] p-5 space-y-5">
          {activeColStats ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#393939] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-mono font-bold text-[#f4f4f4]">{selectedColumn}</h3>
                    <span className="carbon-tag-blue uppercase text-[10px]">
                      {activeDataset.columns.find(c => c.name === selectedColumn)?.type}
                    </span>
                  </div>
                  <p className="text-xs text-[#8d8d8d] font-mono mt-0.5">
                    Field profiling &amp; distribution frequency
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-[#c6c6c6]">
                  <span>Distinct: <strong>{activeColStats.uniqueCount}</strong></span>
                  <span>Nulls: <strong>{activeColStats.nullCount} ({activeColStats.nullPercentage}%)</strong></span>
                </div>
              </div>

              {/* Numerical Metrics Summary if applicable */}
              {activeColStats.mean !== undefined && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#161616] border border-[#393939] font-mono">
                    <span className="text-[10px] text-[#8d8d8d] uppercase block">Mean (المتوسط)</span>
                    <span className="text-sm font-bold text-[#f4f4f4]">{activeColStats.mean}</span>
                  </div>
                  <div className="p-3 bg-[#161616] border border-[#393939] font-mono">
                    <span className="text-[10px] text-[#8d8d8d] uppercase block">Median (الوسيط)</span>
                    <span className="text-sm font-bold text-[#f4f4f4]">{activeColStats.median}</span>
                  </div>
                  <div className="p-3 bg-[#161616] border border-[#393939] font-mono">
                    <span className="text-[10px] text-[#8d8d8d] uppercase block">Std Dev (الانحراف)</span>
                    <span className="text-sm font-bold text-[#f4f4f4]">{activeColStats.stdDev}</span>
                  </div>
                  <div className="p-3 bg-[#161616] border border-[#393939] font-mono">
                    <span className="text-[10px] text-[#8d8d8d] uppercase block">Range (المدى)</span>
                    <span className="text-sm font-bold text-[#f4f4f4]">{activeColStats.min} - {activeColStats.max}</span>
                  </div>
                </div>
              )}

              {/* Histogram / Distribution Chart */}
              {activeColStats.histogram && activeColStats.histogram.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-[#c6c6c6] uppercase">
                    Distribution Histogram (توزيع التكرار)
                  </div>
                  <div className="h-56 bg-[#161616] border border-[#393939] p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activeColStats.histogram}>
                        <XAxis
                          dataKey="bin"
                          stroke="#8d8d8d"
                          fontSize={10}
                          fontFamily="IBM Plex Mono, monospace"
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#8d8d8d"
                          fontSize={10}
                          fontFamily="IBM Plex Mono, monospace"
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#161616',
                            borderColor: '#525252',
                            color: '#f4f4f4',
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: '11px',
                          }}
                        />
                        <Bar dataKey="count" fill="#0f62fe" radius={0}>
                          {activeColStats.histogram.map((_, idx) => (
                            <Cell key={`bin-${idx}`} fill={CARBON_PALETTE[idx % CARBON_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Frequent Values */}
              {activeColStats.topValues && activeColStats.topValues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-[#c6c6c6] uppercase">
                    Top Frequent Values (القيم الأكثر تكراراً)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                    {activeColStats.topValues.map((fv, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-[#161616] border border-[#393939] flex items-center justify-between"
                      >
                        <span className="text-[#f4f4f4] truncate">{String(fv.value)}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#0f62fe] font-bold">{fv.count}x</span>
                          <span className="text-[#8d8d8d] text-[10px]">({fv.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-[#8d8d8d] font-mono text-xs">
              Select a column to inspect metrics
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
