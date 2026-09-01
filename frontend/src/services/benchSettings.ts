'use client';

/**
 * Onde a bancada do navegador publica. São os mesmos campos que a
 * `wokwi/shelf/bancada-interativa.html` expõe, agora editáveis em Ajustes e
 * persistidos por navegador — deixar isso hardcoded significaria recompilar
 * para apontar a demo para outro broker.
 */
export interface BenchSettings {
  brokerUrl: string;
  /** Prefixo do tópico de dados; o nome do dispositivo é concatenado. */
  dataTopicPrefix: string;
  /** Prefixo do tópico de presença. */
  statusTopicPrefix: string;
  /** Quantos pacotes cabem na bandeja da bancada simulada. */
  maxPackages: number;
}

export const DEFAULT_BENCH_SETTINGS: BenchSettings = {
  brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
  dataTopicPrefix: 'sensor/data/',
  statusTopicPrefix: 'device/status/',
  maxPackages: 6,
};

const KEY = 'bench_settings';

export function loadBenchSettings(): BenchSettings {
  if (typeof window === 'undefined') return DEFAULT_BENCH_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BENCH_SETTINGS;
    // Merge sobre os defaults: uma chave nova adicionada depois não invalida
    // o que o usuário já salvou.
    return { ...DEFAULT_BENCH_SETTINGS, ...(JSON.parse(raw) as Partial<BenchSettings>) };
  } catch {
    return DEFAULT_BENCH_SETTINGS;
  }
}

export function saveBenchSettings(settings: BenchSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('bench-settings-changed'));
}
