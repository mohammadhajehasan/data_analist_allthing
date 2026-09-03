import { CustomWorkflowNode, WorkflowDefinition } from './types';
import { Edge } from '@xyflow/react';

export interface WorkflowTemplateItem extends WorkflowDefinition {
  category: 'cleaning' | 'reporting' | 'alerts' | 'privacy' | 'etl' | 'forecasting';
  categoryAr: string;
  difficulty: 'مبتدئ' | 'متوسط' | 'متقدم';
  difficultyEn: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  stepSummaryAr: string[];
  stepSummaryEn: string[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateItem[] = [
  // 1. تنظيف البيانات وتحليلها
  {
    id: 'template-data-clean-analyze',
    name: 'Data Quality Profiling & Self-Healing Pipeline',
    nameAr: 'تنظيف البيانات وتحليلها وفحص الجودة الذاتي',
    description: 'Scans uploaded datasets, detects missing values and statistical outliers with AI, evaluates quality gate thresholds, applies smart imputation, and exports a sanitized dataset.',
    descriptionAr: 'يفحص مجموعات البيانات فور رفعها، ويكتشف الشذوذ والقيم الفارغة بالذكاء الاصطناعي، ويطبق بوابة الجودة، وينفذ التعويض الذكي، ثم يصدر نسخة منظفة ومحدثة.',
    category: 'cleaning',
    categoryAr: 'تنظيف وتحليل البيانات',
    difficulty: 'مبتدئ',
    difficultyEn: 'Beginner',
    estimatedTime: '~1.5 ثانية',
    stepSummaryAr: ['مشغّل رفع البيانات', 'فاحص الجودة والشذوذ', 'بوابة الجودة (>= 80%)', 'التنظيف الذاتي والتعويض', 'سارد الرؤى التنفيذي', 'حفظ الجدول المنظف'],
    stepSummaryEn: ['Dataset Trigger', 'AI Quality Scanner', 'Quality Gate (>= 80%)', 'Smart Cleaner', 'AI Insights Storyteller', 'Export Clean Dataset'],
    isActive: true,
    runCount: 28,
    tags: ['تنظيف البيانات', 'فحص الجودة', 'معالجة الشذوذ', 'Data Cleaning', 'Auto-Healing'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 1800000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-clean-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_dataset',
          label: 'Dataset Ingestion Trigger',
          labelAr: 'مشغّل رفع وتحديث البيانات',
          description: 'Fires whenever a dataset is uploaded or selected',
          descriptionAr: 'ينطلق تلقائياً عند رفع أو اختيار أي مجموعة بيانات',
          category: 'trigger',
          status: 'idle',
          config: {
            datasetId: 'active',
            triggerMode: 'on_upload_or_edit',
          }
        }
      },
      {
        id: 'node-clean-2',
        type: 'workflowCustom',
        position: { x: 350, y: 150 },
        data: {
          nodeType: 'ai_profiler',
          label: 'AI Quality & Anomaly Scanner',
          labelAr: 'فاحص الجودة واكتشاف الشذوذ',
          description: 'Calculates null percentages, schema health, and statistical outliers',
          descriptionAr: 'يحلل القيم المفقودة، سلامة البنية، واكتشاف القيم الشاذة إحصائياً',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            sensitivity: 'medium',
            detectOutliers: true,
          }
        }
      },
      {
        id: 'node-clean-3',
        type: 'workflowCustom',
        position: { x: 650, y: 150 },
        data: {
          nodeType: 'condition_rule',
          label: 'Quality Score >= 80%?',
          labelAr: 'هل نسبة الجودة >= 80%؟',
          description: 'Branches workflow depending on data completeness threshold',
          descriptionAr: 'يفرع المسار بحسب استيفاء معايير الجودة المحددة',
          category: 'logic',
          status: 'idle',
          config: {
            field: 'overallScore',
            operator: 'gte',
            threshold: 80,
          }
        }
      },
      {
        id: 'node-clean-4',
        type: 'workflowCustom',
        position: { x: 960, y: 60 },
        data: {
          nodeType: 'ai_cleaner',
          label: 'Smart Imputation & Deduplication',
          labelAr: 'التعويض الذكي وإزالة التكرار',
          description: 'Fills missing values using mean/median and drops redundant records',
          descriptionAr: 'يعالج القيم الفارغة ويزيل السجلات المكررة آلياً',
          category: 'ai',
          status: 'idle',
          config: {
            cleanStrategy: 'smart_impute',
            removeDuplicates: true,
          }
        }
      },
      {
        id: 'node-clean-5',
        type: 'workflowCustom',
        position: { x: 1260, y: 60 },
        data: {
          nodeType: 'ai_summarizer',
          label: 'AI Synthesis Storyteller',
          labelAr: 'سارد الرؤى والتوصيات الذكي',
          description: 'Summarizes data quality improvements and key trends',
          descriptionAr: 'يلخص تحسينات الجودة المستخلصة وأهم النتائج',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            tone: 'strategic',
          }
        }
      },
      {
        id: 'node-clean-6',
        type: 'workflowCustom',
        position: { x: 1560, y: 60 },
        data: {
          nodeType: 'action_export_dataset',
          label: 'Save Cleaned Dataset',
          labelAr: 'حفظ وتصدير الجدول المنظف',
          description: 'Creates a sanitized production-ready dataset version',
          descriptionAr: 'ينشئ نسخة منظفة ومحدثة في قائمة مجموعات البيانات',
          category: 'action',
          status: 'idle',
          config: {
            suffix: '_Cleaned_Auto',
            tag: 'Automated-Pipeline',
          }
        }
      },
      {
        id: 'node-clean-alert',
        type: 'workflowCustom',
        position: { x: 960, y: 280 },
        data: {
          nodeType: 'action_notify',
          label: 'Critical Quality Alert',
          labelAr: 'إرسال تنبيه انخفاض الجودة',
          description: 'Dispatches emergency alert with audit issue summary',
          descriptionAr: 'يرسل إشعاراً عاجلاً للمسؤولين بتقرير المشكلات المكتشفة',
          category: 'action',
          status: 'idle',
          config: {
            channel: 'system_toast',
            priority: 'high',
          }
        }
      }
    ],
    edges: [
      { id: 'e-c1-2', source: 'node-clean-1', target: 'node-clean-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-c2-3', source: 'node-clean-2', target: 'node-clean-3', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-c3-pass', source: 'node-clean-3', sourceHandle: 'pass', target: 'node-clean-4', label: 'Pass (>= 80%)', style: { stroke: '#24a148', strokeWidth: 2 } },
      { id: 'e-c3-fail', source: 'node-clean-3', sourceHandle: 'fail', target: 'node-clean-alert', label: 'Fail (< 80%)', style: { stroke: '#da1e28', strokeWidth: 2 } },
      { id: 'e-c4-5', source: 'node-clean-4', target: 'node-clean-5', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
      { id: 'e-c5-6', source: 'node-clean-5', target: 'node-clean-6', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  },

  // 2. توليد تقرير شهري / تنفيذي
  {
    id: 'template-monthly-report',
    name: 'Automated Monthly Executive Report Generator',
    nameAr: 'توليد التقرير الشهري والتنفيذي الدوري تلقائياً',
    description: 'Runs on a monthly schedule, aggregates key financial and operational KPIs, runs Gemini AI statistical narrative synthesis, and publishes a formatted interactive executive report.',
    descriptionAr: 'يعمل بجدولة شهرية أو فورية، ويحسب مؤشرات الأداء المالية والتشغيلية، ثم يولد سرداً تحليلياً بالذكاء الاصطناعي وينشر تقريراً تنفيذياً تفاعلياً.',
    category: 'reporting',
    categoryAr: 'تقارير دورية وتنفيذية',
    difficulty: 'مبتدئ',
    difficultyEn: 'Beginner',
    estimatedTime: '~2.0 ثانية',
    stepSummaryAr: ['مشغّل شهري مجدول', 'حساب مؤشرات الأداء', 'سارد الرؤى التنفيذي (Gemini)', 'نشر التقرير التفاعلي', 'إرسال إشعار الإنجاز'],
    stepSummaryEn: ['Monthly Schedule', 'KPI Aggregator', 'Gemini Storyteller', 'Publish Executive Report', 'Send Completion Alert'],
    isActive: true,
    runCount: 19,
    tags: ['تقارير شهرية', 'الذكاء الاصطناعي', 'لوحة مؤشرات', 'Executive Report', 'Monthly Automation'],
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 7200000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-rep-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_schedule',
          label: 'Monthly Schedule Trigger (01st 08:00)',
          labelAr: 'مشغّل مجدول شهرياً (أول الشهر 08:00 AM)',
          description: 'Executes automatically at the start of each month',
          descriptionAr: 'يعمل تلقائياً في بداية كل شهر لمعالجة بيانات الفترة السابقة',
          category: 'trigger',
          status: 'idle',
          config: {
            frequency: 'monthly',
            time: '08:00',
          }
        }
      },
      {
        id: 'node-rep-2',
        type: 'workflowCustom',
        position: { x: 360, y: 150 },
        data: {
          nodeType: 'aggregation_kpi',
          label: 'KPI & Revenue Aggregator',
          labelAr: 'حساب مؤشرات الأداء والمجاميع',
          description: 'Calculates totals, averages, growth metrics, and record counts',
          descriptionAr: 'يحسب إجمالي المبيعات، ومعدلات النمو، والمتوسطات الإحصائية',
          category: 'logic',
          status: 'idle',
          config: {
            metrics: ['sum(revenue)', 'avg(margin)', 'count(transactions)'],
          }
        }
      },
      {
        id: 'node-rep-3',
        type: 'workflowCustom',
        position: { x: 670, y: 150 },
        data: {
          nodeType: 'ai_summarizer',
          label: 'Gemini Executive Storyteller',
          labelAr: 'سارد الرؤى والملخص التنفيذي',
          description: 'Transforms numbers into high-impact strategic briefing insights',
          descriptionAr: 'يحول الأرقام والمؤشرات إلى سرد استراتيجي وتوصيات تنفيذية ذكية',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            tone: 'strategic',
            language: 'ar',
          }
        }
      },
      {
        id: 'node-rep-4',
        type: 'workflowCustom',
        position: { x: 980, y: 150 },
        data: {
          nodeType: 'action_generate_report',
          label: 'Publish Executive Report',
          labelAr: 'نشر التقرير التنفيذي في المنصة',
          description: 'Publishes interactive report with charts to team workspace',
          descriptionAr: 'يحفظ التقرير التفاعلي في قسم التقارير مع إشعار الفريق',
          category: 'action',
          status: 'idle',
          config: {
            autoPublish: true,
            format: 'interactive_report',
          }
        }
      },
      {
        id: 'node-rep-5',
        type: 'workflowCustom',
        position: { x: 1290, y: 150 },
        data: {
          nodeType: 'action_notify',
          label: 'Dispatch Broadcast Alert',
          labelAr: 'إرسال إشعار نشر التقرير',
          description: 'Alerts leadership that monthly executive brief is ready',
          descriptionAr: 'يرسل إشعاراً فورياً للإدارة بجاهزية التقرير الشهري',
          category: 'action',
          status: 'idle',
          config: {
            channel: 'system_toast',
            priority: 'medium',
          }
        }
      }
    ],
    edges: [
      { id: 'e-r1-2', source: 'node-rep-1', target: 'node-rep-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-r2-3', source: 'node-rep-2', target: 'node-rep-3', animated: true, style: { stroke: '#009d9a', strokeWidth: 2 } },
      { id: 'e-r3-4', source: 'node-rep-3', target: 'node-rep-4', animated: true, style: { stroke: '#8a3ffc', strokeWidth: 2 } },
      { id: 'e-r4-5', source: 'node-rep-4', target: 'node-rep-5', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  },

  // 3. تحويل وتصفية البيانات (ETL & Transformation)
  {
    id: 'template-etl-transform',
    name: 'Multi-Stage ETL, Filtering & Data Transformation',
    nameAr: 'تحويل وتصفية البيانات وإثراء المؤشرات (ETL Pipeline)',
    description: 'Ingests source datasets, filters target records based on custom criteria, executes calculated metrics transformation, and exports a refined subset.',
    descriptionAr: 'يستقبل البيانات الأولية، ويصفي السجلات وفق شروط محددة، وينفذ تحويلات الحقول والمعادلات، ويحسب المؤشرات ثم يصدر جدولاً مصقولاً.',
    category: 'etl',
    categoryAr: 'تحويل وتصفية البيانات (ETL)',
    difficulty: 'متوسط',
    difficultyEn: 'Intermediate',
    estimatedTime: '~1.8 ثانية',
    stepSummaryAr: ['مشغّل مصدر البيانات', 'عامل تصفية السجلات', 'تحويل البيانات والمعادلات', 'حساب مؤشرات التجميع', 'حفظ الجدول المعالج'],
    stepSummaryEn: ['Source Trigger', 'Record Filter Node', 'Data Transform / Formula', 'KPI Aggregation', 'Export Transformed Data'],
    isActive: true,
    runCount: 16,
    tags: ['ETL', 'تصفية', 'تحويل بيانات', 'Filter', 'Data Transform'],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 14400000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-etl-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_dataset',
          label: 'Raw Data Ingestion',
          labelAr: 'مصدر البيانات الأولية',
          description: 'Ingests operational transactions dataset',
          descriptionAr: 'يستقبل ملف المعاملات والعمليات الخام',
          category: 'trigger',
          status: 'idle',
          config: { datasetId: 'active' }
        }
      },
      {
        id: 'node-etl-2',
        type: 'workflowCustom',
        position: { x: 360, y: 150 },
        data: {
          nodeType: 'filter_transform',
          label: 'Filter Active & Valid Records',
          labelAr: 'عامل تصفية السجلات النشطة',
          description: 'Filters records matching specific value threshold or status',
          descriptionAr: 'يصفي السجلات التي تطابق معايير القيمة أو الحالة',
          category: 'logic',
          status: 'idle',
          config: {
            field: 'status',
            operator: 'not_equals',
            value: 'cancelled',
          }
        }
      },
      {
        id: 'node-etl-3',
        type: 'workflowCustom',
        position: { x: 670, y: 150 },
        data: {
          nodeType: 'ai_cleaner',
          label: 'Data Transform & Type Casting',
          labelAr: 'تحويل وتوحيد بنية البيانات',
          description: 'Normalizes numerical formats and trims text fields',
          descriptionAr: 'يوحد الصيغ الرقمية ويزيل المسافات الزائدة',
          category: 'ai',
          status: 'idle',
          config: {
            cleanStrategy: 'smart_impute',
            removeDuplicates: true,
          }
        }
      },
      {
        id: 'node-etl-4',
        type: 'workflowCustom',
        position: { x: 980, y: 150 },
        data: {
          nodeType: 'aggregation_kpi',
          label: 'Aggregated KPI Metrics',
          labelAr: 'حساب مؤشرات التجميع',
          description: 'Computes group totals and performance averages',
          descriptionAr: 'يحسب مجاميع الفئات ومتوسطات الأداء',
          category: 'logic',
          status: 'idle',
          config: {}
        }
      },
      {
        id: 'node-etl-5',
        type: 'workflowCustom',
        position: { x: 1290, y: 150 },
        data: {
          nodeType: 'action_export_dataset',
          label: 'Save Transformed Dataset',
          labelAr: 'حفظ وتصدير الجدول المحول',
          description: 'Stores transformed data ready for dashboards & charts',
          descriptionAr: 'يحفظ جدولاً جاهزاً للاستخدام المباشر في لوحات المعلومات',
          category: 'action',
          status: 'idle',
          config: {
            suffix: '_Transformed_ETL',
            tag: 'ETL-Pipeline',
          }
        }
      }
    ],
    edges: [
      { id: 'e-etl-1-2', source: 'node-etl-1', target: 'node-etl-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-etl-2-3', source: 'node-etl-2', target: 'node-etl-3', animated: true, style: { stroke: '#009d9a', strokeWidth: 2 } },
      { id: 'e-etl-3-4', source: 'node-etl-3', target: 'node-etl-4', animated: true, style: { stroke: '#8a3ffc', strokeWidth: 2 } },
      { id: 'e-etl-4-5', source: 'node-etl-4', target: 'node-etl-5', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  },

  // 4. كشف الشذوذ والإنذار المبكر
  {
    id: 'template-anomaly-alert',
    name: 'Financial Outlier & Fraud Detection Sentinel',
    nameAr: 'اكتشاف الشذوذ المالي وتنبيهات الاحتيال والإنذار المبكر',
    description: 'High-sensitivity statistical scanner detecting variance anomalies, unexpected spikes, or data discrepancies, immediately triggering high-priority emergency alerts.',
    descriptionAr: 'فاحص إحصائي عالي الدقة يكتشف التغيرات الشاذة، والقفزات غير المتوقعة في القيم المالية، ويرسل تنبيهاً فورياً وتوثيقاً في سجل التدقيق.',
    category: 'alerts',
    categoryAr: 'تنبيهات الشذوذ والإنذار المبكر',
    difficulty: 'متوسط',
    difficultyEn: 'Intermediate',
    estimatedTime: '~1.2 ثانية',
    stepSummaryAr: ['مشغّل فحص الجودة', 'فاحص الشذوذ عالي الحساسية', 'بوابة كشف التباين', 'تنبيه عالي الأهمية', 'توثيق سجل التدقيق'],
    stepSummaryEn: ['Quality Trigger', 'High-Sensitivity Outlier Scanner', 'Anomaly Gate', 'Urgent Alert Dispatch', 'Audit Log Recording'],
    isActive: true,
    runCount: 11,
    tags: ['كشف الشذوذ', 'إنذار مبكر', 'أمان مالي', 'Outlier Detection', 'Fraud Sentinel'],
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 10800000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-anom-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_quality',
          label: 'Data Anomaly Ingestion Trigger',
          labelAr: 'مشغّل مراقبة تدفق المعاملات',
          description: 'Monitors incoming transaction batch updates',
          descriptionAr: 'يراقب دفعات المعاملات والبيانات الواردة',
          category: 'trigger',
          status: 'idle',
          config: { minScore: 85 }
        }
      },
      {
        id: 'node-anom-2',
        type: 'workflowCustom',
        position: { x: 360, y: 150 },
        data: {
          nodeType: 'ai_profiler',
          label: 'High-Sensitivity Anomaly Profiler',
          labelAr: 'فاحص الشذوذ الإحصائي والمالي',
          description: 'Detects standard deviation spikes & z-score outliers',
          descriptionAr: 'يكتشف الانحرافات المعيارية والقفزات غير المعتادة',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            sensitivity: 'high',
            detectOutliers: true,
          }
        }
      },
      {
        id: 'node-anom-3',
        type: 'workflowCustom',
        position: { x: 670, y: 150 },
        data: {
          nodeType: 'condition_rule',
          label: 'Anomalies Detected > 0?',
          labelAr: 'هل تم رصد قيم شاذة (> 0)؟',
          description: 'Evaluates if critical outliers were flagged',
          descriptionAr: 'يتحقق مما إذا كانت هناك شذوذات تحتاج تدخلاً عاجلاً',
          category: 'logic',
          status: 'idle',
          config: {
            field: 'anomaliesCount',
            operator: 'gt',
            threshold: 0,
          }
        }
      },
      {
        id: 'node-anom-alert',
        type: 'workflowCustom',
        position: { x: 980, y: 60 },
        data: {
          nodeType: 'action_notify',
          label: 'Urgent Fraud & Outlier Alert',
          labelAr: 'إرسال إنذار عاجل وتنبيه أمني',
          description: 'Dispatches high-priority alert with incident details',
          descriptionAr: 'يرسل إنذاراً فورياً لفريق الأمان المالي والتدقيق',
          category: 'action',
          status: 'idle',
          config: {
            channel: 'system_toast',
            priority: 'urgent',
          }
        }
      },
      {
        id: 'node-anom-ok',
        type: 'workflowCustom',
        position: { x: 980, y: 260 },
        data: {
          nodeType: 'ai_summarizer',
          label: 'Normal Variance Summary',
          labelAr: 'توثيق السلامة التشغيلية',
          description: 'Confirms dataset health conforms to standard distribution',
          descriptionAr: 'يوثق أن مؤشرات البيانات ضمن النطاق الطبيعي المعتمد',
          category: 'ai',
          status: 'idle',
          config: { tone: 'formal' }
        }
      }
    ],
    edges: [
      { id: 'e-anom-1-2', source: 'node-anom-1', target: 'node-anom-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-anom-2-3', source: 'node-anom-2', target: 'node-anom-3', animated: true, style: { stroke: '#8a3ffc', strokeWidth: 2 } },
      { id: 'e-anom-pass', source: 'node-anom-3', sourceHandle: 'pass', target: 'node-anom-alert', label: 'Anomaly Detected', style: { stroke: '#da1e28', strokeWidth: 2 } },
      { id: 'e-anom-fail', source: 'node-anom-3', sourceHandle: 'fail', target: 'node-anom-ok', label: 'Healthy (No Outliers)', style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  },

  // 5. حجب البيانات الحساسة وعزل الخصوصية (Zero-Egress)
  {
    id: 'template-zero-egress-privacy',
    name: 'Zero-Egress Privacy & PII Compliance Sanitizer',
    nameAr: 'حجب البيانات الحساسة وعزل الخصوصية (Zero-Egress)',
    description: 'Detects and masks PII (Emails, National IDs, Phone numbers) before any processing, ensuring 100% compliance with local privacy and regulatory laws.',
    descriptionAr: 'يكتشف ويحجب بيانات الهوية والبريد وأرقام الهواتف الحساسة محلياً لضمان الامتثال التام لمعايير الحماية الوطنية والدولية.',
    category: 'privacy',
    categoryAr: 'حماية وخصوصية البيانات',
    difficulty: 'مبتدئ',
    difficultyEn: 'Beginner',
    estimatedTime: '~1.1 ثانية',
    stepSummaryAr: ['مشغّل البيانات الحساسة', 'حاجب البيانات الشخصية المحلي', 'التصنيف الذكي وإثراء الفئات', 'تصدير الجدول المجهل والمطابق'],
    stepSummaryEn: ['Sensitive Ingestion', 'Local PII Masker', 'AI Categorization', 'Export Compliant Dataset'],
    isActive: true,
    runCount: 22,
    tags: ['Zero-Egress', 'حماية الخصوصية', 'حجب الهويات', 'Privacy', 'Compliance'],
    createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 21600000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-priv-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_dataset',
          label: 'Customer Data Ingestion',
          labelAr: 'مشغّل استقبال بيانات العملاء',
          description: 'Catches incoming customer data files',
          descriptionAr: 'يلتقط ملفات العملاء والبيانات الجديدة تلقائياً',
          category: 'trigger',
          status: 'idle',
          config: { triggerMode: 'sensitive_only' }
        }
      },
      {
        id: 'node-priv-2',
        type: 'workflowCustom',
        position: { x: 360, y: 150 },
        data: {
          nodeType: 'privacy_masker',
          label: 'Zero-Egress Local PII Masker',
          labelAr: 'حاجب البيانات الشخصية المحلي (Zero-Egress)',
          description: 'Anonymizes names, IDs, phones, and emails with secure tokens',
          descriptionAr: 'يحول الأسماء والهويات والبريد إلى رموز مشفرة محلياً',
          category: 'ai',
          status: 'idle',
          config: {
            maskEmails: true,
            maskPhoneNumbers: true,
            maskNationalIds: true,
          }
        }
      },
      {
        id: 'node-priv-3',
        type: 'workflowCustom',
        position: { x: 670, y: 150 },
        data: {
          nodeType: 'ai_enricher',
          label: 'AI Categorization & Tagging',
          labelAr: 'التصنيف الذكي وإثراء البيانات',
          description: 'Adds sentiment, industry tags, and customer segment clusters',
          descriptionAr: 'يضيف تصنيفات ذكية ومؤشرات فئات العملاء دون كشف الهويات',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            enrichFields: ['segment', 'sentiment', 'risk_tier'],
          }
        }
      },
      {
        id: 'node-priv-4',
        type: 'workflowCustom',
        position: { x: 980, y: 150 },
        data: {
          nodeType: 'action_export_dataset',
          label: 'Export Compliant Dataset',
          labelAr: 'تصدير النسخة المطابقة للأنظمة',
          description: 'Saves the anonymized dataset for safe team sharing',
          descriptionAr: 'يحفظ جدولاً مجهلاً ومطابقاً للأنظمة لمشاركته بأمان',
          category: 'action',
          status: 'idle',
          config: {
            suffix: '_Compliant_Masked',
            tag: 'Zero-Egress-Certified',
          }
        }
      }
    ],
    edges: [
      { id: 'e-priv-1-2', source: 'node-priv-1', target: 'node-priv-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-priv-2-3', source: 'node-priv-2', target: 'node-priv-3', animated: true, style: { stroke: '#009d9a', strokeWidth: 2 } },
      { id: 'e-priv-3-4', source: 'node-priv-3', target: 'node-priv-4', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  },

  // 6. التنبؤ الذكي وتحليل الاتجاهات المستقبلية
  {
    id: 'template-predictive-forecast',
    name: 'AI Predictive Trend & Growth Forecasting',
    nameAr: 'التنبؤ الذكي وتحليل الاتجاهات ومعدلات النمو المستقبلي',
    description: 'Analyzes historical time-series trends, fits linear/exponential statistical models with Gemini AI synthesis, and projects forward-looking growth forecasts.',
    descriptionAr: 'يحلل السلاسل الزمنية والاتجاهات التاريخية، ويحسب نماذج التنبؤ الإحصائي مع توليد سيناريوهات النمو المستقبلية ونشرها في تقرير دوري.',
    category: 'forecasting',
    categoryAr: 'تنبؤات وتحليل الاتجاهات',
    difficulty: 'متقدم',
    difficultyEn: 'Advanced',
    estimatedTime: '~2.4 ثانية',
    stepSummaryAr: ['مشغّل التنبؤ الدوري', 'حساب مؤشرات السلسلة الزمنية', 'نموذج التنبؤ الذكي (AI Forecast)', 'سارد الرؤى المستقبلية', 'نشر تقرير التوقعات'],
    stepSummaryEn: ['Schedule Trigger', 'Time-Series KPI Aggregation', 'AI Forecasting Engine', 'Predictive Storyteller', 'Publish Forecast Report'],
    isActive: false,
    runCount: 7,
    tags: ['التنبؤ الذكي', 'تحليل الاتجاهات', 'توقعات النمو', 'AI Forecasting', 'Predictive Analysis'],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date(Date.now() - 28800000).toISOString(),
    lastRunStatus: 'success',
    nodes: [
      {
        id: 'node-fore-1',
        type: 'workflowCustom',
        position: { x: 50, y: 150 },
        data: {
          nodeType: 'trigger_schedule',
          label: 'Weekly Forecast Trigger',
          labelAr: 'مشغّل التنبؤ الأسبوعي',
          description: 'Runs weekly to refresh forecast estimates',
          descriptionAr: 'يعمل أسبوعياً لتحديث التقديرات والتوقعات المستقبلية',
          category: 'trigger',
          status: 'idle',
          config: { frequency: 'weekly' }
        }
      },
      {
        id: 'node-fore-2',
        type: 'workflowCustom',
        position: { x: 360, y: 150 },
        data: {
          nodeType: 'aggregation_kpi',
          label: 'Historical Aggregator',
          labelAr: 'تجميع المؤشرات التاريخية',
          description: 'Calculates base period sums and velocity rates',
          descriptionAr: 'يحسب مجاميع الفترات السابقة ومعدلات التسارع',
          category: 'logic',
          status: 'idle',
          config: {}
        }
      },
      {
        id: 'node-fore-3',
        type: 'workflowCustom',
        position: { x: 670, y: 150 },
        data: {
          nodeType: 'ai_forecast',
          label: 'AI Trend & Projection Engine',
          labelAr: 'نموذج التنبؤ الذكي والاتجاهات',
          description: 'Projects regression slope and future target bands',
          descriptionAr: 'يقدر خط الاتجاه العام ونطاقات النمو المتوقعة',
          category: 'ai',
          status: 'idle',
          config: {
            periods: 3,
            confidence: 95,
          }
        }
      },
      {
        id: 'node-fore-4',
        type: 'workflowCustom',
        position: { x: 980, y: 150 },
        data: {
          nodeType: 'ai_summarizer',
          label: 'Strategic Forecast Storyteller',
          labelAr: 'سارد سيناريوهات المستقبل والتوصيات',
          description: 'Outlines conservative, realistic, and aggressive growth paths',
          descriptionAr: 'يوضح مسارات النمو المتوقعة والفرص الاستثمارية الواعدة',
          category: 'ai',
          status: 'idle',
          config: {
            model: 'gemini-3.8-flash',
            tone: 'strategic',
          }
        }
      },
      {
        id: 'node-fore-5',
        type: 'workflowCustom',
        position: { x: 1290, y: 150 },
        data: {
          nodeType: 'action_generate_report',
          label: 'Publish Forecast Report',
          labelAr: 'نشر تقرير التوقعات والنمو',
          description: 'Publishes forecast dossier with interactive charts',
          descriptionAr: 'يحفظ وينشر ملف التوقعات في قسم التقارير',
          category: 'action',
          status: 'idle',
          config: {
            autoPublish: true,
          }
        }
      }
    ],
    edges: [
      { id: 'e-fore-1-2', source: 'node-fore-1', target: 'node-fore-2', animated: true, style: { stroke: '#0f62fe', strokeWidth: 2 } },
      { id: 'e-fore-2-3', source: 'node-fore-2', target: 'node-fore-3', animated: true, style: { stroke: '#009d9a', strokeWidth: 2 } },
      { id: 'e-fore-3-4', source: 'node-fore-3', target: 'node-fore-4', animated: true, style: { stroke: '#8a3ffc', strokeWidth: 2 } },
      { id: 'e-fore-4-5', source: 'node-fore-4', target: 'node-fore-5', animated: true, style: { stroke: '#24a148', strokeWidth: 2 } },
    ]
  }
];
