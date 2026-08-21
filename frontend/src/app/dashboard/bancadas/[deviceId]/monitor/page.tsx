'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Minus, Plus, Warning, X } from '@phosphor-icons/react';
import { useBancada } from '@/hooks/useBancadas';
import { STALE_AFTER_MS, unitSpec } from '@/lib/bancada';
import { packagesFromWeight, weightForPackages } from '@/lib/weight';
import { BenchPublisher, type ConnectionState } from '@/services/benchPublisher';
import { loadBenchSettings, type BenchSettings } from '@/services/benchSettings';
import { WeightRuler } from '@/components/bancada/WeightRuler';
import { SignalChain, type ChainLink } from '@/components/bancada/SignalChain';
import { EventLog, type BenchEvent } from '@/components/bancada/EventLog';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, muted, SectionHeader, Skeleton, tint } from '@/components/ui/primitives';

/**
 * A bancada interativa dentro do dashboard.
 *
 * Aqui a bancada cadastrada vira mesmo um circuito: os botões publicam peso no
 * mesmo tópico MQTT que o ESP32 usa, com o mesmo payload. O backend não
 * distingue a origem — e é justamente por isso que este é o teste mais honesto
 * da cadeia inteira.
 *
 * A tela mostra dois números lado a lado de propósito: o que *ela* calculou do
 * peso e o que o *backend* devolveu. Iguais, a cadeia está de pé. Diferentes,
 * você acabou de achar o bug — sem abrir um log.
 */
export default function MonitorPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);
  // 2 s é a cadência da bancada HTML original: rápido o bastante para a
  // resposta do backend parecer imediata ao mexer no peso.
  const { bancada, loading, error, now } = useBancada(deviceId, 2000);

  const [settings, setSettings] = useState<BenchSettings | null>(null);
  const [conexao, setConexao] = useState<ConnectionState>('idle');
  const [conexaoDetalhe, setConexaoDetalhe] = useState<string>();
  const [pacotes, setPacotes] = useState(0);
  const [eventos, setEventos] = useState<BenchEvent[]>([]);
  const publisher = useRef<BenchPublisher | null>(null);
  // O primeiro valor vem do backend; depois disso quem manda é o operador.
  // Guarda o deviceId, não um booleano: navegar para outra bancada tem de
  // semear de novo, senão a bandeja herda a contagem da bancada anterior.
  const semeadoPara = useRef<string | null>(null);

  useEffect(() => setSettings(loadBenchSettings()), []);

  const registrar = useCallback((message: string, kind: BenchEvent['kind']) => {
    setEventos((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          time: new Date().toLocaleTimeString('pt-BR'),
          message,
          kind,
        },
        ...prev,
      ].slice(0, 12)
    );
  }, []);

  // Conecta ao broker quando a bancada e as configurações estiverem prontas.
  const deviceName = bancada?.deviceName;
  useEffect(() => {
    if (!deviceName || !settings) return;
    const p = new BenchPublisher(settings, {
      onState: (state, detail) => {
        setConexao(state);
        setConexaoDetalhe(detail);
      },
    });
    publisher.current = p;
    p.connect(deviceName);
    return () => {
      p.disconnect();
      publisher.current = null;
    };
  }, [deviceName, settings]);

  // Semeia a contagem local com o que o backend já sabe, uma vez só.
  useEffect(() => {
    if (semeadoPara.current === deviceId || !bancada || bancada.currentQty === null) return;
    semeadoPara.current = deviceId;
    setPacotes(bancada.currentQty);
  }, [bancada, deviceId]);

  const spec = bancada ? unitSpec(bancada) : null;
  const maxPacotes = settings?.maxPackages ?? 6;

  const mover = useCallback(
    (delta: number) => {
      const proximo = Math.min(maxPacotes, Math.max(0, pacotes + delta));
      if (proximo === pacotes) return;
      setPacotes(proximo);

      const kg = weightForPackages(proximo, spec) / 1000;
      const publicado = publisher.current?.publishWeight(kg) ?? false;
      const acao = delta > 0 ? `Reposição · +${delta}` : `Retirada · ${delta}`;
      registrar(
        publicado
          ? `${acao} — ${proximo} pacotes · publicado ${kg.toLocaleString('pt-BR')} kg`
          : `${acao} — ${proximo} pacotes · NÃO publicado (broker fora)`,
        publicado ? (delta > 0 ? 'up' : 'down') : 'warn'
      );
    },
    [pacotes, maxPacotes, spec, registrar]
  );

  /**
   * A régua e o selo de confiança medem a leitura que o *backend* recebeu, não
   * o peso que a bancada acabou de simular. O peso simulado cai sempre em cima
   * do degrau por construção — medi-lo seria um instrumento que nunca acusa
   * nada. O que interessa é onde a leitura real caiu em relação ao degrau.
   */
  const leitura = useMemo(() => {
    if (!bancada || bancada.currentWeightG === null) return null;
    return packagesFromWeight(bancada.currentWeightG - bancada.tareG, spec);
  }, [bancada, spec]);

  if (loading || !settings) return <Skeleton style={{ height: 480 }} />;

  if (!bancada) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Bancada não encontrada" backHref="/dashboard/bancadas" backLabel="Bancadas" />
        <EmptyState icon={<X size={28} />} title="Esse dispositivo não está mais na lista" />
      </div>
    );
  }

  const mudo =
    bancada.deviceStatus !== 'online' ||
    !bancada.lastSeenAt ||
    now - new Date(bancada.lastSeenAt).getTime() > STALE_AFTER_MS;
  const noAr = conexao === 'online';
  const pesoKg = weightForPackages(pacotes, spec) / 1000;
  // A prateleira é a autoridade sobre a própria suspeita: o backend já
  // aplicou a tolerância. O cálculo local só serve para dizer *quanto* faltou.
  const suspeita = bancada.suspect || (leitura?.suspect ?? false);

  const elos: ChainLink[] = [
    { label: 'Células', state: 'ok', hint: 'peso simulado no navegador' },
    { label: 'HX711', state: noAr ? 'ok' : 'unknown', hint: 'espelhado pela bancada' },
    { label: 'ESP32', state: mudo ? 'bad' : 'ok', hint: `dispositivo ${bancada.deviceStatus}` },
    { label: 'MQTT', state: noAr ? 'ok' : 'bad', hint: settings.brokerUrl },
    {
      label: 'Backend',
      state: bancada.slotId ? 'ok' : 'bad',
      hint: bancada.slotId ? 'prateleira vinculada' : 'prateleira não configurada',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Monitoramento"
        subtitle={`${bancada.deviceName} · ${bancada.productName ?? 'sem produto vinculado'}`}
        backHref={`/dashboard/bancadas/${deviceId}`}
        backLabel="Detalhe"
        live={{ ok: noAr && !error, label: conexaoLabel(conexao) }}
      />

      {/* Os dois números que importam: o que a tela calcula e o que o backend
          confirma. Divergiram, achou o problema. */}
      <div className="mb-6 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: muted(40) }}>
            Peso na balança
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-heading text-[54px] leading-none tabular-nums"
              style={{ letterSpacing: '-.03em' }}
            >
              {pesoKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-[15px]" style={{ color: muted(50) }}>
              kg
            </span>
          </div>
          <div className="text-[11px]" style={{ color: muted(40) }}>
            {(pesoKg * 1000).toLocaleString('pt-BR')} g líquido · {pacotes} de {maxPacotes} na
            bandeja
          </div>
        </div>

        <div className="flex-1" />

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: muted(40) }}>
            Backend confirma
          </div>
          <div
            className="font-heading text-[34px] leading-tight tabular-nums"
            style={{ color: 'var(--color-accent-300)' }}
          >
            {bancada.currentQty ?? '—'}
          </div>
          <div className="text-[11px]" style={{ color: muted(40) }}>
            {bancada.productName ?? 'sem produto'}
            {bancada.minQty !== null && ` · mínimo ${bancada.minQty}`}
          </div>
        </div>
      </div>

      <TrustBadge
        suspect={suspeita}
        noSpec={spec === null}
        semLeitura={leitura === null}
        residualG={leitura?.residualG ?? 0}
      />

      <section className="mb-7 mt-7">
        <SectionHeader title="Régua peso → pacotes · leitura do backend" />
        <WeightRuler
          maxPackages={maxPacotes}
          spec={spec}
          count={leitura?.count ?? null}
          rawUnits={leitura?.rawUnits ?? null}
          suspect={suspeita}
        />
      </section>

      <div className="mb-7 flex gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-[46px] flex-1"
          onClick={() => mover(1)}
          disabled={pacotes >= maxPacotes}
        >
          <Plus size={16} />
          Colocar pacote
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-[46px] flex-1"
          onClick={() => mover(-1)}
          disabled={pacotes <= 0}
        >
          <Minus size={16} />
          Tirar pacote
        </button>
      </div>

      {!noAr && (
        <p
          className="mb-7 rounded-md px-3.5 py-3 text-[13px]"
          style={{
            background: tint('var(--color-warn)', 8),
            border: `1px solid ${tint('var(--color-warn)', 30)}`,
            color: muted(75),
          }}
        >
          {conexao === 'connecting'
            ? `Conectando a ${settings.brokerUrl}…`
            : `Sem conexão com ${settings.brokerUrl}${conexaoDetalhe ? ` (${conexaoDetalhe})` : ''}. Os botões mudam o peso na tela, mas nada sai para o broker — o backend continuará mostrando a contagem antiga. Confira o broker em Ajustes.`}
        </p>
      )}

      <section className="mb-7">
        <SectionHeader title="Cadeia do sinal" />
        <SignalChain links={elos} />
        <p className="mt-2 text-[11px]" style={{ color: muted(40) }}>
          Publicando em <code>{settings.dataTopicPrefix}{bancada.deviceName}</code>
        </p>
      </section>

      <section>
        <SectionHeader title="Eventos" />
        <EventLog events={eventos} />
      </section>
    </div>
  );
}

function conexaoLabel(state: ConnectionState): string {
  if (state === 'online') return 'Ao vivo';
  if (state === 'connecting') return 'Conectando';
  if (state === 'error') return 'Erro MQTT';
  return 'Desconectado';
}

/**
 * A frase que resume se dá para acreditar no número. Quatro casos, em ordem de
 * quem manda: sem produto → sem leitura → suspeita → confiável.
 */
function TrustBadge({
  suspect,
  noSpec,
  semLeitura,
  residualG,
}: {
  suspect: boolean;
  noSpec: boolean;
  semLeitura: boolean;
  residualG: number;
}) {
  const { label, color, ok } = noSpec
    ? {
        label: 'Sem produto vinculado — o backend não tem como contar',
        color: 'var(--color-off)',
        ok: false,
      }
    : semLeitura
      ? {
          label: 'Nenhuma leitura de peso chegou ainda',
          color: 'var(--color-off)',
          ok: false,
        }
      : suspect
        ? {
            label: `Fora do degrau (${Math.round(residualG)} g) — leitura suspeita`,
            color: 'var(--color-warn)',
            ok: false,
          }
        : { label: 'Peso confiável — o backend conta', color: 'var(--color-ok)', ok: true };

  const Icon = ok ? CheckCircle : Warning;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-heading text-[13px]"
      style={{ color, background: tint(color, 10), border: `1px solid ${tint(color, 35)}` }}
      role="status"
    >
      <Icon size={14} weight={ok ? 'fill' : 'regular'} aria-hidden />
      {label}
    </span>
  );
}
