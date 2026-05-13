'use client';

import { useState } from 'react';
import { SensorReading } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import { AnomalyTable } from '@/components/AnomalyTable';

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  usePolling(() => {
    apiClient
      .getAnomalies()
      .then((data) => {
        setAnomalies(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, 10000);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Anomalias Detectadas</h1>
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando anomalias...</p>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <AnomalyTable anomalies={anomalies} />
        </div>
      )}
    </div>
  );
}
