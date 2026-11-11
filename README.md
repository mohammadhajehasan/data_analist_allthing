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

### ٩) محرّر كائنات السكيما واقتراحاتها الذكية
### 9) Schema-object editor & smart suggestions

محرّر مدمج للفهارس (على الجدول) والعروض والـTriggers مع **معاينة SQL مباشرة** تتبع اللهجة المختارة، وتشمل المسودة غير المحفوظة. إلى جانبه مقترح حتمي (`schemaObjectSuggestions.ts`) يشتق من النموذج نفسه: فهرس لكل مفتاح أجنبي لا يغطيه فهرس/PK/UNIQUE، وفهرس UNIQUE للمفاتيح الطبيعية (`email`, `username`, `slug`, `sku`, `isbn`…)، وعرض `v_<table>_active` للجداول ذات `status`/`is_active`، وTriggerين للطوابع الزمنية بصياغة MySQL/SQLite/PostgreSQL: تحديث `updated_at` عند التعديل، وتعبئة `created_at` (وأخواتها) عند الإدراج إن لم يكن لها DEFAULT، وTrigger تدقيق تلقائي عندما يوجد جدول سجل/تاريخ مطابق (`orders_audit` / `audit_orders` / `orders_history` / `orders_log`…) قابل لتخطيط أعمدة الهوية والحدث والوقت بأمان. تُخطَّط أزواج القيمة السابقة/اللاحقة (`old_`/`new_`، `before_`/`after_`، `previous_`/`current_`) لتخزين كل حقل (والجانب غير الموجود في الحدث يُكتب NULL، أو يُستبعد العمود إن كان NOT NULL)، وتُستبعد اللقطة المفردة للعمود الذي يغطّيه زوج، وتُعرض الأزواج المخططة (`المصدر · قبل → بعد`) داخل بطاقة الاقتراح قبل التطبيق. تُتجاهل الجداول التي فيها Trigger قائم بالفعل، ولا يُقترح التدقيق إذا وُجد عمود NOT NULL بلا مصدر أو DEFAULT قد يُفشل الإدراج. تُعرض مع السبب ونسبة الثقة، وتُطبَّق واحداً واحداً أو كلياً أو تُتجاهل — ولا يُطبَّق أي اقتراح تلقائياً.

A built-in editor for indexes (per table), views and triggers with a **live SQL preview** that follows the selected dialect and includes the unsaved draft. A deterministic suggester (`schemaObjectSuggestions.ts`) derives from the model itself: an index for every foreign key not covered by an index/PK/UNIQUE, unique indexes for natural keys (`email`, `username`, `slug`, `sku`, `isbn`…), a `v_<table>_active` view for tables with `status`/`is_active`, and two timestamp triggers in MySQL/SQLite/PostgreSQL syntax: a touch trigger for `updated_at` on update, a fill trigger for `created_at` (and aliases) on insert when it has no DEFAULT, and an automatic audit trigger whenever a matching history table (`orders_audit` / `audit_orders` / `orders_history` / `orders_log`…) can be mapped safely onto identity, event and timestamp columns. before/after column pairs (`old_`/`new_`, `before_`/`after_`, `previous_`/`current_`) are mapped to store both the previous and next value of each field (the side absent from an event is written as NULL, or the column is skipped when NOT NULL), the single-column snapshot is dropped for any column a pair already covers, and the mapped pairs (`source · before → after`) are listed on the suggestion card before applying. Tables that already carry a trigger are skipped, and no audit suggestion is made when a NOT NULL history column has neither a source nor a DEFAULT that could make the insert fail. Each carries a reason and confidence, and can be applied individually, in bulk, or dismissed — nothing is applied automatically.

**تدقيق الفهارس القائمة**: يكشف المحرك الفهارس المكررة تماماً (ويُبقي الفريد أو الأول)، والفهرس غير الفريد الذي هو بادئة يسارية لفهرس أطول، والفهرس الزائد على عمود PK/UNIQUE، والفهرس المرتبط بأعمدة حُذفت من الجدول، والفهرس الذي لا تلمسه أي علاقة أو عرض معلن (بثقة منخفضة لأنه قد يخدم استعلامات التطبيق). وتحليل العروض ليس مطابقة أسماء: يستخرج المحرك أعمدة **WHERE** و**JOIN ON/USING** فقط، ويحلّ كل مرجع عبر اسم الجدول أو اسمه المستعار، ولا يقبل المرجع المجرّد عند اللبس — فظهور العمود في قائمة SELECT، أو في جدول آخر، أو داخل نص لا يُعدّ استخداماً للفهرس. اقتراحات التنظيف تُعرض بشارة حمراء وزر **حذف** يحذف الفهرس من النموذج ومن مُعرَّف SQL مباشرة، وتختفي تلقائياً بعد التطبيق.

**Existing-index audit**: the engine detects exact duplicates (keeping the unique one, else the first), a non-unique index that is a leftmost prefix of a longer index, single-column indexes duplicating a PK/UNIQUE constraint, indexes referencing columns removed from the table, and indexes untouched by any declared relation or view (low confidence, since they may serve application queries). View analysis is not name matching: it extracts **WHERE** and **JOIN ON/USING** references, resolves them through the table name or alias, and rejects unqualified references when ambiguous — a column in the SELECT list, in another table, or inside a string literal does not count as index use. Cleanup suggestions use a red badge and a **Drop** action that removes the index from the model and the generated DDL, then disappears on its own.

**معاينة الفرق والتراجع**: لكل اقتراح زر «معاينة فرق SQL» يعرض `−/+` مبنياً على نفس دوال التوليد: إضافة كائن = سطر `+` واحد، وحذف فهرس = `−` لتعريفه الحالي مع `+` لـ`DROP INDEX` بصياغة اللهجة. وقبل «تطبيق الكل» تُفتح **مراجعة مجمّعة** تعرض كل تغييرات السكيما في ملف SQL واحد بترتيب التطبيق الفعلي، مع إحصاء الإضافات والحذف وزرّي نسخ وتنزيل ملف `.sql` — ولا يتغيّر النموذج حتى التأكيد. بعد أي تطبيق — فردي أو جماعي — يظهر شريط **تراجع** يعكس العملية جراحياً: يزيل ما أُضيف ويعيد الفهرس المحذوف إلى موضعه، دون استرجاع لقطة كاملة قد تلغي تعديلات أخرى.

**Diff preview & undo**: every suggestion has a «Preview SQL diff» toggle showing `−/+` built from the same generator functions: an addition is one `+` line, while dropping an index shows `−` for its current definition plus `+` for a dialect-correct `DROP INDEX`. Before «Apply all» a **combined review** presents every schema change in one SQL file in real apply order, with add/drop counts plus copy and `.sql` download buttons — the model is untouched until you confirm. After any apply — single or bulk — an **Undo** bar reverses it surgically: added objects are removed and a dropped index returns to its position, without restoring a whole snapshot that could discard unrelated edits.

**الرحلة عبر draw.io**: هذه الكائنات لا مقابل رسومي لها، لذلك يكتبها التصدير في خلية بيانات مخفية (`SCHEMA_OBJECTS_V1:`) خارج اللوحة، تبقى سليمة عند الحفظ في draw.io، ويستعيدها الاستيراد تلقائياً مع الفهارس المركّبة والعروض والـTriggers — ويدمج بلا تكرار ويتجاهل بحذر أي حزمة تالفة أو فهرس لجدول غير موجود.

**draw.io round-trip**: these objects have no graphical equivalent, so the exporter embeds them in a hidden data cell (`SCHEMA_OBJECTS_V1:`) outside the canvas. draw.io preserves it on save, and the importer restores indexes (including composite ones), views and triggers — merging without duplicates and warning (rather than failing) on a corrupt block or an index for an unknown table.

### ١٠) التوليد النهائي للسكيمّا
### 10) Final DDL generation

خمسة لهجات (MySQL، PostgreSQL، SQLite، SQL Server، Oracle) مع خريطة أنواع دقيقة، وتذييد المُعرّفات بأسلوب كل نظام، وترتيب طوبولوجي (الجداول الأب قبل الأبناء) لضمان صلاحية ترتيب `CREATE` دائماً، وجداول ربط لـ N-M، وخيار `DROP TABLE IF EXISTS` (يعلَّق كتعليق في Oracle ويصبح فحص وجود الكائن في SQL Server). ويُصدَّر الناتج من زر واحد كملف ترحيل `.sql` كامل يعاد توليده من النموذج الحالي لحظة النقر، فيجمع الجداول والقيود والفهارس والعروض والـTriggers بترتيب صلاحيتها، وترويسته تعدّ ما أُصدر فعلاً من كل نوع.

Five dialects (MySQL, PostgreSQL, SQLite, SQL Server, Oracle) with precise type mapping, per-dialect identifier quoting, topological ordering (parents before children) so `CREATE` order is always valid, junction tables for N:M, and optional `DROP TABLE IF EXISTS` (commented out on Oracle, object-existence check on SQL Server). One button exports the whole result as a `.sql` migration regenerated from the current model on click, bundling tables, constraints, indexes, views and triggers in dependency order, with a header that counts what was actually emitted per object type.

---

## مصنع الـBackend — من السكيمّا إلى مشروع كامل
## Backend Factory — from schema to a runnable project

بعد رفع المخطط أو تحريره في مصمّم السكيمّا، تظهر لوحة **BACKEND FACTORY** أسفل خيارات SQL. تختار سريعاً:

Inside the Schema Designer, below the SQL options, the **BACKEND FACTORY** panel asks four quick questions:

| السؤال Question | الخيارات Options |
|---|---|
| اسم المشروع Project name | يُستخدم في README وأسماء الملفات |
| قاعدة البيانات Database | MySQL · PostgreSQL · SQLite |
| التقنية Stack | تلقائي · FastAPI · Django (PostgreSQL) · Laravel · PHP PDO |
| النطاق Scope | REST API كامل · Models + Migrations فقط |
| التوثيق Auth | تسجيل/دخول + Bearer tokens (عند اختيار REST API) |

**القاعدة التلقائية Automatic rule:**

| قاعدة البيانات Database | التقنية الافتراضية Default stack |
|---|---|
| 🟠 MySQL | PHP + Laravel + Eloquent |
| 🔵 PostgreSQL | Python + FastAPI + SQLAlchemy |
| 🟡 SQLite | Python + FastAPI + SQLAlchemy |

اختيار التقنية يدوياً يتغلّب على القاعدة دائماً، وتبقى القاعدة ظاهرة بجانب الزر (Auto → FastAPI/Laravel).
خيار **Django + DRF** يظهر عند اختيار PostgreSQL ويولّد Django ORM + Serializers + ModelViewSet + TokenAuth، مع `managed = False` لأن ملف SQL هو مصدر الحقيقة للسكيما.
A manual stack choice always overrides the automatic rule, and the effective decision is shown next to the buttons. **Django + DRF** is offered for PostgreSQL and generates Django ORM models, serializers, ModelViewSets and TokenAuth; models are `managed = False` because the SQL file owns the schema.

كل مشروع مولَّد يحتوي على:

Every generated project contains:

- **Models/Entities** لكل جدول، مع العلاقات (`hasMany`/`belongsTo` أو Eloquent relations) والمفاتيح المركّبة.
- **Migrations**: ملف SQL مطابق للـ DDL الذي يراه المستخدم، إضافة إلى migrations بأسلوب الإطار (Laravel migrations).
- **CRUD REST API** لكل جدول: list/create/get/update/delete، مع دعم المفاتيح المركّبة.
- **Validation** مشتقة من قيود السكيمّا: required، `max_length`، unique (409)، FK موجود (400/422)، و`CHECK`.
- **اتصال قاعدة البيانات** و`.env.example` جاهز.
- **مشروع Laravel قابل للتشغيل** بمشغّل واحد: `composer.json` و`artisan` و`bootstrap/app.php` (مسجَّل فيه `routes/api.php`) و`public/index.php` و`.env` و`database/database.sqlite` لـSQLite — يكفي `composer install` ثم `php artisan key:generate` ثم `php artisan migrate` ثم `php artisan serve`. عند طلب التوثيق: `HasApiTokens` على نموذج المستخدم، ترحيل `personal_access_tokens`، وإن لم تحتوِ السكيما `users` يُولَّد الجدول القياسي؛ وإن كان بلا `email`/`password` تُعطَّل نقاط المصادقة مع تحذير بدل كود لا يعمل.
- **README** بهيكل المشروع وخطوات التشغيل والمسارات.
- **ZIP** جاهز للتنزيل، مع معاينة كل ملف داخل اللوحة قبل التنزيل.
- **فتح في VS Code**: زر يحفظ المشروع في `data/generated/` محلياً ثم يفتحه بمخطط `vscode://file`؛ تُضمَّن `.vscode/tasks.json` و`launch.json` والإضافات المقترحة وملف `.code-workspace`، فإن تعذّر الفتح (خادم بعيد مثلاً) يُنزّل ZIP تلقائياً.
- **Django + DRF** (PostgreSQL): Models بـ`managed=False`، Serializers، ModelViewSet CRUD، TokenAuth اختياري، و`migrations/001_init.sql` كمصدر DDL؛ يدعم المفاتيح المركّبة عبر `CompositePrimaryKey` (Django 5.2+) مع مسارات تفصيل صريحة.

- **Models/Entities** for every table, including relations (`hasMany`/`belongsTo` or Eloquent relations) and composite keys.
- **Migrations**: an exact SQL migration matching the DDL plus framework-style migrations (Laravel).
- **CRUD REST API** per table: list/create/get/update/delete, with composite-key support.
- **Validation** derived from schema constraints: required, `max_length`, unique (409), existing FK (400/422), and `CHECK`.
- **Database connection** plus a ready `.env.example`.
- **A runnable Laravel project**: `composer.json`, `artisan`, `bootstrap/app.php` with `routes/api.php` registered, `public/index.php`, `.env` and (for SQLite) `database/database.sqlite` — `composer install`, `php artisan key:generate`, `php artisan migrate`, `php artisan serve`. Auth includes `HasApiTokens`, a `personal_access_tokens` migration and a standard `users` table when the schema has none; if `users` lacks `email`/`password` the auth endpoints are skipped with a warning instead of emitting code that cannot run. Column values written by the database (e.g. a trigger) are refreshed on create.
- **README** with the project layout, run steps, and endpoint table.
- **ZIP download**, with an in-panel preview of every generated file.
- **Open in VS Code**: a button saves the project into local `data/generated/` and opens it through `vscode://file`; the bundle includes `.vscode/tasks.json`, `launch.json`, recommended extensions and a `.code-workspace` file. If opening fails (for example on a remote server) it falls back to the ZIP download automatically.
- **Django + DRF** (PostgreSQL): `managed=False` models, serializers, ModelViewSet CRUD, optional TokenAuth, and `migrations/001_init.sql` as the DDL source of truth; composite keys use `CompositePrimaryKey` (Django 5.2+) with explicit detail routes.

مولّد FastAPI يفعّل `PRAGMA foreign_keys=ON` على SQLite ويستخدم `passive_deletes=True`، لذا حذف أب مرتبط بأبناء يُعيد **409** بدل خطأ 500، بينما الحذف النظيف يبقى **204**.
The FastAPI generator enables SQLite `PRAGMA foreign_keys=ON` and uses `passive_deletes=True`, so deleting a parent that still has children returns **409** instead of a 500, while a clean delete still returns **204**.

### من SQL مباشرةً — صفحة مستقلة
### Paste SQL → Backend — standalone page

من الشريط الجانبي: **Backend** (`SQL→API`). الصق `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX` أو ارفع ملف `.sql` (حتى 2MB و100 جدول)، فيُحلَّل النص **نصياً بلا تنفيذ**، وتظهر الجداول والأعمدة والعلاقات والقيود والفهارس قبل التوليد.
From the sidebar: **Backend** (`SQL→API`). Paste `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX` or upload a `.sql` file (up to 2MB / 100 tables). The text is parsed **statically, never executed**, and the detected tables, columns, relations, constraints and indexes are previewed before generation.

- **اكتشاف اللهجة**: MySQL / PostgreSQL / SQLite مع درجة ثقة وأسباب. عند إشارات متعارضة (مثل `JSONB` مع `ENGINE=`) يظهر تحذير ولا يُفشَل التوليد؛ وعند غموض حقيقي يُطلب تأكيد صريح قبل المتابعة.
- **قاعدة التوجيه**: MySQL → Laravel، وPostgreSQL/SQLite → FastAPI، وأي اختيار يدوي يتغلّب دائماً. السبب يُسجَّل في `README` و`MANIFEST.json`.
- **الفهارس وViews وTriggers**: تُستخرج `CREATE INDEX` و`CREATE VIEW` و`CREATE TRIGGER` من كود SQL، وتُعرض أعدادها في المعاينة، ثم تُنقل إلى ترحيلات Laravel وFastAPI وPDO؛ ومنها Migration مستقل `create_views_and_triggers` في Laravel. يدعم المحلّل أجسام Triggers ذات `BEGIN…END` وتعليمات `DELIMITER` المخصّصة. الـTrigger المكتوب لمحرّك آخر (مثل `SET NEW.col` في MySQL مع هدف SQLite) يُستبعد من الترحيل مع تحذير بدل إفشال `php artisan migrate`. قيود CHECK على SQLite تُوثَّق في الترحيل وتُحذر لأن إضافتها بعد إنشاء الجدول غير مدعومة.
- **الحالات الحدية**: جدول بلا مفتاح أساسي يُولَّد مع تحذير ونقاط وصول list/create فقط، الأنواع غير المدعومة تُحوَّل إلى `TEXT` مع تعليق وتحذير، والمفاتيح الأجنبية الدائرية تُضاف في **مرحلة ترحيل ثانية** (`ALTER TABLE ... ADD CONSTRAINT` أو ترحيل Laravel مؤجَّل) بدل كسر ترتيب الإنشاء.

- **Dialect detection** with confidence and reasons. Conflicting signals (e.g. `JSONB` with `ENGINE=`) warn without failing; genuinely ambiguous schemas require an explicit confirmation before generation.
- **Routing rule**: MySQL → Laravel, PostgreSQL/SQLite → FastAPI, and any manual choice always wins. The reason is recorded in `README` and `MANIFEST.json`.
- **Indexes, views and triggers**: `CREATE INDEX`, `CREATE VIEW` and `CREATE TRIGGER` are parsed, counted in the preview, and carried into Laravel, FastAPI and PDO migrations — Laravel gets a dedicated `create_views_and_triggers` migration. The parser handles `BEGIN…END` trigger bodies and custom `DELIMITER` directives. A trigger written for another engine (e.g. MySQL `SET NEW.col` targeting SQLite) is left out of the migration with a warning instead of failing `php artisan migrate`; CHECK constraints that SQLite cannot add after table creation are documented and flagged.
- **Edge cases**: a table without a primary key is generated with a warning and list/create endpoints only; unsupported types map to `TEXT` with a comment and warning; circular foreign keys are added in a **second migration phase** (`ALTER TABLE ... ADD CONSTRAINT` or a deferred Laravel migration) instead of breaking creation order.

### واجهة الدمج API Contract
### API Contract

كل النقاط تتطلب الجلسة (Bearer/cookie) وتعيد JSON، وتعمل داخل الخادم على نفس المحلّل والمولّد المستخدمين في الواجهة.
All endpoints require the platform session (Bearer/cookie), return JSON, and run on the same parser and generator as the UI.

| المسار Route | الطريقة Method | الغرض Purpose |
|---|---|---|
| `/api/v1/generations` | POST | إنشاء عملية (202) مع دعم `Idempotency-Key` و`framework` اختياري (`fastapi` · `django` · `laravel` · `pdo`) |
| `/api/v1/generations/:id` | GET | الحالة والتقدّم وقرار التوجيه |
| `/api/v1/generations/:id/preview` | GET | الجداول والعلاقات والملاحظات قبل التحميل |
| `/api/v1/generations/:id/files` | GET | جرد الملفات أو محتوى ملف واحد (`?path=`) |
| `/api/v1/generations/:id/download` | GET | حزمة ZIP جاهزة |
| `/api/v1/sql/validate` | POST | تحقق فوري واكتشاف لهجة أثناء الكتابة |
| `/api/backend/materialize` | POST | حفظ المشروع المولَّد محلياً وإرجاع رابط فتحه في VS Code (loopback + جلسة فقط) |

- رموز الخطأ ثابتة: `INVALID_SQL` (400)، `UNSUPPORTED_DIALECT` (422)، `NEEDS_DIALECT_CONFIRMATION` (422)، `SCHEMA_TOO_LARGE` (413)، `RATE_LIMITED` (429)، و`AI_UNAVAILABLE` لا يفشل العملية بل يكملها قالبياً.
- **الإثراء الذكي اختياري**: يُرسل التمثيل الوسيط فقط (لا SQL خام) إلى `/api/backend/enrich`، ويُصفّى كل صف مقابل الأعمدة المسموحة، وتُستبعد مفاتيح auto-increment؛ وأي فشل أو انتهاء مهلة يعيد حزمة قالبية كاملة مع إشعار.
- **Optional AI enrichment**: only the intermediate representation (never raw SQL) goes to `/api/backend/enrich`; every row is filtered against allowed columns and auto-increment keys are dropped. Any failure or timeout still returns a complete template-only package with a notice.

---

### الشجرة المصدرية Source map

| المكوّن Component | الملف File |
|---|---|
| كشف العلامات والأنواع Hint & type parsing | `src/utils/drawioImporter.ts` |
| الاقتراحات الذكية Smart suggestions | `src/utils/constraintInference.ts` |
| التوليد للخمس لهجات FK/schema generation | `src/utils/ddlGenerator.ts` |
| محرّر القيود والشرائح Constraint editor UI | `src/features/schemadesigner/SchemaDesignerPage.tsx` |
| محرّر الفهارس والعروض والـTriggers Index/view/trigger editor UI | `src/features/schemadesigner/SchemaObjectsPanel.tsx` |
| اقتراحات الكائنات الذكية Smart schema-object suggestions | `src/utils/schemaObjectSuggestions.ts` |
| معاينة ERD المرئية Visual ERD preview | `src/features/schemadesigner/ErdPreview.tsx` |
| صفحة SQL→Backend المستقلة Standalone SQL→Backend page | `src/features/schemadesigner/BackendFactoryPage.tsx` |
| محلّل SQL DDL واكتشاف اللهجة Static SQL DDL parser & dialect detection | `src/utils/sqlSchemaParser.ts` |
| نقاط الدمج API contract | `server.ts` (`/api/v1/generations`, `/api/v1/sql/validate`, `/api/backend/materialize`) |
| لوحة مصنع الـBackend Backend Factory UI | `src/features/schemadesigner/BackendFactoryPanel.tsx` |
| تحليل السكيمّا واختيار التقنية Schema analysis & stack selection | `src/utils/backendCodegen/model.ts` |
| مولّدات FastAPI / Django / Laravel / PDO Generators | `src/utils/backendCodegen/pythonFastapi.ts` · `django.ts` · `phpLaravel.ts` · `phpPdo.ts` |
| هيكل Laravel القابل للتشغيل + مساعدات المصادقة/الـTriggers Runnable Laravel scaffold & auth/trigger helpers | `src/utils/backendCodegen/laravelScaffold.ts` |
| كاتب ZIP بلا اعتماديات Dependency-free ZIP writer | `src/utils/zipStore.ts` |
