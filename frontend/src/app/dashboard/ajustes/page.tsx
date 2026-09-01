'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CaretRight, FloppyDisk } from '@phosphor-icons/react';
import { Device, Product, ShelfSlot } from '@/types';
import { apiClient, ApiError } from '@/services/apiClient';
import {
  DEFAULT_BENCH_SETTINGS,
  loadBenchSettings,
  saveBenchSettings,
  type BenchSettings,
} from '@/services/benchSettings';
import { sinceLabel } from '@/lib/bancada';
import { ProductForm } from '@/components/ProductForm';
import { ShelfSlotTable } from '@/components/ShelfSlotTable';
import { PushToggle } from '@/components/PushToggle';
import { PageHeader } from '@/components/ui/PageHeader';
import { muted, SectionHeader, Skeleton } from '@/components/ui/primitives';

/**
 * Tudo que se configura uma vez e se esquece: onde a bancada publica, quais
 * produtos existem, o que está vinculado a cada prateleira e se este aparelho
 * recebe notificação.
 */
export default function AjustesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [slots, setSlots] = useState<ShelfSlot[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([apiClient.getProducts(), apiClient.getShelfSlots(), apiClient.getDevices()])
        .then(([p, s, d]) => {
          setProducts(p);
          setSlots(s);
          setDevices(d);
        })
        .catch(() => setActionError('Não foi possível carregar a configuração.'))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(body: Omit<Product, 'id'>) {
    await apiClient.createProduct(body);
    await reload();
  }

  function handleBind(slotId: string, productId: string | null, minQty: number | null) {
    setActionError(null);
    apiClient
      .updateShelfSlot(slotId, { productId, minQty })
      .then(reload)
      .catch(() => setActionError('Não foi possível atualizar a prateleira.'));
  }

  function handleTare(slotId: string) {
    setActionError(null);
    apiClient
      .tareShelfSlot(slotId)
      .then(reload)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          setActionError('Esta prateleira ainda não tem leitura de peso para tarar.');
        } else {
          setActionError('Não foi possível tarar a prateleira.');
        }
      });
  }

  const deviceNameFor = useCallback(
    (deviceId: string) => devices.find((d) => d.id === deviceId)?.name ?? deviceId.slice(0, 8),
    [devices]
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Ajustes" subtitle="Conexão, produtos, prateleiras e notificações" />

      {actionError && (
        <p role="alert" className="mb-5 text-sm" style={{ color: 'var(--color-crit)' }}>
          {actionError}
        </p>
      )}

      <BenchSettingsForm />

      <section className="mb-9">
        <SectionHeader title="Dispositivos vinculados" />
        {loading ? (
          <Skeleton style={{ height: 180 }} />
        ) : devices.length === 0 ? (
          <p className="text-sm" style={{ color: muted(50) }}>
            Nenhum dispositivo apareceu ainda. Um ESP32 se cadastra sozinho ao publicar no broker.
          </p>
        ) : (
          <div
            className="overflow-hidden rounded-md border"
            style={{ borderColor: 'var(--color-divider)' }}
          >
            {devices.map((d, i) => (
              <Link
                key={d.id}
                href={`/dashboard/bancadas/${d.id}`}
                className="flex items-center gap-2.5 px-3.5 py-3"
                style={{
                  borderBottom: i < devices.length - 1 ? '1px solid var(--color-divider)' : undefined,
                  color: 'var(--color-text)',
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: d.status === 'online' ? 'var(--color-ok)' : 'var(--color-off)',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.name}</span>
                  <span className="block truncate text-xs" style={{ color: muted(45) }}>
                    {d.deviceType} · {d.location ?? 'sem local'} · sinal{' '}
                    {sinceLabel(d.lastSeenAt, Date.now())}
                  </span>
                </span>
                <CaretRight size={14} style={{ color: muted(35) }} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-9">
        <SectionHeader title="Produtos" />
        {loading ? (
          <Skeleton style={{ height: 120 }} />
        ) : (
          <>
            <ProductForm onCreate={handleCreate} />
            <ul className="mt-4 flex list-none flex-col gap-1 p-0">
              {products.map((p) => (
                <li key={p.id} className="text-sm">
                  {p.name} — {p.unitWeightG.toLocaleString('pt-BR')} g por unidade
                  <span style={{ color: muted(45) }}>
                    {' '}
                    · tolerância {p.toleranceG} g
                    {p.defaultMinQty !== null && ` · repor com ${p.defaultMinQty}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mb-9">
        <SectionHeader title="Prateleiras" />
        {loading ? (
          <Skeleton style={{ height: 180 }} />
        ) : (
          <ShelfSlotTable
            slots={slots}
            products={products}
            onBind={handleBind}
            onTare={handleTare}
            deviceNameFor={deviceNameFor}
          />
        )}
      </section>

      <section>
        <SectionHeader title="Notificações neste aparelho" />
        <PushToggle />
      </section>
    </div>
  );
}

/**
 * O broker é o único endereço que a bancada do navegador precisa saber. Fica
 * editável porque a demo troca de broker (EMQX público em aula, um local no
 * laboratório) e recompilar para isso seria absurdo.
 */
function BenchSettingsForm() {
  const [settings, setSettings] = useState<BenchSettings | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setSettings(loadBenchSettings()), []);

  if (!settings) return <Skeleton style={{ height: 120 }} />;

  const set = <K extends keyof BenchSettings>(k: K, v: BenchSettings[K]) => {
    setSettings({ ...settings, [k]: v });
    setSalvo(false);
  };

  return (
    <section className="mb-9">
      <SectionHeader title="Conexão da bancada" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="broker">Broker MQTT (wss)</label>
          <input
            id="broker"
            className="input"
            spellCheck={false}
            value={settings.brokerUrl}
            onChange={(e) => set('brokerUrl', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="topic">Prefixo do tópico de dados</label>
          <input
            id="topic"
            className="input"
            spellCheck={false}
            value={settings.dataTopicPrefix}
            onChange={(e) => set('dataTopicPrefix', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="status-topic">Prefixo do tópico de presença</label>
          <input
            id="status-topic"
            className="input"
            spellCheck={false}
            value={settings.statusTopicPrefix}
            onChange={(e) => set('statusTopicPrefix', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="max-pkg">Pacotes que cabem na bandeja</label>
          <input
            id="max-pkg"
            className="input"
            type="number"
            min={1}
            max={50}
            value={settings.maxPackages}
            onChange={(e) => set('maxPackages', Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            saveBenchSettings(settings);
            setSalvo(true);
          }}
        >
          <FloppyDisk size={15} />
          Salvar conexão
        </button>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => {
            setSettings(DEFAULT_BENCH_SETTINGS);
            setSalvo(false);
          }}
        >
          Restaurar padrão
        </button>
        {salvo && (
          <span className="text-xs" style={{ color: 'var(--color-ok)' }}>
            Salvo neste navegador. Reabra a tela de monitoramento para reconectar.
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: muted(40) }}>
        O tópico final é o prefixo mais o nome do dispositivo — o mesmo que o{' '}
        <code>sketch.ino</code> publica.
      </p>
    </section>
  );
}
