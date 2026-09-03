import React from 'react';
import { ConnectionLineComponentProps, getBezierPath } from '@xyflow/react';

export const WorkflowConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromHandle,
}) => {
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  const isPass = fromHandle?.id === 'pass';
  const isFail = fromHandle?.id === 'fail';
  const strokeColor = isPass ? '#24a148' : isFail ? '#da1e28' : '#0f62fe';

  return (
    <g>
      <path
        fill="none"
        stroke={strokeColor}
        strokeWidth={3}
        strokeDasharray="6,6"
        className="animate-pulse"
        d={edgePath}
        style={{
          filter: `drop-shadow(0 0 6px ${strokeColor})`,
        }}
      />
      <circle
        cx={toX}
        cy={toY}
        fill="#ffffff"
        r={5}
        stroke={strokeColor}
        strokeWidth={2}
      />
    </g>
  );
};
