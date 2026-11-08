/**
 * draw.io Exporter — كتابة نموذج ER المحرَّر يدوياً كملف .drawio قابل للفتح في draw.io
 * ---------------------------------------------------------------------------------
 * المكمل العكسي للمستورد (drawioImporter): مصمّم السكيمّا يعدّل الجداول/الأعمدة/
 * القيود/العلاقات، ثم يُصدَّر النموذج محدّثاً بنمط ER الرسمي نفسه
 * (shape=table + shape=tableRow + حواف entityRelationEdgeStyle بأسهم ERone/ERmany)
 * بحيث تعيد parseDrawioFile قراءة الملف الناتج بنفس المحتوى (round-trip).
 *
 * القيود تُكتب علاماتٍ نصية داخل تسمية الصف — لغة يستوعبها المستورد كما يكتبها
 * البشر في draw.io:  #pk · #unique · nn · #fk · check(<expr>) · default <value>
 */

import type { ErModel, ErTable, ErRelationship, ErCardinality } from './drawioImporter';

/** تهريب نص لسمة XML في draw.io (& < > " ') */
function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** إذا احتوت قيمة DEFAULT على مسافات ولم تُقتبَس أصلًا ضمّها بين علامتي تنصيص كي يلتقطها المستورد */
function defaultToken(value: string): string {
  const v = String(value ?? '').trim();
  if (!v) return v;
  if (/^["'`]/.test(v) || !/\s/.test(v)) return v;
  return `"${v}"`;
}

/** تسمية عمود بصياغة المستورد (name : TYPE + علامات القيود) */
function columnLabel(col: ErTable['columns'][number]): string {
  const typePart = col.type ? `${col.name} : ${col.type}` : col.name;
  const markers: string[] = [];
  if (col.isPrimaryKey) markers.push('#pk');
  if (col.isUnique) markers.push('#unique');
  if (!col.isNullable && !col.isPrimaryKey) markers.push('nn');
  if (col.isForeignKey) markers.push('#fk');
  if (col.check) markers.push(`check(${col.check})`);
  if (col.defaultValue) markers.push(`default ${defaultToken(col.defaultValue)}`);
  return markers.length > 0 ? `${typePart} ${markers.join(' ')}` : typePart;
}

/** أسهم الحواف حسب نوع العلاقة (قراءة المستورد العكسية مطابقة تماماً) */
function edgeArrows(cardinality: ErCardinality): string {
  switch (cardinality) {
    case '1-1': return 'startArrow=ERone;endArrow=ERone;';
    case 'N-1': return 'startArrow=ERmany;endArrow=ERone;';
    case 'N-M': return 'startArrow=ERmany;endArrow=ERmany;';
    case '1-N':
    default: return 'startArrow=ERone;endArrow=ERmany;';
  }
}

/** شبكة إماكين: توزيع الجداول في صفوف من 3 أعمدة بمسافات ثابتة */
function tableGeometry(index: number): { x: number; y: number; w: number } {
  const COL_W = 260;
  const COLS_PER_ROW = 3;
  const ROW_H = 380;
  return {
    x: 40 + (index % COLS_PER_ROW) * COL_W,
    y: 40 + Math.floor(index / COLS_PER_ROW) * ROW_H,
    w: 220,
  };
}

/** صفحة draw.io واحدة (diagram) تحتوي جداول وعلاقات هذها الصفحة */
function diagramXml(tables: ErTable[], relationships: ErRelationship[]): string {
  const cells: string[] = [];

  tables.forEach((table, i) => {
    const geom = tableGeometry(i);
    const height = 30 + table.columns.length * 24;
    cells.push(
      `        <mxCell id="${escapeXml(table.id)}" value="${escapeXml(table.name)}" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">\n` +
        `          <mxGeometry x="${geom.x}" y="${geom.y}" width="${geom.w}" height="${height}" as="geometry" />\n` +
        `        </mxCell>`
    );
    table.columns.forEach((col, i) => {
      const style = `shape=tableRow;horizontal=0;startSize=0;${col.isPrimaryKey ? 'fontStyle=1;' : ''}`;
      cells.push(
        `        <mxCell id="${escapeXml(table.id)}-r${i}" value="${escapeXml(columnLabel(col))}" style="${style}" vertex="1" parent="${escapeXml(table.id)}">\n` +
          `          <mxGeometry as="geometry" />\n` +
          `        </mxCell>`
      );
    });
  });

  // الحواف: تُربط بخلايا الصفوف (مستوى العمود) عندما نعرف العمودين وإلا برأس الجدول.
  // N-1 (مقلوبة يدوياً) تُكتب معكوسة المصدر/الهدف كعلامة 1-N قياسية — كي تعيد
  // draw.io ومنه parseDrawioFile قراءتها بمعنى العلاقة نفسها (الأب ↔ الابن كما كانا).
  relationships.forEach((rel, i) => {
    // العلاقة المقلوبة N-1 تُعرض معكوسة: الأب يصبح المصدر والابن الهدف
    const parent = rel.cardinality === 'N-1' ? rel.targetTable : rel.sourceTable;
    const child = rel.cardinality === 'N-1' ? rel.sourceTable : rel.targetTable;
    const parentCol = rel.cardinality === 'N-1' ? rel.targetColumn : rel.sourceColumn;
    const childCol = rel.cardinality === 'N-1' ? rel.sourceColumn : rel.targetColumn;
    const parentTable = tables.find(t => t.id === parent);
    const childTable = tables.find(t => t.id === child);
    const pIdx = parentCol && parentTable ? parentTable.columns.findIndex(c => c.name.toLowerCase() === parentCol!.toLowerCase()) : -1;
    const cIdx = childCol && childTable ? childTable.columns.findIndex(c => c.name.toLowerCase() === childCol!.toLowerCase()) : -1;
    const source = pIdx >= 0 ? `${parent}-r${pIdx}` : parent;
    const target = cIdx >= 0 ? `${child}-r${cIdx}` : child;
    const arrows = edgeArrows(rel.cardinality === 'N-1' ? '1-N' : rel.cardinality);
    cells.push(
      `        <mxCell id="sd-e${i}" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;${arrows}" edge="1" parent="1" source="${escapeXml(source)}" target="${escapeXml(target)}">\n` +
        `          <mxGeometry relative="1" as="geometry" />\n` +
        `        </mxCell>`
    );
  });

  return (
    `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1100" pageHeight="${Math.max(850, 40 + Math.ceil(Math.max(1, tables.length) / 3) * 380)}" math="0" shadow="0">\n` +
    `      <root>\n` +
    `        <mxCell id="0" />\n` +
    `        <mxCell id="1" parent="0" />\n` +
    cells.join('\n') +
    `\n      </root>\n` +
    `    </mxGraphModel>`
  );
}

/**
 * يصدّر نموذج ErModel محدَّثاً (بعد أي تحرير يدوي) إلى XML مخطط draw.io:
 *  • نموذج لصفحة واحدة → diagram واحد «Edited Schema»
 *  • نموذج متعدد الصفحات → diagram لكل صفحة يحوي جداول/علاقاتها فقط
 * المخرج ملف "Uncompressed XML" قابل للفتح في draw.io مباشرة، ويُعاد قراءة
 * عبر parseDrawioFile دون فقد (جداول/أعمدة/أنواع/PK/UQ/NN/CHECK/DEFAULT/علاقات).
 */
export function exportDrawioXml(model: ErModel): string {
  const pageCount = Math.max(1, model.diagramNames.length);
  const shows = (pages: number[] | undefined, page: number): boolean =>
    pages === undefined || pages.length === 0 || pages.includes(page);

  const diagrams: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const tables = model.tables.filter(t => shows(t.pages, p));
    if (tables.length === 0) continue;
    const tableIds = new Set(tables.map(t => t.id));
    const rels = model.relationships.filter(
      r => tableIds.has(r.sourceTable) && tableIds.has(r.targetTable) && shows(r.pages, p)
    );
    const nm = model.diagramNames[p] || (pageCount === 1 ? 'Edited Schema' : `Page ${p + 1}`);
    diagrams.push(
      `  <diagram id="sd-page-${p}" name="${escapeXml(nm)}">\n${diagramXml(tables, rels)}\n  </diagram>`
    );
  }
  if (diagrams.length === 0) {
    // نموذج فارغ فعلياً — صفحة واحدة بلا جداول (مخرج رسمي حتى لا يفشل فتح الملف في draw.io)
    diagrams.push(
      `  <diagram id="sd-empty" name="Edited Schema">\n${diagramXml([], [])}\n  </diagram>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mxfile host="app.diagrams.net" agent="freebuff-schema-designer-export">\n` +
    diagrams.join('\n') +
    `\n</mxfile>\n`
  );
}
