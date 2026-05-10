'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProductDemand } from '@/types';

interface DemandChartProps {
  demand: ProductDemand[];
}

export function DemandChart({ demand }: DemandChartProps) {
  if (demand.length === 0) {
    return (
      <p className="text-gray-400 text-sm">Nenhuma retirada registrada ainda.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={demand} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="productName" stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
          labelStyle={{ color: '#e5e7eb' }}
          formatter={(value: number) => [value, 'Retiradas']}
        />
        <Bar dataKey="totalPicks" name="Retiradas" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
