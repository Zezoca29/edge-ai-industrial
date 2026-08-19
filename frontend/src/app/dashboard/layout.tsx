'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [openAlerts, setOpenAlerts] = useState(0);

  usePolling(() => {
    apiClient
      .getAlertCount()
      .then((r) => setOpenAlerts(r.open))
      .catch(() => setOpenAlerts(0));
  }, 15000);

  return (
    <div className="flex min-h-screen">
      <nav className="w-48 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Edge AI</p>
        <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white py-1">
          Dispositivos
        </Link>
        <Link href="/dashboard/readings" className="text-sm text-gray-300 hover:text-white py-1">
          Leituras
        </Link>
        <Link href="/dashboard/anomalies" className="text-sm text-gray-300 hover:text-white py-1">
          Anomalias
        </Link>
        <Link href="/dashboard/picks" className="text-sm text-gray-300 hover:text-white py-1">
          Retiradas
        </Link>
        <Link
          href="/dashboard/alerts"
          className="text-sm text-gray-300 hover:text-white py-1 flex items-center gap-2"
        >
          Alertas
          {openAlerts > 0 && (
            <span className="bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 tabular-nums">
              {openAlerts}
            </span>
          )}
        </Link>
        <Link href="/dashboard/settings" className="text-sm text-gray-300 hover:text-white py-1">
          Configuração
        </Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
