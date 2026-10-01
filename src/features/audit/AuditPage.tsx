import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Shield, Download } from 'lucide-react';
import { CarbonDataTable, CarbonDataTableColumn } from '../../components/common/CarbonDataTable';

export const AuditPage: React.FC = () => {
  const { auditLogs, language, t } = useApp();
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter(log => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    return true;
  });

  const handleExportLogs = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${Date.now()}.json`;
    a.click();
  };

  const columns: CarbonDataTableColumn[] = [
    {
      key: 'timestamp',
      header: t.audit.timestamp,
      render: val => (
        <span className="text-[var(--cds-text-03)] font-mono">
          {new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'userName',
      header: t.audit.user,
      render: val => <span className="text-[var(--cds-text-01)] font-bold font-mono">{val}</span>,
    },
    {
      key: 'action',
      header: t.audit.action,
      render: val => (
        <span className="bg-[#0f62fe]/15 text-[#33b1ff] border border-[#0f62fe]/30 px-2 py-0.5 text-[10px] font-mono uppercase font-bold">
          {val}
        </span>
      ),
    },
    {
      key: 'resourceId',
      header: t.audit.target,
      render: (_, row) => (
        <span className="text-[var(--cds-text-02)] font-mono text-xs">
          {row.resourceType}: {row.resourceId}
        </span>
      ),
    },
    {
      key: 'status',
      header: t.audit.status,
      render: () => (
        <span className="bg-[#24a148]/15 text-[#42be65] border border-[#24a148]/30 px-2 py-0.5 text-[10px] font-mono font-bold">
          SUCCESS
        </span>
      ),
    },
    {
      key: 'payloadSummary',
      header: 'Payload Summary',
      render: (val, row) => (
        <span className="text-[var(--cds-text-03)] font-mono text-xs max-w-xs truncate block">
          {val || JSON.stringify(row.details || {})}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              IBM CARBON / GOVERNANCE & AUDIT LOGS
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--cds-text-01)] tracking-tight mt-1">{t.audit.title}</h2>
          <p className="text-xs sm:text-sm text-[var(--cds-text-02)] mt-0.5">{t.audit.subtitle}</p>
        </div>

        <button
          onClick={handleExportLogs}
          className="carbon-btn-secondary text-xs font-mono font-bold uppercase tracking-wider gap-2 shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#0f62fe]" />
          <span>{t.audit.exportCsv}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-[var(--cds-text-03)] shrink-0">Action Type Filter:</span>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] px-3 py-1.5 text-xs outline-none focus:border-[#0f62fe]"
          >
            <option value="ALL">ALL Actions (الكل)</option>
            <option value="QUERY_EXECUTION">QUERY_EXECUTION</option>
            <option value="SQL_EXECUTE">SQL_EXECUTE</option>
            <option value="DATASET_UPLOAD">DATASET_UPLOAD</option>
            <option value="REPORT_GENERATION">REPORT_GENERATION</option>
            <option value="SECURITY_CHANGE">SECURITY_CHANGE</option>
          </select>
        </div>

        <span className="text-xs font-mono text-[var(--cds-text-03)]">
          Total Events: <strong className="text-[var(--cds-text-01)]">{filteredLogs.length}</strong>
        </span>
      </div>

      {/* Audit Log Table - Unified CarbonDataTable */}
      <CarbonDataTable
        id="audit-log-datatable"
        data={filteredLogs}
        columns={columns}
        language={language}
        title={language === 'ar' ? 'سجل العمليات والتدقيق الأمني' : 'Enterprise Audit Log'}
        description={`${filteredLogs.length} events`}
        initialPageSize={10}
      />
    </div>
  );
};
