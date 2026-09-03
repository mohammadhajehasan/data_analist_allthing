import React, { useState, useEffect } from 'react';
import { DataModelTable, DataModelRelationship } from '../../types';
import {
  Save,
  FolderOpen,
  Trash2,
  Check,
  X,
  Clock,
  Database,
  Download,
  Plus,
  BookmarkCheck
} from 'lucide-react';

export interface SavedModelItem {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
}

interface SavedModelsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
  onLoadModel: (savedModel: SavedModelItem) => void;
  language?: 'ar' | 'en';
}

const LOCAL_STORAGE_KEY = 'datamodeling_saved_models';

export const SavedModelsDrawer: React.FC<SavedModelsDrawerProps> = ({
  isOpen,
  onClose,
  tables,
  relationships,
  onLoadModel,
  language = 'ar',
}) => {
  const isAr = language === 'ar';

  const [savedModels, setSavedModels] = useState<SavedModelItem[]>([]);
  const [modelName, setModelName] = useState<string>('');
  const [modelDesc, setModelDesc] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Load saved models from localStorage on mount/open
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setSavedModels(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved models from localStorage', e);
    }
  }, [isOpen]);

  // Save current model
  const handleSaveCurrentModel = () => {
    if (!modelName.trim()) return;

    const newSavedModel: SavedModelItem = {
      id: `saved-model-${Date.now()}`,
      name: modelName.trim(),
      description: modelDesc.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tables,
      relationships,
    };

    const updated = [newSavedModel, ...savedModels];
    setSavedModels(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    setSaveSuccess(true);
    setModelName('');
    setModelDesc('');
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Delete saved model
  const handleDeleteSavedModel = (id: string) => {
    const updated = savedModels.filter(m => m.id !== id);
    setSavedModels(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-end z-50 animate-fade-in">
      <div className="bg-[#1f1f1f] border-l border-[#393939] rtl:border-r rtl:border-l-0 w-full max-w-md h-full p-5 space-y-5 shadow-2xl flex flex-col overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#393939] pb-3">
          <div className="flex items-center gap-2 text-[#42be65]">
            <FolderOpen className="w-5 h-5" />
            <h3 className="text-sm font-mono font-bold text-white uppercase">
              {isAr ? 'مكتبة النماذج المحفوظة (Saved Models)' : 'Saved Data Models'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#393939] text-[#c6c6c6] rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Model Form */}
        <div className="bg-[#161616] border border-[#262626] rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
              <Save className="w-4 h-4 text-[#78a9ff]" />
              <span>{isAr ? 'حفظ النموذج الحالي:' : 'Save Current Model:'}</span>
            </span>
            {saveSuccess && (
              <span className="text-[10px] font-mono text-[#42be65] font-bold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>{isAr ? 'تم الحفظ بنجاح!' : 'Saved!'}</span>
              </span>
            )}
          </div>

          <input
            type="text"
            value={modelName}
            onChange={e => setModelName(e.target.value)}
            placeholder={isAr ? 'اسم النموذج (مثال: نموذج المبيعات العملاء)...' : 'Model name...'}
            className="w-full bg-[#1f1f1f] border border-[#393939] rounded p-2 text-xs font-mono text-white outline-none focus:border-[#0f62fe]"
          />

          <input
            type="text"
            value={modelDesc}
            onChange={e => setModelDesc(e.target.value)}
            placeholder={isAr ? 'وصف مختصر (اختياري)...' : 'Description (optional)...'}
            className="w-full bg-[#1f1f1f] border border-[#393939] rounded p-2 text-xs font-mono text-white outline-none focus:border-[#0f62fe]"
          />

          <button
            onClick={handleSaveCurrentModel}
            disabled={!modelName.trim()}
            className="w-full py-2 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-50 text-white font-mono font-bold text-xs rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isAr ? 'تخزين في قاعدة بيانات المستخدم' : 'Save to User Database'}</span>
          </button>
        </div>

        {/* Saved Models List */}
        <div className="flex-1 space-y-3 font-mono text-xs">
          <span className="text-[10px] font-bold text-[#8d8d8d] uppercase block">
            {isAr ? `النماذج المحفوظة سابقا (${savedModels.length}):` : `Saved Models (${savedModels.length}):`}
          </span>

          {savedModels.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[#393939] rounded-xl space-y-2">
              <Database className="w-6 h-6 text-[#525252] mx-auto" />
              <p className="text-xs text-[#8d8d8d]">
                {isAr ? 'لا توجد نماذج محفوظة حتى الآن.' : 'No saved models stored yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {savedModels.map(m => (
                <div
                  key={m.id}
                  className="p-3 bg-[#161616] border border-[#262626] hover:border-[#0f62fe] rounded-xl space-y-2 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-white text-xs">{m.name}</h4>
                      {m.description && (
                        <p className="text-[10px] text-[#8d8d8d] line-clamp-1">{m.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSavedModel(m.id)}
                      className="p-1 hover:bg-red-500/20 text-red-400 rounded cursor-pointer"
                      title={isAr ? 'حذف النموذج' : 'Delete model'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#8d8d8d] pt-1 border-t border-[#262626]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#78a9ff]">{m.tables.length} {isAr ? 'جداول' : 'tables'}</span>
                      <span>|</span>
                      <span className="text-[#be95ff]">{m.relationships.length} {isAr ? 'علاقات' : 'links'}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[9px]">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onLoadModel(m);
                      onClose();
                    }}
                    className="w-full py-1.5 bg-[#262626] hover:bg-[#0f62fe] text-white text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5 text-[#42be65]" />
                    <span>{isAr ? 'تحميل هذا النموذج' : 'Load Model'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
