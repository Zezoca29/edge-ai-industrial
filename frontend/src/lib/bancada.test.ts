import { describe, expect, it } from 'vitest';
import { buildBancadas, deriveStatus, STALE_AFTER_MS, STATUS_META } from './bancada';
import type { Alert, Device, PickEvent, Product, ShelfSlot } from '@/types';

const NOW = new Date('2026-08-21T17:00:00Z').getTime();
const fresh = new Date(NOW - 30_000).toISOString();
const stale = new Date(NOW - STALE_AFTER_MS - 60_000).toISOString();

function device(over: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    name: 'wokwi-shelf-001',
    deviceType: 'shelf',
    firmwareVersion: '1.0.0',
    location: 'Corredor 3',
    status: 'online',
    lastSeenAt: fresh,
    createdAt: fresh,
    updatedAt: fresh,
    ...over,
  };
}

function slot(over: Partial<ShelfSlot> = {}): ShelfSlot {
  return {
    id: 'slot-1',
    deviceId: 'dev-1',
    slotIndex: 0,
    productId: 'prod-1',
    productName: 'Arroz 5 kg',
    tareG: 0,
    minQty: 3,
    currentQty: 8,
    currentWeightG: 40000,
    suspect: false,
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Arroz 5 kg',
    sku: 'ARZ5',
    unitWeightG: 5000,
    toleranceG: 500,
    defaultMinQty: 3,
    unitPriceCents: 2490,
    active: true,
    ...over,
  };
}

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    deviceId: 'dev-1',
    deviceName: 'wokwi-shelf-001',
    alertType: 'stock_low',
    severity: 'high',
    message: 'Arroz 5 kg: restam 2 unidades, mínimo 3',
    acknowledged: false,
    createdAt: fresh,
    resolvedAt: null,
    ...over,
  };
}

describe('deriveStatus', () => {
  it('bancada saudável com estoque acima do mínimo é operacional', () => {
    expect(deriveStatus({ device: device(), slot: slot(), alerts: [], now: NOW })).toBe('ok');
  });

  it('dispositivo offline vence tudo — sem sinal não dá para afirmar nada', () => {
    // Estoque zerado *e* offline: o que o operador precisa resolver primeiro
    // é o sinal, porque o zero pode ser leitura velha.
    const status = deriveStatus({
      device: device({ status: 'offline' }),
      slot: slot({ currentQty: 0 }),
      alerts: [alert()],
      now: NOW,
    });
    expect(status).toBe('off');
  });

  it('último sinal velho conta como offline mesmo com status online no banco', () => {
    expect(
      deriveStatus({ device: device({ lastSeenAt: stale }), slot: slot(), alerts: [], now: NOW })
    ).toBe('off');
  });

  it('dispositivo que nunca reportou é offline', () => {
    expect(
      deriveStatus({ device: device({ lastSeenAt: null }), slot: slot(), alerts: [], now: NOW })
    ).toBe('off');
  });

  it('telemetria fresca vence um device_silent que ainda não foi varrido', () => {
    // A varredura de silêncio do backend roda a cada minuto: um dispositivo
    // que acabou de voltar carrega o alerta velho por até um minuto. Marcá-lo
    // offline nesse intervalo é factualmente errado.
    const status = deriveStatus({
      device: device(),
      slot: slot(),
      alerts: [alert({ alertType: 'device_silent', severity: 'medium' })],
      now: NOW,
    });
    expect(status).toBe('ok');
  });

  it('um device_silent velho não pode esconder uma prateleira vazia', () => {
    // O caso que apareceu rodando ao vivo: publiquei 0 kg, o slot zerou, e o
    // alerta de silêncio ainda aberto pintava a bancada de offline — deixando
    // invisível a única coisa que exigia ação.
    const status = deriveStatus({
      device: device(),
      slot: slot({ currentQty: 0 }),
      alerts: [alert({ alertType: 'device_silent', severity: 'medium' })],
      now: NOW,
    });
    expect(status).toBe('crit');
  });

  it('mas um dispositivo realmente mudo continua offline, alerta ou não', () => {
    const status = deriveStatus({
      device: device({ lastSeenAt: stale }),
      slot: slot({ currentQty: 0 }),
      alerts: [],
      now: NOW,
    });
    expect(status).toBe('off');
  });

  it('prateleira vazia é crítico — é venda perdida agora', () => {
    expect(
      deriveStatus({ device: device(), slot: slot({ currentQty: 0 }), alerts: [], now: NOW })
    ).toBe('crit');
  });

  it('estoque no mínimo é atenção, não crítico', () => {
    expect(
      deriveStatus({ device: device(), slot: slot({ currentQty: 3 }), alerts: [], now: NOW })
    ).toBe('warn');
  });

  it('leitura suspeita é atenção mesmo com estoque cheio', () => {
    expect(
      deriveStatus({ device: device(), slot: slot({ suspect: true }), alerts: [], now: NOW })
    ).toBe('warn');
  });

  it('alerta stock_low aberto é atenção', () => {
    expect(deriveStatus({ device: device(), slot: slot(), alerts: [alert()], now: NOW })).toBe(
      'warn'
    );
  });

  it('alerta já resolvido não afeta o estado', () => {
    const status = deriveStatus({
      device: device(),
      slot: slot(),
      alerts: [alert({ resolvedAt: fresh })],
      now: NOW,
    });
    expect(status).toBe('ok');
  });

  it('dispositivo online sem prateleira configurada não é crítico por falta de dado', () => {
    expect(deriveStatus({ device: device(), slot: null, alerts: [], now: NOW })).toBe('ok');
  });
});

describe('STATUS_META', () => {
  it('cobre os quatro estados com rótulo e ordem de prioridade', () => {
    const keys = ['crit', 'warn', 'off', 'ok'] as const;
    keys.forEach((k) => expect(STATUS_META[k].label).toBeTruthy());
    // Crítico primeiro, operacional por último: é a ordem da lista.
    const ranks = keys.map((k) => STATUS_META[k].rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('buildBancadas', () => {
  const pick = (over: Partial<PickEvent> = {}): PickEvent => ({
    time: fresh,
    deviceId: 'dev-1',
    deviceName: 'wokwi-shelf-001',
    productName: 'Arroz 5 kg',
    quantity: 1,
    weightDeltaKg: -5,
    confidence: 0.98,
    ...over,
  });

  it('junta dispositivo, prateleira, produto, alertas e retiradas numa bancada', () => {
    const [b] = buildBancadas({
      devices: [device()],
      slots: [slot()],
      products: [product()],
      alerts: [alert()],
      picks: [pick(), pick({ quantity: 2 })],
      now: NOW,
    });

    expect(b.deviceName).toBe('wokwi-shelf-001');
    expect(b.productName).toBe('Arroz 5 kg');
    expect(b.unitWeightG).toBe(5000);
    expect(b.toleranceG).toBe(500);
    expect(b.alerts).toHaveLength(1);
    expect(b.picks24h).toBe(3);
    expect(b.status).toBe('warn');
  });

  it('mantém um dispositivo sem prateleira na lista, em vez de sumir com ele', () => {
    const [b] = buildBancadas({
      devices: [device()],
      slots: [],
      products: [],
      alerts: [],
      picks: [],
      now: NOW,
    });
    expect(b.slotId).toBeNull();
    expect(b.currentQty).toBeNull();
    expect(b.productName).toBeNull();
  });

  it('não atribui a uma bancada o alerta nem a retirada de outro dispositivo', () => {
    const [b] = buildBancadas({
      devices: [device()],
      slots: [slot()],
      products: [product()],
      alerts: [alert({ deviceId: 'outro' })],
      picks: [pick({ deviceId: 'outro' })],
      now: NOW,
    });
    expect(b.alerts).toHaveLength(0);
    expect(b.picks24h).toBe(0);
  });

  it('ordena por prioridade: crítico, atenção, offline, operacional', () => {
    const bancadas = buildBancadas({
      devices: [
        device({ id: 'a', name: 'ok' }),
        device({ id: 'b', name: 'vazia' }),
        device({ id: 'c', name: 'muda', lastSeenAt: stale }),
        device({ id: 'd', name: 'baixa' }),
      ],
      slots: [
        slot({ id: 's-a', deviceId: 'a', currentQty: 9 }),
        slot({ id: 's-b', deviceId: 'b', currentQty: 0 }),
        slot({ id: 's-c', deviceId: 'c', currentQty: 9 }),
        slot({ id: 's-d', deviceId: 'd', currentQty: 2 }),
      ],
      products: [product()],
      alerts: [],
      picks: [],
      now: NOW,
    });

    expect(bancadas.map((b) => b.status)).toEqual(['crit', 'warn', 'off', 'ok']);
  });

  it('conta apenas as retiradas dentro da janela de 24 h', () => {
    const old = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const [b] = buildBancadas({
      devices: [device()],
      slots: [slot()],
      products: [product()],
      alerts: [],
      picks: [pick(), pick({ time: old, quantity: 10 })],
      now: NOW,
    });
    expect(b.picks24h).toBe(1);
  });
});
