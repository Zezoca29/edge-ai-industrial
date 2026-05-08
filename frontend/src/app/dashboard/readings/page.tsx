'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { SensorReading } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ReadingsPage() {
  const [readings, setReadings] = useState<SensorReading[]>([]);

  usePolling(() => {
    apiClient.getLatestReadings()
      .then(setReadings)
      .catch(console.error);
  }, 10000);

  const chartData = readings
    .filter((r) => r.sensorType === 'temperature')
    .slice(0, 50)
    .map((r) => ({
      time: formatTime(r.time),
      temperature: r.value,
    }));

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Leituras de Sensores</h1>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-sm text-gray-400 mb-4">Temperatura (°C) — últimas leituras</h2>
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
              stroke="#60a5fa"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
