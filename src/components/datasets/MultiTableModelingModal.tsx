import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Dataset, DatasetColumn, DatasetFormat } from '../../types';
import { ParsedTableResult, buildColumnsFromRecords } from '../../utils/fileDataParser';
import * as XLSX from 'xlsx';
import {
  Layers,
  Workflow,
  Sparkles,
  Link,
  Plus,
  Trash2,
  Download,
  Save,
  Check,
  X,
  FileSpreadsheet,
  FileText,
  FileCode,
  Table,
  ArrowRight,
  ChevronRight,
  Database,
  Info,
  CheckCircle2,
  AlertCircle,
  Hash,
  Eye,
  Search,
  Filter,
  RefreshCw,
  GitBranch,
} from 'lucide-react';

export interface JoinStep {
  id: string;
  targetTable: string; // The table to join with
  leftColumn: string;  // Column from base/previous table
  rightColumn: string; // Column from target table
  joinType: 'inner' | 'left' | 'right' | 'full' | 'cross';
  cardinality: '1:1' | '1:M' | 'M:1' | 'M:M';
}

interface MultiTableModelingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  allTables?: ParsedTableResult[];
  initialTables?: ParsedTableResult[];
  onDatasetSaved?: (newDataset: Dataset) => void;
}

export const MultiTableModelingModal: React.FC<MultiTableModelingModalProps> = ({
  isOpen,
  onClose,
  fileName = '',
  allTables: propAllTables,
  initialTables,
  onDatasetSaved,
}) => {
  const allTables = propAllTables || initialTables || [];
  const { addDataset, setActiveDatasetId, toast, language, addAuditLog, user, workspace } = useApp();
  const isAr = language === 'ar';

  // Mode: 'single' (select one sheet) or 'modeling' (relational joins & ERD)
  const [activeMode, setActiveMode] = useState<'modeling' | 'single'>('modeling');

  // Single Table Ingest State
  const [selectedSingleTable, setSelectedSingleTable] = useState<string>(allTables[0]?.tableName || '');
  const [singleDatasetName, setSingleDatasetName] = useState<string>('');
  const [singleDescription, setSingleDescription] = useState<string>('');

  // Modeling State
  const [baseTable, setBaseTable] = useState<string>(allTables[0]?.tableName || '');
  const [joinSteps, setJoinSteps] = useState<JoinStep[]>([]);
  const [modeledName, setModeledName] = useState<string>('');
  const [modeledDescription, setModeledDescription] = useState<string>('');
  const [searchPreviewQuery, setSearchPreviewQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Initialize names when tables change
  useEffect(() => {
    if (allTables && allTables.length > 0) {
      const cleanBase = (fileName || 'Dataset').replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setSelectedSingleTable(allTables[0]?.tableName || '');
      setSingleDatasetName(`${allTables[0]?.tableName || 'Sheet'} (${cleanBase})`);
      setBaseTable(allTables[0]?.tableName || '');
      setModeledName(`Modeled_${cleanBase.replace(/\s+/g, '_')}`);
      setModeledDescription(
        isAr
          ? `مجموعة بيانات مدمجة ومنمذجة من عدة شيتات (${allTables.map(t => t.tableName).join(' + ')}) مع ضبط العلاقات الهيكلية.`
          : `Modeled and merged dataset from multiple sheets (${allTables.map(t => t.tableName).join(' + ')}) with relational joins.`
      );

      // Auto-suggest first join if 2+ tables exist
      if (allTables.length >= 2 && allTables[0] && allTables[1]) {
        autoSuggestJoin(allTables[0].tableName, allTables[1].tableName);
      }
    }
  }, [allTables, fileName, isAr]);

  // Find candidate join keys between two tables
  const findCandidateKeys = (tbl1Name: string, tbl2Name: string) => {
    const t1 = allTables.find(t => t.tableName === tbl1Name);
    const t2 = allTables.find(t => t.tableName === tbl2Name);
    if (!t1 || !t2) return { leftCol: '', rightCol: '', cardinality: '1:M' as const };

    const t1Cols = t1.columns.map(c => c.name);
    const t2Cols = t2.columns.map(c => c.name);

    // 1. Exact match (e.g. customer_id === customer_id, id === id)
    for (const c1 of t1Cols) {
      if (t2Cols.includes(c1)) {
        const card: '1:1' | '1:M' | 'M:M' = /id|code|key/i.test(c1) ? '1:M' : 'M:M';
        return { leftCol: c1, rightCol: c1, cardinality: card };
      }
    }

    // 2. Pattern match (e.g. customer_id matches id in customers table)
    for (const c1 of t1Cols) {
      const clean1 = c1.toLowerCase().replace(/[_-]/g, '');
      const t2Clean = tbl2Name.toLowerCase().replace(/[_-]/g, '');
      if (clean1 === `${t2Clean}id` || clean1 === `${t2Clean}code`) {
        const rightId = t2Cols.find(c => /^(id|code|key)$/i.test(c)) || t2Cols[0];
        if (rightId) return { leftCol: c1, rightCol: rightId, cardinality: '1:M' as const };
      }
    }

    // 3. Reverse pattern match (e.g. id in orders matches order_id in details)
    for (const c2 of t2Cols) {
      const clean2 = c2.toLowerCase().replace(/[_-]/g, '');
      const t1Clean = tbl1Name.toLowerCase().replace(/[_-]/g, '');
      if (clean2 === `${t1Clean}id` || clean2 === `${t1Clean}code`) {
        const leftId = t1Cols.find(c => /^(id|code|key)$/i.test(c)) || t1Cols[0];
        if (leftId) return { leftCol: leftId, rightCol: c2, cardinality: '1:M' as const };
      }
    }

    return {
      leftCol: t1Cols.find(c => /id|key|code/i.test(c)) || t1Cols[0] || '',
      rightCol: t2Cols.find(c => /id|key|code/i.test(c)) || t2Cols[0] || '',
      cardinality: '1:M' as const,
    };
  };

  const autoSuggestJoin = (fromTable: string, toTable: string) => {
    const candidate = findCandidateKeys(fromTable, toTable);
    const newStep: JoinStep = {
      id: `join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      targetTable: toTable,
      leftColumn: candidate.leftCol,
      rightColumn: candidate.rightCol,
      joinType: 'left',
      cardinality: candidate.cardinality,
    };
    setJoinSteps([newStep]);
  };

  const handleAddJoinStep = () => {
    // Find an unused table
    const usedTables = [baseTable, ...joinSteps.map(s => s.targetTable)];
    const available = allTables.find(t => !usedTables.includes(t.tableName)) || allTables.find(t => t.tableName !== baseTable);
    if (!available) return;

    const candidate = findCandidateKeys(baseTable, available.tableName);
    const newStep: JoinStep = {
      id: `join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      targetTable: available.tableName,
      leftColumn: candidate.leftCol,
      rightColumn: candidate.rightCol,
      joinType: 'left',
      cardinality: candidate.cardinality,
    };
    setJoinSteps(prev => [...prev, newStep]);
  };

  const handleRemoveJoinStep = (id: string) => {
    setJoinSteps(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateJoinStep = (id: string, updates: Partial<JoinStep>) => {
    setJoinSteps(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));
  };

  // Perform multi-table in-memory join pipeline
  const modeledExecutionResult = useMemo(() => {
    const baseTblObj = allTables.find(t => t.tableName === baseTable);
    if (!baseTblObj || !baseTblObj.data) {
      return { records: [], columns: [], totalMatched: 0, totalUnmatched: 0 };
    }

    let currentRecords: Record<string, any>[] = baseTblObj.data.map(row => {
      const formatted: Record<string, any> = {};
      Object.entries(row).forEach(([k, v]) => {
        formatted[`${baseTable}_${k}`] = v;
      });
      return formatted;
    });

    let matchedCount = 0;
    let unmatchedCount = 0;

    // Apply each join sequentially
    for (const step of joinSteps) {
      const targetTblObj = allTables.find(t => t.tableName === step.targetTable);
      if (!targetTblObj || !targetTblObj.data) continue;

      const targetData = targetTblObj.data;
      const rightCol = step.rightColumn;
      const leftColWithPrefix = `${baseTable}_${step.leftColumn}`;

      // Build target lookup map (Key -> Array of matching rows)
      const targetMap = new Map<string, Record<string, any>[]>();
      for (const tRow of targetData) {
        const rawKey = String(tRow[rightCol] ?? '').trim();
        if (rawKey !== '' && rawKey !== 'null' && rawKey !== 'undefined') {
          if (!targetMap.has(rawKey)) targetMap.set(rawKey, []);
          targetMap.get(rawKey)!.push(tRow);
        }
      }

      const nextRecords: Record<string, any>[] = [];

      for (const curRow of currentRecords) {
        // Try left column with prefix or exact name
        const rawLeftVal = curRow[leftColWithPrefix] ?? curRow[step.leftColumn] ?? '';
        const searchKey = String(rawLeftVal ?? '').trim();

        const matches = targetMap.get(searchKey) || [];

        if (matches.length > 0) {
          matchedCount++;
          if (step.cardinality === '1:1') {
            const m = matches[0];
            const combined = { ...curRow };
            Object.entries(m).forEach(([k, v]) => {
              combined[`${step.targetTable}_${k}`] = v;
            });
            nextRecords.push(combined);
          } else {
            // 1:M or M:M
            for (const m of matches) {
              const combined = { ...curRow };
              Object.entries(m).forEach(([k, v]) => {
                combined[`${step.targetTable}_${k}`] = v;
              });
              nextRecords.push(combined);
            }
          }
        } else {
          unmatchedCount++;
          // For LEFT JOIN or FULL JOIN, keep base record with nulls for target table
          if (step.joinType === 'left' || step.joinType === 'full') {
            const combined = { ...curRow };
            targetTblObj.columns.forEach(col => {
              combined[`${step.targetTable}_${col.name}`] = null;
            });
            nextRecords.push(combined);
          }
        }
      }

      currentRecords = nextRecords;
    }

    const computedColumns = buildColumnsFromRecords(currentRecords);

    return {
      records: currentRecords,
      columns: computedColumns,
      totalMatched: matchedCount,
      totalUnmatched: unmatchedCount,
    };
  }, [allTables, baseTable, joinSteps]);

  // Filtered preview records
  const previewRows = useMemo(() => {
    if (!searchPreviewQuery) return modeledExecutionResult.records.slice(0, 15);
    const q = searchPreviewQuery.toLowerCase();
    return modeledExecutionResult.records
      .filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(q)))
      .slice(0, 15);
  }, [modeledExecutionResult.records, searchPreviewQuery]);

  // Action: Save Modeled Result to Datasets
  const handleSaveModeledDataset = () => {
    if (modeledExecutionResult.records.length === 0) {
      toast.warning(
        isAr ? 'لا توجد بيانات' : 'Empty Dataset',
        isAr ? 'لم تسفر عملية الربط عن أي سجلات لحفظها.' : 'The join conditions yielded 0 records.'
      );
      return;
    }

    const newDsId = `ds_modeled_${Date.now()}`;
    const cleanName = modeledName.trim() || `Modeled_${baseTable}_Joined`;

    const newDataset: Dataset = {
      id: newDsId,
      workspaceId: 'ws-main',
      name: cleanName,
      description: modeledDescription || (isAr ? `مجموعة بيانات منمذجة مدمجة (${joinSteps.length} علاقات ربط).` : `Modeled dataset with ${joinSteps.length} join relationships.`),
      format: 'excel' as DatasetFormat,
      rowCount: modeledExecutionResult.records.length,
      columnCount: modeledExecutionResult.columns.length,
      sizeBytes: JSON.stringify(modeledExecutionResult.records).length,
      columns: modeledExecutionResult.columns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      status: 'ready',
      tags: ['Modeled', 'Multi-Sheet', `${allTables.length} Tables`],
      data: modeledExecutionResult.records,
    };

    addDataset(newDataset);
    setActiveDatasetId(newDataset.id);

addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: 'ws-main',
      action: 'create',
      resourceType: 'dataset',
      resourceId: newDsId,
      status: 'SUCCESS',
      durationMs: 100,
      payloadSummary: isAr
        ? `تم إنشاء مجموعة البيانات المنمذجة جديدة (${cleanName}) عبر دمج ${allTables.length} شيتات بنجاح.`
        : `Created new modeled dataset "${cleanName}" by joining ${allTables.length} worksheets.`,
      riskLevel: 'LOW',
    });

    toast.success(
      isAr ? 'تم حفظ مجموعة البيانات المنمذجة بنجاح!' : 'Modeled Dataset Saved!',
      isAr
        ? `تمت إضافة "${cleanName}" (${newDataset.rowCount.toLocaleString()} صف و ${newDataset.columnCount} حقل) إلى مجموعات البيانات.`
        : `Saved "${cleanName}" (${newDataset.rowCount.toLocaleString()} records, ${newDataset.columnCount} columns) to repository.`
    );

    if (onDatasetSaved) {
      onDatasetSaved(newDataset);
    }
    onClose();
  };

  // Action: Save Single Sheet to Datasets
  const handleSaveSingleSheet = () => {
    const tbl = allTables.find(t => t.tableName === selectedSingleTable);
    if (!tbl || tbl.data.length === 0) {
      toast.error(isAr ? 'لا توجد بيانات' : 'No Data', isAr ? 'الشيت المحددة فارغة.' : 'The selected sheet is empty.');
      return;
    }

    const newDsId = `ds_sheet_${Date.now()}`;
    const cleanName = singleDatasetName.trim() || tbl.tableName;

    const newDataset: Dataset = {
      id: newDsId,
      workspaceId: 'ws-main',
      name: cleanName,
      description: singleDescription || (isAr ? `شيت (${tbl.tableName}) تم استيرادها من ${fileName}.` : `Worksheet "${tbl.tableName}" extracted from ${fileName}.`),
      format: 'excel' as DatasetFormat,
      rowCount: tbl.totalRows,
      columnCount: tbl.columns.length,
      sizeBytes: tbl.sizeBytes,
      columns: tbl.columns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      status: 'ready',
      tags: ['Excel Sheet', tbl.tableName],
      data: tbl.data,
    };

    addDataset(newDataset);
    setActiveDatasetId(newDataset.id);

addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: 'ws-main',
      action: 'create',
      resourceType: 'dataset',
      resourceId: newDsId,
      status: 'SUCCESS',
      durationMs: 100,
      payloadSummary: isAr
        ? `تم استيراد ورقة العمل (${tbl.tableName}) كمجموعة بيانات مستقلة.`
        : `Imported worksheet "${tbl.tableName}" as standalone dataset.`,
      riskLevel: 'LOW',
    });

    toast.success(
      isAr ? 'تم حفظ ورقة العمل بنجاح' : 'Worksheet Saved',
      isAr ? `تمت إضافة "${cleanName}" إلى المستودع.` : `Added "${cleanName}" to workspace.`
    );

    if (onDatasetSaved) {
      onDatasetSaved(newDataset);
    }
    onClose();
  };

  // Action: Export Modeled Records to Excel (.xlsx)
  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const records = modeledExecutionResult.records;
      if (records.length === 0) return;

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(records);
      XLSX.utils.book_append_sheet(wb, ws, 'Modeled_Data');

      // Also append a metadata sheet describing the joins and relationships
      const metaRows = joinSteps.map((s, idx) => ({
        'Join Step': `#${idx + 1}`,
        'Base Table': baseTable,
        'Join Type': s.joinType.toUpperCase(),
        'Joined Table': s.targetTable,
        'Left Condition': `${baseTable}.${s.leftColumn}`,
        'Right Condition': `${s.targetTable}.${s.rightColumn}`,
        'Relationship': s.cardinality,
        'Created At': new Date().toISOString(),
      }));
      const metaWs = XLSX.utils.json_to_sheet(metaRows);
      XLSX.utils.book_append_sheet(wb, metaWs, '_Join_Relationships');

      XLSX.writeFile(wb, `${modeledName || 'Modeled_Dataset'}.xlsx`);

      toast.success(
        isAr ? 'تم تصدير ملف الأكسيل بنجاح' : 'Excel Exported',
        isAr ? 'تم تنزيل الملف المنمذج مع ورقة توثيق العلاقات.' : 'Downloaded merged Excel file with join metadata sheet.'
      );
    } catch (e: any) {
      toast.error(isAr ? 'فشل التصدير' : 'Export Failed', e.message);
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  // Action: Export Modeled Records to CSV (.csv)
  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const records = modeledExecutionResult.records;
      if (records.length === 0) return;

      const ws = XLSX.utils.json_to_sheet(records);
      const csv = XLSX.utils.sheet_to_csv(ws);

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${modeledName || 'Modeled_Dataset'}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(isAr ? 'تم تصدير ملف CSV' : 'CSV Exported');
    } catch (e: any) {
      toast.error(isAr ? 'فشل التصدير' : 'Export Failed', e.message);
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  // Action: Export Modeled Records to JSON (.json)
  const handleExportJson = () => {
    setIsExporting(true);
    try {
      const records = modeledExecutionResult.records;
      const exportObject = {
        metadata: {
          name: modeledName,
          baseTable,
          totalRows: records.length,
          totalColumns: modeledExecutionResult.columns.length,
          joinSteps,
          exportedAt: new Date().toISOString(),
        },
        columns: modeledExecutionResult.columns,
        data: records,
      };

      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${modeledName || 'Modeled_Dataset'}.json`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(isAr ? 'تم تصدير ملف JSON' : 'JSON Exported');
    } catch (e: any) {
      toast.error(isAr ? 'فشل التصدير' : 'Export Failed', e.message);
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in overflow-y-auto">
      <div className="bg-[#1f1f1f] border border-[#393939] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-[#262626] border-b border-[#393939] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#0f62fe]/20 border border-[#0f62fe] text-[#78a9ff] rounded-none">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                  MULTI-TABLE INGESTION & MODELING
                </span>
                <span className="px-2 py-0.5 bg-[#161616] text-[#c6c6c6] text-[10px] font-mono border border-[#393939]">
                  {allTables.length} {isAr ? 'شيتات مكتشفة' : 'Sheets Found'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
                <span>{isAr ? 'نمذجة ودمج شيتات البيانات المرفوعة' : 'Multi-Sheet Modeling & Data Ingestion'}</span>
                <span className="text-xs font-mono font-normal text-[#8d8d8d] hidden sm:inline">({fileName})</span>
              </h2>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex bg-[#161616] p-1 border border-[#393939]">
              <button
                onClick={() => setActiveMode('modeling')}
                className={`px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${
                  activeMode === 'modeling'
                    ? 'bg-[#0f62fe] text-white'
                    : 'text-[#c6c6c6] hover:text-white'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>{isAr ? 'نمذجة وعلاقات (Modeling & Joins)' : 'Relational Modeling'}</span>
              </button>
              <button
                onClick={() => setActiveMode('single')}
                className={`px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${
                  activeMode === 'single'
                    ? 'bg-[#0f62fe] text-white'
                    : 'text-[#c6c6c6] hover:text-white'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد ورقة عمل واحدة (Single Sheet)' : 'Single Sheet'}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-[#8d8d8d] hover:text-white hover:bg-[#393939] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ========================================================= */}
          {/* MODE 1: MULTI-SHEET MODELING & RELATIONAL JOINS           */}
          {/* ========================================================= */}
          {activeMode === 'modeling' ? (
            <div className="space-y-6">
              
              {/* Top Overview: Available Sheets Cards */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-mono font-bold uppercase text-[#c6c6c6] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#78a9ff]" />
                    <span>{isAr ? 'الشيتات والجداول المتاحة للنمذجة في الملف' : 'Available Sheets in Workbook'}</span>
                  </h3>
                  <span className="text-[11px] text-[#8d8d8d] font-mono">
                    {allTables.reduce((acc, t) => acc + t.totalRows, 0).toLocaleString()} {isAr ? 'إجمالي الصفوف' : 'total raw rows'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allTables.map(tbl => {
                    const isBase = tbl.tableName === baseTable;
                    const isJoined = joinSteps.some(s => s.targetTable === tbl.tableName);

                    return (
                      <div
                        key={tbl.tableName}
                        className={`p-3.5 bg-[#161616] border transition-all ${
                          isBase
                            ? 'border-[#0f62fe] bg-[#0f62fe]/5'
                            : isJoined
                            ? 'border-[#8a3ffc] bg-[#8a3ffc]/5'
                            : 'border-[#393939]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileSpreadsheet className={`w-4 h-4 shrink-0 ${isBase ? 'text-[#78a9ff]' : isJoined ? 'text-[#be95ff]' : 'text-[#42be65]'}`} />
                            <span className="font-mono font-bold text-xs text-white truncate">{tbl.tableName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isBase && (
                              <span className="px-1.5 py-0.5 bg-[#0f62fe] text-white text-[9px] font-mono uppercase font-bold">
                                {isAr ? 'الأساسي' : 'Base Table'}
                              </span>
                            )}
                            {isJoined && (
                              <span className="px-1.5 py-0.5 bg-[#8a3ffc] text-white text-[9px] font-mono uppercase font-bold">
                                {isAr ? 'مربوط' : 'Joined'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-[#8d8d8d] mb-2">
                          <span><strong>{tbl.totalRows.toLocaleString()}</strong> rows</span>
                          <span>•</span>
                          <span><strong>{tbl.columns.length}</strong> cols</span>
                        </div>

                        {/* Columns sample pills */}
                        <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto">
                          {tbl.columns.slice(0, 6).map(col => (
                            <span
                              key={col.name}
                              className="px-1.5 py-0.5 bg-[#262626] text-[#c6c6c6] text-[10px] font-mono border border-[#393939]"
                              title={`${col.name} (${col.type})`}
                            >
                              {col.name}
                            </span>
                          ))}
                          {tbl.columns.length > 6 && (
                            <span className="px-1.5 py-0.5 bg-[#1f1f1f] text-[#8d8d8d] text-[10px] font-mono">
                              +{tbl.columns.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modeling Pipeline & Join Steps Builder */}
              <div className="p-4 bg-[#161616] border border-[#393939] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#393939] pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-[#8a3ffc]/20 text-[#be95ff] border border-[#8a3ffc]/50">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono font-bold uppercase text-white">
                        {isAr ? 'هيكلية الربط والعلاقات (Join Pipeline)' : 'Join & Relationship Pipeline'}
                      </h4>
                      <p className="text-[11px] text-[#8d8d8d]">
                        {isAr
                          ? 'حدد الجدول الرئيسي والشيتات المرتبطة مع اختيار نوع الربط والأعمدة المطابقة والـ Cardinality'
                          : 'Configure base table and join conditions with relationship cardinalities.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {allTables.length > 1 && (
                      <button
                        onClick={() => {
                          if (allTables.length >= 2) {
                            autoSuggestJoin(allTables[0].tableName, allTables[1].tableName);
                            toast.info(isAr ? 'تم كشف وتطبيق المفاتيح المقترحة تلقائياً' : 'Auto-detected join keys applied');
                          }
                        }}
                        className="px-2.5 py-1 bg-[#262626] hover:bg-[#393939] text-[#78a9ff] border border-[#393939] text-xs font-mono flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isAr ? 'كشف العلاقات تلقائياً' : 'AI Auto-Detect'}</span>
                      </button>
                    )}

                    {joinSteps.length < allTables.length - 1 && (
                      <button
                        onClick={handleAddJoinStep}
                        className="px-3 py-1 bg-[#8a3ffc] hover:bg-[#7828f7] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إضافة علاقة ربط (Join)' : 'Add Join'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Base Table Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-[#1f1f1f] p-3 border border-[#393939]">
                  <label className="text-xs font-mono font-bold text-[#c6c6c6]">
                    {isAr ? '١. الجدول الأساسي (Base / Driving Table):' : '1. Base Driving Table:'}
                  </label>
                  <select
                    value={baseTable}
                    onChange={e => {
                      setBaseTable(e.target.value);
                      if (joinSteps.length > 0) {
                        const target = joinSteps[0].targetTable === e.target.value
                          ? (allTables.find(t => t.tableName !== e.target.value)?.tableName || '')
                          : joinSteps[0].targetTable;
                        if (target) autoSuggestJoin(e.target.value, target);
                      }
                    }}
                    className="sm:col-span-2 bg-[#161616] border border-[#525252] text-white px-3 py-1.5 text-xs font-mono focus:border-[#0f62fe] outline-none"
                  >
                    {allTables.map(t => (
                      <option key={t.tableName} value={t.tableName}>
                        {t.tableName} ({t.totalRows.toLocaleString()} rows, {t.columns.length} cols)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Join Steps List */}
                <div className="space-y-3">
                  {joinSteps.length === 0 ? (
                    <div className="p-6 bg-[#1f1f1f] border border-dashed border-[#393939] text-center space-y-2">
                      <p className="text-xs text-[#8d8d8d] font-mono">
                        {isAr
                          ? 'لم تتم إضافة أي علاقات ربط بعد. اضغط على "إضافة علاقة ربط" للدمج مع شيتات أخرى.'
                          : 'No joins added yet. Click "Add Join" to connect another sheet.'}
                      </p>
                      <button
                        onClick={handleAddJoinStep}
                        className="px-3 py-1.5 bg-[#0f62fe] text-white text-xs font-mono font-bold inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إضافة أول علاقة ربط' : 'Add First Join'}</span>
                      </button>
                    </div>
                  ) : (
                    joinSteps.map((step, idx) => {
                      const baseTblObj = allTables.find(t => t.tableName === baseTable);
                      const targetTblObj = allTables.find(t => t.tableName === step.targetTable);

                      return (
                        <div
                          key={step.id}
                          className="p-3.5 bg-[#1f1f1f] border border-[#393939] space-y-3 relative group"
                        >
                          <div className="flex items-center justify-between border-b border-[#393939] pb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-[#8a3ffc] text-white text-[11px] font-mono font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="text-xs font-mono font-bold text-[#f4f4f4]">
                                {isAr ? 'ربط مع الشيت:' : 'Join with Sheet:'}
                              </span>
                              <select
                                value={step.targetTable}
                                onChange={e => {
                                  const newTarget = e.target.value;
                                  const candidate = findCandidateKeys(baseTable, newTarget);
                                  handleUpdateJoinStep(step.id, {
                                    targetTable: newTarget,
                                    leftColumn: candidate.leftCol,
                                    rightColumn: candidate.rightCol,
                                    cardinality: candidate.cardinality,
                                  });
                                }}
                                className="bg-[#161616] border border-[#525252] text-[#78a9ff] font-bold px-2.5 py-1 text-xs font-mono outline-none"
                              >
                                {allTables
                                  .filter(t => t.tableName !== baseTable)
                                  .map(t => (
                                    <option key={t.tableName} value={t.tableName}>
                                      {t.tableName} ({t.totalRows} rows)
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <button
                              onClick={() => handleRemoveJoinStep(step.id)}
                              className="text-[#8d8d8d] hover:text-[#da1e28] p-1 transition-colors"
                              title={isAr ? 'حذف هذا الربط' : 'Remove this join'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Join Configuration Fields */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                            {/* Join Type */}
                            <div>
                              <label className="block text-[10px] text-[#8d8d8d] uppercase mb-1">
                                {isAr ? 'نوع الدمج (Join Type)' : 'Join Type'}
                              </label>
                              <select
                                value={step.joinType}
                                onChange={e => handleUpdateJoinStep(step.id, { joinType: e.target.value as any })}
                                className="w-full bg-[#161616] border border-[#393939] text-white px-2.5 py-1.5 outline-none focus:border-[#0f62fe]"
                              >
                                <option value="left">LEFT JOIN (كل صفوف الأساسي)</option>
                                <option value="inner">INNER JOIN (المتطابق فقط)</option>
                                <option value="right">RIGHT JOIN (كل صفوف التابع)</option>
                                <option value="full">FULL OUTER JOIN (الكل)</option>
                              </select>
                            </div>

                            {/* Left Column */}
                            <div>
                              <label className="block text-[10px] text-[#8d8d8d] uppercase mb-1 truncate">
                                {isAr ? `حقل ${baseTable} (Left Key)` : `${baseTable} Key`}
                              </label>
                              <select
                                value={step.leftColumn}
                                onChange={e => handleUpdateJoinStep(step.id, { leftColumn: e.target.value })}
                                className="w-full bg-[#161616] border border-[#393939] text-white px-2.5 py-1.5 outline-none focus:border-[#0f62fe]"
                              >
                                {baseTblObj?.columns.map(c => (
                                  <option key={c.name} value={c.name}>
                                    {c.name} ({c.type})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Right Column */}
                            <div>
                              <label className="block text-[10px] text-[#8d8d8d] uppercase mb-1 truncate">
                                {isAr ? `حقل ${step.targetTable} (Right Key)` : `${step.targetTable} Key`}
                              </label>
                              <select
                                value={step.rightColumn}
                                onChange={e => handleUpdateJoinStep(step.id, { rightColumn: e.target.value })}
                                className="w-full bg-[#161616] border border-[#393939] text-white px-2.5 py-1.5 outline-none focus:border-[#0f62fe]"
                              >
                                {targetTblObj?.columns.map(c => (
                                  <option key={c.name} value={c.name}>
                                    {c.name} ({c.type})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Cardinality (1:1, 1:M, M:1, M:M) */}
                            <div>
                              <label className="block text-[10px] text-[#8d8d8d] uppercase mb-1">
                                {isAr ? 'العلاقة (Cardinality)' : 'Relationship'}
                              </label>
                              <select
                                value={step.cardinality}
                                onChange={e => handleUpdateJoinStep(step.id, { cardinality: e.target.value as any })}
                                className="w-full bg-[#161616] border border-[#393939] text-[#be95ff] font-bold px-2.5 py-1.5 outline-none focus:border-[#8a3ffc]"
                              >
                                <option value="1:1">1:1 (واحد لواحد / One-to-One)</option>
                                <option value="1:M">1:M (واحد لمتعدد / One-to-Many)</option>
                                <option value="M:1">M:1 (متعدد لواحد / Many-to-One)</option>
                                <option value="M:M">M:M (متعدد لمتعدد / Many-to-Many)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Modeled Dataset Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#161616] border border-[#393939]">
                  <span className="text-[10px] font-mono uppercase text-[#8d8d8d] block">{isAr ? 'الصفوف الناتجة' : 'Result Rows'}</span>
                  <span className="text-lg font-mono font-bold text-[#42be65]">
                    {modeledExecutionResult.records.length.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#161616] border border-[#393939]">
                  <span className="text-[10px] font-mono uppercase text-[#8d8d8d] block">{isAr ? 'إجمالي الحقول' : 'Result Columns'}</span>
                  <span className="text-lg font-mono font-bold text-[#78a9ff]">
                    {modeledExecutionResult.columns.length}
                  </span>
                </div>
                <div className="p-3 bg-[#161616] border border-[#393939]">
                  <span className="text-[10px] font-mono uppercase text-[#8d8d8d] block">{isAr ? 'السجلات المتطابقة' : 'Matched Keys'}</span>
                  <span className="text-lg font-mono font-bold text-[#be95ff]">
                    {modeledExecutionResult.totalMatched.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#161616] border border-[#393939]">
                  <span className="text-[10px] font-mono uppercase text-[#8d8d8d] block">{isAr ? 'سجلات بدون مطابقة' : 'Unmatched Keys'}</span>
                  <span className="text-lg font-mono font-bold text-[#f1c21b]">
                    {modeledExecutionResult.totalUnmatched.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Metadata Inputs (Dataset Name & Description) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#161616] border border-[#393939]">
                <div>
                  <label className="block text-xs font-mono font-bold text-[#c6c6c6] mb-1">
                    {isAr ? 'اسم مجموعة البيانات الناتجة:' : 'Output Modeled Dataset Name:'}
                  </label>
                  <input
                    type="text"
                    value={modeledName}
                    onChange={e => setModeledName(e.target.value)}
                    className="w-full bg-[#1f1f1f] border border-[#525252] text-white px-3 py-1.5 text-xs font-mono outline-none focus:border-[#0f62fe]"
                    placeholder="Modeled_Dataset_Name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-[#c6c6c6] mb-1">
                    {isAr ? 'الوصف وملاحظات العلاقات:' : 'Description / Notes:'}
                  </label>
                  <input
                    type="text"
                    value={modeledDescription}
                    onChange={e => setModeledDescription(e.target.value)}
                    className="w-full bg-[#1f1f1f] border border-[#525252] text-white px-3 py-1.5 text-xs font-mono outline-none focus:border-[#0f62fe]"
                    placeholder="Describe modeled output..."
                  />
                </div>
              </div>

              {/* Live Modeled Preview Table */}
              <div className="border border-[#393939] bg-[#161616]">
                <div className="p-3 bg-[#262626] border-b border-[#393939] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-[#78a9ff]" />
                    <span className="text-xs font-mono font-bold text-white uppercase">
                      {isAr ? 'معاينة مباشرة للبيانات المدمجة والمنمذجة' : 'Live Modeled Dataset Preview'}
                    </span>
                    <span className="text-[10px] font-mono text-[#8d8d8d]">
                      (15 {isAr ? 'عينة من إجمالي' : 'sample of'} {modeledExecutionResult.records.length.toLocaleString()})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#8d8d8d] absolute start-2 top-2" />
                      <input
                        type="text"
                        placeholder={isAr ? 'بحث في العينة...' : 'Search preview...'}
                        value={searchPreviewQuery}
                        onChange={e => setSearchPreviewQuery(e.target.value)}
                        className="ps-7 pe-2.5 py-1 bg-[#161616] border border-[#393939] text-xs font-mono text-white outline-none focus:border-[#0f62fe]"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  {previewRows.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono text-[#8d8d8d]">
                      {isAr ? 'لا توجد سجلات تطابق شروط الدمج أو البحث.' : 'No records match the join conditions or search filter.'}
                    </div>
                  ) : (
                    <table className="w-full text-start text-xs font-mono">
                      <thead className="bg-[#1f1f1f] text-[#c6c6c6] border-b border-[#393939] sticky top-0">
                        <tr>
                          {modeledExecutionResult.columns.map(col => (
                            <th key={col.name} className="px-3 py-2 text-start whitespace-nowrap bg-[#1f1f1f]">
                              <div className="text-white">{col.name}</div>
                              <span className="text-[9px] text-[#78a9ff] font-normal uppercase">{col.type}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#393939] text-[#c6c6c6]">
                        {previewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[#262626]">
                            {modeledExecutionResult.columns.map(col => (
                              <td key={col.name} className="px-3 py-1.5 whitespace-nowrap">
                                {row[col.name] !== null && row[col.name] !== undefined
                                  ? String(row[col.name])
                                  : <span className="text-[#6f6f6f] italic">NULL</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* ========================================================= */
            /* MODE 2: SINGLE SHEET INGESTION                            */
            /* ========================================================= */
            <div className="space-y-5">
              <div className="p-4 bg-[#161616] border border-[#393939] space-y-4">
                <label className="block text-xs font-mono font-bold text-white uppercase">
                  {isAr ? 'اختر ورقة العمل (Worksheet) المراد استيرادها:' : 'Select Target Worksheet to Ingest:'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allTables.map(tbl => {
                    const isSelected = tbl.tableName === selectedSingleTable;
                    return (
                      <button
                        key={tbl.tableName}
                        onClick={() => {
                          setSelectedSingleTable(tbl.tableName);
                          setSingleDatasetName(`${tbl.tableName} (${fileName.replace(/\.[^/.]+$/, '')})`);
                        }}
                        className={`p-3.5 text-start border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#0f62fe]/15 border-[#0f62fe] shadow-[0_0_12px_rgba(15,98,254,0.2)]'
                            : 'bg-[#1f1f1f] border-[#393939] hover:border-[#525252]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono font-bold text-sm text-white truncate">{tbl.tableName}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-[#0f62fe] shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-[#8d8d8d]">
                          <span>{tbl.totalRows.toLocaleString()} rows</span>
                          <span>•</span>
                          <span>{tbl.columns.length} columns</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-mono font-bold text-[#c6c6c6] mb-1">
                      {isAr ? 'اسم مجموعة البيانات:' : 'Dataset Name:'}
                    </label>
                    <input
                      type="text"
                      value={singleDatasetName}
                      onChange={e => setSingleDatasetName(e.target.value)}
                      className="w-full bg-[#1f1f1f] border border-[#525252] text-white px-3 py-1.5 text-xs font-mono outline-none focus:border-[#0f62fe]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-bold text-[#c6c6c6] mb-1">
                      {isAr ? 'الوصف:' : 'Description:'}
                    </label>
                    <input
                      type="text"
                      value={singleDescription}
                      onChange={e => setSingleDescription(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full bg-[#1f1f1f] border border-[#525252] text-white px-3 py-1.5 text-xs font-mono outline-none focus:border-[#0f62fe]"
                    />
                  </div>
                </div>
              </div>

              {/* Selected Single Sheet Preview */}
              {(() => {
                const curTbl = allTables.find(t => t.tableName === selectedSingleTable) || allTables[0];
                if (!curTbl) return null;

                return (
                  <div className="border border-[#393939] bg-[#161616]">
                    <div className="p-3 bg-[#262626] border-b border-[#393939] flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-white">{curTbl.tableName} - Preview</span>
                      <span className="text-[#8d8d8d]">{curTbl.totalRows} records</span>
                    </div>
                    <div className="overflow-x-auto max-h-56 overflow-y-auto">
                      <table className="w-full text-start text-xs font-mono">
                        <thead className="bg-[#1f1f1f] text-[#c6c6c6] border-b border-[#393939] sticky top-0">
                          <tr>
                            {curTbl.columns.map(c => (
                              <th key={c.name} className="px-3 py-2 text-start whitespace-nowrap bg-[#1f1f1f]">
                                <div className="text-white">{c.name}</div>
                                <span className="text-[9px] text-[#78a9ff] font-normal uppercase">{c.type}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#393939] text-[#c6c6c6]">
                          {curTbl.data.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="hover:bg-[#262626]">
                              {curTbl.columns.map(c => (
                                <td key={c.name} className="px-3 py-1.5 whitespace-nowrap">
                                  {String(row[c.name] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

        {/* Modal Footer Actions (Save to Datasets vs Export Modeled Data) */}
        <div className="p-4 bg-[#262626] border-t border-[#393939] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#393939] hover:bg-[#4c4c4c] text-white text-xs font-mono uppercase tracking-wider transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {activeMode === 'modeling' ? (
              <>
                {/* 1. Export Button Dropdown (زر تصدير الناتج) */}
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={modeledExecutionResult.records.length === 0 || isExporting}
                    className="px-4 py-2 bg-[#262626] hover:bg-[#393939] text-[#78a9ff] border border-[#0f62fe] text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isAr ? 'تصدير الناتج (Export)' : 'Export Modeled Data'}</span>
                  </button>

                  {/* Export Options Popover */}
                  {showExportMenu && (
                    <div className="absolute bottom-full end-0 mb-2 w-56 bg-[#1f1f1f] border border-[#393939] shadow-2xl p-1.5 space-y-1 z-50">
                      <button
                        onClick={handleExportExcel}
                        className="w-full px-3 py-2 text-start text-xs font-mono text-[#f4f4f4] hover:bg-[#0f62fe] hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-[#42be65]" />
                        <span>{isAr ? 'تصدير كـ Excel (.xlsx)' : 'Export Excel (.xlsx)'}</span>
                      </button>
                      <button
                        onClick={handleExportCsv}
                        className="w-full px-3 py-2 text-start text-xs font-mono text-[#f4f4f4] hover:bg-[#0f62fe] hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[#4589ff]" />
                        <span>{isAr ? 'تصدير كـ CSV (.csv)' : 'Export CSV (.csv)'}</span>
                      </button>
                      <button
                        onClick={handleExportJson}
                        className="w-full px-3 py-2 text-start text-xs font-mono text-[#f4f4f4] hover:bg-[#0f62fe] hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <FileCode className="w-4 h-4 text-[#f1c21b]" />
                        <span>{isAr ? 'تصدير كـ JSON (.json)' : 'Export JSON (.json)'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Save Button (زر الحفظ في مجموعات البيانات) */}
                <button
                  onClick={handleSaveModeledDataset}
                  disabled={modeledExecutionResult.records.length === 0}
                  className="px-5 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isAr ? 'حفظ في مجموعات البيانات (Save to Datasets)' : 'Save to Datasets'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSaveSingleSheet}
                className="px-5 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isAr ? 'حفظ ورقة العمل في مجموعات البيانات' : 'Save Worksheet to Datasets'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
