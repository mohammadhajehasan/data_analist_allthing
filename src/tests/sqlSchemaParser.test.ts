import { describe, expect, it } from 'vitest';
import { detectSqlDialect, parseSqlSchema } from '../utils/sqlSchemaParser';

describe('dialect detection', () => {
  it('detects MySQL from backticks, AUTO_INCREMENT and ENGINE', () => {
    const sql = `
      CREATE TABLE \`users\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`email\` varchar(190) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const detection = detectSqlDialect(sql);
    expect(detection.dialect).toBe('mysql');
    expect(detection.confidence).toBeGreaterThan(0.7);
    expect(detection.reasons.join(' ')).toMatch(/AUTO_INCREMENT|ENGINE|backtick/);
  });

  it('detects PostgreSQL from SERIAL, JSONB and casts', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `;
    const detection = detectSqlDialect(sql);
    expect(detection.dialect).toBe('postgres');
    expect(detection.confidence).toBeGreaterThan(0.7);
  });

  it('detects SQLite from AUTOINCREMENT and WITHOUT ROWID', () => {
    const sql = `CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT) WITHOUT ROWID;`;
    const detection = detectSqlDialect(sql);
    expect(detection.dialect).toBe('sqlite');
    expect(detection.confidence).toBeGreaterThan(0.7);
  });

  it('flags unsupported SQL Server dialect', () => {
    const sql = `
      CREATE TABLE dbo.Users (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Guid UNIQUEIDENTIFIER NOT NULL
      );
      GO
    `;
    const detection = detectSqlDialect(sql);
    expect(detection.unsupported).toBe('sqlserver');
  });

  it('asks for confirmation when there are no dialect signals', () => {
    const detection = detectSqlDialect('CREATE TABLE t (id INT);');
    expect(detection.dialect).toBe('mysql');
    expect(detection.needsConfirmation).toBe(true);
    expect(detection.confidence).toBeLessThan(0.45);
  });
});

describe('MySQL DDL parsing', () => {
  const sql = `
    -- dump header
    CREATE TABLE \`users\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`email\` varchar(190) NOT NULL,
      \`name\` varchar(120) DEFAULT 'A; B',
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_users_email\` (\`email\`)
    ) ENGINE=InnoDB;

    CREATE TABLE \`orders\` (
      \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
      \`user_id\` int(11) NOT NULL,
      \`total\` decimal(10,2) NOT NULL DEFAULT 0.00,
      PRIMARY KEY (\`id\`),
      KEY \`ix_orders_user\` (\`user_id\`),
      CONSTRAINT \`fk_orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB;

    CREATE INDEX \`ix_orders_total\` ON \`orders\` (\`total\`);
  `;

  const parsed = parseSqlSchema(sql);

  it('parses tables, columns and defaults without breaking semicolons in strings', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.dialect.dialect).toBe('mysql');
    expect(parsed.stats.tables).toBe(2);
    const users = parsed.model.tables.find(table => table.name === 'users')!;
    expect(users.columns.find(c => c.name === 'name')?.defaultValue).toBe("'A; B'");
    expect(users.columns.find(c => c.name === 'id')?.isPrimaryKey).toBe(true);
    expect(users.columns.find(c => c.name === 'id')?.isNullable).toBe(false);
  });

  it('keeps unique, index and foreign-key declarations', () => {
    const users = parsed.model.tables.find(table => table.name === 'users')!;
    const orders = parsed.model.tables.find(table => table.name === 'orders')!;
    expect(users.columns.find(c => c.name === 'email')?.isUnique).toBe(true);
    expect(users.indexes?.some(index => index.unique && index.columns.includes('email'))).toBe(true);
    expect(orders.indexes?.some(index => !index.unique && index.columns.includes('user_id'))).toBe(true);
    expect(orders.indexes?.some(index => index.name === 'ix_orders_total')).toBe(true);
    const relation = parsed.model.relationships.find(rel => rel.targetTable === 'orders');
    expect(relation).toMatchObject({ sourceTable: 'users', sourceColumn: 'id', targetColumn: 'user_id', onDelete: 'CASCADE' });
  });
});

describe('PostgreSQL DDL parsing', () => {
  const sql = `
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      email character varying(190) NOT NULL UNIQUE,
      settings JSONB,
      created_at timestamp without time zone DEFAULT now()
    );

    CREATE TABLE products (
      id BIGSERIAL PRIMARY KEY,
      name character varying(200) NOT NULL,
      price numeric(10,2) NOT NULL DEFAULT 0.00,
      owner_id bigint,
      CONSTRAINT products_price_check CHECK (price >= 0),
      CONSTRAINT fk_products_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE tags (
      product_id BIGINT NOT NULL,
      label VARCHAR(40) NOT NULL,
      PRIMARY KEY (product_id, label)
    );

    CREATE UNIQUE INDEX uq_products_name ON products (name);
    CREATE INDEX ix_products_price ON products (price) WHERE price > 0;
  `;
  const parsed = parseSqlSchema(sql);

  it('normalizes Postgres types and preserves table checks', () => {
    expect(parsed.dialect.dialect).toBe('postgres');
    const users = parsed.model.tables.find(table => table.name === 'users')!;
    expect(users.columns.find(c => c.name === 'email')?.type).toBe('VARCHAR(190)');
    expect(users.columns.find(c => c.name === 'settings')?.type).toBe('JSON');
    expect(users.columns.find(c => c.name === 'created_at')?.type).toBe('TIMESTAMP');
    const products = parsed.model.tables.find(table => table.name === 'products')!;
    expect(products.columns.find(c => c.name === 'price')?.type).toBe('DECIMAL(10,2)');
    expect(products.tableChecks).toContain('price >= 0');
  });

  it('keeps composite primary keys and only non-partial indexes', () => {
    const tags = parsed.model.tables.find(table => table.name === 'tags')!;
    expect(tags.columns.filter(c => c.isPrimaryKey).map(c => c.name)).toEqual(['product_id', 'label']);
    const products = parsed.model.tables.find(table => table.name === 'products')!;
    expect(products.indexes?.some(index => index.name === 'uq_products_name' && index.unique)).toBe(true);
    expect(products.indexes?.some(index => index.name === 'ix_products_price')).toBe(false);
    expect(parsed.issues.some(issue => issue.message.includes('جزئي'))).toBe(true);
  });
});

describe('SQLite DDL parsing', () => {
  it('parses AUTOINCREMENT, quoted identifiers and REFERENCES', () => {
    const parsed = parseSqlSchema(`
      CREATE TABLE "settings" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL DEFAULT '',
        "enabled" INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT,
        FOREIGN KEY (setting_key) REFERENCES "settings" ("key")
      );
    `);
    expect(parsed.dialect.dialect).toBe('sqlite');
    expect(parsed.model.tables.find(t => t.name === 'settings')?.columns.find(c => c.name === 'key')?.isPrimaryKey).toBe(true);
    expect(parsed.model.relationships[0]).toMatchObject({
      sourceTable: 'settings',
      sourceColumn: 'key',
      targetTable: 'logs',
      targetColumn: 'setting_key',
    });
  });
});

describe('views, triggers and indexes', () => {
  const sql = `
    CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(190) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1
    );
    CREATE INDEX ix_users_email ON users (email);
    CREATE VIEW active_users AS SELECT id, email FROM users WHERE active = 1;

    DELIMITER $$
    CREATE TRIGGER trg_users_audit AFTER INSERT ON users
    FOR EACH ROW
    BEGIN
      INSERT INTO audit_log (user_id, action) VALUES (NEW.id, 'created');
      IF NEW.email IS NULL THEN
        SET @missing_email = 1;
      END IF;
    END$$
    DELIMITER ;
  `;
  const parsed = parseSqlSchema(sql);

  it('captures view definitions and their stats', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.stats.views).toBe(1);
    const view = parsed.model.views?.[0];
    expect(view).toMatchObject({ name: 'active_users', query: 'SELECT id, email FROM users WHERE active = 1' });
  });

  it('captures MySQL triggers with BEGIN…END bodies and custom delimiters', () => {
    expect(parsed.stats.triggers).toBe(1);
    const trigger = parsed.model.triggers?.[0];
    expect(trigger?.name).toBe('trg_users_audit');
    expect(trigger?.table).toBe('users');
    expect(trigger?.timing).toBe('AFTER');
    expect(trigger?.event).toBe('INSERT');
    expect(trigger?.rawSql).toContain('INSERT INTO audit_log');
    expect(trigger?.rawSql).toContain('END IF;');
    expect(parsed.issues.some(issue => issue.message.includes('غير مدعوم'))).toBe(false);
  });

  it('keeps user-defined indexes available to the generators', () => {
    expect(parsed.stats.indexes).toBeGreaterThan(0);
    const users = parsed.model.tables.find(table => table.name === 'users')!;
    expect(users.indexes?.some(index => index.name === 'ix_users_email' && index.columns.includes('email'))).toBe(true);
  });
});

describe('ALTER TABLE and edge cases', () => {
  it('applies deferred foreign keys from ALTER TABLE', () => {
    const parsed = parseSqlSchema(`
      CREATE TABLE parents (id INT PRIMARY KEY);
      CREATE TABLE children (id INT PRIMARY KEY, parent_id INT NOT NULL);
      ALTER TABLE children ADD CONSTRAINT fk_children_parent FOREIGN KEY (parent_id) REFERENCES parents (id);
    `);
    expect(parsed.model.relationships).toHaveLength(1);
    expect(parsed.model.tables.find(t => t.name === 'children')?.columns.find(c => c.name === 'parent_id')?.isForeignKey).toBe(true);
  });

  it('reports missing tables instead of throwing', () => {
    const parsed = parseSqlSchema('-- only a comment\n');
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join(' ')).toContain('لم يُعثر');
  });

  it('does not execute SQL or require a database connection', () => {
    const parsed = parseSqlSchema(`CREATE TABLE t (id INT PRIMARY KEY); INSERT INTO t VALUES (1);`);
    expect(parsed.stats.tables).toBe(1);
    expect(parsed.model.tables[0].columns).toHaveLength(1);
  });
});
