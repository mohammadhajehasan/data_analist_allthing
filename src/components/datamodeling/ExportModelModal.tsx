import React, { useState, useMemo } from 'react';
import { DataModelTable, DataModelRelationship } from '../../types';
import {
  Download,
  Copy,
  Check,
  Code2,
  FileJson,
  Database,
  X,
  Sparkles,
  FileText
} from 'lucide-react';

interface ExportModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
  language?: 'ar' | 'en';
}

export const ExportModelModal: React.FC<ExportModelModalProps> = ({
  isOpen,
  onClose,
  tables,
  relationships,
  language = 'ar',
}) => {
  const isAr = language === 'ar';
  const [exportFormat, setExportFormat] = useState<'json' | 'sql' | 'mermaid'>('json');
  const [sqlDialect, setSqlDialect] = useState<'postgres' | 'mysql' | 'sqlite' | 'sqlserver'>('postgres');
  const [copied, setCopied] = useState<boolean>(false);

  // Generate JSON Schema Definition
  const jsonContent = useMemo(() => {
    const schemaObj = {
      modelName: 'Relational_Data_Model',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      tableCount: tables.length,
      relationshipCount: relationships.length,
      tables: tables.map(t => ({
        id: t.id,
        name: t.name,
        rowCount: t.rowCount,
        primaryKey: t.primaryKey || [],
          columns: t.columns.map(c => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable ?? true,
          })),
      })),
      relationships: relationships.map(r => ({
        id: r.id,
        sourceTable: r.sourceTable,
        sourceColumn: r.sourceColumn,
        targetTable: r.targetTable,
        targetColumn: r.targetColumn,
        relationshipType: r.relationshipType,
        joinType: r.joinType || 'LEFT',
        description: r.description || '',
      })),
    };
    return JSON.stringify(schemaObj, null, 2);
  }, [tables, relationships]);

  // Generate SQL DDL Script
  const sqlContent = useMemo(() => {
    let sql = `-- Relational Data Model DDL Export\n`;
    sql += `-- Generated: ${new Date().toLocaleString()}\n`;
    sql += `-- Dialect: ${sqlDialect.toUpperCase()}\n\n`;

    // 1. CREATE TABLE Statements
    tables.forEach(t => {
      sql += `CREATE TABLE ${t.name} (\n`;
      const colLines = t.columns.map(c => {
        let typeStr = 'VARCHAR(255)';
        if (c.type === 'integer') typeStr = sqlDialect === 'postgres' ? 'INTEGER' : 'INT';
        else if (c.type === 'float') typeStr = 'NUMERIC(15,2)';
        else if (c.type === 'date') typeStr = 'TIMESTAMP';
        else if (c.type === 'boolean') typeStr = 'BOOLEAN';

        const isPk = t.primaryKey?.includes(c.name);
        return `  ${c.name} ${typeStr}${isPk ? ' NOT NULL' : ''}`;
      });

      if (t.primaryKey && t.primaryKey.length > 0) {
        colLines.push(`  CONSTRAINT pk_${t.name} PRIMARY KEY (${t.primaryKey.join(', ')})`);
      }

      sql += colLines.join(',\n');
      sql += `\n);\n\n`;
    });

    // 2. Foreign Key Alter Statements
    relationships.forEach(r => {
      const fkName = `fk_${r.sourceTable}_${r.sourceColumn}_to_${r.targetTable}`;
      sql += `ALTER TABLE ${r.sourceTable}\n`;
      sql += `  ADD CONSTRAINT ${fkName}\n`;
      sql += `  FOREIGN KEY (${r.sourceColumn})\n`;
      sql += `  REFERENCES ${r.targetTable} (${r.targetColumn})\n`;
      sql += `  ON DELETE CASCADE ON UPDATE CASCADE;\n\n`;
    });

    return sql;
  }, [tables, relationships, sqlDialect]);

  // Generate Mermaid ERD Code
  const mermaidContent = useMemo(() => {
    let mmd = `erDiagram\n`;
    tables.forEach(t => {
      mmd += `    ${t.name} {\n`;
      t.columns.forEach(c => {
        const isPk = t.primaryKey?.includes(c.name) ? 'PK' : '';
        mmd += `        ${c.type} ${c.name} ${isPk}\n`;
      });
      mmd += `    }\n`;
    });

    relationships.forEach(r => {
      let card = '||--o{';
      if (r.relationshipType === '1:1') card = '||--||';
      else if (r.relationshipType === 'M:M') card = '}o--o{';
      mmd += `    ${r.targetTable} ${card} ${r.sourceTable} : "${r.sourceColumn} -> ${r.targetColumn}"\n`;
    });

    return mmd;
  }, [tables, relationships]);

  const activeContent = exportFormat === 'json' ? jsonContent : exportFormat === 'sql' ? sqlContent : mermaidContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = exportFormat === 'json' ? 'json' : exportFormat === 'sql' ? 'sql' : 'mmd';
    const blob = new Blob([activeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Data_Model_Export.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg max-w-2xl w-full p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-[#78a9ff]">
            <Code2 className="w-5 h-5" />
            <h3 className="text-sm font-mono font-bold text-white uppercase">
              {isAr ? 'تصدير النموذج والهيكل (Export Model & DDL)' : 'Export Model Definition'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--cds-layer-01)] p-2 rounded-lg border border-[var(--cds-border-subtle)]">
          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => setExportFormat('json')}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                exportFormat === 'json'
                  ? 'bg-[#0f62fe] text-white'
                  : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>JSON Schema</span>
            </button>
            <button
              onClick={() => setExportFormat('sql')}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                exportFormat === 'sql'
                  ? 'bg-[#0f62fe] text-white'
                  : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQL Script DDL</span>
            </button>
            <button
              onClick={() => setExportFormat('mermaid')}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                exportFormat === 'mermaid'
                  ? 'bg-[#0f62fe] text-white'
                  : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Mermaid ERD</span>
            </button>
          </div>

          {/* SQL Dialect selector if SQL selected */}
          {exportFormat === 'sql' && (
            <select
              value={sqlDialect}
              onChange={e => setSqlDialect(e.target.value as any)}
              className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-xs font-mono font-bold text-white rounded p-1 outline-none"
            >
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
              <option value="sqlserver">SQL Server</option>
            </select>
          )}
        </div>

        {/* Code Preview Box */}
        <div className="relative border border-[var(--cds-border-subtle)] rounded-lg bg-[var(--cds-background)] overflow-hidden">
          <pre className="p-4 text-xs font-mono text-[#a6c8ff] max-h-[300px] overflow-y-auto custom-scrollbar leading-relaxed whitespace-pre">
            {activeContent}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-[var(--cds-border-subtle)] pt-3">
          <span className="text-[11px] font-mono text-[var(--cds-text-03)]">
            {isAr ? `${tables.length} جداول | ${relationships.length} روابط` : `${tables.length} tables | ${relationships.length} relationships`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-white text-xs font-mono flex items-center gap-1.5 rounded border border-[var(--cds-border-subtle)] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ الكود' : 'Copy')}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-4 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center gap-1.5 rounded cursor-pointer shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحميل الملف' : 'Download File'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
