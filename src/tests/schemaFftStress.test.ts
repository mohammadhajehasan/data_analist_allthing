/**
 * اختبار FFT (إجهاد/تشويه) للسكيمّا — مخطط هائل مُولَّد برمجياً
 * ----------------------------------------------------------------
 * على النقيض من اختبار largeSchemaStress (ملف draw.io ثابت بـ 21 جدولاً)
 * هنا تَوليد مخطط ضخم 30 جدولاً ببرمجة حتمية (seeded PRNG) يضغط المحلل والمولّد على
 * الحالات القاسية: أسماء ركيكة (فراغات/أقواس/رموز/نقط/طول كبير/اسم فارغ)، دمج جداول
 * متكررة عبر 3 صفحات، سلاسل 1-N، مراوح (نفس الأب لعدة أبناء)، 3 علاقات N-M بجدول ربط،
 * حافة مثبّتة على عمود معين، علاقة عبر الصفحات، وحافتان خبيعتان (مصدر مفقود / ذاتية).
 *
 * «لا تشوّه» = على كل الأصناف الخمسة:
 *   • عدّادات إحصاء المطابقة الصارمة (جداول/أعمدة/FKs/junction)
 *   • توازن الأقواس في الكود كله
 *   • منع تكرار CREATE TABLE لنفس الاسم
 *   • كل REFERENCES يشير إلى جدول موجود في الكود نفسه
 *   • لا بقايا وسوم علامات (#pk/«uq») غارقة في الكود
 *   • كود SQLite المولّد يُنفَّذ حرفياً في sql.js بلا أي خطأ
 */
import { describe, it, expect } from 'vitest';
import { parseDrawioFile, type ErModel } from '../utils/drawioImporter';
import { generateDdl, sanitizeIdentifier, type SqlDialect, type DdlResult } from '../utils/ddlGenerator';

/* ------------------------------------------------------------------ */
/* مولّد عشوائي حتمي — نفس البذرة = نفس المخطط دوماً                    */
/* ------------------------------------------------------------------ */
const escAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/* مواصفة المخطط — 30 اسماً (10 بنمط ركيك + 19 عادي + 1 فارغ)           */
/* ------------------------------------------------------------------ */
const TABLE_NAMES: string[] = [
  // T01..T11: أسماء تركيبية صعبة
  'customer profiles',
  'Sales_Orders_2026',
  'POS-terminal.v2 (EU)',
  '1st-layer-cache',
  'audit_log#2',
  'line items (web_v2)',
  'SYNC:STATE-MACHINE',
  'delta shipping lanes',
  'payments legacy (v.3)',
  `huge-name-${'a'.repeat(40)}`,
  'cashflow / q1 close',
  // T12..T22 عادية
  ...Array.from({ length: 11 }, (_, k) => `Table_${k + 12}`),
  // T23..T29 عادية
  'warehouse zones',
  'tags (web)',
  'coupon codes',
  'supplier certs',
  'carrier rates',
  'order notes',
  'notifications',
  // T30: اسم فارغ كلياً (يُستخرج احتياطاً من معرّف الخلية)
  '',
];
const T = (i: number): string => TABLE_NAMES[i - 1];   // اسم الجدول المرقّم 1..30

/** قوالب أعمدة إضافية — تُختار حتمياً بحسب بذرة الجدول */
const extraColTemplates: ((i: number, r: number) => string)[] = [
  (i, r) => `label_${i} : VARCHAR(${30 + Math.floor(r * 60)}) (nn)`,
  (i) => `amount_${i} : DECIMAL(10,2) check(amount_${i} >= 0 AND amount_${i} <= 9999)`,
  (i) => `is_active_${i} : BOOLEAN default 'Y'`,
  (i) => `created_${i} : DATE`,
  (i) => `uid_${i} : UUID (uq)`,
  (i) => `meta_${i} : JSONB`,
  (i) => `payload_${i} : BLOB`,
];

/** أعمدة كل جدول: id pk + عدد من القوالب حتمياً (احتمال 0 كذلك مدعوم) — بلا عشوائية: (i*7 + k*(len+1)) % len يضمن توزيعاً متنوعاً بلا تكرار اسم داخل الجدول */
function columnsForTable(i: number): string[] {
  const extras = i % 4; // 0..3 — حتى جدول بعمود واحد (id فقط) يجب أن يعمل
  const cols = ['id : INT #pk'];
  const len = extraColTemplates.length; // 7
  for (let k = 0; k < extras; k++) {
    const tpl = extraColTemplates[(i * 7 + k * (len + 1)) % len];
    cols.push(tpl(i, 0));
  }
  return cols;
}

/** خلايا جدول واحد (جدول + صفوفه) بنمط draw.io الرسمي */
function tableCellsXml(id: string, name: string, cols: string[]): string {
  const rows = cols
    .map((c, k) => `<mxCell id="${id}_r${k}" value="${escAttr(c)}" style="shape=tableRow;" vertex="1" parent="${id}"><mxGeometry as="geometry" /></mxCell>`)
    .join('');
  return `<mxCell id="${id}" value="${escAttr(name)}" style="shape=table;startSize=30;container=1;childLayout=tableLayout;" vertex="1" parent="1"><mxGeometry as="geometry" /></mxCell>${rows}`;
}
/** حافة ER — بحسب الأسهم ERone/ERmany */
const edgeXml = (id: string, source: string, target: string, cardinality: '1-N' | 'N-M' = '1-N'): string =>
  `<mxCell id="${id}" value="" style="edgeStyle=entityRelationEdgeStyle;${cardinality === 'N-M' ? 'endArrow=ERmany;startArrow=ERmany;' : 'endArrow=ERmany;startArrow=ERone;'}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry" /></mxCell>`;

/** مرآة جدول عبر الصفحات — تسمح بحل العلاقة بالاسم لا بالمعرّف */
const mirrorTableXml = (mirrorId: string, name: string): string => tableCellsXml(mirrorId, name, ['id : INT #pk']);

/* ------------------------------------------------------------------ */
/* تجميع XML من 3 صفحات                                                */
/* ------------------------------------------------------------------ */
const p1Id = (i: number): string => `p1_t${String(i).padStart(2, '0')}`;

const page1Content = TABLE_NAMES.slice(0, 22).map((name, k) => tableCellsXml(p1Id(k + 1), name, columnsForTable(k + 1))).join('')
  // سلسلة 1-N: T01→T02 … T21→T22 (21 حافة)
  + Array.from({ length: 21 }, (_, k) => edgeXml(`p1_chain_${k + 1}`, p1Id(k + 1), p1Id(k + 2))).join('');

// صفحة 2: T23..T30 + مرايا T01..T06 + الحواف (المروحة/المثبّتة/N-M/الذاتية)
const UNNAMED_ID = 'p2_t30_u';
const mirrorIds = ['m_t01', 'm_t02', 'm_t03', 'm_t04', 'm_t05', 'm_t06'];
const page2Content = [
  ...[23, 24, 25, 26, 27, 28, 29].map((i) => tableCellsXml(`p2_t${i}`, T(i), columnsForTable(i))),
  tableCellsXml(UNNAMED_ID, T(30), columnsForTable(30)),
  ...mirrorIds.map((mid, k) => mirrorTableXml(mid, T(k + 1))),
  // صف عمود t06_id داخل T28 — هدف الحافة المثبّتة (يُعدّل عدد أعمدة T28)
  `<mxCell id="p2_t28_fk" value="t06_id : INT" style="shape=tableRow;" vertex="1" parent="p2_t28"><mxGeometry as="geometry" /></mxCell>`,
  // المروحة: T01..T05 → T23..T27 (الحواف داخل صفحة نهايتيها لبنية الحل)
  edgeXml('p2_fan_1', 'm_t01', 'p2_t23'),
  edgeXml('p2_fan_2', 'm_t02', 'p2_t24'),
  edgeXml('p2_fan_3', 'm_t03', 'p2_t25'),
  edgeXml('p2_fan_4', 'm_t04', 'p2_t26'),
  edgeXml('p2_fan_5', 'm_t05', 'p2_t27'),
  // مثبّتة على عمود: T06 → العمود t06_id داخل T28
  edgeXml('p2_fg_t6_t28', 'm_t06', 'p2_t28_fk'),
  // N-M × 3 أزواج مختلفة → 3 جداول ربط
  edgeXml('p2_nm_1', 'p2_t23', 'p2_t24', 'N-M'),
  edgeXml('p2_nm_2', 'p2_t24', 'p2_t25', 'N-M'),
  edgeXml('p2_nm_3', 'p2_t23', 'p2_t25', 'N-M'),
  // حافة ذاتية على الجدول ذي الاسم الفارغ → تحذير "on table \"\""
  edgeXml('p2_self_unnamed', UNNAMED_ID, UNNAMED_ID),
].join('');

// صفحة 3: مرايا + جدول مكرر يضيف عموداً + حافة عبر الصفحات + حافة بمصدر مفقود
const page3Content = [
  mirrorTableXml('p3_mirror_cp', T(1)),                 // مرآة T01
  mirrorTableXml('p3_mirror_not', T(29)),               // مرآة T29
  tableCellsXml('p3_dup_t15', T(15), ['id : INT #pk', 'archived : BOOLEAN']),
  edgeXml('p3_x_page', 'p3_mirror_cp', 'p3_mirror_not'), // T01 ↔ notifications بالاسم
  edgeXml('edge-ghost', 'ghost-nonexistent', 'p3_mirror_not'),
].join('');

const wrapPage = (name: string, id: string, content: string): string =>
  `<diagram name="${name}" id="${id}"><mxGraphModel dx="2000" dy="1400" grid="1" gridSize="10" page="1"><root><mxCell id="0" /><mxCell id="1" parent="0" />${content}</root></mxGraphModel></diagram>`;
const FULL_XML = `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net">${wrapPage('P1', 'pg1', page1Content)}${wrapPage('P2', 'pg2', page2Content)}${wrapPage('P3', 'pg3', page3Content)}</mxfile>`;

/* ------------------------------------------------------------------ */
/* التوقعات الإحصائية = حساب مباشر من المواصفة                          */
/* ------------------------------------------------------------------ */
const UNIQUE_TABLES = TABLE_NAMES.length; // 30
let SEP_MODEL_COLUMNS = 0;
TABLE_NAMES.forEach((_, k) => { SEP_MODEL_COLUMNS += 1 + ((k + 1) % 4); }); // Σ(1 + i%4) = 75
SEP_MODEL_COLUMNS += 1; // عمود t06_id المثبّت داخل T28
SEP_MODEL_COLUMNS += 1; // عمود archived المدمج في Table_15 عبر الصفحة 3
const N_M_PAIRS = 3;
const CHAIN_EDGES = 21;
const FAN_EDGES = 5;
const ANCHORED_EDGES = 1;
const CROSS_PAGE_EDGES = 1;
const IGNORED_EDGES = 2; // مصدر مفقود + ذاتية
const EXPECTED_RELATIONSHIPS = CHAIN_EDGES + FAN_EDGES + ANCHORED_EDGES + N_M_PAIRS + CROSS_PAGE_EDGES; // 31
const EXPECTED_DDL_FKS = (EXPECTED_RELATIONSHIPS - N_M_PAIRS) + N_M_PAIRS * 2; // 28 + 6 = 34
const EXPECTED_DDL_TABLES = UNIQUE_TABLES + N_M_PAIRS; // 33
const EXPECTED_DDL_COLUMNS = SEP_MODEL_COLUMNS + N_M_PAIRS * 2; // 83

const ALL_DIALECTS: SqlDialect[] = ['mysql', 'postgres', 'sqlite', 'sqlserver', 'oracle'];
const JUNCTION_NAMES = [
  'warehouse_zones_tags__web_junction',
  'tags__web_coupon_codes_junction',
  'warehouse_zones_coupon_codes_junction',
];

const model: ErModel = await parseDrawioFile(FULL_XML);
const results: Record<SqlDialect, DdlResult> = Object.fromEntries(
  ALL_DIALECTS.map((dialect) => [dialect, generateDdl(model, dialect)])
) as Record<SqlDialect, DdlResult>;

/* ------------------------------------------------------------------ */
/* المحلل                                                              */
/* ------------------------------------------------------------------ */
describe('FFT — إجهاد المحلل على مخطط مُولَّد حتمياً (30 جدولاً / 33 حافة / 3 صفحات)', () => {
  it('يحلّ المخطط كاملاً: 30 جدولاً فريداً + 31 علاقة + حذرتان معلومتان فقط', () => {
    expect(model.tables).toHaveLength(UNIQUE_TABLES);
    const lowerNames = model.tables.map((t) => (t.name || t.id).toLowerCase());
    expect(new Set(lowerNames).size).toBe(UNIQUE_TABLES); // لا دمج زائد ولا تكرار اصطناعي

    // كل جدول له مفتاح أساسي (معلَم #pk أو لكنه موجود)
    for (const tbl of model.tables) {
      expect(tbl.columns.length).toBeGreaterThanOrEqual(1);
      expect(tbl.columns.some((c) => c.isPrimaryKey)).toBe(true);
    }

    expect(model.relationships).toHaveLength(EXPECTED_RELATIONSHIPS);
    const oneMany = model.relationships.filter((r) => r.cardinality === '1-N');
    const manyMany = model.relationships.filter((r) => r.cardinality === 'N-M');
    expect(oneMany).toHaveLength(EXPECTED_RELATIONSHIPS - N_M_PAIRS); // 28
    expect(manyMany).toHaveLength(N_M_PAIRS);                        // 3

    // الحافة المثبّتة على العمود: targetColumn = t06_id من داخل T28 (order notes)
    const anchoredOne = model.relationships.find((r) => r.sourceTable === p1Id(6) && r.targetTable === 'p2_t28');
    expect(anchoredOne).toBeTruthy();
    expect(anchoredOne!.targetColumn).toBe('t06_id');
    expect(anchoredOne!.targetTable).toBe('p2_t28');

    // العلاقة عبر الصفحات — حُلّت بالاسم لا بالمعرّف: T01 ↔ notifications
    const cross = model.relationships.find((r) => r.sourceTable === p1Id(1) && r.targetTable === 'p2_t29');
    expect(cross).toBeTruthy();
    expect(cross!.cardinality).toBe('1-N');

    // الحذرتان المعلمتان فقط — لا أي تحذير إضافي (لا تشوّه في الرسائل)
    expect(model.warnings).toHaveLength(IGNORED_EDGES);
    expect(model.warnings.some((w) => /unresolved source\/target.*edge-ghost/.test(w))).toBe(true);
    expect(model.warnings.some((w) => /self-referencing edge on table ""\./.test(w))).toBe(true);
  });

  it('عدد الأعمدة الكلي للموديل = حسبة المواصفة تماماً (دمج الصفحات بلا فقد ولا رُخض)', () => {
    const total = model.tables.reduce((sum, t) => sum + t.columns.length, 0);
    expect(total).toBe(SEP_MODEL_COLUMNS);
    // دمج Table_15 عبر الصفحتين 1 و3: عمود archived وحده أُضاف بلا تكرار id
    const t15 = model.tables.find((t) => t.name === 'Table_15')!;
    expect(t15.columns.map((c) => c.name)).toContain('archived');
    expect(t15.pages).toEqual([0, 2]);
    // لا عمود مكرر داخل أي جدول (حساسية عالية للحالة الكبيرة)
    for (const tbl of model.tables) {
      const names = tbl.columns.map((c) => c.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

/* ------------------------------------------------------------------ */
/* المولّد على الأصناف الخمسة                                          */
/* ------------------------------------------------------------------ */
describe('FFT — المولّد على أصناف SQL الخمسة: كود بلا تشويه', () => {
  for (const dialect of ALL_DIALECTS) {
    it(`${dialect}: عدادات صارمة + توازن أقواس + أسماء فريدة + مراجع صحيحة`, () => {
      const result = results[dialect];
      const code = result.code;

      expect(result.stats).toEqual({
        tables: EXPECTED_DDL_TABLES,
        columns: EXPECTED_DDL_COLUMNS,
        fks: EXPECTED_DDL_FKS,
        junctionTables: N_M_PAIRS,
      });

      // 1) CREATE TABLE بالعدد الصحيح وبأسماء فريدة (حساسية الأسماء المحروّرة/المسبوقة بأرقام)
      const createRe = /CREATE TABLE\s+([^(\s]+)\s*\(/g;
      const tableNames: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = createRe.exec(code))) tableNames.push(m[1].replace(/^[`"[]+|[`"\]]+$/g, ''));
      expect(tableNames).toHaveLength(EXPECTED_DDL_TABLES);
      expect(new Set(tableNames.map((n) => n.toLowerCase())).size).toBe(EXPECTED_DDL_TABLES);

      // 2) FOREIGN KEY بالعدد الدقيق (28 علاقة مباشرة + 6 FK لجداول الربط)
      expect((code.match(/FOREIGN KEY/g) ?? []).length).toBe(EXPECTED_DDL_FKS);

      // 3) الأقواس متوازنة عالمياً — أي تشويه يهدم هذا
      expect(code.split('(').length).toBe(code.split(')').length);

      // 4) لا بقايا وسوم علامات أو كيانات غارقة في الكود (قيود CHECK الشرعية مع <> مقصودة)
      expect(code).not.toMatch(/#pk/i);
      expect(code).not.toMatch(/«|»/);

      // 5) كل REFERENCES يشير إلى جدول مُنشأ في الكود نفسه (حتى في الأصناف العلوّية بأسماء HIGH)
      for (const ref of code.matchAll(/REFERENCES\s+([^\s(]+)\s*\(/g)) {
        const target = ref[1].replace(/^[`"[]+|[`"\]]+$/g, '').toLowerCase();
        expect(tableNames.map((n) => n.toLowerCase())).toContain(target);
      }

      // 6) الجداول الثلاثة for the N-M علاقات أُنشئت بأسمائها الصحيحة
      for (const jn of JUNCTION_NAMES) expect(code).toContain(jn);

      // 7) DROP statements بالعدد الصحيح لكل نوع صياغة
      if (dialect === 'mysql' || dialect === 'postgres' || dialect === 'sqlite') {
        expect((code.match(/DROP TABLE IF EXISTS/g) ?? []).length).toBe(EXPECTED_DDL_TABLES);
      } else if (dialect === 'sqlserver') {
        expect((code.match(/IF OBJECT_ID/g) ?? []).length).toBe(EXPECTED_DDL_TABLES);
      } else {
        expect((code.match(/-- DROP TABLE/g) ?? []).length).toBe(EXPECTED_DDL_TABLES);
      }
    });
  }

  it('MySQL: الحواف المثبّتة والمراوح مرتبطة بمفاتيح صحيحة ومسمّات محروّرة', () => {
    const mysql = results.mysql;
    // الحافة المثبّتة على العمود t06_id → جدول الأب "line items (web_v2)" المحروّر
    expect(mysql.code).toContain('FOREIGN KEY (`t06_id`) REFERENCES `line_items__web_v2`(`id`)');
    // المروحة: T01 customer profiles → warehouse zones
    expect(mysql.code).toContain('FOREIGN KEY (`customer_profiles_id`) REFERENCES `customer_profiles`(`id`)');
    // جدول الربط بمفتاحين مركّبين
    const junctionBlock = mysql.code.slice(mysql.code.lastIndexOf('CREATE TABLE `warehouse_zones_tags__web_junction`'));
    expect(junctionBlock).toMatch(/PRIMARY KEY \(`warehouse_zones_id`, `tags__web__id`\)/);
  });

  it('SQLite: أسماء الأسماء المحروّرة من الرموز الخاصة وردت سليمة', () => {
    const sqlite = results.sqlite;
    expect(sqlite.code).toContain('CREATE TABLE "customer_profiles"');
    expect(sqlite.code).toContain(`CREATE TABLE "${sanitizeIdentifier(T(3))}"`); // POS-terminal.v2 (EU)
    expect(sqlite.code).toContain(`CREATE TABLE "${sanitizeIdentifier(T(6))}"`); // line items (web_v2)
    expect(sqlite.code).toContain(`CREATE TABLE "${sanitizeIdentifier(T(7))}"`); // SYNC:STATE-MACHINE
    // الجدول ذو الاسم الفارغ يحتاسم معرّفه الاحتياطي
    expect(sqlite.code).toContain(`CREATE TABLE "${UNNAMED_ID}"`);
  });
});

/* ------------------------------------------------------------------ */
/* التنفيذ الفعلي ب SQLite (sql.js) — بدون أي خطأ                       */
/* ------------------------------------------------------------------ */
describe('FFT — التنفيذ الفعلي ب SQLite (sql.js): كود المخطط الهائل يمرّ بلا أي خطأ', () => {
  it('ينفّذ كامل DDL (33 جدولاً) وتمرّ فحص تمام FK', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    const ddl = results.sqlite;
    db.exec('PRAGMA foreign_keys=ON;');
    expect(() => db.exec(ddl.code)).not.toThrow();

    const tablesInfo = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const names = new Set((tablesInfo[0]?.values.map((v: unknown[]) => String(v[0])) ?? []));
    expect(names.size).toBe(EXPECTED_DDL_TABLES);
    // عيّنات من الجداول الركيكة وصلت بأسمائها المحروّرة
    expect(names.has('customer_profiles')).toBe(true);
    expect(names.has(sanitizeIdentifier(T(3)))).toBe(true); // POS-terminal.v2 (EU)
    expect(names.has(sanitizeIdentifier(T(7)))).toBe(true);
    expect(names.has(UNNAMED_ID)).toBe(true);
    for (const jn of JUNCTION_NAMES) expect(names.has(jn)).toBe(true);

    const fkc = db.exec('PRAGMA foreign_key_check;');
    expect(fkc[0]?.values ?? []).toEqual([]);
  });

  it('إدخال متسق بصغُن FK يعمل، ومخالفة تُرفض (السلوك الناتج دائماً بلا تشويه)', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec('PRAGMA foreign_keys=ON;');
    db.exec(results.sqlite.code);

    db.exec(
      `INSERT INTO "customer_profiles" ("id","label_1") VALUES (1,'profile-A');
       INSERT INTO "warehouse_zones" ("id","label_23","customer_profiles_id") VALUES (1,'zone-1',1);`
    );
    // مخالفة FK مباشرة — يجب الرفض
    expect(() =>
      db.exec(`INSERT INTO "warehouse_zones" ("id","label_23","customer_profiles_id") VALUES (2,'zone-2',999);`)
    ).toThrow(/FOREIGN KEY/);
  });
});
