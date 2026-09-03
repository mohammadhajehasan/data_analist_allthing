import React, { useState, useMemo } from 'react';
import { DataModelTable, DataModelRelationship, DatasetColumn } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  Table,
  Filter,
  Search,
  Plus,
  Trash2,
  Download,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Layers,
  Database,
  ArrowRight,
  Sparkles,
  SlidersHorizontal,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MergedDataPreviewTableProps {
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
  language?: 'ar' | 'en';
}

export interface FilterRule {
  id: string;
  table: string;
  column: string;
  operator: 'contains' | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'not_empty';
  value: string;
}

export const MergedDataPreviewTable: React.FC<MergedDataPreviewTableProps> = ({
  tables,
  relationships,
  language = 'ar',
}) => {
  const isAr = language === 'ar';
  const { addDataset, toast } = useApp();

  // Global Search Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Structured Direct Column Filters
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);

  // Column Visibility Selection
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnSelector, setShowColumnSelector] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Base Table selection for initial Join
  const [baseTableName, setBaseTableName] = useState<string>(tables[0]?.name || '');

  // Default base table if empty or removed
  const activeBaseTable = useMemo(() => {
    return tables.find(t => t.name === baseTableName) || tables[0] || null;
  }, [tables, baseTableName]);

  // Compute Joined Rows in Memory
  const mergedDataset = useMemo(() => {
    if (!activeBaseTable) return { headers: [], rows: [] };

    // Get Base Table Records (Prefer fullData over dataSample)
    const baseRows = activeBaseTable.fullData && activeBaseTable.fullData.length > 0
      ? activeBaseTable.fullData
      : (activeBaseTable.dataSample || []);

    if (baseRows.length === 0) {
      // Build dummy empty structure if no sample rows
      const baseCols = activeBaseTable.columns.map(c => `${activeBaseTable.name}.${c.name}`);
      return { headers: baseCols, rows: [] };
    }

    // Identify linked tables and relationships originating from or targeting activeBaseTable
    const relevantRels = relationships.filter(
      r => r.sourceTable === activeBaseTable.name || r.targetTable === activeBaseTable.name
    );

    // Build Merged Records
    const mergedRows: Record<string, any>[] = [];

    baseRows.forEach((bRow, idx) => {
      let combinedRow: Record<string, any> = { _row_id: idx + 1 };

      // Map base table columns: TableName.ColumnName
      activeBaseTable.columns.forEach(col => {
        combinedRow[`${activeBaseTable.name}.${col.name}`] = bRow[col.name] ?? '';
      });

      // Join each linked table
      relevantRels.forEach(rel => {
        const isSourceBase = rel.sourceTable === activeBaseTable.name;
        const linkedTableName = isSourceBase ? rel.targetTable : rel.sourceTable;
        const baseJoinCol = isSourceBase ? rel.sourceColumn : rel.targetColumn;
        const linkedJoinCol = isSourceBase ? rel.targetColumn : rel.sourceColumn;

        const linkedTable = tables.find(t => t.name === linkedTableName);
        if (!linkedTable) return;

        const linkedRows = linkedTable.fullData && linkedTable.fullData.length > 0
          ? linkedTable.fullData
          : (linkedTable.dataSample || []);

        const baseVal = bRow[baseJoinCol];
        const match = linkedRows.find(
          lRow => String(lRow[linkedJoinCol]) === String(baseVal)
        );

        linkedTable.columns.forEach(col => {
          const keyName = `${linkedTable.name}.${col.name}`;
          combinedRow[keyName] = match ? match[col.name] ?? '' : '';
        });
      });

      mergedRows.push(combinedRow);
    });

    // Extract All Merged Column Keys
    const allHeaders = Array.from(
      new Set(mergedRows.flatMap(row => Object.keys(row).filter(k => k !== '_row_id')))
    );

    return { headers: allHeaders, rows: mergedRows };
  }, [tables, relationships, activeBaseTable]);

  // Apply Direct Data Filtering & Search
  const filteredRows = useMemo(() => {
    let result = mergedDataset.rows;

    // 1. Apply Global Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row =>
        Object.entries(row).some(
          ([key, val]) => key !== '_row_id' && String(val).toLowerCase().includes(query)
        )
      );
    }

    // 2. Apply Column Filter Rules
    if (filterRules.length > 0) {
      result = result.filter(row => {
        return filterRules.every(rule => {
          const fieldKey = `${rule.table}.${rule.column}`;
          const cellVal = row[fieldKey];
          if (cellVal === undefined || cellVal === null) return false;

          const strVal = String(cellVal).toLowerCase();
          const targetVal = rule.value.toLowerCase();

          switch (rule.operator) {
            case 'contains':
              return strVal.includes(targetVal);
            case 'equals':
              return strVal === targetVal;
            case 'not_equals':
              return strVal !== targetVal;
            case 'greater_than':
              return parseFloat(strVal) > parseFloat(targetVal);
            case 'less_than':
              return parseFloat(strVal) < parseFloat(targetVal);
            case 'not_empty':
              return strVal.trim().length > 0;
            default:
              return true;
          }
        });
      });
    }

    return result;
  }, [mergedDataset.rows, searchQuery, filterRules]);

  // Visible Headers
  const visibleHeaders = useMemo(() => {
    return mergedDataset.headers.filter(h => !hiddenColumns.has(h));
  }, [mergedDataset.headers, hiddenColumns]);

  // Paginated Rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;

  // Add New Filter Rule
  const handleAddFilterRule = () => {
    if (tables.length === 0) return;
    const firstTbl = tables[0];
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      table: firstTbl.name,
      column: firstTbl.columns[0]?.name || '',
      operator: 'contains',
      value: '',
    };
    setFilterRules(prev => [...prev, newRule]);
    setCurrentPage(1);
  };

  // Remove Filter Rule
  const handleRemoveFilterRule = (id: string) => {
    setFilterRules(prev => prev.filter(r => r.id !== id));
    setCurrentPage(1);
  };

  // Toggle Column Visibility
  const handleToggleColumnVisibility = (colKey: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  };

  // Save Merged Output into Workspace Datasets
  const handleSaveAsDataset = () => {
    if (filteredRows.length === 0) {
      toast.error(
        isAr ? 'لا توجد بيانات لمدمج الجداول' : 'No Data to Save',
        isAr ? 'تأكد من اختيار جداول تحتوي على بيانات وإقامة علاقات بينها.' : 'Ensure tables contain data and valid relationships.'
      );
      return;
    }

    const exportHeaders = visibleHeaders.length > 0 ? visibleHeaders : mergedDataset.headers;
    const datasetData = filteredRows.map(row => {
      const clean: Record<string, any> = {};
      exportHeaders.forEach(h => {
        clean[h] = row[h] ?? '';
      });
      return clean;
    });

    const datasetName = `Joined_${activeBaseTable?.name || 'Model'}_Dataset`;

    const columns: DatasetColumn[] = exportHeaders.map(h => {
      const sampleVals = datasetData.slice(0, 5).map(d => d[h]).filter(v => v !== undefined && v !== null && v !== '');
      const firstVal = sampleVals[0];
      let type: 'integer' | 'float' | 'string' | 'date' | 'boolean' = 'string';
      if (typeof firstVal === 'number') {
        type = Number.isInteger(firstVal) ? 'integer' : 'float';
      } else if (typeof firstVal === 'boolean') {
        type = 'boolean';
      } else if (typeof firstVal === 'string' && !isNaN(Number(firstVal)) && firstVal.trim() !== '') {
        type = Number.isInteger(Number(firstVal)) ? 'integer' : 'float';
      }

      return {
        name: h,
        type,
        nullable: true,
        sampleValues: sampleVals,
      };
    });

    const newDatasetId = `ds-joined-${Date.now()}`;
    addDataset({
      id: newDatasetId,
      name: datasetName,
      nameAr: `مجموعة_بيانات_مدمجة_${activeBaseTable?.name || 'نموذج'}`,
      description: `Merged dataset generated from relationship model on base table ${activeBaseTable?.name}`,
      descriptionAr: `مجموعة بيانات مدمجة ناتجة عن ربط الجداول بناءً على ${activeBaseTable?.name}`,
      rowCount: datasetData.length,
      columns,
      data: datasetData,
      fileType: 'csv',
      updatedAt: new Date().toISOString(),
    });

    toast.success(
      isAr ? 'تم حفظ مجموعة البيانات المدمجة بنجاح' : 'Joined Dataset Saved',
      isAr
        ? `تم إضافة ${datasetData.length} سجل مدمج إلى صفحة مجموعات البيانات.`
        : `Successfully added ${datasetData.length} joined records to Workspace Datasets.`
    );
  };

  // Export Filtered Merged Dataset to Excel
  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const exportData = filteredRows.map(row => {
      const cleanRow: Record<string, any> = {};
      visibleHeaders.forEach(h => {
        cleanRow[h] = row[h];
      });
      return cleanRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Merged_Data_Preview');
    XLSX.writeFile(wb, `Merged_Data_Preview_${activeBaseTable?.name || 'Model'}.xlsx`);
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl overflow-hidden shadow-xl space-y-4 p-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[var(--cds-interactive-01)]/20 text-[var(--cds-interactive-01)] rounded-lg">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-mono font-bold text-[var(--cds-text-01)] uppercase">
                {isAr ? 'لوحة معاينة البيانات المدمجة التفاعلية (Joined Data Preview)' : 'Merged Data Preview Table'}
              </h3>
              <span className="px-2 py-0.5 bg-[var(--cds-interactive-01)]/20 border border-[var(--cds-interactive-01)] text-[var(--cds-interactive-01)] text-[10px] font-mono font-bold rounded">
                {filteredRows.length} {isAr ? 'سجل مدمج' : 'merged records'}
              </span>
            </div>
            <p className="text-xs text-[var(--cds-text-03)] mt-0.5">
              {isAr
                ? 'عرض وتصفية ناتج الدمج بين الجداول المرتبطة بناءً على العلاقات المحددة'
                : 'Real-time merged record preview generated across active relationships & filters.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Base Table Selector */}
          <div className="flex items-center gap-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg px-2 py-1">
            <span className="text-[11px] font-mono text-[var(--cds-text-03)]">{isAr ? 'الجدول الأساسي:' : 'Base Table:'}</span>
            <select
              value={baseTableName}
              onChange={e => { setBaseTableName(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-xs font-mono font-bold text-[var(--cds-text-01)] outline-none cursor-pointer"
            >
              {tables.map(t => (
                <option key={t.name} value={t.name} className="bg-[#1f1f1f] text-white">
                  {t.name} ({t.rowCount})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle Column Selector Drawer */}
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-3 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'الأعمدة' : 'Columns'}</span>
            <span className="text-[10px] bg-[var(--cds-interactive-01)] text-white px-1.5 rounded-full">
              {visibleHeaders.length}/{mergedDataset.headers.length}
            </span>
          </button>

          {/* Save to Workspace Dataset */}
          <button
            onClick={handleSaveAsDataset}
            disabled={filteredRows.length === 0}
            className="px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center gap-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{isAr ? 'حفظ الناتج كـ مجموعة بيانات' : 'Save as Dataset'}</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            disabled={filteredRows.length === 0}
            className="px-3 py-1.5 bg-[#24a148] hover:bg-[#198038] text-white text-xs font-mono font-bold flex items-center gap-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير النتيجة' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar & Add Rules Bar */}
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Global Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[var(--cds-text-03)] absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder={isAr ? 'بحث سريع في جميع حقول الجدول المدمج...' : 'Search across all merged fields...'}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg pl-9 rtl:pr-9 rtl:pl-3 py-1.5 text-xs text-[var(--cds-text-01)] outline-none focus:border-[var(--cds-interactive-01)] font-mono"
            />
          </div>

          {/* Add Filter Rule Button */}
          <button
            onClick={handleAddFilterRule}
            className="px-3 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/80 text-white text-xs font-mono font-bold flex items-center gap-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{isAr ? 'إضافة شرط تصفية' : 'Add Filter Rule'}</span>
          </button>
        </div>

        {/* Structured Column Filter Rules List */}
        {filterRules.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-[var(--cds-border-subtle)]">
            <span className="text-[10px] font-mono font-bold text-[var(--cds-text-03)] uppercase block">
              {isAr ? 'شروط التصفية المباشرة النشطة:' : 'Active Column Filter Rules:'}
            </span>

            <div className="space-y-2">
              {filterRules.map(rule => {
                const ruleTblObj = tables.find(t => t.name === rule.table);
                return (
                  <div key={rule.id} className="flex flex-wrap items-center gap-2 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 rounded-lg text-xs font-mono">
                    {/* Table Select */}
                    <select
                      value={rule.table}
                      onChange={e => {
                        const newTbl = e.target.value;
                        const newTblObj = tables.find(t => t.name === newTbl);
                        setFilterRules(prev =>
                          prev.map(r =>
                            r.id === rule.id
                              ? { ...r, table: newTbl, column: newTblObj?.columns[0]?.name || '' }
                              : r
                          )
                        );
                      }}
                      className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded p-1 text-[var(--cds-text-01)] outline-none"
                    >
                      {tables.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>

                    {/* Column Select */}
                    <select
                      value={rule.column}
                      onChange={e => {
                        setFilterRules(prev =>
                          prev.map(r => (r.id === rule.id ? { ...r, column: e.target.value } : r))
                        );
                      }}
                      className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded p-1 text-[var(--cds-text-01)] outline-none"
                    >
                      {ruleTblObj?.columns.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>

                    {/* Operator Select */}
                    <select
                      value={rule.operator}
                      onChange={e => {
                        setFilterRules(prev =>
                          prev.map(r => (r.id === rule.id ? { ...r, operator: e.target.value as any } : r))
                        );
                      }}
                      className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded p-1 text-[var(--cds-text-01)] outline-none"
                    >
                      <option value="contains">{isAr ? 'يحتوي على' : 'contains'}</option>
                      <option value="equals">{isAr ? 'يساوي' : 'equals'}</option>
                      <option value="not_equals">{isAr ? 'لا يساوي' : 'not equals'}</option>
                      <option value="greater_than">{isAr ? 'أكبر من >' : 'greater than'}</option>
                      <option value="less_than">{isAr ? 'أصغر من <' : 'less than'}</option>
                      <option value="not_empty">{isAr ? 'غير فارغ' : 'not empty'}</option>
                    </select>

                    {/* Value Input */}
                    {rule.operator !== 'not_empty' && (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={e => {
                          setFilterRules(prev =>
                            prev.map(r => (r.id === rule.id ? { ...r, value: e.target.value } : r))
                          );
                        }}
                        placeholder={isAr ? 'القيمة المطلوبة...' : 'Filter value...'}
                        className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded p-1 text-[var(--cds-text-01)] outline-none min-w-[120px]"
                      />
                    )}

                    {/* Delete Rule */}
                    <button
                      onClick={() => handleRemoveFilterRule(rule.id)}
                      className="p-1 hover:bg-red-500/20 text-red-400 rounded cursor-pointer ml-auto rtl:mr-auto rtl:ml-0"
                      title={isAr ? 'حذف الشرط' : 'Delete rule'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Column Visibility Selector Panel */}
      {showColumnSelector && (
        <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-3 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-[var(--cds-text-01)]">
              {isAr ? 'إظهار وإخفاء أعمدة الجداول المدمجة:' : 'Toggle Merged Column Visibility:'}
            </span>
            <button
              onClick={() => setHiddenColumns(new Set())}
              className="text-[10px] text-[#78a9ff] hover:underline font-mono"
            >
              {isAr ? 'إظهار الجميع' : 'Show All'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto custom-scrollbar p-1">
            {mergedDataset.headers.map(headerKey => {
              const isHidden = hiddenColumns.has(headerKey);
              const [tblName, colName] = headerKey.split('.');
              return (
                <button
                  key={headerKey}
                  onClick={() => handleToggleColumnVisibility(headerKey)}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                    isHidden
                      ? 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] opacity-60 line-through'
                      : 'bg-[#0f62fe]/20 border-[#0f62fe] text-[#78a9ff]'
                  }`}
                >
                  {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{tblName}.</span>
                  <span className="font-bold">{colName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Carbon Table Display */}
      <div className="border border-[var(--cds-border-subtle)] rounded-lg overflow-x-auto custom-scrollbar bg-[var(--cds-layer-01)]">
        {paginatedRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Database className="w-8 h-8 text-[var(--cds-text-03)] mx-auto" />
            <p className="text-xs font-mono text-[var(--cds-text-02)]">
              {isAr
                ? 'لا توجد بيانات مطابقة لشروط التصفية أو أن العلاقات المحددة لم تُرجع أي سجلات مدمجة.'
                : 'No merged records match current relationships & filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left rtl:text-right font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]">
                <th className="p-2.5 w-12 text-center border-r border-[var(--cds-border-subtle)] font-bold">#</th>
                {visibleHeaders.map(headerKey => {
                  const [tblName, colName] = headerKey.split('.');
                  return (
                    <th key={headerKey} className="p-2.5 border-r border-[var(--cds-border-subtle)] whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-[#78a9ff] uppercase font-bold">{tblName}</span>
                        <span className="text-[var(--cds-text-01)] font-bold">{colName}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, rowIdx) => (
                <tr
                  key={row._row_id || rowIdx}
                  className="border-b border-[var(--cds-border-subtle)] hover:bg-[var(--cds-hover-ui)] transition-colors"
                >
                  <td className="p-2.5 text-center border-r border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] font-bold">
                    {(currentPage - 1) * pageSize + rowIdx + 1}
                  </td>
                  {visibleHeaders.map(headerKey => (
                    <td key={headerKey} className="p-2.5 border-r border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] whitespace-nowrap">
                      {String(row[headerKey] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pt-2 border-t border-[var(--cds-border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--cds-text-03)]">{isAr ? 'عدد السجلات في الصفحة:' : 'Rows per page:'}</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] p-1 rounded outline-none"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--cds-text-02)] font-bold">
            {isAr
              ? `الصفحة ${currentPage} من ${totalPages}`
              : `Page ${currentPage} of ${totalPages}`}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] text-[var(--cds-text-01)] rounded border border-[var(--cds-border-subtle)] disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] text-[var(--cds-text-01)] rounded border border-[var(--cds-border-subtle)] disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
