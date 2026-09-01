'use client';

import Link from 'next/link';
import { Check } from '@phosphor-icons/react';
import type { Alert } from '@/types';
import type { BancadaStatus } from '@/lib/bancada';
import { muted, tint } from '@/components/ui/primitives';
import { StatusIcon } from './StatusBadge';

/**
 * Um alerta na lista. A severidade do backend não é a cor: `stock_low` chega
 * como "high" e vira atenção, porque o que é realmente crítico na gôndola é a
 * prateleira vazia — e essa a bancada mostra pelo estado, não pelo alerta.
 */

export function alertTone(a: Alert): BancadaStatus {
  return a.alertType === 'device_silent' ? 'off' : 'warn';
}

export function alertKindLabel(a: Alert): string {
  return a.alertType === 'device_silent' ? 'Sensor sem sinal' : 'Estoque baixo';
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AlertRow({
  alert,
  compact = false,
  onAcknowledge,
}: {
  alert: Alert;
  compact?: boolean;
  onAcknowledge?: (id: string) => void;
}) {
  const tone = alertTone(alert);
  const color = tone === 'off' ? 'var(--color-off)' : 'var(--color-warn)';

  const body = (
    <>
      <StatusIcon status={tone} size={17} className="mt-0.5" />
      <span className="min-w-0 flex-1 text-left">
        {!compact && (
          <span
            className="block text-[11px] uppercase tracking-wider"
            style={{ color: muted(45) }}
          >
            {alertKindLabel(alert)}
          </span>
        )}
        <span className="block truncate font-heading text-sm font-medium">
          {alert.deviceName ?? 'dispositivo removido'}
        </span>
        <span className="block text-[13px]" style={{ color: muted(60), textWrap: 'pretty' }}>
          {alert.message}
        </span>
      </span>
      <span className="shrink-0 self-start text-[11px] tabular-nums" style={{ color: muted(40) }}>
        {timeLabel(alert.createdAt)}
      </span>
    </>
  );

  const style = {
    background: tint(color, 7),
    border: `1px solid ${tint(color, 30)}`,
    color: 'var(--color-text)',
  };

  return (
    <div className="flex items-stretch gap-2">
      <Link
        href={`/dashboard/bancadas/${alert.deviceId}`}
        className="flex flex-1 items-start gap-2.5 rounded-md px-3.5 py-3"
        style={style}
      >
        {body}
      </Link>
      {onAcknowledge && !alert.acknowledged && (
        <button
          type="button"
          onClick={() => onAcknowledge(alert.id)}
          className="btn btn-secondary shrink-0"
          title="Marcar como visto"
          aria-label={`Marcar alerta de ${alert.deviceName ?? 'dispositivo'} como visto`}
        >
          <Check size={16} />
        </button>
      )}
    </div>
  );
}
