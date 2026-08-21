'use client';

import { Broadcast, Cpu, Database, Scales, WifiHigh } from '@phosphor-icons/react';
import { muted, tint } from '@/components/ui/primitives';

/**
 * A cadeia física do sinal: célula → HX711 → ESP32 → MQTT → backend.
 *
 * Quando um número não bate, a primeira pergunta é sempre "em que elo isso
 * quebrou?". Este componente responde antes de alguém abrir um log.
 */

export type LinkState = 'ok' | 'bad' | 'unknown';

export interface ChainLink {
  label: string;
  state: LinkState;
  hint?: string;
}

const ICONS = [Scales, Cpu, WifiHigh, Broadcast, Database];

export function SignalChain({ links }: { links: ChainLink[] }) {
  return (
    <div className="flex items-stretch gap-1.5">
      {links.map((link, i) => {
        const Icon = ICONS[i] ?? Database;
        const color =
          link.state === 'ok'
            ? 'var(--color-ok)'
            : link.state === 'bad'
              ? 'var(--color-off)'
              : muted(40);
        return (
          <div
            key={link.label}
            title={link.hint}
            className="flex flex-1 flex-col items-center gap-1 rounded-sm px-1 py-2.5"
            style={{
              background: link.state === 'bad' ? tint('var(--color-off)', 10) : 'var(--color-surface)',
              border: `1px solid ${
                link.state === 'bad' ? tint('var(--color-off)', 30) : 'var(--color-divider)'
              }`,
              color: muted(70),
            }}
          >
            <Icon size={14} style={{ color }} aria-hidden />
            <span className="whitespace-nowrap text-[11px]">{link.label}</span>
          </div>
        );
      })}
    </div>
  );
}
