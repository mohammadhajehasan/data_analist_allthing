export type AIProviderId = 'gemini' | 'ollama' | 'qwen' | 'deepseek' | 'openrouter' | 'custom_openai';

export type AIModelCapability = 'nl2sql' | 'reasoning' | 'optimization' | 'privacy' | 'fast' | 'vision' | 'code';

export interface AIModelDefinition {
  id: string;
  name: string;
  provider: AIProviderId;
  providerName: string;
  description: string;
  descriptionAr: string;
  contextWindow: number;
  isLocal: boolean;
  isPrivacyFirst: boolean;
  capabilities: AIModelCapability[];
  parameterSize?: string;
  recommendedFor?: string;
  recommendedForAr?: string;
  pullCommand?: string; // For Ollama
}

export interface AIProviderConfig {
  providerId: AIProviderId;
  name: string;
  nameAr: string;
  enabled: boolean;
  apiKey?: string;
  endpointUrl?: string; // e.g. http://localhost:11434 for Ollama
  defaultModelId: string;
  status: 'connected' | 'disconnected' | 'checking' | 'unconfigured' | 'error';
  lastPingMs?: number;
  errorMessage?: string;
  installedLocalModels?: string[];
  discoveredModels?: Array<{
    id: string;
    name: string;
    isFree: boolean;
    costPer1kTokens?: number;
    contextWindow?: number;
    capabilities?: string[];
  }>;
  isLocalOnly: boolean;
  description: string;
  descriptionAr: string;
  badge: string;
  badgeAr: string;
}

export type AIPrivacyMode = 'strict_local' | 'hybrid' | 'cloud_allowed';

export interface AISettings {
  activeProvider: AIProviderId;
  activeModel: string;
  privacyMode: AIPrivacyMode;
  providers: Record<AIProviderId, AIProviderConfig>;
  comparisonDefaults: string[]; // default models to compare
}

export interface ModelBenchmarkScore {
  accuracy: number; // 0 - 100
  safety: number; // 0 - 100
  efficiency: number; // 0 - 100
  overallScore: number; // 0 - 100
}

export interface ModelBenchmarkResult {
  modelId: string;
  modelName: string;
  providerId: AIProviderId;
  providerName: string;
  isLocal: boolean;
  isPrivacyFirst: boolean;
  durationMs: number;
  tokensCount?: number;
  status: 'success' | 'error' | 'running';
  sql?: string;
  explanation?: string;
  validationReport?: {
    isValid: boolean;
    canExecute: boolean;
    layerScore: number;
    securityViolations: string[];
    complexityScore: number;
  };
  score: ModelBenchmarkScore;
  error?: string;
  userVote?: 'up' | 'down' | 'winner';
  insights?: string[];
}

export interface MultiModelComparisonSession {
  id: string;
  timestamp: string;
  question: string;
  datasetName: string;
  modelsTested: string[];
  results: ModelBenchmarkResult[];
  winnerModelId?: string;
}

// Global Registry of AI Models available across the platform
export const AVAILABLE_AI_MODELS: AIModelDefinition[] = [
  // 1. Google Gemini (Server-side cloud)
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    providerName: 'Google Gemini',
    description: 'Next-generation high-speed multimodal reasoning model with hybrid thinking capabilities for enterprise data.',
    descriptionAr: 'نموذج فائق السرعة مع قدرات تفكير واستدلال متقدمة لتحليل البيانات واستعلامات SQL والمساعد الذكي.',
    contextWindow: 1048576,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'reasoning', 'optimization', 'fast'],
    recommendedFor: 'Analytical queries, Copilot reasoning & data storytelling',
    recommendedForAr: 'الاستعلامات التحليلية، استدلال المساعد الذكي وقصص البيانات',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'gemini',
    providerName: 'Google Gemini',
    description: 'State-of-the-art flagship reasoning model for deep data architecture and multi-step execution plans.',
    descriptionAr: 'النموذج الرائد للاستدلال العميق وهندسة خطط التنفيذ متعددة المستويات والتحليلات المتقدمة.',
    contextWindow: 2097152,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'reasoning', 'optimization'],
    recommendedFor: 'Deep SQL optimization & architecture audits',
    recommendedForAr: 'التحسين المتقدم للاستعلامات والتدقيق الهيكلي',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    providerName: 'Google Gemini',
    description: 'Ultra-low latency model optimized for high-throughput real-time query generation.',
    descriptionAr: 'نموذج فائق السرعة بزمن استجابة منخفض جداً لتوليد الاستعلامات اللحظية.',
    contextWindow: 1048576,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'fast'],
    recommendedFor: 'Sub-second real-time SQL generation',
    recommendedForAr: 'التوليد الفوري السريع للاستعلامات بأقل من ثانية',
  },

  // 2. Ollama (Local & 100% Privacy-First, Zero Data Egress)
  {
    id: 'ollama/qwen2.5-coder:7b',
    name: 'Ollama: Qwen 2.5 Coder (7B)',
    provider: 'ollama',
    providerName: 'Ollama (Local Privacy)',
    description: 'State-of-the-art open-weights coding model running 100% locally. Zero data leaves your machine.',
    descriptionAr: 'نموذج برمجي متقدم ومفتوح المصدر يعمل محلياً بنسبة 100% دون خروج أي بيانات خارج جهازك.',
    contextWindow: 32768,
    isLocal: true,
    isPrivacyFirst: true,
    capabilities: ['nl2sql', 'privacy', 'code', 'fast'],
    parameterSize: '7B',
    recommendedFor: 'Local private SQL generation with zero data leaks',
    recommendedForAr: 'توليد استعلامات SQL محلية بخصوصية وأمان تام',
    pullCommand: 'ollama run qwen2.5-coder:7b',
  },
  {
    id: 'ollama/deepseek-r1:8b',
    name: 'Ollama: DeepSeek-R1 (8B)',
    provider: 'ollama',
    providerName: 'Ollama (Local Privacy)',
    description: 'Advanced local reasoning and chain-of-thought engine for rigorous mathematical and schema validation.',
    descriptionAr: 'محرك استدلال محلي متقدم بسلاسل تفكير منطقية لتحليل المخططات الرياضية والتحقق الآمن.',
    contextWindow: 65536,
    isLocal: true,
    isPrivacyFirst: true,
    capabilities: ['reasoning', 'privacy', 'nl2sql', 'optimization'],
    parameterSize: '8B',
    recommendedFor: 'Private deep reasoning & SQL verification',
    recommendedForAr: 'الاستدلال والتحقق الرياضي من الاستعلامات محلياً',
    pullCommand: 'ollama run deepseek-r1:8b',
  },
  {
    id: 'ollama/llama3.3:70b',
    name: 'Ollama: Llama 3.3 (70B)',
    provider: 'ollama',
    providerName: 'Ollama (Local Privacy)',
    description: 'Flagship open-source model running on local GPU servers for enterprise-grade analytics.',
    descriptionAr: 'النموذج الرائد المفتوح للأجهزة والخوادم المحلية ذات العتاد القوي للتحليلات المؤسسية.',
    contextWindow: 131072,
    isLocal: true,
    isPrivacyFirst: true,
    capabilities: ['nl2sql', 'reasoning', 'privacy', 'optimization'],
    parameterSize: '70B',
    recommendedFor: 'Enterprise on-premise analytical copilots',
    recommendedForAr: 'المساعد التحليلي المحلي للشركات والمؤسسات',
    pullCommand: 'ollama run llama3.3',
  },
  {
    id: 'ollama/mistral-nemo:12b',
    name: 'Ollama: Mistral Nemo (12B)',
    provider: 'ollama',
    providerName: 'Ollama (Local Privacy)',
    description: 'Efficient multilingual local model with high accuracy across Arabic and English queries.',
    descriptionAr: 'نموذج محلي كفء متعدد اللغات يتميز بدقة عالية للاستعلامات العربية والإنجليزية.',
    contextWindow: 128000,
    isLocal: true,
    isPrivacyFirst: true,
    capabilities: ['nl2sql', 'privacy', 'fast'],
    parameterSize: '12B',
    recommendedFor: 'Bilingual local analytics and fast query parsing',
    recommendedForAr: 'التحليلات ثنائية اللغة وتفكيك الاستعلامات محلياً',
    pullCommand: 'ollama run mistral-nemo',
  },

  // 3. Qwen AI (Alibaba Cloud / DashScope)
  {
    id: 'qwen/qwen-2.5-coder-32b',
    name: 'Qwen 2.5 Coder (32B)',
    provider: 'qwen',
    providerName: 'Qwen AI (Alibaba)',
    description: 'Top-tier code and SQL generation model with deep understanding of relational algebra.',
    descriptionAr: 'أقوى نماذج البرمجة وتوليد الـ SQL مع فهم عميق للعلاقات الجبرية وقواعد البيانات.',
    contextWindow: 131072,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'code', 'optimization', 'reasoning'],
    recommendedFor: 'Precision SQL generation & complex CTE transforms',
    recommendedForAr: 'توليد SQL الدقيق والتحويلات المعقدة وتجميع الجداول',
  },
  {
    id: 'qwen/qwen-max',
    name: 'Qwen Max (Flagship)',
    provider: 'qwen',
    providerName: 'Qwen AI (Alibaba)',
    description: 'Alibaba Cloud flagship model for complex reasoning and bilingual analytical synthesis.',
    descriptionAr: 'النموذج الأقوى من علي بابا كلاود للاستدلال المنطقي والتحليل ثنائي اللغة.',
    contextWindow: 32768,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['reasoning', 'nl2sql', 'optimization'],
    recommendedFor: 'High-level business intelligence & narrative synthesis',
    recommendedForAr: 'ذكاء الأعمال الرفيع وصياغة القصص البيانية',
  },
  {
    id: 'qwen/qwen-plus',
    name: 'Qwen Plus',
    provider: 'qwen',
    providerName: 'Qwen AI (Alibaba)',
    description: 'Balanced speed and analytical depth for medium-latency reporting.',
    descriptionAr: 'توازن مثالي بين السرعة والعمق التحليلي للتقارير والتحليلات.',
    contextWindow: 131072,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'fast'],
    recommendedFor: 'Cost-efficient enterprise analytics',
    recommendedForAr: 'التحليلات المؤسسية الاقتصادية والسريعة',
  },

  // 4. Z.AI / DeepSeek / Zhipu GLM
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek-R1 (Reasoning)',
    provider: 'deepseek',
    providerName: 'DeepSeek / Z.AI',
    description: 'Groundbreaking open reasoning model with transparent chain-of-thought verification for SQL optimization.',
    descriptionAr: 'نموذج الاستدلال الثوري مع إظهار خطوات التفكير للتحقق من أداء واستعلامات الـ SQL.',
    contextWindow: 65536,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['reasoning', 'optimization', 'nl2sql'],
    recommendedFor: 'Execution plan optimization & complex mathematical joins',
    recommendedForAr: 'تحسين خطط التنفيذ والربط الرياضي المعقد بين الجداول',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek-V3',
    provider: 'deepseek',
    providerName: 'DeepSeek / Z.AI',
    description: '671B parameter Mixture-of-Experts model delivering high-speed accurate SQL translations.',
    descriptionAr: 'نموذج MoE ضخم يقدم ترجمة استعلامات SQL سريعة وفائقة الدقة.',
    contextWindow: 65536,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'fast', 'code'],
    recommendedFor: 'Fast interactive NL2SQL parsing',
    recommendedForAr: 'تحليل الاستعلامات الطبيعية الفوري والتفاعلي',
  },

  // 5. OpenRouter (Universal AI Gateway)
  {
    id: 'openrouter/anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet (via OpenRouter)',
    provider: 'openrouter',
    providerName: 'OpenRouter Gateway',
    description: 'Hybrid reasoning and coding model with exceptional syntax precision and schema mapping.',
    descriptionAr: 'نموذج هجين متقدم في كتابة الأكواد ومطابقة المخططات بدقة متناهية.',
    contextWindow: 200000,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'reasoning', 'optimization'],
    recommendedFor: 'Complex schema migrations and multi-table views',
    recommendedForAr: 'مخططات قواعد البيانات المعقدة والاستعلامات المتشعبة',
  },
  {
    id: 'openrouter/meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B (via OpenRouter)',
    provider: 'openrouter',
    providerName: 'OpenRouter Gateway',
    description: 'Open-weights flagship hosted on high-throughput serverless endpoints.',
    descriptionAr: 'النموذج المفتوح الرائد عبر خوادم سحابية موزعة فائقة السرعة.',
    contextWindow: 131072,
    isLocal: false,
    isPrivacyFirst: false,
    capabilities: ['nl2sql', 'fast'],
    recommendedFor: 'High-throughput batch analytics',
    recommendedForAr: 'المعالجة الدفعية ذات الحجم المرتفع',
  },

  // 6. Custom OpenAI-Compatible
  {
    id: 'custom_openai/default',
    name: 'Custom Self-Hosted LLM (vLLM / LM Studio / LocalAI)',
    provider: 'custom_openai',
    providerName: 'Custom OpenAI-Compatible',
    description: 'Connect any proprietary, on-premise, or self-hosted LLM gateway with full privacy.',
    descriptionAr: 'ربط أي خادم ذكاء اصطناعي محلي أو خاص مع دعم بروتوكول OpenAI لخصوصية مطلقة.',
    contextWindow: 32768,
    isLocal: true,
    isPrivacyFirst: true,
    capabilities: ['nl2sql', 'privacy', 'code'],
    recommendedFor: 'Custom enterprise infrastructure & air-gapped setups',
    recommendedForAr: 'البيئات المعزولة والبنية التحتية الخاصة بالشركات',
  },
];

export const INITIAL_AI_SETTINGS: AISettings = {
  activeProvider: 'gemini',
  activeModel: 'gemini-3.8-flash',
  privacyMode: 'hybrid',
  comparisonDefaults: [
    'gemini-3.8-flash',
    'ollama/qwen2.5-coder:7b',
    'deepseek/deepseek-r1',
    'qwen/qwen-2.5-coder-32b',
  ],
  providers: {
    gemini: {
      providerId: 'gemini',
      name: 'Google Gemini',
      nameAr: 'جوجل جيميني (سحابي)',
      enabled: true,
      defaultModelId: 'gemini-3.8-flash',
      status: 'connected',
      isLocalOnly: false,
      description: 'Integrated enterprise Gemini engine with multimodal reasoning & SQL synthesis.',
      descriptionAr: 'محرك جيميني المؤسسي المدمج مع قدرات الاستدلال وتوليد استعلامات SQL والمساعد الذكي.',
      badge: 'Built-in Cloud',
      badgeAr: 'مدمج وسحابي',
    },
    ollama: {
      providerId: 'ollama',
      name: 'Ollama Local Engine',
      nameAr: 'محرك أولاما المحلي (خصوصية تامة)',
      enabled: true,
      endpointUrl: 'http://localhost:11434',
      defaultModelId: 'ollama/qwen2.5-coder:7b',
      status: 'unconfigured',
      isLocalOnly: true,
      description: '100% Local zero-data-egress engine. All queries & dataset schemas remain strictly on your machine.',
      descriptionAr: 'معالجة محلية 100% دون خروج أي بيانات خارج جهازك. ضمان خصوصية وأمان تام لمخططاتك وبياناتك.',
      badge: '100% Local Privacy',
      badgeAr: '🔒 خصوصية محلية 100%',
    },
    qwen: {
      providerId: 'qwen',
      name: 'Qwen AI (Alibaba Cloud)',
      nameAr: 'كيوين (Alibaba DashScope)',
      enabled: false,
      endpointUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      defaultModelId: 'qwen/qwen-2.5-coder-32b',
      status: 'unconfigured',
      isLocalOnly: false,
      description: 'Alibaba Cloud DashScope LLM suite with specialized coding & SQL capabilities.',
      descriptionAr: 'حزمة نماذج علي بابا كلاود المتخصصة في البرمجة والاستعلامات التحليلية.',
      badge: 'Alibaba Cloud',
      badgeAr: 'علي بابا كلاود',
    },
    deepseek: {
      providerId: 'deepseek',
      name: 'DeepSeek / Z.AI',
      nameAr: 'ديب سيك / Z.AI',
      enabled: false,
      endpointUrl: 'https://api.deepseek.com/v1',
      defaultModelId: 'deepseek/deepseek-r1',
      status: 'unconfigured',
      isLocalOnly: false,
      description: 'DeepSeek reasoning & V3 models for cost-efficient deep query synthesis.',
      descriptionAr: 'نماذج ديب سيك للاستدلال العميق وتحسين خطط الاستعلامات المعقدة.',
      badge: 'Reasoning Leader',
      badgeAr: 'رائد الاستدلال',
    },
    openrouter: {
      providerId: 'openrouter',
      name: 'OpenRouter Gateway',
      nameAr: 'بوابة أوبن روتر (OpenRouter)',
      enabled: false,
      endpointUrl: 'https://openrouter.ai/api/v1',
      defaultModelId: 'openrouter/anthropic/claude-3.7-sonnet',
      status: 'unconfigured',
      isLocalOnly: false,
      description: 'Universal unified gateway with access to Claude, GPT-4o, Llama, and hundreds of models.',
      descriptionAr: 'بوابة موحدة للوصول إلى مئات النماذج مثل كلود، GPT-4o، و لاما بمفتاح واحد.',
      badge: 'Unified Multi-Model',
      badgeAr: 'بوابة متعددة النماذج',
    },
    custom_openai: {
      providerId: 'custom_openai',
      name: 'Custom OpenAI-Compatible API',
      nameAr: 'واجهة مخصصة (OpenAI Compatible)',
      enabled: false,
      endpointUrl: 'http://localhost:8000/v1',
      defaultModelId: 'custom_openai/default',
      status: 'unconfigured',
      isLocalOnly: true,
      description: 'Connect private vLLM, LM Studio, LocalAI, or custom corporate gateways.',
      descriptionAr: 'ربط خوادم vLLM أو LM Studio أو خوادم الشركات الخاصة لخصوصية كاملة.',
      badge: 'Custom Gateway',
      badgeAr: 'خادم مخصص',
    },
},
  };

// Type for dynamically fetched cloud provider models
export interface DynamicCloudModel {
  id: string;
  name: string;
  provider: AIProviderId;
  description: string;
  descriptionAr: string;
  contextWindow?: number;
  isLocal: false;
  isFree: boolean;
  costPer1kTokens?: number;
  capabilities: AIModelCapability[];
  recommendedFor: string;
  recommendedForAr: string;
  parameterSize?: string;
}

// Result from model discovery endpoint
export interface ModelDiscoveryResult {
  models: DynamicCloudModel[];
  refreshedAt: string;
}
