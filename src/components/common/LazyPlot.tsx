import React, { Suspense, lazy } from 'react';

// react-plotly.js pulls in the full Plotly bundle (~4MB minified). Loading it
// lazily keeps it out of the page chunks; it streams in only when a chart is
// actually about to render.
const Plot = lazy(() => import('react-plotly.js'));

type PlotlyModule = typeof import('react-plotly.js');
export type LazyPlotProps = React.ComponentProps<PlotlyModule['default']>;

const PlotFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[240px]" dir="rtl">
    <div className="text-center space-y-2">
      <div className="w-6 h-6 mx-auto border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">جاري تحميل محرك الرسوم البيانية...</p>
    </div>
  </div>
);

const LazyPlot: React.FC<LazyPlotProps> = (props) => (
  <Suspense fallback={<PlotFallback />}>
    <Plot {...props} />
  </Suspense>
);

export default LazyPlot;
