'use client';

import { PickEvent } from '@/types';

interface PickEventTableProps {
  picks: PickEvent[];
}

export function PickEventTable({ picks }: PickEventTableProps) {
  if (picks.length === 0) {
    return (
      <p className="text-gray-400 text-sm">Nenhuma retirada nas últimas 24 horas.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
            <th className="py-2 pr-4">Horário</th>
            <th className="py-2 pr-4">Dispositivo</th>
            <th className="py-2 pr-4">Produto</th>
            <th className="py-2 pr-4">Qtd</th>
            <th className="py-2 pr-4">Peso retirado</th>
            <th className="py-2">Confiança</th>
          </tr>
        </thead>
        <tbody>
          {picks.map((p, i) => {
            const confPercent = (p.confidence * 100).toFixed(0);
            const isHigh = p.confidence >= 0.85;
            return (
              <tr key={i} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="py-2 pr-4 text-gray-300">
                  {new Date(p.time).toLocaleString('pt-BR')}
                </td>
                <td className="py-2 pr-4 text-gray-300">{p.deviceName}</td>
                <td className="py-2 pr-4 text-gray-300">{p.productName}</td>
                <td className="py-2 pr-4 text-gray-300">{p.quantity}</td>
                <td className="py-2 pr-4 text-gray-300">
                  {(p.weightDeltaKg * 1000).toFixed(0)} g
                </td>
                <td className="py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      isHigh
                        ? 'bg-green-900 text-green-300'
                        : 'bg-yellow-900 text-yellow-300'
                    }`}
                  >
                    {confPercent}%
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
