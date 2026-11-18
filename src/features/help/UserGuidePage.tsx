import React from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Keyboard, 
  Terminal, 
  Palette, 
  Workflow, 
  BarChart2, 
  Database,
  LayoutDashboard,
  CheckCircle2,
  Sparkles,
  Bot,
  ShieldCheck,
  Play,
  ArrowRight,
  Zap,
  Sliders,
  BarChart3,
  Layers,
  Filter,
  Activity,
  History,
  FolderOpen
} from 'lucide-react';

export const UserGuidePage: React.FC = () => {
  const { language, setActiveTab } = useApp();
  const isAr = language === 'ar';

  const sections = [
    {
      id: 'intelligence_lab',
      title: isAr ? 'مختبر الذكاء التحليلي — 20 قدرة على بياناتك' : 'Analyst Intelligence Lab — 20 capabilities on your data',
      icon: Sparkles,
      badge: isAr ? 'جديد' : 'New',
      fullWidth: true,
      content: isAr ? (
        <div className="space-y-4 text-sm text-[var(--cds-text-02)]">
          <p className="leading-relaxed">
            صفحة واحدة تجمع عشرين قدرة تحليلية تعمل على مجموعات بياناتك المحفوظة لا على أرقام منسوخة:
            طبقة مقاييس معتمدة (بحالة اعتماد وإصدار)، تدقيق جودة البيانات، ذاكرة تحليلات تُكتب تلقائيًا،
            كشف شذوذ بعد فصل الاتجاه والموسمية مع إسناد السبب، صرامة إحصائية وقراءة تجارب A/B متسلسلة،
            سؤال توضيحي واحد عند الغموض، سلسلة إثبات قابلة للحفظ والمشاركة، نقد التمثيل البياني،
            سيناريوهات بافتراضات معلنة، أثر تغيير المخطط، موثوقية الأتمتة، تقييم مقابل مجموعة ذهبية،
            حاجز خصوصية وتصدير آمن، انطباع أول عشر دقائق، محكّم بين تحليلين، تقرير أسبوعي، وتفسير النموذج.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <FolderOpen className="w-4 h-4 text-[#42be65]" />
                <span>بياناتي والمراقبات</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                اختر مجموعة بيانات، فيقرأ الخادم صفوفها وأعمدتها ويشغّل التدقيق والشذوذ عليها مباشرة.
                وأنشئ مراقبًا (مجموعة + عمود + دورة) يفحصه الخادم كل نصف ساعة ويُنبّهك داخل المنصة عند نقطة شاذة جديدة.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <History className="w-4 h-4 text-[#78a9ff]" />
                <span>السجل والإثبات</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                كل تشغيل يُسجَّل (الأداة، الحالة، الزمن، الخلاصة)، وكل بطاقة إثبات تُحفظ لتبقى قابلة للمشاركة
                بعد أسبوع بدل أن تذوب في الواجهة.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <ShieldCheck className="w-4 h-4 text-[#be95ff]" />
                <span>خصوصية مُنفَّذة لا موعودة</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                قبل أي إرسال لنموذج خارجي يمرّ السياق على حاجز PII: تُستبعد أعمدة الأسماء/العناوين ويُقنَّع البريد
                والهاتف والمعرّفات. التصدير يمرّ بالحاجز نفسه على الخادم، وطلب الخام مع وجود PII يُرفض صراحةً.
              </p>
            </div>
          </div>

          <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
            <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
              <Activity className="w-4 h-4 text-[#ff832b]" />
              <span>المساعد الذكي صار مسنَدًا</span>
            </div>
            <p className="text-[11px] text-[var(--cds-text-03)]">
              المساعد يكتشف نيّة السؤال، يشغّل الأدوات المناسبة قبل الإجابة، ويعرض «أدلة محسوبة» أسفل الرد.
              وإن طلب أداة بنفسه، تُنفَّذ ويُعاد ناتجها إليه في جولة ثانية فيكتب جوابه وهو يرى الرقم —
              لا يخمّنه. وكل سؤال يُسجَّل في ذاكرة المحلل تلقائيًا، والإجابة تُملأ في المجموعة الذهبية إن طابقت سؤالاً معتمدًا.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--cds-interactive-01)]">
              12 تبويبًا • 20 محرّكًا • مراقبة مستمرة • تصدير آمن
            </span>
            <button
              onClick={() => setActiveTab('intelligence')}
              className="px-3.5 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>افتح مختبر الذكاء التحليلي</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-[var(--cds-text-02)]">
          <p className="leading-relaxed">
            One page, twenty analytical capabilities running on your saved datasets rather than pasted numbers:
            governed metric definitions with approval status and versioning, data-quality audits, auto-captured
            analyst memory, anomaly detection with attribution and continuous monitors, statistical rigor and
            sequential A/B reads, one clarifying question, saved proof chains, chart critique, declared-assumption
            scenarios, schema-change impact, workflow reliability, golden-set evaluation, a PII gate with safe
            export, first-ten-minutes onboarding, arbitration between conflicting analyses, a weekly narrative,
            and model explanations.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <FolderOpen className="w-4 h-4 text-[#42be65]" />
                <span>My data & monitors</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Pick a dataset and the server reads its rows and columns, then runs audits and anomaly detection
                on it directly. Create a monitor (dataset + column + seasonality) that the server checks every 30
                minutes and turns into an in-app alert when a new outlier appears.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <History className="w-4 h-4 text-[#78a9ff]" />
                <span>Run log & proofs</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Every run is recorded (tool, status, latency, summary) and every proof card can be saved so it is
                still shareable a week later instead of disappearing with the UI state.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <ShieldCheck className="w-4 h-4 text-[#be95ff]" />
                <span>Enforced privacy</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Before any external model call the context passes the PII gate: name/address columns are dropped
                and emails, phones and identifiers are masked. Export passes the same server-side gate, and
                requesting raw rows with PII present is refused explicitly.
              </p>
            </div>
          </div>

          <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
            <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
              <Activity className="w-4 h-4 text-[#ff832b]" />
              <span>A grounded copilot</span>
            </div>
            <p className="text-[11px] text-[var(--cds-text-03)]">
              The assistant detects intent, runs the relevant engines before answering, and shows computed
              evidence under each reply. When it requests a tool itself, the tool runs and the result is fed back
              in a second pass, so it writes the answer while seeing the number — not guessing it. Each question
              is auto-captured into analyst memory, and matching golden-set answers are filled automatically.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--cds-interactive-01)]">
              12 tabs • 20 engines • continuous monitoring • safe export
            </span>
            <button
              onClick={() => setActiveTab('intelligence')}
              className="px-3.5 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Open Analyst Intelligence Lab</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'workflow_studio',
      title: isAr ? 'استوديو أتمتة سير العمل بالذكاء الاصطناعي (AI Workflow Studio)' : 'AI Workflow Automation Studio',
      icon: Workflow,
      badge: isAr ? 'مميز' : 'Featured',
      fullWidth: true,
      content: isAr ? (
        <div className="space-y-4 text-sm text-[var(--cds-text-02)]">
          <p className="leading-relaxed">
            بيئة بصرية تفاعلية قائمة على الرسوم الموجهة (DAG Canvas) لتصميم وتنفيذ سلاسل معالجة البيانات، الفحص الإحصائي، وحجب البيانات الحساسة وتوليد الرؤى الاستراتيجية عبر نماذج Gemini.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <Workflow className="w-4 h-4 text-[#78a9ff]" />
                <span>عقد وبطاقات وظيفية</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                مشغلات جداول وتوقيتات، فلاتر شروط، تنقية وحجب PI محلي، وتوليد تقارير.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <Play className="w-4 h-4 text-[#42be65]" />
                <span>تنفيذ ومراقبة فورية</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                تتبع زمني بالمللي ثانية، إشارات نبض ملونة، وسجل تشغيل تفصيلي للأخطاء.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <BarChart3 className="w-4 h-4 text-[#be95ff]" />
                <span>لوحة فحص المخرجات</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                معاينة الجداول، الرسوم البيانية، الملخصات التنفيذية، وتصدير فوري لـ CSV.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--cds-interactive-01)]">
              🔒 خصوصية تامة Zero-Egress ومعالجة محلية بالكامل
            </span>
            <button
              onClick={() => setActiveTab('workflow')}
              className="px-3.5 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>فتح استوديو سير العمل الآن</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-[var(--cds-text-02)]">
          <p className="leading-relaxed">
            A visual DAG canvas to design and execute automated data pipelines combining sanitization, local PII masking, statistical profiling, and Gemini-powered AI intelligence.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <Workflow className="w-4 h-4 text-[#78a9ff]" />
                <span>Functional Node Library</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Dataset/Cron triggers, conditional gates, local PII masking, and report publishers.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <Play className="w-4 h-4 text-[#42be65]" />
                <span>Live Execution & Telemetry</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Millisecond timing, glowing status pulses, and structured error logs.
              </p>
            </div>

            <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-[var(--cds-text-01)] text-xs">
                <BarChart3 className="w-4 h-4 text-[#be95ff]" />
                <span>Interactive Output Inspector</span>
              </div>
              <p className="text-[11px] text-[var(--cds-text-03)]">
                Live tabular preview, visual charts, AI recommendations, and CSV export.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--cds-interactive-01)]">
              🔒 Zero-Egress local-first data compliance
            </span>
            <button
              onClick={() => setActiveTab('workflow')}
              className="px-3.5 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Launch Workflow Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'shortcuts',
      title: isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts',
      icon: Keyboard,
      content: isAr ? (
        <ul className="space-y-2 text-sm text-[var(--cds-text-02)]">
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 1</kbd> للانتقال السريع إلى <b>مستودع البيانات</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 2</kbd> للانتقال إلى <b>نمذجة البيانات (ERD)</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 3</kbd> للانتقال إلى <b>التشخيص الإحصائي</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 4</kbd> للانتقال إلى <b>لوحات القيادة التنفيذية</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 5</kbd> للانتقال إلى <b>محرك الاستعلام (NL2SQL)</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 6</kbd> للانتقال إلى <b>إعدادات النماذج والذكاء الاصطناعي</b>.</li>
        </ul>
      ) : (
        <ul className="space-y-2 text-sm text-[var(--cds-text-02)]">
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 1</kbd> Quick navigation to <b>Datasets</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 2</kbd> Quick navigation to <b>Data Modeling (ERD)</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 3</kbd> Quick navigation to <b>Data Profiling</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 4</kbd> Quick navigation to <b>Dashboards</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 5</kbd> Quick navigation to <b>NL2SQL Query Builder</b>.</li>
          <li><kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs text-[var(--cds-text-01)] rounded">Ctrl + 6</kbd> Quick navigation to <b>Model Configuration</b>.</li>
        </ul>
      ),
    },
    {
      id: 'sql',
      title: isAr ? 'استوديو ومحرر SQL التفاعلي' : 'NL2SQL Interactive Studio',
      icon: Terminal,
      content: isAr ? (
        <div className="space-y-2 text-sm text-[var(--cds-text-02)]">
          <p>أصبح بإمكانك الآن طرح الأسئلة باللغة الطبيعية (عربي/إنجليزي) وسيقوم الذكاء الاصطناعي بتحويلها لاستعلامات SQL.</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>يتميز المحرر الجديد بإضاءة ملونة للكود (Syntax Highlighting).</li>
            <li>زر <b>تنسيق (Format)</b> لترتيب الكود وجعله أسهل للقراءة.</li>
            <li>إمكانية عرض شجرة تنفيذ الاستعلام (Execution Plan) التفاعلية عبر D3.js.</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-[var(--cds-text-02)]">
          <p>You can ask questions in natural language, and the AI will convert them into optimized SQL queries.</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>The new editor features syntax highlighting for SQL.</li>
            <li>Use the <b>Format</b> button to auto-indent and beautify your code.</li>
            <li>Inspect the query execution plan visually via the D3.js DAG tree.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'theme',
      title: isAr ? 'معاينة المظهر الحية وتخصيص الواجهة' : 'Live Theme Previews & UI Customization',
      icon: Palette,
      content: isAr ? (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          قم بتجربة السمات البصرية الفاخرة التي توفرها المنصة (مثل g100، Midnight، g10، وغيرها).
          الآن عند تمرير الماوس فوق أي خيار في قائمة المظهر، سيتم تحديث ألوان الواجهة فورياً لتعطيك <b>معاينة حية (Live Preview)</b> قبل الاختيار. يمكنك العثور على أداة تخصيص الواجهة في شريط التنقل العلوي أو من خلال نافذة "الإعدادات وتخصيص التخطيط".
        </p>
      ) : (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          Experience premium IBM Carbon themes (g100, Midnight, g10, etc.). Now, when you hover over any theme option in the menu, the entire application updates instantly to provide a <b>Live Preview</b> before making a choice. Access this feature via the top header or the Dashboard Layout modal.
        </p>
      ),
    },
    {
      id: 'erd',
      title: isAr ? 'مخطط العلاقات (ERD Graph)' : 'Data Modeling & ERD Graph',
      icon: Workflow,
      content: isAr ? (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          يتيح لك استوديو النمذجة رؤية جميع الجداول التي قمت باستيرادها كبطاقات تفاعلية. يمكنك سحبها، وتكبير/تصغير مساحة العمل، ومراجعة الروابط بين الجداول (المفاتيح الأساسية والأجنبية). استوديو النمذجة هو خطوتك الأولى لبناء قاعدة بيانات قوية.
        </p>
      ) : (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          The Data Modeling Studio allows you to view all imported tables as interactive cards. You can drag them around, zoom in/out of the workspace canvas, and review mapped relations (PKs and FKs). This studio is your first step to building a robust dataset architecture.
        </p>
      ),
    },
    {
      id: 'resiliency',
      title: isAr ? 'مرونة محرك الذكاء الاصطناعي' : 'AI Engine Resiliency',
      icon: Sparkles,
      content: isAr ? (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          نظامنا مزود بآلية <b>إعادة محاولة ذكية (Exponential Backoff)</b> والتراجع للنموذج البديل (Model Fallback). هذا يعني أن التطبيق سيستمر في العمل بكفاءة حتى عند وجود ضغط كبير على خوادم Gemini أو حدوث أخطاء مثل 503 أو 429، مما يضمن لك تجربة مستخدم سلسة دون انقطاع.
        </p>
      ) : (
        <p className="text-sm text-[var(--cds-text-02)] leading-relaxed">
          Our system is equipped with an <b>Exponential Backoff</b> and Model Fallback engine. This means the app will continue to work efficiently even during high demand spikes on Gemini servers (503/429 errors), guaranteeing a seamless user experience.
        </p>
      ),
    }
  ];

  return (
    <div className="h-full bg-[var(--cds-background)] overflow-y-auto flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] p-6 md:p-10 shrink-0">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] border border-[var(--cds-interactive-01)]/20 text-xs font-mono font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isAr ? 'مركز المساعدة والتعليمات' : 'Help & Learning Center'}
          </div>
          <h1 className="text-3xl md:text-4xl font-light text-[var(--cds-text-01)]">
            {isAr ? 'دليل استخدام المنصة الشامل' : 'Platform & Workflow User Guide'}
          </h1>
          <p className="text-[var(--cds-text-02)] max-w-2xl text-sm md:text-base leading-relaxed">
            {isAr 
              ? 'اكتشف الميزات القوية وكيفية تحقيق أقصى استفادة من استوديو أتمتة سير العمل بالذكاء الاصطناعي وأدوات تحليل البيانات وتوليد الاستعلامات في بيئتك المحلية بالكامل.'
              : 'Discover powerful features and learn how to get the most out of AI Workflow Studio, local data analysis, query generation, and dashboarding tools.'}
          </p>
        </div>
      </div>

      {/* Guide Content */}
      <div className="flex-1 p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          {sections.map(section => {
            const Icon = section.icon;
            if (section.fullWidth) {
              return (
                <div 
                  key={section.id} 
                  className="bg-[var(--cds-layer-01)] border-2 border-[var(--cds-interactive-01)]/40 p-6 sm:p-8 rounded-lg shadow-lg relative overflow-hidden flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-[var(--cds-interactive-01)]/15 text-[var(--cds-interactive-01)] rounded-lg">
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-[var(--cds-text-01)]">{section.title}</h3>
                    </div>
                    {section.badge && (
                      <span className="px-2.5 py-1 bg-[var(--cds-interactive-01)] text-white text-[11px] font-mono font-bold rounded-md uppercase">
                        {section.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    {section.content}
                  </div>
                </div>
              );
            }

            return null;
          })}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.filter(s => !s.fullWidth).map(section => {
              const Icon = section.icon;
              return (
                <div 
                  key={section.id} 
                  className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-6 hover:border-[var(--cds-border-strong)] transition-colors flex flex-col rounded-lg"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-[var(--cds-layer-02)] text-[var(--cds-interactive-01)] rounded-md">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-medium text-[var(--cds-text-01)]">{section.title}</h3>
                  </div>
                  <div className="flex-1">
                    {section.content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info box */}
        <div className="max-w-5xl mx-auto mt-8 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-6 text-center rounded-lg">
          <p className="text-sm font-mono text-[var(--cds-text-02)]">
            {isAr 
              ? 'تلميح: يمكنك دائمًا تشغيل "الجولة التعريفية" أو فتح دليل استوديو سير العمل مباشرة من زر الدليل داخل الاستوديو.'
              : 'Tip: You can always access interactive guidance or open the workflow manual directly inside Workflow Studio.'}
          </p>
        </div>
      </div>
    </div>
  );
};

