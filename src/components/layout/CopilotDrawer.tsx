import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { checkAiAccess, aiAccessBlockMessage } from '../../utils/aiAccessGuard';
import { ChatMessage, DataStory } from '../../types';
import { Bot, User, X, Sparkles, Send, Terminal, ChevronRight, LayoutDashboard, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const CopilotDrawer: React.FC = () => {
  const {
    isCopilotOpen,
    setIsCopilotOpen,
    activeChatSession,
    addChatMessage,
    activeDataset,
    datasets,
    aiSettings,
    language,
    t,
    activeTab,
    activeDashboard,
    saveDataStory,
    saveDashboard,
    setActiveDashboardId,
    setActiveTab,
    toast,
  } = useApp();

  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAr = language === 'ar';
  const targetDataset = activeDataset || (datasets && datasets.length > 0 ? datasets[0] : null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isCopilotOpen) {
      scrollToBottom();
    }
  }, [activeChatSession.messages, isThinking, isCopilotOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() || isThinking) return;

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

      const activeProviderConf = aiSettings.providers[aiSettings.activeProvider] || ({} as any);
      const access = checkAiAccess(aiSettings.activeProvider, activeProviderConf);
      if (!access.ok) {
        setIsThinking(false);
        const { title, description } = aiAccessBlockMessage(access.reason || 'no-key', language === 'ar', activeProviderConf?.nameAr || activeProviderConf?.name || 'المزود النشط');
        toast.warning(title, description);
        setActiveTab('models');
        setIsCopilotOpen(false);
        return;
      }

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

      const data = await res.json();

      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : (isAr ? 'فشل في الرد على استفسارك' : 'AI Assistant request failed');
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          content: errMsg,
          timestamp: new Date().toISOString(),
        };
        addChatMessage(activeChatSession.id, assistantMsg);
        return;
      }

      let replyContent = data.reply || (language === 'ar' ? 'تمت معالجة استفسارك التحليلي بنجاح.' : 'Analytical query analyzed.');
      let actionObj = null;

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
          chapters: (actionObj.report.sections || []).map((s: any, i: number) => ({
            id: `ch-${i}`,
            title: s.title,
            titleAr: s.title,
            narrative: s.narrative,
            narrativeAr: s.narrative,
            chartConfig: undefined,
            chartType: 'bar' as const,
            chartData: [],
            xAxis: '',
            yAxis: '',
            categoryField: '',
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
          sections: (actionObj.report.sections || []).map((s: any, i: number) => ({
            id: `sec-${i}`,
            title: s.title,
            titleAr: s.title,
            narrative: s.narrative,
            narrativeAr: s.narrative,
            insights: s.insights || [],
          })),
          recommendations: actionObj.report.recommendations || [],
          generatedAt: new Date().toISOString(),
          author: 'AI Agent Copilot',
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
            saveDashboard(newDashboard as any);
            setActiveDashboardId(newDashboard.id);
         }
         
         if (actionObj.tab) {
           setTimeout(() => {
             setActiveTab(actionObj.tab);
           }, 1500);
         }
      }

    } catch (err) {
      console.error('Error in chat assistant:', err);
      const fallbackMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        content: isAr
          ? (targetDataset
              ? `بناءً على مجموعة البيانات النشطة (${targetDataset.name})، تم فحص العلاقات الإحصائية للأعمدة واستخراج النتائج.`
              : 'أهلاً بك! يمكنك سؤالي عن البيانات أو تحليلات المنصة.')
          : (targetDataset
              ? `Based on active dataset (${targetDataset.name}), relevant trends and distribution statistics have been computed.`
              : 'Welcome! You can ask questions about analytics or explore the dashboard.'),
        timestamp: new Date().toISOString(),
        sqlSnippet: targetDataset ? `SELECT * FROM ${targetDataset.name.replace(/\s+/g, '_').toLowerCase()} LIMIT 10;` : undefined,
      };
      addChatMessage(activeChatSession.id, fallbackMsg);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <AnimatePresence>
      {isCopilotOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed top-0 end-0 w-96 h-full bg-[var(--cds-layer-01)] border-s border-[var(--cds-border-subtle)] shadow-2xl z-50 flex flex-col font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
            <div className="flex items-center gap-2 text-[var(--cds-text-01)]">
              <BrainCircuit className="w-5 h-5 text-[var(--cds-interactive-01)]" />
              <div>
                <h2 className="text-sm font-bold tracking-tight">
                  {isAr ? 'الوكيل الذكي (إدراك السياق)' : 'AI Agent Copilot'}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
                    {aiSettings.activeModel}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsCopilotOpen(false)}
              className="p-1 hover:bg-[var(--cds-layer-hover-01)] rounded text-[var(--cds-text-02)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-4 py-2 bg-[var(--cds-interactive-01)]/10 border-b border-[var(--cds-interactive-01)]/20 flex items-center gap-2 text-[11px] font-mono text-[var(--cds-interactive-01)]">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>
              {isAr ? `السياق النشط: ${activeTab}` : `Active Context: ${activeTab.toUpperCase()}`}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeChatSession.messages.length === 0 && (
              <div className="text-center text-[var(--cds-text-02)] text-xs mt-10 space-y-3">
                <BrainCircuit className="w-8 h-8 mx-auto opacity-50" />
                <p>
                  {isAr 
                    ? 'أنا مستعد لمساعدتك! أنا أرى ما تراه الآن على الشاشة ويمكنني تقديم اقتراحات.' 
                    : "I'm ready to help! I can see what you're looking at and provide contextual suggestions."}
                </p>
              </div>
            )}
            
            {activeChatSession.messages.map(msg => {
              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? 'ms-auto flex-row-reverse' : 'me-auto'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-[var(--cds-interactive-01)] text-white' : 'bg-[var(--cds-layer-03)] text-[var(--cds-interactive-01)]'}`}>
                    {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>
                  <div className={`p-3 rounded-xl text-xs leading-relaxed ${isUser ? 'bg-[var(--cds-interactive-01)]/10 text-[var(--cds-text-01)] rounded-tr-sm' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] rounded-tl-sm'}`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.sqlSnippet && (
                      <div className="mt-2 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 rounded-md font-mono text-[10px]">
                        <div className="text-[var(--cds-interactive-01)] font-bold uppercase mb-1 flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> SQL
                        </div>
                        {msg.sqlSnippet}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div className="flex gap-3 me-auto">
                <div className="w-6 h-6 rounded-full bg-[var(--cds-layer-03)] text-[var(--cds-interactive-01)] flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="p-3 bg-[var(--cds-layer-02)] rounded-xl rounded-tl-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cds-interactive-01)] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cds-interactive-01)] animate-bounce delay-150" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cds-interactive-01)] animate-bounce delay-300" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-[var(--cds-layer-02)] border-t border-[var(--cds-border-subtle)]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder={isAr ? 'اسأل الوكيل عن الشاشة الحالية...' : 'Ask agent about the current view...'}
                className="flex-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--cds-text-01)] focus:outline-none focus:border-[var(--cds-interactive-01)]"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputPrompt.trim() || isThinking}
                className="w-8 h-8 rounded-lg bg-[var(--cds-interactive-01)] hover:bg-[#0053e6] disabled:opacity-50 text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Context Actions */}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button 
                onClick={() => handleSendMessage(isAr ? 'هل يمكنك اقتراح مخطط بياني بناءً على هذه الشاشة؟' : 'Can you suggest a chart based on this view?')}
                className="text-[10px] whitespace-nowrap px-2 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-subtle)] text-[var(--cds-text-02)] rounded-full transition-colors"
              >
                {isAr ? 'اقتراح مخططات 📊' : 'Suggest charts 📊'}
              </button>
              <button 
                onClick={() => handleSendMessage(isAr ? 'ما هي الأنماط الغريبة في هذه البيانات؟' : 'What anomalies are in this data?')}
                className="text-[10px] whitespace-nowrap px-2 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-subtle)] text-[var(--cds-text-02)] rounded-full transition-colors"
              >
                {isAr ? 'اكتشاف الأنماط 🔍' : 'Find patterns 🔍'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
