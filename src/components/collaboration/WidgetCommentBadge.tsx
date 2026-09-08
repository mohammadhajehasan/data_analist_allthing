import React from 'react';
import { useApp } from '../../context/AppContext';
import { MessageSquare } from 'lucide-react';

interface WidgetCommentBadgeProps {
  targetType: 'dashboard_widget' | 'dashboard' | 'report_chapter' | 'report' | 'dataset';
  targetId: string;
  targetTitle?: string;
  metricValue?: string | number;
  className?: string;
}

export const WidgetCommentBadge: React.FC<WidgetCommentBadgeProps> = ({
  targetType,
  targetId,
  targetTitle,
  metricValue,
  className = '',
}) => {
  const { comments, setActiveCommentTarget, setIsCommentsDrawerOpen, language } = useApp();

  const targetComments = comments.filter(
    c => c.targetType === targetType && c.targetId === targetId
  );
  const openCount = targetComments.filter(c => !c.resolved).length;
  const count = targetComments.length;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveCommentTarget({
      type: targetType,
      id: targetId,
      title: targetTitle,
    });
    setIsCommentsDrawerOpen(true);
  };

  return (
    <button
      onClick={handleClick}
      title={
        count > 0
          ? `${count} ${language === 'ar' ? 'تعليقات وملاحظات' : 'comments'}`
          : language === 'ar'
          ? 'إضافة تعليق أو ملاحظة'
          : 'Add comment'
      }
      className={`relative inline-flex items-center justify-center p-1 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-[#f4f4f4] transition ${className}`}
      id={`comment-badge-${targetId}`}
    >
      <MessageSquare className="w-4 h-4" />
      {count > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 text-[9px] font-bold rounded-full flex items-center justify-center ${
            openCount > 0
              ? 'bg-[#0f62fe] text-white'
              : 'bg-gray-600 text-gray-200'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
