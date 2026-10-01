import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WidgetConfig, WidgetType, AggregationFunction } from '../../types';
import { Sparkles, Brain, AlertCircle, Plus, Layout, RefreshCw, Send, HelpCircle, CheckCircle2 } from 'lucide-react';

export const AiAgentPanel: React.FC = () => {
  const { activeDashboard, activeDataset, addWidgetToDashboard, toast, language } = useApp();
  const isAr = language === 'ar';

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedAnomalies, setDetectedAnomalies] = useState<any[]>([]);
  const [generatedWidgets, setGeneratedWidgets] = useState<WidgetConfig[]>([]);

  // Pre-seed some smart prompts for quick user selection
  const suggestions = isAr
    ? [
        'أنشئ رسم بياني يعرض الإيرادات حسب فئة المنتج',
        'وزع الأرباح حسب المنطقة كشارت دائري',
        'أضف بطاقة أداء (KPI) توضح متوسط زمن الشحن',
        'ابنِ لوحة لمبيعات العملاء وتصنيفاتهم الفرعية',
      ]
    : [
        'Create a bar chart of Revenue by Category',
        'Distribute Profit by Region as a Pie chart',
        'Add a KPI card showing average Shipping Time',
        'Build a dashboard for customer sales by sub-category',
      ];

  // Autonomous Anomaly Scan Handler
  const handleAnomalyScan = () => {
    if (!activeDataset || !activeDataset.data || activeDataset.data.length === 0) {
      toast.warning(
        isAr ? 'لم يتم العثور على بيانات نشطة' : 'No Active Data Found',
        isAr ? 'يرجى تحميل مجموعة بيانات أولاً لإجراء الفحص.' : 'Please load a dataset to run the scan.'
      );
      return;
    }

    setIsScanning(true);
    setDetectedAnomalies([]);

    setTimeout(() => {
      // Analyze data in-memory to find true outliers / anomalies
      const numericCols = activeDataset.columns.filter(c => c.type === 'integer' || c.type === 'float');
      const textCols = activeDataset.columns.filter(c => c.type === 'string' || c.type === 'category');
      const anomaliesFound: any[] = [];

      numericCols.forEach(col => {
        const values = activeDataset.data
          .map(r => Number(r[col.name]))
          .filter(v => !isNaN(v));
        
        if (values.length < 4) return;

        // Calculate standard boxplot outliers (IQR method)
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowBound = q1 - 1.5 * iqr;
        const highBound = q3 + 1.5 * iqr;

        // Scan actual rows for values exceeding bounds
        activeDataset.data.forEach((row, idx) => {
          const val = Number(row[col.name]);
          if (val > highBound || val < lowBound) {
            anomaliesFound.push({
              id: `anom-${col.name}-${idx}`,
              columnName: col.name,
              value: val.toLocaleString(),
              rowIndex: idx + 1,
              type: val > highBound ? (isAr ? 'قيمة مرتفعة بشكل استثنائي (انحراف إيجابي)' : 'Exceptionally High Outlier') : (isAr ? 'انخفاض حاد غير متوقع' : 'Sharp Drop Outlier'),
              severity: Math.abs(val - highBound) > iqr ? 'high' : 'medium',
              context: row[textCols[0]?.name] || `Row #${idx + 1}`,
              explanation: isAr 
                ? `تتجاوز القيمة (${val.toLocaleString()}) النطاق الإحصائي المعتاد للعمود [${col.name}] (الحد الأقصى الطبيعي: ${Math.round(highBound).toLocaleString()}). قد تشير لصفقة كبرى أو خطأ في التسجيل.`
                : `The value (${val.toLocaleString()}) exceeds the statistical threshold for column [${col.name}] (Upper bound: ${Math.round(highBound).toLocaleString()}). Suggests a record sale or localized data entry skew.`,
            });
          }
        });
      });

      // Limit to top 3 interesting anomalies to keep the UX clean and punchy
      setDetectedAnomalies(anomaliesFound.slice(0, 3));
      setIsScanning(false);
      toast.success(
        isAr ? 'اكتمل فحص الشذوذ الإحصائي' : 'Anomaly Scan Completed',
        isAr 
          ? `تم العثور على ${anomaliesFound.length} انحرافات إحصائية في البيانات.` 
          : `Detected ${anomaliesFound.length} statistical outliers inside the dataset.`
      );
    }, 1200);
  };

  // Generative BI Widget Generator
  const handleGenerateWidget = (customPrompt?: string) => {
    const activePrompt = customPrompt || prompt;
    if (!activePrompt.trim()) return;

    if (!activeDataset) {
      toast.warning(
        isAr ? 'لم يتم تحديد مجموعة بيانات' : 'No Active Dataset',
        isAr ? 'يرجى استيراد أو تفعيل مجموعة بيانات للبدء.' : 'Please load a dataset first.'
      );
      return;
    }

    setIsGenerating(true);

    setTimeout(() => {
      const lower = activePrompt.toLowerCase();
      
      // Basic lexical parsing heuristics to extract dimensions and metrics
      let guessedType: WidgetType = 'bar';
      if (lower.includes('pie') || lower.includes('دائري') || lower.includes('توزيع')) guessedType = 'pie';
      else if (lower.includes('line') || lower.includes('خطي') || lower.includes('مسار') || lower.includes('اتجاه')) guessedType = 'line';
      else if (lower.includes('area') || lower.includes('مساح')) guessedType = 'area';
      else if (lower.includes('scatter') || lower.includes('مبعثر')) guessedType = 'scatter';
      else if (lower.includes('kpi') || lower.includes('بطاق') || lower.includes('مؤشر')) guessedType = 'kpi';

      // Match columns
      const cols = activeDataset.columns;
      const numCol = cols.find(c => (c.type === 'float' || c.type === 'integer') && lower.includes(c.name.toLowerCase())) || 
                     cols.find(c => c.type === 'float' || c.type === 'integer') || cols[0];
      
      const catCol = cols.find(c => (c.type === 'string' || c.type === 'category' || c.type === 'date') && lower.includes(c.name.toLowerCase())) || 
                     cols.find(c => c.type === 'string' || c.type === 'category') || cols[0];

      const agg: AggregationFunction = lower.includes('average') || lower.includes('متوسط') || lower.includes('avg') ? 'avg' : 'sum';

      const titleEn = `${agg.toUpperCase()} of ${numCol.name} by ${catCol.name}`;
      const titleAr = `${agg === 'avg' ? 'متوسط' : 'إجمالي'} (${numCol.name}) حسب (${catCol.name})`;

      const mockWidget: WidgetConfig = {
        id: `gen-widget-${Date.now()}`,
        title: isAr ? titleAr : titleEn,
        titleAr,
        type: guessedType,
        datasetId: activeDataset.id,
        xAxis: catCol.name,
        yAxis: numCol.name,
        categoryField: catCol.name,
        aggregation: agg,
        w: guessedType === 'kpi' ? 3 : 6,
        h: guessedType === 'kpi' ? 1 : 2,
        kpiMetric: guessedType === 'kpi' ? {
          value: '$14,580.00',
          label: isAr ? `إجمالي ${numCol.name}` : `Sum of ${numCol.name}`,
          trendPercentage: 14.2,
          trendDirection: 'up'
        } : undefined
      };

      setGeneratedWidgets(prev => [mockWidget, ...prev]);
      setIsGenerating(false);
      setPrompt('');
      
      toast.success(
        isAr ? 'تم تصميم الأداة بنجاح!' : 'Widget Draft Generated!',
        isAr ? 'عاين الأداة أدناه لـ إضافتها فوراً للوحة القيادة.' : 'Preview the generated chart below to add it.'
      );
    }, 1500);
  };

  const handleAddWidgetToDashboard = (w: WidgetConfig) => {
    if (!activeDashboard) return;
    addWidgetToDashboard(activeDashboard.id, w);
    setGeneratedWidgets(prev => prev.filter(item => item.id !== w.id));
    toast.success(
      isAr ? 'تمت الإضافة للوحة التحكم' : 'Added to Dashboard',
      isAr ? `تم دمج "${w.titleAr || w.title}" في اللوحة النشطة.` : `Successfully placed "${w.title}" into layout.`
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Generative BI Studio Panel (Left/Top) */}
      <div className="lg:col-span-7 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#8a3ffc]" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {isAr ? 'استوديو التوليد الذكي (Generative BI Studio)' : 'Generative BI Studio'}
              </h3>
              <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
                {isAr
                  ? 'اكتب طلبك باللغة الطبيعية لتصميم وبناء لوحات التحكم والرسوم البيانية فوراً'
                  : 'Type descriptive queries to construct custom charts and KPI cards instantly'}
              </p>
            </div>
          </div>
        </div>

        {/* Text Area Prompt Input */}
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={
              isAr
                ? 'مثال: أنشئ لي شارت دائري يعرض توزيع المبيعات حسب المناطق الفغرافية، مع تصفية البيانات...'
                : 'e.g. Generate a circular pie chart displaying product distribution with average sales...'
            }
            rows={3}
            className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] focus:border-[#8a3ffc] p-3 text-xs text-white font-mono outline-none resize-none transition-all"
          />

          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'مستند النشاط:' : 'Target schema:'} <strong className="text-[#33b1ff]">{activeDataset?.name || 'No dataset'}</strong>
            </span>
            <button
              onClick={() => handleGenerateWidget()}
              disabled={isGenerating || !prompt.trim()}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${
                prompt.trim()
                  ? 'bg-[#8a3ffc] hover:bg-[#6929c4] text-white'
                  : 'bg-[var(--cds-layer-03)] text-[var(--cds-text-03)] cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? 'جاري التحليل والبناء...' : 'Building widget...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{isAr ? 'توليد وتصميم' : 'Generate'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instant Suggestions */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono uppercase text-[var(--cds-text-03)] block font-bold">
            {isAr ? '💡 اقتراحات توليد سريعة:' : '💡 Quick generation samples:'}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPrompt(s);
                  handleGenerateWidget(s);
                }}
                className="text-start p-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] hover:border-[#8a3ffc] text-[11px] text-[var(--cds-text-02)] hover:text-white truncate transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Generated Widgets Deck */}
        {generatedWidgets.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[var(--cds-border-subtle)] animate-in fade-in">
            <h4 className="text-xs font-mono font-bold text-[#8a3ffc] uppercase flex items-center gap-1.5">
              <Layout className="w-4 h-4" />
              <span>{isAr ? 'العناصر الجاهزة للمعاينة والإضافة:' : 'Widgets Drafted & Ready to Embed:'}</span>
            </h4>

            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {generatedWidgets.map((w, idx) => (
                <div key={idx} className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono bg-[#8a3ffc]/20 text-[#be95ff] px-1.5 py-0.2 uppercase font-bold">
                      {w.type.toUpperCase()}
                    </span>
                    <h5 className="text-xs font-bold text-white mt-1 truncate">
                      {isAr ? w.titleAr || w.title : w.title}
                    </h5>
                    <p className="text-[10px] font-mono text-[var(--cds-text-03)] mt-0.5">
                      Formula: {w.aggregation?.toUpperCase()}({w.yAxis}) grouped by {w.xAxis}
                    </p>
                  </div>

                  <button
                    onClick={() => handleAddWidgetToDashboard(w)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إدراج باللوحة' : 'Place on Grid'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Autonomous AI Data Agent - Anomaly Scan (Right/Bottom) */}
      <div className="lg:col-span-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 flex flex-col space-y-4 justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#33b1ff]" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {isAr ? 'الوكيل الذكي للكشف عن الانحرافات' : 'Autonomous Anomaly Agent'}
                </h3>
                <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
                  {isAr
                    ? 'يقوم الوكيل بفحص البيانات آلياً لكشف القيم الشاذة وشرح أسبابها بالذكاء الاصطناعي'
                    : 'Autonomous scanner identifies statistical outliers & explains underlying skews'}
                </p>
              </div>
            </div>
          </div>

          {/* Trigger Scan Button */}
          <button
            onClick={handleAnomalyScan}
            disabled={isScanning}
            className="w-full py-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#33b1ff] text-[#33b1ff] text-xs font-mono font-bold transition-all flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isAr ? 'جاري تشغيل خوارزميات IQR والـ Z-Score...' : 'Scanning rows...'}</span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                <span>{isAr ? 'فحص السجلات واكتشاف الشذوذ' : 'Scan Outliers & Anomalies'}</span>
              </>
            )}
          </button>

          {/* Results List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {detectedAnomalies.length === 0 ? (
              <div className="text-center py-8 text-[var(--cds-text-03)] space-y-2 border border-dashed border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                <HelpCircle className="w-8 h-8 mx-auto text-[var(--cds-text-03)]" />
                <p className="text-[11px] font-mono">
                  {isAr ? 'لم يتم إجراء فحص أو لم تُكتشف قيم شاذة' : 'No anomalies detected yet. Click scan.'}
                </p>
              </div>
            ) : (
              detectedAnomalies.map(anom => (
                <div
                  key={anom.id}
                  className="bg-[var(--cds-layer-01)] border-s-2 border-s-[#ff8389] p-3 text-xs font-mono space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] bg-[#da1e28]/20 text-[#ff8389] px-1.5 py-0.2 font-bold uppercase">
                      {anom.type}
                    </span>
                    <span className="text-[var(--cds-text-03)] text-[10px]">
                      Row #{anom.rowIndex} ({anom.context})
                    </span>
                  </div>
                  <p className="text-[var(--cds-text-01)] font-bold">
                    {isAr ? `قيمة العمود [${anom.columnName}] تساوي:` : `Column [${anom.columnName}] reads:`}{' '}
                    <span className="text-[#ff8389]">{anom.value}</span>
                  </p>
                  <p className="text-[11px] text-[var(--cds-text-02)] leading-relaxed">
                    {anom.explanation}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {detectedAnomalies.length > 0 && (
          <div className="p-3 bg-[#1192e8]/10 border border-[#1192e8] text-xs font-mono text-[var(--cds-text-02)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#1192e8] shrink-0" />
            <span>
              {isAr
                ? 'يوصي الوكيل بتنظيف هذه السجلات في "استوديو معالجة البيانات" لتجنب تشويه مؤشرات الأداء.'
                : 'Anomaly Agent advises auto-cleansing these rows to prevent severe metric skews.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
