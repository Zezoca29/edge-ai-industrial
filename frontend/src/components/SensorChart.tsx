'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { SensorReading } from '@/types';

interface ChartPoint {
  time: string;
  temperature?: number;
  vibration?: number;
  current?: number;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function buildChartData(readings: SensorReading[]): ChartPoint[] {
  const pointMap = new Map<string, ChartPoint>();
  for (const r of readings) {
    const timeKey = formatTime(r.time);
    if (!pointMap.has(timeKey)) {
      pointMap.set(timeKey, { time: timeKey });
    }
    const point = pointMap.get(timeKey)!;
    if (r.sensorType === 'temperature') point.temperature = r.value;
    else if (r.sensorType === 'vibration') point.vibration = r.value;
    else if (r.sensorType === 'current') point.current = r.value;
  }
  return Array.from(pointMap.values()).slice(-50);
}

interface SensorChartProps {
  readings: SensorReading[];
}

export function SensorChart({ readings }: SensorChartProps) {
  const chartData = buildChartData(readings);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="temperature"
          stroke="#3b82f6"
          dot={false}
          strokeWidth={2}
          name="Temperatura"
        />
        <Line
          type="monotone"
          dataKey="vibration"
          stroke="#22c55e"
          dot={false}
          strokeWidth={2}
          name="Vibração"
        />
        <Line
          type="monotone"
          dataKey="current"
          stroke="#f59e0b"
          dot={false}
          strokeWidth={2}
          name="Corrente"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
