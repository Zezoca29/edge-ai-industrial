'use client';

import { ArrowDown, ArrowUp, Broadcast, Check, Warning } from '@phosphor-icons/react';
import { muted } from '@/components/ui/primitives';

/**
 * O diário da bancada. Serve para responder "o que aconteceu logo antes
 * disso?" sem sair da tela — a mesma função do log da bancada Wokwi.
 */

export type EventKind = 'up' | 'down' | 'ok' | 'net' | 'warn';

export interface BenchEvent {
  id: string;
  time: string;
  message: string;
  kind: EventKind;
}

const ICON = {
  up: { Icon: ArrowUp, color: 'var(--color-ok)' },
  down: { Icon: ArrowDown, color: 'var(--color-warn)' },
  ok: { Icon: Check, color: muted(45) },
  net: { Icon: Broadcast, color: muted(45) },
  warn: { Icon: Warning, color: 'var(--color-warn)' },
} as const;

export function EventLog({ events }: { events: BenchEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-4 text-sm" style={{ color: muted(45) }}>
        Nada registrado ainda nesta sessão.
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {events.map((e) => {
        const { Icon, color } = ICON[e.kind];
        return (
          <li
            key={e.id}
            className="flex items-center gap-3 border-b py-2.5"
            style={{ borderColor: 'var(--color-divider)' }}
          >
            <span className="shrink-0 text-xs tabular-nums" style={{ color: muted(40) }}>
              {e.time}
            </span>
            <span className="flex-1 text-[13px]">{e.message}</span>
            <Icon size={14} style={{ color }} className="shrink-0" aria-hidden />
          </li>
        );
      })}
    </ul>
  );
}
