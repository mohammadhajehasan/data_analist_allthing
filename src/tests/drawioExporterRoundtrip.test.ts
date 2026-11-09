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

/** حقن خلية كائنات السكيما يدوياً في ملف مصدر (لاختبار المتانة والحزم التالفة) */
const withPayload = (xml: string, payload: string): string => {
  const escaped = payload
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const cell = `<mxCell id="sd-schema-objects" value="SCHEMA_OBJECTS_V1:${escaped}" style="text;html=1;" vertex="1" parent="1"><mxGeometry x="-4000" y="-4000" width="1" height="1" as="geometry" /></mxCell>`;
  return xml.replace('</root>', `${cell}\n      </root>`);
};

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

  it('كائنات السكيما: الفهارس والعروض والـTriggers تبقى بعد التصدير وإعادة الاستيراد', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    model.tables[0].indexes = [
      { name: 'idx_users_email', columns: ['email'], unique: true },
      { name: 'idx_users_email_balance', columns: ['email', 'balance'], unique: false },
    ];
    model.views = [
      { name: 'active_users', columns: ['id', 'email'], query: 'SELECT id, email FROM users WHERE active = 1' },
    ];
    model.triggers = [
      {
        name: 'trg_users_touch',
        table: 'users',
        timing: 'BEFORE',
        event: 'UPDATE',
        rawSql: 'CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP',
      },
    ];

    const xml = exportDrawioXml(model);
    expect(xml).toContain('SCHEMA_OBJECTS_V1:');
    // الخلية المخفية ليست جدولاً: عدد الجداول المرئية كما هو
    expect((xml.match(/shape=table;/g) || []).length).toBe(2);

    const back = await parseDrawioFile(xml);
    expect(back.tables).toHaveLength(2);
    const users = back.tables.find(t => t.name === 'users')!;
    expect(users.indexes).toEqual([
      { name: 'idx_users_email', columns: ['email'], unique: true },
      { name: 'idx_users_email_balance', columns: ['email', 'balance'], unique: false },
    ]);
    expect(back.views).toEqual([
      { name: 'active_users', columns: ['id', 'email'], query: 'SELECT id, email FROM users WHERE active = 1' },
    ]);
    expect(back.triggers).toEqual([
      expect.objectContaining({
        name: 'trg_users_touch',
        table: 'users',
        timing: 'BEFORE',
        event: 'UPDATE',
        rawSql: 'CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP',
      }),
    ]);

    // دورة ثانية لا تكرر الكائنات (الاستيراد يدمج بلا تكرار)
    const again = await parseDrawioFile(exportDrawioXml(back));
    expect(again.tables.find(t => t.name === 'users')!.indexes).toHaveLength(2);
    expect(again.views).toHaveLength(1);
    expect(again.triggers).toHaveLength(1);
  });

  it('يضع كائنات السكيما في أول صفحة تحمل جداول (لا صفحة فارغة متخطاة)', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    model.diagramNames = ['Empty', 'Data'];
    model.tables.forEach(table => { table.pages = [1]; });
    model.relationships.forEach(rel => { rel.pages = [1]; });
    model.views = [{ name: 'order_totals', query: 'SELECT user_id, SUM(total) FROM orders GROUP BY user_id' }];
    const xml = exportDrawioXml(model);
    expect((xml.match(/<diagram /g) || []).length).toBe(1);
    const back = await parseDrawioFile(xml);
    expect(back.views).toEqual([
      { name: 'order_totals', query: 'SELECT user_id, SUM(total) FROM orders GROUP BY user_id' },
    ]);
    expect(back.tables).toHaveLength(2);
  });

  it('لا يكتب خلية البيانات المخفية إن لم توجد كائنات سكيما', async () => {
    const model = await parseDrawioFile(SOURCE_XML);
    expect(exportDrawioXml(model)).not.toContain('SCHEMA_OBJECTS_V1:');
  });

  it('يتجاهل فهرساً لجدول غير موجود ويُبقي البقية مع تحذير', async () => {
    const payload = JSON.stringify({
      version: 1,
      indexes: {
        ghost_table: [{ name: 'idx_ghost', columns: ['id'], unique: false }],
        users: [{ name: 'idx_users_email', columns: ['email'], unique: true }],
      },
    });
    const back = await parseDrawioFile(withPayload(SOURCE_XML, payload));
    expect(back.tables.find(t => t.name === 'users')!.indexes).toEqual([
      { name: 'idx_users_email', columns: ['email'], unique: true },
    ]);
    expect(back.warnings.some(w => w.includes('ghost_table'))).toBe(true);
  });

  it('حزمة JSON تالفة تُتجاهل بتحذير بدل إفشال الاستيراد', async () => {
    const back = await parseDrawioFile(withPayload(SOURCE_XML, '{ليس JSON'));
    expect(back.tables).toHaveLength(2);
    expect(back.warnings.some(w => w.toLowerCase().includes('not valid json'))).toBe(true);
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
