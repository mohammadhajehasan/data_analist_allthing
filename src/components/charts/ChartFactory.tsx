import React from 'react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
// GIS upload/analysis icons for the GeoJSON source panel
import { WidgetConfig, Dataset, AggregationFunction } from '../../types';
import { parseGeoJsonSource, computeGeoJsonAutoFit } from '../../utils/geoJson';
import { ISO3_TO_ISO2_FULL } from '../../data/allCountries';
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
  Globe,
  MapPin,
} from 'lucide-react';

// Map engine is heavy (~4MB) — loaded lazily in its own chunk, only for geo widgets.
const LazyPlot = lazy(() => import('../common/LazyPlot'));

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

/**
 * GEO MAP HELPERS — folium-style thematic maps without any Python:
 * choropleth regions (country/ISO names) or plotted markers (lat/lng points)
 * colored by an aggregated metric (e.g. sales by region).
 */

/** Recognized spatial (location) column names in either language */
export const GEO_LOCATION_HINTS = [
  'country', 'countries', 'الدولة', 'البلد', 'بلد', 'دولة',
  'region', 'المنطقة', 'منطقة', 'مناطق', 'الاقليم', 'اقليم',
  'state', 'الولاية', 'ولاية', 'المحافظة', 'محافظة', 'المدينة', 'city',
  'wilaya', 'governorate', 'province', 'الاسم', 'اسم المنطقة',
  'location', 'الموقع', 'موقع', 'مكان',
];

/** Guess the most likely location column from a dataset's column names */
export function guessGeoLocationColumn(columns?: { name: string; type?: string }[]): string | null {
  if (!columns || columns.length === 0) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  // exact/substring hits first, in hint priority order
  for (const hint of GEO_LOCATION_HINTS) {
    const exact = columns.find(c => norm(c.name) === hint);
    if (exact) return exact.name;
  }
  for (const hint of GEO_LOCATION_HINTS) {
    const plan = columns.find(c => norm(c.name).includes(hint));
    if (plan) return plan.name;
  }
  return null;
}

/** Detects numeric latitude/longitude-ish columns by name (lat, lng, خط الطول...) */
export function isCoordColumn(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  return /^(lat|latitude|خط العرض|عرض)$/.test(n) || /(lat$|latitude)/.test(n) || /^(lng|lon|long|longitude|خط الطول|طول)$/.test(n);
}

/** Region label normalizer for map lookups */
function normGeoLabel(s: string): string {
  return String(s || '').trim().toLowerCase().replace(/\u0640/g, '').replace(/[\u064B-\u065F\u0670]/g, '');
}

/** Arabic + English region-label -> ISO-3 country code (folium-familiar naming, in-browser) */
const GEO_LABEL_CODE_MAP: Record<string, string> = {
  // English
  'united states': 'USA', 'united states of america': 'USA', 'usa': 'USA', 'us': 'USA', 'america': 'USA',
  'canada': 'CAN', 'mexico': 'MEX', 'brazil': 'BRA', 'argentina': 'ARG', 'chile': 'CHL', 'colombia': 'COL',
  'united kingdom': 'GBR', 'uk': 'GBR', 'england': 'GBR', 'great britain': 'GBR', 'ireland': 'IRL',
  'france': 'FRA', 'germany': 'DEU', 'spain': 'ESP', 'italy': 'ITA', 'netherlands': 'NLD', 'belgium': 'BEL',
  'switzerland': 'CHE', 'austria': 'AUT', 'sweden': 'SWE', 'norway': 'NOR', 'denmark': 'DNK', 'finland': 'FIN',
  'poland': 'POL', 'portugal': 'PRT', 'greece': 'GRC', 'czechia': 'CZE', 'romania': 'ROU', 'hungary': 'HUN',
  'turkey': 'TUR', 'russia': 'RUS', 'ukraine': 'UKR', 'china': 'CHN', 'japan': 'JPN', 'south korea': 'KOR',
  'india': 'IND', 'pakistan': 'PAK', 'indonesia': 'IDN', 'malaysia': 'MYS', 'singapore': 'SGP', 'thailand': 'THA',
  'vietnam': 'VNM', 'philippines': 'PHL', 'australia': 'AUS', 'new zealand': 'NZL', 'south africa': 'ZAF',
  'nigeria': 'NGA', 'kenya': 'KEN', 'ghana': 'GHA', 'ethiopia': 'ETH', 'egypt': 'EGY', 'morocco': 'MAR',
  'algeria': 'DZA', 'tunisia': 'TUN', 'libya': 'LBY', 'sudan': 'SDN', 'israel': 'ISR', 'palestine': 'PSE',
  'saudi arabia': 'SAU', 'saudi': 'SAU', 'united arab emirates': 'ARE', 'uae': 'ARE', 'qatar': 'QAT',
  'kuwait': 'KWT', 'bahrain': 'BHR', 'oman': 'OMN', 'yemen': 'YEM', 'iraq': 'IRQ', 'jordan': 'JOR',
  'lebanon': 'LBN', 'syria': 'SYR', 'iran': 'IRN', 'afghanistan': 'AFG',
  // Arabic (normalized: hamza forms are folded by prefix alternation at lookup)
  'الولايات المتحدة': 'USA', 'أمريكا': 'USA', 'امريكا': 'USA', 'كندا': 'CAN', 'المكسيك': 'MEX', 'المكسيك)': 'MEX',
  'البرازيل': 'BRA', 'الأرجنتين': 'ARG', 'تشيلي': 'CHL', 'كولومبيا': 'COL',
  'المملكة المتحدة': 'GBR', 'بريطانيا': 'GBR', 'إنجلترا': 'GBR', 'انجلترا': 'GBR', 'إيرلندا': 'IRL', 'ايرلندا': 'IRL',
  'فرنسا': 'FRA', 'ألمانيا': 'DEU', 'المانيا': 'DEU', 'إسبانيا': 'ESP', 'اسبانيا': 'ESP', 'إيطاليا': 'ITA', 'ايطاليا': 'ITA',
  'هولندا': 'NLD', 'بلجيكا': 'BEL', 'سويسرا': 'CHE', 'النمسا': 'AUT', 'السويد': 'SWE', 'النرويج': 'NOR',
  'الدنمارك': 'DNK', 'فنلندا': 'FIN', 'بولندا': 'POL', 'البرتغال': 'PRT', 'اليونان': 'GRC', 'تركيا': 'TUR',
  'روسيا': 'RUS', 'أوكرانيا': 'UKR', 'اوكرانيا': 'UKR', 'الصين': 'CHN', 'اليابان': 'JPN', 'كوريا الجنوبية': 'KOR',
  'الهند': 'IND', 'باكستان': 'PAK', 'إندونيسيا': 'IDN', 'اندونيسيا': 'IDN', 'ماليزيا': 'MYS', 'سنغافورة': 'SGP',
  'تايلاند': 'THA', 'فيتنام': 'VNM', 'الفلبين': 'PHL', 'أستراليا': 'AUS', 'استراليا': 'AUS', 'نيوزيلندا': 'NZL',
  'جنوب أفريقيا': 'ZAF', 'نيجيريا': 'NGA', 'كينيا': 'KEN', 'غانا': 'GHA', 'إثيوبيا': 'ETH', 'اثيوبيا': 'ETH',
  'مصر': 'EGY', 'المغرب': 'MAR', 'الجزائر': 'DZA', 'تونس': 'TUN', 'ليبيا': 'LBY', 'السودان': 'SDN',
  'فلسطين': 'PSE', 'السعودية': 'SAU', 'السعودية)': 'SAU', 'الإمارات': 'ARE', 'الامارات': 'ARE', 'قطر': 'QAT',
  'الكويت': 'KWT', 'البحرين': 'BHR', 'عمان': 'OMN', 'العراق': 'IRQ', 'الأردن': 'JOR', 'الأردن)': 'JOR',
  'لبنان': 'LBN', 'سوريا': 'SYR', 'إيران': 'IRN', 'ايران': 'IRN',
};

/** Maps a dataset location label to an ISO-3 code, tolerating Arabic article/hamza variants.
 *  Returns null for non-country strings (e.g. city names) so chrópleth is skipped safely. */
export function geoLabelToCode(label: string): string | null {
  const raw = String(label || '').trim();
  const lower = raw.toLowerCase();
  if (ISO3_SET.has(lower)) return raw.toUpperCase();
  const direct = GEO_LABEL_CODE_MAP[lower] ?? GEO_LABEL_CODE_MAP[normGeoLabel(lower)] ?? null;
  if (direct) return direct;
  const n = normGeoLabel(lower);
  // fold initial hamza variants (أ إ آ ا) into bare alif and retry once
  if (n.length > 1) {
    const folded = 'ا' + n.slice(1);
    const hit = GEO_LABEL_CODE_MAP[n] || GEO_LABEL_CODE_MAP[folded];
    if (hit) return hit;
  }
  // tolerate full-width country suffixes like "مصر (مصر)" → strip parens
  const parenless = raw.replace(/\([^)]*\)/g, '').trim().toLowerCase();
  if (parenless && parenless !== lower) return GEO_LABEL_CODE_MAP[parenless] ?? null;
  return null;
}
/** ISO-3 codes (lowercase) accepted when the location column already contains country codes */
const ISO3_SET = new Set([
  'usa','are','sau','egy','mar','dza','tun','jor','lbn','irq','kwt','qat','bhr','omn','yem','syr','sdn','som',
  'fra','deu','esp','ita','gbr','tur','ind','chn','jpn','kor','can','bra','mex','arg','chl','col','aus',
  'rus','zaf','nga','ken','gha','eth','nld','bel','che','swe','nor','fin','dnk','pol','aut','prt','irl','grc',
  'pak','idn','mys','sgp','tha','vnm','phl','nzl','gbr','irn','afg','lby','pse','isr','cze','rou','hun','ukr',
]);

export function iso2FromIso3(iso3: string): string {
  return ISO3_TO_ISO2_FULL[String(iso3 || '').toUpperCase()] || '';
}

/** IBM-Carbon-flavored yellow→green→teal→blue sequential colorscale for the map */
const CARBON_MAP_SCALE: Array<[number, string]> = [
  [0, '#f1c21b'],
  [0.35, '#42be65'],
  [0.7, '#009d9a'],
  [1, '#0f62fe'],
];

/** Viewport lat/lon ranges per map scope */
const MAP_SCOPE_RANGES: Record<string, { lat: [number, number]; lon: [number, number] }> = {
  world: { lat: [-55, 78], lon: [-170, 180] },
  middleEast: { lat: [12, 42], lon: [25, 63] },
  europe: { lat: [34, 71], lon: [-25, 45] },
  africa: { lat: [-36, 38], lon: [-18, 52] },
  asia: { lat: [-10, 55], lon: [60, 146] },
  americas: { lat: [-56, 72], lon: [-168, -34] },
};

/** Loader that fetches a country bounding box from Nominatim for the drill-down scope */
const CountryFocusLoader: React.FC<{
  iso3: string;
  isAr: boolean;
  onLoaded: (bbox: [number, number, number, number]) => void;
}> = ({ iso3, isAr, onLoaded }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    fetch(`https://nominatim.openstreetmap.org/search?countrycodes=${iso2FromIso3(iso3) || ''}&format=json&limit=1`, {
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((results: any[]) => {
        clearTimeout(timeout);
        if (cancelled) return;
        const bbox = results?.[0]?.boundingbox; // [south, north, west, east] strings
        if (Array.isArray(bbox) && bbox.length === 4) {
          onLoaded([
            parseFloat(bbox[2]),
            parseFloat(bbox[0]),
            parseFloat(bbox[3]),
            parseFloat(bbox[1]),
          ]);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [iso3, onLoaded]);
  if (failed) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
        <Globe className="w-6 h-6 text-[#da1e28]" />
        <p className="text-[11px] font-mono text-[var(--cds-text-02)]">
          {isAr ? 'تعذر جلب حدود الدولة من خدمة الخرائط — تحقق من الاتصال وحاول التبديل بين النطاقات.' : 'Could not fetch country bounds from the map service — check connection or switch scopes.'}
        </p>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <div className="w-6 h-6 border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin" />
      <p className="text-[11px] font-mono text-[var(--cds-text-03)]">
        {isAr ? 'جارِ توسيط الخريطة على الدولة المحددة...' : 'Centering map on the selected country...'}
      </p>
    </div>
  );
};

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
  // Uploaded GeoJSON sub-region boundaries (governorates/cities)
  const uploadedGj = useMemo(
    () => (widget.geoJson ? parseGeoJsonSource(widget.geoJson) : null),
    [widget.geoJson]
  );
  // Bounding box of the focused country, fetched from Nominatim for drill-down
  const [focusedBbox, setFocusedBbox] = useState<[number, number, number, number] | null>(null);
  useEffect(() => setFocusedBbox(null), [widget.focusCountry]);

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

  /** Aggregated rows for geo widgets: {label, value, sum, avg, count} per location, sorted desc */
  const geoRows = React.useMemo(() => {
    const loc = widget.categoryField || ''; // builder UI picks the location column via xAxis/categoryField
    const metric = widget.yAxis || '';
    const sourceRows = customData && customData.length > 0 ? customData : (dataset?.data || []);
    if (!loc || !sourceRows || sourceRows.length === 0) return [];
    const groups: { [key: string]: { values: number[]; count: number } } = {};
    sourceRows.forEach(r => {
      const labelRaw = r[loc];
      if (labelRaw === undefined || labelRaw === null || String(labelRaw).trim() === '') return;
      const label = String(labelRaw).trim();
      const rawY = metric ? r[metric] : undefined;
      const cleaned = typeof rawY === 'number' ? rawY : parseFloat(String(rawY).replace(/[\$,\s%]/g, ''));
      if (!groups[label]) groups[label] = { values: [], count: 0 };
      groups[label].count += 1;
      if (!isNaN(cleaned) && rawY !== undefined) groups[label].values.push(cleaned);
    });
    const chosenAgg: AggregationFunction = aggFunc === 'count' ? 'sum' : aggFunc;
    return Object.entries(groups)
      .map(([label, g]) => ({
        label,
        value: computeMathematicalAggregation(g.values, chosenAgg),
        sum: computeMathematicalAggregation(g.values, 'sum'),
        avg: computeMathematicalAggregation(g.values, 'avg'),
        count: g.count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [widget.categoryField, widget.yAxis, dataset, customData, aggFunc]);

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

  /** Guidance panel shown when the chosen columns yield no mappable data */
  const renderGeoHint = () => {
    const loc = widget.categoryField || '';
    const metric = widget.yAxis || '';
    const canAutofix = !loc && !!guessGeoLocationColumn(dataset?.columns);
    const rowSample = (dataset?.data || []).slice(0, 6).map(r => String(r[loc] ?? '')).filter(Boolean).join('، ');
    return (
      <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-2 text-center px-4" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <Globe className="w-7 h-7 text-[var(--cds-interactive-01)]" />
        <p className="text-xs font-bold text-[var(--cds-text-01)]">
          {language === 'ar' ? 'لا توجد مواقع قابلة للرسم على الخريطة بعد' : 'No mappable locations yet'}
        </p>
        <p className="text-[11px] text-[var(--cds-text-02)] leading-5 max-w-md">
          {language === 'ar'
            ? (!loc
              ? 'اختر "عمود الموقع الجغرافي" أدناه (عمود يحوي أسماء دول أو مناطق)، و"عمود المقياس" مثل المبيعات.'
              : loc === metric
                ? 'عمود الموقع وعمود المقياس متطابقان — اختر عمود موقع (نص) وعمود مقياس (رقمي) مختلفين.'
                : `لم يتم التعرّف على مواقع معروفة من عمود "${loc}"${rowSample ? ` (نموذج: ${rowSample})` : ''} — الخريطة التفاعلية ترسم الدول بأسمائها أو رموز ISO-3، أما المدن والمناطق الفرعية فتُرسم كنقاط بإحداثيات خط العرض/الطول.`)
            : (!loc
              ? 'Pick a location column (country/region names) and a metric column like sales below.'
              : 'No recognized countries in the chosen location column — the choropleth map draws countries by name or ISO-3 codes.')}
        </p>
        {canAutofix && (
          <p className="text-[10px] font-mono text-[#42be65]">
            {language === 'ar' ? 'تلميح: العمود الأقرب هو' : 'Suggested column:'}{' '}
            <span className="font-bold">{guessGeoLocationColumn(dataset?.columns)}</span>
          </p>
        )}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--cds-text-03)]">
          <MapPin className="w-3 h-3" />
          <span>{language === 'ar' ? 'Choropleth + Segments حسب ملء نطاق القيم' : 'Choropleth with sequential value scale'}</span>
        </div>
      </div>
    );
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
                formatter={val => <span className="text-[10px] font-mono text-[var(--cds-text-01)] font-semibold">{val}</span>}
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

      case 'geo': {
        const locationCol = widget.categoryField || '';
        const latCol = locationCol;
        const lonCol = widget.yAxis || '';
        const isMarkerMode = widget.geoMode === 'markers' || (isCoordColumn(locationCol) && isCoordColumn(lonCol));
        const maxPoints = 400;

        if (isMarkerMode) {
          // Real coordinates (lat/lng) -> scattergeo markers, folium-style
          const pts = (dataset?.data || [])
            .map(r => {
              const la = parseFloat(String(r[latCol] ?? '').replace(/[^\d.\-+eE]/g, ''));
              const lo = parseFloat(String(r[lonCol] ?? '').replace(/[^\d.\-+eE]/g, ''));
              return { la, lo };
            })
            .filter(p => !isNaN(p.la) && !isNaN(p.lo) && Math.abs(p.la) <= 90 && Math.abs(p.lo) <= 180)
            .slice(0, maxPoints);
          if (pts.length === 0) return renderGeoHint();
          const geoLayout: any = {
            margin: { t: 4, r: 8, b: 4, l: 8 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'rgba(0,0,0,0)',
            geo: {
              projection: { type: 'mercator' },
              showframe: false,
              coastlinewidth: 0.6,
              coastlinecolor: '#6f6f6f',
              showcountries: true,
              countrycolor: '#4b4b4b',
              showland: true,
              landcolor: isLight ? '#f4f4f4' : '#262626',
              showocean: true,
              oceancolor: isLight ? '#ffffff' : '#161616',
              bgcolor: 'rgba(0,0,0,0)',
            },
            font: { family: 'IBM Plex Mono, monospace', size: 10, color: axisStroke },
            dragmode: false,
          };
          return (
            <LazyPlot
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              layout={geoLayout}
              config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
              data={[
                {
                  type: 'scattergeo',
                  mode: 'markers',
                  lat: pts.map(p => p.la),
                  lon: pts.map(p => p.lo),
                  text: pts.map(p => `${latCol}: ${p.la}<br>${lonCol}: ${p.lo}`),
                  hovertemplate: '<b>%{text}</b><extra></extra>',
                  marker: { size: 8, color: primaryColor, line: { color: isLight ? '#ffffff' : '#161616', width: 1 } },
                },
              ]}
            />
          );
        }

        // Region labels (countries) -> choropleth colored by the aggregated metric
        const locations: string[] = [];
        const z: number[] = [];
        const text: string[] = [];
        // User-uploaded GeoJSON: fill polygons by matching area names against geoRows
        if (uploadedGj) {
          const gjLocs: string[] = [];
          const gjZ: number[] = [];
          const gjText: string[] = [];
          const rowsByLabel = new Map<string, { label: string; value: number; sum: number; avg: number; count: number }>();
          geoRows.forEach(gr => rowsByLabel.set(gr.label.trim().toLowerCase(), gr));
          uploadedGj.features.forEach((f: any) => {
            const key = f.properties?.[uploadedGj.featureProperty];
            if (key === undefined || key === null) return;
            const gr = rowsByLabel.get(String(key).trim().toLowerCase());
            if (gr) {
              // Plotly expects one location string per feature; repeat entries are fine as they share polygon ids.
              gjLocs.push(gr.label);
              gjZ.push(gr.value);
              gjText.push(gr.label);
            }
          });
          if (gjLocs.length === 0) return renderGeoHint();
          const { geo: gjAuto } = computeGeoJsonAutoFit(uploadedGj);
          const gjLayout: any = {
            margin: { t: 4, r: 8, b: 4, l: 8 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'rgba(0,0,0,0)',
            geo: {
              projection: { type: 'mercator' },
              showframe: false,
              ...gjAuto,
              bgcolor: 'rgba(0,0,0,0)',
            },
            font: { family: 'IBM Plex Mono, monospace', size: 10, color: axisStroke },
            dragmode: false,
          };
          const maxZgj = Math.max(...gjZ, 1);
          return (
            <LazyPlot
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              layout={gjLayout}
              config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
              data={[
                {
                  type: 'choropleth',
                  geojson: uploadedGj.json,
                  locations: gjLocs,
                  featureidkey: `properties.${uploadedGj.featureProperty}`,
                  z: gjZ,
                  text: gjText,
                  zmin: 0,
                  zmax: maxZgj,
                  colorscale: CARBON_MAP_SCALE,
                  marker: { line: { color: isLight ? '#8d8d8d' : '#393939', width: 0.6 } },
                  hovertemplate: `<b>%{text}</b><br>${yKey || 'value'}: %{z:,.0f}<extra></extra>`,
                  showscale: true,
                  colorbar: { thickness: 10, len: 0.75, outlinewidth: 0, tickfont: { size: 9, color: axisStroke } },
                },
              ]}
            />
          );
        }
        // Fallback: region labels (countries) -> choropleth colored by the aggregated metric
        geoRows.forEach(gr => {
          const code = geoLabelToCode(gr.label);
          if (code) {
            locations.push(code);
            z.push(gr.value);
            text.push(gr.label);
          }
        });
        const geoLayoutChoro: any = {
          margin: { t: 4, r: 8, b: 4, l: 8 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(0,0,0,0)',
          geo: {
            projection: { type: 'mercator' },
            showframe: false,
            showcoastlines: true,
            coastlinecolor: '#6f6f6f',
            coastlinewidth: 0.6,
            showcountries: true,
            countrycolor: '#4b4b4b',
            showland: true,
            landcolor: isLight ? '#f4f4f4' : '#262626',
            showocean: true,
            oceancolor: isLight ? '#ffffff' : '#161616',
            bgcolor: 'rgba(0,0,0,0)',
          },
          font: { family: 'IBM Plex Mono, monospace', size: 10, color: axisStroke },
          dragmode: false,
        };
        // Country drill-down scope: fetch the country's bounding box live from Nominatim
        if (widget.mapScope === 'country') {
          const focus = widget.focusCountry || ''; // ISO-3 code
          if (focusedBbox) {
            const [w, s, e, n] = focusedBbox; // [west, south, east, north]
            geoLayoutChoro.geo.lataxis = { range: [s, n] };
            geoLayoutChoro.geo.lonaxis = { range: [w, e] };
          } else if (focus) {
            return (
              <CountryFocusLoader
                iso3={focus}
                isAr={language === 'ar'}
                onLoaded={bbox => setFocusedBbox(bbox)}
              />
            );
          }
        } else {
          const scope = MAP_SCOPE_RANGES[widget.mapScope || 'world'];
          if (scope) {
            geoLayoutChoro.geo.lataxis = { range: scope.lat };
            geoLayoutChoro.geo.lonaxis = { range: scope.lon };
          }
        }
        if (locations.length === 0) return renderGeoHint();
        const maxZ = Math.max(...z, 1);
        return (
          <LazyPlot
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
            layout={geoLayoutChoro}
            config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
            data={[
              {
                type: 'choropleth',
                locationmode: 'ISO-3',
                locations,
                z,
                text,
                zmin: 0,
                zmax: maxZ,
                colorscale: CARBON_MAP_SCALE,
                marker: { line: { color: isLight ? '#8d8d8d' : '#393939', width: 0.6 } },
                hovertemplate: `<b>%{text}</b><br>${yKey || 'value'}: %{z:,.0f}<extra></extra>`,
                showscale: true,
                colorbar: { thickness: 10, len: 0.75, outlinewidth: 0, tickfont: { size: 9, color: axisStroke } },
              },
            ]}
          />
        );
      }

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
          <span className={`text-[10px] font-mono text-[var(--cds-interactive-01)] flex items-center gap-1 mt-0.5 ${widget.type === 'geo' ? 'hidden' : ''}`}>
            <Sigma className="w-3 h-3 text-[var(--cds-interactive-01)]" />
            <span>{aggTitle}</span>
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase bg-[var(--cds-background)] text-[var(--cds-interactive-01)] border border-[var(--cds-border-subtle)] px-2 py-0.5 font-bold">
          {widget.type === 'geo' ? (language === 'ar' ? 'خريطة' : 'MAP') : widget.type}
        </span>
      </div>
      <div className="h-56 w-full">{renderChart()}</div>
    </div>
  );
};

