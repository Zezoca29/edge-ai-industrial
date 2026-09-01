'use client';

import {
  CheckCircle,
  Plugs,
  Warning,
  WarningOctagon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { STATUS_META, type BancadaStatus } from '@/lib/bancada';
import { tint } from '@/components/ui/primitives';

/**
 * O estado da bancada vira cor, ícone e palavra num lugar só. Toda tela que
 * mostra estado passa por aqui, então mudar a semântica é mudar um arquivo.
 */

export const STATUS_ICON: Record<BancadaStatus, PhosphorIcon> = {
  ok: CheckCircle,
  warn: Warning,
  crit: WarningOctagon,
  off: Plugs,
};

export function StatusIcon({
  status,
  size = 18,
  className = '',
}: {
  status: BancadaStatus;
  size?: number;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Icon
      size={size}
      weight="fill"
      className={`shrink-0 ${status === 'crit' ? 'animate-pulse-soft' : ''} ${className}`}
      style={{ color: STATUS_META[status].color }}
      aria-hidden
    />
  );
}

export function StatusBadge({ status, size = 11 }: { status: BancadaStatus; size?: number }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-heading"
      style={{
        fontSize: size,
        letterSpacing: '.04em',
        color: meta.color,
        background: tint(meta.color, 12),
        border: `1px solid ${tint(meta.color, 35)}`,
      }}
    >
      {meta.label}
    </span>
  );
}
