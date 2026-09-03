import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { WidgetConfig, Dataset, AggregationFunction } from '../../types';
import { useApp } from '../../context/AppContext';
import { getThemePalette, VISUALIZATION_THEMES } from '../../utils/visualizationThemes';
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon,
  AreaChart as AreaIcon,
  Calculator,
  Sigma,
} from 'lucide-react';

// IBM Carbon Design System Official Chart Categorical 14 Palette
export const CARBON_PALETTE = [
  '#0f62fe', // IBM Blue 60
  '#009d9a', // Teal 50
  '#8a3ffc', // Purple 60
  '#ee5396', // Magenta 50
  '#33b1ff', // Cyan 40
  '#f1c21b', // Yellow 30
  '#24a148', // Green 50
  '#ff832b', // Orange 40
  '#6929c4', // Purple 70
  '#00539a', // Cyan 70
  '#9f1853', // Magenta 70
  '#002d9c', // Blue 80
];

// Helper for computing percentiles with linear interpolation
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Universal mathematical, statistical, percentile and probabilistic aggregation engine
 */
export function computeMathematicalAggregation(
  values: number[],
  aggregation: AggregationFunction = 'sum'
): number {
  if (!values || values.length === 0) return 0;
  if (aggregation === 'count') return values.length;

  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return 0;

  switch (aggregation) {
    case 'sum':
      return Number(valid.reduce((acc, v) => acc + v, 0).toFixed(2));
    case 'avg': {
      const sum = valid.reduce((acc, v) => acc + v, 0);
      return Number((sum / valid.length).toFixed(2));
    }
    case 'max':
      return Number(Math.max(...valid).toFixed(2));
    case 'min':
      return Number(Math.min(...valid).toFixed(2));
    case 'range': {
      const max = Math.max(...valid);
      const min = Math.min(...valid);
      return Number((max - min).toFixed(2));
    }
    case 'median': {
      const sorted = [...valid].sort((a, b) => a - b);
      return Number(computePercentile(sorted, 50).toFixed(2));
    }
    case 'mode': {
      const freq: Record<number, number> = {};
      let maxCount = 0;
      let modeVal = valid[0];
      for (const num of valid) {
        const rounded = Number(num.toFixed(2));
        freq[rounded] = (freq[rounded] || 0) + 1;
        if (freq[rounded] > maxCount) {
          maxCount = freq[rounded];
          modeVal = rounded;
        }
      }
      return Number(modeVal.toFixed(2));
    }
    case 'stddev': {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const variance = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / valid.length;
      return Number(Math.sqrt(variance).toFixed(2));
    }
    case 'variance': {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const variance = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / valid.length;
      return Number(variance.toFixed(2));
    }
    case 'q1': {
      const sorted = [...valid].sort((a, b) => a - b);
      return Number(computePercentile(sorted, 25).toFixed(2));
    }
    case 'q3': {
      const sorted = [...valid].sort((a, b) => a - b);
      return Number(computePercentile(sorted, 75).toFixed(2));
    }
    case 'iqr': {
      const sorted = [...valid].sort((a, b) => a - b);
      const q1 = computePercentile(sorted, 25);
      const q3 = computePercentile(sorted, 75);
      return Number((q3 - q1).toFixed(2));
    }
    case 'cv': {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const variance = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / valid.length;
      const stddev = Math.sqrt(variance);
      if (Math.abs(mean) < 0.000001) return 0;
      return Number(((stddev / Math.abs(mean)) * 100).toFixed(2));
    }
    case 'sum_squares': {
      return Number(valid.reduce((acc, v) => acc + v * v, 0).toFixed(2));
    }
    default:
      return Number(valid.reduce((acc, v) => acc + v, 0).toFixed(2));
  }
}

export interface AggregationOptionItem {
  value: AggregationFunction;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  symbol: string;
  category: 'central' | 'dispersion' | 'percentile' | 'aggregate';
}

export const AGGREGATION_OPTIONS: AggregationOptionItem[] = [
  // Aggregate / Totals
  { value: 'sum', labelAr: 'الإجمالي (SUM)', labelEn: 'Sum / Total', descAr: 'جمع كافة القيم الرقمية', descEn: 'Sum of all numeric values', symbol: '∑', category: 'aggregate' },
  { value: 'count', labelAr: 'العدد والتكرار (COUNT)', labelEn: 'Count / Frequency', descAr: 'حساب عدد السجلات والقيم', descEn: 'Number of items/records', symbol: 'N', category: 'aggregate' },
  { value: 'sum_squares', labelAr: 'مجموع المربعات (SS)', labelEn: 'Sum of Squares', descAr: 'مجموع مربعات القيم (∑ x²)', descEn: 'Sum of squared values', symbol: '∑x²', category: 'aggregate' },

  // Measures of Central Tendency
  { value: 'avg', labelAr: 'المتوسط الحسابي (AVG)', labelEn: 'Average (Mean)', descAr: 'المتوسط الحسابي (المجموع ÷ العدد)', descEn: 'Arithmetic average (Mean)', symbol: 'μ', category: 'central' },
  { value: 'median', labelAr: 'الوسيط الحسابي (MEDIAN)', labelEn: 'Median (50th %)', descAr: 'القيمة التي تقسم البيانات إلى نصفين متساويين', descEn: 'Middle value of sorted data', symbol: 'x̃', category: 'central' },
  { value: 'mode', labelAr: 'المنوال (MODE)', labelEn: 'Mode (Most Frequent)', descAr: 'القيمة الأكثر تكراراً وشيوعاً', descEn: 'Most frequent value', symbol: 'Mo', category: 'central' },

  // Measures of Dispersion & Spread
  { value: 'stddev', labelAr: 'الانحراف المعياري (STDDEV)', labelEn: 'Std Deviation (σ)', descAr: 'قياس درجة تشتت وتوزيع البيانات عن المتوسط', descEn: 'Data dispersion from mean', symbol: 'σ', category: 'dispersion' },
  { value: 'variance', labelAr: 'التباين الإحصائي (VAR)', labelEn: 'Statistical Variance (σ²)', descAr: 'مربع الانحراف المعياري ومقياس التباين', descEn: 'Squared dispersion (Variance)', symbol: 'σ²', category: 'dispersion' },
  { value: 'range', labelAr: 'المدى الإحصائي (RANGE)', labelEn: 'Statistical Range', descAr: 'الفارق بين أعلى وأدنى قيمة (Max - Min)', descEn: 'Spread (Max - Min)', symbol: '↔', category: 'dispersion' },
  { value: 'cv', labelAr: 'معامل الاختلاف النسبي (CV%)', labelEn: 'Coeff of Variation (CV%)', descAr: 'نسبة الانحراف المعياري للمتوسط كنسبة مئوية', descEn: 'Relative variability percentage (σ/μ*100)', symbol: 'CV%', category: 'dispersion' },

  // Extrema & Percentiles / Quartiles
  { value: 'max', labelAr: 'الحد الأقصى (MAX)', labelEn: 'Maximum (Max)', descAr: 'أكبر وأعلى قيمة مسجلة', descEn: 'Largest recorded value', symbol: '▲', category: 'percentile' },
  { value: 'min', labelAr: 'الحد الأدنى (MIN)', labelEn: 'Minimum (Min)', descAr: 'أصغر وأدنى قيمة مسجلة', descEn: 'Smallest recorded value', symbol: '▼', category: 'percentile' },
  { value: 'q1', labelAr: 'الربيع الأول (Q1 / P25)', labelEn: 'First Quartile (Q1)', descAr: 'القيمة التي يقع دونها 25% من البيانات', descEn: '25th Percentile cutoff', symbol: 'Q₁', category: 'percentile' },
  { value: 'q3', labelAr: 'الربيع الثالث (Q3 / P75)', labelEn: 'Third Quartile (Q3)', descAr: 'القيمة التي يقع دونها 75% من البيانات', descEn: '75th Percentile cutoff', symbol: 'Q₃', category: 'percentile' },
  { value: 'iqr', labelAr: 'المدى الربيعي (IQR)', labelEn: 'Interquartile Range (IQR)', descAr: 'الفارق الإحصائي بين الربعين (Q3 - Q1)', descEn: 'Middle 50% spread (Q3 - Q1)', symbol: 'IQR', category: 'percentile' },
];

export function getAggregationLabel(agg: AggregationFunction = 'sum', language: string = 'ar'): string {
  if (language === 'ar') {
    switch (agg) {
      case 'sum': return 'الإجمالي (SUM)';
      case 'avg': return 'المتوسط (AVG)';
      case 'count': return 'العدد (COUNT)';
      case 'max': return 'الأعلى (MAX)';
      case 'min': return 'الأدنى (MIN)';
      case 'range': return 'المدى (RANGE)';
      case 'mode': return 'المنوال (MODE)';
      case 'stddev': return 'الانحراف المعياري (STDDEV)';
      case 'variance': return 'التباين (VAR)';
      case 'median': return 'الوسيط (MEDIAN)';
      case 'q1': return 'الربيع الأول (Q1)';
      case 'q3': return 'الربيع الثالث (Q3)';
      case 'iqr': return 'المدى الربيعي (IQR)';
      case 'cv': return 'معامل الاختلاف (CV%)';
      case 'sum_squares': return 'مجموع المربعات (SS)';
      default: return 'الإجمالي (SUM)';
    }
  }
  switch (agg) {
    case 'sum': return 'Sum / Total (SUM)';
    case 'avg': return 'Average (AVG)';
    case 'count': return 'Count (COUNT)';
    case 'max': return 'Maximum (MAX)';
    case 'min': return 'Minimum (MIN)';
    case 'range': return 'Range (RANGE)';
    case 'mode': return 'Mode (MODE)';
    case 'stddev': return 'Std Deviation (STDDEV)';
    case 'variance': return 'Variance (VAR)';
    case 'median': return 'Median (MEDIAN)';
    case 'q1': return 'First Quartile (Q1)';
    case 'q3': return 'Third Quartile (Q3)';
    case 'iqr': return 'Interquartile Range (IQR)';
    case 'cv': return 'Coeff of Variation (CV%)';
    case 'sum_squares': return 'Sum of Squares (SS)';
    default: return 'Sum (SUM)';
  }
}

export const KpiCard: React.FC<{ widget: WidgetConfig }> = ({ widget }) => {
  const { language } = useApp();
  const kpi = widget.kpiMetric;
  if (!kpi) return null;

  const isUp = kpi.trendDirection === 'up';
  const isDown = kpi.trendDirection === 'down';

  return (
    <div className="bg-[var(--cds-card-bg,var(--cds-layer-01))] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between h-full relative group hover:border-[var(--cds-border-strong)] transition-colors rounded-none shadow-md">
      <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2.5">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--cds-text-01)]">
          {language === 'ar' ? widget.titleAr || widget.title : widget.title}
        </span>
        <div className="w-6 h-6 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[var(--cds-interactive-01)]">
          <BarChart3 className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="my-3">
        <div className="text-2xl sm:text-3xl font-black text-[var(--cds-text-01)] tracking-tight font-mono">
          {kpi.value}
        </div>
        <p className="text-xs text-[var(--cds-text-02)] mt-1 font-mono">{kpi.label}</p>
      </div>
      {kpi.trendPercentage !== undefined && (
        <div className="flex items-center gap-2 text-xs font-mono pt-2.5 border-t border-[var(--cds-border-subtle)]">
          {isUp && (
            <span className="flex items-center text-[#42be65] bg-[#24a148]/15 border border-[#24a148]/40 px-1.5 py-0.5 font-bold">
              <ArrowUpRight className="w-3 h-3 me-0.5" /> +{kpi.trendPercentage}%
            </span>
          )}
          {isDown && (
            <span className="flex items-center text-[#ff8389] bg-[#da1e28]/15 border border-[#da1e28]/40 px-1.5 py-0.5 font-bold">
              <ArrowDownRight className="w-3 h-3 me-0.5" /> {kpi.trendPercentage}%
            </span>
          )}
          {!isUp && !isDown && (
            <span className="flex items-center text-[var(--cds-text-01)] bg-[var(--cds-layer-02)] px-1.5 py-0.5 font-bold">
              <Minus className="w-3 h-3 me-0.5" /> {kpi.trendPercentage}%
            </span>
          )}
          <span className="text-[var(--cds-text-03)] text-[11px]">{language === 'ar' ? 'مقارنة بالفترة السابقة' : 'vs previous period'}</span>
        </div>
      )}
    </div>
  );
};

export const ChartFactory: React.FC<{
  widget: WidgetConfig;
  dataset: Dataset;
  customData?: any[];
  activeTheme?: string;
}> = ({ widget, dataset, customData, activeTheme }) => {
  const { language, theme } = useApp();

  const isLight = theme === 'g10' || theme === 'white';
  const gridStroke = isLight ? '#e0e0e0' : theme === 'midnight' ? '#1e335e' : '#393939';
  const axisStroke = isLight ? '#4b5563' : '#c6c6c6';

  // Resolved palette based on active theme or widget color scheme
  const themeKey = activeTheme || widget.colorScheme || 'professional';
  const activePalette = getThemePalette(themeKey);
  const primaryColor = activePalette[0] || '#0f62fe';

  // Aggregate or transform dataset data based on xAxis / yAxis / category
  const xKey = widget.xAxis || widget.categoryField || dataset.columns[0]?.name || 'name';
  const yKey = widget.yAxis || dataset.columns.find(c => c.type === 'float' || c.type === 'integer')?.name || 'value';
  const aggFunc: AggregationFunction = widget.aggregation || 'sum';

  const chartData = React.useMemo(() => {
    const sourceRows = customData && customData.length > 0 ? customData : (dataset?.data || []);
    if (!sourceRows || sourceRows.length === 0) return [];

    // Group values by xKey
    const groups: { [key: string]: number[] } = {};

    sourceRows.forEach(r => {
      const rawX = r[xKey] !== undefined && r[xKey] !== null ? r[xKey] : (r.name ?? 'Other');
      const k = String(rawX);
      const rawY = r[yKey] !== undefined ? r[yKey] : (r.value ?? 1);
      const cleaned = typeof rawY === 'number' ? rawY : parseFloat(String(rawY).replace(/[\$,\s%]/g, ''));
      const val = isNaN(cleaned) ? 1 : cleaned;

      if (!groups[k]) groups[k] = [];
      groups[k].push(val);
    });

    // Convert groups to structured chart items applying the requested mathematical aggregation
    return Object.entries(groups)
      .slice(0, 50)
      .map(([name, values]) => {
        const aggregatedVal = computeMathematicalAggregation(values, aggFunc);
        const count = values.length;
        const sum = computeMathematicalAggregation(values, 'sum');
        const avg = computeMathematicalAggregation(values, 'avg');
        const min = computeMathematicalAggregation(values, 'min');
        const max = computeMathematicalAggregation(values, 'max');
        const stddev = computeMathematicalAggregation(values, 'stddev');
        const variance = computeMathematicalAggregation(values, 'variance');
        const range = computeMathematicalAggregation(values, 'range');
        const mode = computeMathematicalAggregation(values, 'mode');
        const median = computeMathematicalAggregation(values, 'median');
        const q1 = computeMathematicalAggregation(values, 'q1');
        const q3 = computeMathematicalAggregation(values, 'q3');
        const iqr = computeMathematicalAggregation(values, 'iqr');
        const cv = computeMathematicalAggregation(values, 'cv');
        const sum_squares = computeMathematicalAggregation(values, 'sum_squares');

        return {
          name,
          [yKey]: aggregatedVal,
          value: aggregatedVal,
          count,
          sum,
          avg,
          min,
          max,
          stddev,
          variance,
          range,
          mode,
          median,
          q1,
          q3,
          iqr,
          cv,
          sum_squares,
          rawCount: count,
        };
      });
  }, [widget, dataset, customData, xKey, yKey, aggFunc]);

  const yField = yKey;
  const aggTitle = getAggregationLabel(aggFunc, language);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const rowItem = payload[0]?.payload;
      return (
        <div className="bg-[var(--cds-card-bg,var(--cds-layer-01))] border border-[var(--cds-border-strong)] p-3 text-xs font-mono shadow-2xl space-y-1.5 min-w-[200px] text-[var(--cds-text-01)]">
          <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-1">
            <p className="font-bold text-[var(--cds-text-01)]">{label}</p>
            <span className="text-[10px] text-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/15 px-1.5 py-0.2 uppercase font-bold">
              {aggFunc.toUpperCase()}
            </span>
          </div>

          <div className="text-[var(--cds-text-01)] flex items-center justify-between">
            <span className="text-[var(--cds-text-02)]">{yKey}:</span>
            <span className="font-bold text-sm text-[var(--cds-interactive-01)]">
              {typeof rowItem?.[yField] === 'number' ? rowItem[yField].toLocaleString() : payload[0].value}
            </span>
          </div>

          {rowItem && (
            <div className="pt-1.5 border-t border-[var(--cds-border-subtle)] grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[var(--cds-text-03)]">
              <div>{language === 'ar' ? 'العدد:' : 'Count:'} <strong className="text-[var(--cds-text-01)]">{rowItem.count}</strong></div>
              <div>{language === 'ar' ? 'المتوسط:' : 'Avg:'} <strong className="text-[var(--cds-text-01)]">{rowItem.avg}</strong></div>
              <div>{language === 'ar' ? 'الحد الأدنى:' : 'Min:'} <strong className="text-[var(--cds-text-01)]">{rowItem.min}</strong></div>
              <div>{language === 'ar' ? 'الحد الأقصى:' : 'Max:'} <strong className="text-[var(--cds-text-01)]">{rowItem.max}</strong></div>
              <div>{language === 'ar' ? 'الانحراف:' : 'StdDev:'} <strong className="text-[var(--cds-text-01)]">{rowItem.stddev}</strong></div>
              <div>{language === 'ar' ? 'المدى:' : 'Range:'} <strong className="text-[var(--cds-text-01)]">{rowItem.range}</strong></div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="name"
                stroke={axisStroke}
                fontSize={10}
                fontFamily="IBM Plex Mono, monospace"
                tickLine={false}
                angle={-20}
                textAnchor="end"
              />
              <YAxis
                stroke={axisStroke}
                fontSize={10}
                fontFamily="IBM Plex Mono, monospace"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey={yField} fill={primaryColor} radius={0}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={activePalette[index % activePalette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <YAxis stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={yField}
                stroke={primaryColor}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: primaryColor, strokeWidth: 1, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#ffffff', stroke: primaryColor, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'timeseries':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <defs>
                <linearGradient id="timeColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <YAxis stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey={yField} stroke={primaryColor} fillOpacity={1} fill="url(#timeColor)" />
              <Line type="monotone" dataKey={yField} stroke={primaryColor} strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'heatmap':
        // A simple heatmap representation using ScatterChart where cells are colored by value density
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
              <XAxis dataKey="name" name="X" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <YAxis dataKey={yField} name="Y" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} axisLine={false} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              <Scatter data={chartData} fill={primaryColor} shape="square">
                {chartData.map((entry, index) => {
                  const val = entry[yField] as number;
                  const maxVal = Math.max(...chartData.map(d => (d[yField] as number) || 0));
                  const opacity = maxVal ? Math.max(0.2, val / maxVal) : 0.5;
                  const color = activePalette[index % activePalette.length];
                  return <Cell key={`cell-${index}`} fill={color} fillOpacity={opacity} />;
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <defs>
                <linearGradient id="carbonColorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <YAxis stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey={yField}
                stroke={primaryColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#carbonColorGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
                stroke="#262626"
                strokeWidth={1}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={activePalette[index % activePalette.length]} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={val => <span className="text-[10px] font-mono text-[#f4f4f4] font-semibold">{val}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -5, bottom: 25 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
              <XAxis dataKey="name" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <YAxis dataKey={yField} stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={chartData} fill={primaryColor} shape="circle">
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={activePalette[index % activePalette.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'radar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData.slice(0, 12)} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis dataKey="name" stroke={axisStroke} fontSize={10} fontFamily="IBM Plex Mono, monospace" />
              <PolarRadiusAxis stroke={gridStroke} fontSize={9} />
              <Tooltip content={<CustomTooltip />} />
              <Radar name={yField} dataKey={yField} stroke={primaryColor} fill={primaryColor} fillOpacity={0.5} />
            </RadarChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-[var(--cds-card-bg,var(--cds-layer-01))] border border-[var(--cds-border-subtle)] p-4 flex flex-col justify-between h-full rounded-none">
      <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2 mb-3">
        <div>
          <h4 className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase tracking-wider">
            {language === 'ar' ? widget.titleAr || widget.title : widget.title}
          </h4>
          <span className="text-[10px] font-mono text-[var(--cds-interactive-01)] flex items-center gap-1 mt-0.5">
            <Sigma className="w-3 h-3 text-[var(--cds-interactive-01)]" />
            <span>{aggTitle}</span>
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase bg-[var(--cds-background)] text-[var(--cds-interactive-01)] border border-[var(--cds-border-subtle)] px-2 py-0.5 font-bold">
          {widget.type}
        </span>
      </div>
      <div className="h-56 w-full">{renderChart()}</div>
    </div>
  );
};

