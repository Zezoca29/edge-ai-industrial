import type { Alert, Device, PickEvent, Product, ShelfSlot } from '@/types';

/**
 * A "bancada" é a unidade que o operador enxerga: um dispositivo, a prateleira
 * pendurada nele, o produto vinculado e o que aconteceu ali nas últimas horas.
 * O backend guarda essas quatro coisas em tabelas separadas, e com razão. Esta
 * camada as junta uma vez só, para que nenhuma tela precise refazer a junção —
 * e para que a semântica de cor viva num lugar só.
 */

export type BancadaStatus = 'ok' | 'warn' | 'crit' | 'off';

/** Sem sinal por mais tempo que isto e a bancada conta como muda.
 *  Casa com `alerts.device-silence-minutes` (10) do backend. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

const PICK_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface StatusMeta {
  label: string;
  /** Token CSS — o mesmo que globals.css publica. */
  color: string;
  /** Ordem de urgência na lista: menor aparece primeiro. */
  rank: number;
}

export const STATUS_META: Record<BancadaStatus, StatusMeta> = {
  crit: { label: 'Crítico', color: 'var(--color-crit)', rank: 0 },
  warn: { label: 'Atenção', color: 'var(--color-warn)', rank: 1 },
  off: { label: 'Offline', color: 'var(--color-off)', rank: 2 },
  ok: { label: 'Operacional', color: 'var(--color-ok)', rank: 3 },
};

export interface Bancada {
  deviceId: string;
  deviceName: string;
  location: string | null;
  status: BancadaStatus;
  deviceStatus: string;
  lastSeenAt: string | null;

  slotId: string | null;
  productId: string | null;
  productName: string | null;
  /** Peso unitário e tolerância do produto, ou null sem produto vinculado. */
  unitWeightG: number | null;
  toleranceG: number | null;
  tareG: number;
  minQty: number | null;
  currentQty: number | null;
  currentWeightG: number | null;
  suspect: boolean;

  alerts: Alert[];
  picks24h: number;
}

function isOpen(a: Alert): boolean {
  return a.resolvedAt === null;
}

function isSilent(device: Device, now: number): boolean {
  if (device.status !== 'online') return true;
  if (!device.lastSeenAt) return true;
  return now - new Date(device.lastSeenAt).getTime() > STALE_AFTER_MS;
}

export interface StatusInput {
  device: Device;
  slot: ShelfSlot | null;
  alerts: Alert[];
  now: number;
}

/**
 * A ordem é deliberada. Offline vem antes de tudo porque, sem sinal, qualquer
 * número na tela é uma leitura velha — mandar o lojista à gôndola por causa de
 * um zero que talvez seja de meia hora atrás é pior do que dizer "não sei".
 * Depois vem prateleira vazia (venda perdida agora), depois estoque no mínimo
 * ou leitura suspeita.
 */
export function deriveStatus({ device, slot, alerts, now }: StatusInput): BancadaStatus {
  const open = alerts.filter(isOpen);

  // Só `lastSeenAt` decide se a bancada está muda — um `device_silent` aberto
  // não. O alerta é a opinião do backend sobre o mesmo fato, e ela chega
  // atrasada: a varredura de silêncio roda a cada minuto, então um alerta
  // ainda não resolvido continua de pé por até um minuto depois de o
  // dispositivo voltar a publicar. Deixar esse alerta mandar significa
  // escrever "offline" sobre um dispositivo que falou meio segundo atrás — e,
  // pior, esconder atrás disso uma prateleira vazia. O alerta continua na
  // lista de alertas, que é o registro; o estado é o agora.
  if (isSilent(device, now)) {
    return 'off';
  }
  if (slot && slot.currentQty === 0) {
    return 'crit';
  }
  if (slot?.suspect) {
    return 'warn';
  }
  if (slot && slot.currentQty !== null && slot.currentQty <= slot.minQty) {
    return 'warn';
  }
  if (open.some((a) => a.alertType === 'stock_low')) {
    return 'warn';
  }
  return 'ok';
}

export interface BuildInput {
  devices: Device[];
  slots: ShelfSlot[];
  products: Product[];
  alerts: Alert[];
  picks: PickEvent[];
  now: number;
}

export function buildBancadas({
  devices,
  slots,
  products,
  alerts,
  picks,
  now,
}: BuildInput): Bancada[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  // Um dispositivo pode ter vários slots; a bancada é representada pelo
  // primeiro (slotIndex mais baixo), que é o caso real do projeto.
  const slotByDevice = new Map<string, ShelfSlot>();
  [...slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .forEach((s) => {
      if (!slotByDevice.has(s.deviceId)) slotByDevice.set(s.deviceId, s);
    });

  const cutoff = now - PICK_WINDOW_MS;

  return devices
    .map<Bancada>((device) => {
      const slot = slotByDevice.get(device.id) ?? null;
      const product = slot?.productId ? (productById.get(slot.productId) ?? null) : null;
      const mine = alerts.filter((a) => a.deviceId === device.id);

      return {
        deviceId: device.id,
        deviceName: device.name,
        location: device.location,
        status: deriveStatus({ device, slot, alerts: mine, now }),
        deviceStatus: device.status,
        lastSeenAt: device.lastSeenAt,

        slotId: slot?.id ?? null,
        productId: slot?.productId ?? null,
        productName: slot?.productName ?? null,
        unitWeightG: product?.unitWeightG ?? null,
        toleranceG: product?.toleranceG ?? null,
        tareG: slot?.tareG ?? 0,
        minQty: slot?.minQty ?? null,
        currentQty: slot?.currentQty ?? null,
        currentWeightG: slot?.currentWeightG ?? null,
        suspect: slot?.suspect ?? false,

        alerts: mine.filter(isOpen),
        picks24h: picks
          .filter((p) => p.deviceId === device.id && new Date(p.time).getTime() >= cutoff)
          .reduce((sum, p) => sum + p.quantity, 0),
      };
    })
    .sort(
      (a, b) =>
        STATUS_META[a.status].rank - STATUS_META[b.status].rank ||
        a.deviceName.localeCompare(b.deviceName, 'pt-BR')
    );
}

/** Espec de peso do produto, no formato que `lib/weight` espera. */
export function unitSpec(b: Bancada): { unitWeightG: number; toleranceG: number } | null {
  if (b.unitWeightG === null || b.unitWeightG <= 0) return null;
  return { unitWeightG: b.unitWeightG, toleranceG: b.toleranceG ?? 0 };
}

export function countByStatus(bancadas: Bancada[]): Record<BancadaStatus, number> {
  const counts: Record<BancadaStatus, number> = { ok: 0, warn: 0, crit: 0, off: 0 };
  bancadas.forEach((b) => counts[b.status]++);
  return counts;
}

/** "há 12 s", "há 4 min" — o tempo desde o último sinal, em português curto. */
export function sinceLabel(iso: string | null, now: number): string {
  if (!iso) return 'nunca';
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
