'use client';

import { useState } from 'react';
import { Device } from '@/types';
import { apiClient } from '@/services/apiClient';

interface Props {
  device: Device;
}

export function DeviceCard({ device }: Props) {
  const isOnline = device.status === 'online';
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<'ok' | 'err' | null>(null);

  async function handlePing() {
    setPinging(true);
    setPingResult(null);
    try {
      await apiClient.pingDevice(device.name);
      setPingResult('ok');
    } catch {
      setPingResult('err');
    } finally {
      setPinging(false);
      setTimeout(() => setPingResult(null), 4000);
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-sm font-semibold text-white">{device.name}</h3>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isOnline ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}
        >
          {isOnline ? 'online' : 'offline'}
        </span>
      </div>
      <p className="text-gray-400 text-xs">Tipo: {device.deviceType}</p>
      <p className="text-gray-400 text-xs">
        Firmware: {device.firmwareVersion ?? 'desconhecido'}
      </p>
      {device.lastSeenAt && (
        <p className="text-gray-500 text-xs mt-1">
          Última leitura: {new Date(device.lastSeenAt).toLocaleString('pt-BR')}
        </p>
      )}
      {!isOnline && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handlePing}
            disabled={pinging}
            className="text-xs px-3 py-1 rounded bg-blue-800 text-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pinging ? 'Aguardando...' : 'Reconectar'}
          </button>
          {pingResult === 'ok' && (
            <span className="text-xs text-green-400">Sinal enviado — aguarde 30s</span>
          )}
          {pingResult === 'err' && (
            <span className="text-xs text-red-400">Falha ao enviar sinal</span>
          )}
        </div>
      )}
    </div>
  );
}
