'use client';

import { rulerTicks, type UnitSpec } from '@/lib/weight';
import { muted } from '@/components/ui/primitives';

/**
 * A régua peso → pacotes. Cada traço é um degrau; a agulha mostra onde a
 * leitura crua realmente caiu.
 *
 * O valor dela é ver a distância entre a agulha e o degrau mais próximo — é
 * essa distância, comparada à tolerância, que decide se o backend conta ou
 * desconfia da leitura. Um número sozinho esconde isso; a régua mostra.
 */

export function WeightRuler({
  maxPackages,
  spec,
  count,
  rawUnits,
  suspect,
}: {
  maxPackages: number;
  spec: UnitSpec | null;
  count: number | null;
  rawUnits: number | null;
  suspect: boolean;
}) {
  const ticks = rulerTicks(maxPackages, spec, suspect ? null : count);
  const needleAt =
    rawUnits === null ? null : Math.min(1, Math.max(0, rawUnits / Math.max(1, maxPackages)));

  // A régua é um desenho; a informação que ela carrega precisa existir também
  // como texto, senão o leitor de tela vê um bloco vazio sob um título.
  const resumo =
    rawUnits === null
      ? 'Sem leitura de peso.'
      : suspect
        ? `Leitura em ${rawUnits.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pacotes, fora do degrau.`
        : `Leitura em ${count} de ${maxPackages} pacotes.`;

  return (
    <div className="relative h-14 select-none" role="img" aria-label={resumo}>
      <div
        className="absolute left-0 right-0 top-[22px] h-px"
        style={{ background: 'var(--color-divider)' }}
      />

      {ticks.map((t, i) => (
        <div
          key={i}
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ left: `${t.at * 100}%` }}
        >
          <span
            className="rounded-sm"
            style={{
              width: t.active ? 3 : 1,
              height: t.active ? 22 : 14,
              marginTop: t.active ? 0 : 8,
              background: t.active ? 'var(--color-accent)' : muted(25),
            }}
          />
          <span
            className="whitespace-nowrap text-[11px] tabular-nums"
            style={{ color: t.active ? 'var(--color-accent-300)' : muted(35) }}
          >
            {t.label}
          </span>
        </div>
      ))}

      {needleAt !== null && (
        <span
          className="absolute top-[14px] -translate-x-1/2 rounded-full transition-[left] duration-300"
          style={{
            left: `${needleAt * 100}%`,
            width: 9,
            height: 9,
            background: suspect ? 'var(--color-warn)' : 'var(--color-accent)',
            boxShadow: `0 0 0 4px color-mix(in srgb, ${
              suspect ? 'var(--color-warn)' : 'var(--color-accent)'
            } 20%, transparent)`,
          }}
        />
      )}
    </div>
  );
}
