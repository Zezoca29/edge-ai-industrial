'use client';

import { Device } from '@/types';

interface Props {
  device: Device;
}

export function DeviceCard({ device }: Props) {
  const isOnline = device.status === 'online';
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
    </div>
  );
}
