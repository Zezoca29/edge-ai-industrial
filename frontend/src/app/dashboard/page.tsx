'use client';

import { useState } from 'react';
import { Device } from '@/types';
import { apiClient } from '@/services/apiClient';
import { DeviceCard } from '@/components/DeviceCard';
import { usePolling } from '@/hooks/usePolling';

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  usePolling(() => {
    apiClient.getDevices()
      .then(setDevices)
      .catch(() => setError('Erro ao carregar dispositivos'));
  }, 10000);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Dispositivos</h1>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {devices.length === 0 && !error && (
        <p className="text-gray-500 text-sm">Nenhum dispositivo detectado ainda.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
    </div>
  );
}
