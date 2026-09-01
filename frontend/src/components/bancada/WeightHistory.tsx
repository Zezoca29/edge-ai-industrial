'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SensorReading } from '@/types';
import { muted } from '@/components/ui/primitives';

/**
 * O peso da prateleira ao longo do tempo. É a única visualização de série do
 * dashboard e mostra a forma que interessa: degraus. Uma retirada é um degrau
 * para baixo, uma reposição é um degrau para cima; o que não for degrau é
 * ruído, e é isso que a tolerância existe para filtrar.
 */

export function WeightHistory({ readings }: { readings: SensorReading[] }) {
  const data = useMemo(
    () =>
      [...readings]
        .filter((r) => r.sensorType === 'weight')
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
        .map((r) => ({
          t: new Date(r.time).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          kg: r.unit === 'g' ? r.value / 1000 : r.value,
          anomaly: r.classification === 'anomaly',
        })),
    [readings]
  );

  if (data.length === 0) {
    return (
      <p className="py-6 text-sm" style={{ color: muted(45) }}>
        Sem leituras de peso na janela.
      </p>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-divider)" vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: muted(40), fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: muted(40), fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            unit=" kg"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
              borderRadius: 8,
              fontSize: 13,
            }}
            labelStyle={{ color: muted(55) }}
            formatter={(v: number) => [`${v.toLocaleString('pt-BR')} kg`, 'Peso']}
          />
          <Area
            type="stepAfter"
            dataKey="kg"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#weightFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Retiradas por hora nas últimas 12 h, em barras. Responde "esse produto sai
 * quando?" — que é a pergunta que define a hora de repor.
 */
export function PicksBars({ hours }: { hours: { label: string; qty: number }[] }) {
  const max = Math.max(1, ...hours.map((h) => h.qty));
  return (
    <div className="flex h-16 items-end gap-1">
      {hours.map((h, i) => (
        <div key={h.label} className="flex flex-1 flex-col items-center gap-1" title={`${h.label} · ${h.qty}`}>
          <div
            className="w-full rounded-sm"
            style={{
              height: `${Math.max(3, (h.qty / max) * 46)}px`,
              background:
                h.qty === 0
                  ? muted(10)
                  : `color-mix(in srgb, var(--color-accent) ${i === hours.length - 1 ? 70 : 34}%, transparent)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
