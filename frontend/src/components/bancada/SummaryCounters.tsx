'use client';

import { useRouter } from 'next/navigation';
import { countByStatus, STATUS_META, type Bancada, type BancadaStatus } from '@/lib/bancada';
import { muted } from '@/components/ui/primitives';
import { StatusIcon } from './StatusBadge';

/**
 * Os contadores do topo. Cada célula é um atalho: clicar leva para a lista já
 * filtrada por aquele estado, que é o gesto que o operador quer fazer logo
 * depois de ver um número diferente de zero.
 */

const CELLS: BancadaStatus[] = ['crit', 'warn', 'off', 'ok'];

export function SummaryCounters({ bancadas }: { bancadas: Bancada[] }) {
  const router = useRouter();
  const counts = countByStatus(bancadas);

  return (
    <div
      className="grid grid-cols-2 gap-px sm:grid-cols-4"
      style={{ background: 'var(--color-divider)' }}
    >
      {CELLS.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => router.push(`/dashboard/bancadas?estado=${status}`)}
          className="flex min-h-[62px] flex-col items-start gap-1.5 px-3 py-3 text-left"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <span className="flex items-center gap-1.5">
            <StatusIcon status={status} size={15} />
            <span className="font-heading text-2xl leading-none tabular-nums">
              {counts[status]}
            </span>
          </span>
          <span className="text-[11px] uppercase tracking-wider" style={{ color: muted(50) }}>
            {STATUS_META[status].label}
          </span>
        </button>
      ))}
    </div>
  );
}
