# AI Data Analytics Platform

---

## مصمّم السكيمّا (draw.io → SQL) — منهجية كشف القيود والعلامات
## Schema Designer (draw.io → SQL) — Constraint & marker detection approach

المنهج هنا صريح: **كل ما يُعرف عن العمود يستخرج من ما رسمه المصمّم فعلاً** — التسمية، والنمط (style)، وحواف العلاقات — ثم تُبنى فوقه اقتراحات ذكية **غير مطبَّقة إلزامياً**. لا يخترع المحرك قيداً بلا إشارة مرئية في المخطط.

The approach is explicit: **everything known about a column is derived from what the designer actually drew** — its label, its style, and its relation edges — on top of which smart suggestions are offered **without ever force-applying**. The engine never invents a constraint that has no visual signal in the diagram.

---

### ١) كشف العلامات من تسمية العمود — `parseColumnLabel`
### 1) Marker detection from column labels — `parseColumnLabel`

تُفكّ كيانات XML (`&lt;`…) وتُطبّع تدوين UML `<<..>>` إلى «..» قبل نزع وسوم HTML، حتى تنجو بذور العلامات (PK/FK…) من الالتهام كوسوم وهمية. ثم تُكتشف العلامات **بحدود كلمات** (منع الإنذارات الكاذبة مثل `fedk` أو `UNIQUEIDENTIFIER`):

XML entities are decoded and UML `<<..>>` stereotypes are normalized to `«..»` before HTML tags are stripped, so marker tokens (PK/FK…) survive stripping as real text. Markers are then detected **with word boundaries** (preventing false positives such as `fedk` or `UNIQUEIDENTIFIER`):

| العلامة Marker | الصيغ المقبولة Accepted forms |
|---|---|
| **PK** | `pk`، `(pk)`، `{pk}`، `[pk]`، `#pk`، `^pk`، `<<PK>>`، `p.k.`، `primary key` |
| **FK** | `fk` بأي غلاف أعلاه، `f.k.`، `foreign key`، أو صيغة DDL `references users(id)` |
| **UNIQUE** | `uq`، `unique` بكل الأغلفة أعلاه |
| **NOT NULL** | `nn`، `not null`، `required`، أو نجمة `*` محاذاة لبداية التسمية |
| **CHECK** | `check(expr)` مع تحليل عمق الأقواس المتداخلة (مثل `check(price >= 0 AND stock > 5)`) |
| **DEFAULT** | `default <قيمة>` مع حفظ القيم المقتبسة كما هي |
| **UML عمودي** | `<u>…</u>` أو `text-decoration:underline` = اصطلاح UML القياسي للمفتاح الأساسي؛ `<b>`/`font-weight:bold` يُعاملان كإشارة PK أيضاً |

بعد الالتقاط، تُزال وسوم العلامات من النص **فقط حين يبقى ما بعده اسماً مشروعاً** — وإلا تُحفظ التسمية الأصلية كي لا يتحول اسم العمود إلى نص محتق.

After capture, marker tokens are stripped **only when the remainder is a valid identifier** — otherwise the original label is kept so the column name never degrades into residue.

### ٢) الكشف من نمط draw.io — `styleIndicatesPrimaryKey`
### 2) Style-based detection — `styleIndicatesPrimaryKey`

حين لا تحمل التسمية علامة صريحة، يُقرأ `fontStyle` في نمط الصف (أو صف الأب في جدول UML): **bold (1)، underline (4)، أو كليهما (5)** = مفتاح أساسي — نفس منطق قالب draw.io الرسمي للـ ER.

When the label carries no explicit marker, `fontStyle` is read from the row style (or its parent row in a UML table): **bold (1), underline (4), or both (5)** = primary key — matching the official draw.io ER template behavior.

### ٣) كشف الجداول والصفحات
### 3) Table & page discovery

- حاوية `shape=table` مع ≥ 2 أبناء بنمط «الاسم : النوع» = جدول.
- احتياط UML العمودي: مستطيل بسيط بلا `shape=table` لكنه يضم ≥ 2 أبناء بالفاصلة «:» يُقبل كجدول.
- التسميات العامة للجدول نفسه لا تتحول إلى عمود؛ أجزاء الجدول المتكررة عبر الصفحات تُدمج باسمه ويُتّحد سجل ظهورها.

- A `shape=table` container with ≥ 2 children labeled `name : type` = a table.
- Vertical-UML fallback: a plain rectangle (no `shape=table`) holding ≥ 2 colon-labeled children is accepted as a table.
- The table's own title never becomes a column; duplicate table fragments across pages are merged by name with a union of pages.

### ٤) المفاتيح الأساسية الافتراضية
### 4) Implicit primary keys

إن لم يُعلَم أي عمود PK بأي إشارة، يُرقّى أول عمود اسمه `id` تلقائياً ويُجبر على NOT NULL؛ وإلا يُسجّل تحذير صريح في النموذج (`no primary key detected`).

If no column is flagged PK by any signal, the first column named `id` is promoted automatically and forced NOT NULL; otherwise an explicit warning is recorded (`no primary key detected`).

### ٥) العلاقات من الحواف وعكسها
### 5) Relations from edges and flipping

- الحواف بين بطاقات الجداول تحمل النوع (`1-N`، `N-M`، `1-1`).
- `N-M` يُبنى عند توليد SQL كجدول ربط `a_b_junction` بمفتاحين خارجيين `ON DELETE CASCADE`.
- محرّر العلاقات يتيح تبديل النوع (1:1 · 1:N · N:1 · N:M)، والعكس الاتجاهي، وإعادة التسمية، والإضافة/الحذف — وكل ذلك يعكس مباشرةً على الـ DDL (وشامل للعلاقات ذاتية المرجع مثل `categories.parent_id → id`).

- Edges between table cards carry the cardinality (`1-N`, `N-M`, `1-1`).
- `N-M` becomes, at SQL generation, a junction table `a_b_junction` with two FKs using `ON DELETE CASCADE`.
- The relation editor lets you flip the type (1:1 · 1:N · N:1 · N:M), reverse direction, rename, add or delete — all reflected directly in the DDL (self-referential support like `categories.parent_id → id` is included).

### ٦) مفاتيح أجنبية مكتشفة بلا حافة — مولّد `REFERENCES` تلقائياً
### 6) Marked FKs with no drawn edge — automatic `REFERENCES` generation

عمود موسوم `isForeignKey` من التسمية لكن بلا علاقة مرسومة *لا يضيع*: `processInferredForeignKeys` في `ddlGenerator.ts`:

A column flagged `isForeignKey` from its label but without a drawn relation *is not lost*: `processInferredForeignKeys` in `ddlGenerator.ts`:

1. يُطابق الجدول الأم من اسم العمود (`student_id → students`): نزع اللاحق `_id | _no | _ref | _key | _fk` مع شكل الجمع (`students`/`student`، `ies↔y`).
2. المرجع الذاتي بالأدوار الهرمية: `parent_id` داخل `categories` يوجّه إلى الجدول نفسه (الرموز: `parent, ancestor, root, boss, manager, superior, head, chief, super`).
3. إلغاء الازدواج مع FKs العلاقات الصريحة بحماية `childTable + childColumn` — يظهر `REFERENCES` مرة واحدة بالضبط.
4. إن لم يُطابق أي جدول أم: **تحذير صريح** ولا يُولَّد `REFERENCES` أصلاً — لا قيد مضلِّل في الخرج:

1. The parent table is matched from the column name (`student_id → students`): suffix stripping (`_id | _no | _ref | _key | _fk`) plus singular/plural variants (`students`/`student`, `ies↔y`).
2. Hierarchy-role self-references: `parent_id` inside `categories` targets the same table (tokens: `parent, ancestor, root, boss, manager, superior, head, chief, super`).
3. De-duplication against relationship-derived FKs guards on `childTable + childColumn` — `REFERENCES` appears exactly once.
4. If no parent table matches: an **explicit warning** is recorded and no `REFERENCES` is emitted — never a misleading constraint:

```
Column "tenant_id" in "orders" is flagged FOREIGN KEY but no matching parent table
was found — REFERENCES skipped.
```

### ٧) الاقتراحات الذكية — مرئية لا مفروضة
### 7) Smart suggestions — visible, never imposed

`inferColumnConstraints` في `constraintInference.ts` يشتق من الاسم والنوع:
- **UNIQUE** لأعمدة المعرّف (`email, slug, sku, code, iban, uuid, handle, username`) بالمقاطع (`user_email → email`).
- **CHECK `>= 0`** للكميات الرقمية (`price, amount, total, quantity, qty, age, balance, stock, count, fee, tax, salary, weight, height`).
- **NOT NULL** لمفاتيح الربط `<…>_id` التي هي NULL حالياً افتراضياً.

`inferColumnConstraints` in `constraintInference.ts` infers from name + type:
- **UNIQUE** for identifier columns (`email, slug, sku, code, iban, uuid, handle, username`) matched by segments (`user_email → email`).
- **CHECK `>= 0`** for numeric quantities (`price, amount, total, quantity, qty, age, balance, stock, count, fee, tax, salary, weight, height`).
- **NOT NULL** for join keys `<…>_id` currently nullable.

**القاعدة الأساسية**: الاقتراح لا يُطبَّق وحده. يظهر في محرّر القيود كـ**شريحة متقطعة**، ويقبله المستخدم بالنقر على الشريحة أو بضغطة واحدة على زر «تطبيق الاقتراحات الذكي». ولا يُعاد اقتراح ذاته لعمود يحمل القيد أصلاً.

**The fidelity rule**: a suggestion is never auto-applied. It renders in the constraint editor as a **dashed chip**; the user accepts by clicking the chip or the «Apply smart suggestions» button that batch-applies all. No suggestion is repeated for a column already carrying that constraint.

### ٨) محرّر القيود والتحكم اليدوي
### 8) Constraint editor & manual override

شرائح تبديل حالة الحقل لكل عمود: **PK · FK · NOT NULL · UQ · CHECK · DEF** — صلبة = مطبقة، متقطعة = اقتراح ذكي في انتظار القرار. أي تعديل يدوي يحمَّل في الـ SQL الناتج فوراً (بما في ذلك تعبيرات CHECK المخصصة والقيم الافتراضية).

Per-column state chips: **PK · FK · NOT NULL · UQ · CHECK · DEF** — solid = applied, dashed = pending smart suggestion. Any manual override flows straight into the generated SQL (including custom CHECK expressions and default values).

### ٩) التوليد النهائي للسكيمّا
### 9) Final DDL generation

خمسة لهجات (MySQL، PostgreSQL، SQLite، SQL Server، Oracle) مع خريطة أنواع دقيقة، وتذييد المُعرّفات بأسلوب كل نظام، وترتيب طوبولوجي (الجداول الأب قبل الأبناء) لضمان صلاحية ترتيب `CREATE` دائماً، وجداول ربط لـ N-M، وخيار `DROP TABLE IF EXISTS` (يعلَّق كتعليق في Oracle ويصبح فحص وجود الكائن في SQL Server).

Five dialects (MySQL, PostgreSQL, SQLite, SQL Server, Oracle) with precise type mapping, per-dialect identifier quoting, topological ordering (parents before children) so `CREATE` order is always valid, junction tables for N:M, and optional `DROP TABLE IF EXISTS` (commented out on Oracle, object-existence check on SQL Server).

---

### الشجرة المصدرية Source map

| المكوّن Component | الملف File |
|---|---|
| كشف العلامات والأنواع Hint & type parsing | `src/utils/drawioImporter.ts` |
| الاقتراحات الذكية Smart suggestions | `src/utils/constraintInference.ts` |
| التوليد للخمس لهجات FK/schema generation | `src/utils/ddlGenerator.ts` |
| محرّر القيود والشرائح Constraint editor UI | `src/features/schemadesigner/SchemaDesignerPage.tsx` |
| معاينة ERD المرئية Visual ERD preview | `src/features/schemadesigner/ErdPreview.tsx` |
