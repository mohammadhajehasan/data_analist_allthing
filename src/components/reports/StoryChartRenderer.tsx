import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon, PieChart as PieIcon } from 'lucide-react';

interface StoryChartRendererProps {
  initialType?: 'bar' | 'line' | 'area' | 'pie' | 'radar' | 'scatter';
  data?: Array<Record<string, any>>;
  xAxis?: string;
  yAxis?: string;
  explanation?: string;
  language?: 'ar' | 'en';
}

const PALETTE = [
  '#0f62fe', // Carbon Blue 60
  '#009d9a', // Carbon Teal 50
  '#8a3ffc', // Carbon Purple 60
  '#ee5396', // Carbon Magenta 50
  '#24a148', // Carbon Green 50
  '#ff832b', // Carbon Orange 40
  '#1192e8', // Carbon Cyan 50
  '#fa4d56', // Carbon Red 50
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] p-2.5 shadow-xl text-xs font-mono">
        <p className="text-[var(--cds-text-01)] font-bold mb-1">{label || payload[0]?.name}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-[var(--cds-text-02)]">
            <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: entry.color || entry.fill || PALETTE[0] }} />
            <span>{entry.name || 'Value'}:</span>
            <span className="font-bold text-[var(--cds-text-01)]">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const StoryChartRenderer: React.FC<StoryChartRendererProps> = ({
  initialType = 'bar',
  data = [],
  xAxis = 'name',
  yAxis = 'value',
  explanation,
  language = 'ar',
}) => {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area' | 'pie'>(
    initialType === 'pie' ? 'pie' : initialType === 'line' ? 'line' : initialType === 'area' ? 'area' : 'bar'
  );

  // Normalize data for charting
  const formattedData = React.useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [
        { name: 'Segment A', value: 4500 },
        { name: 'Segment B', value: 3200 },
        { name: 'Segment C', value: 2800 },
        { name: 'Segment D', value: 1900 },
      ];
    }
    return data.map((item, idx) => {
      const name = item[xAxis] ?? item.name ?? item.label ?? `Item ${idx + 1}`;
      let val = item[yAxis] ?? item.value ?? item.amount ?? item.revenue ?? item.count;
      if (typeof val !== 'number') {
        val = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
      }
      return {
        ...item,
        name: String(name),
        value: val,
      };
    });
  }, [data, xAxis, yAxis]);

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 flex flex-col justify-between">
      {/* Chart Control Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--cds-border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#33b1ff]">
            {language === 'ar' ? 'رسم بياني توضيحي للقصة' : 'Illustrative Data Chart'}
          </span>
          <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
            ({xAxis} × {yAxis})
          </span>
        </div>

        {/* Live Chart Type Switcher */}
        <div className="flex items-center gap-1 bg-[var(--cds-layer-02)] p-0.5 border border-[var(--cds-border-subtle)]">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`p-1 text-xs transition-colors ${
              chartType === 'bar' ? 'bg-[#0f62fe] text-white' : 'text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)]'
            }`}
            title="Bar Chart"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`p-1 text-xs transition-colors ${
              chartType === 'line' ? 'bg-[#0f62fe] text-white' : 'text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)]'
            }`}
            title="Line Chart"
          >
            <LineIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setChartType('area')}
            className={`p-1 text-xs transition-colors ${
              chartType === 'area' ? 'bg-[#0f62fe] text-white' : 'text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)]'
            }`}
            title="Area Chart"
          >
            <AreaIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setChartType('pie')}
            className={`p-1 text-xs transition-colors ${
              chartType === 'pie' ? 'bg-[#0f62fe] text-white' : 'text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-03)]'
            }`}
            title="Pie Chart"
          >
            <PieIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#8d8d8d" fontSize={11} tickLine={false} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#8d8d8d" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {formattedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#8d8d8d" fontSize={11} tickLine={false} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#8d8d8d" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0f62fe"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0f62fe', stroke: '#161616', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#33b1ff' }}
              />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f62fe" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0f62fe" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#8d8d8d" fontSize={11} tickLine={false} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#8d8d8d" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0f62fe"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#areaGradient)"
              />
            </AreaChart>
          ) : (
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', color: '#c6c6c6' }}
                iconType="circle"
              />
              <Pie
                data={formattedData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={75}
                innerRadius={35}
                paddingAngle={3}
              >
                {formattedData.map((_, index) => (
                  <Cell key={`pie-cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Analytical Explanation */}
      {explanation && (
        <div className="mt-2 pt-2 border-t border-[var(--cds-border-subtle)] text-[11px] text-[var(--cds-text-03)] font-mono leading-tight">
          💡 {explanation}
        </div>
      )}
    </div>
  );
};
