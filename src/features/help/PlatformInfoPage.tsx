/**
 * صفحة معلومات المنصة — مرجع واحد يشرح المنظومة وصفحاتها.
 *
 * لماذا صفحة مستقلة عن دليل الاستخدام: الدليل يشرح «ميزات» (استوديو الأتمتة،
 * الاختصارات، السمات)، وهذه الصفحة تجيب سؤال المستخدم الجديد: «ما هذه المنصة،
 * وماذا تفعل كل صفحة، وكيف أستخدمها، وأين تصلح؟». لذلك المحتوى مُسرد بيانات
 * (مصدر واحد لكل صفحة) لا نصوص مبعثرة: إضافة صفحة جديدة = إضافة عنصر واحد.
 */
import React, { useMemo, useState } from 'react';
import {
  BarChart2, BookOpen, Bot, ChevronDown, Compass, Contact, Cpu, Database, FileText,
  Gauge, GitBranch, HelpCircle, Inbox, LayoutDashboard, Lock, MessagesSquare,
  Search, Server, Settings, Shapes, ShieldAlert, ShieldCheck, Sparkles, Table,
  Terminal, Workflow,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Category = 'data' | 'analyze' | 'build' | 'automate' | 'govern' | 'help';

interface PageDoc {
  id: string;
  ar: string;
  en: string;
  icon: React.ElementType;
  category: Category;
  summaryAr: string;
  summaryEn: string;
  howAr: string;
  howEn: string;
  stepsAr: string[];
  stepsEn: string[];
  useAr: string[];
  useEn: string[];
  tipAr?: string;
  tipEn?: string;
}

const PAGES: PageDoc[] = [
  {
    id: 'landing',
    ar: 'نظرة عامة',
    en: 'Overview',
    icon: Compass,
    category: 'help',
    summaryAr: 'واجهة البداية: تعريف بالمنصة ومؤشرات سريعة ومداخل إلى بقية الصفحات.',
    summaryEn: 'The entry screen: what the platform does, headline signals, and shortcuts into every workspace.',
    howAr: 'صفحة عرض فقط — لا تحسب شيئًا، بل تقرأ حالة مساحة عملك وتوجّهك إلى الخطوة التالية.',
    howEn: 'A presentation-only screen: it reads your workspace state and points you to the next step.',
    stepsAr: ['سجّل الدخول', 'اقرأ المؤشرات العامة', 'اختر «مجموعات البيانات» لبدء العمل'],
    stepsEn: ['Sign in', 'Read the headline signals', 'Open Datasets to start working'],
    useAr: ['أول دخول للمنصة', 'عرض سريع للزائر أو الإدارة'],
    useEn: ['First visit', 'A quick walkthrough for a stakeholder'],
  },
  {
    id: 'datasets',
    ar: 'مجموعات البيانات',
    en: 'Datasets',
    icon: Database,
    category: 'data',
    summaryAr: 'استيراد CSV/Excel وربط مصادر حيّة (جداول/قواعد SQL)، مع معاينة الأعمدة وجدولة التحديث.',
    summaryEn: 'Import CSV/Excel and connect live sources (sheets/SQL) with column preview and refresh scheduling.',
    howAr: 'يُقرأ الملف في المتصفح أولًا، ثم يُحفظ على الخادم باسم مالكه، فلا تضيع المجموعة عند تحديث الصفحة. الربط الحيّ يُدار من بوابة الخادم لا من المتصفح.',
    howEn: 'Files are read in the browser, then persisted server-side per owner so a reload loses nothing. Live connections run through the server gateway, not the browser.',
    stepsAr: [
      'ارفع ملفًا أو أضف مصدرًا حيًّا',
      'راجع الأعمدة وأنواعها وجودة الصفوف',
      'احفظ المجموعة، واضبط جدولة التحديث إن كانت تتغيّر',
    ],
    stepsEn: [
      'Upload a file or add a live source',
      'Review columns, types and row quality',
      'Save it and set a refresh schedule if it changes',
    ],
    useAr: ['بداية أي تحليل', 'بيانات تتغيّر يوميًا (مبيعات، مخزون، دعم)'],
    useEn: ['Starting any analysis', 'Data that changes daily (sales, inventory, support)'],
    tipAr: 'المجموعة المحفوظة هي ما تقرأه أدوات المحلل بعد ذلك — لا تلصق الأرقام يدويًا.',
    tipEn: 'The saved dataset is what the analyst tools read later — no manual pasting.',
  },
  {
    id: 'datamodeling',
    ar: 'نمذجة البيانات والعلاقات',
    en: 'Data modeling & relationships',
    icon: Workflow,
    category: 'data',
    summaryAr: 'كشف المفاتيح الأساسية والأجنبية والعلاقات (1:1، 1:M، M:M) بين الجداول مع درجة ثقة.',
    summaryEn: 'Detects primary/foreign keys and relationship cardinality between tables with a confidence score.',
    howAr: 'يقرأ أسماء الأعمدة وأنواعها وعيّنات القيم، ويستنتج الروابط المحتملة، ثم يعرضها عليك للمراجعة قبل الاعتماد.',
    howEn: 'It reads column names, types and value samples, infers likely links, and asks you to confirm before adopting them.',
    stepsAr: ['اختر الجداول أو الشيتات', 'شغّل الكشف التلقائي', 'راجع كل رابط ودرجته وعدّل ما تراه', 'اعتمد النموذج'],
    stepsEn: ['Pick the tables/sheets', 'Run auto-detection', 'Review each link and its confidence', 'Adopt the model'],
    useAr: ['بناء طبقة بيانات موثوقة قبل التقارير', 'توثيق مخطط موروث غير موثّق'],
    useEn: ['Building a trustworthy layer before reporting', 'Documenting a legacy schema'],
  },
  {
    id: 'profiling',
    ar: 'التوصيف الإحصائي والجودة',
    en: 'Profiling & quality',
    icon: BarChart2,
    category: 'analyze',
    summaryAr: 'توصيف الأعمدة، القيم الشاذة، التكرار، الاكتمال، ودرجة جودة عامة قبل أي استنتاج.',
    summaryEn: 'Column profiling, outliers, duplication, completeness and an overall quality score before any conclusion.',
    howAr: 'يحسب توزيع كل عمود ومقاييسه من الصفوف نفسها، ويرتّب المشكلات بالخطورة، فلا تُبنى تقارير على بيانات مكسورة.',
    howEn: 'It computes each column’s distribution from the rows themselves and ranks issues by severity, so reports are not built on broken data.',
    stepsAr: ['اختر المجموعة', 'اقرأ درجة الجودة', 'راجع الأعمدة الحرجة', 'أصلح المصدر أو استبعد الصفوف ثم أعد التوصيف'],
    stepsEn: ['Pick a dataset', 'Read the quality score', 'Inspect the critical columns', 'Fix the source or exclude rows, then re-profile'],
    useAr: ['قبل أي تقرير تنفيذي', 'بعد كل استيراد جديد'],
    useEn: ['Before any executive report', 'After every new import'],
  },
  {
    id: 'explorer',
    ar: 'مستكشف البيانات',
    en: 'Data explorer',
    icon: Table,
    category: 'analyze',
    summaryAr: 'جدول تفاعلي: تصفية، ترتيب، تجميع (GROUP BY)، وحسابات سريعة مع تصدير النتيجة.',
    summaryEn: 'An interactive table: filter, sort, group, aggregate, and export the result.',
    howAr: 'يعمل على المجموعة النشطة في الذاكرة، وكل تغيير يُعيد الحساب فورًا بلا استعلام قاعدة بيانات.',
    howEn: 'It works on the active dataset in memory; every change recomputes instantly without a database round trip.',
    stepsAr: ['اختر المجموعة والأعمدة', 'أضف فلاتر وترتيبًا', 'جمّع أو احسب المتوسط/المجموع', 'صدّر النتيجة'],
    stepsEn: ['Choose the dataset and columns', 'Add filters and sorting', 'Group or aggregate', 'Export the result'],
    useAr: ['فحص سريع لصفوف مشتبهة', 'إعداد أرقام تقرير يدويًا'],
    useEn: ['Spot-checking suspicious rows', 'Assembling numbers for a manual report'],
  },
  {
    id: 'dashboards',
    ar: 'لوحات التحكم التفاعلية',
    en: 'Interactive dashboards',
    icon: LayoutDashboard,
    category: 'analyze',
    summaryAr: 'بناء لوحات من مؤشرات ورسوم متعددة، مع عرض سينمائي وإحاطة صوتية وتصدير شرائح.',
    summaryEn: 'Compose dashboards from KPI cards and charts, with cinema mode, audio briefing and slide export.',
    howAr: 'كل عنصر يُربط بمجموعة وأعمدة وتجميع، فيُحسب من البيانات الحقيقية ويُحدَّث عند تغيّر المجموعة.',
    howEn: 'Each widget is bound to a dataset, columns and an aggregation, so it is computed from real data and follows dataset changes.',
    stepsAr: ['أنشئ لوحة', 'أضف عناصر واربطها بالأعمدة', 'رتّب المقاسات والمواضع', 'اعرضها أو صدّرها (PDF/PPTX)'],
    stepsEn: ['Create a dashboard', 'Add widgets and bind them to columns', 'Arrange sizes and positions', 'Present it or export (PDF/PPTX)'],
    useAr: ['متابعة أسبوعية لفريق', 'عرض إداري في اجتماع'],
    useEn: ['Weekly team tracking', 'An executive review meeting'],
  },
  {
    id: 'nl2sql',
    ar: 'مختبر NL2SQL الذكي',
    en: 'NL2SQL studio',
    icon: Terminal,
    category: 'analyze',
    summaryAr: 'سؤال بالعربية أو الإنجليزية ← SQL آمن عبر تسع طبقات فحص، مع شرح وخطة تنفيذ.',
    summaryEn: 'A question in Arabic or English becomes safe SQL through nine validation layers, with explanation and a plan.',
    howAr: 'يولّد النموذج الاستعلام، ثم تمرّ الطبقات على الصلاحيات والجداول والدوال الخطرة والحجم قبل التنفيذ؛ ما يفشل يشرح سببه.',
    howEn: 'The model drafts the query, then layers check permissions, tables, dangerous functions and row volume before execution; failures explain themselves.',
    stepsAr: ['اختر المجموعة', 'اكتب السؤال بلغتك', 'راجع SQL والشرح', 'نفّذ أو أصلح، ثم انسخ النتيجة'],
    stepsEn: ['Pick a dataset', 'Ask in plain language', 'Review the SQL and explanation', 'Run or fix it, then copy the result'],
    useAr: ['أسئلة لا تعرف لها صيغة SQL', 'تدقيق استعلام كتبه زميل'],
    useEn: ['Questions you cannot phrase in SQL', 'Auditing a colleague’s query'],
    tipAr: 'الطبقات ليست زينة: استعلام يقرأ كل الصفوف أو يستخدم دالة خطرة يُوقف قبل التنفيذ.',
    tipEn: 'The layers matter: a full-table scan or a dangerous function is stopped before execution.',
  },
  {
    id: 'schemadesigner',
    ar: 'مصمّم السكيمّا',
    en: 'Schema designer',
    icon: Shapes,
    category: 'build',
    summaryAr: 'رسم مخطط الكيانات (ERD) بصريًّا ثم توليد SQL DDL جاهز.',
    summaryEn: 'Draw an entity-relationship diagram visually, then generate ready SQL DDL.',
    howAr: 'تستخدم لوحة رسم مبنية على draw.io؛ ما ترسمه يُترجم إلى جداول وأعمدة وعلاقات في SQL.',
    howEn: 'It uses a draw.io-based canvas; what you draw becomes tables, columns and relationships in SQL.',
    stepsAr: ['ارسم الجداول والأعمدة', 'اربط المفاتيح', 'راجع الـDDL المولّد', 'انسخه أو أرسله للمصنع'],
    stepsEn: ['Draw tables and columns', 'Link the keys', 'Review the generated DDL', 'Copy it or pass it to the factory'],
    useAr: ['تصميم قاعدة جديدة', 'توثيق مخطط قائم بصريًّا'],
    useEn: ['Designing a new database', 'Documenting an existing schema visually'],
  },
  {
    id: 'backend',
    ar: 'مصنع الـBackend من SQL',
    en: 'SQL → backend factory',
    icon: Server,
    category: 'build',
    summaryAr: 'من مخطط SQL إلى مشروع API: نماذج، مسارات CRUD، وإعدادات قاعدة، مع تنزيل الملفات.',
    summaryEn: 'From a SQL schema to an API project: models, CRUD routes, database config, downloadable files.',
    howAr: 'يقرأ الـDDL ويولّد كودًا لإطار محدّد (Express أو FastAPI) وقاعدة محدّدة (PostgreSQL أو MySQL)، ويحفظ التوليد كأثر قابل للتنزيل.',
    howEn: 'It reads DDL and generates code for a chosen framework (Express or FastAPI) and database (PostgreSQL or MySQL), saved as a downloadable artifact.',
    stepsAr: ['ألصق الـDDL أو أرسله من المصمّم', 'اختر الإطار والقاعدة', 'ولّد المشروع', 'راجع الملفات ونزّلها'],
    stepsEn: ['Paste DDL or send it from the designer', 'Pick framework and database', 'Generate the project', 'Review and download the files'],
    useAr: ['تحويل نموذج بيانات إلى خدمة', 'بداية سريعة لمشروع داخلي'],
    useEn: ['Turning a data model into a service', 'A fast internal prototype'],
  },
  {
    id: 'models',
    ar: 'إعدادات النماذج والذكاء',
    en: 'Model hub & config',
    icon: Cpu,
    category: 'build',
    summaryAr: 'اختيار مزوّد النموذج ومفتاحه ونموذجه: Gemini، OpenAI، OpenRouter، Qwen، DeepSeek، مخصّص، أو Ollama محلي.',
    summaryEn: 'Choose the model provider, key and model: Gemini, OpenAI, OpenRouter, Qwen, DeepSeek, custom, or local Ollama.',
    howAr: 'المفاتيح تبقى على الخادم ولا تُرسل للمتصفح؛ كل صفحة ذكية تستخدم النموذج النشط نفسه، مع اختبار اتصال وحصص يومية.',
    howEn: 'Keys stay server-side and never reach the browser; every AI page uses the same active model, with a connection test and daily quotas.',
    stepsAr: ['اختر المزوّد', 'أدخل المفتاح (أو عنوان Ollama)', 'اختبر الاتصال', 'اختر النموذج الافتراضي'],
    stepsEn: ['Pick a provider', 'Enter the key (or Ollama URL)', 'Test the connection', 'Set the default model'],
    useAr: ['تشغيل كل ميزات الذكاء', 'التبديل إلى نموذج محلي للبيانات الحساسة'],
    useEn: ['Enabling every AI feature', 'Switching to a local model for sensitive data'],
    tipAr: 'بلا مفتاح صالح تعمل الصفحات التحليلية، لكن صياغة النموذج في المساعد تفشل — وتُعاد الأدلة المحسوبة وحدها.',
    tipEn: 'Without a valid key the analytics still work, but copilot phrasing fails — only computed evidence is returned.',
  },
  {
    id: 'assistant',
    ar: 'المساعد الذكي (AI Copilot)',
    en: 'AI copilot',
    icon: Bot,
    category: 'analyze',
    summaryAr: 'محادثة تحليلية مُسنَدة: يكتشف النيّة، يشغّل أدوات المحلل، ويعرض «أدلة محسوبة» تحت كل رد.',
    summaryEn: 'A grounded analytical chat: detects intent, runs analyst tools, and shows computed evidence under each reply.',
    howAr: 'قبل الإجابة تُحقن تعريفات المقاييس والذاكرة والأدلة في تعليمات النظام. وإن طلب النموذج أداة، تُنفَّذ ويُعاد ناتجها إليه في جولة ثانية (حد أقصى دورتين) قبل أن يصوغ جوابه. وبياناتك تمرّ على حاجز الخصوصية أولًا.',
    howEn: 'Before answering, metric definitions, memory and evidence are injected into the system instructions. If the model requests a tool, it runs and the result is fed back in a second round (max two) before it writes. Your data passes the privacy gate first.',
    stepsAr: ['اختر مجموعة نشطة', 'اسأل سؤالك', 'اقرأ الخلاصة ثم الأدلة', 'اطلب تقريرًا أو لوحة من الاقتراحات'],
    stepsEn: ['Select an active dataset', 'Ask your question', 'Read the answer, then the evidence', 'Turn a suggestion into a report or dashboard'],
    useAr: ['سؤال متكرر عن رقم أو اتجاه', 'توليد تقرير أو لوحة بأمر واحد'],
    useEn: ['A recurring question about a number or trend', 'Generating a report or dashboard on command'],
  },
  {
    id: 'intelligence',
    ar: 'مختبر الذكاء التحليلي',
    en: 'Analyst intelligence lab',
    icon: Sparkles,
    category: 'analyze',
    summaryAr: 'عشرون محرّكًا في مكان واحد: مقاييس معتمدة، تدقيق، شذوذ، إحصاء، تجارب، إثبات، سيناريو، أثر مخطط، تقييم، خصوصية.',
    summaryEn: 'Twenty engines in one place: governed metrics, audits, anomalies, statistics, experiments, proofs, scenarios, schema impact, evaluation, privacy.',
    howAr: 'كل تبويب يقرأ من مجموعة بياناتك الحقيقية (أو من مدخلاتك) ويشغّل محرّكًا مستقلًا قابلًا للاختبار، ويحفظ ما يلزم في قاعدة البيانات: مقاييس، ذاكرة، مراقبات، سجل تشغيل، وبطاقات إثبات.',
    howEn: 'Each tab reads your real dataset (or your inputs) and runs an independent, testable engine, persisting what matters: metrics, memory, monitors, run log and proof cards.',
    stepsAr: [
      'افتح «بياناتي والمراقبات» واختر المجموعة',
      'أنشئ مقياسًا معتمدًا أو مراقب شذوذ',
      'شغّل الأداة التي تحتاجها من تبويبها',
      'راجع السجل واحفظ بطاقة الإثبات',
    ],
    stepsEn: [
      'Open “My data & monitors” and pick a dataset',
      'Define an approved metric or an anomaly monitor',
      'Run the tool you need from its tab',
      'Check the run log and save a proof card',
    ],
    useAr: ['قبل اجتماع: إثبات رقم', 'مراقبة يومية لشذوذ بلا فتح الصفحة', 'حسم تعارض بين تحليلين'],
    useEn: ['Before a meeting: prove a number', 'Daily anomaly watch without opening the page', 'Settling two conflicting analyses'],
    tipAr: 'ادرس تبويب «السجل والإثبات»: يخبرك ما شُغّل على بياناتك ومتى، ويحفظ أدلتك بعد أسبوع.',
    tipEn: 'Check “Run log & proofs”: it shows what ran on your data and keeps evidence shareable later.',
  },
  {
    id: 'workflow',
    ar: 'سير العمل والأتمتة',
    en: 'Workflows & automation',
    icon: GitBranch,
    category: 'automate',
    summaryAr: 'استوديو رسوم موجّهة (DAG): مشغّلات مجدولة أو على مجموعة، فلاتر شروط، تنقية وحجب PII، ثم تقارير وتنبيهات.',
    summaryEn: 'A DAG studio: dataset or cron triggers, conditional gates, PII masking/scrubbing, then reports and alerts.',
    howAr: 'كل عقدة تستقبل صفوفًا وتُخرج صفوفًا أو نتيجة؛ التنفيذ يمرّ بالعقد بالترتيب ويُسجَّل زمن كل خطوة وأخطاؤها.',
    howEn: 'Each node takes rows and returns rows or a result; execution walks the nodes in order and logs per-step timing and errors.',
    stepsAr: ['أضف مشغّلًا', 'اربط العقد (فحص/فلترة/حجب/توليد)', 'جرّب التشغيل', 'فعّل الجدولة وراقب السجل'],
    stepsEn: ['Add a trigger', 'Wire the nodes (check/filter/mask/generate)', 'Dry-run it', 'Enable the schedule and watch the log'],
    useAr: ['تقرير شهري يتولّد تلقائيًا', 'فحص جودة يومي مع تنبيه عند الفشل'],
    useEn: ['A monthly report that writes itself', 'A daily quality check with failure alerts'],
  },
  {
    id: 'reports',
    ar: 'التقارير وقصص البيانات',
    en: 'Reports & data stories',
    icon: FileText,
    category: 'automate',
    summaryAr: 'قصص تنفيذية بفصول وملخص وتوصيات، مولّدة من بياناتك وقابلة للتصدير.',
    summaryEn: 'Executive stories with chapters, summary and recommendations, generated from your data and exportable.',
    howAr: 'يجمع المحرّك ملخصات الأعمدة والاتجاهات ثم يصوغها النموذج بنبرة تختارها، وكل رقم في القصة يجب أن يعود إلى بيانات المجموعة.',
    howEn: 'The engine gathers column summaries and trends, then the model writes in your chosen tone; every number must trace back to the dataset.',
    stepsAr: ['اختر مجموعة', 'اختر زاوية التحليل والنبرة', 'ولّد القصة', 'راجع الأرقام ثم صدّر'],
    stepsEn: ['Pick a dataset', 'Choose the angle and tone', 'Generate the story', 'Verify the numbers, then export'],
    useAr: ['تقرير شهري للإدارة', 'ملخص لعميل أو فريق غير تقني'],
    useEn: ['A monthly management report', 'A summary for a non-technical client'],
  },
  {
    id: 'discussions',
    ar: 'المناقشات الجماعية',
    en: 'Group discussions',
    icon: MessagesSquare,
    category: 'help',
    summaryAr: 'مجموعات نقاش مع دعوات بالبريد أو رابط، ورسائل وسياق مشترك للفريق.',
    summaryEn: 'Discussion groups with email or link invites, messages and shared team context.',
    howAr: 'العضوية تُفحص على الخادم في كل قراءة أو كتابة، والدعوات غير المقبولة تُذكَّر تلقائيًا بعد ثلاثة أيام.',
    howEn: 'Membership is checked server-side on every read or write; pending invites get a reminder after three days.',
    stepsAr: ['أنشئ مجموعة', 'ادعُ الأعضاء', 'شارك التحليل أو السؤال', 'تابع من الإشعارات'],
    stepsEn: ['Create a group', 'Invite members', 'Share the analysis or question', 'Follow up from notifications'],
    useAr: ['مراجعة تقرير مع الفريق', 'سؤال جماعي عن رقم مثير للجدل'],
    useEn: ['Reviewing a report with the team', 'A group question about a contested number'],
  },
  {
    id: 'audit',
    ar: 'سجل العمليات والأمان',
    en: 'Audit & governance',
    icon: ShieldAlert,
    category: 'govern',
    summaryAr: 'سجل قابل للتصفية لكل عملية: من فعلها، ماذا، بأي حالة، وكم استغرقت.',
    summaryEn: 'A filterable log of every action: who, what, status, and duration.',
    howAr: 'يُكتب في الخادم عند تنفيذ العملية، لا في المتصفح، فلا يمكن تعديله من العميل.',
    howEn: 'Written server-side when the action runs, not in the browser, so the client cannot rewrite it.',
    stepsAr: ['افتح السجل', 'صفِّ حسب النوع أو الحالة', 'افتح العملية الفاشلة', 'صدّر ما يلزم للتدقيق'],
    stepsEn: ['Open the log', 'Filter by type or status', 'Inspect a failed action', 'Export what the audit needs'],
    useAr: ['تحقيق في فشل متكرر', 'إثبات من غيّر ماذا ومتى'],
    useEn: ['Investigating repeated failures', 'Proving who changed what, and when'],
  },
  {
    id: 'admin',
    ar: 'لوحة الإدارة والإعدادات',
    en: 'Admin console',
    icon: Settings,
    category: 'govern',
    summaryAr: 'إدارة المستخدمين والأدوار والدعوات، حصص الذكاء، مزوّدو النماذج، وحالة النظام.',
    summaryEn: 'Manage users, roles, invites, AI quotas, model providers and system status.',
    howAr: 'متاحة لدور admin فقط؛ كل تغيير يمرّ بمسار محميّ ويُسجَّل في سجل العمليات.',
    howEn: 'Available to the admin role only; every change goes through a guarded route and lands in the audit log.',
    stepsAr: ['راجع المستخدمين والأدوار', 'اضبط الحصص اليومية', 'راجع المزوّدين وحالتهم', 'راقب حالة النظام'],
    stepsEn: ['Review users and roles', 'Set daily quotas', 'Check providers and their status', 'Watch system health'],
    useAr: ['إعداد فريق جديد', 'تشخيص «لماذا فشل الذكاء؟»'],
    useEn: ['Onboarding a new team', 'Diagnosing “why did AI fail?”'],
  },
  {
    id: 'guide',
    ar: 'دليل المستخدم والتوثيق',
    en: 'User guide',
    icon: HelpCircle,
    category: 'help',
    summaryAr: 'شروح مركّزة للميزات: استوديو الأتمتة، مختبر الذكاء، SQL، السمات، ERD، ومقاومة الانقطاع.',
    summaryEn: 'Focused walkthroughs: automation studio, intelligence lab, SQL, themes, ERD, and outage resilience.',
    howAr: 'صفحة قراءة فقط، لكنها تحتوي أزرار انتقال مباشرة إلى الصفحة المشروحة.',
    howEn: 'A read-only page, but each section links straight to the page it explains.',
    stepsAr: ['افتح القسم الذي يهمك', 'اقرأ البطاقات الثلاث', 'اضغط زر الانتقال للتجربة'],
    stepsEn: ['Open the section you need', 'Read its three cards', 'Use the jump button to try it'],
    useAr: ['تعلم ميزة قبل استخدامها', 'تدريب عضو جديد'],
    useEn: ['Learning a feature before using it', 'Training a new member'],
  },
  {
    id: 'developer',
    ar: 'تواصل مع المطور',
    en: 'Contact the developer',
    icon: Contact,
    category: 'help',
    summaryAr: 'إرسال ملاحظة أو طلب تطوير مباشرة إلى فريق المنصة.',
    summaryEn: 'Send a note or a feature request straight to the platform team.',
    howAr: 'يُخزَّن الطلب ويُصنَّف، ويظهر في صندوق الاقتراحات للإدارة.',
    howEn: 'The request is stored and classified, then appears in the admin suggestions inbox.',
    stepsAr: ['اكتب الملاحظة', 'حدّد النوع', 'أرسل وتابع الرد'],
    stepsEn: ['Write the note', 'Pick a type', 'Send it and watch for a reply'],
    useAr: ['عطل أو سلوك غريب', 'طلب ميزة جديدة'],
    useEn: ['A bug or odd behaviour', 'A new feature request'],
  },
  {
    id: 'suggestions',
    ar: 'طلبات الاقتراحات',
    en: 'Suggestions inbox',
    icon: Inbox,
    category: 'govern',
    summaryAr: 'صندوق الإدارة لمراجعة اقتراحات المستخدمين وتصنيفها والرد عليها.',
    summaryEn: 'The admin inbox for reviewing, classifying and answering user suggestions.',
    howAr: 'يقرأ الطلبات الواردة ويحدّث حالتها؛ متاح لدور admin فقط.',
    howEn: 'It reads incoming requests and updates their status; admin-only.',
    stepsAr: ['افتح الطلب', 'صنّفه', 'حدّث الحالة أو ارد'],
    stepsEn: ['Open a request', 'Classify it', 'Update status or reply'],
    useAr: ['تخطيط الأولويات', 'إغلاق حلقة الملاحظات'],
    useEn: ['Planning priorities', 'Closing the feedback loop'],
  },
];

const CATEGORIES: Array<{ id: Category | 'all'; ar: string; en: string }> = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'data', ar: 'البيانات', en: 'Data' },
  { id: 'analyze', ar: 'التحليل', en: 'Analyze' },
  { id: 'build', ar: 'البناء', en: 'Build' },
  { id: 'automate', ar: 'الأتمتة', en: 'Automate' },
  { id: 'govern', ar: 'الحوكمة', en: 'Govern' },
  { id: 'help', ar: 'المساعدة', en: 'Help' },
];

const FLOW = [
  { ar: 'استورد', en: 'Import', detailAr: 'ملف أو مصدر حيّ إلى مجموعة محفوظة', detailEn: 'A file or live source into a saved dataset' },
  { ar: 'افهَم', en: 'Understand', detailAr: 'توصيف، جودة، وعلاقات بين الجداول', detailEn: 'Profiling, quality and table relationships' },
  { ar: 'حلّل', en: 'Analyze', detailAr: 'استكشاف، NL2SQL، مساعد، أو محرّكات المختبر', detailEn: 'Explorer, NL2SQL, copilot or lab engines' },
  { ar: 'أثبِت', en: 'Prove', detailAr: 'أدلة محسوبة، سلسلة إثبات، حاجز خصوصية', detailEn: 'Computed evidence, proof chains, privacy gate' },
  { ar: 'شارِك', en: 'Share', detailAr: 'لوحة، قصة، تقرير، شرائح، أو تنبيه', detailEn: 'Dashboard, story, report, slides or an alert' },
];

const GENERAL_TOOLS = [
  { ar: 'مساعد عائم (Copilot Orb)', en: 'Floating copilot orb', detailAr: 'اسأل من أي صفحة دون مغادرتها؛ الأدلة تظهر أسفل الرد.', detailEn: 'Ask from any page without leaving it; evidence appears under the reply.' },
  { ar: 'لقطة المشروع (Snapshot)', en: 'Project snapshot', detailAr: 'تصدير/استيراد حالة مساحة العمل كملف JSON للنسخ الاحتياطي أو النقل.', detailEn: 'Export/import workspace state as JSON for backup or transfer.' },
  { ar: 'جدولة تحديث البيانات', en: 'Scheduled refresh', detailAr: 'تحديث مصدر متصل كل فترة محدّدة مع حالة اتصال ظاهرة.', detailEn: 'Refresh a connected source on an interval with a visible connection state.' },
  { ar: 'تفسير النموذج', en: 'Explain model', detailAr: 'يحوّل أهمية الميزات إلى جملة يفهمها صاحب القرار.', detailEn: 'Turns feature importance into a sentence a decision-maker can use.' },
  { ar: 'وضع التركيز (Zen)', en: 'Zen focus mode', detailAr: 'إخفاء كل ما ليس تحليلًا حين تحتاج انتباهًا كاملًا.', detailEn: 'Hides everything but the analysis when you need full attention.' },
  { ar: 'أعلام الميزات (Flags)', en: 'Feature flags', detailAr: 'تشغيل/إيقاف أجزاء من الواجهة أثناء التجربة أو الصيانة.', detailEn: 'Turn parts of the UI on/off during experiments or maintenance.' },
];

const FAQ = [
  {
    qAr: 'هل بياناتي تُرسل إلى نموذج خارجي كما هي؟',
    qEn: 'Is my data sent to an external model as-is?',
    aAr: 'لا. قبل أي إرسال يمرّ السياق على حاجز الخصوصية: أعمدة الأسماء/العناوين تُستبعد، والبريد والهاتف والمعرّفات تُقنَّع. وللبيانات الحساسة اختر Ollama المحلي من إعدادات النماذج.',
    aEn: 'No. Before any send, the context passes the privacy gate: name/address columns are dropped and emails, phones and identifiers are masked. For sensitive data, choose local Ollama in Model settings.',
  },
  {
    qAr: 'ما الفرق بين «لوحات التحكم» و«مختبر الذكاء»؟',
    qEn: 'What is the difference between dashboards and the intelligence lab?',
    aAr: 'اللوحات تُظهر الأرقام وتتابعها بصريًّا. المختبر يسأل: هل الرقم صحيح؟ ما شذوذه؟ هل الفرق معنوي؟ ما إثباته؟ الأول للعرض، والثاني للتحقق والدفاع عن الرقم.',
    aEn: 'Dashboards show and track numbers visually. The lab asks whether the number is right, what is anomalous, whether a difference is significant, and how to prove it. One presents, the other defends.',
  },
  {
    qAr: 'ماذا يحدث إن لم يكن هناك مفتاح نموذج صالح؟',
    qEn: 'What happens without a valid model key?',
    aAr: 'كل ما هو حسابي يعمل: التوصيف، الاستكشاف، محرّكات المختبر، المراقبات، والتقارير المحسوبة. الذي يتوقف هو صياغة النموذج فقط (المساعد وقصص البيانات)، ويُعاد لك ما حُسب مع سبب الفشل.',
    aEn: 'All computation keeps working: profiling, explorer, lab engines, monitors and computed reports. Only model phrasing stops (copilot and stories), and you still get the computed evidence plus the failure reason.',
  },
  {
    qAr: 'كيف أبدأ في خمس دقائق؟',
    qEn: 'How do I start in five minutes?',
    aAr: 'استورد ملفًا من «مجموعات البيانات» ← اقرأ درجة الجودة في «التوصيف» ← افتح «مختبر الذكاء» وتبويب «بياناتي والمراقبات» وأضف مراقبًا ← اسأل المساعد سؤالًا واحدًا.',
    aEn: 'Import a file in Datasets → read the quality score in Profiling → open the intelligence lab, “My data & monitors”, and add a monitor → ask the copilot one question.',
  },
  {
    qAr: 'هل تعمل المنصة دون اتصال؟',
    qEn: 'Does the platform work offline?',
    aAr: 'الاستيراد والاستكشاف والحسابات تعمل محليًّا، لكن الحفظ في قاعدة البيانات والنماذج السحابية تحتاج اتصالًا. مع Ollama محلي يمكن أن يبقى الذكاء داخل جهازك.',
    aEn: 'Import, exploration and computation run locally, but persistence and cloud models need a connection. With local Ollama, the AI can stay on your machine too.',
  },
];

export const PlatformInfoPage: React.FC = () => {
  const { language, setActiveTab } = useApp();
  const isAr = language === 'ar';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>('datasets');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PAGES.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      const haystack = [p.ar, p.en, p.summaryAr, p.summaryEn, p.howAr, p.howEn, ...p.useAr, ...p.useEn].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category]);

  return (
    <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Hero */}
      <header className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[var(--cds-interactive-01)]/10 p-2.5 text-[var(--cds-interactive-01)]">
            <BookOpen size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--cds-text-01)]">
              {isAr ? 'معلومات المنصة' : 'Platform information'}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--cds-text-02)]">
              {isAr
                ? 'منصة تحليلات مؤسسية تعمل محليًا أولًا: تستورد بياناتك، تفهمها، تحلّلها بالذكاء، تُثبت أرقامك، ثم تُخرجها لوحةً أو تقريرًا أو تنبيهًا. هذه الصفحة تشرح المنصة وصفحاتها كلها: ماذا تفعل كل صفحة، وكيف تعمل من الداخل، وكيف تستخدمها خطوة بخطوة، وأين تصلح.'
                : 'A local-first enterprise analytics platform: import your data, understand it, analyze it with AI, prove your numbers, then ship a dashboard, report or alert. This page explains the platform and every page: what it does, how it works inside, how to use it step by step, and where it fits.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono">
              {[
                { ar: '20 صفحة', en: '20 pages' },
                { ar: '20 محرّكًا تحليليًا', en: '20 analyst engines' },
                { ar: '9 طبقات فحص SQL', en: '9 SQL safety layers' },
                { ar: 'دورتان أدوات للمساعد', en: '2 copilot tool rounds' },
              ].map((s) => (
                <span key={s.en} className="rounded-md border border-[var(--cds-ui-03)] bg-[var(--cds-layer-02)] px-2 py-1 text-[var(--cds-text-02)]">
                  {isAr ? s.ar : s.en}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Flow */}
      <section className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-5">
        <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
          {isAr ? 'كيف تعمل المنصة — من ملف خام إلى قرار' : 'How the platform works — from raw file to decision'}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((step, index) => (
            <div key={step.en} className="rounded-lg border border-[var(--cds-ui-03)] bg-[var(--cds-layer-02)] p-3">
              <p className="text-[10px] font-mono text-[var(--cds-interactive-01)]">0{index + 1}</p>
              <p className="text-xs font-bold text-[var(--cds-text-01)] mt-1">{isAr ? step.ar : step.en}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--cds-text-03)]">{isAr ? step.detailAr : step.detailEn}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pages catalog */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? `كل صفحة في المنصة (${filtered.length})` : `Every page in the platform (${filtered.length})`}
          </h2>
          <div className="relative">
            <Search size={13} className="absolute top-2.5 start-2.5 text-[var(--cds-text-03)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? 'ابحث باسم الصفحة أو بما تفعله…' : 'Search a page or what it does…'}
              className="w-64 rounded-lg border border-[var(--cds-ui-03)] bg-[var(--cds-field-01,#f4f4f4)] py-2 ps-8 pe-3 text-[11px] text-[var(--cds-text-01)] outline-none focus:border-[var(--cds-interactive-01)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                category === c.id
                  ? 'bg-[var(--cds-interactive-01)] text-white'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              {isAr ? c.ar : c.en}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="rounded-lg border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-4 text-[11px] text-[var(--cds-text-03)]">
            {isAr ? 'لا صفحة تطابق بحثك — جرّب كلمة أعمّ مثل «تحليل» أو «بيانات».' : 'No page matches — try a broader word like “data” or “analysis”.'}
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((page) => {
            const Icon = page.icon;
            const open = openId === page.id;
            const categoryLabel = CATEGORIES.find((c) => c.id === page.category);
            return (
              <article
                key={page.id}
                className={`rounded-xl border bg-[var(--cds-layer-01)] transition ${
                  open ? 'border-[var(--cds-interactive-01)]/60' : 'border-[var(--cds-ui-03)]'
                }`}
              >
                <button
                  onClick={() => setOpenId(open ? null : page.id)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-start"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 rounded-md bg-[var(--cds-layer-02)] p-1.5 text-[var(--cds-interactive-01)]">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--cds-text-01)]">{isAr ? page.ar : page.en}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--cds-text-02)]">
                        {isAr ? page.summaryAr : page.summaryEn}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-md border border-[var(--cds-ui-03)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--cds-text-03)]">
                      {isAr ? categoryLabel?.ar : categoryLabel?.en}
                    </span>
                    <ChevronDown size={14} className={`text-[var(--cds-text-03)] transition ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-[var(--cds-ui-03)] p-4 text-[11px]">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cds-text-03)]">
                        {isAr ? 'كيف تعمل' : 'How it works'}
                      </p>
                      <p className="mt-1 leading-relaxed text-[var(--cds-text-02)]">{isAr ? page.howAr : page.howEn}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cds-text-03)]">
                        {isAr ? 'كيف تستخدمها' : 'How to use it'}
                      </p>
                      <ol className="mt-1 space-y-1 text-[var(--cds-text-02)]">
                        {(isAr ? page.stepsAr : page.stepsEn).map((step, i) => (
                          <li key={step} className="flex gap-2">
                            <span className="font-mono text-[10px] text-[var(--cds-interactive-01)]">{i + 1}.</span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cds-text-03)]">
                        {isAr ? 'أين تُستخدم' : 'Where it fits'}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {(isAr ? page.useAr : page.useEn).map((use) => (
                          <li key={use} className="rounded-md bg-[var(--cds-layer-02)] px-2 py-0.5 text-[10px] text-[var(--cds-text-02)]">
                            {use}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {(page.tipAr || page.tipEn) && (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-700">
                        {isAr ? page.tipAr : page.tipEn}
                      </p>
                    )}
                    <button
                      onClick={() => setActiveTab(page.id)}
                      className="rounded-lg bg-[var(--cds-interactive-01)] px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90"
                    >
                      {isAr ? 'افتح الصفحة' : 'Open the page'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* General tools */}
      <section className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-5">
        <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
          {isAr ? 'أدوات تعمل من أي صفحة' : 'Tools that work from any page'}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GENERAL_TOOLS.map((tool) => (
            <div key={tool.en} className="rounded-lg bg-[var(--cds-layer-02)] p-3">
              <p className="text-xs font-bold text-[var(--cds-text-01)]">{isAr ? tool.ar : tool.en}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--cds-text-03)]">{isAr ? tool.detailAr : tool.detailEn}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--cds-text-01)]">
            <ShieldCheck size={15} className="text-emerald-600" />
            {isAr ? 'الخصوصية والأمان' : 'Privacy & security'}
          </h2>
          <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-[var(--cds-text-02)]">
            {(isAr
              ? [
                  'حاجز PII قبل أي إرسال لنموذج: استبعاد أسماء/عناوين وتقنيع بريد/هاتف/معرّفات.',
                  'تصدير آمن عبر الخادم: نفس الحاجز يُطبَّق، وطلب الخام مع وجود PII يُرفض صراحةً.',
                  'المفاتيح على الخادم فقط، ولا تصل المتصفح ولا تُسجَّل في السجلات.',
                  'كل عملية تُسجَّل في سجل العمليات، وسجل تشغيل المحلل يبيّن ما حُسب على بياناتك.',
                  'الأدوار: admin لإدارة المستخدمين والحصص، وعضو عادي لبقية المساحة.',
                ]
              : [
                  'A PII gate before any model call: names/addresses dropped, emails/phones/identifiers masked.',
                  'Safe export runs through the server with the same gate; raw rows with PII are refused explicitly.',
                  'Keys live server-side only; they never reach the browser or the logs.',
                  'Every action lands in the audit log, and the analyst run log shows what was computed on your data.',
                  'Roles: admin manages users and quotas; members use the rest of the workspace.',
                ]
            ).map((item) => (
              <li key={item} className="flex gap-2">
                <Lock size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--cds-text-01)]">
            <Gauge size={15} className="text-[var(--cds-interactive-01)]" />
            {isAr ? 'ما الذي يُميّز المنصة' : 'What sets it apart'}
          </h2>
          <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-[var(--cds-text-02)]">
            {(isAr
              ? [
                  'الجواب مسنَد: المساعد لا يذكر رقمًا بلا دليل، ويرى نتيجة الأداة التي طلبها.',
                  'الأدلة لا تذوب: سجل تشغيل وبطاقات إثبات محفوظة تُشارك بعد أسبوع.',
                  'المراقبة مستمرة: الشذوذ يُفحص دوريًا ويصل كتنبيه، لا كأداة تُفتح.',
                  'التقييم آلي: كل تشغيل يقارن بالمجموعة الذهبية ويُنبّه عند الانحدار.',
                  'الحساب يفصل عن الصياغة: تعطّل النموذج لا يُلغي الأرقام المحسوبة.',
                ]
              : [
                  'Grounded answers: no number without evidence, and the model sees its requested tool result.',
                  'Evidence persists: a run log and saved proof cards still shareable a week later.',
                  'Continuous watching: anomalies are swept on a schedule and arrive as alerts, not a tab you must open.',
                  'Automated evaluation: every run compares against a golden set and flags regressions.',
                  'Computation is separate from phrasing: a model outage does not discard computed numbers.',
                ]
            ).map((item) => (
              <li key={item} className="flex gap-2">
                <Sparkles size={12} className="mt-0.5 shrink-0 text-[var(--cds-interactive-01)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="rounded-xl border border-[var(--cds-ui-03)] bg-[var(--cds-layer-01)] p-5">
        <h2 className="text-sm font-bold text-[var(--cds-text-01)]">{isAr ? 'أسئلة متكررة' : 'Frequently asked'}</h2>
        <div className="mt-2 divide-y divide-[var(--cds-ui-03)]">
          {FAQ.map((item, index) => {
            const open = openFaq === index;
            return (
              <div key={item.qEn}>
                <button
                  onClick={() => setOpenFaq(open ? null : index)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-start text-[11px] font-bold text-[var(--cds-text-01)]"
                >
                  <span>{isAr ? item.qAr : item.qEn}</span>
                  <ChevronDown size={13} className={`shrink-0 text-[var(--cds-text-03)] transition ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <p className="pb-3 text-[11px] leading-relaxed text-[var(--cds-text-02)]">{isAr ? item.aAr : item.aEn}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--cds-interactive-01)]/40 bg-[var(--cds-interactive-01)]/5 p-5">
        <div>
          <p className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? 'جاهز للتجربة؟' : 'Ready to try it?'}
          </p>
          <p className="mt-1 text-[11px] text-[var(--cds-text-02)]">
            {isAr
              ? 'ابدأ باستيراد مجموعة بيانات، ثم افتح مختبر الذكاء وشغّل أول أداة على بياناتك.'
              : 'Start by importing a dataset, then open the intelligence lab and run your first tool on it.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('datasets')}
            className="rounded-lg bg-[var(--cds-interactive-01)] px-3.5 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            {isAr ? 'مجموعات البيانات' : 'Datasets'}
          </button>
          <button
            onClick={() => setActiveTab('intelligence')}
            className="rounded-lg border border-[var(--cds-ui-03)] px-3.5 py-2 text-xs font-bold text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]"
          >
            {isAr ? 'مختبر الذكاء' : 'Intelligence lab'}
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className="rounded-lg border border-[var(--cds-ui-03)] px-3.5 py-2 text-xs font-bold text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]"
          >
            {isAr ? 'دليل الاستخدام' : 'User guide'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default PlatformInfoPage;
