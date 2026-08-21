'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle, SquaresFour } from '@phosphor-icons/react';
import { useBancadas } from '@/hooks/useBancadas';
import { BancadaCard } from '@/components/bancada/BancadaCard';
import { AlertRow } from '@/components/bancada/AlertRow';
import { SummaryCounters } from '@/components/bancada/SummaryCounters';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, muted, SectionHeader, Skeleton } from '@/components/ui/primitives';

/**
 * A visão geral responde uma pergunta só: preciso ir até alguma gôndola agora?
 * Por isso o que ocupa o meio da tela são as bancadas que *não* estão bem — as
 * saudáveis viram um número no topo e nada mais.
 */
export default function VisaoGeralPage() {
  const { bancadas, alerts, loading, error, now } = useBancadas(10000);

  const precisamAtencao = bancadas.filter((b) => b.status !== 'ok');
  const foco = precisamAtencao.length > 0 ? precisamAtencao.slice(0, 4) : bancadas.slice(0, 4);
  const tudoOk = !loading && bancadas.length > 0 && precisamAtencao.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Visão geral"
        subtitle={`${bancadas.length} ${bancadas.length === 1 ? 'bancada monitorada' : 'bancadas monitoradas'}`}
        live={{ ok: !error, label: error ? 'Sem retorno' : 'Ao vivo' }}
      />

      {error && (
        <p className="mb-5 text-sm" style={{ color: 'var(--color-warn)' }}>
          {error} Os números abaixo podem estar velhos.
        </p>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : bancadas.length === 0 ? (
        <EmptyState
          icon={<SquaresFour size={32} />}
          title="Nenhuma bancada cadastrada"
          action={
            <Link href="/dashboard/ajustes" className="btn btn-primary mt-2.5">
              Ir para Ajustes
            </Link>
          }
        >
          Um dispositivo aparece aqui sozinho assim que publicar no broker MQTT. Confira o broker e
          o prefixo de tópico em Ajustes.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <SummaryCounters bancadas={bancadas} />

          <section>
            <SectionHeader
              title={alerts.length > 0 ? `${alerts.length} alertas ativos` : 'Alertas'}
              action={
                alerts.length > 0 && (
                  <Link href="/dashboard/alertas" className="btn btn-ghost text-xs">
                    Ver todos
                  </Link>
                )
              }
            />
            {alerts.length === 0 ? (
              <div
                className="flex items-center gap-2.5 rounded-md border px-3.5 py-3.5"
                style={{ borderColor: 'var(--color-divider)', background: 'var(--color-surface)' }}
              >
                <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-ok)' }} />
                <span className="text-[13px]" style={{ color: muted(65) }}>
                  Nenhum alerta ativo. Todas as bancadas operacionais.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {alerts.slice(0, 3).map((a) => (
                  <AlertRow key={a.id} alert={a} compact />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader
              title={tudoOk ? 'Bancadas' : 'Precisam de atenção'}
              action={
                <Link href="/dashboard/bancadas" className="btn btn-ghost text-xs">
                  Ver todas
                  <ArrowRight size={13} />
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {foco.map((b) => (
                <BancadaCard key={b.deviceId} b={b} now={now} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton style={{ height: 62 }} />
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 118, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}
