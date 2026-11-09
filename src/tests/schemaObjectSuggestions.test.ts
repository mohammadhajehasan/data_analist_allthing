import { describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import { generateDdl } from '../utils/ddlGenerator';
import {
  applyObjectSuggestion,
  revertObjectSuggestion,
  suggestSchemaObjects,
  suggestionSqlDiff,
} from '../utils/schemaObjectSuggestions';

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

    const triggerSuggestion = suggestSchemaObjects(base, 'mysql').find(item => item.id.startsWith('trigger:orders'))!;
    expect(suggestionSqlDiff(base, triggerSuggestion, 'mysql').added[0]).toContain('BEFORE UPDATE ON orders');
    const withTrigger = applyObjectSuggestion(base, triggerSuggestion);
    expect(withTrigger.triggers).toHaveLength(1);
    expect(revertObjectSuggestion(withTrigger, triggerSuggestion).triggers).toHaveLength(0);
  });

  it('undoing a full apply-all batch returns the model to its exact prior objects', () => {
    const base = model();
    const batch = suggestSchemaObjects(base, 'mysql');
    const applied = batch.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), base);
    expect(applied.tables[1].indexes?.length).toBe(1);
    expect(applied.views?.length).toBe(1);
    expect(applied.triggers?.length).toBe(2);

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

  it('does not suggest a touch trigger when one already targets the table', () => {
    const withTrigger = model();
    withTrigger.triggers = [{
      name: 'trg_orders_audit',
      table: 'orders',
      rawSql: 'CREATE TRIGGER trg_orders_audit AFTER INSERT ON orders FOR EACH ROW SELECT 1',
    }];
    expect(suggestSchemaObjects(withTrigger, 'mysql').some(item => item.id === 'trigger:orders:updated_at')).toBe(false);
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

  it('does not flag an index as unused when a declared view reads its columns', () => {
    const usedByView = model();
    usedByView.tables[0].indexes = [{ name: 'ix_users_full_name', columns: ['full_name'], unique: false }];
    expect(suggestSchemaObjects(usedByView, 'mysql').some(item => item.dropIndex?.name === 'ix_users_full_name')).toBe(true);

    usedByView.views = [{ name: 'v_user_names', query: 'SELECT full_name FROM users ORDER BY full_name' }];
    expect(suggestSchemaObjects(usedByView, 'mysql').some(item => item.dropIndex?.name === 'ix_users_full_name')).toBe(false);
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
    expect(suggestions.map(item => item.kind).sort()).toEqual(['index', 'index', 'trigger', 'trigger', 'view']);

    const applied = suggestions.reduce((next, suggestion) => applyObjectSuggestion(next, suggestion), base);
    const ddl = generateDdl(applied, 'mysql', { dropIfExists: false, createJunctionTables: true });

    expect(ddl.code).toContain('CREATE INDEX `ix_orders_user_id` ON `orders` (`user_id`);');
    expect(ddl.code).toContain('CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);');
    expect(ddl.code).toContain('CREATE VIEW `v_orders_active` AS');
    expect(ddl.code).toContain('CREATE TRIGGER trg_orders_touch');
    expect(suggestSchemaObjects(applied, 'mysql')).toEqual([]);
  });
});
