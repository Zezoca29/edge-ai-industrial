'use client';

import { useState } from 'react';
import { SensorReading } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import SensorChart from '@/components/SensorChart';

export default function ReadingsPage() {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  usePolling(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 3_600_000).toISOString();
    apiClient
      .getReadings('', from, to)
      .then((data) => {
        setReadings(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, 5000);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Leituras de Sensores</h1>
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando leituras...</p>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-sm text-gray-400 mb-4">
            Temperatura · Vibração · Corrente — última hora
          </h2>
          <SensorChart readings={readings} />
        </div>
      )}
    </div>
  );
}
