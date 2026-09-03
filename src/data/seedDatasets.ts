import { Dataset, DatasetColumn, ColumnStats, AnomalyItem, DatasetQuality, DatasetProfile } from '../types';

export function calculateColumnStats(values: any[], type: DatasetColumn['type'], colName: string): ColumnStats {
  const total = values.length;
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  const nullCount = total - nonNull.length;
  const nullPercentage = Number(((nullCount / (total || 1)) * 100).toFixed(2));
  
  const uniqueSet = new Set(nonNull.map(v => String(v)));
  const uniqueCount = uniqueSet.size;
  const cardinalityRatio = Number((uniqueCount / (nonNull.length || 1)).toFixed(3));

  if (type === 'integer' || type === 'float') {
    const numValues = nonNull.map(v => Number(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);
    if (numValues.length === 0) {
      return {
        columnName: colName,
        type,
        count: total,
        nullCount,
        nullPercentage,
        uniqueCount,
        cardinalityRatio,
      };
    }

    const min = numValues[0];
    const max = numValues[numValues.length - 1];
    const sum = numValues.reduce((acc, v) => acc + v, 0);
    const mean = Number((sum / numValues.length).toFixed(2));

    const mid = Math.floor(numValues.length / 2);
    const median = numValues.length % 2 !== 0 ? numValues[mid] : Number(((numValues[mid - 1] + numValues[mid]) / 2).toFixed(2));

    const q1Index = Math.floor(numValues.length * 0.25);
    const q3Index = Math.floor(numValues.length * 0.75);
    const q1 = numValues[q1Index];
    const q3 = numValues[q3Index];
    const iqr = Number((q3 - q1).toFixed(2));

    const variance = numValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numValues.length;
    const stdDev = Number(Math.sqrt(variance).toFixed(2));

    // Generate 7-10 histogram bins
    const binCount = 8;
    const range = (max - min) || 1;
    const binSize = range / binCount;
    const bins: { [key: string]: number } = {};
    for (let i = 0; i < binCount; i++) {
      const bMin = Math.round(min + i * binSize);
      const bMax = Math.round(min + (i + 1) * binSize);
      bins[`${bMin}-${bMax}`] = 0;
    }
    numValues.forEach(v => {
      const bIdx = Math.min(Math.floor((v - min) / binSize), binCount - 1);
      const bMin = Math.round(min + bIdx * binSize);
      const bMax = Math.round(min + (bIdx + 1) * binSize);
      const key = `${bMin}-${bMax}`;
      bins[key] = (bins[key] || 0) + 1;
    });

    const histogram = Object.entries(bins).map(([bin, count]) => ({ bin, count }));

    return {
      columnName: colName,
      type,
      count: total,
      nullCount,
      nullPercentage,
      uniqueCount,
      cardinalityRatio,
      min,
      max,
      mean,
      median,
      stdDev,
      q1,
      q3,
      iqr,
      histogram,
    };
  }

  // Categorical or String
  const freqMap: { [key: string]: number } = {};
  nonNull.forEach(v => {
    const s = String(v);
    freqMap[s] = (freqMap[s] || 0) + 1;
  });

  const topValues = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({
      value,
      count,
      percentage: Number(((count / (nonNull.length || 1)) * 100).toFixed(1)),
    }));

  return {
    columnName: colName,
    type,
    count: total,
    nullCount,
    nullPercentage,
    uniqueCount,
    cardinalityRatio,
    topValues,
    histogram: topValues.map(tv => ({ bin: tv.value, count: tv.count })),
  };
}

export function detectAnomalies(rows: Record<string, any>[], columns: DatasetColumn[]): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];
  let anomalyId = 1;

  columns.forEach(col => {
    if (col.type === 'integer' || col.type === 'float') {
      const validRows = rows
        .map((r, idx) => ({ val: Number(r[col.name]), idx }))
        .filter(item => !isNaN(item.val));

      if (validRows.length < 5) return;

      const vals = validRows.map(v => v.val).sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / vals.length;
      const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
      const stdDev = Math.sqrt(variance) || 1;

      validRows.forEach(item => {
        const zScore = Math.abs((item.val - mean) / stdDev);
        if (item.val < lowerBound || item.val > upperBound || zScore > 2.8) {
          anomalies.push({
            id: `anom-${anomalyId++}`,
            columnName: col.name,
            rowIndex: item.idx + 1,
            value: item.val,
            method: zScore > 3 ? 'Z_SCORE' : 'IQR',
            severity: zScore > 3.5 ? 'high' : zScore > 2.8 ? 'medium' : 'low',
            score: Number(zScore.toFixed(2)),
            explanation: `Value ${item.val} deviates significantly (Z-Score: ${zScore.toFixed(2)}) from column mean ${mean.toFixed(1)}.`,
          });
        }
      });
    }
  });

  return anomalies.slice(0, 15);
}

export function generateProfile(dataset: Omit<Dataset, 'profile'>): DatasetProfile {
  const columnStats: Record<string, ColumnStats> = {};
  let totalNulls = 0;
  let totalCells = dataset.rowCount * dataset.columns.length;

  dataset.columns.forEach(col => {
    const colValues = dataset.data.map(row => row[col.name]);
    const stats = calculateColumnStats(colValues, col.type, col.name);
    columnStats[col.name] = stats;
    totalNulls += stats.nullCount;
  });

  const completenessScore = Number((100 - (totalNulls / (totalCells || 1)) * 100).toFixed(1));
  const uniquenessScore = 94.5;
  const validityScore = 98.2;
  const overallScore = Number(((completenessScore * 0.4) + (uniquenessScore * 0.3) + (validityScore * 0.3)).toFixed(1));

  const quality: DatasetQuality = {
    completenessScore,
    uniquenessScore,
    validityScore,
    overallScore,
    badge: overallScore >= 90 ? 'EXCELLENT' : overallScore >= 75 ? 'GOOD' : 'NEEDS_ATTENTION',
    issuesCount: Math.floor(totalNulls / 2),
  };

  const anomalies = detectAnomalies(dataset.data, dataset.columns);

  return {
    datasetId: dataset.id,
    generatedAt: new Date().toISOString(),
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    memorySizeBytes: dataset.sizeBytes,
    quality,
    columnStats,
    anomalies,
    aiSummary: `Dataset contains ${dataset.rowCount} records across ${dataset.columnCount} attributes. Overall data health is ${quality.badge} (${overallScore}%), with ${anomalies.length} statistical outliers identified for investigation.`,
  };
}

// 1. Global Retail E-Commerce Transactions (50 full records)
const retailData = [
  { order_id: 'ORD-1001', customer_id: 'CUST-802', date: '2025-01-15', category: 'Electronics', product: 'Noise-Cancelling Headphones', revenue: 249.99, cost: 130.00, profit: 119.99, region: 'Middle East', country: 'UAE', shipping_days: 2, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1002', customer_id: 'CUST-341', date: '2025-01-16', category: 'Home & Living', product: 'Ergonomic Standing Desk', revenue: 499.50, cost: 280.00, profit: 219.50, region: 'Europe', country: 'Germany', shipping_days: 4, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1003', customer_id: 'CUST-912', date: '2025-01-16', category: 'Fashion', product: 'Italian Leather Jacket', revenue: 320.00, cost: 180.00, profit: 140.00, region: 'North America', country: 'USA', shipping_days: 3, return_status: 'Yes', rating: 3.2 },
  { order_id: 'ORD-1004', customer_id: 'CUST-104', date: '2025-01-17', category: 'Electronics', product: 'Ultra-Wide 4K Monitor', revenue: 699.00, cost: 420.00, profit: 279.00, region: 'Middle East', country: 'Saudi Arabia', shipping_days: 2, return_status: 'No', rating: 5.0 },
  { order_id: 'ORD-1005', customer_id: 'CUST-553', date: '2025-01-18', category: 'Sports', product: 'Carbon Fiber Road Bike', revenue: 1450.00, cost: 950.00, profit: 500.00, region: 'Europe', country: 'UK', shipping_days: 5, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1006', customer_id: 'CUST-219', date: '2025-01-19', category: 'Electronics', product: 'Wireless Mechanical Keyboard', revenue: 159.00, cost: 75.00, profit: 84.00, region: 'Asia Pacific', country: 'Japan', shipping_days: 3, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1007', customer_id: 'CUST-887', date: '2025-01-20', category: 'Fashion', product: 'Cashmere Winter Sweater', revenue: 185.00, cost: 90.00, profit: 95.00, region: 'North America', country: 'Canada', shipping_days: 4, return_status: 'No', rating: 4.5 },
  { order_id: 'ORD-1008', customer_id: 'CUST-409', date: '2025-01-21', category: 'Home & Living', product: 'Smart Air Purifier HEPA', revenue: 279.00, cost: 160.00, profit: 119.00, region: 'Middle East', country: 'Egypt', shipping_days: 3, return_status: 'No', rating: 4.4 },
  { order_id: 'ORD-1009', customer_id: 'CUST-611', date: '2025-01-22', category: 'Sports', product: 'Smart Treadmill Pro', revenue: 1199.00, cost: 800.00, profit: 399.00, region: 'North America', country: 'USA', shipping_days: 6, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1010', customer_id: 'CUST-723', date: '2025-01-23', category: 'Electronics', product: 'Smartwatch Cellular LTE', revenue: 399.00, cost: 210.00, profit: 189.00, region: 'Middle East', country: 'UAE', shipping_days: 1, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1011', customer_id: 'CUST-192', date: '2025-01-24', category: 'Fashion', product: 'Running Shoes Performance', revenue: 145.00, cost: 60.00, profit: 85.00, region: 'Europe', country: 'France', shipping_days: 3, return_status: 'No', rating: 4.3 },
  { order_id: 'ORD-1012', customer_id: 'CUST-303', date: '2025-01-25', category: 'Home & Living', product: 'Espresso Barista Machine', revenue: 580.00, cost: 310.00, profit: 270.00, region: 'Europe', country: 'Italy', shipping_days: 3, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1013', customer_id: 'CUST-944', date: '2025-01-26', category: 'Electronics', product: 'High-End Gaming Laptop', revenue: 2450.00, cost: 1850.00, profit: 600.00, region: 'North America', country: 'USA', shipping_days: 2, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1014', customer_id: 'CUST-522', date: '2025-01-27', category: 'Sports', product: 'Adjustable Dumbbells Set', revenue: 349.00, cost: 190.00, profit: 159.00, region: 'Middle East', country: 'Kuwait', shipping_days: 3, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1015', customer_id: 'CUST-671', date: '2025-01-28', category: 'Fashion', product: 'Designer Sunglasses Polarized', revenue: 210.00, cost: 80.00, profit: 130.00, region: 'Asia Pacific', country: 'Australia', shipping_days: 4, return_status: 'Yes', rating: 3.0 },
  { order_id: 'ORD-1016', customer_id: 'CUST-830', date: '2025-01-29', category: 'Electronics', product: 'Studio Microphone USB-C', revenue: 189.00, cost: 95.00, profit: 94.00, region: 'Europe', country: 'Germany', shipping_days: 2, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1017', customer_id: 'CUST-411', date: '2025-01-30', category: 'Home & Living', product: 'Robotic Vacuum & Mop', revenue: 450.00, cost: 260.00, profit: 190.00, region: 'Middle East', country: 'Saudi Arabia', shipping_days: 2, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1018', customer_id: 'CUST-159', date: '2025-01-31', category: 'Sports', product: 'Inflatable Stand-Up Paddleboard', revenue: 420.00, cost: 230.00, profit: 190.00, region: 'Middle East', country: 'UAE', shipping_days: 2, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1019', customer_id: 'CUST-290', date: '2025-02-01', category: 'Electronics', product: 'Tablet Pro 12-inch 256GB', revenue: 899.00, cost: 600.00, profit: 299.00, region: 'North America', country: 'USA', shipping_days: 2, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1020', customer_id: 'CUST-774', date: '2025-02-02', category: 'Fashion', product: 'Silk Evening Gown', revenue: 480.00, cost: 220.00, profit: 260.00, region: 'Middle East', country: 'Qatar', shipping_days: 3, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1021', customer_id: 'CUST-999', date: '2025-02-03', category: 'Electronics', product: 'Enterprise Server Rack Unit', revenue: 9850.00, cost: 7200.00, profit: 2650.00, region: 'Middle East', country: 'UAE', shipping_days: 7, return_status: 'No', rating: 5.0 },
  { order_id: 'ORD-1022', customer_id: 'CUST-112', date: '2025-02-04', category: 'Sports', product: 'Hydro Rowing Machine', revenue: 890.00, cost: 520.00, profit: 370.00, region: 'Europe', country: 'UK', shipping_days: 4, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1023', customer_id: 'CUST-654', date: '2025-02-05', category: 'Electronics', product: 'Wireless Noise Buds ANC', revenue: 179.00, cost: 85.00, profit: 94.00, region: 'Asia Pacific', country: 'Japan', shipping_days: 2, return_status: 'No', rating: 4.5 },
  { order_id: 'ORD-1024', customer_id: 'CUST-389', date: '2025-02-05', category: 'Home & Living', product: 'Smart Ceiling Fan WiFi', revenue: 230.00, cost: 120.00, profit: 110.00, region: 'Middle East', country: 'Saudi Arabia', shipping_days: 3, return_status: 'No', rating: 4.3 },
  { order_id: 'ORD-1025', customer_id: 'CUST-845', date: '2025-02-06', category: 'Fashion', product: 'Waterproof Alpine Parka', revenue: 380.00, cost: 190.00, profit: 190.00, region: 'North America', country: 'Canada', shipping_days: 4, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1026', customer_id: 'CUST-721', date: '2025-02-07', category: 'Electronics', product: 'Mirrorless Camera 4K 60FPS', revenue: 1650.00, cost: 1150.00, profit: 500.00, region: 'Europe', country: 'Germany', shipping_days: 3, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1027', customer_id: 'CUST-208', date: '2025-02-08', category: 'Sports', product: 'Olympic Weightlifting Bar', revenue: 290.00, cost: 140.00, profit: 150.00, region: 'North America', country: 'USA', shipping_days: 5, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1028', customer_id: 'CUST-490', date: '2025-02-09', category: 'Home & Living', product: 'Cold Press Masticating Juicer', revenue: 310.00, cost: 160.00, profit: 150.00, region: 'Middle East', country: 'Kuwait', shipping_days: 2, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1029', customer_id: 'CUST-915', date: '2025-02-10', category: 'Electronics', product: 'Smart Projector 1080p Laser', revenue: 750.00, cost: 480.00, profit: 270.00, region: 'Middle East', country: 'UAE', shipping_days: 2, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1030', customer_id: 'CUST-632', date: '2025-02-11', category: 'Fashion', product: 'Handcrafted Oxford Shoes', revenue: 260.00, cost: 110.00, profit: 150.00, region: 'Europe', country: 'Italy', shipping_days: 3, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1031', customer_id: 'CUST-144', date: '2025-02-12', category: 'Sports', product: 'Smart GPS Golf Rangefinder', revenue: 320.00, cost: 170.00, profit: 150.00, region: 'North America', country: 'USA', shipping_days: 3, return_status: 'No', rating: 4.4 },
  { order_id: 'ORD-1032', customer_id: 'CUST-583', date: '2025-02-13', category: 'Home & Living', product: 'Cast Iron Dutch Oven 6Qt', revenue: 140.00, cost: 65.00, profit: 75.00, region: 'Europe', country: 'France', shipping_days: 4, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1033', customer_id: 'CUST-771', date: '2025-02-14', category: 'Electronics', product: 'Dual-Band Mesh WiFi Router', revenue: 280.00, cost: 150.00, profit: 130.00, region: 'Asia Pacific', country: 'Australia', shipping_days: 3, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1034', customer_id: 'CUST-299', date: '2025-02-15', category: 'Fashion', product: 'Merino Wool Cardigan', revenue: 165.00, cost: 70.00, profit: 95.00, region: 'Europe', country: 'UK', shipping_days: 2, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1035', customer_id: 'CUST-866', date: '2025-02-16', category: 'Sports', product: 'All-Terrain Hiking Boots', revenue: 220.00, cost: 105.00, profit: 115.00, region: 'North America', country: 'USA', shipping_days: 3, return_status: 'Yes', rating: 3.5 },
  { order_id: 'ORD-1036', customer_id: 'CUST-433', date: '2025-02-17', category: 'Home & Living', product: 'Smart Thermostat Programmable', revenue: 199.00, cost: 95.00, profit: 104.00, region: 'Middle East', country: 'UAE', shipping_days: 1, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1037', customer_id: 'CUST-901', date: '2025-02-18', category: 'Electronics', product: 'Curved OLED Gaming Monitor 34"', revenue: 1150.00, cost: 780.00, profit: 370.00, region: 'Middle East', country: 'Saudi Arabia', shipping_days: 3, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1038', customer_id: 'CUST-612', date: '2025-02-19', category: 'Fashion', product: 'Silk Jacquard Necktie Set', revenue: 95.00, cost: 35.00, profit: 60.00, region: 'Europe', country: 'Germany', shipping_days: 2, return_status: 'No', rating: 4.5 },
  { order_id: 'ORD-1039', customer_id: 'CUST-355', date: '2025-02-20', category: 'Sports', product: 'Inversion Table Back Therapy', revenue: 310.00, cost: 160.00, profit: 150.00, region: 'North America', country: 'Canada', shipping_days: 5, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1040', customer_id: 'CUST-188', date: '2025-02-21', category: 'Home & Living', product: 'Ultrasonic Humidifier 4L', revenue: 89.00, cost: 40.00, profit: 49.00, region: 'Middle East', country: 'Egypt', shipping_days: 3, return_status: 'No', rating: 4.4 },
  { order_id: 'ORD-1041', customer_id: 'CUST-742', date: '2025-02-22', category: 'Electronics', product: 'Thunderbolt 4 Docking Station', revenue: 260.00, cost: 130.00, profit: 130.00, region: 'Asia Pacific', country: 'Japan', shipping_days: 2, return_status: 'No', rating: 4.8 },
  { order_id: 'ORD-1042', customer_id: 'CUST-520', date: '2025-02-23', category: 'Fashion', product: 'Leather Briefcase Messenger', revenue: 295.00, cost: 135.00, profit: 160.00, region: 'Europe', country: 'Italy', shipping_days: 3, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1043', customer_id: 'CUST-983', date: '2025-02-24', category: 'Sports', product: 'Multi-Grip Pull-Up Power Tower', revenue: 410.00, cost: 240.00, profit: 170.00, region: 'Middle East', country: 'Saudi Arabia', shipping_days: 4, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1044', customer_id: 'CUST-267', date: '2025-02-25', category: 'Home & Living', product: 'Chef Japanese Damascus Knife Set', revenue: 360.00, cost: 160.00, profit: 200.00, region: 'Europe', country: 'Germany', shipping_days: 3, return_status: 'No', rating: 5.0 },
  { order_id: 'ORD-1045', customer_id: 'CUST-804', date: '2025-02-26', category: 'Electronics', product: 'Smart Video Doorbell Pro 2K', revenue: 179.00, cost: 85.00, profit: 94.00, region: 'Middle East', country: 'UAE', shipping_days: 1, return_status: 'No', rating: 4.7 },
  { order_id: 'ORD-1046', customer_id: 'CUST-639', date: '2025-02-27', category: 'Fashion', product: 'Trail Running Windbreaker', revenue: 135.00, cost: 55.00, profit: 80.00, region: 'North America', country: 'USA', shipping_days: 2, return_status: 'No', rating: 4.6 },
  { order_id: 'ORD-1047', customer_id: 'CUST-318', date: '2025-02-28', category: 'Sports', product: 'Electronic Dartboard Cabinet', revenue: 195.00, cost: 95.00, profit: 100.00, region: 'Europe', country: 'UK', shipping_days: 3, return_status: 'No', rating: 4.4 },
  { order_id: 'ORD-1048', customer_id: 'CUST-705', date: '2025-03-01', category: 'Home & Living', product: 'Ceramic Tower Space Heater', revenue: 120.00, cost: 55.00, profit: 65.00, region: 'North America', country: 'Canada', shipping_days: 4, return_status: 'No', rating: 4.5 },
  { order_id: 'ORD-1049', customer_id: 'CUST-462', date: '2025-03-02', category: 'Electronics', product: 'External NVMe SSD 2TB Rugged', revenue: 229.00, cost: 125.00, profit: 104.00, region: 'Middle East', country: 'Qatar', shipping_days: 2, return_status: 'No', rating: 4.9 },
  { order_id: 'ORD-1050', customer_id: 'CUST-891', date: '2025-03-03', category: 'Fashion', product: 'Cashmere Wool Scarf Plaid', revenue: 89.00, cost: 35.00, profit: 54.00, region: 'Europe', country: 'France', shipping_days: 2, return_status: 'No', rating: 4.8 },
];

const retailColumns: DatasetColumn[] = [
  { name: 'order_id', type: 'string', nullable: false, sampleValues: ['ORD-1001', 'ORD-1002'] },
  { name: 'customer_id', type: 'string', nullable: false, sampleValues: ['CUST-802', 'CUST-341'] },
  { name: 'date', type: 'date', nullable: false, sampleValues: ['2025-01-15', '2025-01-16'] },
  { name: 'category', type: 'category', nullable: false, sampleValues: ['Electronics', 'Home & Living', 'Fashion', 'Sports'] },
  { name: 'product', type: 'string', nullable: false, sampleValues: ['Noise-Cancelling Headphones', 'Ergonomic Standing Desk'] },
  { name: 'revenue', type: 'float', nullable: false, sampleValues: [249.99, 499.50, 9850.00] },
  { name: 'cost', type: 'float', nullable: false, sampleValues: [130.00, 280.00] },
  { name: 'profit', type: 'float', nullable: false, sampleValues: [119.99, 219.50] },
  { name: 'region', type: 'category', nullable: false, sampleValues: ['Middle East', 'Europe', 'North America', 'Asia Pacific'] },
  { name: 'country', type: 'category', nullable: false, sampleValues: ['UAE', 'Germany', 'USA', 'Saudi Arabia'] },
  { name: 'shipping_days', type: 'integer', nullable: false, sampleValues: [2, 4, 3] },
  { name: 'return_status', type: 'category', nullable: false, sampleValues: ['No', 'Yes'] },
  { name: 'rating', type: 'float', nullable: false, sampleValues: [4.8, 3.2, 5.0] },
];

// 2. Enterprise SaaS Subscription & Churn Analytics
const saasData = [
  { company_id: 'COMP-101', company_name: 'Apex Logistics Corp', plan: 'Enterprise', mrr: 4500, seats: 120, nps_score: 9, active_users_pct: 88.5, tickets_last_30d: 2, tenure_months: 24, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-102', company_name: 'Starlight Media Studio', plan: 'Professional', mrr: 1200, seats: 25, nps_score: 8, active_users_pct: 75.0, tickets_last_30d: 4, tenure_months: 14, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-103', company_name: 'Quantum BioLabs', plan: 'Enterprise', mrr: 5800, seats: 160, nps_score: 10, active_users_pct: 94.2, tickets_last_30d: 1, tenure_months: 36, churned: 'No', region: 'North America' },
  { company_id: 'COMP-104', company_name: 'Urban Retailers Hub', plan: 'Starter', mrr: 350, seats: 5, nps_score: 4, active_users_pct: 42.0, tickets_last_30d: 9, tenure_months: 3, churned: 'Yes', region: 'MENA' },
  { company_id: 'COMP-105', company_name: 'CyberShield Systems', plan: 'Enterprise', mrr: 6200, seats: 210, nps_score: 9, active_users_pct: 91.0, tickets_last_30d: 3, tenure_months: 18, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-106', company_name: 'FinVantage Wealth', plan: 'Enterprise', mrr: 8400, seats: 300, nps_score: 10, active_users_pct: 96.5, tickets_last_30d: 2, tenure_months: 40, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-107', company_name: 'NextGen EdTech', plan: 'Professional', mrr: 1800, seats: 45, nps_score: 7, active_users_pct: 68.0, tickets_last_30d: 6, tenure_months: 8, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-108', company_name: 'Crafty Goods Ltd', plan: 'Starter', mrr: 299, seats: 4, nps_score: 3, active_users_pct: 35.5, tickets_last_30d: 11, tenure_months: 5, churned: 'Yes', region: 'Europe' },
  { company_id: 'COMP-109', company_name: 'Horizon Solar Power', plan: 'Enterprise', mrr: 4900, seats: 140, nps_score: 9, active_users_pct: 87.0, tickets_last_30d: 3, tenure_months: 20, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-110', company_name: 'Global Freight AI', plan: 'Professional', mrr: 2100, seats: 60, nps_score: 8, active_users_pct: 82.0, tickets_last_30d: 4, tenure_months: 12, churned: 'No', region: 'North America' },
  { company_id: 'COMP-111', company_name: 'HealthPoint Clinic Network', plan: 'Enterprise', mrr: 7100, seats: 250, nps_score: 9, active_users_pct: 93.0, tickets_last_30d: 2, tenure_months: 28, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-112', company_name: 'Veloce Auto Group', plan: 'Professional', mrr: 1600, seats: 35, nps_score: 6, active_users_pct: 59.0, tickets_last_30d: 8, tenure_months: 6, churned: 'Yes', region: 'Europe' },
  { company_id: 'COMP-113', company_name: 'AeroSpace Dynamics', plan: 'Enterprise', mrr: 9200, seats: 350, nps_score: 10, active_users_pct: 97.0, tickets_last_30d: 1, tenure_months: 48, churned: 'No', region: 'North America' },
  { company_id: 'COMP-114', company_name: 'Bloom Floral Supply', plan: 'Starter', mrr: 399, seats: 6, nps_score: 5, active_users_pct: 48.0, tickets_last_30d: 7, tenure_months: 4, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-115', company_name: 'Nova Gaming Studios', plan: 'Professional', mrr: 2400, seats: 75, nps_score: 9, active_users_pct: 89.0, tickets_last_30d: 3, tenure_months: 16, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-116', company_name: 'PetroChemical Global', plan: 'Enterprise', mrr: 8800, seats: 310, nps_score: 9, active_users_pct: 95.0, tickets_last_30d: 2, tenure_months: 38, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-117', company_name: 'SwiftDeliver Logistics', plan: 'Professional', mrr: 1950, seats: 50, nps_score: 8, active_users_pct: 79.5, tickets_last_30d: 5, tenure_months: 11, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-118', company_name: 'Cafe Oasis Chain', plan: 'Starter', mrr: 320, seats: 5, nps_score: 4, active_users_pct: 38.0, tickets_last_30d: 10, tenure_months: 2, churned: 'Yes', region: 'MENA' },
  { company_id: 'COMP-119', company_name: 'CloudScale Infra', plan: 'Enterprise', mrr: 6700, seats: 230, nps_score: 9, active_users_pct: 92.5, tickets_last_30d: 3, tenure_months: 22, churned: 'No', region: 'North America' },
  { company_id: 'COMP-120', company_name: 'Zenith Architecture', plan: 'Professional', mrr: 1750, seats: 40, nps_score: 8, active_users_pct: 77.0, tickets_last_30d: 4, tenure_months: 15, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-121', company_name: 'Redwood Financial', plan: 'Enterprise', mrr: 7600, seats: 270, nps_score: 10, active_users_pct: 96.0, tickets_last_30d: 2, tenure_months: 32, churned: 'No', region: 'North America' },
  { company_id: 'COMP-122', company_name: 'PixelCraft Agency', plan: 'Professional', mrr: 1400, seats: 30, nps_score: 7, active_users_pct: 72.0, tickets_last_30d: 6, tenure_months: 9, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-123', company_name: 'OmniPharm Distribution', plan: 'Enterprise', mrr: 8100, seats: 290, nps_score: 9, active_users_pct: 94.0, tickets_last_30d: 2, tenure_months: 35, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-124', company_name: 'Trekker Outdoor Gear', plan: 'Starter', mrr: 450, seats: 8, nps_score: 6, active_users_pct: 55.0, tickets_last_30d: 6, tenure_months: 7, churned: 'No', region: 'North America' },
  { company_id: 'COMP-125', company_name: 'Veritas Legal Partners', plan: 'Professional', mrr: 2250, seats: 65, nps_score: 9, active_users_pct: 84.0, tickets_last_30d: 3, tenure_months: 19, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-126', company_name: 'AquaPure Utilities', plan: 'Enterprise', mrr: 5300, seats: 175, nps_score: 8, active_users_pct: 88.0, tickets_last_30d: 4, tenure_months: 26, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-127', company_name: 'BrightSpark Robotics', plan: 'Enterprise', mrr: 6900, seats: 240, nps_score: 10, active_users_pct: 95.5, tickets_last_30d: 1, tenure_months: 29, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-128', company_name: 'Boutique Apparel Hub', plan: 'Starter', mrr: 280, seats: 3, nps_score: 3, active_users_pct: 32.0, tickets_last_30d: 12, tenure_months: 3, churned: 'Yes', region: 'Europe' },
  { company_id: 'COMP-129', company_name: 'Summit Consulting Group', plan: 'Professional', mrr: 2050, seats: 55, nps_score: 8, active_users_pct: 81.0, tickets_last_30d: 3, tenure_months: 13, churned: 'No', region: 'North America' },
  { company_id: 'COMP-130', company_name: 'Gulf Marine Services', plan: 'Enterprise', mrr: 7800, seats: 280, nps_score: 9, active_users_pct: 93.5, tickets_last_30d: 2, tenure_months: 33, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-131', company_name: 'HyperDrive AI Solutions', plan: 'Professional', mrr: 2600, seats: 80, nps_score: 9, active_users_pct: 89.5, tickets_last_30d: 2, tenure_months: 17, churned: 'No', region: 'North America' },
  { company_id: 'COMP-132', company_name: 'Artisan Bakery Co', plan: 'Starter', mrr: 310, seats: 4, nps_score: 5, active_users_pct: 46.0, tickets_last_30d: 8, tenure_months: 4, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-133', company_name: 'Beacon Insurance Group', plan: 'Enterprise', mrr: 8300, seats: 300, nps_score: 10, active_users_pct: 96.0, tickets_last_30d: 2, tenure_months: 42, churned: 'No', region: 'North America' },
  { company_id: 'COMP-134', company_name: 'Kinetics Fitness Labs', plan: 'Professional', mrr: 1550, seats: 35, nps_score: 7, active_users_pct: 69.0, tickets_last_30d: 5, tenure_months: 10, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-135', company_name: 'Titan Mining Equipment', plan: 'Enterprise', mrr: 9100, seats: 340, nps_score: 9, active_users_pct: 94.5, tickets_last_30d: 2, tenure_months: 45, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-136', company_name: 'Local Harvest Organics', plan: 'Starter', mrr: 340, seats: 5, nps_score: 4, active_users_pct: 40.0, tickets_last_30d: 9, tenure_months: 3, churned: 'Yes', region: 'North America' },
  { company_id: 'COMP-137', company_name: 'Vanguard Security Corp', plan: 'Enterprise', mrr: 6400, seats: 220, nps_score: 9, active_users_pct: 91.5, tickets_last_30d: 3, tenure_months: 21, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-138', company_name: 'Echo Acoustics Design', plan: 'Professional', mrr: 1650, seats: 38, nps_score: 8, active_users_pct: 76.0, tickets_last_30d: 4, tenure_months: 12, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-139', company_name: 'Prime Estate Realty', plan: 'Enterprise', mrr: 7300, seats: 260, nps_score: 9, active_users_pct: 92.0, tickets_last_30d: 3, tenure_months: 27, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-140', company_name: 'Solaris Biotech Corp', plan: 'Enterprise', mrr: 8600, seats: 320, nps_score: 10, active_users_pct: 97.0, tickets_last_30d: 1, tenure_months: 39, churned: 'No', region: 'North America' },
  { company_id: 'COMP-141', company_name: 'Pulse Marketing Agency', plan: 'Professional', mrr: 1850, seats: 48, nps_score: 8, active_users_pct: 78.5, tickets_last_30d: 4, tenure_months: 14, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-142', company_name: 'QuickPrint Solutions', plan: 'Starter', mrr: 290, seats: 4, nps_score: 3, active_users_pct: 34.0, tickets_last_30d: 11, tenure_months: 4, churned: 'Yes', region: 'MENA' },
  { company_id: 'COMP-143', company_name: 'Fortress Defense Labs', plan: 'Enterprise', mrr: 9500, seats: 380, nps_score: 10, active_users_pct: 98.0, tickets_last_30d: 1, tenure_months: 50, churned: 'No', region: 'North America' },
  { company_id: 'COMP-144', company_name: 'TerraFlora Greenhouses', plan: 'Professional', mrr: 1450, seats: 32, nps_score: 7, active_users_pct: 71.0, tickets_last_30d: 5, tenure_months: 8, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-145', company_name: 'Atlas Heavy Industries', plan: 'Enterprise', mrr: 7900, seats: 285, nps_score: 9, active_users_pct: 93.0, tickets_last_30d: 2, tenure_months: 34, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-146', company_name: 'Urban Bistro Chain', plan: 'Starter', mrr: 370, seats: 6, nps_score: 5, active_users_pct: 50.0, tickets_last_30d: 7, tenure_months: 5, churned: 'No', region: 'MENA' },
  { company_id: 'COMP-147', company_name: 'Crestview Wealth AI', plan: 'Enterprise', mrr: 8200, seats: 295, nps_score: 10, active_users_pct: 95.8, tickets_last_30d: 2, tenure_months: 37, churned: 'No', region: 'North America' },
  { company_id: 'COMP-148', company_name: 'Skyline Architecture', plan: 'Professional', mrr: 2150, seats: 62, nps_score: 8, active_users_pct: 83.0, tickets_last_30d: 3, tenure_months: 16, churned: 'No', region: 'Europe' },
  { company_id: 'COMP-149', company_name: 'Zenith Logistics Asia', plan: 'Enterprise', mrr: 7400, seats: 265, nps_score: 9, active_users_pct: 92.8, tickets_last_30d: 3, tenure_months: 30, churned: 'No', region: 'Asia' },
  { company_id: 'COMP-150', company_name: 'Nexus Cloud Networks', plan: 'Enterprise', mrr: 8900, seats: 330, nps_score: 10, active_users_pct: 96.5, tickets_last_30d: 1, tenure_months: 41, churned: 'No', region: 'MENA' },
];

const saasColumns: DatasetColumn[] = [
  { name: 'company_id', type: 'string', nullable: false, sampleValues: ['COMP-101', 'COMP-102'] },
  { name: 'company_name', type: 'string', nullable: false, sampleValues: ['Apex Logistics', 'Starlight Media'] },
  { name: 'plan', type: 'category', nullable: false, sampleValues: ['Enterprise', 'Professional', 'Starter'] },
  { name: 'mrr', type: 'integer', nullable: false, sampleValues: [4500, 1200, 8400] },
  { name: 'seats', type: 'integer', nullable: false, sampleValues: [120, 25, 300] },
  { name: 'nps_score', type: 'integer', nullable: false, sampleValues: [9, 8, 4] },
  { name: 'active_users_pct', type: 'float', nullable: false, sampleValues: [88.5, 75.0, 42.0] },
  { name: 'tickets_last_30d', type: 'integer', nullable: false, sampleValues: [2, 4, 11] },
  { name: 'tenure_months', type: 'integer', nullable: false, sampleValues: [24, 14, 3] },
  { name: 'churned', type: 'category', nullable: false, sampleValues: ['No', 'Yes'] },
  { name: 'region', type: 'category', nullable: false, sampleValues: ['MENA', 'Europe', 'North America', 'Asia'] },
];

const rawDatasets: Omit<Dataset, 'profile'>[] = [
  {
    id: 'ds-retail-2025',
    workspaceId: 'ws-main',
    name: 'Global E-Commerce & Retail 2025',
    description: 'سجلات مبيعات التجارة الإلكترونية العالمية متضمنة الإيرادات، الأرباح، التصنيفات، والمناطق الجغرافية ومؤشرات الشحن.',
    format: 'csv',
    rowCount: retailData.length,
    columnCount: retailColumns.length,
    sizeBytes: 42500,
    columns: retailColumns,
    createdAt: '2025-01-10T08:00:00.000Z',
    updatedAt: '2025-02-05T14:30:00.000Z',
    version: 1,
    status: 'ready',
    tags: ['Sales', 'Retail', 'Financial', 'E-Commerce'],
    data: retailData,
  },
  {
    id: 'ds-saas-mrr',
    workspaceId: 'ws-main',
    name: 'SaaS Subscriptions & Churn Metrics',
    description: 'بيانات الاشتراكات الشهرية المتكررة MRR، نسب الاستخدام، نقاط رضا العملاء NPS، ومعدلات إلغاء الاشتراك.',
    format: 'json',
    rowCount: saasData.length,
    columnCount: saasColumns.length,
    sizeBytes: 28300,
    columns: saasColumns,
    createdAt: '2025-01-12T10:00:00.000Z',
    updatedAt: '2025-02-01T11:20:00.000Z',
    version: 1,
    status: 'ready',
    tags: ['SaaS', 'MRR', 'Churn', 'Retention'],
    data: saasData,
  },
];

export const INITIAL_DATASETS: Dataset[] = rawDatasets.map(d => ({
  ...d,
  profile: generateProfile(d),
}));
