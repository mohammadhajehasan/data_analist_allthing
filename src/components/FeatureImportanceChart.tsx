import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
  CartesianGrid
} from 'recharts';
import {
  Award,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Sparkles,
  Info,
  Layers,
  Scale
} from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

export interface FeatureImportanceItem {
  name: string;
  percentage: number;
  beta: number; // Standardized coefficient
  rawCoefficient?: number;
  direction: 'positive' | 'negative';
  power?: number;
}

export interface FeatureImportanceChartProps {
  features: FeatureImportanceItem[];
  modelType: string;
  targetName?: string;
  language?: 'ar' | 'en';
  isDark?: boolean;
}

export const FeatureImportanceChart: React.FC<FeatureImportanceChartProps> = ({
  features,
  modelType,
  targetName = 'Target (Y)',
  language = 'ar',
  isDark = true,
}) => {
  const [sortBy, setSortBy] = useState<'desc' | 'asc' | 'alpha'>('desc');
  const [displayMetric, setDisplayMetric] = useState<'percentage' | 'beta'>('percentage');

  // Sorted items
  const sortedFeatures = useMemo(() => {
    const items = [...features];
    if (sortBy === 'desc') {
      return items.sort((a, b) => b.percentage - a.percentage);
    } else if (sortBy === 'asc') {
      return items.sort((a, b) => a.percentage - b.percentage);
    } else {
      return items.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [features, sortBy]);

  // Find top driver
  const topDriver = useMemo(() => {
    if (!features.length) return null;
    return [...features].sort((a, b) => b.percentage - a.percentage)[0];
  }, [features]);

  // Counts of positive and negative drivers
  const stats = useMemo(() => {
    const positiveCount = features.filter((f) => f.direction === 'positive').length;
    const negativeCount = features.filter((f) => f.direction === 'negative').length;
    return { positiveCount, negativeCount, totalCount: features.length };
  }, [features]);

  // Chart data formatted for horizontal Recharts BarChart
  const chartData = useMemo(() => {
    // For horizontal bar chart, we can display top-down by reversing sorted features
    return [...sortedFeatures].reverse().map((item) => ({
      name: item.name,
      percentage: Number(item.percentage.toFixed(1)),
      beta: Number(item.beta.toFixed(4)),
      value: displayMetric === 'percentage' ? Number(item.percentage.toFixed(1)) : Number(item.beta.toFixed(4)),
      rawCoefficient: item.rawCoefficient,
      direction: item.direction,
    }));
  }, [sortedFeatures, displayMetric]);

  if (!features || features.length === 0) {
    return (
      <div className="text-center p-8 bg-[var(--cds-layer-01)] rounded-2xl border border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
        <p className="text-sm font-semibold">
          {language === 'ar'
            ? 'لا توجد بيانات أهمية للميزات متاحة حالياً. يرجى تدريب النموذج أولاً.'
            : 'No feature importance data available. Please train the model first.'}
        </p>
      </div>
    );
  }

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px] z-50">
          <div className="font-bold text-[var(--cds-text-01)] flex items-center justify-between pb-1 border-b border-[var(--cds-border-subtle)]">
            <span className="font-mono">{data.name}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                data.direction === 'positive'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
              }`}
            >
              {data.direction === 'positive'
                ? language === 'ar'
                  ? 'طردي (+)'
                  : 'Positive (+)'
                : language === 'ar'
                ? 'عكسي (-)'
                : 'Negative (-)'}
            </span>
          </div>

          <div className="flex justify-between items-center text-[var(--cds-text-02)] pt-0.5">
            <span>{language === 'ar' ? 'الأهمية النسبية:' : 'Relative Share:'}</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
              {data.percentage}%
            </span>
          </div>

          <div className="flex justify-between items-center text-[var(--cds-text-02)]">
            <span>{language === 'ar' ? 'المعامل المعياري (Beta):' : 'Std. Beta (β*):'}</span>
            <span className="font-mono font-semibold text-[var(--cds-text-01)]">
              {data.beta > 0 ? '+' : ''}{data.beta}
            </span>
          </div>

          {data.rawCoefficient !== undefined && (
            <div className="flex justify-between items-center text-[var(--cds-text-03)] text-[10px]">
              <span>{language === 'ar' ? 'المعامل الأصلي (β):' : 'Raw Coef (β):'}</span>
              <span className="font-mono">{data.rawCoefficient.toFixed(6)}</span>
            </div>
          )}

          <div className="text-[10px] text-[var(--cds-text-03)] border-t border-[var(--cds-border-subtle)] pt-1 mt-1 leading-tight">
            {data.direction === 'positive'
              ? language === 'ar'
                ? `كل زيادة في هذا المتغير تزيد من القيمة المتوقعة لـ ${targetName}.`
                : `Higher values increase predicted ${targetName}.`
              : language === 'ar'
              ? `كل زيادة في هذا المتغير تقلل من القيمة المتوقعة لـ ${targetName}.`
              : `Higher values decrease predicted ${targetName}.`}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-2xl p-5 space-y-5 shadow-xs">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--cds-border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
                {language === 'ar' ? 'تحليل أهمية الميزات (Feature Importance)' : 'Feature Importance Analysis'}
              </h3>
              <InfoTooltip
                title={language === 'ar' ? 'أهمية الميزات المعيارية (Standardized Beta)' : 'Standardized Feature Importance'}
                content={
                  language === 'ar'
                    ? 'يتم حساب الأهمية عبر المعاملات المعيارية (Standardized Beta Coefficients) بعد إزالة تأثير اختلاف وحدات القياس، مما يسمح بمقارنة حقيقية وموضوعية لقوة تأثير كل متغير على المخرج Y.'
                    : 'Features are standardized to eliminate unit discrepancies, comparing beta coefficients on equal scale to determine which input drives the target Y most powerfully.'
                }
                badge={language === 'ar' ? 'مقياس إحصائي دقيق' : 'Statistical Metric'}
              />
            </div>
            <p className="text-xs text-[var(--cds-text-03)]">
              {language === 'ar'
                ? 'رسم بياني شريطي يوضح المتغيرات الأكثر حساسية وتأثيراً على تنبؤات النموذج بعد التدريب.'
                : 'Identifies which independent variables have the highest predictive leverage on model outputs.'}
            </p>
          </div>
        </div>

        {/* Action / View Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="inline-flex rounded-lg border border-[var(--cds-border-subtle)] p-0.5 bg-[var(--cds-layer-02)]">
            <button
              type="button"
              onClick={() => setDisplayMetric('percentage')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                displayMetric === 'percentage'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              % {language === 'ar' ? 'النسبة المئوية' : 'Percentage'}
            </button>
            <button
              type="button"
              onClick={() => setDisplayMetric('beta')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                displayMetric === 'beta'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              β* {language === 'ar' ? 'المعامل المعياري' : 'Std. Beta'}
            </button>
          </div>

          {/* Sort Selector */}
          <div className="inline-flex rounded-lg border border-[var(--cds-border-subtle)] p-0.5 bg-[var(--cds-layer-02)]">
            <button
              type="button"
              onClick={() => setSortBy('desc')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                sortBy === 'desc'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
              title={language === 'ar' ? 'الأعلى تأثيراً أولاً' : 'Most influential first'}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>{language === 'ar' ? 'الأعلى' : 'Highest'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSortBy('asc')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                sortBy === 'asc'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
              title={language === 'ar' ? 'الأقل تأثيراً أولاً' : 'Lowest influential first'}
            >
              <span>{language === 'ar' ? 'الأدنى' : 'Lowest'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Driver Highlight Card */}
      {topDriver && (
        <div className="p-3.5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-teal-500/10 rounded-xl border border-blue-500/25 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/30">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                {language === 'ar' ? 'المتغير الأكثر تأثيراً على النموذج (Top Predictive Driver):' : 'Top Model Predictive Driver:'}
              </div>
              <div className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-2 mt-0.5">
                <span className="font-mono px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                  {topDriver.name}
                </span>
                <span>
                  {language === 'ar'
                    ? `يستحوذ على ${topDriver.percentage.toFixed(1)}% من إجمالي القوة التفسيرية للنموذج.`
                    : `Accounts for ${topDriver.percentage.toFixed(1)}% of total predictive power.`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.positiveCount} {language === 'ar' ? 'تأثير طردي (+)' : 'Positive (+)'}</span>
            </span>
            {stats.negativeCount > 0 && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                <span>{stats.negativeCount} {language === 'ar' ? 'تأثير عكسي (-)' : 'Negative (-)'}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Recharts Bar Chart Container */}
      <div className="w-full h-[280px] sm:h-[340px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 30,
              bottom: 5,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke={isDark ? '#333333' : '#e2e8f0'}
            />
            <XAxis
              type="number"
              domain={[0, displayMetric === 'percentage' ? 100 : 'auto']}
              unit={displayMetric === 'percentage' ? '%' : ''}
              tick={{ fill: isDark ? '#9ca3af' : '#64748b', fontSize: 11 }}
              tickLine={{ stroke: isDark ? '#4b5563' : '#cbd5e1' }}
            />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fill: isDark ? '#e5e7eb' : '#1f2937', fontSize: 12, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: isDark ? '#4b5563' : '#cbd5e1' }}
              width={100}
            />
            <RechartsTooltip content={customTooltip} />
            <Bar
              dataKey="value"
              radius={[0, 8, 8, 0]}
              animationDuration={800}
            >
              {chartData.map((entry, index) => {
                // Color coding: Highest bar gets vibrant indigo/blue; positive get teal/emerald; negative get rose/amber
                const isTop = entry.name === topDriver?.name;
                const fillColor = isTop
                  ? '#3b82f6'
                  : entry.direction === 'positive'
                  ? '#0d9488'
                  : '#e11d48';

                return <Cell key={`cell-${index}`} fill={fillColor} fillOpacity={0.88} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Feature Importance Breakdown Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--cds-border-subtle)]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-b border-[var(--cds-border-subtle)] font-bold">
              <th className="p-3 text-center w-12">#</th>
              <th className="p-3">{language === 'ar' ? 'اسم المتغير المستقل (Feature)' : 'Feature Name'}</th>
              <th className="p-3 text-center">{language === 'ar' ? 'اتجاه التأثير' : 'Impact Direction'}</th>
              <th className="p-3 text-end">{language === 'ar' ? 'المعامل المعياري (Std. Beta)' : 'Std. Beta (β*)'}</th>
              <th className="p-3 text-end">{language === 'ar' ? 'المعامل الأصلي (Raw Coef)' : 'Raw Coef (β)'}</th>
              <th className="p-3 text-center min-w-[140px]">{language === 'ar' ? 'المساهمة النسبية' : 'Relative Share'}</th>
              <th className="p-3 text-end font-bold">{language === 'ar' ? 'النسبة المؤثرة' : 'Impact %'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--cds-border-subtle)]">
            {sortedFeatures.map((feat, idx) => (
              <tr
                key={feat.name}
                className={`hover:bg-[var(--cds-layer-02)] transition-colors ${
                  feat.name === topDriver?.name ? 'bg-blue-500/5 dark:bg-blue-950/20' : ''
                }`}
              >
                <td className="p-3 text-center font-mono font-bold text-[var(--cds-text-03)]">
                  {idx + 1}
                </td>
                <td className="p-3 font-semibold text-[var(--cds-text-01)] flex items-center gap-2">
                  <span className="font-mono">{feat.name}</span>
                  {feat.name === topDriver?.name && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-600/10 text-blue-600 border border-blue-500/20">
                      {language === 'ar' ? 'الأقوى تأثيراً' : 'Top Driver'}
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      feat.direction === 'positive'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {feat.direction === 'positive' ? (
                      <>
                        <TrendingUp className="w-3 h-3" />
                        <span>{language === 'ar' ? 'طردي (+)' : 'Positive (+)'}</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3" />
                        <span>{language === 'ar' ? 'عكسي (-)' : 'Negative (-)'}</span>
                      </>
                    )}
                  </span>
                </td>
                <td className="p-3 text-end font-mono font-semibold text-[var(--cds-text-01)]">
                  {feat.beta > 0 ? '+' : ''}{feat.beta.toFixed(4)}
                </td>
                <td className="p-3 text-end font-mono text-[var(--cds-text-03)]">
                  {feat.rawCoefficient !== undefined ? feat.rawCoefficient.toFixed(6) : '-'}
                </td>
                <td className="p-3">
                  <div className="w-full bg-[var(--cds-layer-03)] rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        feat.name === topDriver?.name
                          ? 'bg-blue-600'
                          : feat.direction === 'positive'
                          ? 'bg-teal-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, feat.percentage)}%` }}
                    />
                  </div>
                </td>
                <td className="p-3 text-end font-mono font-bold text-blue-600 dark:text-blue-400">
                  {feat.percentage.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
