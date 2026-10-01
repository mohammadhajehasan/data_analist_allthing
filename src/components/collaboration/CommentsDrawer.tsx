import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  MessageSquare,
  X,
  Send,
  CheckCircle2,
  CornerDownLeft,
  Trash2,
  Pin,
  Filter,
  Users,
  Sparkles,
  Tag,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RoleType } from '../../types';

export const CommentsDrawer: React.FC = () => {
  const {
    isCommentsDrawerOpen,
    setIsCommentsDrawerOpen,
    comments,
    addComment,
    addCommentReply,
    toggleCommentResolved,
    deleteComment,
    activeCommentTarget,
    setActiveCommentTarget,
    user,
    language,
    isRTL,
    formatDate,
  } = useApp();

  const [newCommentText, setNewCommentText] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [activeReplyBoxId, setActiveReplyBoxId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'resolved' | 'target'>('all');

  if (!isCommentsDrawerOpen) return null;

  // Filter logic
  const filteredComments = comments.filter(c => {
    if (filterMode === 'target' && activeCommentTarget) {
      return c.targetType === activeCommentTarget.type && c.targetId === activeCommentTarget.id;
    }
    if (filterMode === 'open') return !c.resolved;
    if (filterMode === 'resolved') return c.resolved;
    return true;
  });

  const handleCreateComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    addComment({
      targetType: (activeCommentTarget?.type as any) || 'dashboard',
      targetId: activeCommentTarget?.id || 'main-dashboard',
      targetTitle: activeCommentTarget?.title || (language === 'ar' ? 'لوحة القيادة الرئيسية' : 'Main Dashboard'),
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      content: newCommentText.trim(),
      contentAr: newCommentText.trim(),
    });

    setNewCommentText('');
  };

  const handleSendReply = (commentId: string) => {
    const text = replyTexts[commentId];
    if (!text || !text.trim()) return;

    addCommentReply(commentId, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      content: text.trim(),
    });

    setReplyTexts(prev => ({ ...prev, [commentId]: '' }));
    setActiveReplyBoxId(null);
  };

  const getRoleBadge = (role: RoleType) => {
    switch (role) {
      case 'admin':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 font-mono">ADMIN</span>;
      case 'analyst':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 font-mono">ANALYST</span>;
      case 'engineer':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 font-mono">DATA ENG</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-mono">VIEWER</span>;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity">
        <motion.div
          initial={{ x: isRTL ? -420 : 420 }}
          animate={{ x: 0 }}
          exit={{ x: isRTL ? -420 : 420 }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          className="w-full max-w-md h-full flex flex-col bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border-l border-[var(--cds-border-subtle)] shadow-2xl z-50"
          id="comments-drawer-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded bg-[#0f62fe]/15 text-[#0f62fe]">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-wide">
                  {language === 'ar' ? 'التعليقات والمناقشات التعاونية' : 'Team Comments & Annotations'}
                </h3>
                <p className="text-xs text-[var(--cds-text-03)]">
                  {language === 'ar' ? 'ملاحظات التحليل ومناقشة الرسوم البيانية' : 'Discuss charts, trends, and team findings'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsCommentsDrawerOpen(false)}
              className="p-1.5 text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)] rounded transition"
              id="close-comments-drawer-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Context Bar */}
          {activeCommentTarget && (
            <div className="px-5 py-2.5 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate text-[var(--cds-text-02)]">
                <Tag className="w-3.5 h-3.5 text-[#0f62fe]" />
                <span className="truncate">
                  {language === 'ar' ? 'السياق النشط:' : 'Context:'}{' '}
                  <strong className="text-white">{activeCommentTarget.title || activeCommentTarget.id}</strong>
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveCommentTarget(null);
                  setFilterMode('all');
                }}
                className="text-[11px] text-[#0f62fe] hover:underline"
              >
                {language === 'ar' ? 'عرض الكل' : 'Clear'}
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex items-center gap-1.5 px-5 py-2.5 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] text-xs">
            <Filter className="w-3.5 h-3.5 text-[var(--cds-text-03)] me-1" />
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded text-xs transition ${
                filterMode === 'all'
                  ? 'bg-[#0f62fe] text-white font-medium'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {language === 'ar' ? `الكل (${comments.length})` : `All (${comments.length})`}
            </button>
            <button
              onClick={() => setFilterMode('open')}
              className={`px-2.5 py-1 rounded text-xs transition ${
                filterMode === 'open'
                  ? 'bg-[#0f62fe] text-white font-medium'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {language === 'ar'
                ? `قيد النقاش (${comments.filter(c => !c.resolved).length})`
                : `Open (${comments.filter(c => !c.resolved).length})`}
            </button>
            <button
              onClick={() => setFilterMode('resolved')}
              className={`px-2.5 py-1 rounded text-xs transition ${
                filterMode === 'resolved'
                  ? 'bg-[#0f62fe] text-white font-medium'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {language === 'ar'
                ? `المحلولة (${comments.filter(c => c.resolved).length})`
                : `Resolved (${comments.filter(c => c.resolved).length})`}
            </button>
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {filteredComments.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[var(--cds-text-03)]">
                <MessageSquare className="w-10 h-10 stroke-1 text-[var(--cds-text-03)] mb-3" />
                <p className="text-sm font-medium text-[var(--cds-text-02)]">
                  {language === 'ar' ? 'لا توجد تعليقات مسجلة حالياً' : 'No comments found'}
                </p>
                <p className="text-xs text-[var(--cds-text-03)] mt-1 max-w-xs">
                  {language === 'ar'
                    ? 'انقر على أيقونة التعليق في أي رسم بياني أو تقرير لبدء نقاش فني مع الفريق.'
                    : 'Click on the comment icon on any chart widget or report to start a discussion.'}
                </p>
              </div>
            ) : (
              filteredComments.map(comment => (
                <div
                  key={comment.id}
                  className={`p-3.5 rounded border transition ${
                    comment.resolved
                      ? 'bg-[var(--cds-layer-01)]/60 border-[var(--cds-border-subtle)] opacity-75'
                      : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] shadow-sm'
                  }`}
                  id={`comment-card-${comment.id}`}
                >
                  {/* Top line: Author info & target title */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#0f62fe] text-white flex items-center justify-center font-bold text-xs">
                        {comment.authorName ? comment.authorName.charAt(0) : 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[var(--cds-text-01)]">{comment.authorName}</span>
                          {getRoleBadge(comment.authorRole)}
                        </div>
                        <span className="text-[10px] text-[var(--cds-text-03)]">
                          {formatDate(comment.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleCommentResolved(comment.id)}
                        title={comment.resolved ? (language === 'ar' ? 'إعادة الفتح' : 'Re-open') : (language === 'ar' ? 'تحديد كمكتمل' : 'Mark resolved')}
                        className={`p-1 rounded text-xs transition ${
                          comment.resolved
                            ? 'text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60'
                            : 'text-[var(--cds-text-03)] hover:text-emerald-400 hover:bg-[var(--cds-layer-03)]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="p-1 rounded text-[var(--cds-text-03)] hover:text-red-400 hover:bg-[var(--cds-layer-03)] transition"
                        title={language === 'ar' ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Target reference badge */}
                  {comment.targetTitle && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded bg-[var(--cds-layer-01)] text-[var(--cds-text-03)] text-[11px] border border-[var(--cds-border-subtle)]">
                      <Tag className="w-3 h-3 text-[#0f62fe]" />
                      <span className="truncate max-w-[200px]">{comment.targetTitle}</span>
                      {comment.chartContext?.metricValue && (
                        <span className="text-white font-mono font-medium me-1">
                          ({comment.chartContext.metricValue})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <p className="text-xs text-[var(--cds-text-01)] leading-relaxed whitespace-pre-wrap">
                    {language === 'ar' && comment.contentAr ? comment.contentAr : comment.content}
                  </p>

                  {/* Resolved status indicator */}
                  {comment.resolved && (
                    <div className="mt-2.5 pt-2 border-t border-[var(--cds-border-subtle)] flex items-center gap-1 text-[11px] text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {language === 'ar'
                          ? `تم الحل بواسطة ${comment.resolvedBy || 'الفريق'}`
                          : `Resolved by ${comment.resolvedBy || 'Team'}`}
                      </span>
                    </div>
                  )}

                  {/* Thread Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 space-y-2 ps-3 border-s-2 border-[var(--cds-border-subtle)] me-1">
                      {comment.replies.map(reply => (
                        <div key={reply.id} className="p-2 rounded bg-[var(--cds-layer-01)] text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-[var(--cds-text-01)] text-[11px]">{reply.authorName}</span>
                            <span className="text-[9px] text-[var(--cds-text-03)]">
                              {formatDate(reply.createdAt, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[var(--cds-text-02)] text-[11px]">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Action Trigger */}
                  <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-[var(--cds-border-subtle)]">
                    <button
                      onClick={() =>
                        setActiveReplyBoxId(activeReplyBoxId === comment.id ? null : comment.id)
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-[#0f62fe] hover:underline"
                    >
                      <CornerDownLeft className="w-3 h-3" />
                      <span>{language === 'ar' ? 'إضافة رد...' : 'Reply...'}</span>
                    </button>
                  </div>

                  {/* Inline Reply Input */}
                  {activeReplyBoxId === comment.id && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={replyTexts[comment.id] || ''}
                        onChange={e =>
                          setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSendReply(comment.id);
                        }}
                        placeholder={language === 'ar' ? 'اكتب ردك هنا...' : 'Type your reply...'}
                        className="flex-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] rounded px-2.5 py-1.5 text-xs text-white placeholder-[#6f6f6f] outline-hidden"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSendReply(comment.id)}
                        className="p-1.5 bg-[#0f62fe] text-white rounded hover:bg-[#0353e9] transition"
                        title={language === 'ar' ? 'إرسال' : 'Send'}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bottom New Comment Composer */}
          <div className="p-4 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
            <form onSubmit={handleCreateComment} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-[var(--cds-text-03)]">
                <span>
                  {language === 'ar'
                    ? `إضافة ملاحظة إلى: ${activeCommentTarget?.title || 'لوحة القيادة الحالية'}`
                    : `Add annotation to: ${activeCommentTarget?.title || 'Current Dashboard'}`}
                </span>
              </div>
              <div className="relative">
                <textarea
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'اكتب تحليلك، ملاحظاتك الإحصائية، أو تساؤلاتك للفريق...'
                      : 'Add an analytical note, question, or finding...'
                  }
                  rows={2}
                  className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] rounded p-2.5 text-xs text-white placeholder-[#6f6f6f] outline-hidden resize-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      handleCreateComment(e);
                    }
                  }}
                  id="new-comment-textarea"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--cds-text-03)]">
                  {language === 'ar' ? 'اضغط Ctrl+Enter للإرسال' : 'Press Ctrl+Enter to send'}
                </span>
                <button
                  type="submit"
                  disabled={!newCommentText.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] text-white text-xs font-medium rounded hover:bg-[#0353e9] disabled:opacity-40 disabled:pointer-events-none transition"
                  id="submit-comment-btn"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'نشر الملاحظة' : 'Post Comment'}</span>
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
