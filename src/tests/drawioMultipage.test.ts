import { describe, it, expect } from 'vitest';
import { parseDrawioFile } from '../utils/drawioImporter';

/**
 * اختبارات الملفات متعددة الصفحات (multiple diagrams في draw.io):
 *   1) كل جدول/علاقة يحمل فهارس صفحاته (pages) ويتطابق مع صفحته الأصلية.
 *   2) الجداول المكرّرة بالاسم عبر الصفحات تُدمج وتتّحد صفحات ظهورها.
 *   3) نموذج كل الصفحات = مجموع جداول/علاقات الصفحات (لا شيء يضيع).
 */

const TWO_PAGES_XML = `<?xml version="1.0"?>
<mxfile host="test">
  <diagram id="d1" name="Core">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="users" value="users" style="shape=table;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u0" value="id : INT #pk" style="shape=tableRow;horizontal=0;" vertex="1" parent="users"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="u1" value="email : VARCHAR(120)" style="shape=tableRow;horizontal=0;" vertex="1" parent="users"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="orders" value="orders" style="shape=table;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o0" value="id : INT #pk" style="shape=tableRow;horizontal=0;" vertex="1" parent="orders"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="o1" value="user_id : INT" style="shape=tableRow;horizontal=0;" vertex="1" parent="orders"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="e1" style="endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="users" target="orders"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="d2" name="Billing">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="invoices" value="invoices" style="shape=table;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="iv0" value="id : INT #pk" style="shape=tableRow;horizontal=0;" vertex="1" parent="invoices"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="iv1" value="order_id : INT" style="shape=tableRow;horizontal=0;" vertex="1" parent="invoices"><mxGeometry as="geometry" /></mxCell>
        {/* جدول orders منسوخ على الصفحة الثانية (نمط شائع) — يُدمج بالاسم مع صفحة 0 */}
        <mxCell id="orders2" value="orders" style="shape=table;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o3" value="user_id : INT" style="shape=tableRow;horizontal=0;" vertex="1" parent="orders2"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="e2" style="endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="invoices" target="orders2"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

describe('multi-page draw.io documents', () => {
  it('يقطّع الملف إلى صفحاته بأسمائها', async () => {
    const model = await parseDrawioFile(TWO_PAGES_XML);
    expect(model.diagramNames).toEqual(['Core', 'Billing']);
  });

  it('يربط كل جدول بفهرس صفحته', async () => {
    const model = await parseDrawioFile(TWO_PAGES_XML);
    expect(model.tables.find(t => t.name === 'users')?.pages).toEqual([0]);
    expect(model.tables.find(t => t.name === 'orders')?.pages).toEqual([0, 1]); // مُدمج — منسوخ على الصفحتين
    expect(model.tables.find(t => t.name === 'invoices')?.pages).toEqual([1]);
  });

  it('تُدمج الجداول المكرّرة اسمياً عبر الصفحات وتتّحد صفحات الظهور', async () => {
    const model = await parseDrawioFile(TWO_PAGES_XML);
    const edge1 = model.relationships.find(r => r.id === 'e1');
    const edge2 = model.relationships.find(r => r.id === 'e2');
    expect(edge1?.pages).toEqual([0]);
    expect(edge2?.pages).toEqual([1]);
    // الحافة الثانية تصل invoices إلى orders (المدمج) — تُرتكز إلى جدول النموذج عبر الاسم
    expect(edge2?.targetTable && model.tables.some(t => t.id === edge2.targetTable)).toBe(true);
    expect(model.tables.find(t => t.name === 'orders')?.pages).toEqual([0, 1]);
  });

  it('لكل صفحة مجموعتها: الصفحة 0 بدون جداول صفحة 1 (منطق التصفية في الواجهة)', async () => {
    const model = await parseDrawioFile(TWO_PAGES_XML);
    // محاكاة منطق التصفية المستخدم في pageModel بالواجهة
    const forPage = (idx: number) => {
      const tables = model.tables.filter(t => (t.pages ?? [0]).includes(idx));
      const ids = new Set(tables.map(t => t.id));
      return { tables, rels: model.relationships.filter(r => (r.pages ?? [0]).includes(idx) && ids.has(r.sourceTable) && ids.has(r.targetTable)) };
    };
    const page0 = forPage(0);
    const page1 = forPage(1);
    expect(page0.tables.map(t => t.name).sort()).toEqual(['orders', 'users']);
    expect(page0.rels.map(r => r.id)).toEqual(['e1']);
    expect(page1.tables.map(t => t.name).sort()).toEqual(['invoices', 'orders']);
    expect(page1.rels.map(r => r.id)).toEqual(['e2']);
  });

  it('الصفحة بلا اسم تحصل على اسماً افتراضياً (Page N)', async () => {
    const noNameXml = TWO_PAGES_XML.replace(' name="Billing"', '');
    const model = await parseDrawioFile(noNameXml);
    expect(model.diagramNames).toEqual(['Core', 'Page 2']);
  });
});
