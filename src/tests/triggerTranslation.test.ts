import { describe, expect, it } from 'vitest';
import { translateTrigger } from '../utils/backendCodegen/triggerTranslation';

const customers = { name: 'customers', primaryKey: ['id'] };

describe('trigger translation across engines', () => {
  it('rewrites MySQL SET NEW assignments into a SQLite AFTER UPDATE trigger', () => {
    const result = translateTrigger(
      'CREATE TRIGGER `trg_users_audit` AFTER INSERT ON `customers` FOR EACH ROW BEGIN SET NEW.full_name = TRIM(NEW.full_name); SET NEW.updated_at = NOW(); END',
      'sqlite',
      customers
    );

    expect(result.translatedFrom).toBe('mysql');
    expect(result.note).toContain('AFTER trigger UPDATE');
    expect(result.sql).toContain('CREATE TRIGGER "trg_users_audit" AFTER INSERT ON "customers"');
    expect(result.sql).toContain('FOR EACH ROW BEGIN');
    expect(result.sql).toContain(
      'UPDATE "customers" SET "full_name" = TRIM(NEW."full_name"), "updated_at" = CURRENT_TIMESTAMP WHERE "id" = NEW."id";'
    );
  });

  it('keeps every primary-key column in the WHERE clause of a composite table', () => {
    const result = translateTrigger(
      'CREATE TRIGGER trg_qty AFTER UPDATE ON order_items FOR EACH ROW SET NEW.quantity = ABS(NEW.quantity)',
      'sqlite',
      { name: 'order_items', primaryKey: ['order_id', 'product_id'] }
    );

    expect(result.sql).toContain('WHERE "order_id" = NEW."order_id" AND "product_id" = NEW."product_id"');
  });

  it('rewrites MySQL assignments into a PostgreSQL trigger function returning NEW', () => {
    const result = translateTrigger(
      'CREATE TRIGGER `trg_slug` BEFORE UPDATE ON `products` FOR EACH ROW BEGIN SET NEW.sku = UPPER(NEW.sku); END',
      'postgres',
      { name: 'products', primaryKey: ['id'] }
    );

    expect(result.translatedFrom).toBe('mysql');
    expect(result.sql).toContain('CREATE OR REPLACE FUNCTION "fn_trg_slug"() RETURNS trigger AS $$');
    expect(result.sql).toContain('NEW."sku" := UPPER(NEW."sku");');
    expect(result.sql).toContain('RETURN NEW;');
    expect(result.sql).toContain('$$ LANGUAGE plpgsql;');
    expect(result.sql).toContain(
      'CREATE TRIGGER "trg_slug" BEFORE UPDATE ON "products"\nFOR EACH ROW EXECUTE FUNCTION "fn_trg_slug"();'
    );
    expect(result.downExtra).toBe('DROP FUNCTION IF EXISTS "fn_trg_slug"();');
  });

  it('rewrites PostgreSQL-style assignments into MySQL SET NEW statements', () => {
    const result = translateTrigger(
      'CREATE TRIGGER trg_price BEFORE INSERT ON products FOR EACH ROW BEGIN NEW.price := GREATEST(NEW.price, 0); END',
      'mysql'
    );

    expect(result.translatedFrom).toBe('postgres');
    expect(result.sql).toContain('CREATE TRIGGER `trg_price` BEFORE INSERT ON `products`');
    expect(result.sql).toContain('SET NEW.`price` = GREATEST(NEW.`price`, 0);');
  });

  it('refuses to invent a row target when the table has no primary key', () => {
    const result = translateTrigger(
      'CREATE TRIGGER trg_audit AFTER INSERT ON logs FOR EACH ROW SET NEW.updated_at = NOW()',
      'sqlite',
      { name: 'logs', primaryKey: [] }
    );

    expect(result.sql).toBeUndefined();
    expect(result.skipped).toContain('no primary key');
  });

  it('refuses translations that would drop extra statements or a WHEN condition', () => {
    const extra = translateTrigger(
      'CREATE TRIGGER trg_audit AFTER INSERT ON customers FOR EACH ROW BEGIN SET NEW.full_name = UCASE(NEW.full_name); INSERT INTO audit_log (msg) VALUES (\'x\'); END',
      'sqlite',
      customers
    );
    expect(extra.skipped).toContain('other than NEW.column assignments');

    const conditional = translateTrigger(
      'CREATE TRIGGER trg_audit AFTER INSERT ON customers FOR EACH ROW WHEN (NEW.email IS NOT NULL) BEGIN SET NEW.full_name = UCASE(NEW.full_name); END',
      'sqlite',
      customers
    );
    expect(conditional.skipped).toContain('WHEN condition');
  });

  it('skips engine functions that have no safe equivalent instead of emitting broken SQL', () => {
    const result = translateTrigger(
      'CREATE TRIGGER trg_slug AFTER INSERT ON customers FOR EACH ROW SET NEW.full_name = CONCAT(NEW.full_name, \'!\')',
      'sqlite',
      customers
    );

    expect(result.sql).toBeUndefined();
    expect(result.skipped).toContain('CONCAT');
  });

  it('keeps a PostgreSQL function-based trigger untranslated with a clear reason', () => {
    const result = translateTrigger(
      'CREATE TRIGGER trg_audit AFTER INSERT ON customers FOR EACH ROW EXECUTE FUNCTION audit_row()',
      'sqlite',
      customers
    );

    expect(result.sql).toBeUndefined();
    expect(result.skipped).toContain('trigger function');
  });

  it('passes a same-engine definition through and only strips DEFINER for non-MySQL targets', () => {
    const sqlite = translateTrigger('CREATE TRIGGER trg AFTER INSERT ON t FOR EACH ROW BEGIN UPDATE t SET a = 1; END', 'sqlite');
    expect(sqlite.sql).toBe('CREATE TRIGGER trg AFTER INSERT ON t FOR EACH ROW BEGIN UPDATE t SET a = 1; END;');
    expect(sqlite.translatedFrom).toBeUndefined();

    const mysql = translateTrigger(
      'CREATE TRIGGER `trg` AFTER INSERT ON `t` FOR EACH ROW BEGIN SET NEW.a = 1; END',
      'mysql'
    );
    expect(mysql.sql).toContain('CREATE TRIGGER `trg` AFTER INSERT ON `t`');
    expect(mysql.sql).toContain('SET NEW.a = 1;');
  });
});
