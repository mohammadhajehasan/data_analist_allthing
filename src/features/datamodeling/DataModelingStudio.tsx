import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  DataModelTable,
  DataModelRelationship,
  DataModelSchema,
  RelationshipType,
  DatasetColumn,
} from '../../types';
import { parseExcelWorkbookAllSheets } from '../../utils/fileDataParser';
import * as XLSX from 'xlsx';
import { CarbonDataTable } from '../../components/common/CarbonDataTable';
import { MergedDataPreviewTable } from '../../components/datamodeling/MergedDataPreviewTable';
import {
  Workflow,
  FileSpreadsheet,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Download,
  RefreshCw,
  Database,
  Key,
  Link as LinkIcon,
  Check,
  X,
  ChevronRight,
  Info,
  Layers,
  Code,
  Table,
  FileCode,
  ArrowRight,
  Lock,
  Cloud,
  Eye,
  Share2,
  HelpCircle,
  Zap,
  SlidersHorizontal,
  CheckCircle,
  FileText,
  Copy,
} from 'lucide-react';

// Color palette for table cards
const TABLE_ACCENTS = [
  '#0f62fe', // IBM Blue
  '#8a3ffc', // Purple
  '#007d79', // Teal
  '#ee538b', // Magenta
  '#fa4d56', // Red
  '#005d5d', // Cyan
  '#6fdc8c', // Green
  '#d12771', // Pink
];

export const DataModelingStudio: React.FC = () => {
  const {
    datasets,
    addDataset,
    activeAIModelDef,
    availableAIModels,
    aiSettings,
    toast,
    language,
    t,
  } = useApp();
  const isAr = language === 'ar';

  // Core Data Model State
  const [tables, setTables] = useState<DataModelTable[]>([]);
  const [relationships, setRelationships] = useState<DataModelRelationship[]>([]);
  const [schemaTitle, setSchemaTitle] = useState<string>('Excel_Relational_Model');

  // UI State
  const [activeTab, setActiveTab] = useState<'canvas' | 'relationships' | 'preview' | 'export'>('canvas');
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isAiModeling, setIsAiModeling] = useState(false);
  const [showDownloadSchemaModal, setShowDownloadSchemaModal] = useState(false);
  const [aiReport, setAiReport] = useState<{
    detectedRelationships: any[];
    primaryKeySuggestions: Record<string, string[]>;
    summaryEn: string;
    summaryAr: string;
    model: string;
    isLocal?: boolean;
  } | null>(null);

  // Manual Relationship Modal State
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relSourceTable, setRelSourceTable] = useState<string>('');
  const [relSourceCol, setRelSourceCol] = useState<string>('');
  const [relTargetTable, setRelTargetTable] = useState<string>('');
  const [relTargetCol, setRelTargetCol] = useState<string>('');
  const [relType, setRelType] = useState<RelationshipType>('1:M');
  const [relDesc, setRelDesc] = useState<string>('');

  // Selected AI Model for Data Modeling
  const [selectedModelId, setSelectedModelId] = useState<string>(activeAIModelDef.id);

  // Export Modal / Dialect State
  const [exportSqlDialect, setExportSqlDialect] = useState<'postgres' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle'>('postgres');
  const [copiedCode, setCopiedCode] = useState(false);

  // Joined Data Preview State
  const [previewRelId, setPreviewRelId] = useState<string | null>(null);

  // Seed sample multi-table model if no tables loaded
  useEffect(() => {
    if (tables.length === 0 && datasets.length > 0) {
      // Auto-populate from workspace datasets if available
      const initialTables: DataModelTable[] = datasets.slice(0, 4).map((d, idx) => {
        const pkCol = d.columns.find(c => /id|code|key/i.test(c.name))?.name || d.columns[0]?.name;
        return {
          id: d.id,
          name: d.name.replace(/\s+/g, '_'),
          rowCount: d.rowCount,
          columns: d.columns,
          primaryKey: pkCol ? [pkCol] : [],
          fullData: d.data || [],
          dataSample: d.data && d.data.length > 0 ? d.data.slice(0, 15) : [],
          color: TABLE_ACCENTS[idx % TABLE_ACCENTS.length],
        };
      });
      setTables(initialTables);
    }
  }, [datasets]);

  // Sync selectedModelId with global AI model
  useEffect(() => {
    if (activeAIModelDef?.id) {
      setSelectedModelId(activeAIModelDef.id);
    }
  }, [activeAIModelDef?.id]);

  const currentModelDef = useMemo(() => {
    return availableAIModels.find(m => m.id === selectedModelId) || activeAIModelDef;
  }, [availableAIModels, selectedModelId, activeAIModelDef]);

  // Handle uploading Excel or CSV files (supports multiple files at once)
  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsingExcel(true);
    try {
      const allNewTables: DataModelTable[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const sheetResults = parseExcelWorkbookAllSheets(buffer);

        if (sheetResults && sheetResults.length > 0) {
          sheetResults.forEach((s, idx) => {
            const pkCol = s.columns.find(c => /id|code|key/i.test(c.name))?.name || s.columns[0]?.name;
            const rawFileName = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_');
            const tName = files.length > 1 && sheetResults.length === 1
              ? rawFileName
              : s.tableName.replace(/\s+/g, '_');

            allNewTables.push({
              id: `tbl-${Date.now()}-${i}-${idx}`,
              name: tName,
              rowCount: s.totalRows,
              columns: s.columns,
              primaryKey: pkCol ? [pkCol] : [],
              fullData: s.data,
              dataSample: s.data.slice(0, 10),
              color: TABLE_ACCENTS[(tables.length + allNewTables.length) % TABLE_ACCENTS.length],
            });
          });
        }
      }

      if (allNewTables.length === 0) {
        toast.error(
          isAr ? 'لم يتم العثور على جداول' : 'No Tables Found',
          isAr ? 'الملفات المرفوعة لا تحتوي على ورقات عمل أو بيانات قابلة للقراءة.' : 'The uploaded files contain no readable worksheets or records.'
        );
        return;
      }

      if (files.length === 1) {
        setSchemaTitle(files[0].name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_'));
      }

      setTables(prev => [...prev, ...allNewTables]);
      setAiReport(null);

      toast.success(
        isAr ? 'تم تحميل الجداول والشيتات بنجاح' : 'Files Loaded Successfully',
        isAr
          ? `تمت إضافتها إلى استوديو النمذجة (${allNewTables.length} جدول جديد من ${files.length} ملفات).`
          : `Added ${allNewTables.length} tables from ${files.length} uploaded CSV/Excel files.`
      );
    } catch (err: any) {
      console.error('Error parsing files:', err);
      toast.error(
        isAr ? 'خطأ في معالجة الملفات' : 'File Import Error',
        err.message || (isAr ? 'تعذر قراءة الملفات المرفوعة' : 'Failed to parse uploaded files')
      );
    } finally {
      setIsParsingExcel(false);
      e.target.value = '';
    }
  };

  // Import existing workspace datasets as tables
  const handleImportWorkspaceDatasets = () => {
    if (datasets.length === 0) {
      toast.info(
        isAr ? 'لا توجد مجموعات بيانات' : 'No Datasets Available',
        isAr ? 'يرجى تحميل مجموعات بيانات أولاً في مساحة العمل.' : 'Please load datasets in the workspace first.'
      );
      return;
    }

    const importedTables: DataModelTable[] = datasets.map((d, idx) => {
      const pkCol = d.columns.find(c => /id|code|key/i.test(c.name))?.name || d.columns[0]?.name;
      return {
        id: `tbl-ws-${d.id}`,
        name: d.name.replace(/\s+/g, '_'),
        rowCount: d.rowCount,
        columns: d.columns,
        primaryKey: pkCol ? [pkCol] : [],
        fullData: d.data || [],
        dataSample: d.data && d.data.length > 0 ? d.data.slice(0, 15) : [],
        color: TABLE_ACCENTS[idx % TABLE_ACCENTS.length],
      };
    });

    setTables(importedTables);
    setRelationships([]);
    setAiReport(null);

    toast.success(
      isAr ? 'تم استيراد جداول مساحة العمل' : 'Workspace Tables Imported',
      isAr ? `تم تحويل ${importedTables.length} جدول إلى استوديو النمذجة.` : `Loaded ${importedTables.length} tables into modeling studio.`
    );
  };

  // Run AI-Powered Data Modeling (Auto Relationship & Key Detection)
  const handleAiAutoModeling = async () => {
    if (tables.length < 2) {
      toast.warning(
        isAr ? 'يتطلب جدولين على الأقل' : 'At least 2 tables required',
        isAr ? 'يرجى تحميل ملف أكسيل به أكثر من شيت أو إضافة عدة جداول للربط بينها.' : 'Please load an Excel file with multiple sheets or tables.'
      );
      return;
    }

    setIsAiModeling(true);
    try {
      const modelDef = currentModelDef;
      const providerCfg = aiSettings.providers[modelDef.provider];

      const res = await fetch('/api/data-modeling/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables,
          model: modelDef.id,
          provider: modelDef.provider,
          endpointUrl: providerCfg?.endpointUrl,
          apiKey: providerCfg?.apiKey,
          language,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAiReport(data);

        // Apply Primary Keys if suggested
        if (data.primaryKeySuggestions) {
          setTables(prev =>
            prev.map(t => {
              const suggestedPk = data.primaryKeySuggestions[t.name];
              if (suggestedPk && suggestedPk.length > 0) {
                return { ...t, primaryKey: suggestedPk };
              }
              return t;
            })
          );
        }

        toast.success(
          isAr ? 'تم كشف العلاقات بالذكاء الاصطناعي' : 'AI Data Modeling Completed',
          isAr
            ? `اكتشف الذكاء الاصطناعي (${data.model}) ${data.detectedRelationships?.length || 0} علاقة بين الشيتات.`
            : `AI engine (${data.model}) discovered ${data.detectedRelationships?.length || 0} relational constraints.`
        );
      } else {
        throw new Error(data.error || 'Failed to analyze relationships with AI');
      }
    } catch (err: any) {
      console.error('AI Data Modeling error:', err);
      toast.error(
        isAr ? 'فشل كشف العلاقات' : 'AI Modeling Failed',
        err.message || (isAr ? 'تعذر إتمام التحليل التلقائي' : 'Could not complete AI relationship discovery')
      );
    } finally {
      setIsAiModeling(false);
    }
  };

  // Apply AI Discovered Relationships into current Canvas
  const handleApplyAiRelationships = () => {
    if (!aiReport || !aiReport.detectedRelationships) return;

    const newRels: DataModelRelationship[] = aiReport.detectedRelationships.map((r, idx) => ({
      id: `rel-ai-${Date.now()}-${idx}`,
      sourceTable: r.sourceTable,
      sourceColumn: r.sourceColumn,
      targetTable: r.targetTable,
      targetColumn: r.targetColumn,
      relationshipType: r.relationshipType || '1:M',
      confidence: r.confidence || 90,
      description: r.description,
      descriptionAr: r.descriptionAr,
      isAiGenerated: true,
    }));

    // Merge non-duplicate relationships
    setRelationships(prev => {
      const existingKeys = new Set(prev.map(p => `${p.sourceTable}.${p.sourceColumn}->${p.targetTable}.${p.targetColumn}`));
      const filtered = newRels.filter(n => !existingKeys.has(`${n.sourceTable}.${n.sourceColumn}->${n.targetTable}.${n.targetColumn}`));
      return [...prev, ...filtered];
    });

    toast.success(
      isAr ? 'تم تطبيق علاقات الذكاء الاصطناعي' : 'AI Relationships Applied',
      isAr ? 'تم دمج جميع العلاقات المكتشفة بنجاح في نموذج البيانات.' : 'Merged AI discovered constraints into schema.'
    );
  };

  // Toggle Primary Key on a Column
  const handleTogglePrimaryKey = (tableName: string, colName: string) => {
    setTables(prev =>
      prev.map(t => {
        if (t.name === tableName) {
          const isPk = t.primaryKey?.includes(colName);
          const newPk = isPk
            ? (t.primaryKey || []).filter(k => k !== colName)
            : [...(t.primaryKey || []), colName];
          return { ...t, primaryKey: newPk };
        }
        return t;
      })
    );
  };

  // Open Relationship Modal
  const handleOpenAddRelationModal = (sourceTbl?: string, sourceCol?: string) => {
    setEditingRelId(null);
    const firstTbl = tables[0]?.name || '';
    const secondTbl = tables[1]?.name || firstTbl;

    const sTable = sourceTbl || firstTbl;
    setRelSourceTable(sTable);

    const sTblObj = tables.find(t => t.name === sTable);
    setRelSourceCol(sourceCol || sTblObj?.columns[0]?.name || '');

    setRelTargetTable(secondTbl);
    const tTblObj = tables.find(t => t.name === secondTbl);
    setRelTargetCol(tTblObj?.primaryKey?.[0] || tTblObj?.columns[0]?.name || '');

    setRelType('1:M');
    setRelDesc('');
    setShowRelationModal(true);
  };

  // Save Manual Relationship
  const handleSaveRelationship = () => {
    if (!relSourceTable || !relSourceCol || !relTargetTable || !relTargetCol) {
      toast.warning(
        isAr ? 'تنبيه البيانات' : 'Incomplete Fields',
        isAr ? 'يرجى تحديد جميع حقول الجدول والأعمدة للطرفين.' : 'Please select source and target tables & columns.'
      );
      return;
    }

    if (relSourceTable === relTargetTable && relSourceCol === relTargetCol) {
      toast.warning(
        isAr ? 'علاقة غاطئة' : 'Invalid Self-Reference',
        isAr ? 'لا يمكن ربط العمود بنفسه بنفس الجدول.' : 'Cannot connect column to itself.'
      );
      return;
    }

    if (editingRelId) {
      setRelationships(prev =>
        prev.map(r =>
          r.id === editingRelId
            ? {
                ...r,
                sourceTable: relSourceTable,
                sourceColumn: relSourceCol,
                targetTable: relTargetTable,
                targetColumn: relTargetCol,
                relationshipType: relType,
                description: relDesc,
                isAiGenerated: false,
              }
            : r
        )
      );
      toast.success(isAr ? 'تم تحديث العلاقة' : 'Relationship Updated');
    } else {
      const newRel: DataModelRelationship = {
        id: `rel-${Date.now()}`,
        sourceTable: relSourceTable,
        sourceColumn: relSourceCol,
        targetTable: relTargetTable,
        targetColumn: relTargetCol,
        relationshipType: relType,
        confidence: 100,
        description: relDesc || `Manual relationship: ${relSourceTable}.${relSourceCol} -> ${relTargetTable}.${relTargetCol}`,
        isAiGenerated: false,
      };
      setRelationships(prev => [...prev, newRel]);
      toast.success(isAr ? 'تمت إضافة العلاقة بنجاح' : 'Relationship Added Successfully');
    }

    setShowRelationModal(false);
  };

  // Delete Relationship
  const handleDeleteRelationship = (id: string) => {
    setRelationships(prev => prev.filter(r => r.id !== id));
    toast.info(isAr ? 'تم حذف العلاقة' : 'Relationship Deleted');
  };

  // Export Relational Excel Workbook (.xlsx)
  const handleExportRelationalExcel = () => {
    if (tables.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // 1. Add individual sheets for each table with FULL data
    tables.forEach(tbl => {
      const tableData = tbl.fullData && tbl.fullData.length > 0
        ? tbl.fullData
        : (tbl.dataSample && tbl.dataSample.length > 0
          ? tbl.dataSample
          : [
              tbl.columns.reduce((acc, c) => {
                acc[c.name] = `Sample_${c.type}`;
                return acc;
              }, {} as Record<string, any>),
            ]);

      const ws = XLSX.utils.json_to_sheet(tableData);
      XLSX.utils.book_append_sheet(workbook, ws, tbl.name.slice(0, 31)); // 31 char limit in Excel
    });

    // 2. Add Joined Data Output sheet if relationships exist
    if (relationships.length > 0) {
      const activeRel = relationships[0];
      const srcTbl = tables.find(t => t.name === activeRel.sourceTable);
      const tgtTbl = tables.find(t => t.name === activeRel.targetTable);

      if (srcTbl && tgtTbl) {
        const srcData = srcTbl.fullData && srcTbl.fullData.length > 0 ? srcTbl.fullData : (srcTbl.dataSample || []);
        const tgtData = tgtTbl.fullData && tgtTbl.fullData.length > 0 ? tgtTbl.fullData : (tgtTbl.dataSample || []);

        const tgtMap = new Map();
        tgtData.forEach(row => {
          const keyVal = String(row[activeRel.targetColumn] ?? '');
          if (keyVal) tgtMap.set(keyVal, row);
        });

        const joinedRows = srcData.map(sRow => {
          const fkVal = String(sRow[activeRel.sourceColumn] ?? '');
          const tRow = tgtMap.get(fkVal) || {};

          const combined: Record<string, any> = {};
          Object.entries(sRow).forEach(([k, v]) => {
            combined[`${activeRel.sourceTable}.${k}`] = v;
          });
          Object.entries(tRow).forEach(([k, v]) => {
            combined[`${activeRel.targetTable}.${k}`] = v;
          });
          return combined;
        });

        if (joinedRows.length > 0) {
          const joinedWs = XLSX.utils.json_to_sheet(joinedRows);
          XLSX.utils.book_append_sheet(workbook, joinedWs, '_Joined_Output');
        }
      }
    }

    // 3. Add Relational Schema Metadata sheet (_Schema_Relationships)
    const schemaRows = relationships.map(r => ({
      'Source Table (FK)': r.sourceTable,
      'Source FK Column': r.sourceColumn,
      'Relationship Type': r.relationshipType,
      'Target Table (PK)': r.targetTable,
      'Target PK Column': r.targetColumn,
      'Confidence %': `${r.confidence || 100}%`,
      'AI Generated': r.isAiGenerated ? 'YES' : 'NO',
      'Description / Notes': r.description || '',
    }));

    const schemaWs = XLSX.utils.json_to_sheet(schemaRows);
    XLSX.utils.book_append_sheet(workbook, schemaWs, '_Schema_Relationships');

    // Write file
    XLSX.writeFile(workbook, `${schemaTitle}_Relational_Model.xlsx`);

    toast.success(
      isAr ? 'تم تصدير ملف الأكسيل المترابط' : 'Relational Excel Exported',
      isAr ? 'تم تصدير ملف Excel الشامل ويتضمن ناتج الربط وشيت العلاقات.' : 'Exported multi-sheet Excel with joined data output and _Schema_Relationships schema metadata.'
    );
  };

  // Generate Multi-Dialect SQL DDL
  const generatedSqlDdl = useMemo(() => {
    let sql = `-- ==========================================================\n`;
    sql += `-- Relational Data Model DDL Export\n`;
    sql += `-- Title: ${schemaTitle}\n`;
    sql += `-- Dialect: ${exportSqlDialect.toUpperCase()}\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `-- ==========================================================\n\n`;

    const mapType = (type: string) => {
      switch (type) {
        case 'integer':
          return exportSqlDialect === 'postgres' ? 'INT' : 'INTEGER';
        case 'float':
          return exportSqlDialect === 'postgres' ? 'DOUBLE PRECISION' : 'FLOAT';
        case 'date':
          return exportSqlDialect === 'oracle' ? 'DATE' : 'DATE';
        case 'boolean':
          return exportSqlDialect === 'oracle' ? 'NUMBER(1)' : 'BOOLEAN';
        case 'category':
          return 'VARCHAR(100)';
        default:
          return 'VARCHAR(255)';
      }
    };

    // Create Tables
    tables.forEach(tbl => {
      sql += `-- Table: ${tbl.name}\n`;
      sql += `CREATE TABLE ${tbl.name} (\n`;

      const colDefs = tbl.columns.map(c => {
        const isPk = tbl.primaryKey?.includes(c.name);
        const typeStr = mapType(c.type);
        const nullStr = c.nullable ? '' : ' NOT NULL';
        const pkStr = isPk && tbl.primaryKey?.length === 1 ? ' PRIMARY KEY' : '';
        return `  ${c.name} ${typeStr}${nullStr}${pkStr}`;
      });

      if (tbl.primaryKey && tbl.primaryKey.length > 1) {
        colDefs.push(`  PRIMARY KEY (${tbl.primaryKey.join(', ')})`);
      }

      sql += colDefs.join(',\n');
      sql += `\n);\n\n`;
    });

    // Foreign Keys
    if (relationships.length > 0) {
      sql += `-- ==========================================================\n`;
      sql += `-- Foreign Key Constraints & Relationships (${relationships.length})\n`;
      sql += `-- ==========================================================\n\n`;

      relationships.forEach((r, idx) => {
        const fkName = `fk_${r.sourceTable}_${r.sourceColumn}_idx`;
        sql += `ALTER TABLE ${r.sourceTable}\n`;
        sql += `  ADD CONSTRAINT ${fkName}\n`;
        sql += `  FOREIGN KEY (${r.sourceColumn})\n`;
        sql += `  REFERENCES ${r.targetTable} (${r.targetColumn})\n`;
        sql += `  ON DELETE CASCADE ON UPDATE CASCADE;\n\n`;
      });
    }

    return sql;
  }, [tables, relationships, schemaTitle, exportSqlDialect]);

  // Generate Mermaid ERD Markdown
  const generatedMermaidErd = useMemo(() => {
    let m = `\`\`\`mermaid\nerDiagram\n`;

    tables.forEach(tbl => {
      m += `    ${tbl.name} {\n`;
      tbl.columns.forEach(c => {
        const isPk = tbl.primaryKey?.includes(c.name) ? 'PK' : '';
        const isFk = relationships.some(r => r.sourceTable === tbl.name && r.sourceColumn === c.name) ? 'FK' : '';
        const keyTag = isPk && isFk ? 'PK,FK' : isPk ? 'PK' : isFk ? 'FK' : '';
        m += `        ${c.type} ${c.name} ${keyTag ? `"${keyTag}"` : ''}\n`;
      });
      m += `    }\n`;
    });

    relationships.forEach(r => {
      const symbol = r.relationshipType === '1:1' ? '||--||' : r.relationshipType === 'M:M' ? '}|--|{' : '||--|{';
      m += `    ${r.targetTable} ${symbol} ${r.sourceTable} : "${r.sourceColumn}"\n`;
    });

    m += `\`\`\``;
    return m;
  }, [tables, relationships]);

  // Generate Full Relational Schema Metadata JSON
  const generatedJsonMetadata = useMemo(() => {
    const metadata = {
      $schema: 'https://carbon-data-ai.internal/schema/v1/data-model.json',
      schemaTitle,
      exportedAt: new Date().toISOString(),
      dialect: exportSqlDialect,
      stats: {
        tableCount: tables.length,
        relationshipCount: relationships.length,
        totalRows: tables.reduce((acc, t) => acc + (t.rowCount || 0), 0),
      },
      tables: tables.map(t => ({
        id: t.id,
        name: t.name,
        rowCount: t.rowCount,
        primaryKey: t.primaryKey || [],
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
        })),
      })),
      relationships: relationships.map(r => ({
        id: r.id,
        sourceTable: r.sourceTable,
        sourceColumn: r.sourceColumn,
        targetTable: r.targetTable,
        targetColumn: r.targetColumn,
        relationshipType: r.relationshipType,
        confidence: r.confidence || 100,
        description: r.description || '',
        isAiGenerated: Boolean(r.isAiGenerated),
      })),
    };
    return JSON.stringify(metadata, null, 2);
  }, [tables, relationships, schemaTitle, exportSqlDialect]);

  // Generate Schema Mapping Code (Prisma, Drizzle ORM, TypeScript Types)
  const generatedSchemaMappingCode = useMemo(() => {
    // Prisma Schema
    let prisma = `// Prisma Schema Definition (schema.prisma)\n`;
    prisma += `datasource db {\n  provider = "${exportSqlDialect === 'postgres' ? 'postgresql' : exportSqlDialect}"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\n`;

    tables.forEach(t => {
      prisma += `model ${t.name} {\n`;
      t.columns.forEach(c => {
        const isPk = t.primaryKey?.includes(c.name);
        let pType = 'String';
        if (c.type === 'integer') pType = 'Int';
        if (c.type === 'float') pType = 'Float';
        if (c.type === 'boolean') pType = 'Boolean';
        if (c.type === 'date') pType = 'DateTime';

        const pkAttr = isPk ? ' @id' : '';
        const nullAttr = c.nullable && !isPk ? '?' : '';
        prisma += `  ${c.name.padEnd(16)} ${pType}${nullAttr}${pkAttr}\n`;
      });

      // Add Prisma relational fields
      const outRels = relationships.filter(r => r.sourceTable === t.name);
      outRels.forEach(r => {
        prisma += `  ${r.targetTable.toLowerCase()} ${r.targetTable} @relation(fields: [${r.sourceColumn}], references: [${r.targetColumn}])\n`;
      });

      prisma += `}\n\n`;
    });

    // Drizzle ORM Schema
    let drizzle = `// Drizzle ORM Schema Definition (src/db/schema.ts)\nimport { pgTable, serial, text, integer, doublePrecision, timestamp, boolean } from 'drizzle-orm/pg-core';\n\n`;
    tables.forEach(t => {
      const varName = t.name.charAt(0).toLowerCase() + t.name.slice(1);
      drizzle += `export const ${varName} = pgTable('${t.name}', {\n`;
      t.columns.forEach(c => {
        const isPk = t.primaryKey?.includes(c.name);
        let dType = `text('${c.name}')`;
        if (c.type === 'integer') dType = isPk ? `serial('${c.name}')` : `integer('${c.name}')`;
        if (c.type === 'float') dType = `doublePrecision('${c.name}')`;
        if (c.type === 'boolean') dType = `boolean('${c.name}')`;
        if (c.type === 'date') dType = `timestamp('${c.name}')`;

        const chain = isPk ? '.primaryKey()' : c.nullable ? '' : '.notNull()';
        drizzle += `  ${c.name}: ${dType}${chain},\n`;
      });
      drizzle += `});\n\n`;
    });

    // TypeScript Global Interfaces
    let tsTypes = `// TypeScript Data Models (types.ts)\n\n`;
    tables.forEach(t => {
      tsTypes += `export interface ${t.name} {\n`;
      t.columns.forEach(c => {
        let tType = 'string';
        if (c.type === 'integer' || c.type === 'float') tType = 'number';
        if (c.type === 'boolean') tType = 'boolean';
        if (c.type === 'date') tType = 'string | Date';
        tsTypes += `  ${c.name}${c.nullable ? '?' : ''}: ${tType};\n`;
      });
      tsTypes += `}\n\n`;
    });

    return { prisma, drizzle, tsTypes };
  }, [tables, relationships, exportSqlDialect]);

  const handleDownloadJsonFile = () => {
    const blob = new Blob([generatedJsonMetadata], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaTitle}_DataModel_Schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      isAr ? 'تم تحميل ملف JSON بنجاح' : 'JSON Schema Downloaded',
      isAr ? 'تم حفظ ملف وصف النموذج بنمط JSON.' : 'Saved data model metadata schema file.'
    );
  };

  const handleDownloadSqlFile = () => {
    const blob = new Blob([generatedSqlDdl], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaTitle}_${exportSqlDialect.toUpperCase()}_Schema.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      isAr ? 'تم تحميل ملف SQL DDL بنجاح' : 'SQL Script Downloaded',
      isAr ? `تم حفظ سكريبت الإنشاء بهيكلية ${exportSqlDialect.toUpperCase()}.` : `Saved ${exportSqlDialect.toUpperCase()} DDL script.`
    );
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Carbon Studio Header Banner */}
      <div className="bg-[#1f1f1f] border border-[#393939] p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#78a9ff] shrink-0">
            <Workflow className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-mono font-bold uppercase text-[#f4f4f4] truncate">
                {isAr ? 'استوديو نمذجة البيانات والعلاقات' : 'Data Modeling & ERD Studio'}
              </h1>
              <span className="px-2 py-0.5 bg-[#0f62fe]/20 border border-[#0f62fe]/40 text-[#78a9ff] text-xs font-mono font-bold">
                {tables.length} {isAr ? 'شيتات / جداول' : 'Sheets / Tables'}
              </span>
              <span className="px-2 py-0.5 bg-[#8a3ffc]/20 border border-[#8a3ffc]/40 text-[#be95ff] text-xs font-mono font-bold">
                {relationships.length} {isAr ? 'علاقات (PK/FK)' : 'Relationships'}
              </span>
            </div>
            <p className="text-xs text-[#c6c6c6] mt-1">
              {isAr
                ? 'استيراد ملفات الأكسيل متعددة الشيتات، بناء علاقات الجداول (1:1، 1:M، M:M)، النمذجة التلقائية بالذكاء الاصطناعي والتصدير المباشر'
                : 'Import multi-sheet Excel workbooks, design relational constraints (1:1, 1:M, M:M), AI auto-modeling, and export DDL/Excel'}
            </p>
          </div>
        </div>

        {/* Action Controls Group */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Upload Multi-CSV / Excel Files */}
          <label className="px-3 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-lg">
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isAr ? 'تحميل ملفات CSV / أكسيل' : 'Upload CSV / Excel Files'}</span>
            <input
              type="file"
              accept=".xlsx, .xls, .ods, .csv"
              multiple
              onChange={handleExcelFileUpload}
              disabled={isParsingExcel}
              className="hidden"
            />
          </label>

          {/* Auto-Suggest PK/FK Mappings AI Trigger */}
          <button
            onClick={handleAiAutoModeling}
            disabled={isAiModeling || tables.length < 2}
            className="px-3.5 py-2 bg-[#8a3ffc] hover:bg-[#7828c8] text-white text-xs font-mono font-bold flex items-center gap-2 transition-all duration-200 disabled:opacity-50 shadow-lg border border-[#be95ff]/30"
            title={isAr ? `تحليل أعمدة CSV واقتراح المفاتيح الأساسية/الأجنبية بنسبة الثقة بواسطة ${currentModelDef.name}` : `Analyze CSV column schemas to automatically suggest primary/foreign key mappings with confidence scores using ${currentModelDef.name}`}
          >
            <Sparkles className={`w-4 h-4 text-[#be95ff] ${isAiModeling ? 'animate-spin' : ''}`} />
            <div className="flex flex-col text-start">
              <span>{isAr ? 'اقتراح مفاتيح PK/FK (AI Mappings)' : 'Auto-Suggest PK/FK Mappings'}</span>
              <span className="text-[9px] text-[#e8daff] font-normal opacity-90">
                {currentModelDef.name} ({currentModelDef.provider})
              </span>
            </div>
          </button>

          {/* Download Schema Modal Launcher */}
          <button
            onClick={() => setShowDownloadSchemaModal(true)}
            disabled={tables.length === 0}
            className="px-3 py-2 bg-[#24a148] hover:bg-[#198038] text-white text-xs font-mono font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg"
            title={isAr ? 'تصدير سكريبت SQL DDL أو ملف JSON metadata للمخطط الحالي' : 'Export relational mapping (relationships, primary/foreign keys, and data types) as SQL DDL or JSON'}
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'تحميل المخطط (Download Schema)' : 'Download Schema'}</span>
          </button>

          {/* Add Manual Relationship */}
          <button
            onClick={() => handleOpenAddRelationModal()}
            disabled={tables.length < 2}
            className="px-3 py-2 bg-[#393939] hover:bg-[#4c4c4c] border border-[#525252] text-[#f4f4f4] text-xs font-mono font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'إضافة علاقة يدوية' : 'Add Relationship'}</span>
          </button>

          {/* Import Workspace Datasets */}
          <button
            onClick={handleImportWorkspaceDatasets}
            className="px-3 py-2 bg-[#262626] hover:bg-[#393939] border border-[#393939] text-[#c6c6c6] hover:text-[#f4f4f4] text-xs font-mono flex items-center gap-2 transition-colors"
            title={isAr ? 'استيراد مجموعات البيانات المفتوحة في مساحة العمل' : 'Import open workspace datasets'}
          >
            <Database className="w-4 h-4 text-[#007d79]" />
            <span>{isAr ? 'جداول مساحة العمل' : 'Workspace Tables'}</span>
          </button>
        </div>
      </div>

      {/* Model Sub-Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[#393939] bg-[#161616] px-2 text-xs font-mono">
        <div className="flex items-center space-x-1 rtl:space-x-reverse">
          <button
            onClick={() => setActiveTab('canvas')}
            className={`px-4 py-3 flex items-center gap-2 border-b-2 font-bold transition-colors ${
              activeTab === 'canvas'
                ? 'border-[#0f62fe] bg-[#262626] text-[#78a9ff]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#f4f4f4]'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>{isAr ? 'لوحة الشيتات والجداول (ERD Canvas)' : 'Sheets ERD Canvas'}</span>
            <span className="px-1.5 py-0.2 bg-[#393939] text-[#f4f4f4] text-[10px]">
              {tables.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('relationships')}
            className={`px-4 py-3 flex items-center gap-2 border-b-2 font-bold transition-colors ${
              activeTab === 'relationships'
                ? 'border-[#0f62fe] bg-[#262626] text-[#78a9ff]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#f4f4f4]'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>{isAr ? 'سجل العلاقات والمفاتيح (Constraints)' : 'Relationships Matrix'}</span>
            <span className="px-1.5 py-0.2 bg-[#393939] text-[#f4f4f4] text-[10px]">
              {relationships.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-3 flex items-center gap-2 border-b-2 font-bold transition-colors ${
              activeTab === 'preview'
                ? 'border-[#0f62fe] bg-[#262626] text-[#78a9ff]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#f4f4f4]'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>{isAr ? 'معاينة الدمج المباشر (Joined Preview)' : 'Joined Data Preview'}</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-3 flex items-center gap-2 border-b-2 font-bold transition-colors ${
              activeTab === 'export'
                ? 'border-[#0f62fe] bg-[#262626] text-[#78a9ff]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#f4f4f4]'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'تصدير النموذج المترابط (Export DDL/Excel)' : 'Export Relational Model'}</span>
          </button>
        </div>

        {/* Active AI Model Badge & Selector */}
        <div className="flex items-center gap-2 py-1 px-3 bg-[#1f1f1f] border border-[#393939]">
          {currentModelDef.isLocal ? (
            <Lock className="w-3.5 h-3.5 text-[#42be65]" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-[#78a9ff]" />
          )}
          <span className="text-[#8d8d8d] hidden sm:inline">{isAr ? 'محرك النمذجة:' : 'Modeling AI:'}</span>
          <select
            value={selectedModelId}
            onChange={e => setSelectedModelId(e.target.value)}
            className="bg-transparent text-[#f4f4f4] font-bold outline-none cursor-pointer text-xs"
          >
            {availableAIModels.map(m => (
              <option key={m.id} value={m.id} className="bg-[#262626] text-white">
                {m.isLocal ? '🔒 ' : '☁️ '} {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Discovered Recommendations Panel (if available) */}
      {aiReport && (
        <div className="p-4 bg-[#1f1f1f] border border-[#8a3ffc]/50 space-y-4 animate-fade-in shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#393939] pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#8a3ffc]/20 border border-[#8a3ffc] flex items-center justify-center text-[#be95ff]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-mono font-bold text-[#f4f4f4]">
                    {isAr ? 'تقرير اقتراحات العلاقات والمفاتيح (AI PK/FK Schema Analysis)' : 'AI Schema Analysis & Key Suggestions'}
                  </h4>
                  <span className="px-2 py-0.5 bg-[#8a3ffc]/30 border border-[#8a3ffc]/50 text-[#be95ff] text-[10px] font-mono font-bold">
                    {aiReport.model}
                  </span>
                </div>
                <p className="text-xs text-[#c6c6c6] mt-0.5">
                  {isAr ? aiReport.summaryAr : aiReport.summaryEn}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyAiRelationships}
                className="px-3 py-1.5 bg-[#8a3ffc] hover:bg-[#7828c8] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{isAr ? 'تطبيق كل العلاقات المكتشفة' : 'Apply All Discovered Mappings'}</span>
              </button>
              <button
                onClick={() => setAiReport(null)}
                className="p-1.5 hover:bg-[#393939] text-[#c6c6c6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Primary & Foreign Key Mappings Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Primary Key Suggestions */}
            {aiReport.primaryKeySuggestions && Object.keys(aiReport.primaryKeySuggestions).length > 0 && (
              <div className="p-3 bg-[#161616] border border-[#393939] space-y-2">
                <div className="flex items-center gap-1.5 text-[#f1c21b] font-bold">
                  <Key className="w-4 h-4" />
                  <span>{isAr ? 'المفاتيح الرئيسية المقترحة (Primary Keys):' : 'Suggested Primary Keys:'}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(aiReport.primaryKeySuggestions).map(([tblName, pkCols]) => (
                    <div key={tblName} className="p-1.5 bg-[#1f1f1f] border border-[#262626] flex items-center justify-between">
                      <span className="text-[#f4f4f4] font-semibold">{tblName}</span>
                      <span className="px-2 py-0.5 bg-[#f1c21b]/10 border border-[#f1c21b]/40 text-[#f1c21b] text-[11px]">
                        PK: {Array.isArray(pkCols) ? pkCols.join(', ') : String(pkCols)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Foreign Key Link Mappings with Confidence Scores */}
            {aiReport.detectedRelationships && aiReport.detectedRelationships.length > 0 && (
              <div className="p-3 bg-[#161616] border border-[#393939] space-y-2 md:col-span-2">
                <div className="flex items-center gap-1.5 text-[#78a9ff] font-bold">
                  <LinkIcon className="w-4 h-4" />
                  <span>{isAr ? 'روابط المفاتيح الأجنبية ونسبة الثقة (Foreign Key Mappings & Confidence):' : 'Foreign Key Link Mappings & Confidence Scores:'}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {aiReport.detectedRelationships.map((r: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-[#1f1f1f] border border-[#262626] hover:border-[#8a3ffc]/40 transition-colors space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-[#f4f4f4]">
                          <span className="text-[#78a9ff]">{r.sourceTable}.{r.sourceColumn}</span>
                          <span className="text-[#be95ff]">➔ [{r.relationshipType || '1:M'}] ➔</span>
                          <span className="text-[#42be65]">{r.targetTable}.{r.targetColumn}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-[#8a3ffc]/20 border border-[#8a3ffc]/50 text-[#be95ff] font-bold text-[10px]">
                          {r.confidence || 90}% {isAr ? 'ثقة' : 'Confidence'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8d8d8d] leading-normal">
                        {isAr ? (r.descriptionAr || r.description) : (r.description || r.descriptionAr)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW TAB 1: Visual ERD Canvas Cards Matrix */}
      {activeTab === 'canvas' && (
        <div className="space-y-6">
          {tables.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-[#393939] bg-[#161616] text-center space-y-4">
              <div className="w-16 h-16 bg-[#0f62fe]/10 border border-[#0f62fe]/40 flex items-center justify-center mx-auto text-[#78a9ff]">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-base font-mono font-bold text-[#f4f4f4]">
                {isAr ? 'لا توجد شيتات أو جداول محملة حالياً' : 'No Sheets or Tables Loaded Yet'}
              </h3>
              <p className="text-xs text-[#8d8d8d] max-w-md mx-auto">
                {isAr
                  ? 'يرجى رفع ملف أكسيل يحتوي على عدة ورقات عمل (Sheets)، أو استيراد الجداول من مساحة العمل لبدء ربط العلاقات وتحديد المفاتيح الأساسية والأجنبية.'
                  : 'Please upload a multi-sheet Excel workbook or import workspace datasets to begin visual ERD data modeling.'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <label className="px-4 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold cursor-pointer transition-colors flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isAr ? 'تحميل ملف أكسيل' : 'Upload Excel Workbook'}</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .ods"
                    onChange={handleExcelFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleImportWorkspaceDatasets}
                  className="px-4 py-2 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-xs font-mono font-bold flex items-center gap-2 transition-colors"
                >
                  <Database className="w-4 h-4 text-[#007d79]" />
                  <span>{isAr ? 'استيراد جداول مساحة العمل' : 'Import Workspace Tables'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {tables.map(tbl => {
                const tableRels = relationships.filter(
                  r => r.sourceTable === tbl.name || r.targetTable === tbl.name
                );

                return (
                  <div
                    key={tbl.id}
                    className="bg-[#1f1f1f] border border-[#393939] hover:border-[#0f62fe] transition-all duration-200 shadow-xl flex flex-col overflow-hidden group"
                  >
                    {/* Table Header Accent */}
                    <div
                      className="p-3 text-white flex items-center justify-between border-b border-[#393939]"
                      style={{ backgroundColor: `${tbl.color || '#0f62fe'}20`, borderColor: tbl.color || '#0f62fe' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Table className="w-4 h-4 shrink-0" style={{ color: tbl.color || '#78a9ff' }} />
                        <span className="font-mono font-bold text-sm truncate text-[#f4f4f4]">{tbl.name}</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-[#161616] text-[#c6c6c6] text-[10px] font-mono border border-[#393939] shrink-0">
                        {tbl.rowCount} {isAr ? 'صف' : 'rows'}
                      </span>
                    </div>

                    {/* Columns List */}
                    <div className="p-3 space-y-1.5 flex-1 max-h-72 overflow-y-auto">
                      {tbl.columns.map(col => {
                        const isPk = tbl.primaryKey?.includes(col.name);
                        const isFk = relationships.some(
                          r => r.sourceTable === tbl.name && r.sourceColumn === col.name
                        );

                        return (
                          <div
                            key={col.name}
                            className={`p-1.5 text-xs font-mono flex items-center justify-between border transition-colors ${
                              isPk
                                ? 'bg-[#f1c21b]/10 border-[#f1c21b]/40 text-[#f1c21b]'
                                : isFk
                                ? 'bg-[#0f62fe]/10 border-[#0f62fe]/40 text-[#78a9ff]'
                                : 'bg-[#161616] border-[#262626] text-[#c6c6c6] hover:border-[#393939]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* Primary Key Toggle Button */}
                              <button
                                onClick={() => handleTogglePrimaryKey(tbl.name, col.name)}
                                title={isPk ? (isAr ? 'إلغاء تعيين كمفتاح رئيسي' : 'Remove Primary Key') : (isAr ? 'تعيين كمفتاح رئيسي PK' : 'Set as Primary Key')}
                                className={`p-0.5 hover:scale-110 transition-transform ${isPk ? 'text-[#f1c21b]' : 'text-[#525252] hover:text-[#f4f4f4]'}`}
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>

                              <span className="truncate font-semibold">{col.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Quick Connect FK Trigger */}
                              <button
                                onClick={() => handleOpenAddRelationModal(tbl.name, col.name)}
                                className="p-0.5 text-[#525252] hover:text-[#78a9ff] transition-colors"
                                title={isAr ? 'ربط هذا العمود بجدول آخر' : 'Connect column as Foreign Key'}
                              >
                                <LinkIcon className="w-3 h-3" />
                              </button>

                              <span className="px-1 py-0.2 bg-[#262626] text-[#8d8d8d] text-[9px] uppercase border border-[#393939]">
                                {col.type}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Relations Count */}
                    <div className="p-2.5 bg-[#161616] border-t border-[#393939] flex items-center justify-between text-[11px] font-mono text-[#8d8d8d]">
                      <div className="flex items-center gap-1">
                        <LinkIcon className="w-3 h-3 text-[#0f62fe]" />
                        <span>{tableRels.length} {isAr ? 'علاقات' : 'linked'}</span>
                      </div>
                      <button
                        onClick={() => handleOpenAddRelationModal(tbl.name)}
                        className="text-[#78a9ff] hover:underline flex items-center gap-0.5"
                      >
                        <span>{isAr ? '+ ربط جديد' : '+ Link'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW TAB 2: Relationships Matrix List */}
      {activeTab === 'relationships' && (
        <div className="bg-[#1f1f1f] border border-[#393939] p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                {isAr ? 'جدول العلاقات والقيود الهيكلية (Relational Constraints)' : 'Relational Constraint Matrix'}
              </h3>
              <p className="text-xs text-[#c6c6c6] mt-0.5">
                {isAr ? 'جميع القيود والعلاقات المحددة بين الشيتات يدوياً أو المكتشفة بالذكاء الاصطناعي' : 'All foreign key relationships and cardinalities across sheets.'}
              </p>
            </div>

            <button
              onClick={() => handleOpenAddRelationModal()}
              disabled={tables.length < 2}
              className="px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة علاقة جديدة' : 'Add New Constraint'}</span>
            </button>
          </div>

          {relationships.length === 0 ? (
            <div className="p-8 border border-[#393939] bg-[#161616] text-center text-[#8d8d8d] font-mono text-xs space-y-2">
              <LinkIcon className="w-8 h-8 text-[#525252] mx-auto" />
              <p>{isAr ? 'لم يتم إنشاؤ أي علاقات بين الشيتات بعد.' : 'No relationships created yet.'}</p>
              <p className="text-[11px] text-[#525252]">
                {isAr ? 'اضغط "نمذجة بالذكاء الاصطناعي" للاكتشاف التلقائي، أو أضف علاقات يدوياً.' : 'Click "Data Modeling with AI" or add relationships manually.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#393939]">
              <table className="w-full text-start border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-[#161616] border-b border-[#393939] text-[#8d8d8d]">
                    <th className="p-3 text-start">#</th>
                    <th className="p-3 text-start">{isAr ? 'الجدول المصدر (FK Table)' : 'Source Table'}</th>
                    <th className="p-3 text-start">{isAr ? 'العمود المفتاح (FK)' : 'Source FK Column'}</th>
                    <th className="p-3 text-center">{isAr ? 'نوع العلاقة' : 'Cardinality'}</th>
                    <th className="p-3 text-start">{isAr ? 'الجدول المستهدف (PK Table)' : 'Target Table'}</th>
                    <th className="p-3 text-start">{isAr ? 'المفتاح الرئيسي (PK)' : 'Target PK Column'}</th>
                    <th className="p-3 text-center">{isAr ? 'المصدر' : 'Source'}</th>
                    <th className="p-3 text-[#393939] text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#393939] text-[#f4f4f4]">
                  {relationships.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-[#262626] transition-colors">
                      <td className="p-3 text-[#8d8d8d]">{idx + 1}</td>
                      <td className="p-3 font-bold text-[#78a9ff]">{r.sourceTable}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-[#0f62fe]/10 border border-[#0f62fe]/30 text-[#78a9ff]">
                          {r.sourceColumn}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-[#8a3ffc]/20 border border-[#8a3ffc]/40 text-[#be95ff] font-bold">
                          {r.relationshipType}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-[#42be65]">{r.targetTable}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-[#24a148]/10 border border-[#24a148]/30 text-[#42be65]">
                          {r.targetColumn}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {r.isAiGenerated ? (
                          <span className="px-2 py-0.5 bg-[#8a3ffc]/20 text-[#be95ff] text-[10px] flex items-center justify-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>AI ({r.confidence}%)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-[#393939] text-[#c6c6c6] text-[10px]">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRelationship(r.id)}
                          className="p-1 text-[#ff8389] hover:bg-[#da1e28]/20 transition-colors"
                          title={isAr ? 'حذف العلاقة' : 'Delete Relationship'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW TAB 3: Joined Data Live Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          <MergedDataPreviewTable
            tables={tables}
            relationships={relationships}
            language={isAr ? 'ar' : 'en'}
          />
        </div>
      )}

      {/* VIEW TAB 4: Multi-Format Model Exporter */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Relational Excel Export */}
            <div className="bg-[#1f1f1f] border border-[#393939] p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#24a148]/20 border border-[#24a148] flex items-center justify-center text-[#42be65]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                      {isAr ? 'تصدير كملف أكسيل مترابط (.xlsx)' : 'Export Relational Excel (.xlsx)'}
                    </h3>
                    <p className="text-xs text-[#c6c6c6] mt-0.5">
                      {isAr ? 'يتضمن شيتات البيانات بالإضافة لشيت خاص بالبيانات الوصفية والعلاقات (_Schema_Relationships)' : 'Exports multi-sheet workbook with _Schema_Relationships schema sheet.'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-[#161616] border border-[#393939] text-xs font-mono space-y-1.5 text-[#c6c6c6]">
                  <div className="flex justify-between">
                    <span>{isAr ? 'اسم الملف:' : 'Filename:'}</span>
                    <span className="text-[#f4f4f4] font-bold truncate max-w-[150px]">{schemaTitle}_Relational_Model.xlsx</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? 'الشيتات:' : 'Worksheets:'}</span>
                    <span className="text-[#78a9ff] font-bold">{tables.length} sheets + 1 schema</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? 'العلاقات المسجلة:' : 'Relationships:'}</span>
                    <span className="text-[#be95ff] font-bold">{relationships.length} constraints</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportRelationalExcel}
                disabled={tables.length === 0}
                className="w-full py-2.5 bg-[#24a148] hover:bg-[#198038] text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors shadow"
              >
                <Download className="w-4 h-4" />
                <span>{isAr ? 'تحميل ملف Excel المترابط' : 'Download Excel Workbook'}</span>
              </button>
            </div>

            {/* 2. Full Relational Schema JSON Metadata Export */}
            <div className="bg-[#1f1f1f] border border-[#393939] p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#8a3ffc]/20 border border-[#8a3ffc] flex items-center justify-center text-[#be95ff]">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                      {isAr ? 'تصدير المخطط بنمط JSON (.json)' : 'Export Schema Metadata JSON (.json)'}
                    </h3>
                    <p className="text-xs text-[#c6c6c6] mt-0.5">
                      {isAr ? 'بيانات هيكلية شاملة للمفاهيم، الجداول، والمفاتيح الخارجية للاستخدام الخارجي' : 'Export standard JSON schema definition including tables & constraints.'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-[#161616] border border-[#393939] text-xs font-mono space-y-1.5 text-[#c6c6c6]">
                  <div className="flex justify-between">
                    <span>{isAr ? 'نمط Schema:' : 'Schema Version:'}</span>
                    <span className="text-[#be95ff] font-bold">v1.0 (Carbon Standard)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? 'حجم الجداول:' : 'Total Tables:'}</span>
                    <span className="text-[#78a9ff] font-bold">{tables.length} metadata objects</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? 'حجم المفاتيح:' : 'Total Relations:'}</span>
                    <span className="text-[#42be65] font-bold">{relationships.length} mapped links</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadJsonFile}
                  disabled={tables.length === 0}
                  className="py-2.5 bg-[#8a3ffc] hover:bg-[#7828c8] text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>{isAr ? 'تحميل JSON' : 'Download .json'}</span>
                </button>

                <button
                  onClick={() => handleCopyCode(generatedJsonMetadata)}
                  className="py-2.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>{isAr ? 'نسخ JSON' : 'Copy JSON'}</span>
                </button>
              </div>
            </div>

            {/* 3. Multi-Dialect SQL Script Download */}
            <div className="bg-[#1f1f1f] border border-[#393939] p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#78a9ff]">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                        {isAr ? 'تحميل سكريبت SQL DDL' : 'Download SQL DDL Script'}
                      </h3>
                      <p className="text-xs text-[#c6c6c6] mt-0.5">
                        {isAr ? 'توليد سكريبت إنشاء الجداول والقيود جاهز للتنفيذ' : 'Generates CREATE TABLE & foreign keys DDL script.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#161616] border border-[#393939] text-xs font-mono space-y-1.5 text-[#c6c6c6]">
                  <div className="flex justify-between items-center">
                    <span>{isAr ? 'لهجة SQL:' : 'SQL Dialect:'}</span>
                    <select
                      value={exportSqlDialect}
                      onChange={e => setExportSqlDialect(e.target.value as any)}
                      className="bg-[#262626] border border-[#393939] text-[#78a9ff] font-bold px-2 py-0.5 text-[11px] outline-none"
                    >
                      <option value="postgres">PostgreSQL</option>
                      <option value="mysql">MySQL / MariaDB</option>
                      <option value="sqlite">SQLite 3</option>
                      <option value="sqlserver">SQL Server (TSQL)</option>
                      <option value="oracle">Oracle Database</option>
                    </select>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? 'البيانات المنشأة:' : 'Generated Rules:'}</span>
                    <span className="text-[#42be65] font-bold">{tables.length} DDLs + {relationships.length} FKs</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadSqlFile}
                  disabled={tables.length === 0}
                  className="py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>{isAr ? 'تحميل .sql' : 'Download .sql'}</span>
                </button>

                <button
                  onClick={() => handleCopyCode(generatedSqlDdl)}
                  className="py-2.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>{isAr ? 'نسخ SQL' : 'Copy DDL'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Schema Mapping Code Generators (Prisma, Drizzle, SQL DDL, JSON) */}
          <div className="bg-[#1f1f1f] border border-[#393939] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#007d79]/20 border border-[#007d79] flex items-center justify-center text-[#007d79]">
                  <Code className="w-5 h-5 text-[#6fdc8c]" />
                </div>
                <div>
                  <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                    {isAr ? 'كود تعيين المخطط والهيكلية (Schema Mapping Code)' : 'Schema Mapping Code Generator'}
                  </h3>
                  <p className="text-xs text-[#c6c6c6] mt-0.5">
                    {isAr ? 'توليد تلقائي لكود تعيين النماذج للغات البرمجة وأطر العمل (Prisma, Drizzle, TypeScript, DDL)' : 'Auto-generated schema code for Prisma, Drizzle ORM, TypeScript interfaces, and SQL.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-[#393939] bg-[#161616]">
              <div className="flex items-center border-b border-[#393939] bg-[#1f1f1f] px-2 text-xs font-mono">
                <button
                  onClick={() => setExportSqlDialect('postgres')}
                  className="px-3 py-2 text-[#78a9ff] border-b-2 border-[#0f62fe] font-bold"
                >
                  Prisma Schema (.prisma)
                </button>
                <button
                  onClick={() => setExportSqlDialect('postgres')}
                  className="px-3 py-2 text-[#6fdc8c] font-bold hover:text-white"
                >
                  Drizzle ORM (schema.ts)
                </button>
                <button
                  onClick={() => setExportSqlDialect('postgres')}
                  className="px-3 py-2 text-[#be95ff] font-bold hover:text-white"
                >
                  TypeScript Interfaces
                </button>
              </div>

              <div className="relative p-3 max-h-80 overflow-y-auto">
                <pre className="text-[#f4f4f4] font-mono text-[11px] whitespace-pre">
                  {generatedSchemaMappingCode.prisma}
                </pre>
                <button
                  onClick={() => handleCopyCode(generatedSchemaMappingCode.prisma)}
                  className="absolute top-2 right-2 rtl:right-auto rtl:left-2 px-2.5 py-1 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-[10px] font-mono flex items-center gap-1 transition-colors"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ Prisma' : 'Copy Prisma')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL RELATIONSHIP MODAL */}
      {showRelationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#262626] border border-[#393939] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-4 bg-[#1f1f1f] border-b border-[#393939] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-[#0f62fe]" />
                <h3 className="text-sm font-mono font-bold uppercase text-[#f4f4f4]">
                  {editingRelId
                    ? (isAr ? 'تعديل علاقة هيكلية' : 'Edit Relationship')
                    : (isAr ? 'إضافة علاقة جديدة بين شيتين' : 'Create New Foreign Key Relationship')}
                </h3>
              </div>
              <button
                onClick={() => setShowRelationModal(false)}
                className="p-1 hover:bg-[#393939] text-[#c6c6c6]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-mono">
              {/* Source Table & Column (FK) */}
              <div className="space-y-2 p-3 bg-[#1f1f1f] border border-[#393939]">
                <label className="text-[#78a9ff] font-bold block uppercase">
                  1. {isAr ? 'الجدول المصدر (حاوي المفتاح الأجنبي FK)' : 'Source Table (Contains Foreign Key)'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={relSourceTable}
                    onChange={e => {
                      const tName = e.target.value;
                      setRelSourceTable(tName);
                      const tObj = tables.find(t => t.name === tName);
                      setRelSourceCol(tObj?.columns[0]?.name || '');
                    }}
                    className="bg-[#262626] border border-[#393939] text-[#f4f4f4] p-2 outline-none"
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>

                  <select
                    value={relSourceCol}
                    onChange={e => setRelSourceCol(e.target.value)}
                    className="bg-[#262626] border border-[#393939] text-[#f4f4f4] p-2 outline-none"
                  >
                    {tables.find(t => t.name === relSourceTable)?.columns.map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cardinality Selector */}
              <div className="space-y-1">
                <label className="text-[#8d8d8d] block">{isAr ? 'نوع العلاقة (Cardinality):' : 'Relationship Type:'}</label>
                <select
                  value={relType}
                  onChange={e => setRelType(e.target.value as RelationshipType)}
                  className="w-full bg-[#1f1f1f] border border-[#393939] text-[#f4f4f4] p-2 outline-none font-bold text-[#be95ff]"
                >
                  <option value="1:M">1:M (One-to-Many / واحد لمتعدد - الشائع)</option>
                  <option value="1:1">1:1 (One-to-One / واحد لواحد)</option>
                  <option value="M:M">M:M (Many-to-Many / متعدد لمتعدد)</option>
                </select>
              </div>

              {/* Target Table & Column (PK) */}
              <div className="space-y-2 p-3 bg-[#1f1f1f] border border-[#393939]">
                <label className="text-[#42be65] font-bold block uppercase">
                  2. {isAr ? 'الجدول المستهدف (المستند إليه - المفتاح الرئيسي PK)' : 'Target Table (Referenced Primary Key)'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={relTargetTable}
                    onChange={e => {
                      const tName = e.target.value;
                      setRelTargetTable(tName);
                      const tObj = tables.find(t => t.name === tName);
                      setRelTargetCol(tObj?.primaryKey?.[0] || tObj?.columns[0]?.name || '');
                    }}
                    className="bg-[#262626] border border-[#393939] text-[#f4f4f4] p-2 outline-none"
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>

                  <select
                    value={relTargetCol}
                    onChange={e => setRelTargetCol(e.target.value)}
                    className="bg-[#262626] border border-[#393939] text-[#f4f4f4] p-2 outline-none"
                  >
                    {tables.find(t => t.name === relTargetTable)?.columns.map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description / Notes */}
              <div className="space-y-1">
                <label className="text-[#8d8d8d] block">{isAr ? 'ملاحظات وصفية:' : 'Description / Notes:'}</label>
                <input
                  type="text"
                  value={relDesc}
                  onChange={e => setRelDesc(e.target.value)}
                  placeholder={isAr ? 'مثال: ربط الطلبات بالعملاء عبر رقم العميل' : 'e.g. Orders linked to Customers via customer_id'}
                  className="w-full bg-[#1f1f1f] border border-[#393939] text-[#f4f4f4] p-2 outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-[#1f1f1f] border-t border-[#393939] flex items-center justify-end gap-2 font-mono text-xs">
              <button
                onClick={() => setShowRelationModal(false)}
                className="px-3 py-1.5 bg-[#393939] text-[#c6c6c6] hover:text-[#f4f4f4]"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                onClick={handleSaveRelationship}
                className="px-4 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white font-bold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'حفظ العلاقة' : 'Save Relationship'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Schema Modal */}
      {showDownloadSchemaModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#161616] border border-[#393939] w-full max-w-xl shadow-2xl space-y-0">
            <div className="p-4 bg-[#1f1f1f] border-b border-[#393939] flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#f4f4f4] font-mono font-bold text-sm">
                <Download className="w-4 h-4 text-[#42be65]" />
                <span>{isAr ? 'تحميل مخطط العلاقات (Download Schema)' : 'Download Relational Schema'}</span>
              </div>
              <button
                onClick={() => setShowDownloadSchemaModal(false)}
                className="text-[#8d8d8d] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-[#c6c6c6] font-mono leading-relaxed">
                {isAr
                  ? 'تصدير تعيين العلاقات الحالية (العلاقات، المفاتيح الرئيسية والغريبة، وأنواع البيانات) بتنسيق قابل للتحميل:'
                  : 'Export current relational mapping (relationships, primary/foreign keys, and data types) as a downloadable file:'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Download SQL DDL Option */}
                <div className="p-4 bg-[#1f1f1f] border border-[#0f62fe] space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[#78a9ff] font-mono font-bold text-xs">
                      <Database className="w-4 h-4" />
                      <span>{isAr ? 'سكريبت SQL DDL Script' : 'SQL DDL Script (.sql)'}</span>
                    </div>
                    <p className="text-[11px] text-[#a8a8a8]">
                      {isAr ? 'أوامر CREATE TABLE والـ Foreign Keys للهجة ' + exportSqlDialect.toUpperCase() : 'DDL statements for ' + exportSqlDialect.toUpperCase() + ' dialect.'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      handleDownloadSqlFile();
                      setShowDownloadSchemaModal(false);
                    }}
                    className="w-full py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white font-mono text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تحميل .sql' : 'Download .sql'}</span>
                  </button>
                </div>

                {/* Download JSON Metadata Option */}
                <div className="p-4 bg-[#1f1f1f] border border-[#8a3ffc] space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[#be95ff] font-mono font-bold text-xs">
                      <FileCode className="w-4 h-4" />
                      <span>{isAr ? 'ملف وصف JSON Metadata' : 'JSON Metadata (.json)'}</span>
                    </div>
                    <p className="text-[11px] text-[#a8a8a8]">
                      {isAr ? 'مخزن بيانات المخطط والجداول والعلاقات بنمط JSON القياسي' : 'Export complete structured metadata JSON object.'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      handleDownloadJsonFile();
                      setShowDownloadSchemaModal(false);
                    }}
                    className="w-full py-2 bg-[#8a3ffc] hover:bg-[#7828c8] text-white font-mono text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تحميل .json' : 'Download .json'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#1f1f1f] border-t border-[#393939] flex justify-end">
              <button
                onClick={() => setShowDownloadSchemaModal(false)}
                className="px-4 py-1.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-xs font-mono"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
