/**
 * #15 — حاجز الخصوصية: كشف البيانات الشخصية قبل أن تخرج من الجهاز.
 *
 * لماذا: تقرير تحليل مليء بأسماء وإيميلات وهواتف هو مصدر خطر قانوني حقيقي.
 * هذه البوابة تُجيب سؤالًا واحدًا بوضوح: «هل يجوز إرسال هذه الصفوف إلى نموذج
 * خارجي؟» — وتُخفي ما لا يجوز تلقائيًّا، مع السماح بمسار محلي بالكامل.
 */

export type PiiKind = 'email' | 'phone' | 'national_id' | 'name' | 'address' | 'ip' | 'iban' | 'credit_card' | 'passport' | 'dob';

export interface PiiFinding {
  column: string;
  kind: PiiKind;
  confidence: number; // 0..1
  matches: number;
  sampleMasked: string;
  /** هل العمود يُرجَّح أنه معرّف شخصي بالكامل (فيجب استبعاده) أم يحتوي فقط. */
  wholeColumn: boolean;
}

export interface GatePolicy {
  /** هل يُسمح بإرسال بيانات شخصية إلى نموذج خارجي؟ */
  allowExternalWithPii: boolean;
  /** أقصى عدد صفوف تُرسل مرة واحدة (لتقليل التعرّض). */
  maxRows: number;
}

export interface GateDecision {
  allowed: boolean;
  reason: string;
  findings: PiiFinding[];
  /** النسخة الآمنة للإرسال (مقنّعة). */
  sanitizedRows: Array<Record<string, unknown>>;
  /** ما استُبعد كليًّا. */
  droppedColumns: string[];
  /** إجراء مطلوب قبل المتابعة. */
  requiredAction: string | null;
}

/**
 * أنماط قاطعة (بريد، IBAN، IP، جواز، بطاقة). الهاتف والرقم الوطني ليسا هنا
 * لأنهما يُقرآن بالسياق: أي رقم من 9 إلى 15 خانة كان يُقرأ هاتفًا، فتُقنَّع
 * الإيرادات وأرقام الطلبات ويصير التحليل خاطئًا بدل أن يكون آمنًا.
 */
const PATTERNS: Array<{ kind: PiiKind; re: RegExp; confidence: number }> = [
  { kind: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]+/i, confidence: 0.97 },
  { kind: 'credit_card', re: /^\s*\d(?:[ -]?\d){12,18}\s*$/, confidence: 0.8 },
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, confidence: 0.85 },
  { kind: 'ip', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, confidence: 0.8 },
  { kind: 'passport', re: /\b[A-Z]{1,2}\d{7,8}\b/, confidence: 0.55 },
  { kind: 'dob', re: /\b(19|20)\d{2}-\d{2}-\d{2}\b/, confidence: 0.4 },
];

const PHONE_HINTS = /(phone|mobile|tel|whatsapp|هاتف|جوال|موبايل|تلفون)/i;
const ID_HINTS = /(national|ssn|identity|هوية|قومي|الرقم الوطني)/i;
/** رقم دولي يبدأ بـ+ أو 00 — قاطع بلا سياق. */
const PHONE_INTL = /(?:\+|00)\s?\d[\d\s-]{7,14}\d/;
/** رقم محلي يبدأ بصفر (شائع في المنطقة) — يُقرأ هاتفًا فقط مع دلالة في الاسم. */
const PHONE_LOCAL = /^0\d{8,11}$/;
const BARE_ID = /^\d{9,14}$/;

/** تحقّق Luhn: يمنع اعتبار أي رقم طويل «بطاقة» لمجرد طوله. */
function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const digitsOf = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

const NAME_HINTS = /(name|اسم|fullname|first_name|last_name|الاسم)/i;
const ADDRESS_HINTS = /(address|عنوان|street|شارع|region|محافظة|governorate)/i;
/**
 * التاريخ العادي ليس بيانات شخصية: عمود «اليوم» في أي سلسلة زمنية يطابق نمط
 * الميلاد حرفيًّا، وتقنيمه يمحو محور الزمن ويجعل الإسناد بلا معنى. لذلك لا
 * يُعتبر «dob» إلا إذا دلّ اسم العمود على الميلاد.
 */
const DOB_HINTS = /(birth|dob|born|ميلاد|مواليد)/i;

function maskValue(value: unknown, kind: PiiKind): string {
  const s = String(value ?? '');
  if (!s) return '';
  if (kind === 'email') {
    const [user, domain] = s.split('@');
    return `${user.slice(0, 2)}***@${domain || '***'}`;
  }
  if (kind === 'phone' || kind === 'national_id' || kind === 'credit_card') {
    return s.length <= 4 ? '***' : `${s.slice(0, 2)}***${s.slice(-2)}`;
  }
  return s.length <= 2 ? '**' : `${s.slice(0, 1)}***${s.slice(-1)}`;
}

/** فحص الأعمدة والقيم: نمط القيمة يتفوّق على اسم العمود، والاسم قرينة مساندة. */
export function detectPii(rows: Array<Record<string, unknown>>): PiiFinding[] {
  if (!rows.length) return [];
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const findings: PiiFinding[] = [];
  for (const column of columns) {
    const values = rows.map((r) => r[column]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (!values.length) continue;
    for (const pattern of PATTERNS) {
      if (pattern.kind === 'dob' && !DOB_HINTS.test(column)) continue;
      const matches = values.filter((v) => {
        const s = String(v).trim();
        if (pattern.kind === 'credit_card') {
          if (!pattern.re.test(s)) return false;
          // مفصولة بشرطات/مسافات = بطاقة صريحة؛ متلاصقة = لازم Luhn.
          return /[ -]/.test(s) || luhnValid(digitsOf(s));
        }
        return pattern.re.test(s);
      }).length;
      const share = matches / values.length;
      if (share >= 0.3) {
        findings.push({
          column,
          kind: pattern.kind,
          confidence: Number((pattern.confidence * (0.6 + 0.4 * share)).toFixed(2)),
          matches,
          sampleMasked: maskValue(values[0], pattern.kind),
          wholeColumn: share >= 0.8,
        });
        break;
      }
    }

    // الأرقام تُقرأ بالسياق: هاتف إن كان الاسم يدلّ عليه أو الرقم دوليًّا،
    // ورقم وطني فقط إن دلّ الاسم. الإيراد 1234567890 لا يُلمس.
    if (!findings.some((f) => f.column === column)) {
      const phoneMatches = values.filter((v) => {
        const s = String(v).trim();
        return PHONE_INTL.test(s) || (PHONE_HINTS.test(column) && PHONE_LOCAL.test(s));
      }).length;
      const phoneShare = phoneMatches / values.length;
      if (phoneShare >= 0.3) {
        findings.push({
          column,
          kind: 'phone',
          confidence: Number((0.65 * (0.6 + 0.4 * phoneShare)).toFixed(2)),
          matches: phoneMatches,
          sampleMasked: maskValue(values[0], 'phone'),
          wholeColumn: phoneShare >= 0.8,
        });
      } else if (ID_HINTS.test(column)) {
        const idMatches = values.filter((v) => BARE_ID.test(String(v).trim())).length;
        const idShare = idMatches / values.length;
        if (idShare >= 0.5) {
          findings.push({
            column,
            kind: 'national_id',
            confidence: Number((0.6 * (0.6 + 0.4 * idShare)).toFixed(2)),
            matches: idMatches,
            sampleMasked: maskValue(values[0], 'national_id'),
            wholeColumn: idShare >= 0.8,
          });
        }
      }
    }
    if (NAME_HINTS.test(column) && !findings.some((f) => f.column === column)) {
      const distinct = new Set(values.map((v) => String(v).trim().toLowerCase())).size;
      findings.push({
        column,
        kind: 'name',
        confidence: distinct / values.length > 0.5 ? 0.8 : 0.5,
        matches: values.length,
        sampleMasked: maskValue(values[0], 'name'),
        wholeColumn: distinct / values.length > 0.5,
      });
    } else if (ADDRESS_HINTS.test(column) && !findings.some((f) => f.column === column) && values.length) {
      findings.push({
        column,
        kind: 'address',
        confidence: 0.55,
        matches: values.length,
        sampleMasked: maskValue(values[0], 'address'),
        wholeColumn: false,
      });
    }
  }
  return findings;
}

/**
 * القرار: هل يُسمح بالإرسال؟ ثم النسخة الآمنة.
 * الأعمدة الشخصية بالكامل تُستبعد (لا تُقنَّع) لأن التقنيع الجزئي لا يحمي
 * حين تكون القيمة كلها شخصية، وما تبقّى يُقنَّع في مكانه.
 */
export function evaluateGate(
  rows: Array<Record<string, unknown>>,
  policy: GatePolicy = { allowExternalWithPii: false, maxRows: 500 }
): GateDecision {
  const findings = detectPii(rows);
  // الأسماء والعناوين تُستبعد (لا يمكن التقنيع الجزئي أن يحميها)، أما البريد/الهاتف/
  // المعرّفات فتُقنَّع في مكانها لأن قيمتها التحليلية تكمن في وجودها لا في نصّها.
  const droppedColumns = findings
    .filter((f) => f.wholeColumn && f.confidence >= 0.5 && (f.kind === 'name' || f.kind === 'address'))
    .map((f) => f.column);
  const kindByColumn = new Map(findings.map((f) => [f.column, f.kind]));

  const sanitizedRows = rows.slice(0, policy.maxRows).map((row) => {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (droppedColumns.includes(key)) continue;
      const kind = kindByColumn.get(key);
      clone[key] = kind ? maskValue(value, kind) : value;
    }
    return clone;
  });

  if (!findings.length) {
    return {
      allowed: true,
      reason: `لا بيانات شخصية مكتشفة — يمكن الإرسال (${Math.min(rows.length, policy.maxRows)} صفًّا كحد أقصى).`,
      findings,
      sanitizedRows,
      droppedColumns,
      requiredAction: null,
    };
  }

  if (policy.allowExternalWithPii) {
    return {
      allowed: true,
      reason: 'السياسة تسمح بالبيانات الشخصية لنماذج خارجية — لكن النسخة المُقنَّعة أُعدّت إن أردت تقليل التعرّض.',
      findings,
      sanitizedRows,
      droppedColumns: [],
      requiredAction: null,
    };
  }

  // الافتراضي: لا إرسال خام. النسخة المقنّعة فقط.
  return {
    allowed: true,
    reason:
      `عُثر على ${findings.length} عمودًا شخصيًّا (${findings.map((f) => f.column).slice(0, 4).join('، ')}). ` +
      'أُرسل النسخة المُقنَّعة فقط، واستُبعدت الأعمدة الشخصية بالكامل.',
    findings,
    sanitizedRows,
    droppedColumns,
    requiredAction: droppedColumns.length
      ? 'إن كان التحليل يحتاج الأسماء/المعرّفات نفسها، استخدم النموذج المحلي (Ollama) بدل إرسالها خارجًا.'
      : null,
  };
}
