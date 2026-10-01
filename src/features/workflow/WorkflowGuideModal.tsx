import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Workflow,
  Play,
  CheckCircle2,
  ShieldAlert,
  Filter,
  ShieldCheck,
  TrendingUp,
  Bot,
  FileText,
  Database,
  Clock,
  ArrowRight,
  Search,
  HelpCircle,
  X,
  Zap,
  Sliders,
  Eye,
  BarChart3,
  Layers,
  Code2,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Info,
  GitBranch,
  Settings
} from 'lucide-react';

interface WorkflowGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAr?: boolean;
}

type GuideSectionId =
  | 'overview'
  | 'architecture'
  | 'nodes_catalog'
  | 'connections'
  | 'execution'
  | 'output_panel'
  | 'templates'
  | 'best_practices'
  | 'faq';

export const WorkflowGuideModal: React.FC<WorkflowGuideModalProps> = ({
  isOpen,
  onClose,
  isAr = true,
}) => {
  const [activeSection, setActiveSection] = useState<GuideSectionId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  if (!isOpen) return null;

  const sectionsList: { id: GuideSectionId; titleAr: string; titleEn: string; icon: any }[] = [
    { id: 'overview', titleAr: '١. نظرة عامة والمفاهيم الأساسية', titleEn: '1. Overview & Core Concepts', icon: Sparkles },
    { id: 'architecture', titleAr: '٢. هيكلية ومكونات الاستوديو', titleEn: '2. Studio Architecture', icon: Layers },
    { id: 'nodes_catalog', titleAr: '٣. موسوعة العقد والبطاقات (Node Encyclopedia)', titleEn: '3. Node Catalog & Types', icon: Workflow },
    { id: 'connections', titleAr: '٤. التوصيل المرئي والمسارات الشرطية', titleEn: '4. Visual Connections & Logic', icon: GitBranch },
    { id: 'execution', titleAr: '٥. تشغيل السلسلة والمراقبة الحية', titleEn: '5. Execution & Live Telemetry', icon: Play },
    { id: 'output_panel', titleAr: '٦. لوحة معاينة المخرجات والنتائج', titleEn: '6. Output & Results Panel', icon: BarChart3 },
    { id: 'templates', titleAr: '٧. القوالب وسيناريوهات العمل الجاهزة', titleEn: '7. Templates & Use Cases', icon: Zap },
    { id: 'best_practices', titleAr: '٨. أفضل الممارسات وضمان الخصوصية', titleEn: '8. Best Practices & Security', icon: ShieldCheck },
    { id: 'faq', titleAr: '٩. الأسئلة الشائعة واستكشاف الأخطاء', titleEn: '9. FAQ & Troubleshooting', icon: HelpCircle },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-4 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0f62fe]/20 text-[#78a9ff] rounded-lg border border-[#0f62fe]/40">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{isAr ? 'دليل استخدام استوديو أتمتة سير العمل بالذكاء الاصطناعي' : 'AI Workflow Automation Studio Guide'}</span>
                <span className="text-[10px] font-mono uppercase bg-[#0f62fe] text-white px-2 py-0.5 rounded-full">
                  v3.8 Interactive
                </span>
              </h2>
              <p className="text-xs text-[var(--cds-text-02)]">
                {isAr
                  ? 'دليل تفصيلي شامل يشرح كافة أدوات وعقد وإمكانيات بناء وتدقيق خطوط أنابيب معالجة البيانات وتحليلها'
                  : 'Complete guide explaining all nodes, visual connections, outputs, and zero-egress data pipelines'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg transition-colors cursor-pointer"
            title={isAr ? 'إغلاق الدليل' : 'Close Guide'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Sidebar Navigation + Main Reading View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Internal Sidebar Tabs */}
          <div className="w-80 bg-[var(--cds-layer-01)] border-e border-[var(--cds-border-subtle)] flex flex-col p-3 gap-2 shrink-0">
            {/* Search within guide */}
            <div className="relative mb-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cds-text-03)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث في فصول الدليل...' : 'Search guide topics...'}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#6f6f6f] focus:outline-none focus:border-[#0f62fe]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {sectionsList.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-[#0f62fe] text-white font-bold shadow-lg shadow-[#0f62fe]/20'
                        : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#78a9ff]'}`} />
                      <span>{isAr ? sec.titleAr : sec.titleEn}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                );
              })}
            </div>

            {/* Quick Helper Badge */}
            <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg text-[11px] text-[var(--cds-text-02)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#42be65] shrink-0" />
              <span>
                {isAr
                  ? 'معمارية معزولة ومحلية بالكامل تضمن عدم تسريب البيانات الحساسة (Zero-Egress).'
                  : 'Isolated local-first architecture ensuring zero cloud data egress.'}
              </span>
            </div>
          </div>

          {/* Main Reading Canvas */}
          <div className="flex-1 bg-[var(--cds-background)] overflow-y-auto p-6 md:p-8 space-y-8 text-sm text-[var(--cds-text-01)] leading-relaxed">
            {/* SECTION 1: OVERVIEW */}
            {activeSection === 'overview' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الأول' : 'Chapter 1'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'نظرة عامة والمفاهيم الأساسية لأتمتة سير العمل' : 'Overview & Core Workflow Concepts'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)] leading-relaxed">
                  {isAr
                    ? 'يُعد استوديو أتمتة سير العمل (Workflow Studio) بيئة بصرية تفاعلية متقدمة ومبنية على معمارية الرسوم الموجهة غير الحلقية (Directed Acyclic Graph - DAG). يتيح للمحللين والمهندسين وأصحاب القرار تصميم وتنفيذ سلاسل معالجة بيانات مؤتمتة تجمع بين التنقية، التدقيق الإحصائي، الفحص الشرطي، والتحليل الاستراتيجي المدعوم بالذكاء الاصطناعي (Gemini AI).'
                    : 'Workflow Studio is an advanced visual canvas based on Directed Acyclic Graph (DAG) architecture. It enables users to compose automated data pipelines combining sanitization, statistical profiling, conditional branching, and Gemini-powered AI intelligence.'}
                </p>

                {/* Key Pillars 3-Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="p-2 bg-[#0f62fe]/20 text-[#78a9ff] w-fit rounded-lg">
                      <Workflow className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-white text-sm">{isAr ? 'بناء بصري بدون كود (No-Code Canvas)' : 'Visual No-Code Canvas'}</h4>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'سحب وإفلات العقد، توصيل المنافذ، وتخصيص القواعد مباشرة دون الحاجة لكتابة كود برمجي معقد.'
                        : 'Drag-and-drop nodes, connect ports, and customize rules without complex code.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="p-2 bg-[#8a3ffc]/20 text-[#be95ff] w-fit rounded-lg">
                      <Bot className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-white text-sm">{isAr ? 'ذكاء اصطناعي مدمج (AI Integration)' : 'Embedded AI Intelligence'}</h4>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'توليد توصيات تنفيذية، كشف الشذوذ، واستشراف الاتجاهات المستقبلية بدقة متناهية.'
                        : 'Synthesize executive insights, detect anomalies, and forecast trends with Gemini.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="p-2 bg-[#009d9a]/20 text-[#08bdba] w-fit rounded-lg">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-white text-sm">{isAr ? 'أمان تام ومحلي (Zero-Egress Security)' : 'Zero-Egress Privacy'}</h4>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'حجب وتشفير البيانات الحساسة (PII) داخل المتصفح والبيئة المحلية دون أي تسريب للسجلات.'
                        : 'Client-side anonymization of PII with zero external leakage of sensitive rows.'}
                    </p>
                  </div>
                </div>

                {/* Workflow Life Cycle Flow */}
                <div className="p-5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-3">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#f1c21b]" />
                    <span>{isAr ? 'دورة حياة تدفق البيانات النموذجية (Workflow Lifecycle):' : 'Typical Workflow Lifecycle:'}</span>
                  </h4>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono pt-2">
                    <div className="p-2.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg text-center w-full">
                      <span className="text-[#78a9ff] font-bold">1. {isAr ? 'المشغّل (Trigger)' : 'Trigger'}</span>
                      <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'تحميل جدول أو مؤقت مجدول' : 'Dataset or Cron'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--cds-text-03)] shrink-0" />
                    <div className="p-2.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg text-center w-full">
                      <span className="text-[#08bdba] font-bold">2. {isAr ? 'التنقية والتصفية' : 'Sanitize & Filter'}</span>
                      <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'حذف التكرار وحجب PI' : 'Deduplicate & Mask'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--cds-text-03)] shrink-0" />
                    <div className="p-2.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg text-center w-full">
                      <span className="text-[#be95ff] font-bold">3. {isAr ? 'فحص الجودة والـ AI' : 'Quality & AI'}</span>
                      <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'تقييم الجودة وتوليد الرؤى' : 'Score & Insights'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--cds-text-03)] shrink-0" />
                    <div className="p-2.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg text-center w-full">
                      <span className="text-[#42be65] font-bold">4. {isAr ? 'الإجراء والمخرجات' : 'Action & Export'}</span>
                      <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'حفظ جدول أو نشر تقرير' : 'Save Dataset / Report'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: ARCHITECTURE */}
            {activeSection === 'architecture' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الثاني' : 'Chapter 2'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'هيكلية ومكونات استوديو سير العمل' : 'Studio Architecture & Components'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'تتكون واجهة الاستوديو من 5 مناطق تفاعلية رئيسية تعمل بتناغم تام لتوفير تجربة بناء ومراقبة احترافية:'
                    : 'The Workflow Studio is composed of 5 primary interactive zones working in harmony:'}
                </p>

                <div className="space-y-4">
                  {/* Zone 1 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#0f62fe]/20 text-[#78a9ff] rounded-lg shrink-0 mt-0.5">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '١. الشريط العلوي للتحكم (Top Control Bar)' : '1. Top Control Bar'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'يحتوي على زر اختيار القوالب (Templates)، مبدل السلاسل النشطة، زر الحفظ، زر التشغيل المباشر (Execute Pipeline)، وزر فتح/إغلاق لوحة المخرجات وسجل الأخطاء.'
                          : 'Houses template switcher, pipeline selector, save, run executor, and toggles for Output Panel and Console.'}
                      </p>
                    </div>
                  </div>

                  {/* Zone 2 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#8a3ffc]/20 text-[#be95ff] rounded-lg shrink-0 mt-0.5">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '٢. مكتبة العقد الجانبية (Node Library Drawer)' : '2. Node Library Drawer'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'تقع في الجانب الأيسر وتحتوي على كافة العقد المصنفة حسب الغرض (مشغلات، منطق، معالجة، ذكاء اصطناعي، مخرجات). يمكنك سحب أي عقدة وإفلاتها مباشرة فوق لوحة العمل.'
                          : 'Categorized catalog of nodes ready for drag-and-drop onto the flow canvas.'}
                      </p>
                    </div>
                  </div>

                  {/* Zone 3 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#009d9a]/20 text-[#08bdba] rounded-lg shrink-0 mt-0.5">
                      <Workflow className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '٣. لوحة الرسم والتوصيل المرئي (ReactFlow Canvas)' : '3. Visual Graph Canvas'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'مساحة العمل اللانهائية التي تدعم التكبير والتصغير (Zoom/Pan)، النقل الحر، وتوصيل منافذ العقد عبر خطوط التوجيه المتوهجة مع مؤشرات الحالة اللحظية.'
                          : 'Interactive zoomable canvas supporting freeform node positioning, port drag connections, and animated status pulses.'}
                      </p>
                    </div>
                  </div>

                  {/* Zone 4 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#24a148]/20 text-[#42be65] rounded-lg shrink-0 mt-0.5">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '٤. لوحة معاينة المخرجات والنتائج (Output Inspector Panel)' : '4. Output Inspector Panel'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'لوحة سفلية متقدمة تعرض الجداول، المخططات البيانية، تقارير الذكاء الاصطناعي، وتشخيص الأخطاء لكل عقدة تمت معالجتها مع ميزة التصدير لـ CSV.'
                          : 'Bottom drawer rendering live tabular records, metric distributions, AI reports, and error diagnostics.'}
                      </p>
                    </div>
                  </div>

                  {/* Zone 5 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#f1c21b]/20 text-[#f1c21b] rounded-lg shrink-0 mt-0.5">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '٥. درج تكوين إعدادات العقدة (Node Config Drawer)' : '5. Node Config Drawer'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'يفتح عند النقر المزدوج أو النقر على أيقونة الإعدادات لأي عقدة لتخصيص الحقول، الشروط، العتبات، ونماذج الذكاء الاصطناعي بدقة.'
                          : 'Config flyout allowing granular tweaking of thresholds, target columns, models, and filter parameters.'}
                      </p>
                    </div>
                  </div>

                  {/* Zone 6 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-start gap-3">
                    <div className="p-2 bg-[#0f62fe]/20 text-[#78a9ff] rounded-lg shrink-0 mt-0.5">
                      <GitBranch className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        {isAr ? '٦. درج سجل النسخ والإصدارات (Version History Sidebar)' : '6. Version History Sidebar'}
                      </h4>
                      <p className="text-xs text-[var(--cds-text-02)]">
                        {isAr
                          ? 'يتيح حفظ نقاط زمنية مخصصة ومسمّاة لسير العمل (Snapshots)، وتوثيق التغييرات، واستعادة الحالات السابقة بضغطة زر واحدة بأمان محلي تام 100%.'
                          : 'Allows saving named pipeline checkpoints, adding release notes, and reverting to any previous state in 1-click with 100% local persistence.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: NODE CATALOG */}
            {activeSection === 'nodes_catalog' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الثالث' : 'Chapter 3'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'موسوعة العقد والبطاقات الوظيفية (Node Encyclopedia)' : 'Node Catalog & Detailed Functional Specs'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'يوفر الاستوديو مجموعة شاملة من العقد المتخصصة مقسمة إلى 5 فئات رئيسية:'
                    : 'The studio provides a rich library of specialized nodes across 5 main functional domains:'}
                </p>

                {/* 1. Triggers */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono font-bold text-[#78a9ff] uppercase flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>{isAr ? '١. فئة المشغلات وقوادح البدء (Trigger Nodes)' : '1. Trigger Nodes'}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'مشغّل جدول البيانات (Dataset Trigger)' : 'Dataset Trigger'}</span>
                        <span className="font-mono text-[10px] text-[#78a9ff] bg-[#0f62fe]/10 px-1.5 py-0.5 rounded">trigger_dataset</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'نقطة الانطلاق الأساسية. يتم تنشيط السلسلة فور رفع جدول جديد أو اختيار جدول نشط من المستودع لتمرير كافة سجلاته إلى العقد التالية.'
                          : 'Main entry point. Fires on dataset upload or active selection in repository.'}
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'مشغّل مجدول دوري (Schedule Cron Trigger)' : 'Schedule Cron Trigger'}</span>
                        <span className="font-mono text-[10px] text-[#78a9ff] bg-[#0f62fe]/10 px-1.5 py-0.5 rounded">trigger_schedule</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'تشغيل مؤتمت وفق فترات زمنية محددة (ساعي، يومي، أسبوعي، شهري) لإجراء المراجعات والتدقيق الدوري للبيانات.'
                          : 'Runs pipelines periodically on defined time intervals.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Logic & Filters */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-mono font-bold text-[#f1c21b] uppercase flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span>{isAr ? '٢. فئة المنطق والشروط (Logic & Filter Nodes)' : '2. Logic & Filter Nodes'}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'عامل التصفية والتجزئة (Filter Records)' : 'Filter & Subset Records'}</span>
                        <span className="font-mono text-[10px] text-[#f1c21b] bg-[#f1c21b]/10 px-1.5 py-0.5 rounded">filter_transform</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'تصفية السجلات بناءً على قواعد مقارنة معينة (يساوي، أكبر من، يحتوي، إلخ)، مع استبعاد الصفوف غير المطابقة وتمرير الباقي.'
                          : 'Filters rows matching specified column conditions, passing only compliant records downstream.'}
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'بوابة القرار الشرطي (Condition Gate If/Else)' : 'Condition Gate (If/Else)'}</span>
                        <span className="font-mono text-[10px] text-[#f1c21b] bg-[#f1c21b]/10 px-1.5 py-0.5 rounded">condition_rule</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'تقييم قيمة أو مؤشر ضد حد معين مع تفريع مسارين: مسار النجاح (Pass ✅) ومسار الإخفاق (Fail ⚠️).'
                          : 'Evaluates criteria against threshold, branching execution into Pass and Fail paths.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Processing & Privacy */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-mono font-bold text-[#08bdba] uppercase flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isAr ? '٣. فئة التنقية وحماية الخصوصية (Sanitization & Privacy Nodes)' : '3. Sanitization & Privacy'}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'تنقية وإزالة التكرار (Sanitize & Deduplicate)' : 'Sanitize & Deduplicate'}</span>
                        <span className="font-mono text-[10px] text-[#08bdba] bg-[#009d9a]/10 px-1.5 py-0.5 rounded">clean_duplicates</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'إزالة الصفوف المتطابقة، تنظيف المسافات الزائدة، وتطبيع النصوص لضمان نظافة البيانات قبل التحليل.'
                          : 'Deduplicates records, trims strings, and cleans null artifacts.'}
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'حجب البيانات الحساسة (PII Masking)' : 'Zero-Egress PII Masking'}</span>
                        <span className="font-mono text-[10px] text-[#08bdba] bg-[#009d9a]/10 px-1.5 py-0.5 rounded">privacy_anonymizer</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'حجب أرقام الهواتف، البريد الإلكتروني، والهويات الوطنية محلياً مع ضمان التوافق مع معايير الحوكمة وZero-Egress.'
                          : 'Masks emails, phone numbers, and IDs locally without cloud egress.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. AI & Analytics */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-mono font-bold text-[#be95ff] uppercase flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    <span>{isAr ? '٤. فئة التحليل والذكاء الاصطناعي (AI & Analytics Nodes)' : '4. AI & Analytics'}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'تحليل الذكاء الاصطناعي (AI Insights Synthesizer)' : 'AI Insights Synthesizer'}</span>
                        <span className="font-mono text-[10px] text-[#be95ff] bg-[#8a3ffc]/10 px-1.5 py-0.5 rounded">ai_insights</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'استدعاء نماذج Gemini لتحليل أنماط السجلات وصياغة ملخصات تنفيذية وتوصيات قرارات دقيقة.'
                          : 'Leverages Gemini models to generate strategic recommendations and executive summaries.'}
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'محرك التنبؤ والاستقراء (Predictive Forecast)' : 'Predictive Forecast'}</span>
                        <span className="font-mono text-[10px] text-[#be95ff] bg-[#8a3ffc]/10 px-1.5 py-0.5 rounded">forecast_engine</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'حساب التوقعات المستقبلية للأعمدة الرقمية لفترات قادمة (T+1, T+2, T+3) مع رسم منحنى المسار.'
                          : 'Forecasts future metric values across consecutive periods.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. Outputs & Actions */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-mono font-bold text-[#42be65] uppercase flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? '٥. فئة المخرجات والإجراءات (Action & Output Nodes)' : '5. Action & Output Nodes'}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'تصدير جدول بيانات جديد (Export Dataset)' : 'Export Dataset'}</span>
                        <span className="font-mono text-[10px] text-[#42be65] bg-[#24a148]/10 px-1.5 py-0.5 rounded">export_dataset</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'حفظ مخرجات المعالجة كجدول بيانات جديد ونظيف داخل مستودع البيانات للاستخدام في اللوحات والاستعلامات.'
                          : 'Persists processed records as a new ready dataset in the repository.'}
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                      <div className="font-bold text-white text-xs flex items-center justify-between">
                        <span>{isAr ? 'توليد ونشر تقرير تنفيذي (Generate Report)' : 'Generate Report'}</span>
                        <span className="font-mono text-[10px] text-[#42be65] bg-[#24a148]/10 px-1.5 py-0.5 rounded">generate_report</span>
                      </div>
                      <p className="text-[11px] text-[var(--cds-text-02)]">
                        {isAr
                          ? 'نشر تقرير تحليلي رسمي يحتوي على النتائج الإحصائية وتوصيات الذكاء الاصطناعي في قسم التقارير.'
                          : 'Publishes an executive analytics report to the Reports feature.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: CONNECTIONS & LOGIC */}
            {activeSection === 'connections' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الرابع' : 'Chapter 4'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'التوصيل المرئي والمسارات الشرطية' : 'Visual Connections & Conditional Branching'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'يعتمد تدفق البيانات بين العقد على التوصيل السلس بين المنافذ (Handles). إليك كيفية إنشاء وإدارة التوصيلات بكفاءة:'
                    : 'Data flow between nodes is governed by connecting output and input handles. Here is how to create and manage connections:'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Step 1 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#0f62fe] text-white flex items-center justify-center text-[10px]">1</span>
                      <span>{isAr ? 'سحب خط التوصيل (Port Dragging)' : 'Dragging Port Connection'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'انقر مع الاستمرار على منفذ الإخراج (الدائرة اليمنى للعقدة) واسحب المؤشر نحو منفذ الإدخال (الدائرة اليسرى للعقدة المستهدفة).'
                        : 'Click and drag from the output port of the source node to the input port of the target node.'}
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#0f62fe] text-white flex items-center justify-center text-[10px]">2</span>
                      <span>{isAr ? 'خط التوجيه المتوهج والمتحرك' : 'Animated Visual Indicator'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'يظهر خط توجيهي متوهج ومتحرك يوضح مسار التدفق ويؤكد صحة نقطة الإفلات تلقائياً.'
                        : 'A glowing animated indicator assists you to verify target handle attachment.'}
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#f1c21b] text-black flex items-center justify-center text-[10px]">3</span>
                      <span>{isAr ? 'المسارات الشرطية (Pass vs Fail)' : 'Conditional Branching (Pass vs Fail)'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'في عقد الشروط (Condition Gate)، توجد نقطتا خروج: المنفذ الأخضر العلوي (Pass) للبيانات المطابقة، والمنفذ الأحمر السفلي (Fail) لمعالجة الحالات المستبعدة أو إرسال إنذار.'
                        : 'Condition nodes feature dual outputs: top green (Pass) and bottom red (Fail) handles.'}
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#da1e28] text-white flex items-center justify-center text-[10px]">4</span>
                      <span>{isAr ? 'حذف الروابط وتجنب الحلقات' : 'Edge Deletion & Cycle Protection'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'يمكنك حذف أي مسار بضغطة زر واحدة على أيقونة (X) في منتصف الخط، كما يمنع النظام آلياً ربط العقدة بنفسها لمنع الحلقات غير المنتهية.'
                        : 'Delete connections via the center X button. Self-connections are automatically blocked.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: EXECUTION & TELEMETRY */}
            {activeSection === 'execution' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الخامس' : 'Chapter 5'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'تشغيل السلسلة والمراقبة الحية (Execution & Telemetry)' : 'Pipeline Execution & Live Telemetry'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'عند الضغط على زر "تشغيل تدفق العمل" (Execute Pipeline)، يتم تشغيل محرك المعالجة الطوبولوجي مع تتبع كامل للزمن والحالات:'
                    : 'Clicking "Execute Pipeline" kicks off topological step execution with full telemetry tracking:'}
                </p>

                <div className="space-y-3">
                  <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#0f62fe] animate-ping" />
                      <span>{isAr ? 'الحالة: جاري المعالجة (Running)' : 'State: Running'}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#78a9ff]">{isAr ? 'نبض أزرق متوهج للعقدة النشطة' : 'Blue glowing border'}</span>
                  </div>

                  <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <CheckCircle2 className="w-4 h-4 text-[#42be65]" />
                      <span>{isAr ? 'الحالة: اكتملت بنجاح (Success)' : 'State: Success'}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#42be65]">{isAr ? 'علامة صح وتوثيق زمن المعالجة (ms)' : 'Green check + duration ms'}</span>
                  </div>

                  <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <ShieldAlert className="w-4 h-4 text-[#fa4d56]" />
                      <span>{isAr ? 'الحالة: تعثرت المعالجة (Failed)' : 'State: Failed'}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#fa4d56]">{isAr ? 'إشارة حمراء وإرسال تقرير تشخيص' : 'Red alert + error diagnostics'}</span>
                  </div>
                </div>

                <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#78a9ff]" />
                    <span>{isAr ? 'سجل التدقيق والتنفيذ (Execution Logs Console):' : 'Execution Logs Console:'}</span>
                  </h4>
                  <p className="text-xs text-[var(--cds-text-02)]">
                    {isAr
                      ? 'يمكنك فتح شاشة السجل (Console) من الشريط العلوي لمتابعة الأحداث اللحظية، وتصفية السجلات حسب المستوى (Info, Success, Warning, Error)، مع إمكانية تصدير التقرير النهائي.'
                      : 'Toggle the bottom Console drawer to monitor live log timestamps, filter severity levels, and review step outputs.'}
                  </p>
                </div>
              </div>
            )}

            {/* SECTION 6: OUTPUT PANEL */}
            {activeSection === 'output_panel' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل السادس' : 'Chapter 6'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'لوحة معاينة المخرجات والنتائج (Output Inspector Panel)' : 'Output Inspector Panel Guide'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'تعتبر لوحة المخرجات النافذة المركزية لمعاينة نتائج المعالجة فور انتهاء كل عقدة. تحتوي اللوحة على 5 تبويبات تخصصية:'
                    : 'The Output Panel serves as your real-time viewport into transformed datasets, metric summaries, charts, and raw payloads:'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <TableIcon className="w-4 h-4 text-[#78a9ff]" />
                      <span>{isAr ? '١. جدول البيانات (Data Table)' : '1. Data Table'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'عرض حي للسجلات الناتجة بعد كل عملية تصفية أو تنقية، مع ترقيم الصفحات، تمييز القيم الخالية (null)، شريط بحث فوري، وزر تصدير مباشر إلى ملف CSV.'
                        : 'Interactive records grid with search, pagination, null badges, and instant CSV download.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <BarChart3 className="w-4 h-4 text-[#8a3ffc]" />
                      <span>{isAr ? '٢. الرسوم البيانية والمؤشرات (Visual Charts)' : '2. Visual Charts & KPIs'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'بطاقات إحصائية للمجاميع والمتوسطات ونسبة الجودة، ومخططات أعمدة ومنحنيات تنبؤية ترسم مسار التوقعات المستقبلية.'
                        : 'Interactive bar/area distributions, KPI metrics, and predictive trend lines.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <Bot className="w-4 h-4 text-[#be95ff]" />
                      <span>{isAr ? '٣. تحليل الذكاء الاصطناعي (AI Insights)' : '3. AI Insights'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'الملخص التنفيذي والتوصيات الاستراتيجية التي يولدها نموذج Gemini بعد قراءة أنماط ومؤشرات الجدول.'
                        : 'Strategic recommendations and summarized intelligence generated by Gemini.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-white font-bold text-xs">
                      <Code2 className="w-4 h-4 text-[#42be65]" />
                      <span>{isAr ? '٤. البيانات الخام (Raw JSON)' : '4. Raw JSON Payload'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'فحص الحمولة البرمجية الكاملة الناتجة عن العقدة مع زر نسخ بنقرة واحدة لدمجها في أنظمة خارجية أو تصحيحها.'
                        : 'Full JSON payload telemetry with one-click copy to clipboard.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 7: TEMPLATES & USE CASES */}
            {activeSection === 'templates' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل السابع' : 'Chapter 7'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'القوالب وسيناريوهات العمل الجاهزة' : 'Pre-built Templates & Real-world Use Cases'}
                  </h3>
                </div>

                <p className="text-sm text-[var(--cds-text-01)]">
                  {isAr
                    ? 'يأتي الاستوديو مزوداً بقوالب احترافية جاهزة بنقرة واحدة لتغطية أشهر حالات الاستخدام في المؤسسات:'
                    : 'The studio includes production-ready workflow templates covering standard enterprise scenarios:'}
                </p>

                <div className="space-y-3">
                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">
                        {isAr ? '١. خط أنابيب جودة وتنقية البيانات الشامل (Enterprise Quality Pipeline)' : '1. Enterprise Quality Pipeline'}
                      </span>
                      <span className="text-[10px] font-mono text-[#78a9ff] bg-[#0f62fe]/10 px-2 py-0.5 rounded border border-[#0f62fe]/30">6 Nodes</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'يبدأ بتشغيل الجدول -> إزالة التكرار -> فحص مؤشر الجودة -> حجب البيانات الحساسة -> حساب المؤشرات -> تصدير جدول نظيف.'
                        : 'Trigger -> Deduplicate -> Quality Check -> Mask PII -> Aggregate KPIs -> Export Clean Dataset.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">
                        {isAr ? '٢. استشراف المؤشرات وحماية الخصوصية بالذكاء الاصطناعي (AI Forecast Pipeline)' : '2. AI Forecast & Privacy Pipeline'}
                      </span>
                      <span className="text-[10px] font-mono text-[#be95ff] bg-[#8a3ffc]/10 px-2 py-0.5 rounded border border-[#8a3ffc]/30">6 Nodes</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'يبدأ بالجدول -> حجب البيانات الحساسة -> تجميع القيم -> حساب التنبؤ المستقبلي -> توليد رؤى AI -> نشر تقرير تنفيذي.'
                        : 'Trigger -> Mask PII -> Aggregate -> Forecast Engine -> Gemini Insights -> Publish Executive Report.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">
                        {isAr ? '٣. المراقبة الدورية والإنذار الآلي للحالات الحرجة (Incident Alerting Pipeline)' : '3. Incident Alerting Pipeline'}
                      </span>
                      <span className="text-[10px] font-mono text-[#fa4d56] bg-[#da1e28]/10 px-2 py-0.5 rounded border border-[#da1e28]/30">5 Nodes</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-02)]">
                      {isAr
                        ? 'مشغّل مجدول -> فحص جودة البيانات -> بوابة شرطية -> إرسال تنبيه في حال الهبوط وتوثيق سجل تدقيق.'
                        : 'Cron Trigger -> Quality Scan -> Condition Gate -> Incident Notification & Audit Log.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 8: BEST PRACTICES */}
            {activeSection === 'best_practices' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل الثامن' : 'Chapter 8'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'أفضل الممارسات وضمان الخصوصية (Best Practices & Zero-Egress)' : 'Best Practices & Security Governance'}
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-[#009d9a]/10 border border-[#009d9a]/30 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-[#08bdba] font-bold text-sm">
                      <ShieldCheck className="w-5 h-5" />
                      <span>{isAr ? 'مبدأ الخصوصية التامة (Zero-Egress Compliance)' : 'Zero-Egress Privacy Enforced'}</span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-01)] leading-relaxed">
                      {isAr
                        ? 'تتم كافة عمليات المعالجة والتنقية وحساب المؤشرات الحسابية محلياً بالكامل داخل المتصفح. وعند استخدام عقد الذكاء الاصطناعي (Gemini)، يتم إرسال المؤشرات الإحصائية المجمعة والملخصات العامة فقط، دون إرسال السجلات التفصيلية أو البيانات الشخصية الخام.'
                        : 'All transformations and statistical profiling execute client-side. When invoking Gemini nodes, only anonymized aggregate schemas and stats are passed.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#42be65]" />
                      <span>{isAr ? 'قواعد تصميم السلاسل الاحترافية:' : 'Design Guidelines:'}</span>
                    </h4>
                    <ul className="list-disc list-inside text-xs text-[var(--cds-text-02)] space-y-1.5 pr-2">
                      <li>{isAr ? 'ضع دائماً عقدة التنقية وحجب البيانات في بداية السلسلة قبل التحليل.' : 'Place sanitization & PII masking early in your pipeline.'}</li>
                      <li>{isAr ? 'استخدم عقد التصفية لتقليص حجم السجلات قبل عمليات التجميع المعقدة.' : 'Use filter nodes to reduce volume before running heavy aggregations.'}</li>
                      <li>{isAr ? 'راجع إعدادات العقدة (Config Drawer) للتأكد من توافق أسماء الأعمدة مع الجدول.' : 'Verify column names in the node config drawer match the active dataset schema.'}</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 9: FAQ */}
            {activeSection === 'faq' && (
              <div className="space-y-6 max-w-4xl">
                <div className="border-b border-[var(--cds-border-subtle)] pb-4">
                  <span className="text-[11px] font-mono text-[#78a9ff] uppercase font-bold tracking-wider">
                    {isAr ? 'الفصل التاسع' : 'Chapter 9'}
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {isAr ? 'الأسئلة الشائعة واستكشاف الأخطاء (FAQ & Troubleshooting)' : 'FAQ & Troubleshooting'}
                  </h3>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      qAr: 'كيف يمكنني استعادة القالب الأصلي إذا أردت البدء من جديد؟',
                      qEn: 'How do I reset a workflow to its default template state?',
                      aAr: 'يمكنك النقر على زر "إعادة التعيين" (أيقونة الدوران) الموجود في الشريط العلوي بجوار قائمة اختيار السلاسل.',
                      aEn: 'Click the Reset button (circular arrow icon) in the top control bar next to the workflow dropdown.',
                    },
                    {
                      qAr: 'ماذا أفعل إذا ظهرت حالة فشل (Failed) باللون الأحمر على إحدى العقد؟',
                      qEn: 'What should I do if a node fails during execution?',
                      aAr: 'افتح "لوحة المخرجات" وانقر على تبويب "تقرير الخطأ (Error Diagnostics)" لمعرفة السبب الدقيق، ثم انقر نقراً مزدوجاً على العقدة لتعديل إعداداتها.',
                      aEn: 'Open the Output Panel and click the "Error Diagnostics" tab to review the stack trace, then double-click the node to fix its config.',
                    },
                    {
                      qAr: 'هل يمكنني تنزيل البيانات الناتجة من أي مرحلة في السلسلة؟',
                      qEn: 'Can I download the transformed records as CSV from any step?',
                      aAr: 'نعم! من خلال "لوحة المخرجات"، اختر العقدة المطلوبة من القائمة المنسدلة واضغط زر "تصدير CSV" الأخضر.',
                      aEn: 'Yes! In the Output Panel, select the node from the dropdown and click the green "Export Table to CSV" button.',
                    },
                    {
                      qAr: 'كيف أقوم بحذف مسار توصيل بين عقدتين؟',
                      qEn: 'How do I delete an edge connection between two nodes?',
                      aAr: 'انقر على أيقونة الإلغاء (X) الموجودة في منتصف خط التوصيل لحذفه فورياً.',
                      aEn: 'Click the center X delete button located along the edge curve.',
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2">
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                        className="w-full flex items-center justify-between text-xs font-bold text-white text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-[#78a9ff] shrink-0" />
                          <span>{isAr ? item.qAr : item.qEn}</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[var(--cds-text-03)] transition-transform ${expandedFaq === idx ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedFaq === idx && (
                        <p className="text-xs text-[var(--cds-text-02)] bg-[var(--cds-layer-01)] p-3 rounded-lg border border-[var(--cds-border-subtle)] leading-relaxed">
                          {isAr ? item.aAr : item.aEn}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info & close */}
        <div className="p-3 bg-[var(--cds-layer-02)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between px-6 text-xs text-[var(--cds-text-02)]">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'يمكنك دائماً الوصول لهذا الدليل عبر زر "دليل الاستخدام" في شريط أدوات الاستوديو.' : 'Access this guide anytime via the "User Guide" button.'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0f62fe] hover:bg-[#0043ce] text-white font-bold rounded-lg transition-colors cursor-pointer text-xs"
          >
            {isAr ? 'فهمت، العودة إلى الاستوديو' : 'Close & Return to Studio'}
          </button>
        </div>
      </div>
    </div>
  );
};
