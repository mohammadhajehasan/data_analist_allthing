/**
 * محرّك التجميع الرياضي والإحصائي — مستقل عن الواجهة
 * (سنقلّه من ChartFactory ليعمل داخل الأدوات النقية مثل محرّك الجداول المحورية
 * وبين الاختبارات، مع إعادة التصدير من ChartFactory للحفاظ على كل الاستيرادات).
 */
import { AggregationFunction } from '../types';

// Helper for computing percentiles with linear interpolation
export function computePercentile(sorted: number[], p: number): number {
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
