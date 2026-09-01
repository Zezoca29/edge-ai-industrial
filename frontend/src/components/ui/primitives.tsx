'use client';

import type { ReactNode } from 'react';

/**
 * Os tijolos que se repetem em todas as telas. Ficam juntos porque cada um é
 * pequeno demais para um arquivo e porque todos falam a mesma gramática:
 * versalete de seção, texto apagado, esqueleto, estado vazio.
 */

/** Rótulo versalete que abre cada bloco. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/** Texto secundário. `level` é a opacidade em porcento sobre a cor de texto. */
export function Muted({
  children,
  level = 55,
  className = '',
}: {
  children: ReactNode;
  level?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{ color: `color-mix(in srgb, var(--color-text) ${level}%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function muted(level: number): string {
  return `color-mix(in srgb, var(--color-text) ${level}%, transparent)`;
}

/** Mistura uma cor de estado com o fundo — usado em bordas e preenchimentos. */
export function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-skel rounded-md bg-neutral-900 ${className}`}
      style={style}
      aria-hidden
    />
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <Eyebrow>{title}</Eyebrow>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5 px-2 py-16">
      <div style={{ color: muted(35) }}>{icon}</div>
      <h4 className="m-0">{title}</h4>
      {children && (
        <p className="max-w-md text-sm" style={{ color: muted(55), textWrap: 'pretty' }}>
          {children}
        </p>
      )}
      {action}
    </div>
  );
}

/** Ponto pulsante de "ao vivo". */
export function LiveDot({ color = 'var(--color-ok)' }: { color?: string }) {
  return (
    <span
      className="inline-block h-[7px] w-[7px] shrink-0 animate-pulse-soft rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}
