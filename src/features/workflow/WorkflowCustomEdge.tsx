import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
} from '@xyflow/react';
import { X, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export const WorkflowCustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  sourceHandleId,
  label,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isArabic =
    document.documentElement.dir === 'rtl' ||
    (typeof window !== 'undefined' && localStorage.getItem('carbon_language') === 'ar');

  const isPass = sourceHandleId === 'pass' || label?.toString().toLowerCase().includes('pass');
  const isFail = sourceHandleId === 'fail' || label?.toString().toLowerCase().includes('fail');

  const strokeColor = isPass
    ? '#24a148'
    : isFail
    ? '#da1e28'
    : selected
    ? '#78a9ff'
    : '#0f62fe';

  const onDelete = (data as any)?.onDelete;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: selected ? 3.5 : 2.5,
          strokeDasharray: isFail ? '6 4' : undefined,
          filter: selected ? 'drop-shadow(0 0 6px rgba(15, 98, 254, 0.8))' : 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.5))',
          transition: 'stroke 0.2s, stroke-width 0.2s',
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan group flex items-center gap-1 bg-[var(--cds-layer-01)]/95 backdrop-blur-md px-2 py-0.5 rounded-full border shadow-xl transition-all duration-200 hover:scale-110"
          css-border-color={strokeColor}
        >
          {isPass && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-[#42be65] font-bold">
              <CheckCircle2 className="w-3 h-3" />
              <span>{isArabic ? 'ناجح (Pass)' : 'Pass'}</span>
            </div>
          )}

          {isFail && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-[#fa4d56] font-bold">
              <AlertCircle className="w-3 h-3" />
              <span>{isArabic ? 'فشل (Fail)' : 'Fail'}</span>
            </div>
          )}

          {!isPass && !isFail && (
            <div className="flex items-center gap-1 text-[9px] font-mono text-[#78a9ff]">
              <ArrowRight className="w-2.5 h-2.5" />
              <span>{isArabic ? 'تدفق' : 'Flow'}</span>
            </div>
          )}

          {/* Quick Delete Edge Button */}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="ml-1 p-0.5 rounded-full text-[var(--cds-text-03)] hover:text-white hover:bg-[#da1e28] transition-colors cursor-pointer"
              title={isArabic ? 'حذف خط التوصيل' : 'Delete Connection'}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
