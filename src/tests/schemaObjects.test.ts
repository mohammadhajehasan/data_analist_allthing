import { describe, expect, it } from 'vitest';
import type { ErModel } from '../utils/drawioImporter';
import { generateDdl } from '../utils/ddlGenerator';

function model(): ErModel {
  return {
    diagramNames: ['Objects'],
    warnings: [],
    tables: [
      {
        id: 'users',
        name: 'users',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'email', type: 'VARCHAR(190)', isPrimaryKey: false, isNullable: false, isUnique: true },
          { name: 'name', type: 'VARCHAR(120)', isPrimaryKey: false, isNullable: true },
        ],
        indexes: [
          { name: 'ix_users_name', columns: ['name'], unique: false },
          { name: 'uq_users_email_inline', columns: ['email'], unique: true },
        ],
      },
      {
        id: 'audit_log',
        name: 'audit_log',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
          { name: 'user_id', type: 'INT', isPrimaryKey: false, isNullable: true },
          { name: 'action', type: 'VARCHAR(40)', isPrimaryKey: false, isNullable: false },
        ],
      },
    ],
    relationships: [],
    views: [
      {
        name: 'active_users',
        query: 'SELECT id, email FROM users WHERE name IS NOT NULL',
      },
    ],
    triggers: [
      {
        name: 'trg_users_audit',
        table: 'users',
        timing: 'AFTER',
        event: 'INSERT',
        rawSql:
          'CREATE TRIGGER trg_users_audit AFTER INSERT ON users FOR EACH ROW INSERT INTO audit_log (user_id, action) VALUES (NEW.id, \'created\')',
      },
    ],
  };
}

describe('schema objects in generated DDL', () => {
  it('emits user indexes, views and triggers after tables', () => {
    const ddl = generateDdl(model(), 'mysql', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).toContain('CREATE INDEX `ix_users_name` ON `users` (`name`);');
    // UNIQUE المضمّن في العمود لا يتكرر كفهرس
    expect(ddl.code).not.toContain('uq_users_email_inline');
    expect(ddl.code).toContain('CREATE VIEW `active_users` AS');
    expect(ddl.code).toContain('CREATE TRIGGER trg_users_audit');
    expect(ddl.code.indexOf('CREATE TABLE `users`')).toBeLessThan(ddl.code.indexOf('CREATE INDEX'));
    expect(ddl.code.indexOf('CREATE INDEX')).toBeLessThan(ddl.code.indexOf('CREATE VIEW'));
    expect(ddl.code.indexOf('CREATE VIEW')).toBeLessThan(ddl.code.indexOf('CREATE TRIGGER'));
  });

  it('quotes objects per dialect and keeps the trigger body intact', () => {
    const ddl = generateDdl(model(), 'postgres', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).toContain('CREATE INDEX "ix_users_name" ON "users" ("name");');
    expect(ddl.code).toContain('CREATE VIEW "active_users" AS');
    expect(ddl.code).toContain("VALUES (NEW.id, 'created')");
  });

  it('wraps MySQL BEGIN…END triggers in DELIMITER blocks for CLI imports', () => {
    const withBlock = model();
    withBlock.triggers = [{
      name: 'trg_users_block',
      table: 'users',
      rawSql:
        'CREATE TRIGGER trg_users_block AFTER INSERT ON users FOR EACH ROW BEGIN INSERT INTO audit_log (user_id, action) VALUES (NEW.id, \'created\'); END',
    }];
    const ddl = generateDdl(withBlock, 'mysql', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).toContain('DELIMITER $$');
    expect(ddl.code).toContain('END$$');
    expect(ddl.code).toContain('DELIMITER ;');
  });

  it('reports every emitted object so the migration export is verifiably complete', () => {
    const ddl = generateDdl(model(), 'mysql', { dropIfExists: false, createJunctionTables: true });
    // الفهرس الفريد المضمّن في العمود لا يُصدر، فيبقى فهرس واحد
    expect(ddl.stats.indexes).toBe(1);
    expect(ddl.stats.views).toBe(1);
    expect(ddl.stats.triggers).toBe(1);
    expect(ddl.code).toMatch(/Indexes: 1\s+·\s+Views: 1\s+·\s+Triggers: 1/);
  });

  it('supports SQLite index and view syntax', () => {
    const ddl = generateDdl(model(), 'sqlite', { dropIfExists: false, createJunctionTables: true });
    expect(ddl.code).toContain('CREATE INDEX "ix_users_name" ON "users" ("name");');
    expect(ddl.code).toContain('CREATE VIEW "active_users" AS');
    expect(ddl.code).toContain('CREATE TRIGGER trg_users_audit');
  });
});
