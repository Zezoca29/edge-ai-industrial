'use client';

import { useState } from 'react';
import { PickEvent, ProductDemand } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import { DemandChart } from '@/components/DemandChart';
import { PickEventTable } from '@/components/PickEventTable';

export default function PicksPage() {
  const [picks, setPicks] = useState<PickEvent[]>([]);
  const [demand, setDemand] = useState<ProductDemand[]>([]);
  const [loading, setLoading] = useState(true);

  usePolling(() => {
    Promise.all([
      apiClient.getRecentPicks(24),
      apiClient.getProductDemand(168),
    ])
      .then(([picksData, demandData]) => {
        setPicks(picksData);
        setDemand(demandData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, 10000);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Retiradas de Produtos</h1>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando dados...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">
              Demanda por produto — últimos 7 dias
            </h2>
            <DemandChart demand={demand} />
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">
              Eventos de retirada — últimas 24h
            </h2>
            <PickEventTable picks={picks} />
          </div>
        </div>
      )}
    </div>
  );
}
