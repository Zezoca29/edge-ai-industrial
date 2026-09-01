'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowsDownUp, MagnifyingGlass, SquaresFour } from '@phosphor-icons/react';
import { useBancadas } from '@/hooks/useBancadas';
import { countByStatus, STATUS_META, type Bancada, type BancadaStatus } from '@/lib/bancada';
import { BancadaCard, BancadaRow } from '@/components/bancada/BancadaCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, muted, Skeleton, tint } from '@/components/ui/primitives';

type Filtro = BancadaStatus | 'all';

const FILTROS_VALIDOS: Filtro[] = ['all', 'crit', 'warn', 'off', 'ok'];
type Ordem = 'prioridade' | 'estoque' | 'nome';

const ORDENS: { key: Ordem; label: string }[] = [
  { key: 'prioridade', label: 'Prioridade' },
  { key: 'estoque', label: 'Menor estoque' },
  { key: 'nome', label: 'Nome' },
];

export default function BancadasPage() {
  // useSearchParams exige um limite de Suspense no App Router.
  return (
    <Suspense fallback={<Skeleton style={{ height: 400 }} />}>
      <BancadasLista />
    </Suspense>
  );
}

function BancadasLista() {
  const params = useSearchParams();
  // A query vem da URL, ou seja, do usuario: so aceitar um valor conhecido.
  const bruto = params.get('estado');
  const estadoInicial: Filtro = FILTROS_VALIDOS.includes(bruto as Filtro)
    ? (bruto as Filtro)
    : 'all';

  const { bancadas, loading, error, now } = useBancadas(5000);
  const [filtro, setFiltro] = useState<Filtro>(estadoInicial);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('prioridade');

  const counts = countByStatus(bancadas);
  const chips: { key: Filtro; label: string; n: number }[] = [
    { key: 'all', label: 'Todas', n: bancadas.length },
    { key: 'crit', label: 'Críticas', n: counts.crit },
    { key: 'warn', label: 'Atenção', n: counts.warn },
    { key: 'off', label: 'Offline', n: counts.off },
    { key: 'ok', label: 'Operacionais', n: counts.ok },
  ];

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = bancadas.filter(
      (b) =>
        (filtro === 'all' || b.status === filtro) &&
        (!q ||
          b.deviceName.toLowerCase().includes(q) ||
          (b.location ?? '').toLowerCase().includes(q) ||
          (b.productName ?? '').toLowerCase().includes(q))
    );
    return ordenar(filtradas, ordem);
  }, [bancadas, filtro, busca, ordem]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Bancadas"
        subtitle={`${visiveis.length} de ${bancadas.length}`}
        live={{ ok: !error, label: error ? 'Sem retorno' : 'Ao vivo' }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="relative min-w-[180px] flex-1">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: muted(40) }}
          />
          <input
            className="input pl-8"
            placeholder="Buscar bancada, local ou produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar bancada"
          />
        </span>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={() => setOrdem(proximaOrdem(ordem))}
          title="Trocar a ordenação"
        >
          <ArrowsDownUp size={13} />
          {ORDENS.find((o) => o.key === ordem)!.label}
        </button>
      </div>

      <div className="noct-scroll -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFiltro(c.key)}
            aria-pressed={filtro === c.key}
            className="min-h-[34px] shrink-0 rounded-full px-3 py-1.5 font-heading text-[13px]"
            style={
              filtro === c.key
                ? {
                    color: 'var(--color-accent-200)',
                    background: tint('var(--color-accent)', 16),
                    border: '1px solid var(--color-accent-600)',
                  }
                : {
                    color: muted(65),
                    background: 'transparent',
                    border: '1px solid var(--color-divider)',
                  }
            }
          >
            {c.label} · {c.n}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 72, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <EmptyState icon={<SquaresFour size={28} />} title="Nenhuma bancada corresponde ao filtro">
          {bancadas.length === 0
            ? 'Nenhum dispositivo publicou no broker ainda.'
            : 'Afrouxe a busca ou escolha outro estado.'}
        </EmptyState>
      ) : (
        <>
          {/* Cartão no desktop, linha densa no telefone: a mesma informação,
              a densidade que cada tela comporta. */}
          <div className="hidden grid-cols-2 gap-2.5 md:grid xl:grid-cols-3">
            {visiveis.map((b) => (
              <BancadaCard key={b.deviceId} b={b} now={now} />
            ))}
          </div>
          <div className="flex flex-col gap-2.5 md:hidden">
            {visiveis.map((b) => (
              <BancadaRow key={b.deviceId} b={b} now={now} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function proximaOrdem(atual: Ordem): Ordem {
  const i = ORDENS.findIndex((o) => o.key === atual);
  return ORDENS[(i + 1) % ORDENS.length].key;
}

function ordenar(lista: Bancada[], ordem: Ordem): Bancada[] {
  const copia = [...lista];
  if (ordem === 'nome') {
    return copia.sort((a, b) => a.deviceName.localeCompare(b.deviceName, 'pt-BR'));
  }
  if (ordem === 'estoque') {
    // Sem contagem vai para o fim: "não sei" não é "acabou".
    return copia.sort(
      (a, b) => (a.currentQty ?? Number.MAX_SAFE_INTEGER) - (b.currentQty ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return copia.sort(
    (a, b) =>
      STATUS_META[a.status].rank - STATUS_META[b.status].rank ||
      a.deviceName.localeCompare(b.deviceName, 'pt-BR')
  );
}
