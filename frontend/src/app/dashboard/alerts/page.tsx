'use client';

import { useCallback, useState } from 'react';
import { Alert } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import { PushToggle } from '@/components/PushToggle';

const LABEL: Record<string, string> = {
  stock_low: 'Estoque baixo',
  device_silent: 'Sensor sem sinal',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .getAlerts(!showAll)
      .then((data) => {
        setAlerts(data);
        setLoading(false);
        setLoadError(null);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
        setLoadError('Não foi possível carregar os alertas. Tentando novamente...');
      });
  }, [showAll]);

  usePolling(load, 10000);

  function acknowledge(id: string) {
    setActionError(null);
    apiClient
      .acknowledgeAlert(id)
      .then(load)
      .catch((err) => {
        console.error(err);
        setActionError('Não foi possível marcar o alerta como visto.');
      });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Alertas</h1>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
        <PushToggle />
      </div>

      {(loadError || actionError) && (
        <p role="alert" className="text-red-400 text-sm mb-4">
          {loadError ?? actionError}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          className="accent-blue-600"
        />
        Mostrar também os já vistos e resolvidos
      </label>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : alerts.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum alerta. As prateleiras estão abastecidas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-wrap items-center gap-3"
            >
              <span
                className={`text-xs font-semibold rounded px-2 py-1 ${
                  a.severity === 'high'
                    ? 'bg-red-900 text-red-200'
                    : 'bg-yellow-900 text-yellow-200'
                }`}
              >
                {LABEL[a.alertType] ?? a.alertType}
              </span>
              <span className="text-gray-100 text-sm flex-1 min-w-0">{a.message}</span>
              <time className="text-xs text-gray-500 tabular-nums">
                {new Date(a.createdAt).toLocaleString('pt-BR')}
              </time>
              {a.resolvedAt ? (
                <span className="text-xs text-green-400">resolvido</span>
              ) : a.acknowledged ? (
                <span className="text-xs text-gray-500">visto</span>
              ) : (
                <button
                  onClick={() => acknowledge(a.id)}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs rounded px-2 py-1"
                >
                  Marcar como visto
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
