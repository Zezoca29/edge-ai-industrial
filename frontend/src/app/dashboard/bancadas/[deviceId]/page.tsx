'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Broadcast, Cpu, Database, Pulse, Scales, Check, X } from '@phosphor-icons/react';
import { apiClient } from '@/services/apiClient';
import { useBancada } from '@/hooks/useBancadas';
import { sinceLabel, STALE_AFTER_MS, unitSpec, type Bancada } from '@/lib/bancada';
import { packagesFromWeight } from '@/lib/weight';
import { StatusBadge, StatusIcon } from '@/components/bancada/StatusBadge';
import { AlertRow } from '@/components/bancada/AlertRow';
import { PicksBars, WeightHistory } from '@/components/bancada/WeightHistory';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, muted, SectionHeader, Skeleton } from '@/components/ui/primitives';
import type { PickEvent, SensorReading } from '@/types';

/**
 * O detalhe de uma bancada. Absorve o que antes eram três telas soltas
 * (leituras, anomalias, retiradas): olhar para um sensor fora do contexto da
 * gôndola que ele mede nunca ajudou ninguém a decidir nada.
 */
export default function BancadaDetalhePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = use(params);
  const { bancada, loading, error, now } = useBancada(deviceId, 5000);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [picks, setPicks] = useState<PickEvent[]>([]);

  const loadSeries = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
    try {
      const [r, p] = await Promise.all([
        apiClient.getReadings(deviceId, from.toISOString(), to.toISOString()),
        apiClient.getRecentPicks(12),
      ]);
      setReadings(r);
      setPicks(p.filter((x) => x.deviceId === deviceId));
    } catch {
      // A série é acessório: o cabeçalho já diz se o backend respondeu.
    }
  }, [deviceId]);

  useEffect(() => {
    loadSeries();
    const id = setInterval(loadSeries, 15000);
    return () => clearInterval(id);
  }, [loadSeries]);

  if (loading) return <Skeleton style={{ height: 420 }} />;

  if (!bancada) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader title="Bancada não encontrada" backHref="/dashboard/bancadas" backLabel="Bancadas" />
        <EmptyState icon={<X size={28} />} title="Esse dispositivo não está mais na lista">
          Ele pode ter sido removido, ou pertencer a outra loja.
        </EmptyState>
      </div>
    );
  }

  const spec = unitSpec(bancada);
  const netG = (bancada.currentWeightG ?? 0) - bancada.tareG;
  const leitura = packagesFromWeight(netG, spec);
  // O backend ja aplicou a tolerancia; o calculo local so diz *quanto* faltou.
  const suspeita = bancada.suspect || leitura.suspect;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={bancada.deviceName}
        subtitle={`${bancada.location ?? 'sem local'} · ${bancada.productName ?? 'sem produto vinculado'}`}
        backHref="/dashboard/bancadas"
        backLabel="Bancadas"
        live={{ ok: !error, label: error ? 'Sem retorno' : 'Ao vivo' }}
      />

      <div className="mb-7 flex items-center gap-3">
        <StatusIcon status={bancada.status} size={26} />
        <StatusBadge status={bancada.status} size={12} />
        <span className="text-xs" style={{ color: muted(45) }}>
          último sinal {sinceLabel(bancada.lastSeenAt, now)}
        </span>
        <span className="flex-1" />
        <Link href={`/dashboard/bancadas/${deviceId}/monitor`} className="btn btn-primary">
          <Pulse size={16} />
          Ver monitoramento
        </Link>
      </div>

      <div
        className="mb-8 grid grid-cols-2 gap-px md:grid-cols-4"
        style={{ background: 'var(--color-divider)' }}
      >
        <Metric
          label="Pacotes"
          value={bancada.currentQty ?? '—'}
          hint={bancada.minQty !== null ? `mínimo ${bancada.minQty}` : 'sem mínimo'}
          alarm={bancada.currentQty !== null && bancada.minQty !== null && bancada.currentQty <= bancada.minQty}
        />
        <Metric
          label="Peso líquido"
          value={bancada.currentWeightG === null ? '—' : `${(netG / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`}
          hint={spec ? `unidade ${(spec.unitWeightG / 1000).toLocaleString('pt-BR')} kg` : 'sem produto'}
        />
        <Metric
          label="Retiradas 24h"
          value={bancada.picks24h}
          hint="unidades saíram"
        />
        <Metric
          label="Resíduo"
          value={spec ? `${Math.round(leitura.residualG)} g` : '—'}
          hint={spec ? `tolerância ${spec.toleranceG} g` : 'sem tolerância'}
          alarm={suspeita}
        />
      </div>

      {bancada.alerts.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Alertas ativos" />
          <div className="flex flex-col gap-2">
            {bancada.alerts.map((a) => (
              <AlertRow key={a.id} alert={a} compact />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <SectionHeader title="Sensores e conexão" />
        <SensorTable bancada={bancada} now={now} suspect={suspeita} />
      </section>

      <section className="mb-8">
        <SectionHeader title="Peso da prateleira · últimas 12 h" />
        <WeightHistory readings={readings} />
      </section>

      <section>
        <SectionHeader title="Retiradas por hora · últimas 12 h" />
        <PicksBars hours={picksPorHora(picks, now)} />
        <div className="mt-2 flex justify-between text-[11px]" style={{ color: muted(35) }}>
          <span>12 h atrás</span>
          <span>agora</span>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  alarm = false,
}: {
  label: string;
  value: number | string;
  hint: string;
  alarm?: boolean;
}) {
  return (
    <div className="px-3 py-3" style={{ background: 'var(--color-bg)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: muted(40) }}>
        {label}
      </div>
      <div
        className="font-heading text-[22px] tabular-nums"
        style={{ letterSpacing: '-.02em', color: alarm ? 'var(--color-warn)' : undefined }}
      >
        {value}
      </div>
      <div className="text-[11px]" style={{ color: muted(40) }}>
        {hint}
      </div>
    </div>
  );
}

/**
 * A cadeia física, linha a linha. Um dispositivo que não fala há mais que o
 * limiar de silêncio derruba tudo a partir do HX711 — é a inferência que o
 * operador faria de cabeça, feita para ele.
 */
function SensorTable({
  bancada,
  now,
  suspect,
}: {
  bancada: Bancada;
  now: number;
  suspect: boolean;
}) {
  const mudo =
    bancada.deviceStatus !== 'online' ||
    !bancada.lastSeenAt ||
    now - new Date(bancada.lastSeenAt).getTime() > STALE_AFTER_MS;

  const linhas: { Icon: typeof Scales; nome: string; valor: string; ok: boolean }[] = [
    {
      Icon: Scales,
      nome: 'Célula de carga',
      valor:
        bancada.currentWeightG === null
          ? 'sem leitura'
          : `${Math.round(bancada.currentWeightG)} g bruto`,
      ok: bancada.currentWeightG !== null && !suspect,
    },
    {
      Icon: Cpu,
      nome: 'HX711 → ESP32',
      valor: mudo ? 'sem sinal' : suspect ? 'fora do degrau' : 'estável',
      ok: !mudo && !suspect,
    },
    {
      Icon: Broadcast,
      nome: 'Broker MQTT',
      valor: mudo ? 'sem publicação recente' : `no ar · ${sinceLabel(bancada.lastSeenAt, now)}`,
      ok: !mudo,
    },
    {
      Icon: Database,
      nome: 'Backend',
      valor: bancada.slotId ? 'prateleira vinculada' : 'prateleira não configurada',
      ok: bancada.slotId !== null,
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--color-divider)' }}>
      {linhas.map((l, i) => (
        <div
          key={l.nome}
          className="flex items-center gap-2.5 px-3.5 py-3"
          style={{
            borderBottom: i < linhas.length - 1 ? '1px solid var(--color-divider)' : undefined,
          }}
        >
          <l.Icon size={15} className="shrink-0" style={{ color: muted(50) }} aria-hidden />
          <span className="flex-1 text-sm">{l.nome}</span>
          <span className="text-xs" style={{ color: muted(55) }}>
            {l.valor}
          </span>
          {l.ok ? (
            <Check size={15} style={{ color: 'var(--color-ok)' }} aria-label="ok" />
          ) : (
            <X size={15} style={{ color: 'var(--color-warn)' }} aria-label="com problema" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Agrupa as retiradas em 12 baldes de uma hora, do mais velho ao mais novo. */
function picksPorHora(picks: PickEvent[], now: number): { label: string; qty: number }[] {
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 3600_000;
    return {
      label: new Date(end).toLocaleTimeString('pt-BR', { hour: '2-digit' }) + 'h',
      qty: 0,
      end,
    };
  });

  picks.forEach((p) => {
    const t = new Date(p.time).getTime();
    const idx = 11 - Math.floor((now - t) / 3600_000);
    if (idx >= 0 && idx < 12) buckets[idx].qty += p.quantity;
  });

  return buckets.map(({ label, qty }) => ({ label, qty }));
}
