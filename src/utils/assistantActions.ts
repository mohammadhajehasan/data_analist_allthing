/**
 * Shared assistant action-block utilities.
 *
 * The AI agent replies with a conversational message followed (optionally) by a
 * ```json … ``` block that encodes a UI action (CREATE_REPORT / CREATE_DASHBOARD /
 * NAVIGATE). Both AssistantPage and CopilotDrawer used to duplicate this parsing
 * inline; it lives here now so it can be unit-tested across providers.
 */

export type AssistantActionKind = 'CREATE_REPORT' | 'CREATE_DASHBOARD' | 'NAVIGATE' | 'unknown' | 'none';

export interface AssistantAction {
  action?: string;
  tab?: string;
  report?: any;
  dashboard?: any;
  [key: string]: any;
}

export interface ParsedAssistantReply {
  /** The reply text with the successfully-parsed JSON block stripped. */
  replyContent: string;
  /** Parsed action object, or null when absent or unparsable. */
  action: AssistantAction | null;
}

/** Known navigation tabs advertised in the agent system prompt. */
export const KNOWN_TABS = ['datasets', 'datamodeling', 'profiling', 'dashboards', 'nl2sql', 'models', 'reports', 'guide'];

/** Widget types supported by the dashboard renderer (permissive superset). */
export const KNOWN_WIDGET_TYPES = [
  'bar', 'line', 'area', 'pie', 'radar', 'scatter', 'geo', 'table', 'metric',
  'kpi', 'heatmap', 'timeseries', 'histogram', 'donut', 'treemap', 'funnel',
];

/**
 * Extract the ```json action block from an assistant reply.
 *
 * Behaviour preserved from the original inline implementations:
 * - no block, or block that fails JSON.parse → action stays null and the
 *   ORIGINAL reply text (block included) is returned untouched.
 * - parse success → the block is removed from the returned reply text.
 */
export function parseAssistantAction(replyContent: string): ParsedAssistantReply {
  const text = replyContent || '';
  const jsonActionMatch = text.match(/```json\s*([\s\S]+?)\s*```/);
  if (!jsonActionMatch) return { replyContent: text, action: null };
  try {
    const action = JSON.parse(jsonActionMatch[1]) as AssistantAction;
    return { replyContent: text.replace(jsonActionMatch[0], '').trim(), action };
  } catch {
    return { replyContent: text, action: null };
  }
}

export interface AssistantActionValidation {
  kind: AssistantActionKind;
  valid: boolean;
  /** Blocking structural errors — data loss if dispatched as-is. */
  errors: string[];
  /** Non-blocking quality warnings. */
  warnings: string[];
}

const isNonEmptyString = (v: any) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate the structure of a parsed agent action.
 * Real LLM output varies wildly across providers (self-hosted 3B models,
 * routed free gateways, cloud flash models), so validation must be strict
 * on what the UI consumes and tolerant on cosmetics (labels, extra keys).
 */
export function validateAssistantAction(action: AssistantAction | null): AssistantActionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return { kind: 'none', valid: false, errors: ['not-an-object'], warnings };
  }

  const kind = (['CREATE_REPORT', 'CREATE_DASHBOARD', 'NAVIGATE'].includes(action.action)
    ? action.action
    : 'unknown') as AssistantActionKind;

  if (kind === 'unknown') {
    errors.push(`unknown-action:${String(action.action)}`);
    return { kind, valid: false, errors, warnings };
  }

  if (kind === 'NAVIGATE') {
    if (!isNonEmptyString(action.tab)) {
      errors.push('missing-tab');
    } else if (!KNOWN_TABS.includes(action.tab)) {
      warnings.push(`unknown-tab:${action.tab}`);
    }
    return { kind, valid: errors.length === 0, errors, warnings };
  }

  if (kind === 'CREATE_DASHBOARD') {
    const dash = action.dashboard;
    if (!dash || typeof dash !== 'object' || Array.isArray(dash)) {
      errors.push('missing-dashboard');
      return { kind, valid: false, errors, warnings };
    }
    if (!isNonEmptyString(dash.title)) errors.push('dashboard-title-not-string');
    if (!Array.isArray(dash.widgets) || dash.widgets.length === 0) {
      errors.push('widgets-empty-or-missing');
    } else {
      dash.widgets.forEach((w: any, i: number) => {
        if (!w || typeof w !== 'object') errors.push(`widget-${i}-not-object`);
        else {
          if (!isNonEmptyString(w.title)) warnings.push(`widget-${i}-title-not-string`);
          if (!isNonEmptyString(w.type)) warnings.push(`widget-${i}-type-not-string`);
          else if (!KNOWN_WIDGET_TYPES.includes(String(w.type))) warnings.push(`widget-${i}-unknown-type:${w.type}`);
          if (!isNonEmptyString(w.yAxis)) warnings.push(`widget-${i}-missing-yAxis`);
        }
      });
    }
  }

  if (kind === 'CREATE_REPORT') {
    const rep = action.report;
    if (!rep || typeof rep !== 'object' || Array.isArray(rep)) {
      errors.push('missing-report');
      return { kind, valid: false, errors, warnings };
    }
    if (!isNonEmptyString(rep.title)) errors.push('report-title-not-string');
    if (!isNonEmptyString(rep.executiveSummary)) warnings.push('missing-executiveSummary');
    if (!Array.isArray(rep.sections) || rep.sections.length === 0) {
      errors.push('sections-empty-or-missing');
    } else {
      rep.sections.forEach((s: any, i: number) => {
        if (!s || typeof s !== 'object') errors.push(`section-${i}-not-object`);
        else {
          if (!isNonEmptyString(s.title)) warnings.push(`section-${i}-title-not-string`);
          if (!isNonEmptyString(s.narrative)) errors.push(`section-${i}-narrative-empty`);
          if (!Array.isArray(s.insights) || s.insights.length === 0) warnings.push(`section-${i}-insights-empty`);
          else if (s.insights.some((x: any) => !isNonEmptyString(x))) warnings.push(`section-${i}-insight-not-string`);
        }
      });
    }
    if (!Array.isArray(rep.recommendations)) warnings.push('recommendations-not-array');
    else if (rep.recommendations.some((x: any) => !isNonEmptyString(x))) warnings.push('recommendation-not-string');
  }

  return { kind, valid: errors.length === 0, errors, warnings };
}
