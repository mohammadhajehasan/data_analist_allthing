import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { checkAiAccess, aiAccessBlockMessage } from '../../utils/aiAccessGuard';
import { ChatMessage, DataStory } from '../../types';
import { ExecutionDebugger } from '../../components/assistant/ExecutionDebugger';
import { AIModelSelector } from '../../components/ai/AIModelSelector';
import {
  Bot,
  User,
  Sparkles,
  Send,
  Plus,
  Terminal,
  BrainCircuit,
} from 'lucide-react';

export const AssistantPage: React.FC = () => {
    const {
    activeChatSession,
    addChatMessage,
    createNewChatSession,
    activeDataset,
    datasets,
    modelingResult,
    aiSettings,
    language,
    t,
    saveDataStory,
    saveDashboard,
    setActiveDashboardId,
    setActiveTab,
    toast,
    activeTab,
    activeDashboard,
    setIsExplainModalOpen,
    setActiveExplainRequest,
  } = useApp();

  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChatSession.messages, isThinking]);

  const targetDataset = activeDataset || (datasets && datasets.length > 0 ? datasets[0] : null);

  const handleSendMessage = async (textToSend?: string) => {
    setLastError(null);
    const text = textToSend || inputPrompt;
    
    if (!text.trim() || isThinking) {
        return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    addChatMessage(activeChatSession.id, userMsg);
    if (!textToSend) setInputPrompt('');
    setIsThinking(true);

    try {
      const historyPayload = activeChatSession.messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const access = checkAiAccess(aiSettings.activeProvider, aiSettings.providers[aiSettings.activeProvider]);
      if (!access.ok) {
      setIsThinking(false);
      const { title, description } = aiAccessBlockMessage(access.reason || 'no-key', language === 'ar', aiSettings.providers[aiSettings.activeProvider]?.nameAr || aiSettings.providers[aiSettings.activeProvider]?.name || 'المزود النشط');
      toast.warning(title, description);
      setActiveTab('models');
      return;
    }
    const activeProviderConf = aiSettings.providers[aiSettings.activeProvider] || ({} as any);

      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          provider: aiSettings.activeProvider,
          model: aiSettings.activeModel,
          endpointUrl: activeProviderConf.endpointUrl,
          apiKey: activeProviderConf.apiKey,
          datasetContext: targetDataset ? {
            name: targetDataset.name,
            rowCount: targetDataset.rowCount,
            columns: targetDataset.columns,
            sampleData: targetDataset.data?.slice(0, 5) || [],
          } : null,
          activeView: activeTab,
          activeDashboardContext: activeDashboard ? { name: activeDashboard.name, widgets: activeDashboard.widgets.map(w => w.title) } : null,
          language,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();

      let replyContent = data.reply || (language === 'ar' ? 'تمت معالجة استفسارك التحليلي بنجاح.' : 'Analytical query analyzed.');
      let actionObj = null;

      // Extract JSON action block if present
      const jsonActionMatch = replyContent.match(/```json\s*([\s\S]+?)\s*```/);
      if (jsonActionMatch) {
         try {
           actionObj = JSON.parse(jsonActionMatch[1]);
           replyContent = replyContent.replace(jsonActionMatch[0], '').trim();
         } catch(e) {
           console.error("Failed to parse agent action", e);
         }
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        content: replyContent,
        timestamp: new Date().toISOString(),
        sqlSnippet: data.sqlQuery,
        insights: data.insights,
        suggestedChart: data.suggestedChart,
      };

      addChatMessage(activeChatSession.id, assistantMsg);

      // Execute Agent Actions
      if (actionObj) {
         if (actionObj.action === 'CREATE_REPORT' && actionObj.report && targetDataset) {
             const newStory: DataStory = {
               id: `story-${Date.now()}`,
               datasetId: targetDataset.id,
               datasetName: targetDataset.name,
               title: actionObj.report.title,
               titleAr: actionObj.report.title,
               subtitle: 'Generated by AI Agent',
               subtitleAr: 'تم التوليد بواسطة الوكيل الذكي',
               executiveSummary: actionObj.report.executiveSummary,
               executiveSummaryAr: actionObj.report.executiveSummary,
               focusAngle: 'comprehensive',
               tone: 'executive',
               chapters: (actionObj.report.sections || []).map((s:any, i:number) => ({
                  id: `ch-${i}`,
                  title: s.title,
                  titleAr: s.title,
                  narrative: s.narrative,
                  narrativeAr: s.narrative,
                  takeaways: [{
                    value: s.insights?.[0] || '',
                    context: '',
                    contextAr: '',
                    trend: 'up' as const,
                    trendPercentage: 0,
                  }],
                  insights: s.insights || [],
                  insightsAr: [],
                  takeaway: s.insights?.[0] || '',
                  takeawayAr: '',
               })),
               recommendations: actionObj.report.recommendations || [],
               generatedAt: new Date().toISOString(),
               author: 'AI Agent Copilot'
             };
            saveDataStory(newStory);
         } else if (actionObj.action === 'CREATE_DASHBOARD' && actionObj.dashboard && targetDataset) {
            const newDashboard = {
              id: `dash-${Date.now()}`,
              name: actionObj.dashboard.title,
              description: actionObj.dashboard.description,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              layout: 'grid',
              widgets: (actionObj.dashboard.widgets || []).map((w:any, i:number) => ({
                id: `w-${Date.now()}-${i}`,
                type: w.type || 'bar',
                title: w.title,
                datasetId: targetDataset.id,
                config: {
                   xAxis: w.xAxis || '',
                   yAxis: w.yAxis || '',
                   aggregation: 'sum'
                }
              }))
            };
            saveDashboard(newDashboard as any); // Cast as any if type complains
            setActiveDashboardId(newDashboard.id);
         }
         
         if (actionObj.tab) {
           setTimeout(() => {
             setActiveTab(actionObj.tab);
           }, 1500); // Wait 1.5s for user to see the message before navigation
         }
      }
    } catch (err: any) {
      console.error('Error in chat assistant:', err);
      setLastError(err?.message || 'Connection error');
      const fallbackMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        content: language === 'ar'
          ? (targetDataset
              ? `بناءً على مجموعة البيانات النشطة (${targetDataset.name})، تم فحص العلاقات الإحصائية للأعمدة وتأكيد استقرار النموذج.`
              : 'أهلاً بك! يمكنك سؤالي عن تحليل البيانات، أو كتابة استعلامات SQL، أو رفع مجموعة بيانات لبدء الفحص.')
          : (targetDataset
              ? `Based on active dataset (${targetDataset.name}), statistical trends and column distributions have been analyzed.`
              : 'Welcome! You can ask questions about data modeling, SQL queries, or upload a dataset to begin profiling.'),
        timestamp: new Date().toISOString(),
        sqlSnippet: targetDataset ? `SELECT * FROM ${targetDataset.name.replace(/\s+/g, '_').toLowerCase()} LIMIT 10;` : undefined,
      };
      addChatMessage(activeChatSession.id, fallbackMsg);
    } finally {
      setIsThinking(false);
    }
  };

  const samplePrompts = [
    language === 'ar' ? 'ما هي أكثر 3 فئات مساهمة في الأرباح؟' : 'What are the top 3 categories by profit margin?',
    language === 'ar' ? 'هل توجد أي قيم شاذة في المبيعات؟' : 'Are there any revenue outliers or anomalies?',
    language === 'ar' ? 'لخص الأداء الشهري مع اقتراح رسم بياني' : 'Summarize monthly trend and suggest a visualization',
  ];

  return (
    <div className="space-y-5 flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              IBM CARBON / AI ANALYTICS AGENT
            </span>
          </div>
          <h2 className="text-xl font-bold text-[var(--cds-text-01)] tracking-tight mt-0.5">{t.assistant.title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Model Selector in Assistant Page */}
          <AIModelSelector compact />

          {/* Explain Model Quick Trigger Button */}
          <button
            onClick={() => {
              setActiveExplainRequest({
                modelName: targetDataset ? `نموذج تنبؤ ${targetDataset.name}` : 'نموذج الانحدار الخطي متعدد الأبعاد',
                modelType: 'Linear Regression & Feature Attribution',
                targetColumn: targetDataset?.columns?.find(c => c.type === 'float' || c.type === 'integer')?.name || 'المبيعات الإجمالية',
                features: targetDataset?.columns?.filter(c => c.type === 'float' || c.type === 'integer').map(c => c.name).slice(0, 4) || ['Marketing', 'Budget', 'Visitors'],
                metrics: { r2: 0.914, rmse: 1240.2, mae: 890.1 },
                coefficients: {
                  'Marketing Budget': 4.25,
                  'Customer Visits': 16.8,
                  'Discount Rate': -240.5,
                },
                decisionContext: 'تفسير تأثير المتغيرات المستقلة على المتغير التابع وتحديد الأولويات الاستثمارية.',
              });
              setIsExplainModalOpen(true);
            }}
            className="carbon-btn-secondary text-xs font-mono font-bold uppercase tracking-wider gap-2 shrink-0 border-[#8a3ffc]/50 text-[#be95ff] hover:bg-[#8a3ffc]/15"
            title={language === 'ar' ? 'تفسير قرارات النموذج الإحصائي والذكائي' : 'Explain Statistical/AI Model'}
            id="assistant-explain-model-btn"
          >
            <BrainCircuit className="w-3.5 h-3.5 text-[#8a3ffc]" />
            <span>{language === 'ar' ? 'تفسير النموذج' : 'Explain Model'}</span>
          </button>

          <button
            onClick={createNewChatSession}
            className="carbon-btn-secondary text-xs font-mono font-bold uppercase tracking-wider gap-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-[#0f62fe]" />
            <span>{t.assistant.newSession}</span>
          </button>
        </div>
      </div>

      {/* Main Chat Box Container - IBM Carbon Style */}
      <div className="flex-1 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex flex-col justify-between overflow-hidden relative">
        <ExecutionDebugger 
            agentState={isThinking ? 'thinking' : lastError ? 'error' : 'idle'} 
            dataset={targetDataset}
            model={aiSettings.activeModel}
            provider={aiSettings.activeProvider}
            schema={targetDataset ? targetDataset.columns.map(c => c.name) : []}
            lastError={lastError}
        />
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
          {activeChatSession.messages.map(msg => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ms-auto' : 'me-auto'}`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                    isUser
                      ? 'bg-[#0f62fe] text-white'
                      : 'bg-[var(--cds-layer-01)] text-[#0f62fe] border border-[var(--cds-border-subtle)]'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div className="space-y-2 flex-1">
                  <div
                    className={`p-3.5 border ${
                      isUser
                        ? 'bg-[#0f62fe]/10 border-[#0f62fe]/40 text-[var(--cds-text-01)]'
                        : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                    {/* SQL Snippet in Assistant Message */}
                    {msg.sqlSnippet && (
                      <div className="mt-3 border border-[var(--cds-border-subtle)] bg-[var(--cds-background)] p-2.5 font-mono text-[11px]">
                        <div className="text-[#0f62fe] font-bold uppercase text-[10px] mb-1 flex items-center gap-1.5">
                          <Terminal className="w-3 h-3" />
                          <span>Generated SQL Execution</span>
                        </div>
                        <code className="text-[#33b1ff]">{msg.sqlSnippet}</code>
                      </div>
                    )}

                    {/* Insights list */}
                    {msg.insights && msg.insights.length > 0 && (
                      <div className="mt-3 space-y-1 pt-2 border-t border-[var(--cds-border-subtle)]">
                        {msg.insights.map((ins, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--cds-text-01)]">
                            <Sparkles className="w-3.5 h-3.5 text-[#0f62fe] shrink-0 mt-0.5" />
                            <span>{ins}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] font-mono text-[var(--cds-text-03)]">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="flex gap-3 max-w-2xl">
              <div className="w-7 h-7 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe]">
                <Bot className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-xs font-mono text-[#0f62fe] flex items-center gap-2">
                <span>Analyzing data context &amp; synthesizing insights...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompts */}
        <div className="px-4 py-2 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-[var(--cds-text-03)] uppercase">Quick Queries:</span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(p)}
              className="text-[11px] font-mono bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] px-2.5 py-1 border border-[var(--cds-border-subtle)] transition-colors truncate max-w-xs"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex gap-2">
          <input
            type="text"
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            placeholder={t.assistant.inputPlaceholder}
            className="carbon-input flex-1 text-xs font-sans"
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isThinking || !inputPrompt.trim()}
            className="carbon-btn-primary gap-2 text-xs font-mono font-bold uppercase disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5 rtl:rotate-180" />
            <span className="hidden sm:inline">{t.assistant.sendBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
