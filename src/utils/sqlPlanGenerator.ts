import { Dataset, ExecutionPlanNode } from '../types';

/**
 * Parses a SQL query and dataset metadata to generate a comprehensive
 * hierarchical Execution Plan tree for visual rendering with D3.
 */
export function generateExecutionPlan(sql: string, dataset: Dataset): ExecutionPlanNode {
  const clean = (sql || '').trim();
  const totalRows = dataset.rowCount || (dataset.data ? dataset.data.length : 1000);
  const tableName = dataset.name.replace(/\s+/g, '_').toLowerCase();

  // Inspect SQL clauses
  const hasLimit = clean.match(/LIMIT\s+(\d+)/i);
  const limitVal = hasLimit ? parseInt(hasLimit[1], 10) : 5000;

  const hasOrderBy = clean.match(/ORDER\s+BY\s+([\s\S]+?)(?:\s+LIMIT|$)/i);
  const orderExpr = hasOrderBy ? hasOrderBy[1].trim() : '';

  const hasHaving = clean.match(/HAVING\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  const havingExpr = hasHaving ? hasHaving[1].trim() : '';

  const hasGroupBy = clean.match(/GROUP\s+BY\s+([\s\S]+?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|$)/i);
  const groupExpr = hasGroupBy ? hasGroupBy[1].trim() : '';

  const hasWhere = clean.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP\s+BY|\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|$)/i);
  const whereExpr = hasWhere ? hasWhere[1].trim() : '';

  const hasJoin = clean.match(/\b(LEFT|RIGHT|INNER|FULL)?\s*JOIN\s+([a-zA-Z0-9_]+)\s+ON\s+([\s\S]+?)(?:\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
  const joinTable = hasJoin ? hasJoin[2] : '';
  const joinCondition = hasJoin ? hasJoin[3].trim() : '';

  const hasCTE = clean.match(/^\s*WITH\s+([a-zA-Z0-9_]+)\s+AS\s*\(/i);
  const cteName = hasCTE ? hasCTE[1] : '';

  // Calculate cardinality & cost propagation up the tree
  const scanCost = Math.round(totalRows * 0.01 + 5);
  let currentRows = totalRows;
  let accumulatedCost = scanCost;

  // Leaf Node: Columnar / Vector Scan
  const scanNode: ExecutionPlanNode = {
    id: 'node-scan',
    name: 'Vectorized Columnar Scan',
    nameAr: 'مسح عمودي متجه للبيانات',
    type: 'SCAN',
    cost: scanCost,
    estimatedRows: totalRows,
    actualRows: totalRows,
    durationMs: Number((Math.random() * 0.8 + 0.4).toFixed(2)),
    expression: `FROM ${tableName}`,
    details: `Sequential in-memory SIMD scan over ${totalRows.toLocaleString()} rows (${dataset.columns.length} columns allocated).`,
    detailsAr: `مسح تسلسلي فائق السرعة في الذاكرة لـ ${totalRows.toLocaleString()} سجلاً مع تحميل ${dataset.columns.length} أعمدة.`,
  };

  let currentNode: ExecutionPlanNode = scanNode;

  // Optional Join Node
  if (hasJoin) {
    accumulatedCost += Math.round(currentRows * 0.08 + 20);
    const joinNode: ExecutionPlanNode = {
      id: 'node-join',
      name: `Hash Join (${hasJoin[1] || 'INNER'})`,
      nameAr: `ربط جدول بواسطة Hash (${hasJoin[1] || 'INNER'})`,
      type: 'JOIN',
      cost: accumulatedCost,
      estimatedRows: currentRows,
      actualRows: currentRows,
      durationMs: Number((Math.random() * 1.2 + 0.6).toFixed(2)),
      expression: `ON ${joinCondition}`,
      details: `Hash probe on table "${joinTable}" using condition: ${joinCondition}`,
      detailsAr: `فحص فهرس التجزئة مع الجدول "${joinTable}" وفق الشرط: ${joinCondition}`,
      children: [
        currentNode,
        {
          id: 'node-join-build',
          name: `Index Scan on ${joinTable}`,
          nameAr: `مسح فهرس على ${joinTable}`,
          type: 'SCAN',
          cost: Math.round(totalRows * 0.02 + 8),
          estimatedRows: Math.round(totalRows * 0.4),
          durationMs: 0.35,
          expression: `FROM ${joinTable}`,
          details: `Secondary relation loaded into memory hash table.`,
          detailsAr: `تحميل العلاقات الفرعية في جدول التجزئة بالذاكرة.`,
        },
      ],
    };
    currentNode = joinNode;
  }

  // Filter / WHERE Node
  if (whereExpr) {
    const selectivity = 0.45; // estimated 45% selectivity
    currentRows = Math.max(1, Math.round(currentRows * selectivity));
    accumulatedCost += Math.round(currentRows * 0.03 + 10);

    const filterNode: ExecutionPlanNode = {
      id: 'node-filter',
      name: 'Predicate Filter',
      nameAr: 'تصفية الشروط المنطقية',
      type: 'FILTER',
      cost: accumulatedCost,
      estimatedRows: currentRows,
      actualRows: currentRows,
      durationMs: Number((Math.random() * 0.5 + 0.2).toFixed(2)),
      expression: `WHERE ${whereExpr}`,
      details: `Evaluates predicate expression: "${whereExpr}". Estimated selectivity: ${(selectivity * 100).toFixed(0)}%.`,
      detailsAr: `تقييم شرط التصفية: "${whereExpr}". الانتقائية المقدرة: ${(selectivity * 100).toFixed(0)}%.`,
      children: [currentNode],
    };
    currentNode = filterNode;
  }

  // Group By & Aggregation Node
  if (groupExpr) {
    const groupCard = Math.min(currentRows, Math.max(3, Math.round(currentRows * 0.15)));
    currentRows = groupCard;
    accumulatedCost += Math.round(currentRows * 0.12 + 25);

    const aggNode: ExecutionPlanNode = {
      id: 'node-agg',
      name: 'Hash Aggregate & Grouping',
      nameAr: 'تجميع وحساب المؤشرات الإحصائية',
      type: 'AGGREGATE',
      cost: accumulatedCost,
      estimatedRows: groupCard,
      actualRows: groupCard,
      durationMs: Number((Math.random() * 1.5 + 0.8).toFixed(2)),
      expression: `GROUP BY ${groupExpr}`,
      details: `In-memory hash table aggregation grouped on (${groupExpr}). Aggregates computed across partitions.`,
      detailsAr: `تجميع فوري في جدول التجزئة بالذاكرة مصنفاً حسب (${groupExpr}) وحساب الدوال التجميعية.`,
      children: [currentNode],
    };
    currentNode = aggNode;
  }

  // Having Node
  if (havingExpr) {
    currentRows = Math.max(1, Math.round(currentRows * 0.7));
    accumulatedCost += 8;

    const havingNode: ExecutionPlanNode = {
      id: 'node-having',
      name: 'Having Filter',
      nameAr: 'تصفية المجموعات (HAVING)',
      type: 'FILTER',
      cost: accumulatedCost,
      estimatedRows: currentRows,
      durationMs: 0.18,
      expression: `HAVING ${havingExpr}`,
      details: `Filters grouped partitions against: "${havingExpr}".`,
      detailsAr: `تصفية التجميعات الإحصائية وفق الشرط: "${havingExpr}".`,
      children: [currentNode],
    };
    currentNode = havingNode;
  }

  // Sort / ORDER BY Node
  if (orderExpr) {
    accumulatedCost += Math.round(currentRows * Math.log2(Math.max(2, currentRows)) * 0.05 + 15);

    const sortNode: ExecutionPlanNode = {
      id: 'node-sort',
      name: 'QuickSort / Top-N Buffer',
      nameAr: 'فرز البيانات وترتيب النتائج',
      type: 'SORT',
      cost: accumulatedCost,
      estimatedRows: currentRows,
      actualRows: currentRows,
      durationMs: Number((Math.random() * 0.9 + 0.3).toFixed(2)),
      expression: `ORDER BY ${orderExpr}`,
      details: `In-memory sorting buffer on keys: "${orderExpr}". Priority heap utilized for bounded limits.`,
      detailsAr: `فرز فائق السرعة في الذاكرة وفق المفاتيح: "${orderExpr}".`,
      children: [currentNode],
    };
    currentNode = sortNode;
  }

  // Limit Node
  if (hasLimit) {
    currentRows = Math.min(currentRows, limitVal);
    accumulatedCost += 4;

    const limitNode: ExecutionPlanNode = {
      id: 'node-limit',
      name: 'Stream Limit & Early Exit',
      nameAr: 'تقييد عدد السجلات المسترجعة',
      type: 'LIMIT',
      cost: accumulatedCost,
      estimatedRows: currentRows,
      actualRows: currentRows,
      durationMs: 0.08,
      expression: `LIMIT ${limitVal}`,
      details: `Caps output pipeline stream to ${limitVal} records with early-exit optimization.`,
      detailsAr: `تقييد تدفق النتائج بحد أقصى ${limitVal} سجلاً مع إنهاء مبكر لتوفير الذاكرة.`,
      children: [currentNode],
    };
    currentNode = limitNode;
  }

  // Root Coordinator Node
  const rootNode: ExecutionPlanNode = {
    id: 'node-root',
    name: 'Result Set / Client Delivery',
    nameAr: 'تسليم النتائج النهائية',
    type: 'OUTPUT',
    cost: accumulatedCost,
    estimatedRows: currentRows,
    actualRows: currentRows,
    durationMs: Number((Math.random() * 0.4 + 0.1).toFixed(2)),
    expression: 'SELECT Output Materialization',
    details: `Serializes and delivers final ${currentRows} records to UI dataset view with columnar metadata.`,
    detailsAr: `تجهيز وتسليم النتائج النهائية (${currentRows} سجلاً) لواجهة المستخدم.`,
    children: [currentNode],
  };

  return rootNode;
}
