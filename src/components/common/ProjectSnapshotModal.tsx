import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Download,
  Upload,
  Database,
  Layers,
  FileText,
  MessageSquare,
  GitFork,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import { ProjectSnapshot } from '../../types';

export const ProjectSnapshotModal: React.FC = () => {
  const {
    isSnapshotModalOpen,
    setIsSnapshotModalOpen,
    exportProjectSnapshot,
    restoreProjectSnapshot,
    datasets,
    dashboards,
    dataStories,
    comments,
    scheduledRefreshes,
    language,
    formatDate,
    user,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [snapshotName, setSnapshotName] = useState(`نسخة المشروع الكاملة - ${new Date().toLocaleDateString('ar-SA')}`);
  const [snapshotDescription, setSnapshotDescription] = useState('نسخة احتياطية شاملة تشمل كافة مجموعات البيانات، لوحات القيادة، القصص السردية، وملاحظات الفريق.');
  const [importedData, setImportedData] = useState<ProjectSnapshot | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isSnapshotModalOpen) return null;

  const handleExport = () => {
    setIsProcessing(true);
    setTimeout(() => {
      exportProjectSnapshot(snapshotName, snapshotDescription);
      setIsProcessing(false);
      setIsSnapshotModalOpen(false);
    }, 400);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed: ProjectSnapshot = JSON.parse(text);

        if (!parsed.version || (!parsed.datasets && !parsed.dashboards)) {
          setImportError(
            language === 'ar'
              ? 'الملف المحدد لا يطابق هيكل لقطة المشروع المعتمدة (v2.0).'
              : 'The selected file is not a valid Project Snapshot (v2.0).'
          );
          setImportedData(null);
          return;
        }

        setImportedData(parsed);
      } catch (err: any) {
        setImportError(
          language === 'ar'
            ? `خطأ في قراءة ملف JSON: ${err.message}`
            : `JSON parse error: ${err.message}`
        );
        setImportedData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyRestore = () => {
    if (!importedData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const result = restoreProjectSnapshot(importedData);
      setIsProcessing(false);
      if (result.success) {
        setIsSnapshotModalOpen(false);
      } else {
        setImportError(result.message);
      }
    }, 400);
  };

  const totalRows = datasets.reduce((sum, d) => sum + (d.rowCount || d.data?.length || 0), 0);
  const totalWidgets = dashboards.reduce((sum, d) => sum + (d.widgets?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-2xl bg-[#161616] text-[#f4f4f4] border border-[#393939] shadow-2xl rounded-none flex flex-col max-h-[90vh] overflow-hidden"
        id="project-snapshot-modal"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#393939] bg-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#0f62fe]/15 text-[#0f62fe]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">
                {language === 'ar' ? 'إدارة لقطة المشروع (Project Snapshot)' : 'Project Snapshot & Full Backup'}
              </h3>
              <p className="text-xs text-[#8d8d8d]">
                {language === 'ar'
                  ? 'حفظ واستعادة حالة المنصة بالكامل (البيانات، الرسوم، الملاحظات، والإعدادات) في ملف JSON'
                  : 'Export & Restore the complete workspace state in portable JSON format'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSnapshotModalOpen(false)}
            className="p-1.5 text-[#c6c6c6] hover:text-white hover:bg-[#393939] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#393939] bg-[#1a1a1a]">
          <button
            onClick={() => {
              setActiveTab('export');
              setImportError(null);
            }}
            className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'export'
                ? 'border-[#0f62fe] text-white bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6]'
            }`}
            id="snapshot-tab-export"
          >
            <Download className="w-4 h-4 text-[#0f62fe]" />
            <span>{language === 'ar' ? 'تصدير وحفظ اللقطة (Export)' : 'Export Snapshot'}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('import');
              setImportError(null);
            }}
            className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'import'
                ? 'border-[#0f62fe] text-white bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6]'
            }`}
            id="snapshot-tab-import"
          >
            <Upload className="w-4 h-4 text-[#009d9a]" />
            <span>{language === 'ar' ? 'استعادة وتحميل لقطة (Import)' : 'Import / Restore Snapshot'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              {/* Snapshot Content Preview Box */}
              <div className="p-4 bg-[#262626] border border-[#393939]">
                <h4 className="text-xs font-semibold text-[#c6c6c6] mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0f62fe]" />
                  <span>{language === 'ar' ? 'محتويات اللقطة الحالية للتحزيم' : 'Current Snapshot Payload'}</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#161616] border border-[#333] rounded-xs">
                    <div className="flex items-center gap-1.5 text-xs text-[#8d8d8d] mb-1">
                      <Database className="w-3.5 h-3.5 text-[#0f62fe]" />
                      <span>{language === 'ar' ? 'البيانات' : 'Datasets'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{datasets.length}</p>
                    <p className="text-[10px] text-[#8d8d8d]">{totalRows.toLocaleString()} {language === 'ar' ? 'سجل' : 'rows'}</p>
                  </div>

                  <div className="p-3 bg-[#161616] border border-[#333] rounded-xs">
                    <div className="flex items-center gap-1.5 text-xs text-[#8d8d8d] mb-1">
                      <Layers className="w-3.5 h-3.5 text-[#009d9a]" />
                      <span>{language === 'ar' ? 'اللوحات' : 'Dashboards'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{dashboards.length}</p>
                    <p className="text-[10px] text-[#8d8d8d]">{totalWidgets} {language === 'ar' ? 'عنصر رسم' : 'widgets'}</p>
                  </div>

                  <div className="p-3 bg-[#161616] border border-[#333] rounded-xs">
                    <div className="flex items-center gap-1.5 text-xs text-[#8d8d8d] mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#8a3ffc]" />
                      <span>{language === 'ar' ? 'القصص الذكية' : 'Data Stories'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{dataStories.length}</p>
                    <p className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'تقارير سردية' : 'stories'}</p>
                  </div>

                  <div className="p-3 bg-[#161616] border border-[#333] rounded-xs">
                    <div className="flex items-center gap-1.5 text-xs text-[#8d8d8d] mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                      <span>{language === 'ar' ? 'التعليقات' : 'Annotations'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{comments.length}</p>
                    <p className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'ملاحظة ومناقشة' : 'comments'}</p>
                  </div>
                </div>
              </div>

              {/* Configuration Inputs */}
              <div>
                <label className="block text-xs font-medium text-[#c6c6c6] mb-1">
                  {language === 'ar' ? 'اسم اللقطة / النسخة' : 'Snapshot Title'}
                </label>
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  className="w-full bg-[#262626] border border-[#393939] focus:border-[#0f62fe] rounded-none px-3 py-2 text-xs text-white outline-hidden"
                  id="snapshot-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c6c6c6] mb-1">
                  {language === 'ar' ? 'الوصف والملاحظات' : 'Description'}
                </label>
                <textarea
                  value={snapshotDescription}
                  onChange={(e) => setSnapshotDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#262626] border border-[#393939] focus:border-[#0f62fe] rounded-none p-3 text-xs text-white outline-hidden resize-none"
                  id="snapshot-desc-input"
                />
              </div>

              <div className="p-3 bg-[#1f1f1f] border-l-4 border-[#0f62fe] text-xs text-[#a8a8a8]">
                <p>
                  {language === 'ar'
                    ? 'سيتم توليد ملف JSON كامل وصالح للمعايير العالمية، يمكنك مشاركته مع زملائك أو تحميله في أي وقت للعودة إلى نفس حالة التحليل بالضبط.'
                    : 'A standalone JSON file will be generated. You can share this snapshot with team members or import it later to restore the exact environment.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Upload Box */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#525252] hover:border-[#0f62fe] bg-[#262626] p-8 text-center cursor-pointer transition flex flex-col items-center justify-center"
                id="snapshot-upload-dropzone"
              >
                <Upload className="w-10 h-10 text-[#0f62fe] mb-3 stroke-1" />
                <p className="text-sm font-semibold text-white">
                  {language === 'ar' ? 'انقر لاختيار ملف اللقطة (JSON)' : 'Click to select Snapshot JSON file'}
                </p>
                <p className="text-xs text-[#8d8d8d] mt-1">
                  {language === 'ar' ? 'أو قم بسحب وإفلات الملف هنا' : 'or drag and drop your project-snapshot.json file'}
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".json,application/json"
                  className="hidden"
                  id="snapshot-file-input"
                />
              </div>

              {/* Error Message */}
              {importError && (
                <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Parsed Snapshot Details */}
              {importedData && (
                <div className="p-4 bg-[#262626] border border-[#0f62fe]/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0f62fe] flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      {language === 'ar' ? 'تم التحقق من صحة ملف اللقطة بنجاح' : 'Snapshot Verified'}
                    </span>
                    <span className="text-[11px] text-[#8d8d8d] font-mono">v{importedData.version}</span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">{importedData.name || importedData.nameAr}</h4>
                    <p className="text-xs text-[#a8a8a8] mt-0.5">{importedData.description}</p>
                    <p className="text-[11px] text-[#8d8d8d] mt-1">
                      {language === 'ar' ? 'تم التصدير في:' : 'Exported:'}{' '}
                      {formatDate(importedData.exportedAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{' '}
                      {language === 'ar' ? 'بواسطة' : 'by'} {importedData.exportedBy?.name || 'User'}
                    </p>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#393939] text-center">
                    <div className="p-2 bg-[#161616] rounded-xs">
                      <span className="block text-xs font-bold text-white">{importedData.datasets?.length || 0}</span>
                      <span className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'مجموعات بيانات' : 'Datasets'}</span>
                    </div>
                    <div className="p-2 bg-[#161616] rounded-xs">
                      <span className="block text-xs font-bold text-white">{importedData.dashboards?.length || 0}</span>
                      <span className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'لوحات تحكم' : 'Dashboards'}</span>
                    </div>
                    <div className="p-2 bg-[#161616] rounded-xs">
                      <span className="block text-xs font-bold text-white">{importedData.dataStories?.length || 0}</span>
                      <span className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'قصص سردية' : 'Stories'}</span>
                    </div>
                    <div className="p-2 bg-[#161616] rounded-xs">
                      <span className="block text-xs font-bold text-white">{importedData.comments?.length || 0}</span>
                      <span className="text-[10px] text-[#8d8d8d]">{language === 'ar' ? 'ملاحظات' : 'Comments'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#393939] bg-[#262626]">
          <button
            onClick={() => setIsSnapshotModalOpen(false)}
            className="px-4 py-2 text-xs font-medium text-[#c6c6c6] hover:bg-[#393939] transition"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>

          {activeTab === 'export' ? (
            <button
              onClick={handleExport}
              disabled={isProcessing || !snapshotName.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#0f62fe] text-white text-xs font-semibold hover:bg-[#0353e9] disabled:opacity-40 transition"
              id="confirm-snapshot-export-btn"
            >
              <Download className="w-4 h-4" />
              <span>{isProcessing ? (language === 'ar' ? 'جاري التحزيم...' : 'Packaging...') : (language === 'ar' ? 'تنزيل ملف اللقطة JSON' : 'Download Snapshot JSON')}</span>
            </button>
          ) : (
            <button
              onClick={handleApplyRestore}
              disabled={isProcessing || !importedData}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#009d9a] text-white text-xs font-semibold hover:bg-[#007d79] disabled:opacity-40 transition"
              id="confirm-snapshot-restore-btn"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? (language === 'ar' ? 'جاري الاستعادة...' : 'Restoring...') : (language === 'ar' ? 'استعادة حالة المشروع الآن' : 'Apply Snapshot Now')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
