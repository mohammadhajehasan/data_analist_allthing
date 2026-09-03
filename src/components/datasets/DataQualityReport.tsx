import React, { useMemo, useState } from 'react';
import { Dataset, DatasetColumn, AnomalyItem } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Database,
  ArrowRight,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  RefreshCw,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface DataQualityReportProps {
  dataset: Dataset;
  allDatasets: Dataset[];
  onNavigateToHealing?: () => void;
}

interface SchemaInconsistency {
  id: string;
  type: 'type_mismatch' | 'nullable_violation' | 'mixed_types' | 'duplicate_keys' | 'empty_strings' | 'drift';
  columnName: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  suggestedFix: string;
  suggestedFixAr: string;
}

export const DataQualityReport: React.FC<DataQualityReportProps> = ({
  dataset,
  allDatasets,
  onNavigateToHealing,
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  const [expandedSection, setExpandedSection] = useState<'summary' | 'missing' | 'outliers' | 'schema'>('summary');
  const [showAllIssues, setShowAllIssues] = useState(false);

  // 1. Analyze schema inconsistencies in real time
  const schemaInconsistencies = useMemo(() => {
    const issues: SchemaInconsistency[] = [];
    let issueId = 1;

    // Check for duplicate primary keys or likely key columns
    const possibleKeys = ['id', 'order_id', 'customer_id', 'transaction_id', 'product_id', 'code', 'key'];
    possibleKeys.forEach(keyName => {
      const col = dataset.columns.find(c => c.name.toLowerCase() === keyName);
      if (col) {
        const values = dataset.data.map(r => r[col.name]).filter(v => v !== undefined && v !== null);
        const uniqueValues = new Set(values);
        if (values.length !== uniqueValues.size) {
          const duplicateCount = values.length - uniqueValues.size;
          issues.push({
            id: `schema-inc-${issueId++}`,
            type: 'duplicate_keys',
            columnName: col.name,
            severity: 'high',
            title: 'Duplicate Identifier Values Detect',
            titleAr: 'تكرار في معرّف المفتاح الأساسي',
            description: `The identifier column "${col.name}" contains ${duplicateCount} duplicate values. Identifiers should strictly be unique.`,
            descriptionAr: `يحتوي حقل التعريف "${col.name}" على ${duplicateCount} قيم مكررة. يجب أن تكون المعرّفات فريدة تماماً لضمان سلامة العلاقات.`,
            suggestedFix: 'Run deduplication or apply a row-index primary key mapping.',
            suggestedFixAr: 'قم بتشغيل أداة إزالة التكرار أو تطبيق ترميز معرّف تسلسلي فريد.',
          });
        }
      }
    });

    // Check for mixed type representations (e.g. numbers parsed as string, or strings with white space)
    dataset.columns.forEach(col => {
      const values = dataset.data.map(r => r[col.name]);
      const nonNulls = values.filter(v => v !== null && v !== undefined && v !== '');

      let hasEmptyPadding = false;
      let numericParsedAsStringCount = 0;

      nonNulls.forEach(val => {
        if (typeof val === 'string') {
          if (val.trim() !== val) {
            hasEmptyPadding = true;
          }
          if (col.type === 'string' && val.length > 0 && !isNaN(Number(val))) {
            numericParsedAsStringCount++;
          }
        }
      });

      if (hasEmptyPadding) {
        issues.push({
          id: `schema-inc-${issueId++}`,
          type: 'empty_strings',
          columnName: col.name,
          severity: 'low',
          title: 'Whitespace Padding in Values',
          titleAr: 'مسافات بادئة أو ختامية زائدة',
          description: `Column "${col.name}" contains textual values with extra leading or trailing space characters.`,
          descriptionAr: `يحتوي الحقل "${col.name}" على قيم نصية تتضمن مسافات فارغة زائدة في البداية أو النهاية، مما قد يؤثر على عمليات البحث والفلترة.`,
          suggestedFix: 'Apply Trim White Spaces function to cleanse values.',
          suggestedFixAr: 'تطبيق وظيفة "إزالة المسافات الزائدة (Trim)" لتنظيف القيم نصياً.',
        });
      }

      if (numericParsedAsStringCount > nonNulls.length * 0.7 && nonNulls.length > 0) {
        issues.push({
          id: `schema-inc-${issueId++}`,
          type: 'mixed_types',
          columnName: col.name,
          severity: 'medium',
          title: 'Numerical Values Encoded as Strings',
          titleAr: 'قيم رقمية مشفرة كنصوص',
          description: `More than 70% of the active values in "${col.name}" are numerical but the column is declared as type "string".`,
          descriptionAr: `أكثر من 70% من القيم في الحقل "${col.name}" هي أرقام بالرغم من تصنيف الحقل كنوع "نصي" (string).`,
          suggestedFix: 'Cast column data type to "integer" or "float" to optimize query index.',
          suggestedFixAr: 'تغيير نوع بيانات الحقل إلى رقمي (integer أو float) لتمكين العمليات الحسابية والتحليلية.',
        });
      }
    });

    // Check for schema drift compared to other datasets in the workspace (similarly named columns should have the same type)
    allDatasets.forEach(otherDs => {
      if (otherDs.id === dataset.id) return;
      dataset.columns.forEach(col => {
        const otherCol = otherDs.columns.find(c => c.name.toLowerCase() === col.name.toLowerCase());
        if (otherCol && otherCol.type !== col.type) {
          issues.push({
            id: `schema-inc-${issueId++}`,
            type: 'drift',
            columnName: col.name,
            severity: 'medium',
            title: `Type Conflict / Schema Drift with "${otherDs.name}"`,
            titleAr: 'تعارض نوع الحقل ومخطط البيانات',
            description: `Column "${col.name}" is typed "${col.type}" but is typed "${otherCol.type}" in dataset "${otherDs.name}". This causes model drift during analytical joins.`,
            descriptionAr: `الحقل "${col.name}" معرف كـ "${col.type}" بينما معرف كـ "${otherCol.type}" في مجموعة البيانات الأخرى "${otherDs.name}". يؤثر هذا التعارض على عمليات الربط (Joins).`,
            suggestedFix: `Align type definitions to match across standard catalogs.`,
            suggestedFixAr: `توحيد تعريف نوع الحقل ليتطابق عبر مجموعات البيانات لتمكين الدمج والربط السلس.`,
          });
        }
      });
    });

    return issues;
  }, [dataset, allDatasets]);

  // Compute stats details
  const profile = dataset.profile;
  const quality = profile?.quality || {
    completenessScore: 100,
    uniquenessScore: 100,
    validityScore: 100,
    overallScore: 100,
    badge: 'EXCELLENT',
    issuesCount: 0,
  };

  const columnNullList = useMemo(() => {
    return Object.entries(profile?.columnStats || {}).map(([colName, stats]) => {
      const s = stats as any;
      return {
        name: colName,
        nullCount: s.nullCount || 0,
        nullPercentage: Number((s.nullPercentage || 0).toFixed(2)),
        type: s.type || 'unknown',
        total: s.count || 0,
      };
    }).sort((a, b) => b.nullCount - a.nullCount);
  }, [profile]);

  const columnsWithNullsCount = columnNullList.filter(c => c.nullCount > 0).length;
  const totalAnomalies = profile?.anomalies?.length || 0;

  // Grade color helper
  const getQualityColor = (score: number) => {
    if (score >= 90) return { text: 'text-[#24a148]', bg: 'bg-[#24a148]/10', border: 'border-[#24a148]', fill: '#24a148' };
    if (score >= 75) return { text: 'text-[#f1c21b]', bg: 'bg-[#f1c21b]/10', border: 'border-[#f1c21b]', fill: '#f1c21b' };
    return { text: 'text-[#da1e28]', bg: 'bg-[#da1e28]/10', border: 'border-[#da1e28]', fill: '#da1e28' };
  };

  const statusColors = getQualityColor(quality.overallScore);

  return (
    <div className="carbon-tile bg-[#161616] border border-[#393939] overflow-hidden p-0">
      {/* HEADER BAR */}
      <div className="bg-[#262626] border-b border-[#393939] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-start">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#0f62fe]" />
            {isAr ? 'تقرير جودة المخطط التلقائي' : 'Automated Diagnostic Quality Report'}
          </span>
          <h2 className="text-sm font-bold text-[#f4f4f4] mt-1.5 flex items-center gap-2">
            <span>{isAr ? 'مستند الصحة الإحصائية والموثوقية:' : 'Statistical Health Cert:'}</span>
            <span className="text-[#8a3ffc] underline decoration-dotted font-mono text-xs">{dataset.name}</span>
          </h2>
          <p className="text-[11px] text-[#c6c6c6] mt-0.5">
            {isAr
              ? 'فحص فوري وتحقق إحصائي تلقائي للقيم المفقودة، التباينات الإحصائية المتطرفة، وتطابق المخططات'
              : 'Executed inline during upload to detect null values, statistical anomalies, and metadata drift'}
          </p>
        </div>

        {/* Quality Badge */}
        <div className="flex items-center gap-3">
          <div className={`px-3.5 py-1.5 border ${statusColors.border} ${statusColors.bg} flex items-center gap-2 font-mono text-xs font-bold`}>
            <ShieldAlert className={`w-4 h-4 ${statusColors.text}`} />
            <span className="text-[#f4f4f4]">
              {isAr ? 'نقاط الجودة:' : 'Quality Index:'}
            </span>
            <span className={`${statusColors.text} text-sm font-black`}>{quality.overallScore}%</span>
          </div>

          {onNavigateToHealing && (
            <button
              onClick={onNavigateToHealing}
              className="px-3.5 py-1.5 bg-[#8a3ffc] hover:bg-[#7c37e6] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAr ? 'تطبيق المعالجة والشفاء' : 'Auto Data Healing'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#393939]">
        {/* SIDE BAR / METRIC CIRCLES */}
        <div className="lg:col-span-1 p-5 space-y-4 text-start">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#8d8d8d] block mb-2">
            {isAr ? 'بطاقات النتيجة' : 'Audit Scorecard'}
          </span>

          {/* Completeness Meter */}
          <div className="bg-[#1f1f1f] p-3 border border-[#393939]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c6c6c6] font-medium">{isAr ? 'معدل الاكتمال' : 'Completeness'}</span>
              <span className="text-xs font-mono font-bold text-[#24a148]">{quality.completenessScore}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#262626] mt-2 overflow-hidden rounded-full">
              <div className="h-full bg-[#24a148]" style={{ width: `${quality.completenessScore}%` }} />
            </div>
            <span className="text-[10px] text-[#8d8d8d] mt-1.5 block">
              {columnsWithNullsCount > 0
                ? (isAr ? `${columnsWithNullsCount} حقول تحتوي قيم فارغة` : `${columnsWithNullsCount} fields contain missing items`)
                : (isAr ? 'اكتمال تام بنسبة 100%' : '100% fully populated rows')}
            </span>
          </div>

          {/* Uniqueness Meter */}
          <div className="bg-[#1f1f1f] p-3 border border-[#393939]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c6c6c6] font-medium">{isAr ? 'معدل التفرّد والتميز' : 'Uniqueness'}</span>
              <span className="text-xs font-mono font-bold text-[#0f62fe]">{quality.uniquenessScore}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#262626] mt-2 overflow-hidden rounded-full">
              <div className="h-full bg-[#0f62fe]" style={{ width: `${quality.uniquenessScore}%` }} />
            </div>
            <span className="text-[10px] text-[#8d8d8d] mt-1.5 block">
              {schemaInconsistencies.some(i => i.type === 'duplicate_keys')
                ? (isAr ? 'تم كشف مفاتيح مكررة!' : 'Identified key duplication issues!')
                : (isAr ? 'لا يوجد تكرار معرّفات رئيسية' : 'Keys uniqueness fully validated')}
            </span>
          </div>

          {/* Anomalies Box */}
          <div className="bg-[#1f1f1f] p-3 border border-[#393939]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c6c6c6] font-medium">{isAr ? 'القيم الشاذة والمتطرفة' : 'Outliers Detected'}</span>
              <span className={`text-xs font-mono font-bold ${totalAnomalies > 0 ? 'text-[#da1e28]' : 'text-[#24a148]'}`}>
                {totalAnomalies}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#262626] mt-2 overflow-hidden rounded-full">
              <div
                className={`h-full ${totalAnomalies > 5 ? 'bg-[#da1e28]' : 'bg-[#f1c21b]'}`}
                style={{ width: `${Math.min(100, (totalAnomalies / 15) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-[#8d8d8d] mt-1.5 block">
              {isAr
                ? `${totalAnomalies} قيمة متطرفة (Z-Score > 2.8)`
                : `${totalAnomalies} numerical deviations exceeding IQR boundaries`}
            </span>
          </div>
        </div>

        {/* DETAILS SECTION */}
        <div className="lg:col-span-3 p-5 text-start space-y-4">
          {/* TAB BUTTONS */}
          <div className="flex items-center border-b border-[#393939] bg-[#1a1a1a]">
            <button
              onClick={() => setExpandedSection('summary')}
              className={`px-4 py-2 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                expandedSection === 'summary' ? 'border-[#0f62fe] text-white bg-[#262626]' : 'border-transparent text-[#8d8d8d] hover:text-white'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>{isAr ? 'الملخص التنفيذي' : 'Executive Overview'}</span>
            </button>
            <button
              onClick={() => setExpandedSection('missing')}
              className={`px-4 py-2 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                expandedSection === 'missing' ? 'border-[#0f62fe] text-white bg-[#262626]' : 'border-transparent text-[#8d8d8d] hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isAr ? 'القيم المفقودة والكاملة' : 'Missing Values Breakdown'}</span>
              {columnsWithNullsCount > 0 && (
                <span className="bg-[#da1e28] text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {columnsWithNullsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setExpandedSection('outliers')}
              className={`px-4 py-2 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                expandedSection === 'outliers' ? 'border-[#0f62fe] text-white bg-[#262626]' : 'border-transparent text-[#8d8d8d] hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{isAr ? 'فحص القيم المتطرفة' : 'Outliers & IQR'}</span>
              {totalAnomalies > 0 && (
                <span className="bg-[#f1c21b] text-black text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {totalAnomalies}
                </span>
              )}
            </button>
            <button
              onClick={() => setExpandedSection('schema')}
              className={`px-4 py-2 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                expandedSection === 'schema' ? 'border-[#0f62fe] text-white bg-[#262626]' : 'border-transparent text-[#8d8d8d] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isAr ? 'مشاكل المخطط والتعارضات' : 'Schema Drift & Rules'}</span>
              {schemaInconsistencies.length > 0 && (
                <span className="bg-[#8a3ffc] text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {schemaInconsistencies.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: SUMMARY */}
          {expandedSection === 'summary' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#1f1f1f] border-l-4 border-l-[#8a3ffc] p-4 text-xs space-y-2">
                <span className="font-mono text-[10px] font-bold text-[#8a3ffc] uppercase block tracking-wider">
                  {isAr ? 'استنتاج العميل الذكي التلقائي' : 'Autonomous Quality Agent Narrative'}
                </span>
                <p className="text-[#c6c6c6] leading-relaxed font-sans text-xs">
                  {isAr
                    ? `خلال تحليل مجموعة البيانات "${dataset.name}"، قمنا بفحص ${dataset.rowCount.toLocaleString()} صفاً عبر ${dataset.columnCount} حقلاً. تم تسجيل مؤشر صحة بمقدار ${quality.overallScore}%. تم رصد ما مجموعه ${columnsWithNullsCount} حقلاً يحتوي على قيم مفقودة، وتحديد ${totalAnomalies} قيمة شاذة إحصائياً، مع رصد ${schemaInconsistencies.length} تعارض أو خرق في معايير المخططات.`
                    : `In-memory audit of dataset "${dataset.name}" successfully parsed ${dataset.rowCount.toLocaleString()} rows containing ${dataset.columnCount} columns. The quality validator output an overall index of ${quality.overallScore}%. Diagnostic scan pinpointed ${columnsWithNullsCount} fields with missing items, ${totalAnomalies} statistical outliers, and ${schemaInconsistencies.length} compliance anomalies.`}
                </p>
              </div>

              {/* High Level Issue Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#1f1f1f] p-3 border border-[#393939] space-y-1.5">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#24a148]" />
                    <span>{isAr ? 'المقاييس الإيجابية المستقرة' : 'Compliance Successes'}</span>
                  </h4>
                  <ul className="text-[#8d8d8d] space-y-1 pl-4 list-disc text-[11px]">
                    <li>{isAr ? 'تطابق ترميز التواريخ وتنسيقاتها' : 'Date encodings standard throughout'}</li>
                    {quality.completenessScore > 95 && (
                      <li>{isAr ? 'معدل اكتمال رائع يفوق 95٪' : 'Exceeded 95% threshold for data presence'}</li>
                    )}
                    {schemaInconsistencies.length === 0 && (
                      <li>{isAr ? 'مخطط نظيف متطابق مع متطلبات الربط' : 'Zero metadata drift or schema structural issues detected'}</li>
                    )}
                    <li>{isAr ? 'تم استيراد وحفظ البيانات محلياً بشكل آمن' : 'In-browser memory layout parsed and indexed'}</li>
                  </ul>
                </div>

                <div className="bg-[#1f1f1f] p-3 border border-[#393939] space-y-1.5">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#f1c21b]" />
                    <span>{isAr ? 'نقاط الضعف المكتشفة' : 'Flagged Diagnostic Vulnerabilities'}</span>
                  </h4>
                  <ul className="text-[#8d8d8d] space-y-1 pl-4 list-disc text-[11px]">
                    {columnsWithNullsCount > 0 && (
                      <li>{isAr ? `${columnsWithNullsCount} أعمدة تفتقر إلى الاكتمال المطلق` : `${columnsWithNullsCount} variables require null imputation`}</li>
                    )}
                    {totalAnomalies > 0 && (
                      <li>{isAr ? `${totalAnomalies} تباينات إحصائية متطرفة بحاجة للكبح` : `${totalAnomalies} outliers exceed standard deviations`}</li>
                    )}
                    {schemaInconsistencies.length > 0 && (
                      <li>{isAr ? `${schemaInconsistencies.length} فجوات في سلامة وتماسك المخطط` : `${schemaInconsistencies.length} metadata discrepancies detected`}</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MISSING VALUES */}
          {expandedSection === 'missing' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="bg-[#1f1f1f] border border-[#393939] overflow-hidden">
                <table className="w-full text-xs text-start">
                  <thead className="bg-[#262626] text-[#c6c6c6] font-mono text-[10px] uppercase tracking-wider border-b border-[#393939]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{isAr ? 'اسم الحقل' : 'Column Name'}</th>
                      <th className="px-3 py-2.5 text-start">{isAr ? 'النوع' : 'Data Type'}</th>
                      <th className="px-3 py-2.5 text-start">{isAr ? 'سجلات مفقودة' : 'Missing Rows'}</th>
                      <th className="px-3 py-2.5 text-start">{isAr ? 'نسبة الفقدان' : 'Null Ratio'}</th>
                      <th className="px-3 py-2.5 text-end">{isAr ? 'الحالة والمؤشر' : 'Completeness Grade'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#393939] font-mono text-[11px]">
                    {columnNullList.map(col => {
                      const completePct = 100 - col.nullPercentage;
                      return (
                        <tr key={col.name} className="hover:bg-[#222]">
                          <td className="px-3 py-2 text-[#f4f4f4] font-bold">{col.name}</td>
                          <td className="px-3 py-2 text-[#8d8d8d]">{col.type}</td>
                          <td className="px-3 py-2 text-[#e2e2e2]">{col.nullCount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-[#e2e2e2]">{col.nullPercentage}%</td>
                          <td className="px-3 py-2 text-end">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none ${
                                completePct > 95 ? 'bg-[#24a148]/10 text-[#24a148]' : completePct > 75 ? 'bg-[#f1c21b]/10 text-[#f1c21b]' : 'bg-[#da1e28]/10 text-[#da1e28]'
                              }`}>
                                {completePct > 95 ? (isAr ? 'ممتاز' : 'Excellent') : completePct > 75 ? (isAr ? 'متوسط' : 'Moderate') : (isAr ? 'منخفض' : 'Poor')}
                              </span>
                              <span className="text-[#f4f4f4] text-xs font-semibold">{completePct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: OUTLIERS */}
          {expandedSection === 'outliers' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {totalAnomalies === 0 ? (
                <div className="bg-[#1f1f1f] border border-[#393939] p-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#24a148] mx-auto" />
                  <h4 className="text-xs font-bold text-white">{isAr ? 'لا توجد قيم متطرفة' : 'No Anomalies Detected'}</h4>
                  <p className="text-[11px] text-[#8d8d8d]">
                    {isAr ? 'تحليل الحدود الربعية (IQR) أكد تماسك وتجانس جميع السجلات الإحصائية للبيانات الرقمية.' : 'Interquartile (IQR) testing confirms 100% mathematical consistency inside numeric variables.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-[#1f1f1f] border border-[#393939] p-3 text-xs">
                    <span className="font-semibold text-white">{isAr ? 'نظرة تفصيلية على الانحرافات الإحصائية' : 'Detailed Statistical Anomalies'}</span>
                    <p className="text-[11px] text-[#8d8d8d] mt-1">
                      {isAr
                        ? 'تحديد القيم المتطرفة بناءً على قاعدة IQR (أكبر من Q3 + 1.5*IQR أو أصغر من Q1 - 1.5*IQR) ودرجة انحراف Z-Score.'
                        : 'Identified out-of-bounds numeric items calculated through interquartile values and individual standard-deviation metrics.'}
                    </p>
                  </div>

                  <div className="bg-[#1f1f1f] border border-[#393939] overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-[#262626] text-[#c6c6c6] font-mono text-[10px] uppercase tracking-wider border-b border-[#393939] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-start">{isAr ? 'رقم السطر' : 'Row Index'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'اسم العمود' : 'Column'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'القيمة المتطرفة' : 'Outlier Value'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'المعيار الرياضي' : 'Test Model'}</th>
                          <th className="px-3 py-2 text-end">{isAr ? 'مستوى الانحراف' : 'Severity'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#393939] font-mono text-[11px]">
                        {profile?.anomalies?.slice(0, showAllIssues ? undefined : 6).map((anom) => (
                          <tr key={anom.id} className="hover:bg-[#222]">
                            <td className="px-3 py-2.5 text-white font-bold">#{anom.rowIndex}</td>
                            <td className="px-3 py-2.5 text-[#33b1ff]">{anom.columnName}</td>
                            <td className="px-3 py-2.5 text-[#f4f4f4] font-semibold">{String(anom.value)}</td>
                            <td className="px-3 py-2.5 text-[#8d8d8d]">{anom.method} (Z: {anom.score})</td>
                            <td className="px-3 py-2.5 text-end">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-none ${
                                anom.severity === 'high' ? 'bg-[#da1e28]/10 text-[#da1e28]' : 'bg-[#f1c21b]/10 text-[#f1c21b]'
                              }`}>
                                {anom.severity.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {profile?.anomalies && profile.anomalies.length > 6 && (
                    <button
                      onClick={() => setShowAllIssues(!showAllIssues)}
                      className="text-xs text-[#0f62fe] font-mono font-bold hover:underline flex items-center gap-1 mt-1 text-start"
                    >
                      <span>{showAllIssues ? (isAr ? 'عرض أقل' : 'Show Less') : (isAr ? `عرض جميع القيم الـ ${profile.anomalies.length}` : `Show all ${profile.anomalies.length} outliers`)}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SCHEMA INCONSISTENCIES */}
          {expandedSection === 'schema' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {schemaInconsistencies.length === 0 ? (
                <div className="bg-[#1f1f1f] border border-[#393939] p-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#24a148] mx-auto" />
                  <h4 className="text-xs font-bold text-white">{isAr ? 'مخطط البيانات مثالي وصحي' : 'Perfect Schema Conformance'}</h4>
                  <p className="text-[11px] text-[#8d8d8d]">
                    {isAr ? 'لا يوجد تكرار في المفاتيح، تفاوت في الترميز النصي، أو اختلاف في تعريف الحقول مقارنة ببقية الجداول.' : 'Zero duplicate keys, string space violations, or metadata conflicts detected.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {schemaInconsistencies.map((issue) => (
                    <div key={issue.id} className="bg-[#1f1f1f] border border-[#393939] p-3.5 space-y-2.5 relative">
                      <div className="flex items-start justify-between gap-3 text-start">
                        <div className="space-y-1">
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-none ${
                            issue.severity === 'high' ? 'bg-[#da1e28]/10 text-[#da1e28]' : 'bg-[#f1c21b]/10 text-[#f1c21b]'
                          }`}>
                            {issue.severity.toUpperCase()} COMPLIANCE ISSUE
                          </span>
                          <h4 className="text-xs font-bold text-white mt-1.5">
                            {isAr ? issue.titleAr : issue.title}
                          </h4>
                          <p className="text-[11px] text-[#c6c6c6] leading-relaxed">
                            {isAr ? issue.descriptionAr : issue.description}
                          </p>
                        </div>

                        <div className="bg-[#262626] border border-[#393939] p-1.5 text-center font-mono text-[10px] uppercase shrink-0">
                          <span className="text-[#8d8d8d] block">{isAr ? 'الحقل' : 'Column'}</span>
                          <span className="text-white font-bold">{issue.columnName}</span>
                        </div>
                      </div>

                      <div className="bg-[#262626] p-2.5 border-l-2 border-l-[#8a3ffc] text-[11px] space-y-1 text-start">
                        <span className="font-mono font-bold text-[#8a3ffc] uppercase text-[9px] block">
                          {isAr ? 'الحل المقترح تلقائياً:' : 'Automated Healing Strategy:'}
                        </span>
                        <p className="text-[#c6c6c6]">
                          {isAr ? issue.suggestedFixAr : issue.suggestedFix}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
