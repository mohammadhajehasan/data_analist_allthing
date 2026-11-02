import { describe, it, expect } from 'vitest';
import { deflateRawSync, deflateSync } from 'node:zlib';
import {
  parseDrawioFile,
  parseColumnLabel,
  DrawioParseError,
  extractDrawioXmlFromPng,
  extractDrawioXmlFromSvg,
} from '../utils/drawioImporter';
import { generateDdl, mapType, parseRawType, DEFAULT_DDL_OPTIONS } from '../utils/ddlGenerator';
import { ErModel } from '../utils/drawioImporter';

/* ------------------------------------------------------------------ */
/* مخطط تجريبي بنمط ER الرسمي من draw.io (نفسه الذي يستخدمه الصفحة)      */
/* ------------------------------------------------------------------ */
const sampleErd = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram id="shop-erd" name="Shop ERD">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="users" value="users" style="shape=table;startSize=30;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="u0" value="id : INT #pk" style="shape=tableRow;" vertex="1" parent="users"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="u1" value="full_name : VARCHAR(120)" style="shape=tableRow;" vertex="1" parent="users"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="u2" value="email : VARCHAR(255)" style="shape=tableRow;" vertex="1" parent="users"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="products" value="products" style="shape=table;startSize=30;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="p0" value="id : INT #pk" style="shape=tableRow;" vertex="1" parent="products"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="p1" value="title : VARCHAR(200)" style="shape=tableRow;" vertex="1" parent="products"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="p2" value="price : DECIMAL(10,2)" style="shape=tableRow;" vertex="1" parent="products"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="p3" value="in_stock : BOOLEAN" style="shape=tableRow;" vertex="1" parent="products"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="orders" value="orders" style="shape=table;startSize=30;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="o0" value="id : INT #pk" style="shape=tableRow;" vertex="1" parent="orders"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="o1" value="total_amount : DECIMAL(10,2)" style="shape=tableRow;" vertex="1" parent="orders"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="order_items" value="order_items" style="shape=table;startSize=30;container=1;childLayout=tableLayout;" vertex="1" parent="1">
          <mxGeometry as="geometry" />
        </mxCell>
        <mxCell id="oi0" value="id : INT #pk" style="shape=tableRow;" vertex="1" parent="order_items"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="oi1" value="order_id : INT" style="shape=tableRow;" vertex="1" parent="order_items"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="oi2" value="product_id : INT" style="shape=tableRow;" vertex="1" parent="order_items"><mxGeometry as="geometry" /></mxCell>
        <mxCell id="e1" value="" style="edgeStyle=entityRelationEdgeStyle;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="users" target="orders"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e2" value="" style="edgeStyle=entityRelationEdgeStyle;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="orders" target="order_items"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e3" value="" style="edgeStyle=entityRelationEdgeStyle;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="products" target="order_items"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const tablesOf = (model: any, name: string) => model.tables.find((t: any) => t.name === name);

/* ------------------------------------------------------------------ */
/* المحلل                                                              */
/* ------------------------------------------------------------------ */
describe('parseDrawioFile — المحلل', () => {
  it('يستخرج الجداول والأعمدة وبطاقات PK من مخطط ER رسمي', async () => {
    const model = await parseDrawioFile(sampleErd);

    expect(model.tables.map((t: any) => t.name)).toEqual(['users', 'products', 'orders', 'order_items']);
    const users = tablesOf(model, 'users');
    expect(users.columns).toHaveLength(3);
    expect(users.columns[0]).toMatchObject({ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false });
    expect(users.columns[1]).toMatchObject({ name: 'full_name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: true });
    // بعد تنظيف العلامة #pk يجب ألا تلوث النوع
    expect(users.columns[0].type).not.toMatch(/pk/i);
    const products = tablesOf(model, 'products');
    expect(products.columns.find((c: any) => c.name === 'price')).toMatchObject({ type: 'DECIMAL(10,2)' });
    expect(products.columns.find((c: any) => c.name === 'in_stock')).toMatchObject({ type: 'BOOLEAN', isPrimaryKey: false });
  });

  it('يحدد العلاقات 1-N من أسهم ERmany/ERone', async () => {
    const model = await parseDrawioFile(sampleErd);
    expect(model.relationships).toHaveLength(3);
    const usersOrder = model.relationships.find((r: any) => r.sourceTable === 'users' && r.targetTable === 'orders');
    expect(usersOrder).toBeTruthy();
    expect(usersOrder?.cardinality).toBe('1-N');
  });

  it('يفك ضغط مخطط draw.io المضغوط (URL-encoded deflate)', async () => {
    const inner = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="t" value="cities" style="shape=table;container=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>
      <mxCell id="t0" value="id : INT pk" style="shape=tableRow;" vertex="1" parent="t"><mxGeometry as="geometry"/></mxCell>
      <mxCell id="t1" value="name : VARCHAR(60)" style="shape=tableRow;" vertex="1" parent="t"><mxGeometry as="geometry"/></mxCell>
    </root></mxGraphModel>`;
    const raw = deflateRawSync(Buffer.from(inner, 'utf8'));
    const encoded = encodeURIComponent(raw.toString('binary'));
    const compressedFile = `<mxfile><diagram name="C" id="c1">${encoded}</diagram></mxfile>`;

    const model = await parseDrawioFile(compressedFile);
    expect(model.tables).toHaveLength(1);
    expect(model.tables[0].name).toBe('cities');
    expect(model.tables[0].columns.map((c: any) => c.name)).toContain('name');
  });

  it('يرفُض ملفاً فارغاً بـ DrawioParseError', async () => {
    await expect(parseDrawioFile('  ')).rejects.toBeInstanceOf(DrawioParseError);
  });

  it('يرفُض ملفاً بلا جداول بـ DrawioParseError', async () => {
    await expect(parseDrawioFile('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>')).rejects.toBeInstanceOf(
      DrawioParseError
    );
  });
});

describe('parseColumnLabel — فكّ تسمية الأعمدة', () => {
  it('يفصل الاسم والنوع عند ":"', () => {
    expect(parseColumnLabel('created_at : TIMESTAMP')).toEqual({
      name: 'created_at',
      type: 'TIMESTAMP',
      markerPk: false,
      markerFk: false,
      required: false,
    });
  });

  it('يكتشف علامة #pk ويخرجها من النوع', () => {
    const parsed = parseColumnLabel('id : INT #pk');
    expect(parsed.name).toBe('id');
    expect(parsed.markerPk).toBe(true);
    expect(parsed.type).toBe('INT');
  });

  it('يتعامل مع صيغة UML "+ name : varchar(255)"', () => {
    const parsed = parseColumnLabel('+ email : VARCHAR(255)');
    expect(parsed.name).toBe('email');
    expect(parsed.type).toBe('VARCHAR(255)');
  });

  it('يقبل عموداً بلا نوع', () => {
    expect(parseColumnLabel('note')).toEqual({ name: 'note', type: '', markerPk: false, markerFk: false, required: false });
  });

  it('يكتشف pk وسط النص بحدود كلمات ويحفظه من النوع', () => {
    const parsed = parseColumnLabel('id : INT pk');
    expect(parsed.name).toBe('id');
    expect(parsed.type).toBe('INT');
    expect(parsed.markerPk).toBe(true);
  });

  it('يكتشف <<PK>> و «pk» بالأقواس المزخرفة', () => {
    expect(parseColumnLabel('user_id : INT <<PK>>').markerPk).toBe(true);
    expect(parseColumnLabel('user_id : INT <<PK>>').type).toBe('INT');
    expect(parseColumnLabel('+ id : int «pk»').markerPk).toBe(true);
  });

  it('يكتشف PK بوسم التسطير <u> (اصطلاح UML العمودي) وتسميات HTML المسرّبة', () => {
    const parsed = parseColumnLabel('&lt;u&gt;id&lt;/u&gt; : INT');
    expect(parsed.name).toBe('id');
    expect(parsed.type).toBe('INT');
    expect(parsed.markerPk).toBe(true);

    const bold = parseColumnLabel('&lt;b&gt;id&lt;/b&gt; : INT #pk');
    expect(bold.markerPk).toBe(true);
    expect(bold.name).toBe('id');
  });

  it('يكتشف not null وسط النص دون تلويث النوع', () => {
    const parsed = parseColumnLabel('email : VARCHAR(255) not null');
    expect(parsed.name).toBe('email');
    expect(parsed.type).toBe('VARCHAR(255)');
    expect(parsed.required).toBe(true);
    expect(parsed.markerPk).toBe(false);
  });

  it('لا يخطئ في أسماء تحتوي مجموعة حروف قريبة (packet/bank/pk2/pk_id)', () => {
    for (const label of ['packet : INT', 'bank_id : INT', 'pk2 : INT']) {
      const parsed = parseColumnLabel(label);
      expect(parsed.markerPk).toBe(false);
      expect(parsed.required).toBe(false);
    }
    expect(parseColumnLabel('pk_id : INT').markerPk).toBe(false);
  });

  it('يكتشف مجموعات القوائم (pk, nn) مرة واحدة', () => {
    const parsed = parseColumnLabel('id : INT (pk, nn)');
    expect(parsed.markerPk).toBe(true);
    expect(parsed.required).toBe(true);
    expect(parsed.type).toBe('INT');
  });

  it('عمود اسمه pk فحيث لا نوع لا يضيع من الكشف', () => {
    const parsed = parseColumnLabel('pk');
    expect(parsed.name).toBe('pk');
    expect(parsed.type).toBe('');
  });

  /* ---- FK وسط التسمية ------------------------------------------------ */

  it('يكتشف علامة #fk ويخرجها من النوع', () => {
    const parsed = parseColumnLabel('order_id : INT #fk');
    expect(parsed.name).toBe('order_id');
    expect(parsed.type).toBe('INT');
    expect(parsed.markerFk).toBe(true);
    expect(parsed.markerPk).toBe(false);
  });

  it('يكتشف (fk) و {fk} و [fk] كأقواس علامات', () => {
    for (const label of ['user_id : INT (fk)', 'user_id : INT {fk}', 'user_id : INT [fk]']) {
      const parsed = parseColumnLabel(label);
      expect(parsed.markerFk).toBe(true);
      expect(parsed.type).toBe('INT');
      expect(parsed.name).toBe('user_id');
    }
  });

  it('يكتشف <<FK>> و «fk» بالأقواس المزخرفة', () => {
    expect(parseColumnLabel('product_id : INT <<FK>>').markerFk).toBe(true);
    expect(parseColumnLabel('product_id : INT <<FK>>').type).toBe('INT');
    expect(parseColumnLabel('product_id : INT «fk»').markerFk).toBe(true);
  });

  it('يكتشف foreign key و references <table> بنمط DDL', () => {
    expect(parseColumnLabel('region_id : INT foreign key').markerFk).toBe(true);
    expect(parseColumnLabel('region_id : INT references regions').markerFk).toBe(true);
    expect(parseColumnLabel('region_id : INT references regions(id)').type).toBe('INT');
  });

  it('يركّب العلامات المزدوجة pk+fk معاً', () => {
    const parsed = parseColumnLabel('delivery_id : INT (pk, fk)');
    expect(parsed.markerPk).toBe(true);
    expect(parsed.markerFk).toBe(true);
    expect(parsed.name).toBe('delivery_id');
    expect(parsed.type).toBe('INT');
  });

  it('لا يخدعه fk وسط كلمات أخرى (fedk/fk2/fkey) بحدود الكلمات', () => {
    for (const name of ['fedk_id', 'fk2_id', 'fkey_id', 'fkn_id']) {
      const parsed = parseColumnLabel(`${name} : INT`);
      expect(parsed.markerFk).toBe(false);
      expect(parsed.name).toBe(name);
      expect(parsed.type).toBe('INT');
    }
  });

  it('يستخرج FK وسط خلايا schema المفروض حتى بعد ظهوره بتنسيقات مختلفة', () => {
    expect(parseColumnLabel('+ invoice_id : INT (FK)').markerFk).toBe(true);
    expect(parseColumnLabel('supplier_id : integer, fk').markerFk).toBe(true);
  });
});

  it('يستخرج PK بوسم التسطير وFK بوسم (fk) من مخطط UML عمودي بمستطيلات بسيطة', async () => {
    const umlErd = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram id="library-uml" name="Library UML">
    <mxGraphModel dx="1100" dy="800" grid="1" gridSize="10" page="1">
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
        <mxCell id="books" value="books" style="rounded=0;whiteSpace=wrap;html=1;fontStyle=1;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="320" y="60" width="200" height="140" as="geometry" />
        </mxCell>
        <mxCell id="bk0" value="&lt;u&gt;id&lt;/u&gt; : INT" style="text;html=1;align=left;" vertex="1" parent="books">
          <mxGeometry y="30" width="200" height="24" as="geometry" />
        </mxCell>
        <mxCell id="bk1" value="isbn : CHAR(13)" style="text;html=1;align=left;" vertex="1" parent="books">
          <mxGeometry y="63" width="200" height="24" as="geometry" />
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
    const model = await parseDrawioFile(umlErd);
    expect(model.tables.map((t: any) => t.name).sort()).toEqual(['books', 'loans', 'students']);
    const loans = tablesOf(model, 'loans');
    expect(loans.columns.find((c: any) => c.name === 'id')).toMatchObject({ isPrimaryKey: true, isNullable: false });
    expect(loans.columns.find((c: any) => c.name === 'student_id')).toMatchObject({ type: 'INT', isForeignKey: true });
    expect(loans.columns.find((c: any) => c.name === 'book_id')).toMatchObject({ type: 'INT', isForeignKey: true });
    // PK عبر التسطير لا يلوّث النوع
    expect(loans.columns[0].type).toBe('INT');
    // علاقة 1-N من الطلاب إلى القروض
    expect(model.relationships.length).toBe(2);
  });

  /* ------------------------------------------------------------------ */
  /* المولّد                                                             */
  /* ------------------------------------------------------------------ */
  describe('generateDdl — مولّد DDL', () => {
  it('MySQL: backticks + AUTO_INCREMENT + FK قيد + جسم InnoDB', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'mysql');
    expect(result.dialect).toBe('mysql');
    expect(result.code).toMatch(/CREATE TABLE `users` \(/);
    expect(result.code).toMatch(/`id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY/);
    expect(result.code).toMatch(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/);
    expect(result.code).toMatch(/FOREIGN KEY \(`users_id`\) REFERENCES `users`\(`id`\)/);
    // عامل واضح: عمود FK أعيد استخدامه إن قيل order_id صراحة
    expect(result.code).toMatch(/FOREIGN KEY \(`order_id`\) REFERENCES `orders`\(`id`\)/);
    expect(result.code).toMatch(/FOREIGN KEY \(`product_id`\) REFERENCES `products`\(`id`\)/);
  });

  it('PostgreSQL: SERIAL للمفتاح الرقمي', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'postgres');
    expect(result.code).toMatch(/"id" SERIAL NOT NULL PRIMARY KEY/);
    expect(result.code).toMatch(/"price" NUMERIC\(10,2\)/);
    expect(result.code).toMatch(/BOOLEAN/);
  });

  it('SQLite: INTEGER for boolean + CHECK, TEXT للتواريخ', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'sqlite');
    expect(result.code).toMatch(/\"in_stock\" INTEGER/);
    expect(result.code).toMatch(/CHECK \("in_stock" IN \(0,1\)\)/);
    expect(result.code).toMatch(/CREATE TABLE "order_items"/);
  });

  it('SQL Server: أقواس [] وNVARCHAR وIDENTITY', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'sqlserver');
    expect(result.code).toMatch(/CREATE TABLE \[users\] \(/);
    expect(result.code).toMatch(/\[id\] INT IDENTITY\(1,1\) NOT NULL PRIMARY KEY/);
    expect(result.code).toMatch(/\[email\] NVARCHAR\(255\)/);
  });

  it('Oracle: VARCHAR2 وNUMBER وأسماء كبيرة', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'oracle');
    expect(result.code).toMatch(/CREATE TABLE USERS \(/);
    expect(result.code).toMatch(/EMAIL VARCHAR2\(255\)/);
    expect(result.code).toMatch(/ID NUMBER\(10\) GENERATED BY DEFAULT AS IDENTITY/);
  });

  it('يعيد استخدام عمود FK المُصرّح به في المخطط بدل تكراره', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'postgres');
    const orderItemsBlock = result.code.split('CREATE TABLE "order_items"')[1]?.split('CREATE TABLE')[0] || '';
    expect(orderItemsBlock).toMatch(/FOREIGN KEY \("order_id"\)/);
    expect(orderItemsBlock).not.toMatch(/"orders_id"/);
  });

  it('يعتمد الترتيب الأبوي في الإنشاء', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'mysql');
    const usersIdx = result.code.indexOf('CREATE TABLE `users` (');
    const ordersIdx = result.code.indexOf('CREATE TABLE `orders` (');
    const orderItemsIdx = result.code.indexOf('CREATE TABLE `order_items` (');
    expect(usersIdx).toBeLessThan(ordersIdx);
    expect(ordersIdx).toBeLessThan(orderItemsIdx);
  });

  it('N-M: ينشئ جدول ربط بمفتاح مركّب وON DELETE CASCADE', () => {
    const model: ErModel = {
      diagramNames: ['test'],
      tables: [
        { id: 'a', name: 'students', columns: [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }, { name: 'full_name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: true }] },
        { id: 'b', name: 'courses', columns: [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }, { name: 'title', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: true }] },
      ],
      relationships: [{ id: 'r1', sourceTable: 'a', targetTable: 'b', cardinality: 'N-M' }],
      warnings: [],
    };
    const withJunction = generateDdl(model, 'postgres', { ...DEFAULT_DDL_OPTIONS, createJunctionTables: true });
    expect(withJunction.code).toMatch(/CREATE TABLE "students_courses_junction"/);
    expect(withJunction.code).toMatch(/PRIMARY KEY \("students_id", "courses_id"\)/);
    expect(withJunction.code).toMatch(/ON DELETE CASCADE/);
    expect(withJunction.stats.junctionTables).toBe(1);

    const withoutJunction = generateDdl(model, 'postgres', { ...DEFAULT_DDL_OPTIONS, createJunctionTables: false });
    expect(withoutJunction.code).not.toMatch(/CREATE TABLE "students_courses_junction"/);
    expect(withoutJunction.code).toMatch(/junction tables are disabled|Skipping N-M/);
  });

  it('1-1: يضيف UNIQUE إلى عمود FK', () => {
    const model: ErModel = {
      diagramNames: ['t'],
      tables: [
        { id: 'h', name: 'users', columns: [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }] },
        { id: 'd', name: 'passports', columns: [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }, { name: 'number', type: 'VARCHAR(45)', isPrimaryKey: false, isNullable: true }] },
      ],
      relationships: [{ id: 'r1', sourceTable: 'h', targetTable: 'd', cardinality: '1-1' }],
      warnings: [],
    };
    // المولّد يضع FK على الطرف المصدر (users) ويجعله UNIQUE
    const result = generateDdl(model, 'postgres');
    expect(result.code).toMatch(/FOREIGN KEY \("passports_id"\) REFERENCES "passports"\("id"\)/);
    expect(result.code).toMatch(/UNIQUE \("passports_id"\)/);
  });

  it('dropIfExists: يصدر DROP معلّقاً على Oracle', async () => {
    const model = await parseDrawioFile(sampleErd);
    const result = generateDdl(model, 'oracle', { dropIfExists: true, createJunctionTables: true });
    expect(result.code).toMatch(/-- DROP TABLE USERS CASCADE;/);
  });
});

describe('mapType — خريطة الأنواع', () => {
  it('parses sizing decor like unsigned correctly', () => {
    expect(parseRawType('BIGINT UNSIGNED').base).toBe('bigint');
    expect(parseRawType('BIGINT UNSIGNED').unsigned).toBe(true);
    expect(parseRawType('VARCHAR(80)').params).toEqual([80]);
  });

  it('timestamp إلى DATETIME2 في SQL Server وTIMESTAMP في Oracle', () => {
    expect(mapType({ name: 't', type: 'DATETIME', isPrimaryKey: false, isNullable: true }, 'sqlserver')).toBe('DATETIME2');
    expect(mapType({ name: 't', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true }, 'oracle')).toBe('TIMESTAMP');
  });
});

/* ------------------------------------------------------------------ */
/* صور التصدير: PNG وSVG المضمّنة                                        */
/* ------------------------------------------------------------------ */

/** CRC32 الجدولي — لإخراج chunks PNG حقيقية (متوافقة تماماً مع المواففات) */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** يبني chunk PNG حقيقي: [length][type][data][crc] */
function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, pngCrc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** توقيع PNG + IHDR صغير + IDATFake + نهاية */
function makeMinimalPng(extraChunks: Uint8Array[]): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = makePngChunk('IHDR', new Uint8Array(13));
  const idat = makePngChunk('IDAT', new Uint8Array([0x00, 0x01, 0x02]));
  const iend = makePngChunk('IEND', new Uint8Array(0));
  const total = [signature, ihdr, ...extraChunks, idat, iend].reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [signature, ihdr, ...extraChunks, idat, iend]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

describe('صور التصدير — extractDrawioXmlFromPng / FromSvg', () => {
  it('يستخرج XML من PNG تضمّن zTXt deflateRaw بخانة mxfile ثم يحلّله', async () => {
    const payload = Buffer.concat([Buffer.from('mxfile\0'), new Uint8Array([0]), deflateRawSync(Buffer.from(sampleErd, 'utf8'))]);
    const png = makeMinimalPng([makePngChunk('zTXt', new Uint8Array(payload))]);

    const xml = await extractDrawioXmlFromPng(png);
    expect(xml).toContain('<mxfile');
    const model = await parseDrawioFile(xml!);
    expect(model.tables.map((t: any) => t.name)).toContain('users');
  });

  it('يستخرج XML من PNG تضمّن zTXt بضغط zlib (تنوعة الأدوات الأخرى)', async () => {
    const payload = Buffer.concat([
      Buffer.from('mxfile\0'),
      new Uint8Array([0]),
      deflateSync(Buffer.from(sampleErd, 'utf8')),
    ]);
    const png = makeMinimalPng([makePngChunk('zTXt', new Uint8Array(payload))]);

    const xml = await extractDrawioXmlFromPng(png);
    expect(xml).toContain('<mxGraphModel');
  });

  it('يستخرج نسخة uncompressed tEXt', async () => {
    const payload = Buffer.concat([
      Buffer.from('mxfile\0'),
      Buffer.from(sampleErd, 'latin1'),
    ]);
    const png = makeMinimalPng([makePngChunk('tEXt', new Uint8Array(payload))]);

    const xml = await extractDrawioXmlFromPng(png);
    expect(xml).toContain('<mxfile');
  });

  it('يعيد null لصورة PNG بلا مخطط مضمّن (metadata خصرية)، وبوless صورة غير PNG', async () => {
    const payload = Buffer.concat([
      Buffer.from('comment\0'),
      Buffer.from('boring text no diagram'),
    ]);
    const png = makeMinimalPng([makePngChunk('tEXt', new Uint8Array(payload))]);
    await expect(extractDrawioXmlFromPng(png)).resolves.toBeNull();
    await expect(extractDrawioXmlFromPng(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).resolves.toBeNull();
  });

  it('يستخرج XML من SVG عبر الخاصية content المرمّزة URL', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="background-color: rgb(255, 255, 255);" content="${encodeURIComponent(sampleErd)}" width="100px" height="100px" viewBox="0 0 100 100"></svg>`;
    const xml = extractDrawioXmlFromSvg(svg);
    expect(xml).toContain('<mxfile');
  });

  it('يستخرج XML من SVG حين يكون mxfile مضمّناً بترميز XML كيانات', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><switch><g extra="&lt;mxfile&gt;&lt;diagram&gt;ok&lt;/diagram&gt;&lt;/mxfile&gt;"></g></switch></svg>`;
    const xml = extractDrawioXmlFromSvg(svg);
    expect(xml).toContain('<mxfile>');
    expect(xml).toContain('<diagram>');
  });

  it('يعيد null ل SVG بلا تضمين ورا كسر ترميز خاصية content غير القياسي', () => {
    expect(extractDrawioXmlFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10"></svg>`)).toBeNull();
    expect(extractDrawioXmlFromSvg(`<svg content="not%2fa%20urlencoded%20diagram"></svg>`)).toBeNull();
  });

  it('الحلقة كاملة: PNG → XML → parseDrawioFile → DDL يعمل', async () => {
    const payload = Buffer.concat([
      Buffer.from('mxfile\0'),
      new Uint8Array([0]),
      deflateRawSync(Buffer.from(sampleErd, 'utf8')),
    ]);
    const png = makeMinimalPng([makePngChunk('zTXt', new Uint8Array(payload))]);
    const xml = (await extractDrawioXmlFromPng(png))!;
    const model = await parseDrawioFile(xml);
    const result = generateDdl(model, 'postgres');
    expect(result.code).toMatch(/CREATE TABLE "users"/);
  });
});
