/**
 * draw.io Importer — محلل مخططات ER القادمة من draw.io (diagrams.net)
 * ---------------------------------------------------------------
 * المهمة: يأخذ نص ملف .drawio / .xml (بأي صيغة حفظ يدعمها draw.io):
 *   1) XML خام                        → "<mxfile ..><diagram>.."
 *   2) XML مضغوط (URL-encoded deflate) → "<mxfile ..><diagram>1Z..."
 *   3) عدة صفحات (Multiple diagrams)  → تُدمج جداول كل الصفحات
 * ويستخرج: الجداول (tables) — الأعمدة (columns) — المفتاح الأساسي (PK) —
 * العلاقات (relationships) مع نوعها (cardinality: 1-1 / 1-N / N-M) —
 * ثم يعيد نموذجاً منطقياً ErModel يُغذّى في مولّد DDL.
 *
 * الأشكال المدعومة من الرسم:
 *   • shape=table + shape=tableRow + shape=partialRectangle (نمط ER الرسمي من draw.io)
 *   • swimlane/stackContainer = صناديق الأصناف UML (+ private/public)
 *   • أي حاوية container=1/childLayout تحتوي تسميات أعمدة بنمط "name : TYPE"
 *   • حواف ER: startArrow/endArrow = ERone/ERmany
 *   • حواف بقيم "0..*" أو "1..1" أو "parent/child"
 */

export type ErColumn = {
  name: string;
  /** النوع الخام كما ورد في المخطط (قد يُترك فارغاً) */
  type: string;
  isPrimaryKey: boolean;
  /** FK معلَم نصياً في التسمية — مكتشف بوسم (fk)/<<FK>>/foreign key/references قبل الاعلاقات الرسومية */
  isForeignKey?: boolean;
  /** PK فقط يُفرض NOT NULL تلقائياً؛ البقية تُترك NULL لتجنب فرض تقييد لم يطلبه المصمم */
  isNullable: boolean;
  isUnique?: boolean;
  defaultValue?: string;
};

export type ErTable = {
  id: string;
  name: string;
  columns: ErColumn[];
  /** فهارس صفحات الظهور (multiple diagrams) — تُملأ حتى للملفات أحادية الصفحة */
  pages?: number[];
};

export type ErCardinality = '1-1' | '1-N' | 'N-M';

export type ErRelationship = {
  id: string;
  sourceTable: string;
  targetTable: string;
  sourceColumn?: string;
  targetColumn?: string;
  cardinality: ErCardinality;
  /** فهرس الصفحة التي وُجدت فيها الحافة — للملفات أحادية الصفحةه = [0] */
  pages?: number[];
};

export type ErModel = {
  diagramNames: string[];
  tables: ErTable[];
  relationships: ErRelationship[];
  warnings: string[];
};

/** خطأ صيغة ملف لا يمكن الاستمرار بدونه (مختلف عن تحذير تجاهُل خلية) */
export class DrawioParseError extends Error {}

interface RawCell {
  id: string;
  parent: string;
  value: string;
  style: string;
  isEdge: boolean;
  source?: string;
  target?: string;
  isVertex: boolean;
}

// ---------------------------------------------------------------------------
// أدوات نصية
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&amp;': '&',
};

/** فك ترميز كيانات XML في نص قيمة الخلية */
export function decodeEntities(text: string): string {
  let out = text;
  for (const key of Object.keys(ENTITIES)) {
    if (key !== '&amp;') out = out.split(key).join(ENTITIES[key]);
  }
  return out.split('&amp;').join('&');
}

/** إزالة ترميز HTML المضمّن في تسميات draw.io (<b style..>, <br>) مع الحفاظ على السطر */
function stripInlineHtml(label: string): string {
  return label
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(?!br\b)[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function decodeStyleAttr(style: string): string {
  return decodeEntities(style || '');
}

// ---------------------------------------------------------------------------
// فك ضغط مخططات draw.io المضغوطة (URL-encoded deflate / deflate خام / base64)
// ---------------------------------------------------------------------------

async function inflateBytes(bytes: Uint8Array, format: 'deflate-raw' | 'deflate'): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new DrawioParseError(
      'This browser cannot decompress .drawio files (DecompressionStream missing). Save the file as "Uncompressed XML" from draw.io or use a modern browser.'
    );
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

async function inflateRawBytes(bytes: Uint8Array): Promise<string> {
  return inflateBytes(bytes, 'deflate-raw');
}

/** هل يشبه النص مخطط draw.io؟ (بعد أي فك ضغط/فك ترميز) */
export function looksLikeDrawioXml(text: string): boolean {
  return text.includes('<mxfile') || text.includes('<mxGraphModel') || /<diagram\b/.test(text);
}

function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * يحاول فك ضغط نص مخطط الصفحة حتى تصبح XML. يستسلم فوراً إن أشار النص إلى XML.
 * ترتيب المحاولات يعكس صيغ الحفظ الفعلية في draw.io:
 *   1) URL-encoded deflate ("1Z..." بعد decodeURIComponent)
 *   2) deflate خام بصيغة نص رمزي (to:'string')
 *   3) Base64
 */
async function decompressDiagramContent(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) return trimmed;

  const tryPipelines: Array<() => Promise<string>> = [];

  if (trimmed.includes('%')) {
    tryPipelines.push(async () => {
      // unescape (latin1) مثل draw.io تماماً
      const latin = decodeURIComponent(trimmed);
      return inflateRawBytes(latin1ToBytes(latin));
    });
  }

  tryPipelines.push(async () => inflateRawBytes(latin1ToBytes(trimmed)));

  tryPipelines.push(async () => {
    const bin = atob(trimmed);
    return inflateRawBytes(latin1ToBytes(bin));
  });

  let lastError: unknown = null;
  for (const pipeline of tryPipelines) {
    try {
      const xml = await pipeline();
      if (xml.includes('<mxGraphModel') || xml.includes('<mxCell')) return xml;
      lastError = new DrawioParseError('Compressed diagram did not inflate into mxGraphModel XML');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof DrawioParseError
    ? lastError
    : new DrawioParseError(
        'Unrecognized draw.io document format. Export again with File ▸ Save as ▸ "Uncompressed XML", or upload the .xml/.drawio file directly.'
      );
}

// ---------------------------------------------------------------------------
// صور التصدير من draw.io — استخراج XML المخطط المضمّن في PNG و SVG
// стиле التصدير الرسمي: خيار "Include a copy of my diagram" يضمّن نسخة كاملة:
//   • PNG → chunk من نوع zTXt / iTXt / tEXt بخانة (keyword) اسمها "mxfile"
//   • SVG → الخاصية content على الوسم الجذري <svg> (XML مرمّز URL)
// ---------------------------------------------------------------------------

/** كتابة نصوص ثنائية لل chunk (كل بايت حرف لاتيني 0..255) — نفس أسلوب latin1ToBytes عكسياً */
function chunkLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** فك ضغط نص chunk: draw.io يستخدم deflate خام (deflateRaw) وبعض الأدوات تستخدم zlib الكامل */
async function inflateChunkData(bytes: Uint8Array): Promise<string> {
  try {
    const raw = await inflateBytes(bytes, 'deflate-raw');
    if (looksLikeDrawioXml(raw)) return raw;
  } catch { /* نجرّب المسار التالي */ }
  return inflateBytes(bytes, 'deflate');
}

async function decodePngTextChunk(type: string, payload: Uint8Array): Promise<string | null> {
  const nullPos = payload.indexOf(0);
  if (nullPos <= 0) return null;
  const keyword = chunkLatin1(payload.subarray(0, nullPos)).toLowerCase();
  if (!(keyword === 'mxfile' || keyword.includes('mxfile') || keyword.includes('mxgraph'))) return null;

  if (type === 'tEXt') {
    return new TextDecoder('utf-8', { fatal: false }).decode(payload.subarray(nullPos + 1));
  }
  if (type === 'zTXt') {
    // [keyword] 0x00 [compressionMethod=0] [deflate data...]
    return inflateChunkData(payload.subarray(nullPos + 2));
  }
  // iTXt: [keyword] 0x00 [flag] [method] [language tag] 0x00 [translated keyword] 0x00 [text]
  let cursor = nullPos + 1;
  const flag = payload[cursor] ?? 0;
  const method = payload[cursor + 1] ?? 0;
  cursor += 2;
  const skipNullField = () => {
    while (cursor < payload.length && payload[cursor] !== 0) cursor++;
    cursor++; // تخطّي ال 0x00 نفسه
  };
  skipNullField(); // language tag
  skipNullField(); // translated keyword
  const body = payload.subarray(cursor);
  if (flag === 1 && method === 0) return inflateChunkData(body);
  return new TextDecoder('utf-8', { fatal: false }).decode(body);
}

/**
 * يستخرج XML مخطط draw.io المضمّن في ملف PNG (ناتج "Export as PNG" مع تضمين النسخة).
 * يعيد null إن لم يجد مخططاً مضمّناً (صورة عادية بلا metadata).
 */
export async function extractDrawioXmlFromPng(data: ArrayBuffer | Uint8Array): Promise<string | null> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // التوقيع: 89 50 4E 47 0D 0A 1A 0A
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isPng) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = chunkLatin1(bytes.subarray(pos + 4, pos + 8));
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (len > bytes.length || dataEnd + 4 > bytes.length) break; // chunk تالف — نكفّ
    if (type === 'zTXt' || type === 'iTXt' || type === 'tEXt') {
      try {
        const text = await decodePngTextChunk(type, bytes.subarray(dataStart, dataEnd));
        if (text && looksLikeDrawioXml(text)) return text;
      } catch { /* chunk تالف — نتابع البحث */ }
    }
    pos = dataEnd + 4; // + CRC
  }
  return null;
}

/**
 * يستخرج XML مخطط draw.io من ملف SVG (ناتج "Export as SVG" مع تضمين النسخة):
 *   1) الخاصية content على الوسم الجذري <svg> — XML مرمّز URL
 *   2) نسخة mxfile مضمّنة داخل نص SVG مباشرة (مهما كان ترميز الكيانات)
 * يعيد null إن لم يجد شيئاً.
 */
export function extractDrawioXmlFromSvg(svgText: string): string | null {
  // 1) الخاصية content="..." أو content='...'
  const attrMatch =
    svgText.match(/<svg\b[^>]*?\scontent="([^"]*)"/i) || svgText.match(/<svg\b[^>]*?\scontent='([^']*)'/i);
  if (attrMatch) {
    try {
      const decoded = decodeURIComponent(attrMatch[1].replace(/&amp;/g, '&'));
      if (looksLikeDrawioXml(decoded)) return decoded;
    } catch { /* ترميز غير قياسي — نجرب المسار 2 */ }
  }

  // 2) mxfile / mxGraphModel مضمّن داخل SVG نفسه (مهما كان ترميز الكيانات)
  const unescaped = svgText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const fileStart = unescaped.indexOf('<mxfile');
  if (fileStart !== -1) {
    const fileEnd = unescaped.indexOf('</mxfile>', fileStart);
    if (fileEnd !== -1) return unescaped.slice(fileStart, fileEnd + '</mxfile>'.length);
    return unescaped.slice(fileStart); // نسخة ملخّصة بلا وسم إغلاق
  }
  const modelStart = unescaped.indexOf('<mxGraphModel');
  if (modelStart !== -1) {
    const modelEnd = unescaped.indexOf('</mxGraphModel>', modelStart);
    if (modelEnd !== -1) {
      return `${unescaped.slice(modelStart, modelEnd + '</mxGraphModel>'.length)}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// قراءة خلايا mxCell من XML نصي (بدون DOM — يجعل الاختبارات تعمل على Node مباشرة)
// ---------------------------------------------------------------------------

function extractAttributes(tagText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagText))) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

function parseCells(xml: string): RawCell[] {
  const cells: RawCell[] = [];
  const cellRe = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell\s*>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(xml))) {
    const attrs = extractAttributes(match[1]);
    cells.push({
      id: attrs.id ?? '',
      parent: attrs.parent ?? '',
      value: attrs.value ?? '',
      style: decodeStyleAttr(attrs.style ?? ''),
      isEdge: attrs.edge === '1',
      source: attrs.source || undefined,
      target: attrs.target || undefined,
      isVertex: attrs.vertex === '1',
    });
  }
  return cells;
}

/** كل وسوم <diagram ...> name="..." مع النص داخلها */
function splitDiagrams(xml: string): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  const diagramRe = /<diagram\b([^>]*?)(?:\/>|>([\s\S]*?)<\/diagram\s*>)/g;
  let match: RegExpExecArray | null;
  while ((match = diagramRe.exec(xml))) {
    const attrs = extractAttributes(match[1]);
    out.push({ name: decodeEntities(attrs.name ?? ''), content: match[2] ?? '' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// استخراج الأعمدة والجداول من شجر الخلايا
// ---------------------------------------------------------------------------

/** هل الخلية حاوية "جدول"؟ يشمل شكل ER الرسمي وصناديق UML والحاويات المخصصة */
export function looksLikeTableContainer(cell: { style: string; isEdge?: boolean; isVertex?: boolean }, childCount: number): boolean {
  if (cell.isEdge || cell.isVertex === false) return false;
  if (childCount < 1) return false;
  if (/shape=table\b|childLayout=tableLayout/.test(cell.style)) return true;
  if (/container=1|childLayout=stackContainer|childLayout=horizontalStack|childLayout=verticalStack/.test(cell.style)) return true;
  if (/\bswimlane\b/.test(cell.style)) return true;
  return false;
}

/** فكّ تسمية عمود نصية إلى {name,type,markers} — يتعامل مع "id : INT" و"+ name : varchar(255) {PK}" */
export function parseColumnLabel(rawLabel: string): { name: string; type: string; markerPk: boolean; markerFk: boolean; required: boolean } {
  // فكّ كيانات XML أولاً حتى تسميات HTML المسرّبة (نمط UML العمودي في draw.io)
  // تُقطّع وتُزال أوسمها كي ينجح فصل الاسم/النوع واكتشاف العلامات
  const decoded = decodeEntities(rawLabel);
  // تطبيع تدوين الكورد UML <<..>> إلى «..» قبل تنزيف الوسوم HTML
  // حتى لا يلتهمه مُزيل الوسوم كوسم وهمي فيضيع توكن PK
  const normalized = decoded.replace(/<<\s*(.*?)\s*>>/g, '«$1»');
  const cleaned = stripInlineHtml(normalized).replace(/[\u2013\u2014]/g, '-');

  // إشارات HTML داخل التسمية (قبل إزالتها):
  //   • <u> / text-decoration:underline → اصطلاح UML القياسي: السطر المسطّّر = مفتاح أساسي
  //   • <b>/<strong>/font-weight:bold   → نفس المنطق المتبع مع fontStyle=1 في قالب draw.io ER الرسمي
  const htmlUnderline = /<u\b/i.test(decoded) || /text-decoration[^;"]*underline/i.test(decoded);
  const htmlBold = /<(?:b|strong)\b/i.test(decoded) || /font-weight[^;"]*bold/i.test(decoded);

  let text = cleaned
    .replace(/^[\s.]*[+]\s*/, '') // بادئة UML "+"
    .replace(/\s+/g, ' ')
    .trim();

  // علامات الأدوار المضمّنة + التوكنات الوسطية (بحدود كلمات) — تُكتشف قبل الإزالة:
  //   «pk» ، <<PK>> ، (pk) ، {pk} ، [pk] ، #pk ، ^pk ، pk وسط النص ، primary key ، p.k.
  const markerPk =
    htmlUnderline ||
    htmlBold ||
    /(?:[({[]|[#^])\s*(?:pk|primary\s*key)\s*(?:[)}\]])?/i.test(text) ||
    /<<\s*p\.?k\.?\s*>>/i.test(text) ||
    /«[^»]*\bp\.?k\.?\b[^»]*»/i.test(text) ||
    /\bp\.?k\.?\b/i.test(text) ||
    /\bprimary\s+key\b/i.test(text);

  // علامات FK الوسطية بنفس المنهج: (fk)/{fk}/[#fk] ، <<FK>>/«fk» ، توكن وسطي fk/f.k. ،
  // foreign key ، أو references <table> بنمط DDL — بحدود كلمات لتفادي الإنذارات الكاذبة (fedk, fk2, fkey? لا)
  const markerFk =
    /(?:[({[]|[#^])\s*(?:fk|foreign\s*key)\s*(?:[)}\]])?/i.test(text) ||
    /«[^»]*\bf\.?k\.?\b[^»]*»/i.test(text) ||
    /\bf\.?k\.?\b/i.test(text) ||
    /\bforeign\s+key\b/i.test(text) ||
    /\breferences?\b/i.test(text);

  // الإلزام بالحدود المفتاحية: أقواس مليئة بعلامات، أو توكن وسطي، أو نجمة محاذاة
  const required =
    /(?:[({[])\s*(?:nn|not\s*null|required)\s*[)}\]]?/i.test(text) ||
    /(?:^|[\s,;])\*/.test(cleaned) ||
    /\bnn\b/i.test(text) ||
    /\bnot\s+null\b/i.test(text) ||
    /\brequired\b/i.test(text);

  text = text
    .replace(/[({[]\s*(?:pk|primary\s*key|nn|not\s*null|required|fk|foreign\s*key)[^()\]}]*[)\]}]/gi, '') // مجموعات العلامات حتى القوائم (pk, nn, fk)
    .replace(/\{[^}]*\}/g, '')
    .replace(/[#^]\s*(pk|primary\s*key|fk|foreign\s*key)/gi, '') // علامات على شكل #pk / #fk
    .replace(/\breferences?\s+[\w$]+(?:\s*\([^)]*\))?/gi, '') // بيد DDL: references users(id) تُولاها كاملة
    .replace(/<<\s*(?:p\.?k\.?|f\.?k\.?)\s*>>/gi, '')
    .replace(/«[^»]*»/g, '')
    .replace(/^[*#+-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // إزالة التوكنات الوسطية المتبقية (pk / p.k. / primary key / not null / nn).
  // إذا أنتجت الإزالة نصاً يبدأ بفاصل أو فارغاً تماماً، يبقى النص الأصلي كما هو:
  const scraped = text
    .replace(/\b(?:p\.?k\.?|primary\s+key|f\.?k\.?|foreign\s+key|references?)\b/gi, ' ')
    .replace(/\b(?:nn|not\s+null|required)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const strippedUsable = scraped.length > 0 && /^[\w$]/.test(scraped) ? scraped : text;
  text = strippedUsable;

  let name = '';
  let type = '';
  // "name : TYPE" (الفاصل المفضل في draw.io) أو "name: type"
  const colonMatch = text.match(/^([\w$][\w$]*)\s*[:|]\s*(.+)$/);
  if (colonMatch) {
    name = colonMatch[1];
    type = colonMatch[2].trim();
  } else {
    // "name type" — الاسم كلمة أولى وكلمة ثانية نوع
    const spaceMatch = text.match(/^([\w$][\w$]*)\s+(.+)$/);
    if (spaceMatch) {
      name = spaceMatch[1];
      type = spaceMatch[2].trim();
    } else {
      name = text; // عمود بدون نوع
    }
  }
  return { name: name.trim(), type: type.trim(), markerPk, markerFk, required };
}

function styleIndicatesPrimaryKey(style: string, parentRowStyle?: string): boolean {
  const fontStyle =
    Number(style.match(/fontStyle=(\d+)/)?.[1] ?? parentRowStyle?.match(/fontStyle=(\d+)/)?.[1] ?? 0) || 0;
  // bold (1) أو underline (4) أو الاثنان معاً (5) إشارات الترميز المعتادة للمفتاح الأساسي
  return (fontStyle & 1) !== 0 || (fontStyle & 4) !== 0;
}

// ---------------------------------------------------------------------------
// المحرّك الرئيسي
// ---------------------------------------------------------------------------

function parseDiagramXml(xml: string, model: ErModel, pageIndex: number): void {
  const cells = parseCells(xml);
  if (cells.length === 0) return;

  const cellMap = new Map<string, RawCell>();
  for (const cell of cells) if (cell.id) cellMap.set(cell.id, cell);
  const byId = new Map<string, RawCell>(cellMap);

  // شجرة الأبناء
  const childrenOf = new Map<string, RawCell[]>();
  for (const cell of cells) {
    if (!cell.parent) continue;
    const list = childrenOf.get(cell.parent) ?? [];
    list.push(cell);
    childrenOf.set(cell.parent, list);
  }

  // 1) كشف حاويات الجداول
  const isTable = new Set<string>();
  for (const cell of cells) {
    if (cell.isEdge) continue;
    if (looksLikeTableContainer(cell, (childrenOf.get(cell.id) ?? []).length)) {
      isTable.add(cell.id);
      continue;
    }
    // احتياط UML العمودي: مستطيل بسيط (بلا shape=table) يحولّي بEngineering ابنين بنمط "الاسم : النوع"
    const children = (childrenOf.get(cell.id) ?? []).filter(c => !c.isEdge);
    if (children.length >= 2 && children.filter(c => /:/.test(decodeEntities(c.value))).length >= 2) {
      isTable.add(cell.id);
    }
  }

  // 2) استخراج أعمدة أبناء الجداول (بعمق ثابت)
  for (const cell of cells) {
    if (!isTable.has(cell.id)) continue;

    const descendants: RawCell[] = [];
    const collectDescendants = (parentId: string, depth: number) => {
      if (depth > 3) return;
      for (const child of childrenOf.get(parentId) ?? []) {
        descendants.push(child);
        collectDescendants(child.id, depth + 1);
      }
    };
    collectDescendants(cell.id, 0);

    const tableName = decodeEntities(cell.value).trim();
    const tableEntry: ErTable = { id: cell.id, name: tableName, columns: [], pages: [pageIndex] };

    for (const descendant of descendants) {
      if (descendant.isEdge || !descendant.value.trim()) continue;
      // لا نخرج الأعمدة من حاويات فرعية داخلية
      if (looksLikeTableContainer(descendant, (childrenOf.get(descendant.id) ?? []).length)) continue;
      const parent = byId.get(descendant.parent);
      // bold الحاوية (اسم الجدول فقط لا يرقى إلى PK لكل الأعمدة — نمط UML العمودي)
      const parentRowStyle = parent && isTable.has(parent.id) ? undefined : parent?.style;
      const parsed = parseColumnLabel(descendant.value);
      if (!parsed.name) continue;
      // تجاهل تكرار التسمية العامة للجدول نفسه
      if (parsed.name.toLowerCase() === tableName.toLowerCase()) continue;

      const pkByStyle = styleIndicatesPrimaryKey(descendant.style, parentRowStyle);
      const col: ErColumn = {
        name: parsed.name,
        type: parsed.type,
        isPrimaryKey: parsed.markerPk || pkByStyle,
        // FK علمنا في التسمية فقط (العلاقة الرسومية تستمر تعذرها على مستوى العرض في ErdPreview)
        ...(parsed.markerFk ? { isForeignKey: true } : {}),
        isNullable: !(parsed.markerPk || pkByStyle || parsed.required),
      };
      if (tableEntry.columns.some(c => c.name.toLowerCase() === col.name.toLowerCase())) continue;
      tableEntry.columns.push(col);
    }

    model.tables.push(tableEntry);
  }

  // دمج أجزاء نفس الجدول (مرات متعددة بنفس الاسم ناتجة عن صفحات منسوخة)
  const merged = new Map<string, ErTable>();
  const mergedOut: ErTable[] = [];
  for (const table of model.tables) {
    const key = (table.name || table.id).toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      for (const col of table.columns) {
        if (!existing.columns.some(c => c.name.toLowerCase() === col.name.toLowerCase())) existing.columns.push(col);
      }
      // إتحاد صفحات الظهور في النسخة المدمجة
      const pageUnion = new Set<number>([...(existing.pages ?? []), ...(table.pages ?? [])]);
      existing.pages = Array.from(pageUnion).sort((a, b) => a - b);
    } else {
      merged.set(key, table);
      mergedOut.push(table);
    }
  }
  model.tables = mergedOut;

  // 2.5) تعزيز الافتراضات: إن لم يُعلَم أي عمود كمفتاح أساسي، ترقية أول عمود اسمه id
  for (const table of model.tables) {
    if (table.columns.some(c => c.isPrimaryKey)) continue;
    const idColumn = table.columns.find(c => /^id$/i.test(c.name.toLowerCase()));
    if (idColumn) {
      idColumn.isPrimaryKey = true;
      idColumn.isNullable = false;
    } else {
      model.warnings.push(`Table "${table.name}": no primary key detected (name the first column "id" to promote it).`);
    }
  }

  // 3) العلاقات (حواف ER)
  const resolveCellToTable = (cellId: string | undefined): { tableId?: string; table?: ErTable; column?: string } => {
    if (!cellId) return {};
    let walker: string | undefined = cellId;
    let seen = 0;
    while (walker && seen++ < 8) {
      const cur = byId.get(walker);
      if (!cur) return {};
      if (isTable.has(cur.id)) {
        // مطابقة بالمعرّف أولاً؛ وإن كان الجدول دُمج عبر الصفحات (معرّف الصفحة مختلفة) فبالاسم
        const tableById = model.tables.find(t0 => t0.id === cur.id);
        const table =
          tableById ??
          (cur.value.trim()
            ? model.tables.find(t0 => t0.name.toLowerCase() === decodeEntities(cur.value).trim().toLowerCase())
            : undefined);
        if (!table) return {};
        return { tableId: table.id, table };
      }
      walker = cur.parent;
    }
    return {};
  };

  for (const edge of cells) {
    if (!edge.isEdge) continue;
    const source = resolveCellToTable(edge.source);
    const target = resolveCellToTable(edge.target);
    if (!source.table || !target.table) {
      model.warnings.push(`Ignored edge with unresolved source/target: "${edge.value || edge.id}"`);
      continue;
    }
    if (source.tableId === target.tableId) {
      model.warnings.push(`Ignored self-referencing edge on table "${source.table.name}".`);
      continue;
    }

    // إن كانت الحافة موصولة إلى خلية عمود (وليست الرأس) استخرج اسم العمود من أصله
    const columnOf = (cellId: string | undefined, table: ErTable): string | undefined => {
      if (!cellId) return undefined;
      let walker: RawCell | undefined = byId.get(cellId);
      while (walker) {
        if (walker.id === table.id) return undefined;
        const parsed = parseColumnLabel(walker.value);
        if (parsed.name) {
          const match = table.columns.find(c => c.name.toLowerCase() === parsed.name.toLowerCase());
          if (match) return match.name;
        }
        walker = walker.parent ? byId.get(walker.parent) : undefined;
      }
      return undefined;
    };

    model.relationships.push({
      id: edge.id,
      sourceTable: source.table.id,
      targetTable: target.table.id,
      sourceColumn: columnOf(edge.source, source.table),
      targetColumn: columnOf(edge.target, target.table),
      cardinality: parseEdgeCardinality(edge, byId.get(edge.id)?.value ?? ''),
      pages: [pageIndex],
    });
  }

  // 4) تنظيف: جداول بلا أعمدة = تحذير
  for (const table of model.tables) {
    if (table.columns.length === 0) model.warnings.push(`Table "${table.name || table.id}" has no column labels discovered.`);
  }
}

/** اقرأ نوع العلاقة من نمط الحافة (أشكال ER) أو قيمتها النصية "0..*" / "1..1" */
function parseEdgeCardinality(edge: RawCell, defaultValue = ''): ErCardinality {
  const value = `${defaultValue} ${edge.value || ''}`.toLowerCase();
  const style = edge.style || '';
  const startArrow = (style.match(/startArrow=([A-Za-z]+)/)?.[1] ?? '').toLowerCase();
  const endArrow = (style.match(/endArrow=([A-Za-z]+)/)?.[1] ?? '').toLowerCase();
  const isOne = (arrow: string): boolean =>
    arrow === 'one' || arrow === 'erone' || arrow === 'erzeroToOne' || arrow === 'eroneToManyStart';
  const isMany = (arrow: string): boolean => arrow.includes('many');

  if (/many[^0-9]*many|n\s*\.\.\s*m|many-to-many/.test(value)) return 'N-M';
  if (/1\s*\.\.\s*1|one-to-one/.test(value)) return '1-1';
  if (/parent\s*child|parentchild/.test(style)) return '1-N';
  // قيمة نصية كـ "0..* on child" إلخ
  if (/\*|zero\.\./.test(value) && !/1\s*\.\.\s*1/.test(value)) return '1-N';

  if (isMany(endArrow) && isOne(startArrow)) return '1-N';
  if (isMany(startArrow) && isOne(endArrow)) return 'N-M';
  if (isMany(startArrow) && isMany(endArrow)) return 'N-M';
  if (isOne(startArrow) && isOne(endArrow)) return '1-1';
  return '1-N'; // الافتراض الأكثر شيوعاً في مخططات ER
}

// ---------------------------------------------------------------------------
// نقطة الدخول العامة
// ---------------------------------------------------------------------------

export async function parseDrawioFile(fileText: string): Promise<ErModel> {
  const outerXml = fileText.toString().trim();
  if (!outerXml) throw new DrawioParseError('The uploaded file is empty.');

  const model: ErModel = { diagramNames: [], tables: [], relationships: [], warnings: [] };

  const diagrams = splitDiagrams(outerXml);
  const pages = diagrams.length > 0 ? diagrams : [{ name: '', content: outerXml }];

  for (let i = 0; i < pages.length; i++) {
    const { name, content } = pages[i];
    model.diagramNames.push(name || `Page ${i + 1}`);
    let innerXml: string;
    try {
      innerXml = await decompressDiagramContent(content);
    } catch (err) {
      model.warnings.push(`Page "${name || i + 1}": skipped — ${(err as Error).message}`);
      continue;
    }
    parseDiagramXml(innerXml, model, i);
  }

  if (model.tables.length === 0) {
    throw new DrawioParseError(
      'No tables recognized in this draw.io diagram. Use the official ER table shape (shape=table) or label columns with the "name : TYPE" pattern inside a container box.'
    );
  }
  return model;
}
