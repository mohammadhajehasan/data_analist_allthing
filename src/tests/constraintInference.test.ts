import { describe, it, expect } from 'vitest';
import { inferColumnConstraints } from '../utils/constraintInference';

/**
 * اختبارات التحديد الذكي للقيود — اقتراحات فارقية مع الحالة الحالية:
 *   • UNIQUE:  email/slug/code/username/iban/uuid
 *   • NOT NULL: مفاتيح الاتصال id/<جدول>_id المقدَّرة NULL
 *   • CHECK:   كمّيات رقمية (price/amount/…) → `>= 0`
 * لا يقترح على عمود يملك القيد أصلاً ولا على المفتاح الأساسي.
 */

const base = {
  isPrimaryKey: false,
  isNullable: true,
  isUnique: false,
  check: undefined as string | undefined,
};

describe('inferColumnConstraints — التحديد الذكي للقيود', () => {
  it('يقترح UNIQUE لأعمدة العنونة فقط', () => {
    for (const name of ['email', 'user_email', 'slug', 'order_code', 'sku', 'username', 'iban']) {
      const s = inferColumnConstraints({ ...base, name, type: 'VARCHAR(255)' });
      expect(s.unique, name).toBe(true);
    }
    for (const name of ['title', 'description', 'price', 'created_at']) {
      const s = inferColumnConstraints({ ...base, name, type: 'VARCHAR(255)' });
      expect(s.unique, name).toBeUndefined();
    }
  });

  it('لا يقترح UNIQUE على ما يحتوي القيد أصلاً أو على المفتاح الأساسي', () => {
    expect(inferColumnConstraints({ ...base, name: 'email', type: 'VARCHAR(255)', isUnique: true }).unique).toBeUndefined();
    expect(inferColumnConstraints({ ...base, name: 'email', type: 'INT', isPrimaryKey: true }).unique).toBeUndefined();
  });

  it('يقترح NOT NULL لمعرّفات الاتصال المقدَّرة NULL فقط', () => {
    expect(inferColumnConstraints({ ...base, name: 'user_id', type: 'INT' }).notNull).toBe(true);
    expect(inferColumnConstraints({ ...base, name: 'id', type: 'INT' }).notNull).toBe(true);
    expect(inferColumnConstraints({ ...base, name: 'user_id', type: 'INT', isNullable: false }).notNull).toBeUndefined();
    expect(inferColumnConstraints({ ...base, name: 'name', type: 'INT', isNullable: true }).notNull).toBeUndefined();
    // PK يُستثنى — إلزام NOT NULL له حاصل تلقائي
    expect(inferColumnConstraints({ ...base, name: 'id', type: 'INT', isPrimaryKey: true, isNullable: true }).notNull).toBeUndefined();
  });

  it('يقترح CHECK >= 0 للكمّيات الرقمية بأساس رقمي فقط', () => {
    for (const name of ['price', 'total_amount', 'quantity', 'stock', 'balance', 'age']) {
      const s = inferColumnConstraints({ ...base, name, type: 'DECIMAL(10,2)' });
      expect(s.check, name).toBe('>= 0');
    }
    // نوع غير رقمي: لا اقتراح
    expect(inferColumnConstraints({ ...base, name: 'price', type: 'VARCHAR(64)' }).check).toBeUndefined();
    // عمود لديه CHECK أصلاً: لا اقتراح جديد
    expect(inferColumnConstraints({ ...base, name: 'price', type: 'INT', check: 'price < 100' }).check).toBeUndefined();
  });

  it('يحسّن الأساس من الأنماط المركبة DECIMAL(10,2)/BIGINT', () => {
    expect(inferColumnConstraints({ ...base, name: 'amount', type: 'DECIMAL(10,2)' }).check).toBe('>= 0');
    expect(inferColumnConstraints({ ...base, name: 'total_count', type: 'BIGINT' }).check).toBe('>= 0');
  });

  it('لا يقترح التعبير نفسه مرتين — فارقية مع الحالة المرّرة', () => {
    const applied = inferColumnConstraints({ ...base, name: 'email', type: 'VARCHAR(255)' });
    const afterUnique = applied.unique === true;
    expect(afterUnique).toBe(true);
    // بعد التطبيق (isUnique=true) يعاد فارغاً
    const reRun = inferColumnConstraints({ ...base, name: 'email', type: 'VARCHAR(255)', isUnique: true });
    expect(reRun.unique).toBeUndefined();
  });
});
