import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  x: number;
  y: number;
  cluster?: number;
}

interface D3ScatterPlotProps {
  data: DataPoint[];
}

export const D3ScatterPlot: React.FC<D3ScatterPlotProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const x = d3.scaleLinear()
      .domain([d3.min(data, (d: DataPoint) => d.x) || 0, d3.max(data, (d: DataPoint) => d.x) || 1])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([d3.min(data, (d: DataPoint) => d.y) || 0, d3.max(data, (d: DataPoint) => d.y) || 1])
      .range([height - margin.bottom, margin.top]);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: DataPoint) => x(d.x))
      .attr('cy', (d: DataPoint) => y(d.y))
      .attr('r', 5)
      .attr('fill', (d: DataPoint) => d.cluster !== undefined ? color(d.cluster.toString()) : '#0f62fe');

  }, [data]);

  return <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 600 400" />;
};
