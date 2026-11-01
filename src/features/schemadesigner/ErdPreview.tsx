import React, { useMemo, useState } from 'react';
import { KeyRound, Link2, ZoomIn, ZoomOut, Scaling } from 'lucide-react';
import { ErModel, ErCardinality } from '../../utils/drawioImporter';

/**
 * ErdPreview — معاينة مرئية لمخطط ER المستورد من draw.io
 * ------------------------------------------------------
 * • بطاقات جداول بموضع طوبولوجي (الأب قبل الابن: أعمدة من اليسار لليمين)
 * • موصّلات منحنية بين الجداول مع شارات التعددية (1—N ، M—N ، 1—1)
 * • تمييز أعمدة PK (مفتاح) و FK (وصلة) على الجدول
 * • تكبير/تصغير + hover لإبراز علاقات جدول معيّن
 * حساب الأحجام حتمي من بيانات النموذج (بدون قياس DOM) — مستقر مع تصفير Coalescing.
 */

const CARD_W = 232;
const HEADER_H = 28;
const ROW_H = 20;
const CARD_PAD_V = 12;
const COL_GAP = 96;
const ROW_GAP = 18;
const TABLES_PER_COL = 3;
const MAX_ZOOM = 1.4;
const MIN_ZOOM = 0.55;

const CARD_COLOR_1N = 'var(--cds-interactive-01)';
const CARD_COLOR_NM = '#f1c21b';
const CARD_COLOR_11 = '#42be65';

interface Box { x: number; y: number; h: number; }

function cardHeight(cols: number): number {
  return HEADER_H + cols * ROW_H + CARD_PAD_V;
}

/** ترتيب طوبولوجي: الأب قبل الابن وفق علاقات 1-N (علاقات N-M محايدة) */
function topoOrderByTableIds(model: ErModel): string[] {
  const ids = model.tables.map(t => t.id);
  const idSet = new Set(ids);
  const indegree = new Map<string, number>(ids.map(id => [id, 0]));
  const dependents = new Map<string, string[]>(); // parent -> children who depend on it

  for (const rel of model.relationships) {
    if (!rel.sourceTable || !rel.targetTable) continue;
    if (!idSet.has(rel.sourceTable) || !idSet.has(rel.targetTable)) continue;
    if (rel.cardinality === 'N-M') continue; // لا اعتماد صارم
    if (rel.sourceTable === rel.targetTable) continue;
    // 1-N: الوالد source / الابن target — الابن يعتمد على الوالد
    const list = dependents.get(rel.sourceTable) ?? [];
    if (list.includes(rel.targetTable)) continue;
    list.push(rel.targetTable);
    dependents.set(rel.sourceTable, list);
    indegree.set(rel.targetTable, (indegree.get(rel.targetTable) ?? 0) + 1);
  }

  const queue = ids.filter(id => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const left = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, left);
      if (left === 0) queue.push(child);
    }
  }
  // حلقات تبعية إن وُجدت: الأباقون في نهاية الترتيب
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return order;
}

function computeLayout(model: ErModel): { boxes: Map<string, Box>; width: number; height: number } {
  const order = topoOrderByTableIds(model);
  const boxes = new Map<string, Box>();
  let col = 0;
  let cursorY = 0;
  let colMaxHeight = 0;
  const COL_X = (c: number) => c * (CARD_W + COL_GAP) + COL_GAP / 2;

  for (const id of order) {
    const table = model.tables.find(t => t.id === id);
    if (!table) continue;
    const h = cardHeight(table.columns.length || 1);
    if (cursorY > 0 && cursorY + h > 0 && boxes.size > 0 && cursorY >= 0 && (boxes.size % TABLES_PER_COL) === 0) {
      // عمود جديد
      col += 1;
      cursorY = 0;
    }
    boxes.set(id, { x: COL_X(col), y: cursorY, h });
    cursorY += h + ROW_GAP;
    colMaxHeight = Math.max(colMaxHeight, cursorY);
  }
  // أعمدة تضيف هامش سفلي
  const width = (col + 1) * (CARD_W + COL_GAP);
  const height = colMaxHeight + ROW_GAP;
  return { boxes, width, height };
}

function cardinalityColors(c: ErCardinality): string {
  if (c === 'N-M') return CARD_COLOR_NM;
  if (c === '1-1') return CARD_COLOR_11;
  return CARD_COLOR_1N;
}

/** حرفا التعددية عند كل طرف: 1-N => (1 النهاية المصدر، N الهدف)؛ N-M => (M، N)؛ 1-1 => (1، 1) */
function cardinalityLetters(c: ErCardinality): [string, string] {
  if (c === 'N-M') return ['M', 'N'];
  if (c === '1-1') return ['1', '1'];
  return ['1', 'N'];
}

interface Connector {
  id: string;
  source: string;
  target: string;
  cardinality: ErCardinality;
  path: string;
  letterStart: { x: number; y: number; text: string };
  letterEnd: { x: number; y: number; text: string };
  direction: 1 | -1;
}

function computeConnectors(model: ErModel, boxes: Map<string, Box>): Connector[] {
  const out: Connector[] = [];
  for (const rel of model.relationships) {
    const a = boxes.get(rel.sourceTable);
    const b = boxes.get(rel.targetTable);
    if (!a || !b) continue;
    const color = cardinalityColors(rel.cardinality);
    const [startLetter, endLetter] = cardinalityLetters(rel.cardinality);
    void color;

    let x1: number; let y1: number; let x2: number; let y2: number; let dir: 1 | -1;
    if (b.x >= a.x + CARD_W) {
      dir = 1;
      x1 = a.x + CARD_W; y1 = a.y + a.h / 2;
      x2 = b.x; y2 = b.y + b.h / 2;
    } else if (b.x + CARD_W <= a.x) {
      dir = -1;
      x1 = a.x; y1 = a.y + a.h / 2;
      x2 = b.x + CARD_W; y2 = b.y + b.h / 2;
    } else {
      // تراكب العمود نفسه — من أعلى الابن/أسفل الجدول الأب
      dir = 1;
      x1 = a.x + CARD_W / 2; y1 = a.y + a.h;
      x2 = b.x + CARD_W / 2; y2 = b.y;
    }

    let path: string;
    if (dir === 1 && x2 > x1) {
      const bend = Math.min(Math.abs(x2 - x1) * 0.45, 70);
      path = `M ${x1},${y1} C ${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
    } else if (dir === -1 && x1 > x2) {
      const bend = Math.min(Math.abs(x1 - x2) * 0.45, 70);
      path = `M ${x1},${y1} C ${x1 - bend},${y1} ${x2 + bend},${y2} ${x2},${y2}`;
    } else {
      // منحنى عمودي موجّه للأعلى
      const bend = Math.min(Math.abs(y2 - y1) * 0.4, 60);
      path = `M ${x1},${y1} C ${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
    }

    out.push({
      id: rel.id,
      source: rel.sourceTable,
      target: rel.targetTable,
      cardinality: rel.cardinality,
      path,
      letterStart: { x: x1 + dir * 14, y: y1 - 8, text: startLetter },
      letterEnd: { x: x2 - dir * 14, y: y2 - 8, text: endLetter },
      direction: dir,
    });
  }
  return out;
}

interface ErdPreviewProps {
  model: ErModel;
  isAr: boolean;
}

export const ErdPreview: React.FC<ErdPreviewProps> = ({ model, isAr }) => {
  const [zoom, setZoom] = useState<number>(0.85);
  const [hovered, setHovered] = useState<string | null>(null);

  const { boxes, width, height } = useMemo(() => computeLayout(model), [model]);
  const connectors = useMemo(() => computeConnectors(model, boxes), [model, boxes]);

  // أعمدة FK لكل جدول — من علاقات	children
  const fkColumnsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rel of model.relationships) {
      if (rel.cardinality === '1-N' && rel.targetColumn) {
        const set = map.get(rel.targetTable) ?? new Set<string>();
        set.add(rel.targetColumn.toLowerCase());
        map.set(rel.targetTable, set);
      }
    }
    return map;
  }, [model]);

  const connectorColor = (c: Connector): string => cardinalityColors(c.cardinality);
  const isHighlighted = (c: Connector): boolean => hovered === null || hovered === c.source || hovered === c.target;

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
      {/* شريط علوي: عنوان + عدد + عناصر تحكم */}
      <div className="px-3 py-2 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center gap-3">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-interactive-01)]">
          {isAr ? 'معاينة المخطط المرئية' : 'Visual ERD preview'}
        </span>
        <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
          {model.tables.length} {isAr ? 'جدولاً' : 'tables'} · {model.relationships.length} {isAr ? 'علاقات' : 'relations'}
        </span>
        <div className="ms-auto flex items-center gap-1.5">
          <button type="button" aria-label={isAr ? 'تصغير' : 'Zoom out'} onClick={() => setZoom(z => Math.max(MIN_ZOOM, Number((z - 0.15).toFixed(2))))} className="p-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]">
            <ZoomOut className="w-3.5 h-3.5 text-[var(--cds-text-02)]" />
          </button>
          <span className="text-[10px] font-mono text-[var(--cds-text-03)] w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label={isAr ? 'تكبير' : 'Zoom in'} onClick={() => setZoom(z => Math.min(MAX_ZOOM, Number((z + 0.15).toFixed(2))))} className="p-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]">
            <ZoomIn className="w-3.5 h-3.5 text-[var(--cds-text-02)]" />
          </button>
          <button type="button" aria-label={isAr ? 'إعادة الضبط' : 'Reset zoom'} onClick={() => setZoom(0.85)} className="p-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]">
            <Scaling className="w-3.5 h-3.5 text-[var(--cds-text-02)]" />
          </button>
        </div>
      </div>

      {/* منطقة الرسم — LTR هندسياً لأن الإحداثيات ملكية عالمية للكانتاس */}
      <div className="overflow-auto max-h-[520px]" dir="ltr">
        <div style={{ width: width * zoom, height: height * zoom }} className="relative">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width, height }} className="absolute top-0 left-0">
            {/* الموصّلات */}
            <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none">
              {connectors.map(c => {
                const color = connectorColor(c);
                const active = isHighlighted(c);
                return (
                  <g key={c.id} opacity={active ? 1 : 0.18}>
                    <path d={c.path} fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.4} strokeOpacity={active ? 0.9 : 0.5} />
                    <circle cx={c.letterStart.x} cy={c.letterStart.y} r={9} fill="var(--cds-layer-01)" stroke={color} strokeWidth={1.2} />
                    <text x={c.letterStart.x} y={c.letterStart.y + 3.2} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={color} fontWeight="700">{c.letterStart.text}</text>
                    <circle cx={c.letterEnd.x} cy={c.letterEnd.y} r={9} fill="var(--cds-layer-01)" stroke={color} strokeWidth={1.2} />
                    <text x={c.letterEnd.x} y={c.letterEnd.y + 3.2} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={color} fontWeight="700">{c.letterEnd.text}</text>
                  </g>
                );
              })}
            </svg>

            {/* البطاقات */}
            {model.tables.map(table => {
              const box = boxes.get(table.id);
              if (!box) return null;
              const isHovered = hovered === table.id;
              const primaryKey = table.columns.filter(c => c.isPrimaryKey);
              const fkSet = fkColumnsByTable.get(table.id) ?? new Set<string>();
              return (
                <div
                  key={table.id}
                  onMouseEnter={() => setHovered(table.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ left: box.x, top: box.y, width: CARD_W, minHeight: box.h }}
                  className={`absolute bg-[var(--cds-layer-01)] border ${isHovered ? 'border-[var(--cds-interactive-01)] shadow-lg' : 'border-[var(--cds-border-subtle)]'}`}
                  dir="ltr"
                >
                  {/* رأس الجدول */}
                  <div className="px-2 flex items-center gap-1.5 bg-[var(--cds-interactive-01)]/90 text-white" style={{ height: HEADER_H }}>
                    <Link2 className="w-3 h-3 opacity-80 shrink-0" />
                    <span className="text-[11px] font-bold font-mono truncate">{table.name || table.id}</span>
                    <span className="ms-auto text-[9px] font-mono opacity-90">{table.columns.length}</span>
                  </div>
                  {/* الأعمدة */}
                  <div className="py-1.5 px-1.5">
                    {table.columns.map(col => {
                      const isFk = fkSet.has(col.name.toLowerCase());
                      return (
                        <div key={col.name} className="flex items-center gap-1.5 px-1" style={{ height: ROW_H }}>
                          {col.isPrimaryKey ? (
                            <KeyRound className="w-2.5 h-2.5 text-[#f1c21b] shrink-0" />
                          ) : isFk ? (
                            <Link2 className="w-2.5 h-2.5 text-[var(--cds-interactive-01)] shrink-0" />
                          ) : (
                            <span className="w-2.5 h-2.5 shrink-0" />
                          )}
                          <span className="text-[10px] font-mono text-[var(--cds-text-01)] truncate">{col.name}</span>
                          <span className="ms-auto text-[9px] font-mono text-[var(--cds-text-03)] shrink-0">{col.type || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* مفتاح الرموز */}
      <div className="px-3 py-2 border-t border-[var(--cds-border-subtle)] flex flex-wrap items-center gap-3 text-[10px] font-mono text-[var(--cds-text-03)]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] inline-block" style={{ background: CARD_COLOR_1N }} />1–N {isAr ? 'واحد إلى متعدد' : 'one-to-many'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] inline-block" style={{ background: CARD_COLOR_NM }} />M–N {isAr ? 'متعدد إلى متعدد (جدول ربط' : 'many-to-many (junction'}{isAr ? ' يُبنى عند توليد SQL)' : ' table built on SQL generation)'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] inline-block" style={{ background: CARD_COLOR_11 }} />1–1 {isAr ? 'واحد إلى واحد' : 'one-to-one'}</span>
        <span className="flex items-center gap-1.5"><KeyRound className="w-3 h-3 text-[#f1c21b]" />{isAr ? 'مفتاح أساسي' : 'primary key'}</span>
        <span className="flex items-center gap-1.5"><Link2 className="w-3 h-3 text-[var(--cds-interactive-01)]" />{isAr ? 'مفتاح أجنبي' : 'foreign key'}</span>
        <span className="ms-auto">{isAr ? 'مرّر فوق جدولاً لإبراز علاقاته' : 'Hover a table to highlight its relations'}</span>
      </div>
    </div>
  );
};
