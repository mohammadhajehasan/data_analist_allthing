import React, { useState } from 'react';
import {
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Send,
  Code2,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Shield,
  Activity,
  Download,
  Terminal,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, any> | any[];
  id: string | number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export const JsonRpcGatewayPanel: React.FC = () => {
  const { language, toast, aiSettings } = useApp();
  const isAr = language === 'ar';

  // Gateway Configuration State
  const [endpointUrl, setEndpointUrl] = useState<string>('http://localhost:8000/rpc');
  const [authToken, setAuthToken] = useState<string>('');
  const [timeoutMs, setTimeoutMs] = useState<number>(10000);
  const [customHeaders, setCustomHeaders] = useState<string>('{\n  "Content-Type": "application/json"\n}');

  // JSON-RPC Payload State
  const [selectedPreset, setSelectedPreset] = useState<string>('ai.generate');
  const [methodName, setMethodName] = useState<string>('ai.generate');
  const [paramsJson, setParamsJson] = useState<string>(
    JSON.stringify(
      {
        prompt: 'Analyze feature correlations and provide optimal hyperparameter recommendations.',
        model: 'llama-3.3-70b-instruct',
        temperature: 0.2,
        max_tokens: 1024,
      },
      null,
      2
    )
  );

  // Execution & Response State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [responsePayload, setResponsePayload] = useState<JsonRpcResponse | null>(null);
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [callHistory, setCallHistory] = useState<
    Array<{ id: string; timestamp: string; method: string; latencyMs: number; isSuccess: boolean }>
  >([]);

  // Presets mapping
  const RPC_PRESETS = [
    {
      id: 'ai.generate',
      nameAr: 'توليد نص / إكمال استنتاجي (ai.generate)',
      nameEn: 'Text & Inference Generation (ai.generate)',
      method: 'ai.generate',
      params: {
        prompt: 'Analyze feature correlations and provide optimal hyperparameter recommendations.',
        model: 'llama-3.3-70b-instruct',
        temperature: 0.2,
        max_tokens: 1024,
      },
    },
    {
      id: 'ai.analyzeData',
      nameAr: 'تحليل دلالي للبيانات والمخططات (ai.analyzeData)',
      nameEn: 'Semantic Data & Schema Profiling (ai.analyzeData)',
      method: 'ai.analyzeData',
      params: {
        dataset_name: 'Customer_Churn_Analysis',
        columns: ['age', 'tenure', 'balance', 'products_count', 'estimated_salary'],
        task: 'detect_anomalies_and_skewness',
      },
    },
    {
      id: 'ai.predictModel',
      nameAr: 'تنفيذ تنبؤ نموذج خارجي (ai.predictModel)',
      nameEn: 'Remote Model Prediction (ai.predictModel)',
      method: 'ai.predictModel',
      params: {
        model_id: 'xgboost-sales-predictor-v2',
        feature_vector: [45.2, 12.0, 350.7, 1.0],
        return_probabilities: true,
      },
    },
    {
      id: 'ai.nl2sql',
      nameAr: 'تحويل لغة طبيعية إلى SQL (ai.nl2sql)',
      nameEn: 'Natural Language to SQL Conversion (ai.nl2sql)',
      method: 'ai.nl2sql',
      params: {
        natural_query: 'Calculate top 5 selling product categories with highest profit margin',
        schema_definition: 'sales(id, product_id, category, revenue, profit, date)',
        dialect: 'postgresql',
      },
    },
    {
      id: 'rpc.ping',
      nameAr: 'فحص الاتصال والخدمة (rpc.ping)',
      nameEn: 'Service Health & Ping Check (rpc.ping)',
      method: 'rpc.ping',
      params: {
        echo: 'AI_STUDIO_PING',
        timestamp: Date.now(),
      },
    },
  ];

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = RPC_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setMethodName(preset.method);
      setParamsJson(JSON.stringify(preset.params, null, 2));
    }
  };

  const handleSendRpcRequest = async () => {
    let parsedParams: any = {};
    try {
      parsedParams = JSON.parse(paramsJson);
    } catch (err: any) {
      toast.error(
        isAr ? 'خطأ في صياغة JSON للبارامترات' : 'Invalid JSON Parameters',
        err.message || 'Please check syntax formatting.'
      );
      return;
    }

    const requestId = `req-${Date.now()}`;
    const rpcPayload: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: methodName.trim() || 'ai.generate',
      params: parsedParams,
      id: requestId,
    };

    setIsLoading(true);
    setResponsePayload(null);
    setRoundTripMs(null);
    setHttpStatus(null);

    const startTime = performance.now();

    try {
      // Execute via backend proxy /api/ai/jsonrpc to handle CORS and auth headers safely
      const response = await fetch('/api/ai/jsonrpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpointUrl,
          authToken: authToken.trim() || undefined,
          customHeaders: customHeaders.trim() ? JSON.parse(customHeaders) : undefined,
          payload: {
            ...rpcPayload,
            params: {
              ...(typeof rpcPayload.params === 'object' && rpcPayload.params !== null && !Array.isArray(rpcPayload.params) ? rpcPayload.params : {}),
              provider: (typeof rpcPayload.params === 'object' && rpcPayload.params !== null && !Array.isArray(rpcPayload.params) ? (rpcPayload.params as Record<string, any>).provider : undefined) ?? aiSettings.activeProvider,
              model: (typeof rpcPayload.params === 'object' && rpcPayload.params !== null && !Array.isArray(rpcPayload.params) ? (rpcPayload.params as Record<string, any>).model : undefined) ?? aiSettings.activeModel,
            },
          },
          timeoutMs,
        }),
      });

      const elapsed = Math.round(performance.now() - startTime);
      setRoundTripMs(elapsed);
      setHttpStatus(response.status);

      const jsonResult = await response.json();
      setResponsePayload(jsonResult);

      const isSuccess = !jsonResult.error && response.ok;

      // Add to call history
      setCallHistory((prev) => [
        {
          id: requestId,
          timestamp: new Date().toLocaleTimeString(),
          method: rpcPayload.method,
          latencyMs: elapsed,
          isSuccess,
        },
        ...prev.slice(0, 9),
      ]);

      if (isSuccess) {
        toast.success(
          isAr ? 'تم استلام استجابة JSON-RPC بنجاح!' : 'JSON-RPC Response Received!',
          isAr
            ? `اكتمل استدعاء ${rpcPayload.method} في ${elapsed} ملي ثانية.`
            : `Method ${rpcPayload.method} executed in ${elapsed}ms.`
        );
      } else {
        toast.warning(
          isAr ? 'تنبيه استجابة JSON-RPC' : 'JSON-RPC Warning/Error',
          jsonResult.error?.message || `HTTP ${response.status}`
        );
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setRoundTripMs(elapsed);
      setHttpStatus(500);

      const errorResp: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err.message || 'Internal RPC Gateway Error',
        },
        id: requestId,
      };
      setResponsePayload(errorResp);

      toast.error(isAr ? 'فشل استدعاء JSON-RPC' : 'JSON-RPC Execution Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyResponse = () => {
    if (!responsePayload) return;
    navigator.clipboard.writeText(JSON.stringify(responsePayload, null, 2));
    setCopiedResponse(true);
    toast.info(isAr ? 'تم النسخ' : 'Copied', isAr ? 'تم نسخ استجابة JSON-RPC إلى الحافظة.' : 'Copied response to clipboard.');
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg p-5 space-y-6 shadow-md">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#8a3ffc]/10 border border-[#8a3ffc]/30 flex items-center justify-center text-[#be95ff]">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--cds-text-01)]">
              {isAr ? 'بوابة نماذج الذكاء الاصطناعي الخارجية (JSON-RPC 2.0 AI Gateway)' : 'External AI JSON-RPC 2.0 Gateway'}
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded font-bold">
              RPC Spec 2.0
            </span>
          </div>
          <p className="text-xs text-[var(--cds-text-03)]">
            {isAr
              ? 'ربط المنصة بخوادم ونماذج الذكاء الاصطناعي المخصصة (vLLM، Triton، خوادم Python، ونماذج الحوسبة السحابية) عبر بروتوكول JSON-RPC 2.0 القياسي.'
              : 'Connect the platform to external AI microservices, vLLM inference engines, Triton servers, or custom Python endpoints using standard JSON-RPC 2.0.'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gateway Ready</span>
          </span>
        </div>
      </div>

      {/* Gateway Connection Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[var(--cds-layer-02)] p-4 rounded-lg border border-[var(--cds-border-subtle)] font-mono text-xs">
        <div className="md:col-span-2 space-y-1">
          <label className="text-[var(--cds-text-03)] text-[11px] block font-semibold flex items-center gap-1">
            <Server className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'عنوان نقطة النهاية (Endpoint URL):' : 'JSON-RPC Endpoint URL:'}</span>
          </label>
          <input
            type="url"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="http://localhost:8000/rpc or https://ai-server.internal/jsonrpc"
            className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 py-2 rounded-lg outline-hidden text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[var(--cds-text-03)] text-[11px] block font-semibold flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAr ? 'رمز التفويض (Bearer Token / Key):' : 'Authorization Bearer Token:'}</span>
          </label>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Optional secret token..."
            className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 py-2 rounded-lg outline-hidden text-xs"
          />
        </div>
      </div>

      {/* Preset Method Selector */}
      <div className="space-y-2">
        <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#be95ff]" />
          <span>{isAr ? 'نماذج استدعاء الطرق الجاهزة (Preset RPC Methods):' : 'Preset RPC Method Templates:'}</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {RPC_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className={`p-2.5 rounded-lg border text-xs font-mono transition-all text-left rtl:text-right cursor-pointer flex flex-col gap-1 ${
                selectedPreset === preset.id
                  ? 'bg-[#8a3ffc]/15 border-[#8a3ffc] text-white shadow-xs'
                  : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)]'
              }`}
            >
              <span className="font-bold text-[11px] text-[#78a9ff]">{preset.method}</span>
              <span className="text-[10px] text-[var(--cds-text-03)] line-clamp-1">{isAr ? preset.nameAr : preset.nameEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* RPC Payload Editor & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Request Payload Editor */}
        <div className="space-y-2 bg-[var(--cds-layer-02)] p-4 rounded-lg border border-[var(--cds-border-subtle)] font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--cds-text-01)] font-bold">
              <Code2 className="w-4 h-4 text-[#78a9ff]" />
              <span>{isAr ? 'محرر طلب JSON-RPC 2.0' : 'JSON-RPC 2.0 Request Payload'}</span>
            </div>
            <span className="text-[10px] text-[var(--cds-text-03)]">Method: {methodName}</span>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--cds-text-03)] uppercase block">{isAr ? 'اسم الطريقة (Method):' : 'Method Name:'}</label>
            <input
              type="text"
              value={methodName}
              onChange={(e) => setMethodName(e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 py-1.5 rounded-lg outline-hidden text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--cds-text-03)] uppercase block">{isAr ? 'البارامترات (Params JSON):' : 'Params (JSON Object / Array):'}</label>
            <textarea
              rows={8}
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[#42be65] p-3 rounded-lg font-mono text-xs outline-hidden focus:border-[#78a9ff]"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="text-[11px] text-[var(--cds-text-03)]">
              Timeout: <span className="text-white font-bold">{timeoutMs / 1000}s</span>
            </div>

            <button
              onClick={handleSendRpcRequest}
              disabled={isLoading}
              className="px-4 py-2 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/90 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isLoading ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? 'جارٍ الإرسال...' : 'Invoking RPC...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إرسال طلب JSON-RPC' : 'Execute JSON-RPC'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Response Viewer */}
        <div className="space-y-2 bg-[var(--cds-layer-02)] p-4 rounded-lg border border-[var(--cds-border-subtle)] font-mono text-xs flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--cds-text-01)] font-bold">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'استجابة الخادم (RPC Response Payload)' : 'Server Response Payload'}</span>
            </div>

            <div className="flex items-center gap-2">
              {roundTripMs !== null && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {roundTripMs} ms
                </span>
              )}
              {httpStatus !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  httpStatus === 200 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  HTTP {httpStatus}
                </span>
              )}
              {responsePayload && (
                <button
                  onClick={handleCopyResponse}
                  className="px-2 py-0.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] rounded text-[10px] flex items-center gap-1 text-[var(--cds-text-02)] cursor-pointer"
                >
                  {copiedResponse ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grow">
            <pre className="h-[260px] overflow-auto bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] p-3 rounded-lg font-mono text-xs leading-relaxed">
              {responsePayload
                ? JSON.stringify(responsePayload, null, 2)
                : `// Waiting for JSON-RPC execution...\n// Click "Execute JSON-RPC" to send payload to ${endpointUrl}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Recent Call History */}
      {callHistory.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--cds-border-subtle)]">
          <span className="text-[10px] font-mono uppercase text-[var(--cds-text-03)] block font-semibold">
            {isAr ? 'سجل العمليات والاستدعاءات الأخيرة (Recent RPC Invocations):' : 'Recent RPC Invocations:'}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 font-mono text-xs">
            {callHistory.map((item, idx) => (
              <div
                key={idx}
                className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-2.5 rounded-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.isSuccess ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="font-bold text-[var(--cds-text-01)]">{item.method}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--cds-text-03)]">
                  <span>{item.latencyMs}ms</span>
                  <span>{item.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
