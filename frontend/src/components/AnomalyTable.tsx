'use client';

import { SensorReading } from '@/types';

interface AnomalyTableProps {
  anomalies: SensorReading[];
}

export function AnomalyTable({ anomalies }: AnomalyTableProps) {
  if (anomalies.length === 0) {
    return (
      <p className="text-gray-400 text-sm">Nenhuma anomalia encontrada.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
            <th className="py-2 pr-4">Timestamp</th>
            <th className="py-2 pr-4">Dispositivo</th>
            <th className="py-2 pr-4">Sensor</th>
            <th className="py-2 pr-4">Valor</th>
            <th className="py-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.map((a, i) => {
            const scorePercent = (a.anomalyScore * 100).toFixed(0);
            const isHigh = a.anomalyScore >= 0.8;
            return (
              <tr key={i} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="py-2 pr-4 text-gray-300">
                  {new Date(a.time).toLocaleString('pt-BR')}
                </td>
                <td className="py-2 pr-4 text-gray-300">{a.deviceName}</td>
                <td className="py-2 pr-4 text-gray-300 capitalize">{a.sensorType}</td>
                <td className="py-2 pr-4 text-gray-300">
                  {a.value.toFixed(2)} {a.unit}
                </td>
                <td className="py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      isHigh
                        ? 'bg-red-900 text-red-300'
                        : 'bg-yellow-900 text-yellow-300'
                    }`}
                  >
                    {scorePercent}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
