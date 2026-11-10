import { describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import { generateDdl } from '../utils/ddlGenerator';
import {
  applyObjectSuggestion,
  bulkSuggestionsSqlDiff,
  revertObjectSuggestion,
  suggestSchemaObjects,
  suggestionSqlDiff,
} from '../utils/schemaObjectSuggestions';

function auditPairsModel(): ErModel {
  const base = model();
  base.tables.push({
    id: 'orders_history',
    name: 'orders_history',
    columns: [
      { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
      { name: 'order_id', type: 'INT', isPrimaryKey: false, isNullable: false },
      { name: 'action', type: 'VARCHAR(10)', isPrimaryKey: false, isNullable: false },
      { name: 'changed_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false },
      { name: 'old_status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
      { name: 'new_status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
      // لقطة مكررة لنفس العمود: تُستبعد لأن الزوج يغطيها
      { name: 'status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
    ],
  });
  return base;
}

function auditPrefixedModel(oldName: string, newName: string): ErModel {
  const base = model();
  base.tables.push({
    id: 'orders_history',
    name: 'orders_history',
    columns: [
      { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
      { name: 'order_id', type: 'INT', isPrimaryKey: false, isNullable: false },
      { name: 'action', type: 'VARCHAR(10)', isPrimaryKey: false, isNullable: false },
      { name: 'changed_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false },
      { name: oldName, type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
      { name: newName, type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
    ],
  });
  return base;
}

function auditModel(): ErModel {
  const base = model();
  base.tables.push({
    id: 'orders_audit',
    name: 'orders_audit',
    columns: [
      { name: 'audit_id', type: 'INT', isPrimaryKey: true, isNullable: false },
      { name: 'order_id', type: 'INT', isPrimaryKey: false, isNullable: false },
      { name: 'action', type: 'VARCHAR(10)', isPrimaryKey: false, isNullable: false },
      { name: 'changed_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false },
      { name: 'changed_by', type: 'VARCHAR(80)', isPrimaryKey: false, isNullable: true },
      { name: 'status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true },
    ],
  });
  return base;
}

function model(): ErModel {
  return {
    diagramNames: ['Suggestions'],
    warnings: [],
    tables: [
      {
        id: 'users',
        name: 'users',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'email', type: 'VARCHAR(190)', isPrimaryKey: false, isNullable: false },
          { name: 'full_name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: true },
          { name: 'updated_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true },
        ],
      },
      {
        id: 'orders',
        name: 'orders',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'user_id', type: 'INT', isPrimaryKey: false, isNullable: false },
          { name: 'status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: false },
          { name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true },
          { name: 'updated_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true },
        ],
      },
    ],
    relationships: [
      {
        id: 'rel-users-orders',
        sourceTable: 'users',
        targetTable: 'orders',
        targetColumn: 'user_id',
        cardinality: '1-N',
      },
    ],
  };
}

describe('suggestion SQL diff & undo', () => {
  it('previews an added CREATE INDEX and undo removes exactly that index', () => {
    const base = model();
    const suggestion = suggestSchemaObjects(base, 'mysql').find(item => item.id === 'index:orders:user_id')!;
    const diff = suggestionSqlDiff(base, suggestion, 'mysql');
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(['CREATE INDEX `ix_orders_user_id` ON `orders` (`user_id`);']);

    const applied = applyObjectSuggestion(base, suggestion);
    expect(applied.tables[1].indexes).toHaveLength(1);
    const undone = revertObjectSuggestion(applied, suggestion);
    expect(undone.tables[1].indexes).toEqual([]);
  });

  it('previews a cleanup as lost CREATE plus gained DROP INDEX and restores position on undo', () => {
    const withDuplicates = model();
    withDuplicates.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'ix_orders_status_copy', columns: ['status'], unique: false },
    ];
    const suggestion = suggestSchemaObjects(withDuplicates, 'mysql').find(item => item.dropIndex)!;
    const mysqlDiff = suggestionSqlDiff(withDuplicates, suggestion, 'mysql');
    expect(mysqlDiff.removed).toEqual(['CREATE INDEX `ix_orders_status_copy` ON `orders` (`status`);']);
    expect(mysqlDiff.added).toEqual(['DROP INDEX `ix_orders_status_copy` ON `orders`;']);

    const pgDiff = suggestionSqlDiff(withDuplicates, suggestion, 'postgres');
    expect(pgDiff.added).toEqual(['DROP INDEX IF EXISTS "ix_orders_status_copy";']);

    const applied = applyObjectSuggestion(withDuplicates, suggestion);
    expect(applied.tables[1].indexes?.map(index => index.name)).toEqual(['ix_orders_status']);
    const undone = revertObjectSuggestion(applied, suggestion);
    expect(undone.tables[1].indexes?.map(index => index.name)).toEqual(['ix_orders_status', 'ix_orders_status_copy']);
  });

  it('previews and undoes view and trigger additions', () => {
    const base = model();
    const viewSuggestion = suggestSchemaObjects(base, 'postgres').find(item => item.id.startsWith('view:orders'))!;
    const viewDiff = suggestionSqlDiff(base, viewSuggestion, 'postgres');
    expect(viewDiff.added[0]).toContain('CREATE VIEW "v_orders_active" AS');
    const withView = applyObjectSuggestion(base, viewSuggestion);
    expect(withView.views).toHaveLength(1);
    expect(revertObjectSuggestion(withView, viewSuggestion).views).toHaveLength(0);

    const triggerSuggestion = suggestSchemaObjects(base, 'mysql').find(item => item.id === 'trigger:orders:updated_at')!;
    expect(suggestionSqlDiff(base, triggerSuggestion, 'mysql').added[0]).toContain('BEFORE UPDATE ON orders');
    const withTrigger = applyObjectSuggestion(base, triggerSuggestion);
    expect(withTrigger.triggers).toHaveLength(1);
    expect(revertObjectSuggestion(withTrigger, triggerSuggestion).triggers).toHaveLength(0);
  });

  it('builds one combined SQL file for apply-all in the same order as the batch', () => {
    const base = model();
    const suggestions = suggestSchemaObjects(base, 'mysql');
    const diff = bulkSuggestionsSqlDiff(base, suggestions, 'mysql');

    expect(diff.removed).toEqual([]);
    expect(diff.added).toHaveLength(suggestions.length);
    expect(diff.counts).toEqual({ add: suggestions.length, drop: 0, skipped: 0 });
    expect(diff.sql).toContain('-- Schema object changes (mysql)');
    expect(diff.sql).toContain('CREATE INDEX `ix_orders_user_id`');
    expect(diff.sql).toContain('CREATE UNIQUE INDEX `uq_users_email`');
    expect(diff.sql).toContain('CREATE VIEW `v_orders_active`');
    expect(diff.sql).toContain('CREATE TRIGGER trg_orders_touch');

    // كل عبارة في الملف مطابقة لما ينتج عن تطبيق الدفعة فعلياً
    const applied = suggestions.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), base);
    const ddl = generateDdl(applied, 'mysql', { dropIfExists: false, createJunctionTables: true });
    for (const statement of diff.added) expect(ddl.code).toContain(statement);
    // الترتيب داخل الملف هو ترتيب التطبيق
    expect(diff.sql.indexOf(diff.added[0])).toBeLessThan(diff.sql.indexOf(diff.added[diff.added.length - 1]));
  });

  it('includes index drops in the combined file and counts them separately', () => {
    const withDuplicates = model();
    withDuplicates.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'ix_orders_status_copy', columns: ['status'], unique: false },
    ];
    const suggestions = suggestSchemaObjects(withDuplicates, 'postgres');
    const diff = bulkSuggestionsSqlDiff(withDuplicates, suggestions, 'postgres');

    expect(diff.counts.drop).toBe(1);
    expect(diff.removed).toEqual(['CREATE INDEX "ix_orders_status_copy" ON "orders" ("status");']);
    expect(diff.added).toContain('DROP INDEX IF EXISTS "ix_orders_status_copy";');
    expect(diff.sql).toContain('1 dropped');
  });

  it('undoing a full apply-all batch returns the model to its exact prior objects', () => {
    const base = model();
    const batch = suggestSchemaObjects(base, 'mysql');
    const applied = batch.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), base);
    expect(applied.tables[1].indexes?.length).toBe(1);
    expect(applied.views?.length).toBe(1);
    expect(applied.triggers?.length).toBe(3);

    const undone = batch.reduceRight((next, suggestion) => revertObjectSuggestion(next, suggestion), applied);
    expect(undone.tables.map(table => table.indexes ?? [])).toEqual(base.tables.map(table => table.indexes ?? []));
    expect(undone.views ?? []).toEqual(base.views ?? []);
    expect(undone.triggers ?? []).toEqual(base.triggers ?? []);
  });
});

describe('schema object suggestions', () => {
  it('suggests a covering index for an unindexed foreign key', () => {
    const suggestions = suggestSchemaObjects(model(), 'mysql');
    const fk = suggestions.find(item => item.id === 'index:orders:user_id');
    expect(fk).toBeDefined();
    expect(fk?.index).toEqual({ tableId: 'orders', value: { name: 'ix_orders_user_id', columns: ['user_id'], unique: false } });
    expect(fk?.confidence).toBeGreaterThan(0.9);
  });

  it('suggests a unique index for a natural key that is not unique', () => {
    const suggestions = suggestSchemaObjects(model(), 'mysql');
    const unique = suggestions.find(item => item.id === 'index:users:unique:email');
    expect(unique?.index?.value).toEqual({ name: 'uq_users_email', columns: ['email'], unique: true });
  });

  it('does not suggest an index that already exists or a unique column', () => {
    const withIndex = model();
    withIndex.tables[1].indexes = [{ name: 'ix_orders_user_id', columns: ['user_id'], unique: false }];
    const suggestions = suggestSchemaObjects(withIndex, 'mysql');
    expect(suggestions.some(item => item.id === 'index:orders:user_id')).toBe(false);

    const uniqueEmail = model();
    uniqueEmail.tables[0].columns[1].isUnique = true;
    expect(suggestSchemaObjects(uniqueEmail, 'mysql').some(item => item.id === 'index:users:unique:email')).toBe(false);
  });

  it('suggests active-row views only for tables with a status or boolean flag', () => {
    const suggestions = suggestSchemaObjects(model(), 'postgres');
    const view = suggestions.find(item => item.id === 'view:orders:status');
    expect(view?.view?.name).toBe('v_orders_active');
    expect(view?.view?.query).toContain('SELECT id, user_id, status, created_at, updated_at');
    expect(view?.view?.query).toContain("WHERE status = 'active'");
    expect(suggestions.some(item => item.id.startsWith('view:users'))).toBe(false);
  });

  it('builds an updated_at trigger per dialect and skips unsupported engines', () => {
    const mysql = suggestSchemaObjects(model(), 'mysql');
    expect(mysql.find(item => item.id === 'trigger:orders:updated_at')?.trigger?.rawSql).toContain('BEFORE UPDATE ON orders');

    const postgres = suggestSchemaObjects(model(), 'postgres');
    const pgTrigger = postgres.find(item => item.id === 'trigger:orders:updated_at')?.trigger?.rawSql ?? '';
    expect(pgTrigger).toContain('CREATE OR REPLACE FUNCTION touch_orders()');
    expect(pgTrigger).toContain('EXECUTE FUNCTION touch_orders()');

    const sqlserver = suggestSchemaObjects(model(), 'sqlserver');
    expect(sqlserver.some(item => item.kind === 'trigger')).toBe(false);
  });

  it('skips the SQLite trigger when the table has no single primary key', () => {
    const composite = model();
    composite.tables[1].columns[0].isPrimaryKey = false;
    composite.tables[1].columns[1].isPrimaryKey = true;
    composite.tables[1].columns.push({ name: 'line_no', type: 'INT', isPrimaryKey: true, isNullable: false });
    const suggestions = suggestSchemaObjects(composite, 'sqlite');
    expect(suggestions.some(item => item.id === 'trigger:orders:updated_at')).toBe(false);
  });

  it('does not suggest a timestamp trigger when one already targets the table', () => {
    const withTrigger = model();
    withTrigger.triggers = [{
      name: 'trg_orders_audit',
      table: 'orders',
      rawSql: 'CREATE TRIGGER trg_orders_audit AFTER INSERT ON orders FOR EACH ROW SELECT 1',
    }];
    const suggestions = suggestSchemaObjects(withTrigger, 'mysql');
    expect(suggestions.some(item => item.id === 'trigger:orders:updated_at')).toBe(false);
    expect(suggestions.some(item => item.id === 'trigger:orders:insert:created_at')).toBe(false);
  });

  it('suggests an audit trigger when a matching history table can be mapped safely', () => {
    const base = auditModel();
    const audit = suggestSchemaObjects(base, 'mysql').find(item => item.id === 'trigger:orders:audit');
    expect(audit?.trigger?.name).toBe('trg_orders_audit');
    expect(audit?.trigger?.event).toBe('INSERT, UPDATE, DELETE');
    const sql = audit?.trigger?.rawSql ?? '';
    expect(sql).toContain('CREATE TRIGGER trg_orders_audit_ins AFTER INSERT ON orders');
    expect(sql).toContain('CREATE TRIGGER trg_orders_audit_upd AFTER UPDATE ON orders');
    expect(sql).toContain('CREATE TRIGGER trg_orders_audit_del AFTER DELETE ON orders');
    expect(sql).toContain('INSERT INTO orders_audit (order_id, status, action, changed_at, changed_by)');
    expect(sql).toContain("VALUES (NEW.id, NEW.status, 'INSERT', CURRENT_TIMESTAMP, CURRENT_USER)");
    expect(sql).toContain("VALUES (OLD.id, OLD.status, 'DELETE', CURRENT_TIMESTAMP, CURRENT_USER)");

    const postgres = suggestSchemaObjects(base, 'postgres').find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    expect(postgres).toContain('CREATE OR REPLACE FUNCTION audit_orders()');
    expect(postgres).toContain('AFTER INSERT OR UPDATE OR DELETE ON orders');
    expect(postgres).toContain("CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END");
    expect(postgres).toContain('TG_OP');

    const sqlite = suggestSchemaObjects(base, 'sqlite').find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    expect(sqlite).toContain('CREATE TRIGGER trg_orders_audit_ins AFTER INSERT ON orders');
    // SQLite لا يوفّر CURRENT_USER: الفاعل القابل للـNULL يُترك للـDEFAULT
    expect(sqlite).not.toContain('changed_by');

    const applied = applyObjectSuggestion(base, audit!);
    const ddl = generateDdl(applied, 'mysql', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).not.toContain('DELIMITER');
    expect(ddl.stats.triggers).toBe(3);
  });

  it('stores old_/new_ column pairs per event instead of a single snapshot', () => {
    const base = auditPairsModel();
    const sql = suggestSchemaObjects(base, 'mysql').find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';

    // العمود status المكرر خارج القائمة لأن old_status/new_status يغطيانه
    expect(sql).toContain('INSERT INTO orders_history (order_id, old_status, new_status, action, changed_at)');
    expect(sql).toContain("VALUES (NEW.id, NULL, NEW.status, 'INSERT', CURRENT_TIMESTAMP)");
    expect(sql).toContain("VALUES (NEW.id, OLD.status, NEW.status, 'UPDATE', CURRENT_TIMESTAMP)");
    expect(sql).toContain("VALUES (OLD.id, OLD.status, NULL, 'DELETE', CURRENT_TIMESTAMP)");

    const postgres = suggestSchemaObjects(base, 'postgres').find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    expect(postgres).toContain("CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END");
    expect(postgres).toContain("CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END");
    // لا تُضاف لقطة status ثالثة بجانب الزوج
    expect(postgres).not.toContain('orders_history (order_id, old_status, new_status, status');
  });

  it('recognises before_/after_ and previous_/current_ history pair prefixes', () => {
    const beforeAfter = suggestSchemaObjects(auditPrefixedModel('before_status', 'after_status'), 'mysql')
      .find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    expect(beforeAfter).toContain('orders_history (order_id, before_status, after_status, action, changed_at)');
    expect(beforeAfter).toContain("VALUES (NEW.id, NULL, NEW.status, 'INSERT', CURRENT_TIMESTAMP)");
    expect(beforeAfter).toContain("VALUES (NEW.id, OLD.status, NEW.status, 'UPDATE', CURRENT_TIMESTAMP)");
    expect(beforeAfter).toContain("VALUES (OLD.id, OLD.status, NULL, 'DELETE', CURRENT_TIMESTAMP)");

    const prevCurrent = suggestSchemaObjects(auditPrefixedModel('previous_status', 'current_status'), 'postgres')
      .find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    expect(prevCurrent).toContain('orders_history (order_id, previous_status, current_status, action, changed_at)');
    expect(prevCurrent).toContain("CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END");
    expect(prevCurrent).toContain("CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END");
  });

  it('never writes NULL into a NOT NULL old_/new_ history column', () => {
    const strict = auditPairsModel();
    const oldStatus = strict.tables[2].columns.find(column => column.name === 'old_status')!;
    oldStatus.isNullable = false;
    oldStatus.defaultValue = "'unknown'";
    const sql = suggestSchemaObjects(strict, 'mysql').find(item => item.id === 'trigger:orders:audit')?.trigger?.rawSql ?? '';
    // يُستبعد العمود من القائمة كي يُطبَّق DEFAULT بدل NULL الصريح
    expect(sql).not.toContain('old_status');
    expect(sql).toContain('new_status');

    const required = auditPairsModel();
    const requiredOld = required.tables[2].columns.find(column => column.name === 'old_status')!;
    requiredOld.isNullable = false;
    expect(suggestSchemaObjects(required, 'mysql').some(item => item.id === 'trigger:orders:audit')).toBe(false);
  });

  it('skips the audit trigger when a NOT NULL history column has no source or default', () => {
    const unsafe = auditModel();
    unsafe.tables[2].columns.push({ name: 'request_id', type: 'VARCHAR(64)', isPrimaryKey: false, isNullable: false });
    expect(suggestSchemaObjects(unsafe, 'mysql').some(item => item.id === 'trigger:orders:audit')).toBe(false);
  });

  it('does not duplicate an audit trigger that already writes to the history table', () => {
    const existing = auditModel();
    existing.triggers = [{
      name: 'trg_orders_audit_manual',
      table: 'orders',
      rawSql: 'CREATE TRIGGER trg_orders_audit_manual AFTER UPDATE ON orders FOR EACH ROW INSERT INTO orders_audit (order_id) VALUES (NEW.id)',
    }];
    expect(suggestSchemaObjects(existing, 'mysql').some(item => item.id === 'trigger:orders:audit')).toBe(false);
  });

  it('suggests an insert trigger that fills created_at when it has no DEFAULT', () => {
    const mysql = suggestSchemaObjects(model(), 'mysql').find(item => item.id === 'trigger:orders:insert:created_at');
    expect(mysql?.trigger?.event).toBe('INSERT');
    expect(mysql?.trigger?.rawSql).toContain('BEFORE INSERT ON orders');
    expect(mysql?.trigger?.rawSql).toContain('IFNULL(NEW.created_at, CURRENT_TIMESTAMP)');

    const postgres = suggestSchemaObjects(model(), 'postgres').find(item => item.id === 'trigger:orders:insert:created_at')?.trigger?.rawSql ?? '';
    expect(postgres).toContain('CREATE OR REPLACE FUNCTION fill_orders()');
    expect(postgres).toContain('COALESCE(NEW.created_at, NOW())');
    expect(postgres).toContain('BEFORE INSERT ON orders');

    const sqlite = suggestSchemaObjects(model(), 'sqlite').find(item => item.id === 'trigger:orders:insert:created_at')?.trigger?.rawSql ?? '';
    expect(sqlite).toContain('AFTER INSERT ON orders');
    expect(sqlite).toContain('WHEN NEW.created_at IS NULL');

    const withDefault = model();
    withDefault.tables[1].columns.find(column => column.name === 'created_at')!.defaultValue = 'CURRENT_TIMESTAMP';
    expect(suggestSchemaObjects(withDefault, 'mysql').some(item => item.id === 'trigger:orders:insert:created_at')).toBe(false);

    // SQLite لا يعدّل NEW، فالـTrigger لا يمنع فشل NOT NULL — لكن MySQL/PostgreSQL يفعلانها قبل الإدراج
    const notNull = model();
    notNull.tables[1].columns.find(column => column.name === 'created_at')!.isNullable = false;
    const fillId = 'trigger:orders:insert:created_at';
    expect(suggestSchemaObjects(notNull, 'sqlite').some(item => item.id === fillId)).toBe(false);
    expect(suggestSchemaObjects(notNull, 'postgres').some(item => item.id === fillId)).toBe(true);
  });

  it('detects duplicate indexes and drops only the later copy', () => {
    const withDuplicates = model();
    withDuplicates.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'ix_orders_status_copy', columns: ['status'], unique: false },
    ];
    const suggestions = suggestSchemaObjects(withDuplicates, 'mysql').filter(item => item.kind === 'index-cleanup');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].cleanupReason).toBe('duplicate');
    expect(suggestions[0].dropIndex?.name).toBe('ix_orders_status_copy');

    const applied = applyObjectSuggestion(withDuplicates, suggestions[0]);
    expect(applied.tables[1].indexes).toEqual([{ name: 'ix_orders_status', columns: ['status'], unique: false }]);
  });

  it('keeps the unique index and drops an identical non-unique one', () => {
    const mixed = model();
    mixed.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'uq_orders_status', columns: ['status'], unique: true },
    ];
    const suggestions = suggestSchemaObjects(mixed, 'mysql').filter(item => item.kind === 'index-cleanup');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].cleanupReason).toBe('redundant');
    expect(suggestions[0].dropIndex?.name).toBe('ix_orders_status');
  });

  it('flags a non-unique index that is a leftmost prefix of a longer one', () => {
    const prefixed = model();
    prefixed.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'ix_orders_status_created', columns: ['status', 'created_at'], unique: false },
    ];
    const suggestions = suggestSchemaObjects(prefixed, 'mysql').filter(item => item.kind === 'index-cleanup');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].dropIndex?.name).toBe('ix_orders_status');
    expect(suggestions[0].cleanupReason).toBe('redundant');
  });

  it('flags a single-column index that duplicates a primary key or unique constraint', () => {
    const primaryKeyIndex = model();
    primaryKeyIndex.tables[0].indexes = [{ name: 'ix_users_id', columns: ['id'], unique: false }];
    const pkSuggestions = suggestSchemaObjects(primaryKeyIndex, 'mysql').filter(item => item.kind === 'index-cleanup');
    expect(pkSuggestions).toHaveLength(1);
    expect(pkSuggestions[0].dropIndex?.name).toBe('ix_users_id');
    expect(pkSuggestions[0].cleanupReason).toBe('redundant');

    const uniqueIndex = model();
    uniqueIndex.tables[0].columns[1].isUnique = true;
    uniqueIndex.tables[0].indexes = [{ name: 'ix_users_email', columns: ['email'], unique: true }];
    expect(suggestSchemaObjects(uniqueIndex, 'mysql').some(item => item.dropIndex?.name === 'ix_users_email')).toBe(true);
  });

  it('flags indexes whose columns were removed and indexes with no declared use', () => {
    const stale = model();
    stale.tables[1].indexes = [{ name: 'ix_orders_legacy', columns: ['legacy_code'], unique: false }];
    const staleSuggestions = suggestSchemaObjects(stale, 'mysql').filter(item => item.kind === 'index-cleanup');
    expect(staleSuggestions).toHaveLength(1);
    expect(staleSuggestions[0].cleanupReason).toBe('unused');
    expect(staleSuggestions[0].detailEn).toContain('no longer exist');

    const unused = model();
    unused.tables[1].columns.push({ name: 'notes', type: 'TEXT', isPrimaryKey: false, isNullable: true });
    unused.tables[1].indexes = [
      { name: 'ix_orders_notes', columns: ['notes'], unique: false },
      { name: 'ix_orders_user_id', columns: ['user_id'], unique: false },
    ];
    const unusedSuggestions = suggestSchemaObjects(unused, 'mysql').filter(item => item.kind === 'index-cleanup');
    // فهرس مفتاح أجنبي يخدم العلاقة فلا يُعدّ غير مستخدم
    expect(unusedSuggestions.map(item => item.dropIndex?.name)).toEqual(['ix_orders_notes']);
    expect(unusedSuggestions[0].confidence).toBeLessThan(0.5);
  });

  it('does not flag an index as unused when a view filters on its column', () => {
    const usedByView = model();
    usedByView.tables[0].indexes = [{ name: 'ix_users_full_name', columns: ['full_name'], unique: false }];
    expect(suggestSchemaObjects(usedByView, 'mysql').some(item => item.dropIndex?.name === 'ix_users_full_name')).toBe(true);

    usedByView.views = [{ name: 'v_user_names', query: "SELECT full_name FROM users WHERE full_name LIKE 'A%'" }];
    expect(suggestSchemaObjects(usedByView, 'mysql').some(item => item.dropIndex?.name === 'ix_users_full_name')).toBe(false);
  });

  it('counts only WHERE and JOIN columns, resolving table aliases', () => {
    const filtered = model();
    filtered.tables[1].indexes = [{ name: 'ix_orders_status', columns: ['status'], unique: false }];
    expect(
      suggestSchemaObjects(
        { ...filtered, views: [{ name: 'v_active', query: "SELECT o.id FROM orders o WHERE o.status = 'active'" }] },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_status')
    ).toBe(false);

    const joined = model();
    joined.tables[1].indexes = [{ name: 'ix_orders_created_at', columns: ['created_at'], unique: false }];
    expect(
      suggestSchemaObjects(
        { ...joined, views: [{ name: 'v_join', query: 'SELECT o.id FROM orders o JOIN users u ON o.created_at = u.updated_at' }] },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_created_at')
    ).toBe(false);

    // SELECT وORDER BY ليسا شرطاً — لا يجعلان الفهرس «مستخدماً»
    expect(
      suggestSchemaObjects(
        { ...filtered, views: [{ name: 'v_list', query: 'SELECT o.status FROM orders o ORDER BY o.status' }] },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_status')
    ).toBe(true);
  });

  it('parses a bare JOIN and still ignores other tables’ same-named columns', () => {
    const bareJoin = model();
    bareJoin.tables[1].indexes = [{ name: 'ix_orders_status', columns: ['status'], unique: false }];
    expect(
      suggestSchemaObjects(
        {
          ...bareJoin,
          views: [{
            name: 'v_bare',
            query: "SELECT orders.id FROM orders JOIN users ON orders.user_id = users.id WHERE orders.status = 'active'",
          }],
        },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_status')
    ).toBe(false);

    const otherTable = model();
    otherTable.tables[0].columns.push({ name: 'status', type: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true });
    otherTable.tables[1].indexes = [{ name: 'ix_orders_status', columns: ['status'], unique: false }];
    expect(
      suggestSchemaObjects(
        {
          ...otherTable,
          views: [{
            name: 'v_user_status',
            query: "SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id WHERE u.status = 'active'",
          }],
        },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_status')
    ).toBe(true);
  });

  it('does not treat string literals as column references', () => {
    const literal = model();
    literal.tables[1].columns.push({ name: 'note', type: 'VARCHAR(50)', isPrimaryKey: false, isNullable: true });
    literal.tables[1].indexes = [{ name: 'ix_orders_status', columns: ['status'], unique: false }];
    expect(
      suggestSchemaObjects(
        { ...literal, views: [{ name: 'v_notes', query: "SELECT id FROM orders WHERE note = 'status'" }] },
        'mysql'
      ).some(item => item.dropIndex?.name === 'ix_orders_status')
    ).toBe(true);
  });

  it('drop suggestions remove the index from DDL without touching the kept one', () => {
    const withDuplicates = model();
    withDuplicates.tables[1].indexes = [
      { name: 'ix_orders_status', columns: ['status'], unique: false },
      { name: 'ix_orders_status_copy', columns: ['status'], unique: false },
    ];
    const cleanup = suggestSchemaObjects(withDuplicates, 'mysql').filter(item => item.kind === 'index-cleanup');
    const applied = cleanup.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), withDuplicates);
    const ddl = generateDdl(applied, 'mysql', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).toContain('CREATE INDEX `ix_orders_status` ON `orders` (`status`);');
    expect(ddl.code).not.toContain('ix_orders_status_copy');
  });

  it('applying all suggestions produces valid DDL and clears the suggestions', () => {
    const base = model();
    const suggestions = suggestSchemaObjects(base, 'mysql');
    expect(suggestions.map(item => item.kind).sort()).toEqual(['index', 'index', 'trigger', 'trigger', 'trigger', 'view']);

    const applied = suggestions.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), base);
    const ddl = generateDdl(applied, 'mysql', { dropIfExists: false, createJunctionTables: true });

    expect(ddl.code).toContain('CREATE INDEX `ix_orders_user_id` ON `orders` (`user_id`);');
    expect(ddl.code).toContain('CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);');
    expect(ddl.code).toContain('CREATE VIEW `v_orders_active` AS');
    expect(ddl.code).toContain('CREATE TRIGGER trg_orders_touch');
    expect(suggestSchemaObjects(applied, 'mysql')).toEqual([]);
  });
});
