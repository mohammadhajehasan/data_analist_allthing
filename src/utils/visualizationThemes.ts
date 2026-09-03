export interface VisualizationTheme {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  colors: string[];
  gradientStop: string;
  primaryColor: string;
}

export const VISUALIZATION_THEMES: Record<string, VisualizationTheme> = {
  professional: {
    id: 'professional',
    nameEn: 'IBM Carbon Professional',
    nameAr: 'كار بون الاحترافي (Corporate)',
    descriptionEn: 'Standard corporate palette with IBM Blue, Teal, Purple, and Cyan.',
    descriptionAr: 'الألوان المؤسسية الرسمية بأزرق وأرجواني وتكواز ناصع.',
    colors: ['#0f62fe', '#009d9a', '#8a3ffc', '#ee5396', '#33b1ff', '#f1c21b', '#24a148', '#ff832b'],
    gradientStop: '#0f62fe',
    primaryColor: '#0f62fe',
  },
  vibrant: {
    id: 'vibrant',
    nameEn: 'Vibrant Neon',
    nameAr: 'نيون حيوي (Vibrant Neon)',
    descriptionEn: 'High-energy vivid neon colors for modern executive dashboards.',
    descriptionAr: 'ألوان نيون حيوية وعالية التباين لجذب الانتباه في اللوحات.',
    colors: ['#ff007a', '#00f0ff', '#7000ff', '#ffb800', '#00ff66', '#ff4800', '#00d2ff', '#e000ff'],
    gradientStop: '#ff007a',
    primaryColor: '#ff007a',
  },
  highContrast: {
    id: 'highContrast',
    nameEn: 'High-Contrast Accessibility',
    nameAr: 'تباين عالٍ وتسهيل وصول (High Contrast)',
    descriptionEn: 'Accessible high-contrast palette compliant with WCAG AA/AAA.',
    descriptionAr: 'ألوان فائقة التباين والوضوح لجميع بيئات العرض والوصول.',
    colors: ['#ffffff', '#f1c21b', '#33b1ff', '#ee5396', '#24a148', '#ff832b', '#8a3ffc', '#009d9a'],
    gradientStop: '#33b1ff',
    primaryColor: '#f1c21b',
  },
  emerald: {
    id: 'emerald',
    nameEn: 'Emerald Forest & Mint',
    nameAr: 'الزمرد والنعناع الطبيعي (Emerald & Mint)',
    descriptionEn: 'Calming green and teal shades suited for ESG and financial growth.',
    descriptionAr: 'تدرجات الخضرة والنعناع المناسبة لمؤشرات النمو والبيئة.',
    colors: ['#10b981', '#059669', '#34d399', '#047857', '#6ee7b7', '#0d9488', '#14b8a6', '#a7f3d0'],
    gradientStop: '#10b981',
    primaryColor: '#10b981',
  },
  sunset: {
    id: 'sunset',
    nameEn: 'Sunset Warmth',
    nameAr: 'غروب دافئ (Sunset Warmth)',
    descriptionEn: 'Warm gradient spectrum of orange, crimson, and amber.',
    descriptionAr: 'طيف ألوان دافئ يتنوع بين البرتقالي والياقوتي والكهرمان.',
    colors: ['#f97316', '#ef4444', '#ec4899', '#f59e0b', '#84cc16', '#d97706', '#dc2626', '#b91c1c'],
    gradientStop: '#f97316',
    primaryColor: '#f97316',
  },
  cyber: {
    id: 'cyber',
    nameEn: 'Cyberpunk Synthwave',
    nameAr: 'سايبر بانك المستقبلي (Cyberpunk)',
    descriptionEn: 'Futuristic electric tones combining cyan, magenta, and violet.',
    descriptionAr: 'تدرجات مستقبلية مضيئة تمزج السماوي والبنفسجي الكهربائي.',
    colors: ['#00ffcc', '#ff0055', '#9d00ff', '#00bfff', '#ffe600', '#ff6600', '#00ff66', '#ff00aa'],
    gradientStop: '#00ffcc',
    primaryColor: '#00ffcc',
  },
  oceanic: {
    id: 'oceanic',
    nameEn: 'Oceanic Cool Blue',
    nameAr: 'أزرق محيطي هادئ (Oceanic Cool)',
    descriptionEn: 'Soothing marine blue and indigo tones for data density.',
    descriptionAr: 'تدرجات الأزرق البحري واللازورد الكثيف للعرض الكثيف للبيانات.',
    colors: ['#0284c7', '#0d9488', '#2563eb', '#06b6d4', '#3b82f6', '#14b8a6', '#6366f1', '#0891b2'],
    gradientStop: '#0284c7',
    primaryColor: '#0284c7',
  },
};

export function getThemePalette(themeId?: string): string[] {
  if (!themeId || !VISUALIZATION_THEMES[themeId]) {
    return VISUALIZATION_THEMES.professional.colors;
  }
  return VISUALIZATION_THEMES[themeId].colors;
}
