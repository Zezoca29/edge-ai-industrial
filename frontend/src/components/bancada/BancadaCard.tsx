'use client';

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import { STATUS_META, sinceLabel, type Bancada } from '@/lib/bancada';
import { muted, tint } from '@/components/ui/primitives';
import { StatusBadge, StatusIcon } from './StatusBadge';

/**
 * Um cartão de bancada. As três medidas do rodapé são as do domínio real —
 * pacotes na gôndola, mínimo combinado, retiradas no dia — e não métricas de
 * chão de fábrica: é o que o lojista decide em cima.
 */

function metaLine(b: Bancada): string {
  const parts = [b.location ?? 'sem local', b.productName ?? 'sem produto'];
  return parts.join(' · ');
}

export function BancadaCard({ b, now }: { b: Bancada; now: number }) {
  const meta = STATUS_META[b.status];
  const strong = b.status === 'crit' || b.status === 'warn';

  return (
    <Link
      href={`/dashboard/bancadas/${b.deviceId}`}
      className="flex w-full flex-col rounded-md p-3.5 transition-colors"
      style={{
        background: b.status === 'crit' ? tint(meta.color, 7) : 'var(--color-surface)',
        border: `1px solid ${strong ? tint(meta.color, 45) : 'var(--color-divider)'}`,
        color: 'var(--color-text)',
      }}
    >
      <span className="flex items-start gap-2.5">
        <StatusIcon status={b.status} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-heading text-base font-medium">{b.deviceName}</span>
          <span className="block truncate text-xs" style={{ color: muted(45) }}>
            {metaLine(b)}
          </span>
        </span>
        <StatusBadge status={b.status} />
      </span>

      <span
        className="mt-3 flex gap-6 border-t pt-3"
        style={{ borderColor: 'var(--color-divider)' }}
      >
        <Metric label="Pacotes" value={b.currentQty ?? '—'} accent={b.status === 'crit'} />
        <Metric label="Mínimo" value={b.minQty ?? '—'} />
        <Metric label="Retiradas 24h" value={b.picks24h} />
        <span className="flex-1" />
        <span className="self-center text-right">
          <span className="block text-[10px] uppercase tracking-wider" style={{ color: muted(40) }}>
            Sinal
          </span>
          <span className="block text-xs tabular-nums" style={{ color: muted(55) }}>
            {sinceLabel(b.lastSeenAt, now)}
          </span>
        </span>
        <CaretRight size={15} className="shrink-0 self-center" style={{ color: muted(40) }} />
      </span>
    </Link>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <span className="text-left">
      <span className="block text-[10px] uppercase tracking-wider" style={{ color: muted(40) }}>
        {label}
      </span>
      <span
        className="block font-heading text-[17px] tabular-nums"
        style={accent ? { color: 'var(--color-crit)' } : undefined}
      >
        {value}
      </span>
    </span>
  );
}

/** A mesma bancada em linha — usada na lista densa do mobile. */
export function BancadaRow({ b, now }: { b: Bancada; now: number }) {
  const meta = STATUS_META[b.status];
  const strong = b.status === 'crit' || b.status === 'warn';

  return (
    <Link
      href={`/dashboard/bancadas/${b.deviceId}`}
      className="flex w-full items-center gap-2.5 rounded-md px-3.5 py-3"
      style={{
        background: b.status === 'crit' ? tint(meta.color, 7) : 'var(--color-surface)',
        border: `1px solid ${strong ? tint(meta.color, 45) : 'var(--color-divider)'}`,
        color: 'var(--color-text)',
      }}
    >
      <StatusIcon status={b.status} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-heading text-[15px] font-medium">{b.deviceName}</span>
        <span className="block truncate text-xs" style={{ color: muted(45) }}>
          {b.productName ?? 'sem produto'} · {STATUS_META[b.status].label.toLowerCase()} ·{' '}
          {sinceLabel(b.lastSeenAt, now)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-heading text-base tabular-nums">{b.currentQty ?? '—'}</span>
        <span className="block text-[11px]" style={{ color: muted(40) }}>
          mín {b.minQty ?? '—'}
        </span>
      </span>
      <CaretRight size={15} className="shrink-0" style={{ color: muted(40) }} />
    </Link>
  );
}
