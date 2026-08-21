'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/services/apiClient';
import { buildBancadas, type Bancada } from '@/lib/bancada';
import type { Alert, Device, PickEvent, Product, ShelfSlot } from '@/types';

/**
 * A fonte única de dados do dashboard: uma lista de bancadas já montada a
 * partir dos cinco recursos que o backend expõe.
 *
 * Fica em polling porque é o que o backend oferece hoje (sem WebSocket/SSE).
 * O que ele *não* faz é buscar as cinco coisas na mesma cadência: dispositivo
 * e prateleira mudam a cada leitura de peso e são o que a tela de
 * monitoramento precisa ver em 2 s; produto, alerta e retirada mudam em escala
 * de minutos. Puxar os cinco a 2 s seriam 150 requisições por minuto para
 * atualizar dois números.
 */

/** Piso da cadência dos recursos que mudam devagar. */
const SLOW_MIN_MS = 10000;

interface FastData {
  devices: Device[];
  slots: ShelfSlot[];
}

interface SlowData {
  products: Product[];
  alerts: Alert[];
  picks: PickEvent[];
}

export interface BancadasState {
  bancadas: Bancada[];
  alerts: Alert[];
  products: Product[];
  slots: ShelfSlot[];
  devices: Device[];
  /** true só até a primeira resposta; um refresh de polling não pisca a tela. */
  loading: boolean;
  error: string | null;
  /** Momento da última rodada, para os rótulos "há N s". */
  now: number;
  refresh: () => void;
}

export function useBancadas(intervalMs = 10000): BancadasState {
  const [fast, setFast] = useState<FastData>({ devices: [], slots: [] });
  const [slow, setSlow] = useState<SlowData>({ products: [], alerts: [], picks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Um fetch em voo não deve escrever no estado depois que a tela saiu.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadFast = useCallback(async () => {
    try {
      const [devices, slots] = await Promise.all([
        apiClient.getDevices(),
        apiClient.getShelfSlots(),
      ]);
      if (!alive.current) return;
      setFast({ devices, slots });
      setNow(Date.now());
      setError(null);
    } catch {
      // Mantém os dados anteriores na tela: um blip de rede não deve apagar
      // o que o operador estava olhando.
      if (alive.current) setError('Não foi possível falar com o backend.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  const loadSlow = useCallback(async () => {
    try {
      const [products, alerts, picks] = await Promise.all([
        apiClient.getProducts(),
        apiClient.getAlerts(true),
        apiClient.getRecentPicks(24),
      ]);
      if (alive.current) setSlow({ products, alerts, picks });
    } catch {
      // O erro já é reportado pela camada rápida; não duplicar o aviso.
    }
  }, []);

  useEffect(() => {
    loadFast();
    const id = setInterval(loadFast, intervalMs);
    return () => clearInterval(id);
  }, [loadFast, intervalMs]);

  useEffect(() => {
    loadSlow();
    const id = setInterval(loadSlow, Math.max(intervalMs, SLOW_MIN_MS));
    return () => clearInterval(id);
  }, [loadSlow, intervalMs]);

  const refresh = useCallback(() => {
    loadFast();
    loadSlow();
  }, [loadFast, loadSlow]);

  return {
    bancadas: buildBancadas({ ...fast, ...slow, now }),
    alerts: slow.alerts,
    products: slow.products,
    slots: fast.slots,
    devices: fast.devices,
    loading,
    error,
    now,
    refresh,
  };
}

/** Uma bancada só, pelo id do dispositivo. */
export function useBancada(deviceId: string, intervalMs = 2000) {
  const state = useBancadas(intervalMs);
  const bancada = state.bancadas.find((b) => b.deviceId === deviceId) ?? null;
  return { ...state, bancada };
}
