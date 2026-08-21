'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, Sliders, SquaresFour, Warning, type Icon } from '@phosphor-icons/react';
import { muted, tint } from '@/components/ui/primitives';

/**
 * A mesma navegação em duas formas: trilho lateral no desktop, barra inferior
 * no telefone. Um componente, não duas árvores — o mockup separa as duas
 * viewports porque é um mockup; aqui a duplicação seria dívida.
 */

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  /** Prefixo que mantém o item aceso nas rotas filhas. */
  match: string;
}

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Visão geral', icon: Gauge, match: '/dashboard' },
  { href: '/dashboard/bancadas', label: 'Bancadas', icon: SquaresFour, match: '/dashboard/bancadas' },
  { href: '/dashboard/alertas', label: 'Alertas', icon: Warning, match: '/dashboard/alertas' },
  { href: '/dashboard/ajustes', label: 'Ajustes', icon: Sliders, match: '/dashboard/ajustes' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(item.match);
}

export function NavRail({ openAlerts }: { openAlerts: number }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden w-52 shrink-0 flex-col gap-1 border-r p-3 lg:flex"
      style={{ borderColor: 'var(--color-divider)' }}
      aria-label="Navegação principal"
    >
      <div className="px-2 pb-4 pt-2 text-[11px] uppercase tracking-[.12em]" style={{ color: muted(40) }}>
        PJI610 · Edge AI
      </div>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-[42px] items-center gap-2.5 rounded-md px-2.5 py-2 font-heading text-sm"
            style={{
              color: active ? 'var(--color-accent-200)' : muted(60),
              background: active ? tint('var(--color-accent)', 14) : 'transparent',
            }}
          >
            <item.icon size={18} aria-hidden />
            <span className="flex-1 truncate text-left">{item.label}</span>
            {item.label === 'Alertas' && openAlerts > 0 && <Badge count={openAlerts} />}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavBar({ openAlerts }: { openAlerts: number }) {
  const pathname = usePathname();
  return (
    <nav
      className="flex shrink-0 border-t lg:hidden"
      style={{ borderColor: 'var(--color-divider)', background: 'var(--color-bg)' }}
      aria-label="Navegação principal"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 px-0 pb-2.5 pt-2"
            style={{ color: active ? 'var(--color-accent-300)' : muted(45) }}
          >
            <item.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />
            <span className="text-[10px] tracking-wide">{item.label}</span>
            {item.label === 'Alertas' && openAlerts > 0 && (
              <span className="absolute left-1/2 top-2 ml-1.5">
                <Badge count={openAlerts} />
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span
      className="inline-block min-w-[18px] rounded-full px-1.5 text-center font-heading text-[11px] leading-[18px]"
      style={{ background: 'var(--color-crit)', color: 'var(--color-bg)' }}
      aria-label={`${count} alertas abertos`}
    >
      {count}
    </span>
  );
}
