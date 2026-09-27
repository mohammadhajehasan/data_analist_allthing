import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu,
  ChevronDown,
  Shield,
  Zap,
  Sparkles,
  Server,
  Globe,
  Check,
  Settings,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AIProviderId } from '../../types';
import { AIProviderModal } from './AIProviderModal';

interface AIModelSelectorProps {
  compact?: boolean;
  className?: string;
  onSelectModel?: (modelId: string) => void;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  compact = false,
  className = '',
  onSelectModel,
}) => {
  const {
    language,
    aiSettings,
    availableAIModels,
    activeAIModelDef,
    setActiveAIModel,
    toast,
    updateProviderConfig,
    refreshCloudModels,
  } = useApp();

  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isRefreshingModels, setIsRefreshingModels] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleRefreshCloudModels = async (provider: AIProviderId) => {
    const config = aiSettings.providers[provider];
    if (!config?.apiKey) {
      toast.error(isAr ? 'المزود يحتاج مفتاح API' : 'Provider requires API key');
      return;
    }
    
    setIsRefreshingModels(provider);
    try {
      const models = await refreshCloudModels(provider, config.apiKey, config.endpointUrl);
      if (models.length > 0) {
        toast.success(isAr ? 'تم تحديث النماذج' : 'Models refreshed');
      } else {
        toast.info(isAr ? 'لم يتم العثور على نماذج جديدة' : 'No new models found');
      }
    } catch (err: any) {
      toast.error(isAr ? 'فشل تحديث النماذج' : 'Failed to refresh models', err?.message);
    } finally {
      setIsRefreshingModels(null);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getProviderIcon = (provider: AIProviderId) => {
    switch (provider) {
      case 'ollama':
        return <Shield className="w-3.5 h-3.5 text-[#42be65]" />;
      case 'gemini':
        return <Sparkles className="w-3.5 h-3.5 text-[#78a9ff]" />;
      case 'deepseek':
        return <Zap className="w-3.5 h-3.5 text-[#ff832b]" />;
      case 'qwen':
        return <Server className="w-3.5 h-3.5 text-[#be95ff]" />;
      case 'openrouter':
        return <Globe className="w-3.5 h-3.5 text-[#33b1ff]" />;
      default:
        return <Cpu className="w-3.5 h-3.5 text-[#c6c6c6]" />;
    }
  };

  const filteredModels = availableAIModels.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.providerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'local') return m.isLocal;
    if (selectedFilter === 'cloud') return !m.isLocal;
    if (selectedFilter === 'reasoning') return m.capabilities.includes('reasoning');
    if (selectedFilter === 'sql') return m.capabilities.includes('nl2sql');
    return true;
  });

  const handleSelect = (modelId: string) => {
    setActiveAIModel(modelId);
    if (onSelectModel) {
      onSelectModel(modelId);
    }
    setIsOpen(false);
    const chosen = availableAIModels.find((m) => m.id === modelId);
    toast.info(
      isAr ? 'تم تفعيل النموذج' : 'Model Switched',
      isAr ? `النموذج النشط الآن: ${chosen?.name}` : `Active model set to ${chosen?.name}`
    );
  };

  return (
    <>
      <div className={`relative ${className}`} ref={dropdownRef}>
        {/* Selector Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-9 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all border ${
            isOpen
              ? 'bg-[var(--cds-layer-02)] border-[var(--cds-interactive-01)] text-[var(--cds-text-01)] ring-1 ring-[var(--cds-interactive-01)]'
              : 'bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] text-[var(--cds-text-01)]'
          }`}
          title={isAr ? 'اختيار مزود ونموذج الذكاء الاصطناعي' : 'Select AI Model & Provider'}
        >
          <div className="flex items-center gap-1.5">
            {getProviderIcon(activeAIModelDef.provider)}
            {!compact && (
              <span className="font-medium text-[var(--cds-text-01)] max-w-[130px] truncate">
                {activeAIModelDef.name}
              </span>
            )}
            {activeAIModelDef.isLocal && (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Local
              </span>
            )}
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--cds-text-03)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full mt-1.5 end-0 z-50 w-84 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl shadow-2xl p-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
{/* Search Input */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute top-2.5 start-2.5 text-[var(--cds-text-03)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isAr ? 'بحث في النماذج (Ollama, Qwen, DeepSeek)...' : 'Search models...'}
                    className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded-lg bg-[var(--cds-input-bg)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[var(--cds-interactive-01)] focus:outline-hidden"
                  />
                </div>
                {/* Cloud Models Refresh Button */}
                {!aiSettings.providers.gemini.isLocalOnly && (
                  <button
                    onClick={() => handleRefreshCloudModels('gemini')}
                    disabled={isRefreshingModels === 'gemini'}
                    className="flex items-center gap-1.5 text-[10px] text-[var(--cds-interactive-01)] hover:text-[var(--cds-interactive-01)] mb-2"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingModels === 'gemini' ? 'animate-spin' : ''}`} />
                    {isRefreshingModels === 'gemini'
                      ? isAr ? 'جاري...' : 'Refreshing...'
                      : isAr ? 'تحديث نماذج Gemini' : 'Refresh Gemini Models'}
                  </button>
                )}

            {/* Quick Filters */}
            <div className="flex items-center gap-1 mb-2 pb-2 border-b border-[var(--cds-border-subtle)] overflow-x-auto text-[10px]">
              {[
                { id: 'all', label: isAr ? 'الكل' : 'All' },
                { id: 'local', label: isAr ? '🔒 محلي' : '🔒 Local' },
                { id: 'cloud', label: isAr ? '☁️ سحابي' : '☁️ Cloud' },
                { id: 'reasoning', label: isAr ? 'استدلال' : 'Reasoning' },
                { id: 'sql', label: isAr ? 'SQL' : 'SQL' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap text-[10px] font-medium transition-colors ${
                    selectedFilter === f.id
                      ? 'bg-[var(--cds-interactive-01)] text-white font-semibold shadow-xs'
                      : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Models List */}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredModels.map((model) => {
                const isSelected = model.id === aiSettings.activeModel;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model.id)}
                    className={`w-full text-start p-2 rounded-lg flex items-start justify-between transition-colors ${
                      isSelected
                        ? 'bg-[var(--cds-interactive-01)]/15 border border-[var(--cds-interactive-01)]/40 text-[var(--cds-text-01)]'
                        : 'hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border border-transparent hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cds-text-01)]">
                        {getProviderIcon(model.provider)}
                        <span>{model.name}</span>
                        {model.isLocal && (
                          <span className="px-1 text-[9px] font-medium rounded-sm bg-emerald-500/20 text-emerald-400">
                            Local
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--cds-text-03)]">
                        {model.providerName} • {model.parameterSize || 'Auto'}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-[var(--cds-interactive-01)] shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}

              {filteredModels.length === 0 && (
                <div className="text-center py-4 text-xs text-[var(--cds-text-03)]">
                  {isAr ? 'لا توجد نماذج مطابقة' : 'No matching models found'}
                </div>
              )}
            </div>

            {/* Bottom Footer Action */}
            <div className="mt-2 pt-2 border-t border-[var(--cds-border-subtle)] flex items-center justify-between">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsModalOpen(true);
                }}
                className="w-full text-center py-1.5 text-xs text-[var(--cds-interactive-01)] hover:bg-[var(--cds-layer-02)] rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                {isAr ? 'إدارة المزودين ومفاتيح الـ API والخصوصية' : 'Manage Providers & Privacy Hub'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Provider Modal */}
      <AIProviderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
