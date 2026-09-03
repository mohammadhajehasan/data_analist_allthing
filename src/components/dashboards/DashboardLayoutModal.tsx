import React from 'react';
import { useApp } from '../../context/AppContext';
import { ThemeVariant, AccentColor, LayoutSettings } from '../../types';
import {
  Sliders,
  X,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Palette,
  Check,
  RotateCcw,
  Layers,
  Sigma,
  Eye,
  Sun,
  Moon,
  Sparkles,
  PanelLeftClose,
  Zap,
} from 'lucide-react';

interface DashboardLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const THEME_OPTIONS: {
  id: ThemeVariant;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  bgHex: string;
  cardHex: string;
  accentHex: string;
  borderHex: string;
  isDark: boolean;
}[] = [
  {
    id: 'g100',
    nameAr: 'كاربون 100 داكن (افتراضي)',
    nameEn: 'Carbon Gray 100 (Default Dark)',
    descAr: 'المظهر الداكن الفائق والمريح للعين المعتمد في أنظمة IBM',
    descEn: 'Ultra-dark contrast theme for high-focus telemetry',
    bgHex: '#161616',
    cardHex: '#262626',
    accentHex: '#0f62fe',
    borderHex: '#393939',
    isDark: true,
  },
  {
    id: 'g90',
    nameAr: 'كاربون 90 فحمي (Charcoal)',
    nameEn: 'Carbon Gray 90 (Charcoal)',
    descAr: 'درجة رمادية فحمية مع تباين أهدأ وبطاقات متباينة',
    descEn: 'Deep charcoal dark theme with soft contrast balance',
    bgHex: '#262626',
    cardHex: '#333333',
    accentHex: '#33b1ff',
    borderHex: '#444444',
    isDark: true,
  },
  {
    id: 'midnight',
    nameAr: 'ميدنايت سايبر بلو (Midnight Cyber)',
    nameEn: 'Midnight Cyber Blue',
    descAr: 'مظهر أزرق ليلي فخم مستوحى من مراكز القيادة السحابية',
    descEn: 'Premium deep blue nocturnal aerospace cockpit theme',
    bgHex: '#080f1e',
    cardHex: '#111d38',
    accentHex: '#33b1ff',
    borderHex: '#1e335e',
    isDark: true,
  },
  {
    id: 'g10',
    nameAr: 'كاربون 10 فاتح (Gray 10 Light)',
    nameEn: 'Carbon Gray 10 (Modern Light)',
    descAr: 'مظهر نهاري عصري رمادي فاتح مخصص للتقارير والطباعة',
    descEn: 'Sophisticated modern light gray theme for daytime reporting',
    bgHex: '#f4f4f4',
    cardHex: '#ffffff',
    accentHex: '#0f62fe',
    borderHex: '#e0e0e0',
    isDark: false,
  },
  {
    id: 'white',
    nameAr: 'كاربون أبيض نقي (Pure White)',
    nameEn: 'Carbon Pure White',
    descAr: 'مظهر أبيض ناصع عالي التباين للاجتماعات والمشاركات',
    descEn: 'High-contrast pure white theme for executive sharing',
    bgHex: '#ffffff',
    cardHex: '#f8f9fa',
    accentHex: '#0f62fe',
    borderHex: '#e2e8f0',
    isDark: false,
  },
];

export const ACCENT_COLOR_OPTIONS: {
  id: AccentColor;
  nameAr: string;
  nameEn: string;
  hex: string;
}[] = [
  { id: 'blue', nameAr: 'أزرق IBM القياسي', nameEn: 'IBM Blue', hex: '#0f62fe' },
  { id: 'teal', nameAr: 'تيل زمردي (Teal)', nameEn: 'Teal', hex: '#009d9a' },
  { id: 'purple', nameAr: 'بنفسجي ملكي (Purple)', nameEn: 'Purple', hex: '#8a3ffc' },
  { id: 'cyan', nameAr: 'سماوي كهربائي (Cyan)', nameEn: 'Cyan', hex: '#1192e8' },
  { id: 'magenta', nameAr: 'ماجنتا وردي (Magenta)', nameEn: 'Magenta', hex: '#ee5396' },
  { id: 'green', nameAr: 'أخضر تكنولوجي (Green)', nameEn: 'Green', hex: '#24a148' },
  { id: 'orange', nameAr: 'برتقالي شمسي (Orange)', nameEn: 'Orange', hex: '#ff832b' },
];

export const DashboardLayoutModal: React.FC<DashboardLayoutModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme, layoutSettings, updateLayoutSettings, resetLayoutSettings, toast, language } = useApp();
  const isAr = language === 'ar';

  const [committedTheme, setCommittedTheme] = React.useState<ThemeVariant>(theme);

  React.useEffect(() => {
    if (isOpen) {
      setCommittedTheme(theme);
    } else {
      setCommittedTheme(theme);
    }
  }, [isOpen, theme]);

  if (!isOpen) return null;

  const currentAccent = layoutSettings.accentColor || 'blue';

  const handleSaveAndClose = () => {
    setCommittedTheme(theme);
    toast.success(
      isAr ? 'تم تطبيق وحفظ التفضيلات' : 'Preferences Saved',
      isAr
        ? 'تم حفظ وتطبيق خيارات التخطيط ونمط وألوان المظهر بنجاح عبر النظام.'
        : 'Layout and theme preferences applied and saved to local storage.'
    );
    onClose();
  };

  const handleReset = () => {
    resetLayoutSettings();
    setTheme('g100');
    setCommittedTheme('g100');
    toast.info(
      isAr ? 'تمت استعادة الإعدادات الافتراضية' : 'Reset to Defaults',
      isAr ? 'تمت إعادة ضبط التخطيط والمظهر إلى القيم القياسية.' : 'Layout settings reset to default IBM Carbon configuration.'
    );
  };

  const handleModalClose = () => {
    setTheme(committedTheme);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-modal-header-bg)]">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--cds-interactive-01)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--cds-text-01)] font-mono uppercase tracking-wider">
                {isAr ? 'تخصيص التخطيط والمظهر وحفظ التفضيلات' : 'Layout & Appearance Customization'}
              </h3>
              <p className="text-[11px] text-[var(--cds-text-02)]">
                {isAr
                  ? 'يتم تطبيق وحفظ جميع التعديلات فورياً في التخزين المحلي (LocalStorage) لتبقى محفوظة عبر الجلسات'
                  : 'All changes are applied instantly and persisted to localStorage across sessions'}
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="p-1.5 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-02)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Section 1: Themes Selection */}
          <div className="space-y-3" onMouseLeave={() => setTheme(committedTheme)}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
                {isAr ? 'نمط المظهر (Theme Variant)' : 'Theme Palette & Tone'}
              </label>
              <span className="text-[10px] font-mono text-[var(--cds-text-02)] bg-[var(--cds-background)] px-2 py-0.5 border border-[var(--cds-border-subtle)]">
                {THEME_OPTIONS.find(t => t.id === theme)?.nameEn}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {THEME_OPTIONS.map(opt => {
                const isSelected = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onMouseEnter={() => setTheme(opt.id)}
                    onClick={() => {
                      setTheme(opt.id);
                      setCommittedTheme(opt.id);
                    }}
                    className={`p-3 text-start border transition-all flex items-start gap-3 relative ${
                      isSelected
                        ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] ring-1 ring-[var(--cds-interactive-01)]'
                        : 'bg-[var(--cds-background)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)]'
                    }`}
                  >
                    {/* Visual Color Swatches Pill */}
                    <div
                      className="w-8 h-8 rounded-none border border-[var(--cds-border-strong)] flex flex-col overflow-hidden shrink-0 shadow-inner"
                      style={{ backgroundColor: opt.bgHex }}
                    >
                      <div className="h-1/2 w-full" style={{ backgroundColor: opt.cardHex }} />
                      <div className="h-1/2 w-full flex">
                        <div className="w-1/2 h-full" style={{ backgroundColor: opt.accentHex }} />
                        <div className="w-1/2 h-full" style={{ backgroundColor: opt.bgHex }} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[var(--cds-text-01)] truncate">
                          {isAr ? opt.nameAr : opt.nameEn}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] shrink-0" />}
                      </div>
                      <p className="text-[10px] text-[var(--cds-text-02)] line-clamp-1 mt-0.5">
                        {isAr ? opt.descAr : opt.descEn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Accent Color Customization */}
          <div className="space-y-3 pt-2 border-t border-[var(--cds-border-subtle)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
                {isAr ? 'لون التمييز والتأثير (Accent Color)' : 'Accent Color Palette'}
              </label>
              <span className="text-[10px] font-mono text-[var(--cds-text-02)] uppercase">
                {currentAccent}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACCENT_COLOR_OPTIONS.map(color => {
                const isSelected = currentAccent === color.id;
                return (
                  <button
                    key={color.id}
                    onClick={() => updateLayoutSettings({ accentColor: color.id })}
                    className={`p-2.5 text-start border flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] ring-1 ring-[var(--cds-interactive-01)]'
                        : 'bg-[var(--cds-background)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-none shrink-0 border border-black/20 shadow-xs"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="text-xs font-semibold text-[var(--cds-text-01)] truncate">
                      {isAr ? color.nameAr.split(' ')[0] : color.nameEn}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] ms-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Grid Layout Density & Columns */}
          <div className="space-y-3 pt-2 border-t border-[var(--cds-border-subtle)]">
            <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              {isAr ? 'عدد أعمدة شبكة الرسوم (Grid Columns)' : 'Chart Grid Columns'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 1 as const, labelAr: 'عمود واحد (موسع)', labelEn: '1 Column (Full)', descAr: 'عرض تفصيلي كبير', descEn: 'Single full-width stack' },
                { val: 2 as const, labelAr: 'عمودان (قياسي)', labelEn: '2 Columns (Standard)', descAr: 'تخطيط ثنائي متوازن', descEn: 'Balanced side-by-side' },
                { val: 3 as const, labelAr: '3 أعمدة (مكثف)', labelEn: '3 Columns (Dense)', descAr: 'كثافة عرض قصوى', descEn: 'Compact multi-widget' },
              ].map(item => (
                <button
                  key={item.val}
                  onClick={() => updateLayoutSettings({ chartGridColumns: item.val })}
                  className={`p-2.5 border text-center transition-all ${
                    layoutSettings.chartGridColumns === item.val
                      ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] font-bold ring-1 ring-[var(--cds-interactive-01)]'
                      : 'bg-[var(--cds-background)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                  }`}
                >
                  <div className="text-xs">{isAr ? item.labelAr : item.labelEn}</div>
                  <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">{isAr ? item.descAr : item.descEn}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Chart Height */}
          <div className="space-y-3 pt-2 border-t border-[var(--cds-border-subtle)]">
            <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              {isAr ? 'ارتفاع بطاقات الرسوم البيانية (Card Height)' : 'Chart Card Height'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'compact' as const, labelAr: 'مدمج (320px)', labelEn: 'Compact (320px)' },
                { val: 'standard' as const, labelAr: 'قياسي (395px)', labelEn: 'Standard (395px)' },
                { val: 'spacious' as const, labelAr: 'موسع (460px)', labelEn: 'Spacious (460px)' },
              ].map(item => (
                <button
                  key={item.val}
                  onClick={() => updateLayoutSettings({ chartHeight: item.val })}
                  className={`p-2.5 border text-center transition-all ${
                    layoutSettings.chartHeight === item.val
                      ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] font-bold ring-1 ring-[var(--cds-interactive-01)]'
                      : 'bg-[var(--cds-background)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                  }`}
                >
                  <div className="text-xs">{isAr ? item.labelAr : item.labelEn}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: KPI Placement */}
          <div className="space-y-3 pt-2 border-t border-[var(--cds-border-subtle)]">
            <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              {isAr ? 'موضع مؤشرات الأداء الرئيسية (KPI Position)' : 'KPI Cards Placement'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'top' as const, labelAr: 'في الأعلى (Top Strip)', labelEn: 'Top Header Strip' },
                { val: 'bottom' as const, labelAr: 'في الأسفل (Bottom)', labelEn: 'Bottom Summary' },
                { val: 'side' as const, labelAr: 'إخفاء (Hidden)', labelEn: 'Hidden in View' },
              ].map(item => (
                <button
                  key={item.val}
                  onClick={() => updateLayoutSettings({ kpiPosition: item.val })}
                  className={`p-2.5 border text-center transition-all ${
                    layoutSettings.kpiPosition === item.val
                      ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] font-bold ring-1 ring-[var(--cds-interactive-01)]'
                      : 'bg-[var(--cds-background)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)]'
                  }`}
                >
                  <div className="text-xs">{isAr ? item.labelAr : item.labelEn}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 6: Additional Layout & Display Toggles */}
          <div className="space-y-2 pt-2 border-t border-[var(--cds-border-subtle)]">
            <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase flex items-center gap-1.5 mb-2">
              <Eye className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              {isAr ? 'خيارات العرض والهيكل المتقدمة' : 'Advanced Display & Structure'}
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] cursor-pointer hover:border-[var(--cds-border-strong)]">
              <span className="text-xs text-[var(--cds-text-01)]">
                {isAr ? 'إظهار شريط الدوال الإحصائية السريعة على البطاقات' : 'Show quick math/statistical function selectors'}
              </span>
              <input
                type="checkbox"
                checked={layoutSettings.showFormulas}
                onChange={e => updateLayoutSettings({ showFormulas: e.target.checked })}
                className="w-4 h-4 cursor-pointer accent-[var(--cds-interactive-01)]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] cursor-pointer hover:border-[var(--cds-border-strong)]">
              <span className="text-xs text-[var(--cds-text-01)]">
                {isAr ? 'إظهار شارات نوع الرسم والمحاور (Card Badges)' : 'Show chart type badges and axes details'}
              </span>
              <input
                type="checkbox"
                checked={layoutSettings.showCardBadges}
                onChange={e => updateLayoutSettings({ showCardBadges: e.target.checked })}
                className="w-4 h-4 cursor-pointer accent-[var(--cds-interactive-01)]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] cursor-pointer hover:border-[var(--cds-border-strong)]">
              <span className="text-xs text-[var(--cds-text-01)]">
                {isAr ? 'طي القائمة الجانبية افتراضياً (Compact Sidebar)' : 'Collapse sidebar to icon-only mode'}
              </span>
              <input
                type="checkbox"
                checked={layoutSettings.sidebarCollapsed}
                onChange={e => updateLayoutSettings({ sidebarCollapsed: e.target.checked })}
                className="w-4 h-4 cursor-pointer accent-[var(--cds-interactive-01)]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] cursor-pointer hover:border-[var(--cds-border-strong)]">
              <span className="text-xs text-[var(--cds-text-01)]">
                {isAr ? 'وضع الكثافة الفائقة (Compact High-Density Mode)' : 'Compact High-Density UI spacing'}
              </span>
              <input
                type="checkbox"
                checked={layoutSettings.compactMode}
                onChange={e => updateLayoutSettings({ compactMode: e.target.checked })}
                className="w-4 h-4 cursor-pointer accent-[var(--cds-interactive-01)]"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-modal-header-bg)]">
          <button
            onClick={handleReset}
            className="carbon-btn-ghost text-xs font-mono text-[var(--cds-text-03)] hover:text-[#da1e28] gap-1.5 p-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'استعادة الافتراضيات' : 'Reset Defaults'}</span>
          </button>

          <button
            onClick={handleSaveAndClose}
            className="carbon-btn-primary text-xs font-mono font-bold uppercase tracking-wider px-4 py-2"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isAr ? 'حفظ وتطبيق التفضيلات' : 'Save & Apply'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
