/**
 * كاتب ZIP بسيط بطريقة STORE (بلا ضغط) — كافٍ لمشاريع الكود المولّدة
 * ويُفتح في كل الأدوات (Windows Explorer, macOS Archive Utility, unzip).
 * لا تبعيات خارجية.
 */

export interface ZipEntry {
  /** مسار نسبي بفواصل مائلة */
  path: string;
  content: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, date: day };
}

/** بناء ZIP كامل في الذاكرة — الملفات صغيرة (< 10MB) فالطريقة تناسبها */
export function createZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  type Prepared = { name: Uint8Array; data: Uint8Array; crc: number; offset: number };
  const prepared: Prepared[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path.replace(/\\/g, '/'));
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    prepared.push({ name, data, crc: crc32(data), offset });
    offset += 30 + name.length + data.length;
  }

  const centralSize = prepared.reduce((sum, p) => sum + 46 + p.name.length, 0);
  const out = new Uint8Array(offset + centralSize + 22);
  const view = new DataView(out.buffer);
  let cursor = 0;

  const u16 = (value: number): void => {
    view.setUint16(cursor, value, true);
    cursor += 2;
  };
  const u32 = (value: number): void => {
    view.setUint32(cursor, value >>> 0, true);
    cursor += 4;
  };
  const bytes = (value: Uint8Array): void => {
    out.set(value, cursor);
    cursor += value.length;
  };

  for (const item of prepared) {
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0x0800); // UTF-8 filename
    u16(0); // store
    u16(time);
    u16(date);
    u32(item.crc);
    u32(item.data.length);
    u32(item.data.length);
    u16(item.name.length);
    u16(0); // extra
    bytes(item.name);
    bytes(item.data);
  }

  const centralStart = cursor;
  for (const item of prepared) {
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(item.crc);
    u32(item.data.length);
    u32(item.data.length);
    u16(item.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attrs
    u32(0); // external attrs
    u32(item.offset);
    bytes(item.name);
  }

  const centralEnd = cursor;
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(prepared.length);
  u16(prepared.length);
  u32(centralEnd - centralStart);
  u32(centralStart);
  u16(0); // comment

  return out;
}
