import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDrawioFile } from '../utils/drawioImporter';
import { generateDdl, SqlDialect } from '../utils/ddlGenerator';
import {
  LARGE_TABLES,
  LARGE_EDGES,
  LARGE_TOTAL_COLUMNS,
  LARGE_TOTAL_RELATIONS,
  EXPECTED_JUNCTION_NAME,
} from './largeErdFixtures';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/large-shop-erd.drawio', import.meta.url));
const xml = readFileSync(FIXTURE_PATH, 'utf8');

const ALL_DIALECTS: SqlDialect[] = ['mysql', 'postgres', 'sqlite', 'sqlserver', 'oracle'];

describe('إجهاد المحلل — مخطط 21 جدولاً × 21 علاقة (draw.io حقيقي)', () => {
  it('يرفع ملف .drawio الضخم كاملاً (نفس ملف الذي نرفع من الواجهة)', async () => {
    const model = await parseDrawioFile(xml);
    // لا صفحات مفقودة ولا جدول ناقص
    expect(model.tables).toHaveLength(LARGE_TABLES.length);
  });

  it('يعرف كل جدول بالاسم الدقيق وبأعمدته كاملة', async () => {
    const model = await parseDrawioFile(xml);
    const parsedNames = model.tables.map(t => t.name).sort();
    const specNames = LARGE_TABLES.map(t => t.name).sort();
    expect(parsedNames).toEqual(specNames);

    for (const spec of LARGE_TABLES) {
      const parsed = model.tables.find(t => t.name === spec.name)!;
      // كل جدول: عدد الأعمدة مطابق للمواصفة تماماً
      expect(parsed.columns).toHaveLength(spec.cols.length);
      // وكل اسم عمود بنفس الترتيب (علامة #pk تنظّف من النوع — سلوك مقصود للمحلل)
      const expectedNames = spec.cols.map(c => c.replace(/#pk/gi, '').trim());
      expect(parsed.columns.map(c => `${c.name} : ${c.type}`)).toEqual(expectedNames);
      // عمود المفتاح الأساسي id موجود ومفهوم PK
      const pk = parsed.columns.find(c => c.isPrimaryKey);
      expect(pk?.name).toBe('id');
      expect(pk?.isNullable).toBe(false);
    }

    // إجمالي الأعمدة العام لكل النموذج
    const total = model.tables.reduce((sum, t) => sum + t.columns.length, 0);
    expect(total).toBe(LARGE_TOTAL_COLUMNS);
    expect(total).toBeGreaterThan(95);
  });

  it('يحلّ كل العلاقات (20 × 1-N و 1 × N-M) بلا أي تحذير', async () => {
    const model = await parseDrawioFile(xml);
    expect(model.warnings).toEqual([]);
    expect(model.relationships).toHaveLength(LARGE_TOTAL_RELATIONS);

    const oneN = model.relationships.filter(r => r.cardinality === '1-N');
    const manyM = model.relationships.filter(r => r.cardinality === 'N-M');
    expect(oneN).toHaveLength(LARGE_TOTAL_RELATIONS - 1);
    expect(manyM).toHaveLength(1);
    expect(manyM[0].sourceTable).toBe('products');
    expect(manyM[0].targetTable).toBe('tags');
  });
});

describe('إجهاد المولّد — DDL صحيح لكل الأصناف الخمسة', () => {
  for (const dialect of ALL_DIALECTS) {
    it(`${dialect}: 22 جدول CREATE + 22 قيد FK + junction واحد`, async () => {
      const model = await parseDrawioFile(xml);
      const result = generateDdl(model, dialect);

      // 21 جدول معلن + جدول الربط المنتجة لعلاقة N-M = 22
      expect(result.stats.tables).toBe(LARGE_TABLES.length + 1);
      // 20 علاقة 1-N + FK-جول ربط × 2 = 22
      expect(result.stats.fks).toBe(LARGE_TOTAL_RELATIONS + 1);
      expect(result.stats.junctionTables).toBe(1);

      const createCount = (result.code.match(/CREATE TABLE/g) ?? []).length;
      expect(createCount).toBe(LARGE_TABLES.length + 1);

      const fkConstraints = (result.code.match(/FOREIGN KEY/g) ?? []).length;
      expect(fkConstraints).toBe(LARGE_TOTAL_RELATIONS + 1);

      // علاقة N-M أنتجت جدول ربط باسمه الصحيح
      expect(result.code).toContain(EXPECTED_JUNCTION_NAME);
    });
  }

  it('لا يولّد عمود FK مكرراً لأي جدول (الاسم والتكرار عالميان على 20 جدولاً)', async () => {
    const model = await parseDrawioFile(xml);
    for (const dialect of ALL_DIALECTS) {
      const result = generateDdl(model, dialect);
      // لا يضاف عمود بأبجدية الجدول الأب نفسه (customers_id بدل customer_id المصرّح)
      expect(result.code).not.toMatch(/customers_id/);
      expect(result.code).not.toMatch(/suppliers_id/);
      expect(result.code).not.toMatch(/warehouses_id/);
      expect(result.code).not.toMatch(/purchase_orders_id/);
      expect(result.code).not.toMatch(/sales_channels_id/);
      // كل الأعمدة المصرّحة موجود في الناتج
      const total = result.stats.columns;
      expect(total).toBe(LARGE_TOTAL_COLUMNS + 2); // + عمودا junction
    }
  });

  it('MySQL: FK يربط الحواف المرجّعة بنص العلاقة على 20 جدولاً', async () => {
    const model = await parseDrawioFile(xml);
    const result = generateDdl(model, 'mysql');
    // عينات من علاقات صعبة (نفس الأب لعدة أبناء)
    expect(result.code).toContain('FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`)');
    expect(result.code).toContain('FOREIGN KEY (`sales_channel_id`) REFERENCES `sales_channels`(`id`)');
    expect(result.code).toContain('FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`)');
    // ترتيب الأبوين: parents قبل أبنائهم في النص
    const customersIdx = result.code.indexOf('CREATE TABLE `customers` (');
    const salesOrdersIdx = result.code.indexOf('CREATE TABLE `sales_orders` (');
    const orderItemsIdx = result.code.indexOf('CREATE TABLE `sales_order_items` (');
    expect(customersIdx).toBeLessThan(salesOrdersIdx);
    expect(salesOrdersIdx).toBeLessThan(orderItemsIdx);
  });
});

/* ------------------------------------------------------------------ */
/* الإثبات القاطع — تنفيذ SQLite الفعلي بـ sql.js                       */
/* ------------------------------------------------------------------ */

describe('التنفيذ ب SQLite الفعلي (sql.js) — كود يعمل دلالياً', () => {
  it('ينفّذ كامل DDL لل 22 جدولاً ويدخل يعمل ويرفض FK مخالف', async () => {
    // @ts-ignore — sql.js بلا أنواع داخل المشروع (نمط المشروع الحالي)
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    const model = await parseDrawioFile(xml);
    const ddl = generateDdl(model, 'sqlite');

    // 1) كامل DDL يمر من أول مرة — أي خطأ صياغة/ترتيب يفجّر الاختبار هنا
    db.exec('PRAGMA foreign_keys=ON;');
    expect(() => db.exec(ddl.code)).not.toThrow();

    // 2) ال 22 جدولاً حقيقةً في القاعدة
    const tablesInfo = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tableNames = new Set(tablesInfo[0]?.values.map((v: any[]) => String(v[0])) ?? []);
    expect(tableNames.size).toBe(LARGE_TABLES.length + 1);
    for (const spec of LARGE_TABLES) expect(tableNames.has(spec.name)).toBe(true);
    expect(tableNames.has(EXPECTED_JUNCTION_NAME)).toBe(true);

    // 3) إدخال چهين مُتسق مع كل القيود (والأبوين قبل الابن)
    expect(() =>
      db.exec(
        `INSERT INTO "suppliers" ("id","company_name") VALUES (1,'Acme');
         INSERT INTO "customers" ("id","full_name") VALUES (1,'تجربة عميل');
         INSERT INTO "tags" ("id","name") VALUES (1,'promo');
         INSERT INTO "products" ("id","title","supplier_id") VALUES (1,'Widget',1);
         INSERT INTO "products" ("id","title","supplier_id") VALUES (2,'Gadget',1);
         INSERT INTO "warehouses" ("id","location_code") VALUES (1,'WH-01');
         INSERT INTO "sales_channels" ("id","channel_name") VALUES (1,'web');
         INSERT INTO "sales_orders" ("id","customer_id","sales_channel_id") VALUES (1,1,1);
         INSERT INTO "sales_order_items" ("id","sales_order_id","product_id") VALUES (1,1,1);
         INSERT INTO "product_reviews" ("id","product_id","customer_id","rating") VALUES (1,1,1,5);
         INSERT INTO "${EXPECTED_JUNCTION_NAME}" ("products_id","tags_id") VALUES (1,1);`
      )
    ).not.toThrow();

    // 3.1) القيود المركّبة لجدول الربط تعمل: التكرار مرفوض
    expect(() =>
      db.exec(`INSERT INTO "${EXPECTED_JUNCTION_NAME}" ("products_id","tags_id") VALUES (1,1);`)
    ).toThrow();

    // 4) القاتل الحاسم: إدخال يشير لأبوغلي شرعي غير موجود يُرفض — FOREIGN KEY تعمل فعلاً
    expect(() =>
      db.exec(
        `INSERT INTO "sales_order_items" ("id","sales_order_id","product_id") VALUES (2,999,1);`
      )
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      db.exec(
        `INSERT INTO "${EXPECTED_JUNCTION_NAME}" ("products_id","tags_id") VALUES (999,1);`
      )
    ).toThrow(/FOREIGN KEY/);

    // 5) الفحص الهيكلي: لا مخالفات مرجعية في البيانات الجاهزة
    const fkCheck = db.exec('PRAGMA foreign_key_check;');
    const violations = fkCheck[0]?.values ?? [];
    expect(violations).toEqual([]);

    // 6) المتسلسل التكامل: محتوى فعلي بمفاتيح مرتبطة يرصد مع JOIN
    const joined = db.exec(
      `SELECT COUNT(*) FROM "sales_order_items" soi
        JOIN "sales_orders" so ON so."id" = soi."sales_order_id"
        JOIN "products" p ON p."id" = soi."product_id"`
    );
    expect(joined[0]?.values?.[0]?.[0]).toBe(1);
  });
});
