/**
 * اختبار دوران دائم على ملف حقيقي مُصدَّر من واجهة مصمّم السكيمّا
 * -----------------------------------------------------------------
 * الـfixture `fixtures/ui-export-edited-schema.drawio` هو المحتوى الحرفي الذي
 * أنتجه زر «تصدير draw.io المحدّث» بعد تحرير يدوي في الواجهة: جدول `suppliers`
 * جديد بعمودين أضافهما المستخدم (`supplier_name`، `contact_email`) وقيد UNIQUE
 * مفعّل من محرّر القيود. الاختبار يستورده عبر نفس مُستورد التطبيق ويتأكد أن
 * الجداول والحقول والقيود والعلاقات نجت، وأنها وصلت إلى SQL المولَّد.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDrawioFile, type ErModel } from '../utils/drawioImporter';
import { generateDdl } from '../utils/ddlGenerator';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/ui-export-edited-schema.drawio', import.meta.url));

let model: ErModel;
let ddl: string;

beforeAll(async () => {
  model = await parseDrawioFile(readFileSync(FIXTURE_PATH, 'utf8'));
  ddl = generateDdl(model, 'mysql', { dropIfExists: true }).code;
});

describe('draw.io UI export → import round-trip', () => {
  it('يحافظ على تقسيم الصفحات وعدد الجداول والعلاقات بلا تحذيرات', () => {
    expect(model.diagramNames).toEqual(['Shop ERD', 'Billing ERD']);
    expect(model.tables).toHaveLength(7);
    expect(model.relationships).toHaveLength(4);
    expect(model.warnings).toEqual([]);
  });

  it('يستعيد الجدول الجديد المضاف من الواجهة بأعمدته الثلاثة', () => {
    const suppliers = model.tables.find(t => t.name === 'suppliers');
    expect(suppliers).toBeDefined();
    expect(suppliers!.columns.map(c => c.name)).toEqual(['id', 'supplier_name', 'contact_email']);
  });

  it('يحافظ على أنواع الأعمدة كما أدخلها المستخدم', () => {
    const suppliers = model.tables.find(t => t.name === 'suppliers')!;
    const byName = new Map(suppliers.columns.map(c => [c.name, c]));
    expect(byName.get('id')!.type).toBe('INT');
    expect(byName.get('supplier_name')!.type).toBe('VARCHAR(120)');
    expect(byName.get('contact_email')!.type).toBe('VARCHAR(255)');
  });

  it('يحافظ على القيود: PK و UNIQUE و NOT NULL و FK', () => {
    const suppliers = model.tables.find(t => t.name === 'suppliers')!;
    const byName = new Map(suppliers.columns.map(c => [c.name, c]));
    expect(byName.get('id')!.isPrimaryKey).toBe(true);
    expect(byName.get('id')!.isNullable).toBe(false);
    expect(byName.get('contact_email')!.isUnique).toBe(true);
    // العلم الاختياري يبقى غير معرّف عندما لا يوجد القيد — المهم أنه ليس مفعّلاً
    expect(byName.get('supplier_name')!.isUnique ?? false).toBe(false);

    const invoices = model.tables.find(t => t.name === 'invoices')!;
    const orderId = invoices.columns.find(c => c.name === 'order_id')!;
    expect(orderId.isForeignKey).toBe(true);
  });

  it('لا يفقد الجداول الأصلية من الصفحة الأولى', () => {
    const names = model.tables.map(t => t.name).sort();
    expect(names).toEqual(
      ['invoice_items', 'invoices', 'order_items', 'orders', 'products', 'suppliers', 'users'].sort()
    );
  });

  it('ينقل القيود إلى SQL المولَّد بعد إعادة الاستيراد', () => {
    const start = ddl.indexOf('CREATE TABLE `suppliers`');
    expect(start).toBeGreaterThan(-1);
    const suppliersSql = ddl.slice(start, ddl.indexOf(';', start) + 1);
    expect(suppliersSql).toContain('`id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY');
    expect(suppliersSql).toContain('`supplier_name` VARCHAR(120)');
    expect(suppliersSql).toContain('`contact_email` VARCHAR(255) UNIQUE');
    expect(ddl).toContain('DROP TABLE IF EXISTS `suppliers`');
    expect(ddl).toMatch(/FOREIGN KEY \(`order_id`\) REFERENCES `orders`\(`id`\)/);
  });
});
