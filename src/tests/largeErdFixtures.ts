/**
 * مواصفة مخطط ER ضخم — لاختبار إجهاد محرك draw.io → SQL
 * ---------------------------------------------------------
 * 21 جدولاً · 101 عموداً · 21 علاقة (20 × 1-N + 1 × N-M تولّد جدول ربط).
 * يبني XML بصيغة draw.io الرسمية (shapes = table + tableRow + ER edges)
 * ويمكن كتابته كملف .drawio حقيقي لتجربة الرفع اليدوي من الواجهة.
 */

export interface TableSpec {
  name: string;
  /** صيغة كل عمود: 'name : TYPE' مع '#pk' للمفتاح الأساسي */
  cols: string[];
}

export const LARGE_TABLES: TableSpec[] = [
  { name: 'customers', cols: ['id : INT #pk', 'full_name : VARCHAR(150)', 'email : VARCHAR(320)', 'phone : VARCHAR(32)', 'created_at : TIMESTAMP'] },
  { name: 'customer_addresses', cols: ['id : INT #pk', 'customer_id : INT', 'street : VARCHAR(200)', 'city : VARCHAR(120)', 'postal_code : VARCHAR(20)'] },
  { name: 'suppliers', cols: ['id : INT #pk', 'company_name : VARCHAR(200)', 'contact_email : VARCHAR(320)', 'rating : INT'] },
  { name: 'categories', cols: ['id : INT #pk', 'name : VARCHAR(120)', 'description : TEXT'] },
  { name: 'products', cols: ['id : INT #pk', 'title : VARCHAR(220)', 'price : DECIMAL(10,2)', 'supplier_id : INT', 'in_stock : INT'] },
  { name: 'warehouses', cols: ['id : INT #pk', 'location_code : VARCHAR(40)', 'capacity : INT', 'manager_name : VARCHAR(120)'] },
  {
    name: 'stock_movements',
    cols: ['id : INT #pk', 'product_id : INT', 'warehouse_id : INT', 'quantity : INT', 'direction : VARCHAR(16)', 'moved_at : TIMESTAMP', 'batch_no : VARCHAR(40)', 'lot_code : VARCHAR(40)'],
  },
  { name: 'purchase_orders', cols: ['id : INT #pk', 'supplier_id : INT', 'po_number : VARCHAR(40)', 'ordered_at : TIMESTAMP', 'status : VARCHAR(32)'] },
  { name: 'purchase_order_items', cols: ['id : INT #pk', 'purchase_order_id : INT', 'product_id : INT', 'quantity : INT', 'unit_price : DECIMAL(10,2)', 'received_at : TIMESTAMP'] },
  { name: 'sales_channels', cols: ['id : INT #pk', 'channel_name : VARCHAR(80)', 'is_active : INT'] },
  { name: 'sales_orders', cols: ['id : INT #pk', 'customer_id : INT', 'sales_channel_id : INT', 'status : VARCHAR(32)', 'total_amount : DECIMAL(12,2)', 'ordered_at : TIMESTAMP'] },
  { name: 'sales_order_items', cols: ['id : INT #pk', 'sales_order_id : INT', 'product_id : INT', 'quantity : INT', 'unit_price : DECIMAL(10,2)', 'discount_pct : INT'] },
  { name: 'payments', cols: ['id : INT #pk', 'sales_order_id : INT', 'amount : DECIMAL(12,2)', 'method : VARCHAR(32)', 'paid_at : TIMESTAMP'] },
  { name: 'refunds', cols: ['id : INT #pk', 'payment_id : INT', 'amount : DECIMAL(12,2)', 'reason : VARCHAR(200)', 'refunded_at : TIMESTAMP'] },
  { name: 'invoices', cols: ['id : INT #pk', 'sales_order_id : INT', 'invoice_number : VARCHAR(40)', 'issued_at : TIMESTAMP', 'total_due : DECIMAL(12,2)'] },
  { name: 'carriers', cols: ['id : INT #pk', 'name : VARCHAR(120)', 'region : VARCHAR(60)'] },
  { name: 'shippings', cols: ['id : INT #pk', 'sales_order_id : INT', 'carrier_id : INT', 'tracking_number : VARCHAR(60)', 'shipped_at : TIMESTAMP'] },
  { name: 'coupons', cols: ['id : INT #pk', 'code : VARCHAR(40)', 'discount_pct : INT', 'max_uses : INT', 'expires_at : TIMESTAMP'] },
  { name: 'coupon_redemptions', cols: ['id : INT #pk', 'coupon_id : INT', 'sales_order_id : INT', 'redeemed_at : TIMESTAMP'] },
  { name: 'tags', cols: ['id : INT #pk', 'name : VARCHAR(60)', 'color : VARCHAR(16)'] },
  { name: 'product_reviews', cols: ['id : INT #pk', 'product_id : INT', 'customer_id : INT', 'rating : INT', 'review_text : TEXT', 'created_at : TIMESTAMP'] },
];

export interface EdgeSpec {
  /** الجدول الأب (side one) — مصدر الحافة */
  from: string;
  /** الجدول الابن (side many) — هدف الحافة */
  to: string;
  style: '1-N' | 'N-M';
}

/** 21 علاقة — عمداً علاقات متعددة على نفس الأب لمختلف الجداول الابن (أصعب حالة واقعية) */
export const LARGE_EDGES: EdgeSpec[] = [
  { from: 'customers', to: 'customer_addresses', style: '1-N' },
  { from: 'suppliers', to: 'products', style: '1-N' },
  { from: 'products', to: 'stock_movements', style: '1-N' },
  { from: 'warehouses', to: 'stock_movements', style: '1-N' },
  { from: 'suppliers', to: 'purchase_orders', style: '1-N' },
  { from: 'purchase_orders', to: 'purchase_order_items', style: '1-N' },
  { from: 'products', to: 'purchase_order_items', style: '1-N' },
  { from: 'customers', to: 'sales_orders', style: '1-N' },
  { from: 'sales_channels', to: 'sales_orders', style: '1-N' },
  { from: 'sales_orders', to: 'sales_order_items', style: '1-N' },
  { from: 'products', to: 'sales_order_items', style: '1-N' },
  { from: 'sales_orders', to: 'payments', style: '1-N' },
  { from: 'payments', to: 'refunds', style: '1-N' },
  { from: 'sales_orders', to: 'invoices', style: '1-N' },
  { from: 'sales_orders', to: 'shippings', style: '1-N' },
  { from: 'carriers', to: 'shippings', style: '1-N' },
  { from: 'coupons', to: 'coupon_redemptions', style: '1-N' },
  { from: 'sales_orders', to: 'coupon_redemptions', style: '1-N' },
  { from: 'products', to: 'product_reviews', style: '1-N' },
  { from: 'customers', to: 'product_reviews', style: '1-N' },
  { from: 'products', to: 'tags', style: 'N-M' },
];

/** إجمالي الأعمدة المعلنة في المواصفة (يجب أن يطابق الاختبارات حرفياً) */
export const LARGE_TOTAL_COLUMNS = LARGE_TABLES.reduce((sum, t) => sum + t.cols.length, 0);

/** إجمالي العلاقات */
export const LARGE_TOTAL_RELATIONS = LARGE_EDGES.length;

/** اسم جدول الربط المتوقع من علاقة N-M (products ↔ tags) */
export const EXPECTED_JUNCTION_NAME = 'products_tags_junction';

/** يبني XML بصيغة draw.io الرسمية — نفس ما تُصدّره draw.io بـ "Uncompressed XML" */
export function buildLargeErdXml(): string {
  const cells: string[] = [];

  for (const table of LARGE_TABLES) {
    cells.push(
      `<mxCell id="${table.name}" value="${table.name}" style="shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;" vertex="1" parent="1">` +
        `<mxGeometry x="0" y="0" width="220" height="240" as="geometry" />` +
        `</mxCell>`
    );
    table.cols.forEach((col, i) => {
      const isPk = /#pk/i.test(col);
      cells.push(
        `<mxCell id="${table.name}-r${i}" value="${col}" style="shape=tableRow;horizontal=0;startSize=0;${isPk ? 'fontStyle=1;' : ''}" vertex="1" parent="${table.name}">` +
          `<mxGeometry as="geometry" />` +
          `</mxCell>`
      );
    });
  }

  LARGE_EDGES.forEach((edge, i) => {
    const arrows =
      edge.style === 'N-M'
        ? 'startArrow=ERmany;endArrow=ERmany;'
        : 'startArrow=ERone;endArrow=ERmany;';
    cells.push(
      `<mxCell id="e${i + 1}" value="" style="edgeStyle=entityRelationEdgeStyle;${arrows}" edge="1" parent="1" source="${edge.from}" target="${edge.to}">` +
        `<mxGeometry relative="1" as="geometry" />` +
        `</mxCell>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-11-01T00:00:00.000Z" agent="stress-test">
  <diagram id="enterprise-erd" name="Enterprise ERD">
    <mxGraphModel dx="2400" dy="1800" grid="1" gridSize="10" page="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
