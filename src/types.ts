export type RoleType = 'admin' | 'analyst' | 'engineer' | 'viewer';
export type Role = RoleType;

export interface User {
  id: string;
  email: string;
  name: string;
  role: RoleType;
  workspaceId: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  plan: 'enterprise' | 'pro' | 'starter';
  datasetCount: number;
}

export interface DatasetColumn {
  name: string;
  type: 'integer' | 'float' | 'string' | 'date' | 'boolean' | 'category';
  nullable: boolean;
  sampleValues: any[];
  description?: string;
  descriptionAr?: string;
}

export interface ColumnStats {
  columnName: string;
  type: string;
  count: number;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  cardinalityRatio: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  stdDev?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  histogram?: { bin: string; count: number }[];
  topValues?: { value: string; count: number; percentage: number }[];
}

export interface AnomalyItem {
  id: string;
  columnName: string;
  rowIndex: number;
  value: any;
  method: 'IQR' | 'Z_SCORE' | 'PATTERN';
  severity: 'low' | 'medium' | 'high';
  score: number;
  explanation: string;
}

export interface DatasetQuality {
  completenessScore: number;
  uniquenessScore: number;
  validityScore: number;
  overallScore: number;
  badge: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'POOR';
  issuesCount: number;
}

export interface DatasetProfile {
  datasetId: string;
  generatedAt: string;
  rowCount: number;
  columnCount: number;
  memorySizeBytes: number;
  quality: DatasetQuality;
  columnStats: Record<string, ColumnStats>;
  anomalies: AnomalyItem[];
  aiSummary?: string;
}

export type DatasetFormat = 'csv' | 'json' | 'excel' | 'parquet' | 'sql' | 'sqlite';

export interface Dataset {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  format: DatasetFormat;
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  columns: DatasetColumn[];
  createdAt: string;
  updatedAt: string;
  version: number;
  status: 'ready' | 'processing' | 'error';
  tags: string[];
  data: Record<string, any>[];
  profile?: DatasetProfile;
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_null'
  | 'is_not_null'
  | 'in'
  | 'between';

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: any;
  secondValue?: any;
}

export interface QueryRequest {
  datasetId: string;
  select?: string[];
  filters?: FilterCondition[];
  groupBy?: string[];
  aggregations?: { column: string; agg: 'sum' | 'avg' | 'min' | 'max' | 'count'; alias: string }[];
  orderBy?: { column: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  rawSql?: string;
}

export interface QueryResult {
  columns: string[];
  columnTypes: Record<string, string>;
  rows: Record<string, any>[];
  totalCount: number;
  executionTimeMs: number;
  fromCache?: boolean;
  sqlExecuted?: string;
  explainPlan?: string[];
}

export type AggregationFunction =
  | 'sum'
  | 'avg'
  | 'count'
  | 'min'
  | 'max'
  | 'range'
  | 'mode'
  | 'stddev'
  | 'median'
  | 'variance'
  | 'q1'
  | 'q3'
  | 'iqr'
  | 'cv'
  | 'sum_squares';

export type WidgetType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'radar' | 'histogram' | 'kpi' | 'table' | 'heatmap' | 'timeseries';

export interface WidgetConfig {
  id: string;
  title: string;
  titleAr?: string;
  type: WidgetType;
  datasetId: string;
  xAxis?: string;
  yAxis?: string;
  categoryField?: string;
  aggregation?: AggregationFunction;
  colorScheme?: string;
  w: number; // grid columns width
  h: number; // grid height
  kpiMetric?: {
    value: number | string;
    label: string;
    trendPercentage?: number;
    trendDirection?: 'up' | 'down' | 'neutral';
    prefix?: string;
    suffix?: string;
  };
  querySpec?: QueryRequest;
}

export type ThemeVariant = 'g100' | 'g90' | 'midnight' | 'g10' | 'white';
export type AccentColor = 'blue' | 'teal' | 'purple' | 'cyan' | 'magenta' | 'green' | 'orange';

export interface LayoutSettings {
  chartGridColumns: 1 | 2 | 3;
  kpiPosition: 'top' | 'side' | 'bottom';
  chartHeight: 'compact' | 'standard' | 'spacious';
  showFormulas: boolean;
  showCardBadges: boolean;
  sidebarCollapsed: boolean;
  compactMode: boolean;
  accentColor?: AccentColor;
}

export interface Dashboard {
  id: string;
  workspaceId: string;
  name?: string;
  nameAr?: string;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  widgets: WidgetConfig[];
  updatedAt: string;
  createdAt: string;
  autoRefreshIntervalSec?: number;
}

export interface ValidationLayerResult {
  layer: number;
  name: string;
  nameAr: string;
  status: 'passed' | 'warning' | 'failed';
  details: string;
  detailsAr: string;
}

export interface SQLValidationReport {
  isValid: boolean;
  canExecute: boolean;
  layers: ValidationLayerResult[];
  estimatedCost: {
    estimatedRows: number;
    complexityScore: number;
    executionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  sanitizedSql: string;
  securityViolations: string[];
}

export interface NL2SQLTestCase {
  id: string;
  question: string;
  questionAr: string;
  datasetId: string;
  expectedSql: string;
  generatedSql?: string;
  isMatch?: boolean;
  executionMatch?: boolean;
  lastTestedAt?: string;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  descriptionAr: string;
  requiredPermission: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  inputSchema: Record<string, any>;
}

export interface ToolCallItem {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'pending' | 'success' | 'error' | 'awaiting_approval';
  error?: string;
  executionTimeMs?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCallItem[];
  toolInvocations?: any[];
  embeddedChart?: {
    type: WidgetType;
    data: any[];
    title: string;
    xAxis: string;
    yAxis: string;
  };
  sqlSnippet?: string;
  suggestions?: string[];
  insights?: string[];
  suggestedChart?: any;
}

export interface ChatSession {
  id: string;
  title: string;
  datasetId?: string;
  createdAt: string;
  messages: ChatMessage[];
}

export interface ReportBlock {
  id: string;
  type: 'title' | 'executive_summary' | 'kpi' | 'chart' | 'table' | 'finding' | 'anomaly' | 'recommendation';
  title: string;
  titleAr: string;
  content?: string;
  contentAr?: string;
  chartConfig?: WidgetConfig;
  kpiData?: { label: string; value: string; trend?: string };
  tableData?: { headers: string[]; rows: any[][] };
}

export interface Report {
  id: string;
  workspaceId: string;
  datasetId: string;
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  blocks: ReportBlock[];
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface DataStory {
  id: string;
  datasetId: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  executiveSummary: string;
  executiveSummaryAr: string;
  chapters: {
    id: string;
    title: string;
    titleAr: string;
    narrative: string;
    narrativeAr: string;
    chartConfig?: WidgetConfig;
    keyMetric?: { label: string; value: string; context: string };
    takeaway: string;
    takeawayAr: string;
  }[];
  generatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  workspaceId: string;
  action: string;
  resourceType: 'dataset' | 'sql_query' | 'assistant_tool' | 'dashboard' | 'report' | 'auth';
  resourceId?: string;
  toolName?: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  durationMs: number;
  timestamp: string;
  payloadSummary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface FeatureFlags {
  FF_AI_ENABLED: boolean;
  FF_NL2SQL_ENABLED: boolean;
  FF_STREAMING_ENABLED: boolean;
  FF_PROFILING_CACHE: boolean;
  FF_ANOMALY_DETECTION: boolean;
  FF_EXPORT_PDF_ENABLED: boolean;
  FF_SQL_SANDBOX_STRICT: boolean;
}

export interface ExecutionPlanNode {
  id: string;
  name: string;
  nameAr?: string;
  type: 'SCAN' | 'FILTER' | 'AGGREGATE' | 'SORT' | 'LIMIT' | 'JOIN' | 'PROJECTION' | 'OUTPUT';
  cost: number;
  estimatedRows: number;
  actualRows?: number;
  durationMs?: number;
  details: string;
  detailsAr?: string;
  expression?: string;
  children?: ExecutionPlanNode[];
}

export interface SqlOptimizationResult {
  originalSql: string;
  optimizedSql: string;
  estimatedSpeedup: string;
  summaryEn: string;
  summaryAr: string;
  indexingRecommendations: {
    column: string;
    table: string;
    indexType: 'BTREE' | 'HASH' | 'COMPOSITE';
    ddl: string;
    reasonEn: string;
    reasonAr: string;
  }[];
  refactoringNotes: {
    category: string;
    categoryAr?: string;
    noteEn: string;
    noteAr: string;
  }[];
  antiPatternsDetected?: {
    pattern: string;
    patternAr: string;
    severity: 'low' | 'medium' | 'high';
    fix: string;
    fixAr: string;
  }[];
}

export interface SmartCorrectionSuggestion {
  id: string;
  title: string;
  titleAr: string;
  explanation: string;
  explanationAr: string;
  fixedSql?: string;
  autoFixAvailable: boolean;
  category: 'syntax' | 'schema' | 'security' | 'logic' | 'performance';
}

export interface SqlErrorAnalysis {
  hasError: boolean;
  rawError?: string;
  errorCategory: 'SYNTAX' | 'UNKNOWN_COLUMN' | 'CLAUSE_ORDER' | 'MISSING_GROUP_BY' | 'FORBIDDEN_KEYWORD' | 'UNBALANCED_BRACKETS' | 'TYPE_MISMATCH' | 'NONE';
  errorLine?: number;
  errorColumn?: number;
  highlightedSnippet?: string;
  messageEn: string;
  messageAr: string;
  suggestions: SmartCorrectionSuggestion[];
}

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  timestamp: number;
  duration?: number;
  action?: {
    label: string;
    labelAr?: string;
    onClick: () => void;
  };
}

export interface TourStep {
  id: string;
  targetSelector?: string;
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  tabToActivate?: string;
  badge?: string;
  badgeAr?: string;
}

// ----------------------------------------------------
// Data Lineage & Pipeline Provenance Types
// ----------------------------------------------------
export interface LineageSourceNode {
  id: string;
  name: string;
  nameAr: string;
  type: 'database' | 'api' | 'file_upload' | 'stream' | 'crm' | 'warehouse' | 's3' | 'sqlite';
  sourceSystem: string;
  ingestionMode: 'batch' | 'streaming' | 'on_demand' | 'cdc';
  connectionStatus: 'connected' | 'healthy' | 'synced' | 'degraded';
  rawRecordCount: number;
  extractedAt: string;
  sourceHost?: string;
  sourceTableOrPath?: string;
  schemaFieldsCount: number;
  description: string;
  descriptionAr: string;
  sourceColumns?: { name: string; type: string; isPrimaryKey?: boolean }[];
}

export interface LineageTransformNode {
  id: string;
  stepNumber: number;
  name: string;
  nameAr: string;
  type: 'ingestion' | 'cleansing' | 'profiling' | 'enrichment' | 'aggregation' | 'governance';
  engine: 'in_memory_olap' | 'carbon_etl' | 'spark' | 'dbt' | 'validator';
  status: 'passed' | 'warning' | 'in_progress';
  executionTimeMs: number;
  rowsIn: number;
  rowsOut: number;
  details: string;
  detailsAr: string;
  rulesApplied: string[];
  rulesAppliedAr?: string[];
  impactedColumns: string[];
}

export interface LineageDestinationNode {
  id: string;
  name: string;
  nameAr: string;
  type: 'dashboard' | 'dashboard_widget' | 'report' | 'nl2sql_query' | 'api_sink' | 'export';
  targetEntityId?: string;
  category: 'Dashboard' | 'AI Report' | 'SQL Sandbox' | 'Export Channel';
  status: 'active' | 'synced' | 'idle';
  lastRefreshedAt: string;
  consumerCount?: number;
  targetMetrics?: string[];
  description: string;
  descriptionAr: string;
  iconName?: string;
}

export interface ColumnLineageTrace {
  columnName: string;
  sourceColumn: string;
  sourceType: string;
  transformations: string[];
  transformationsAr: string[];
  downstreamUses: {
    targetName: string;
    targetNameAr: string;
    type: string;
    role: string;
  }[];
}

export interface DatasetLineageManifest {
  datasetId: string;
  datasetName: string;
  updatedAt: string;
  sources: LineageSourceNode[];
  transformations: LineageTransformNode[];
  destinations: LineageDestinationNode[];
  columnTraces: ColumnLineageTrace[];
  governanceScore: number;
  slaStatus: 'MET' | 'AT_RISK' | 'BREACHED';
  dataFreshnessSec: number;
}

export * from './types/aiProviders';

export type RelationshipType = '1:1' | '1:M' | 'M:1' | 'M:M';

export interface DataModelRelationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  relationshipType: RelationshipType;
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  confidence?: number;
  description?: string;
  descriptionAr?: string;
  isAiGenerated?: boolean;
}

export interface DataModelTable {
  id: string;
  name: string;
  rowCount: number;
  columns: DatasetColumn[];
  primaryKey?: string[];
  dataSample?: Record<string, any>[];
  fullData?: Record<string, any>[];
  color?: string;
}

export interface DataModelSchema {
  id: string;
  name: string;
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
  createdAt: string;
  updatedAt: string;
  aiNotes?: string;
  aiNotesAr?: string;
}


