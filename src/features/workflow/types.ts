import { Node, Edge } from '@xyflow/react';

export type WorkflowNodeCategory = 'trigger' | 'ai' | 'logic' | 'action';

export type WorkflowNodeType =
  // Triggers
  | 'trigger_dataset'
  | 'trigger_schedule'
  | 'trigger_webhook'
  | 'trigger_quality'
  // AI & Processing
  | 'ai_profiler'
  | 'ai_cleaner'
  | 'ai_enricher'
  | 'ai_summarizer'
  | 'ai_sql_transform'
  | 'ai_forecast'
  | 'privacy_masker'
  // Logic & Rules
  | 'condition_rule'
  | 'aggregation_kpi'
  | 'filter_transform'
  // Actions & Output
  | 'action_notify'
  | 'action_export_dataset'
  | 'action_publish_widget'
  | 'action_generate_report';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowNodeOutputData {
  rows?: any[];
  columns?: { name: string; type: string; nullable?: boolean }[];
  metrics?: Record<string, any>;
  summaryText?: string;
  anomalies?: any[];
  qualityScore?: number;
  forecastData?: { period: string; historical?: number; projected?: number }[];
  chartData?: { name: string; value: number; [key: string]: any }[];
  stats?: {
    initialRows?: number;
    processedRows?: number;
    removedRows?: number;
    nullCount?: number;
  };
  details?: Record<string, any>;
}

export interface WorkflowNodeData {
  nodeType: WorkflowNodeType;
  label: string;
  labelAr: string;
  description: string;
  descriptionAr: string;
  category: WorkflowNodeCategory;
  config: Record<string, any>;
  status: NodeExecutionStatus;
  lastOutput?: any;
  outputData?: WorkflowNodeOutputData;
  errorMessage?: string;
  executionTimeMs?: number;
  [key: string]: unknown;
}

export type CustomWorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowDefinition {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  isActive: boolean;
  nodes: CustomWorkflowNode[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'idle';
  runCount: number;
  tags: string[];
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  timestamp: string;
  nodes: CustomWorkflowNode[];
  edges: Edge[];
  nodeCount: number;
  edgeCount: number;
  createdReason?: 'manual_save' | 'auto_snapshot' | 'revert' | 'template_init';
  tag?: string;
}

export interface WorkflowExecutionLog {
  id: string;
  timestamp: string;
  nodeId?: string;
  nodeLabel?: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  messageAr?: string;
  details?: any;
  durationMs?: number;
}

export interface ExecutionRunResult {
  runId: string;
  workflowId: string;
  status: 'success' | 'failed';
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  nodesExecuted: number;
  logs: WorkflowExecutionLog[];
  producedOutputs: {
    cleanedDatasetId?: string;
    cleanedDatasetName?: string;
    aiSummary?: string;
    anomaliesFound?: number;
    kpiResults?: Record<string, any>;
    notificationsSent?: number;
  };
}
