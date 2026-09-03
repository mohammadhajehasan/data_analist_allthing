import React, { useState } from 'react';
import { Terminal, AlertCircle, CheckCircle, Database, Cpu, ChevronDown, ChevronUp } from 'lucide-react';

interface DebuggerProps {
  agentState: 'idle' | 'thinking' | 'executing' | 'error';
  dataset: any | null;
  model: string;
  provider?: string;
  schema: string[];
  lastError: string | null;
}

export const ExecutionDebugger: React.FC<DebuggerProps> = ({
  agentState,
  dataset,
  model,
  provider = 'gemini',
  schema,
  lastError,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute top-2 right-2 m-2 bg-[#161616]/95 backdrop-blur-xs border border-[#393939] shadow-xl text-[11px] font-mono z-40 transition-all">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between gap-3 px-3 py-1.5 cursor-pointer hover:bg-[#222222] select-none"
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              agentState === 'thinking'
                ? 'bg-yellow-400 animate-pulse'
                : agentState === 'error'
                ? 'bg-red-500'
                : 'bg-emerald-400'
            }`}
          />
          <span className="font-bold text-[#f4f4f4] uppercase text-[10px]">
            {provider.toUpperCase()} : {model}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#8d8d8d]">
          <span className="text-[9px] uppercase">{agentState}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-[#393939] space-y-1.5 text-[#c6c6c6] min-w-[240px]">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3 text-[#78a9ff]" />
            <span className="truncate">Data: {dataset?.name || 'No dataset (Universal Mode)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-3 h-3 text-[#42be65]" />
            <span>Engine: {provider} ({model})</span>
          </div>
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3 text-[#a8a8a8]" />
            <span className="truncate">
              Attributes: {schema.length > 0 ? `${schema.length} columns` : 'Global Context'}
            </span>
          </div>
          {lastError && (
            <div className="flex items-start gap-1.5 text-amber-400 pt-1 border-t border-[#393939]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span className="text-[10px] leading-tight">{lastError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
