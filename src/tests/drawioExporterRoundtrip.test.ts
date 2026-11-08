/**
 * اختبارات تصدير draw.io المحدّث — round-trip
 * -------------------------------------------
 * المسار: مخطط draw.io → parseDrawioFile → ErModel → تحرير يدوي (نفس عمليات
 * مصمّم السكيمّا) → exportDrawioXml → parseDrawioFile مرة أخرى، ثم التأكد أن
 * كل الجداول/الأعمدة/الأنواع/القيود/العلاقات نجت من الرحلة كاملةً.
 */
import { describe, it, expect } from 'vitest';
import { parseDrawioFile, type ErModel } from '../utils/drawioImporter';
import { exportDrawioXml } from '../utils/drawioExporter';

/* مصدر رسمي بنمط draw.io: جدولان + علاقة 1-N + قيود متنوعة */
const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="roundtrip-test">
  <diagram id="rt" name="Round Trip ERD">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="users" value="users" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="220" height="180" as="geometry" />
        </mxCell>
        <mxCell id="u0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u1" value="email : VARCHAR(255) uq" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u2" value="balance : DECIMAL(10,2) check(balance >= 0) default 0" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="users">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="orders" value="orders" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="320" y="40" width="220" height="140" as="geometry" />
        </mxCell>
        <mxCell id="o0" value="id : INT #pk" style="shape=tableRow;horizontal=0;startSize=0;fontStyle=1;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o1" value="user_id : INT" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o2" value="total : DECIMAL(10,2) nn" style="shape=tableRow;horizontal=0;startSize=0;" vertex="1" parent="orders">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="e1" value="" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="users" target="orders">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const roundtrip = async (model: ErModel): Promise<ErModel> => parseDrawioFile(exportDrawioXml(model));

describe('exportDrawioXml — تصدير المخطط المحدّث (round-trip عبر parseDrawioFile)', () => {
  it('يُصدّر XML بصيغة draw.io الرسمية (mxfile + diagram + mxGraphModel + shape=table)', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    const xml = exportDrawioXml(model);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<diagram ');
    expect(xml).toContain('shape=table;');
    expect(xml).toContain('shape=tableRow;');
    expect(xml).toContain('edgeStyle=entityRelationEdgeStyle;');
  });

  it('يحفظ الجداول والأعمدة والأنواع كما رُسمت', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    const back = await roundtrip(model);
    expect(back.tables.map(t => t.name)).toEqual(['users', 'orders']);
    expect(back.tables[0].columns.map(c => c.name)).toEqual(['id', 'email', 'balance']);
    expect(back.tables[0].columns[2].type).toBe('DECIMAL(10,2)');
    expect(back.tables[1].columns.map(c => c.name)).toEqual(['id', 'user_id', 'total']);
  });

  it('يحفظ القيود: PK فريدة و UQ و NOT NULL و CHECK و DEFAULT', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    const back = await roundtrip(model);
    const users = back.tables[0];
    expect(users.columns[0].isPrimaryKey).toBe(true);
    expect(users.columns[1].isUnique).toBe(true);
    expect(users.columns[2].check).toBe('balance >= 0');
    expect(users.columns[2].defaultValue).toBe('0');
    const orders = back.tables[1];
    expect(orders.columns[2].isNullable).toBe(false); // nn
    expect(orders.columns[1].isNullable).toBe(true); // بقية الأعمدة تفاصلها لا تُفرض
  });

  it('يحفظ العلاقة المنشأة من المحرّر بعمود FK على الابن (رسم الحافة عند صف العمود)', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    expect(model.relationships).toHaveLength(1);
    // نفس ما يفعل زر «إضافة علاقة»: تحديد عمود FK على الطرف الهدف
    model.relationships[0].targetColumn = 'user_id';
    const xml = exportDrawioXml(model);
    expect(xml).toContain('source="users" target="orders-r1"');
    const back = await roundtrip(model);
    expect(back.relationships).toHaveLength(1);
    const rel = back.relationships[0];
    const tables = new Map(back.tables.map(t => [t.name, t]));
    expect(tables.get(rel.sourceTable)!.name).toBe('users');
    expect(tables.get(rel.targetTable)!.name).toBe('orders');
    expect(rel.cardinality).toBe('1-N');
    expect(rel.targetColumn?.toLowerCase()).toBe('user_id');
  });

  it('يحفظ التحرير اليدوي: إعادة تسمية جدول + تعديل قيود عمود + عمود مضاف', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    // نفس عمليات محرّر البطاقات: إعادة تسمية + قيد UQ + NOT NULL
    model.tables[0].name = 'accounts';
    model.tables[0].columns[1].isUnique = false;
    model.tables[0].columns[1].isNullable = false;
    model.tables[0].columns[1].defaultValue = "'n/a'";
    model.tables[1].columns.push({ name: 'currency', type: 'CHAR(3)', isPrimaryKey: false, isNullable: true });
    const back = await roundtrip(model);
    expect(back.tables[0].name).toBe('accounts');
    expect(back.tables[0].columns[1].isUnique ?? false).toBe(false); // إزالة العلامة = إعادة حالتها الافتراضية
    expect(back.tables[0].columns[1].isNullable).toBe(false);
    expect(back.tables[0].columns[1].defaultValue).toBe("'n/a'");
    expect(back.tables[1].columns.map(c => c.name)).toContain('currency');
    expect(back.tables[1].columns.find(c => c.name === 'currency')!.type).toBe('CHAR(3)');
  });

  it('النموذج متعدد الصفحات: صفحة لكل diagram تحوي جداول/علاقات تلك الصفحة', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    model.diagramNames = ['Shop', 'Archive'];
    // مستورد واقعي: علاقة users→orders داخل صفحة واحدة، وجدول مستقل بلا علاقات في صفحة أخرى
    model.tables[0].pages = [0];
    model.tables[1].pages = [0];
    model.relationships[0].pages = [0];
    model.tables.push({ id: 'archive_log', name: 'archive_log', pages: [1], columns: [
      { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
      { name: 'payload', type: 'TEXT', isPrimaryKey: false, isNullable: true },
    ] });
    const xml = exportDrawioXml(model);
    expect((xml.match(/<diagram /g) || []).length).toBe(2);
    const back = await parseDrawioFile(xml);
    expect(back.diagramNames).toEqual(['Shop', 'Archive']);
    expect(back.tables.map(t => t.name)).toEqual(['users', 'orders', 'archive_log']);
    expect(back.tables[0].pages).toEqual([0]);
    expect(back.tables[2].pages).toEqual([1]);
    expect(back.relationships).toHaveLength(1);
  });

  it('العلاقة المقلوبة N-1 تعود بمعنى مكافئ: الأب أولاً والابن ثانياً وعمود FK على الابن', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    // زر «إضافة علاقة» باتجاه معكوس: المصدر = الابن (orders) والهدف = الأب (users)
    model.relationships[0] = { ...model.relationships[0], sourceTable: 'orders', targetTable: 'users', sourceColumn: 'user_id', targetColumn: 'id', cardinality: 'N-1' };
    const back = await roundtrip(model);
    expect(back.relationships).toHaveLength(1);
    const rel = back.relationships[0];
    // الدلالة محفوظة: علاقة many-to-one بين الجدولين نفسه — تنقيط النموذج canonical
    expect(new Set([rel.sourceTable, rel.targetTable])).toEqual(new Set(['orders', 'users']));
    expect(['1-N', 'N-1']).toContain(rel.cardinality);
    // عمود FK على جدول الابن في كلا التمثيلين
    const childTable = rel.sourceTable === 'orders' ? rel.sourceColumn : rel.targetColumn;
    expect(childTable?.toLowerCase()).toBe('user_id');
  });

  it('تهريب XML: رموز & < > في القيم لا تفسد بنية الملف', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    // تعبير CHECK برموز XML حساسة (التسمية تُرسل مُهرّبة ثم تفكَّ عند القراة)
    model.tables[0].columns[2].check = 'amount > 0 && amount < 1e6';
    model.tables[0].columns[2].defaultValue = "'a&b'";
    const xml = exportDrawioXml(model);
    expect(xml).toContain('&amp;&amp;');
    expect(xml).toContain('&gt;');
    const back = await roundtrip(model);
    expect(back.tables[0].columns[2].check).toBe('amount > 0 && amount < 1e6');
    expect(back.tables[0].columns[2].defaultValue).toBe("'a&b'");
  });
});
