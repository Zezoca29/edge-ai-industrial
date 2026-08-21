'use client';

import { useCallback, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { apiClient } from '@/services/apiClient';
import { useBancadas } from '@/hooks/useBancadas';
import { AlertRow } from '@/components/bancada/AlertRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, muted, Skeleton } from '@/components/ui/primitives';

/**
 * Todos os alertas abertos, os mais urgentes primeiro. "Marcar como visto" é
 * distinto de resolvido: o alerta some da contagem de novidades, mas continua
 * na lista até a situação de fato acabar — quem resolve é a gôndola, não o
 * clique.
 */
export default function AlertasPage() {
  const { alerts, loading, error, refresh } = useBancadas(10000);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const marcarVisto = useCallback(
    async (id: string) => {
      setOcupado(id);
      try {
        await apiClient.acknowledgeAlert(id);
        refresh();
      } finally {
        setOcupado(null);
      }
    },
    [refresh]
  );

  const ordenados = [...alerts].sort((a, b) => {
    const peso = (t: string) => (t === 'device_silent' ? 0 : 1);
    return (
      peso(a.alertType) - peso(b.alertType) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Alertas"
        subtitle={`${alerts.length} ${alerts.length === 1 ? 'ativo' : 'ativos'}`}
        live={{ ok: !error, label: error ? 'Sem retorno' : 'Ao vivo' }}
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 84, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={30} weight="fill" style={{ color: 'var(--color-ok)' }} />}
          title="Sem alertas"
        >
          Nada exige ação agora. As bancadas estão dentro do mínimo combinado e todas publicaram
          recentemente.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {ordenados.map((a) => (
            <div key={a.id} style={{ opacity: ocupado === a.id ? 0.5 : 1 }}>
              <AlertRow alert={a} onAcknowledge={marcarVisto} />
            </div>
          ))}
          <p className="mt-3 text-[11px]" style={{ color: muted(40) }}>
            Marcar como visto não resolve o alerta — ele sai sozinho quando a situação acabar.
          </p>
        </div>
      )}
    </div>
  );
}
