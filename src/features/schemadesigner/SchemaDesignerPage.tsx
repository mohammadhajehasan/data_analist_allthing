import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Shapes,
  UploadCloud,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Database,
  Table as TableIcon,
  ArrowRight,
  Sparkles,
  FileCode,
  KeyRound,
  Link2,
  Info,
  Wand2,
  ArrowLeftRight,
  X,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  parseDrawioFile,
  extractDrawioXmlFromPng,
  extractDrawioXmlFromSvg,
  ErModel,
  ErTable,
  ErColumn,
  ErCardinality,
  ErRelationship,
} from '../../utils/drawioImporter';
import { inferColumnConstraints } from '../../utils/constraintInference';
import { generateDdl, DEFAULT_DDL_OPTIONS, DdlResult, SqlDialect } from '../../utils/ddlGenerator';
import { ErdPreview } from './ErdPreview';

/** مخطط تجريبي ثالث بنمط UML العمودي — مستطيلات بسيطة، تسطير HTML للمفتاح الأساسي، وأعلام (fk) وسط التسمية */
const EXAMPLE_UML_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-11-02T00:00:00.000Z" agent="example-uml">
  <diagram id="library-uml" name="Library UML">
    <mxGraphModel dx="1100" dy="800" grid="1" gridSize="10" page="1" pageWidth="900" pageHeight="700" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="students" value="students" style="rounded=0;whiteSpace=wrap;html=1;fontStyle=1;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="60" y="60" width="200" height="140" as="geometry" />
        </mxCell>
        <mxCell id="st0" value="&lt;u&gt;id&lt;/u&gt; : INT" style="text;html=1;align=left;" vertex="1" parent="students">
          <mxGeometry y="30" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="st1" value="full_name : VARCHAR(120)" style="text;html=1;align=left;" vertex="1" parent="students">
          <mxGeometry y="63" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="st2" value="email : VARCHAR(255)" style="text;html=1;align=left;" vertex="1" parent="students">
          <mxGeometry y="96" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="books" value="books" style="rounded=0;whiteSpace=wrap;html=1;fontStyle=1;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="320" y="60" width="200" height="140" as="geometry" />
        </mxCell>
        <mxCell id="bk0" value="&lt;u&gt;id&lt;/u&gt; : INT" style="text;html=1;align=left;" vertex="1" parent="books">
          <mxGeometry y="30" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="bk1" value="title : VARCHAR(200)" style="text;html=1;align=left;" vertex="1" parent="books">
          <mxGeometry y="63" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="bk2" value="isbn : CHAR(13)" style="text;html=1;align=left;" vertex="1" parent="books">
          <mxGeometry y="96" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="loans" value="loans" style="rounded=0;whiteSpace=wrap;html=1;fontStyle=1;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="190" y="290" width="200" height="140" as="geometry" />
        </mxCell>
        <mxCell id="ln0" value="&lt;u&gt;id&lt;/u&gt; : INT" style="text;html=1;align=left;" vertex="1" parent="loans">
          <mxGeometry y="30" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="ln1" value="student_id : INT (fk)" style="text;html=1;align=left;" vertex="1" parent="loans">
          <mxGeometry y="63" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="ln2" value="book_id : INT (fk)" style="text;html=1;align=left;" vertex="1" parent="loans">
          <mxGeometry y="96" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="ln3" value="loaned_at : DATE" style="text;html=1;align=left;" vertex="1" parent="loans">
          <mxGeometry y="129" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="e1" value="" style="endArrow=ERmany;startArrow=ERone;html=1;" edge="1" parent="1" source="students" target="loans">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e2" value="" style="endArrow=ERmany;startArrow=ERone;html=1;" edge="1" parent="1" source="books" target="loans">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const DIALECTS: { id: SqlDialect; label: string; labelAr: string }[] = [
  { id: 'mysql', label: 'MySQL', labelAr: 'MySQL' },
  { id: 'postgres', label: 'PostgreSQL', labelAr: 'PostgreSQL' },
  { id: 'sqlite', label: 'SQLite', labelAr: 'SQLite' },
  { id: 'sqlserver', label: 'SQL Server', labelAr: 'SQL Server' },
  { id: 'oracle', label: 'Oracle', labelAr: 'Oracle' },
];

const RELATION_CARDINALITY_CHOICES: { value: ErCardinality; short: string; label: { en: string; ar: string } }[] = [
  { value: '1-1', short: '1:1', label: { en: 'One-to-One', ar: 'واحد إلى واحد' } },
  { value: '1-N', short: '1:N', label: { en: 'One-to-Many', ar: 'واحد إلى متعدد' } },
  { value: 'N-1', short: 'N:1', label: { en: 'Many-to-One', ar: 'متعدد إلى واحد' } },
  { value: 'N-M', short: 'N:M', label: { en: 'Many-to-Many', ar: 'متعدد إلى متعدد' } },
];

const CARDINALITY_LABEL: Record<ErCardinality, { en: string; ar: string }> = {
  '1-1': { en: 'One-to-One', ar: 'واحد إلى واحد' },
  '1-N': { en: 'One-to-Many', ar: 'واحد إلى متعدد' },
  'N-1': { en: 'Many-to-One', ar: 'متعدد إلى واحد' },
  'N-M': { en: 'Many-to-Many', ar: 'متعدد إلى متعدد' },
};

/** تنظيف معرّف مُدخل يدويًا: فراغات → شرطات سفلية، وإزالة شيفرات HTML/علامات */
const sanitizeName = (raw: string): string =>
  raw
    .replace(/<[^>]*>/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[;,()"'`]/g, '') || '';

/* ------------------------------------------------------------------ */
/* محرّر اسم مضمّن — نص يتحوّل حقل إدخال بالنقر مع حفظ بالنقر خارجًا/Enter */
/* ------------------------------------------------------------------ */

interface InlineNameEditorProps {
  value: string;
  isAr: boolean;
  title?: string;
  inputClassName?: string;
  onCommit: (next: string) => void;
  rerenderKeySuffix?: string;
}

/** اسم قابل للتحرير بالنقر: يعرض قيمة، وبنقرة تتحول لحقل إدخال يُحفظ بblur أو Enter ويُلغى بEscape */
const InlineNameEditor: React.FC<InlineNameEditorProps> = ({ value, isAr, title, inputClassName, onCommit }) => {
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]);

  return editing ? (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next && next !== value) onCommit(next);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); }
      }}
      spellCheck={false}
      dir="ltr"
      className={`px-1 py-0 text-[10px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] focus:outline-none min-w-0 ${inputClassName ?? ''}`}
    />
  ) : (
    <button
      type="button"
      title={title ?? (isAr ? 'انقر للتعديل' : 'Click to edit')}
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-0.5 text-[var(--cds-text-01)] font-bold font-mono truncate min-w-0 hover:text-[var(--cds-interactive-01)] transition-colors"
    >
      <span className="truncate">{value}</span>
      <Pencil className="w-2.5 h-2.5 text-[var(--cds-text-03)] shrink-0" />
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* شريحة تحكّم علاقة واحدة — نوع قابل للتبديل + عكس اتجاه + حذف           */
/* ------------------------------------------------------------------ */

interface RelationControlRowProps {
  relation: ErRelationship;
  isAr: boolean;
  onPatch: (relId: string, patch: Partial<ErRelationship>) => void;
  onReverse: (relId: string) => void;
  onRemove: (relId: string) => void;
}

/** صفّ تحكّم علاقة واحدة: نوع 1:1 / 1:N / N:1 / N:M + عكس الاتجاه + حذف */
const RelationControlRow: React.FC<RelationControlRowProps> = ({ relation, isAr, onPatch, onReverse, onRemove }) => (
  <div className="flex flex-wrap items-center gap-1">
    {RELATION_CARDINALITY_CHOICES.map(choice => {
      const active = relation.cardinality === choice.value;
      return (
        <button
          key={choice.value}
          type="button"
          title={choice.label[isAr ? 'ar' : 'en']}
          onClick={() => onPatch(relation.id, { cardinality: choice.value })}
          className={`${CHIP_BASE} ${
            active
              ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
              : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
          }`}
        >
          {choice.short}
        </button>
      );
    })}
    <button
      type="button"
      title={isAr ? 'عكس اتجاه العلاقة' : 'Reverse direction'}
      onClick={() => onReverse(relation.id)}
      className="p-0.5 text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] hover:border-[var(--cds-interactive-01)] hover:text-[var(--cds-interactive-01)] transition-colors shrink-0"
    >
      <ArrowLeftRight className="w-3 h-3" />
    </button>
    <button
      type="button"
      title={isAr ? 'حذف العلاقة' : 'Delete relation'}
      onClick={() => onRemove(relation.id)}
      className="p-0.5 text-[#da1e28] border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] hover:border-[#da1e28] transition-colors shrink-0"
    >
      <X className="w-3 h-3" />
    </button>
  </div>
);

/* ------------------------------------------------------------------ */
/* محرّر قيود العمود — شرائح قابلة للتبديل + مدخلات قيمة                 */
/* ------------------------------------------------------------------ */

const CHIP_BASE = 'px-1 py-0.5 text-[8px] font-mono uppercase tracking-wide border leading-none transition-colors shrink-0';

interface ColumnConstraintRowProps {
  tableId: string;
  col: ErColumn;
  isAr: boolean;
  onPatch: (tableId: string, colName: string, patch: Partial<ErColumn>) => void;
}

/** صفّ شرائح تحكّم في قيود عمود واحد: PK / FK / NORMAL / NOT NULL / UNIQUE / CHECK / DEFAULT */
const ColumnConstraintRow: React.FC<ColumnConstraintRowProps> = ({ tableId, col, isAr, onPatch }) => {
  const patch = (p: Partial<ErColumn>): void => onPatch(tableId, col.name, p);
  const suggestion = inferColumnConstraints(col);

  interface ChipDef { label: string; active: boolean; suggested?: boolean; title: string; onClick: () => void; }
  const chips: ChipDef[] = [
    {
      label: 'PK',
      active: col.isPrimaryKey,
      title: isAr ? 'مفتاح أساسي' : 'primary key',
      onClick: () => patch({ isPrimaryKey: !col.isPrimaryKey }),
    },
    {
      label: 'FK',
      active: col.isForeignKey === true,
      title: isAr ? 'مفتاح أجنبي' : 'foreign key',
      onClick: () => patch({ isForeignKey: !col.isForeignKey }),
    },
    {
      label: isAr ? 'NOT NULL' : 'NN',
      active: col.isNullable === false,
      suggested: col.isNullable !== false && suggestion.notNull === true,
      title: isAr ? 'إلزام قيمة (نفي NULL)' : 'required value (deny NULL)',
      onClick: () => patch({ isNullable: col.isNullable === false }), // تفدي: NN ⇄ NULL
    },
    {
      label: 'UQ',
      active: col.isUnique === true,
      suggested: col.isUnique !== true && suggestion.unique === true,
      title: isAr ? 'قيمة فريدة' : 'unique value',
      onClick: () => patch({ isUnique: !col.isUnique }),
    },
    {
      label: 'CHECK',
      active: col.check !== undefined,
      suggested: col.check === undefined && suggestion.check !== undefined,
      title: isAr ? 'تحقق شرطي' : 'check constraint',
      onClick: () => patch({ check: col.check !== undefined ? undefined : suggestion.check ?? '' }),
    },
    {
      label: 'DEF',
      active: col.defaultValue !== undefined,
      title: isAr ? 'قيمة افتراضية' : 'default value',
      onClick: () => patch({ defaultValue: col.defaultValue !== undefined ? undefined : '' }),
    },
  ];

  const inputCls =
    'text-[9px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none rounded-none py-0.5 min-w-0';

  return (
    <div className="flex flex-wrap items-center gap-1 py-0.5">
      {chips.map(ch => (
        <button
          key={ch.label}
          type="button"
          title={ch.title}
          onClick={ch.onClick}
          className={`${CHIP_BASE} ${
            ch.active
              ? 'bg-[var(--cds-interactive-01)] border-transparent text-white'
              : ch.suggested
                ? 'border-dashed border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/10'
                : 'border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-02)]'
          }`}
        >
          {ch.label}
        </button>
      ))}
      {col.check !== undefined && (
        <input
          value={col.check}
          onChange={e => patch({ check: e.target.value })}
          placeholder={isAr ? 'مثال: > 0' : 'e.g. > 0'}
          aria-label={isAr ? 'تعبير CHECK للعمود' : 'CHECK expression'}
          className={`${inputCls} w-24 flex-1`}
        />
      )}
      {col.defaultValue !== undefined && (
        <input
          value={col.defaultValue}
          onChange={e => patch({ defaultValue: e.target.value })}
          placeholder={isAr ? "مثال: 0 أو 'none'" : "e.g. 0 or 'none'"}
          aria-label={isAr ? 'القيمة الافتراضية للعمود' : 'DEFAULT value'}
          className={`${inputCls} w-24 flex-1`}
        />
      )}
    </div>
  );
};

/** مخطط تجريبي بنمط ER الرسمي من draw.io — أربع مخزنات مبيعات */
const EXAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-10-31T00:00:00.000Z" agent="example">
  <diagram id="shop-erd" name="Shop ERD">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="users" value="users" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="220" height="180" as="geometry" />
        </mxCell>
        <mxCell id="u0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;fontStyle=1;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u1" value="full_name : VARCHAR(120)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u2" value="email : VARCHAR(255)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u3" value="created_at : TIMESTAMP" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="products" value="products" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="320" y="40" width="220" height="160" as="geometry" />
        </mxCell>
        <mxCell id="p0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="products">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="p1" value="title : VARCHAR(200)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="products">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="p2" value="price : DECIMAL(10,2)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="products">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="p3" value="in_stock : BOOLEAN" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="products">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="orders" value="orders" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="600" y="40" width="220" height="140" as="geometry" />
        </mxCell>
        <mxCell id="o0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o1" value="total_amount : DECIMAL(10,2)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o2" value="status : VARCHAR(32)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="order_items" value="order_items" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="360" y="300" width="220" height="140" as="geometry" />
        </mxCell>
        <mxCell id="oi0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="order_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="oi1" value="order_id : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="order_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="oi2" value="product_id : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="order_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="oi3" value="quantity : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="order_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="e1" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="users" target="orders">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e2" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="orders" target="order_items">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e3" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="products" target="order_items">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="billing-erd" name="Billing ERD">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="invoices" value="invoices" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="220" height="160" as="geometry" />
        </mxCell>
        <mxCell id="iv0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="invoices">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="iv1" value="order_id : INT #fk" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoices">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="iv2" value="amount : DECIMAL(10,2)" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoices">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="iv3" value="paid : BOOLEAN" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoices">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="invoice_items" value="invoice_items" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="320" y="40" width="220" height="160" as="geometry" />
        </mxCell>
        <mxCell id="ii0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="invoice_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="ii1" value="invoice_id : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoice_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="ii2" value="product_id : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoice_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="ii3" value="quantity : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="invoice_items">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="be1" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="invoices" target="invoice_items">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const NO_EMBEDDED_DIAGRAM_AR = 'لا يوجد مخطط مضمّن في الملف';
const NO_EMBEDDED_DIAGRAM_EN = 'No diagram embedded in the file';
const NO_EMBEDDED_HINT_AR =
  'أعد التصدير من draw.io مع تفعيل خيار «تضمين نسخة من المخطط» (Include a copy of my diagram)، أو ارفع ملف .drawio / .xml.';
const NO_EMBEDDED_HINT_EN =
  'Re-export from draw.io with "Include a copy of my diagram" checked, or upload the .drawio / .xml file directly.';

export const SchemaDesignerPage: React.FC = () => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsedModel, setParsedModel] = useState<ErModel | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(-1); // -1 = كل الصفحات
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [dialect, setDialect] = useState<SqlDialect>('mysql');
  const [dropIfExists, setDropIfExists] = useState<boolean>(DEFAULT_DDL_OPTIONS.dropIfExists);
  const [createJunctionTables, setCreateJunctionTables] = useState<boolean>(DEFAULT_DDL_OPTIONS.createJunctionTables);  const [generated, setGenerated] = useState<DdlResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  // نموذج إضافة علاقة يدوية — يُفتح من زر «إضافة علاقة» في قسم العلاقات
  const [isAddingRelation, setIsAddingRelation] = useState<boolean>(false);
  const [newRelSource, setNewRelSource] = useState<string>('');
  const [newRelTarget, setNewRelTarget] = useState<string>('');
  const [newRelFkColumn, setNewRelFkColumn] = useState<string>('');
  const [newRelCardinality, setNewRelCardinality] = useState<ErCardinality>('1-N');
  const nextRelationSeq = useRef<number>(1000);
  /** إعادة تسمية جدول — المعرّفات الأصلية ثابتة فلا تتأثر العلاقات */
  const tableById = useMemo(() => {
    const map = new Map<string, ErTable>();
    for (const t of parsedModel?.tables ?? []) map.set(t.id, t);
    return map;
  }, [parsedModel]);


  const stats = useMemo(() => {
    if (!parsedModel) return null;
    const columnCount = parsedModel.tables.reduce((sum, t) => sum + t.columns.length, 0);
    return { tables: parsedModel.tables.length, columns: columnCount, relations: parsedModel.relationships.length, warnings: parsedModel.warnings.length };
  }, [parsedModel]);

  /** نموذج الصفحة المختارة: -1 = الكل، فهرس يُصفّي الجداول/العلاقات لصفحة واحدة */
  const pageModel = useMemo(() => {
    if (!parsedModel) return null;
    if (selectedPage < 0 || parsedModel.diagramNames.length < 2) return parsedModel;
    const shows = (pages?: number[]): boolean => pages === undefined || pages.length === 0 || pages.includes(selectedPage);
    const tables = parsedModel.tables.filter(t => shows(t.pages));
    const tableIds = new Set(tables.map(t => t.id));
    const relationships = parsedModel.relationships.filter(r => shows(r.pages) && tableIds.has(r.sourceTable) && tableIds.has(r.targetTable));
    return { ...parsedModel, tables, relationships };
  }, [parsedModel, selectedPage]);

  /** أعمدة FK لكل جدول لعرضها على بطاقات الأعمدة: من علاقات 1-N الرسومية أو من علامة FK داخل التسمية */
  const fkByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const table of pageModel?.tables ?? []) {
      const declared = table.columns.filter(c => c.isForeignKey).map(c => c.name.toLowerCase());
      if (declared.length > 0) map.set(table.id, new Set(declared));
    }
    for (const rel of pageModel?.relationships ?? []) {
      // 1-N: FK على الطرف الهدف؛ N-1 (عكسه يدويًا): FK على الطرف المصدر
      if (rel.cardinality === '1-N' && rel.targetColumn) {
        const set = map.get(rel.targetTable) ?? new Set<string>();
        set.add(rel.targetColumn.toLowerCase());
        map.set(rel.targetTable, set);
      } else if (rel.cardinality === 'N-1' && rel.sourceColumn) {
        const set = map.get(rel.sourceTable) ?? new Set<string>();
        set.add(rel.sourceColumn.toLowerCase());
        map.set(rel.sourceTable, set);
      }
    }
    return map;
  }, [pageModel]);

  /** تعديل قيود عمود واحد في النموذج المحلّل — تحديث فوري للبطاقات وإعادة توليد SQL إن كان مولّداً */
  const applyColumnPatch = (tableId: string, colName: string, columnPatch: Partial<ErColumn>): void => {
    if (!parsedModel) return;
    const next: ErModel = {
      ...parsedModel,
      tables: parsedModel.tables.map(t =>
        t.id !== tableId
          ? t
          : {
              ...t,
              columns: t.columns.map(c =>
                c.name.toLowerCase() !== colName.toLowerCase() ? c : { ...c, ...columnPatch }
              ),
            }
      ),
    };
    setParsedModel(next);
    if (generated) setGenerated(generateDdl(next, dialect, { dropIfExists, createJunctionTables }));
  };

  /** تعديل نموذج محلّل كامل: يحدّث البطاقات ويفرض توليد SQL القديم */
  const withParsedModel = (mutate: (m: ErModel) => ErModel): void => {
    if (!parsedModel) return;
    const next = mutate(parsedModel);
    setParsedModel(next);
    if (generated) setGenerated(generateDdl(next, dialect, { dropIfExists, createJunctionTables }));
  };

  /** تعديل علاقة واحدة في النموذج المحلّل — تحديث فوري للبطاقات والمعاينة وإعادة توليد SQL إن كان مولّداً */
  const applyRelationPatch = (relId: string, relPatch: Partial<ErRelationship>): void => {
    withParsedModel(m => ({
      ...m,
      relationships: m.relationships.map(r => (r.id === relId ? { ...r, ...relPatch, id: r.id } : r)),
    }));
  };

  /** حذف علاقة كشفها المحلّل أو أضافها المستخدم */
  const removeRelation = (relId: string): void => {
    withParsedModel(m => ({ ...m, relationships: m.relationships.filter(r => r.id !== relId) }));
  };

  /** عكس اتجاه العلاقة: 1-N ⇄ N-1 تبادلات مفاهيمية، والنوعان البقعر يبقيان كما هما */
  const reverseRelation = (relId: string): void => {
    withParsedModel(m => ({
      ...m,
      relationships: m.relationships.map(r => {
        if (r.id !== relId) return r;
        const next: ErRelationship = {
          ...r,
          sourceTable: r.targetTable,
          targetTable: r.sourceTable,
          sourceColumn: r.targetColumn,
          targetColumn: r.sourceColumn,
          id: r.id,
        };
        if (r.cardinality === '1-N') next.cardinality = 'N-1';
        else if (r.cardinality === 'N-1') next.cardinality = '1-N';
        return next;
      }),
    }));
  };

  const handleAddRelation = (): void => {
    if (!parsedModel || !newRelSource || !newRelTarget || newRelSource === newRelTarget) return;
    const fkName = sanitizeName(newRelFkColumn);
    if ((newRelCardinality === '1-N' || newRelCardinality === 'N-1') && !fkName) return;
    const newRel: ErRelationship = {
      id: `manual-${nextRelationSeq.current++}`,
      sourceTable: newRelSource,
      targetTable: newRelTarget,
      targetColumn: fkName === '' ? undefined : fkName,
      cardinality: newRelCardinality,
      pages: selectedPage >= 0 ? [selectedPage] : undefined,
    };
    withParsedModel(m => ({ ...m, relationships: [...m.relationships, newRel] }));
    toast.success(
      isAr ? 'أُضيفت علاقة' : 'Relation added',
      isAr
        ? `علاقة ${CARDINALITY_LABEL[newRelCardinality][isAr ? 'ar' : 'en']} — راجعها وولّد SQL`
        : `${CARDINALITY_LABEL[newRelCardinality][isAr ? 'ar' : 'en']} relation added — review and generate SQL`
    );
  };

  /** إعادة تسمية جدول — معرّف الجدول يبقى ثابتًا فلا تتأثر العلاقات */
  const renameTable = (tableId: string, newName: string): void => {
    const name = sanitizeName(newName);
    if (!name) return;
    withParsedModel(m => ({ ...m, tables: m.tables.map(t => (t.id === tableId ? { ...t, name } : t)) }));
  };

  /** عدد الاقتراحات الذكية غير المطبَّقة بعد — لعرضها على الزر */
  const suggestionsCount = useMemo(() => {
    if (!pageModel) return 0;
    let count = 0;
    for (const table of pageModel.tables) {
      for (const col of table.columns) {
        const s = inferColumnConstraints(col);
        if (s.unique) count++;
        if (s.notNull) count++;
        if (s.check) count++;
      }
    }
    return count;
  }, [pageModel]);

  /** تطبيق كل الاقتراحات الذكية دفعة واحدة (PK يُستثنى دائماً من UNIQUE/CHECK) */
  const applySmartSuggestions = (): void => {
    if (!parsedModel) return;
    let applied = 0;
    const next: ErModel = {
      ...parsedModel,
      tables: parsedModel.tables.map(t => ({
        ...t,
        columns: t.columns.map(col => {
          const s = inferColumnConstraints(col);
          const columnPatch: Partial<ErColumn> = {};
          if (s.unique) { columnPatch.isUnique = true; applied++; }
          if (s.notNull) { columnPatch.isNullable = false; applied++; }
          if (s.check) { columnPatch.check = s.check; applied++; }
          return Object.keys(columnPatch).length > 0 ? { ...col, ...columnPatch } : col;
        }),
      })),
    };
    setParsedModel(next);
    if (generated) setGenerated(generateDdl(next, dialect, { dropIfExists, createJunctionTables }));
    toast.success(
      isAr ? 'اقتراحات القيود' : 'Constraint suggestions',
      isAr ? `طُبّق ${applied} قيداً ذكياً — راجع الشرائح المفعّلة` : `Applied ${applied} smart constraints — review the activated chips`
    );
  };

  const processTextFile = async (text: string, sourceName: string): Promise<void> => {
    setIsParsing(true);
    try {
      const model = await parseDrawioFile(text);
      setParsedModel(model);
      setSelectedPage(model.diagramNames.length > 1 ? 0 : -1);
      setFileName(sourceName);
      setGenerated(null);
      const pagesHint = model.diagramNames.length > 1 ? (isAr ? ` (${model.diagramNames.length} صفحات)` : ` (${model.diagramNames.length} pages)`) : '';
      toast.success(
        isAr ? 'تم تحليل المخطط بنجاح' : 'Diagram parsed',
        isAr
          ? `اكتُشف ${model.tables.length} جداول و${model.relationships.length} علاقات${pagesHint}. اختر الصنف وولّد الـ SQL.`
          : `${model.tables.length} tables and ${model.relationships.length} relations${pagesHint} recognized. Pick a dialect and generate.`
      );
    } catch (err) {
      setParsedModel(null);
      toast.error(isAr ? 'فشل تحليل المخطط' : 'Parsing failed', (err as Error).message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFiles = async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) return;

    let text: string | null = null;
    try {
      if (/\.png$/i.test(file.name)) {
        text = await extractDrawioXmlFromPng(await file.arrayBuffer());
      } else if (/\.svg$/i.test(file.name)) {
        text = extractDrawioXmlFromSvg(await file.text());
      } else if (/\.(drawio|xml|txt|mxfile)$/i.test(file.name)) {
        text = await file.text();
      } else {
        toast.warning(
          isAr ? 'أنواع مدعومة' : 'Supported files',
          isAr ? 'ارفع ملفاً بصيغة .drawio أو .xml أو .png أو .svg' : 'Upload a .drawio, .xml, .png or .svg diagram file.'
        );
        return;
      }
      if (text === null) {
        toast.error(
          isAr ? NO_EMBEDDED_DIAGRAM_AR : NO_EMBEDDED_DIAGRAM_EN,
          isAr ? NO_EMBEDDED_HINT_AR : NO_EMBEDDED_HINT_EN
        );
        return;
      }
    } catch (err) {
      toast.error(isAr ? 'تعذّرت قراءة الملف' : 'Could not read file', (err as Error).message);
      return;
    }
    await processTextFile(text, file.name);
  };

  const handleGenerate = (): void => {
    if (!parsedModel) return;
    const result = generateDdl(parsedModel, dialect, { dropIfExists, createJunctionTables });
    setGenerated(result);
  };

  const handleCopy = async (): Promise<void> => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(isAr ? 'تعذر النسخ' : 'Copy failed', isAr ? 'انسخ الكود يدوياً من النافذة.' : 'Select and copy manually.');
    }
  };

  const handleDownload = (): void => {
    if (!generated) return;
    const blob = new Blob([generated.code], { type: 'application/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_${dialect}_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ============== Header ============== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shapes className="w-4 h-4 text-[var(--cds-interactive-01)]" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-interactive-01)]">
              DRAW.IO · ERD → SQL SCHEMA STUDIO
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--cds-text-01)] tracking-tight mt-1">
            {isAr ? 'مصمّم السكيمّا من draw.io' : 'Schema Designer from draw.io'}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--cds-text-02)] mt-0.5">
            {isAr
              ? 'ارفع مخطط ER المُصدَّر من draw.io وحوّله إلى كود CREATE TABLE كامل مع العلاقات والمفاتيح — MySQL، PostgreSQL، SQLite، SQL Server، Oracle.'
              : 'Upload a draw.io ER diagram export and turn it into full CREATE TABLE code with keys and relations — MySQL, PostgreSQL, SQLite, SQL Server, Oracle.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { void processTextFile(EXAMPLE_XML, 'example-shop-erd.drawio'); }}
            className="carbon-btn-secondary text-xs font-mono font-bold uppercase tracking-wider gap-2 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
            <span>{isAr ? 'مخطط تجريبي ER' : 'ER example'}</span>
          </button>
          <button
            type="button"
            onClick={() => { void processTextFile(EXAMPLE_UML_XML, 'example-library-uml.drawio'); }}
            className="carbon-btn-secondary text-xs font-mono font-bold uppercase tracking-wider gap-2 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
            <span>{isAr ? 'مخطط تجريبي UML عمودي' : 'Vertical UML example'}</span>
          </button>
        </div>
      </div>

      {/* ============== Dropzone ============== */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); void handleFiles(e.dataTransfer.files); }}
        className={`p-8 text-center border-2 border-dashed transition-colors ${
          isDragging
            ? 'border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/5'
            : 'border-[var(--cds-border-strong)] hover:border-[var(--cds-interactive-01)] bg-[var(--cds-layer-02)]'
        }`}
      >
        <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-[var(--cds-interactive-01)]' : 'text-[var(--cds-text-03)]'}`} />
        <p className="text-sm text-[var(--cds-text-01)] font-bold">
          {isAr ? 'اسحب ملف .drawio أو .xml أو .png أو .svg هنا' : 'Drop a .drawio, .xml, .png or .svg diagram here'}
        </p>
        <p className="text-[11px] text-[var(--cds-text-03)] mt-1 font-mono">
          {isAr
            ? 'صور PNG/SVG تتطلب تصديراً من draw.io مع تفعيل «Include a copy of my diagram» ليتضمّن الملف XML المخطط.'
            : 'PNG/SVG exports require embedding enabled in draw.io ("Include a copy of my diagram") to carry the diagram XML.'}
        </p>
        <p className="text-xs text-[var(--cds-text-03)] mt-1">
          {isAr ? 'أو' : 'or'}
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-[var(--cds-interactive-01)] text-white hover:opacity-90 disabled:opacity-50"
        >
          <FileCode className="w-3.5 h-3.5" />
          {isParsing ? (isAr ? 'جاري التحليل...' : 'Parsing...') : isAr ? 'اختر ملفاً' : 'Browse files'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".drawio,.xml,.txt,.mxfile,.png,.svg"
          className="hidden"
          onChange={e => { void handleFiles(e.target.files); }}
        />
        {fileName && (
          <p className="mt-3 text-[11px] font-mono text-[var(--cds-text-03)]">
            {isAr ? 'آخر ملف:' : 'Last file:'} <span className="text-[var(--cds-text-01)]">{fileName}</span>
          </p>
        )}
      </div>

      {/* ============== Parsed model review ============== */}
      {parsedModel && stats && (
        <div className="space-y-4">
          {/* وقائع عامة */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: TableIcon, label: isAr ? 'جداول' : 'Tables', value: stats.tables },
              { icon: Database, label: isAr ? 'أعمدة' : 'Columns', value: stats.columns },
              { icon: Link2, label: isAr ? 'علاقات' : 'Relations', value: stats.relations },
              { icon: AlertTriangle, label: isAr ? 'تحذيرات' : 'Warnings', value: stats.warnings },
            ].map((c) => (
              <div key={c.label} className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-3 flex items-center gap-3">
                <c.icon className="w-4 h-4 text-[var(--cds-interactive-01)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xl font-bold text-[var(--cds-text-01)] font-mono leading-none">{c.value}</div>
                  <div className="text-[10px] font-mono uppercase text-[var(--cds-text-03)] mt-1">{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* منتقي الصفحات للملفات متعددة الصفحات */}
          {parsedModel.diagramNames.length > 1 && (
            <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
                {isAr ? 'صفحات الملف' : 'Document pages'}
              </span>
              <select
                value={selectedPage}
                onChange={e => setSelectedPage(Number(e.target.value))}
                className="px-2 py-1 text-xs font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none max-w-full"
                aria-label={isAr ? 'اختر الصفحة' : 'Select page'}
              >
                <option value={-1}>{isAr ? 'كل الصفحات' : 'All pages'}</option>
                {parsedModel.diagramNames.map((n, i) => (
                  <option key={`${i}-${n}`} value={i}>{`${i + 1}. ${n}`}</option>
                ))}
              </select>
              {pageModel && (
                <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
                  {isAr ? 'المعروضة' : 'Shown'}: {pageModel.tables.length} {isAr ? 'جداول' : 'tables'} · {pageModel.relationships.length} {isAr ? 'علاقات' : 'relations'}
                </span>
              )}
            </div>
          )}

          {/* المعاينة المرئية للمخطط — بطاقات + موصّلات */}
          {pageModel && pageModel.tables.length > 0 && <ErdPreview model={pageModel} isAr={isAr} />}

          {/* شريط محرّر القيود */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
              {isAr ? 'محرّر القيود' : 'Constraint editor'}
            </span>
            <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'انقر الشرائح لتبديل حالة الحقل — الشرائح المتقطعة اقتراحات ذكية' : 'Click chips to toggle column state — dashed chips are smart suggestions'}
            </span>
            {suggestionsCount > 0 && (
              <button
                type="button"
                onClick={applySmartSuggestions}
                className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)] hover:text-white transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                {isAr ? `تطبيق الاقتراحات الذكي (${suggestionsCount})` : `Apply smart suggestions (${suggestionsCount})`}
              </button>
            )}
          </div>

          {/* بطاقات الجداول */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pageModel?.tables.map(table => (
              <div key={table.id} className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                <div className="px-3 py-2 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center gap-2">
                  <TableIcon className="w-3.5 h-3.5 text-[var(--cds-interactive-01)] shrink-0" />
                  <InlineNameEditor
                    value={table.name}
                    isAr={isAr}
                    title={isAr ? 'انقر لتعديل اسم الجدول' : 'Click to rename table'}
                    onCommit={next => renameTable(table.id, next)}
                    inputClassName="text-xs font-bold"
                  />
                  <span className="ms-auto text-[10px] font-mono text-[var(--cds-text-03)] shrink-0">{table.columns.length} {isAr ? 'أعمدة' : 'cols'}</span>
                </div>
                <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
                  {table.columns.map(col => {
                    const isFk = col.isForeignKey || fkByTable.get(table.id)?.has(col.name.toLowerCase()) || false;
                    return (
                      <div key={col.name} className="hover:bg-[var(--cds-layer-02)]">
                        <div className="flex items-center gap-2 px-1.5 py-1">
                          {col.isPrimaryKey ? (
                            <span title={isAr ? 'مفتاح أساسي' : 'primary key'} className="shrink-0"><KeyRound className="w-3 h-3 text-[#f1c21b]" /></span>
                          ) : isFk ? (
                            <span title={isAr ? 'مفتاح أجنبي' : 'foreign key'} className="shrink-0"><Link2 className="w-3 h-3 text-[var(--cds-interactive-01)]" /></span>
                          ) : (
                            <span className="w-3 h-3 shrink-0" />
                          )}
                          <span className="text-[11px] font-mono text-[var(--cds-text-01)] truncate">{col.name}</span>
                          <span className="ms-auto text-[10px] font-mono text-[var(--cds-text-03)] truncate">{col.type || (isAr ? 'نوع؟' : 'type?')}</span>
                        </div>
                        <ColumnConstraintRow tableId={table.id} col={col} isAr={isAr} onPatch={applyColumnPatch} />
                      </div>
                    );
                  })}
                  {table.columns.length === 0 && (
                    <p className="text-[10px] text-[var(--cds-text-03)] font-mono px-1.5 py-2">
                      {isAr ? 'لم يُكتشف أعمدة — تحقق من تسميات الخلايا.' : 'No columns discovered.'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* محرّر العلاقات: تعديل النوع/العمود + إضافة يدوية + حذف */}
          {pageModel && (
            <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
                  {isAr ? 'محرّر العلاقات' : 'Relation editor'}
                </div>
                <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
                  {isAr ? 'بدّل نوع العلاقة (1:1 · 1:N · N:1 · N:M) وأعد تسمية الاتصال عند الحاجة' : 'Switch relation type (1:1 · 1:N · N:1 · N:M) and rename the endpoint when needed'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingRelation(isAdding => !isAdding);
                  }}
                  className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)] hover:text-white transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {isAr ? 'إضافة علاقة' : 'Add relation'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {pageModel.relationships.map(rel => {
                  const source = tableById.get(rel.sourceTable)?.name;
                  const target = tableById.get(rel.targetTable)?.name;
                  const sameTable = rel.sourceTable === rel.targetTable;
                  return (
                    <div
                      key={rel.id}
                      className={`text-[11px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-2 py-1.5 space-y-1.5 ${
                        sameTable ? 'border-l-2 border-l-[#f1c21b]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <InlineNameEditor
                          value={source ?? '?'}
                          isAr={isAr}
                          title={isAr ? 'انقر لتعديل اسم الجدول الأصلي' : 'Click to rename source table'}
                          onCommit={next => {
                            const found = pageModel.tables.find(t => t.name === next);
                            if (found) applyRelationPatch(rel.id, { sourceTable: found.id });
                          }}
                          inputClassName="text-[11px] w-24"
                        />
                        <ArrowRight className="w-3 h-3 text-[var(--cds-interactive-01)] shrink-0" />
                        <InlineNameEditor
                          value={target ?? '?'}
                          isAr={isAr}
                          title={isAr ? 'انقر لتعديل اسم الجدول الهدف' : 'Click to rename target table'}
                          onCommit={next => {
                            const found = pageModel.tables.find(t => t.name === next);
                            if (found) applyRelationPatch(rel.id, { targetTable: found.id });
                          }}
                          inputClassName="text-[11px] w-24"
                        />
                        <span className="ms-auto text-[9px] px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] shrink-0">
                          {CARDINALITY_LABEL[rel.cardinality][isAr ? 'ar' : 'en']}
                        </span>
                      </div>
                      <RelationControlRow
                        relation={rel}
                        isAr={isAr}
                        onPatch={applyRelationPatch}
                        onReverse={reverseRelation}
                        onRemove={removeRelation}
                      />
                    </div>
                  );
                })}
                {pageModel.relationships.length === 0 && (
                  <p className="text-[10px] font-mono text-[var(--cds-text-03)]">
                    {isAr ? 'لا علاقات مكتشفة — أضف واحدة يدوياً من الزر أعلاه.' : 'No relations discovered — add one manually above.'}
                  </p>
                )}
              </div>

              {isAddingRelation && pageModel.tables.length >= 1 && (
                <div className="mt-3 pt-3 border-t border-[var(--cds-border-subtle)] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={newRelSource}
                      onChange={e => setNewRelSource(e.target.value)}
                      className="px-2 py-1 text-[10px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none"
                      aria-label={isAr ? 'الجدول الأصلي' : 'Source table'}
                    >
                      <option value="">{isAr ? 'الجدول الأب…' : 'Parent table…'}</option>
                      {pageModel.tables.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <ArrowRight className="w-3 h-3 text-[var(--cds-interactive-01)] shrink-0" />
                    <select
                      value={newRelTarget}
                      onChange={e => setNewRelTarget(e.target.value)}
                      className="px-2 py-1 text-[10px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none"
                      aria-label={isAr ? 'الجدول الهدف' : 'Target table'}
                    >
                      <option value="">{isAr ? 'الجدول الابن…' : 'Child table…'}</option>
                      {pageModel.tables.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <select
                      value={newRelFkColumn}
                      onChange={e => setNewRelFkColumn(e.target.value)}
                      className="px-2 py-1 text-[10px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none"
                      aria-label={isAr ? 'عمود المفتاح الأجنبي' : 'FK column'}
                      disabled={newRelCardinality === 'N-M'}
                    >
                      <option value="">{isAr ? 'عمود FK (اختياري — يُولد)' : 'FK column (optional — generated)'}</option>
                      {(tableById.get(newRelTarget === newRelSource ? newRelSource : newRelTarget)?.columns ?? []).map(c => (
                        <option key={c.name} value={c.name}>{c.name} · {c.type}</option>
                      ))}
                    </select>
                    <select
                      value={newRelCardinality}
                      onChange={e => setNewRelCardinality(e.target.value as ErCardinality)}
                      className="px-2 py-1 text-[10px] font-mono bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:border-[var(--cds-interactive-01)] focus:outline-none"
                      aria-label={isAr ? 'نوع العلاقة' : 'Relation type'}
                    >
                      {RELATION_CARDINALITY_CHOICES.map(ch => (
                        <option key={ch.value} value={ch.value}>
                          {`${ch.short} — ${ch.label[isAr ? 'ar' : 'en']}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddRelation}
                      disabled={!newRelSource || !newRelTarget || newRelSource === newRelTarget || (newRelCardinality !== 'N-M' && !sanitizeName(newRelFkColumn))}
                      className="ms-auto px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--cds-interactive-01)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isAr ? 'أضف' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingRelation(false)}
                      className="px-2 py-1.5 text-[10px] font-mono text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                  {newRelSource === newRelTarget && newRelSource !== '' && (
                    <p className="text-[10px] font-mono text-[#f1c21b]">
                      {isAr ? 'الجدولان متطابقان — اختر جدولاً مختلفاً للعلاقة.' : 'Source and target are the same table — pick a different one.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* تحذيرات التحليل */}
          {parsedModel.warnings.length > 0 && (
            <div className="bg-[#f1c21b]/10 border border-[#f1c21b]/30 p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#f1c21b] shrink-0 mt-0.5" />
              <div className="text-[11px] font-mono text-[var(--cds-text-02)] space-y-1">
                {parsedModel.warnings.slice(0, 6).map((w, i) => <p key={i}>• {w}</p>)}
                {parsedModel.warnings.length > 6 && <p>… +{parsedModel.warnings.length - 6}</p>}
              </div>
            </div>
          )}

          {/* ============== Dialect options + generate ============== */}
          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">
                {isAr ? 'صنف SQL:' : 'SQL dialect:'}
              </span>
              {DIALECTS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDialect(d.id)}
                  className={`px-3 py-1.5 text-xs font-mono font-bold border transition-colors ${
                    dialect === d.id
                      ? 'bg-[var(--cds-interactive-01)] text-white border-transparent'
                      : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]'
                  }`}
                >
                  {isAr ? d.labelAr : d.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-mono text-[var(--cds-text-02)] cursor-pointer">
                <input type="checkbox" checked={dropIfExists} onChange={e => setDropIfExists(e.target.checked)} className="accent-[var(--cds-interactive-01)]" />
                {isAr ? 'أضف DROP TABLE IF EXISTS' : 'Add DROP TABLE IF EXISTS'}
              </label>
              <label className="flex items-center gap-2 text-xs font-mono text-[var(--cds-text-02)] cursor-pointer">
                <input type="checkbox" checked={createJunctionTables} onChange={e => setCreateJunctionTables(e.target.checked)} className="accent-[var(--cds-interactive-01)]" />
                {isAr ? 'أنشئ جداول ربط لعلاقات N-M' : 'Generate junction tables for N-M'}
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="ms-auto inline-flex items-center gap-2 px-5 py-2.5 text-xs font-mono font-bold uppercase tracking-wider bg-[var(--cds-interactive-01)] text-white hover:opacity-90"
              >
                <FileCode className="w-4 h-4" />
                {isAr ? 'ولّد كود SQL' : 'Generate SQL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============== Generated code ============== */}
      {generated && (
        <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-interactive-01)]">
              {generated.dialect.toUpperCase()} · {isAr ? 'جداول' : 'tables'}: {generated.stats.tables} · {isAr ? 'أعمدة' : 'cols'}: {generated.stats.columns} · FK: {generated.stats.fks}
            </span>
            <div className="ms-auto flex items-center gap-2">
              <button type="button" onClick={() => { void handleCopy(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)]">
                {copied ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                {copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}
              </button>
              <button type="button" onClick={handleDownload} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold bg-[var(--cds-interactive-01)] text-white hover:opacity-90">
                <Download className="w-3 h-3" />
                .sql
              </button>
            </div>
          </div>
          <pre className="m-0 p-4 text-[11px] leading-relaxed font-mono text-[var(--cds-text-01)] max-h-[480px] overflow-auto text-left" dir="ltr">
            {generated.code}
          </pre>
        </div>
      )}
    </div>
  );
};
