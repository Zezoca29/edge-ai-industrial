'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { LiveDot, muted } from './primitives';

/**
 * O cabeçalho de toda tela do dashboard: título, subtítulo, volta opcional e o
 * indicador de "ao vivo" — que aqui significa "o polling respondeu", não
 * "existe um socket aberto". Dizer a verdade sobre a frescura do dado é metade
 * do trabalho de um painel de instrumentação.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Voltar',
  live,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  live?: { ok: boolean; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
      {backHref && (
        <Link href={backHref} className="btn btn-ghost -ml-1 mt-1 shrink-0 text-xs">
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="m-0 truncate">{title}</h4>
        {subtitle && (
          <div className="text-xs" style={{ color: muted(45) }}>
            {subtitle}
          </div>
        )}
      </div>
      {live && (
        <div
          className="flex shrink-0 items-center gap-1.5 pt-1 text-[11px] uppercase tracking-wider"
          style={{ color: muted(50) }}
        >
          <LiveDot color={live.ok ? 'var(--color-ok)' : 'var(--color-warn)'} />
          {live.label}
        </div>
      )}
      {actions}
    </header>
  );
}
