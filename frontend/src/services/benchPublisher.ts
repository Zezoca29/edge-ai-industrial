'use client';

import mqtt, { type MqttClient } from 'mqtt';
import type { BenchSettings } from './benchSettings';

/**
 * A bancada do navegador: publica peso no mesmo tópico e com o mesmo payload
 * que o `sketch.ino` do ESP32 publica.
 *
 * Isto é o que torna cada bancada cadastrada um circuito manipulável. O
 * backend não sabe — nem precisa saber — se o peso veio daqui, do Wokwi ou de
 * uma célula de carga real: os três falam o mesmo contrato. Trocar o peso aqui
 * e ver a contagem do backend responder é exatamente a prova de que a cadeia
 * inteira está de pé.
 */

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'error' | 'offline';

export interface PublisherEvents {
  onState: (state: ConnectionState, detail?: string) => void;
}

export interface SensorPayload {
  device_id: string;
  timestamp: string;
  sensors: {
    weight: { value: number; unit: 'kg' };
    weight_stable: boolean;
  };
  inference: {
    classification: 'normal';
    anomaly_score: number;
    model_version: string;
  };
}

const MODEL_VERSION = 'bancada-web';

export function buildSensorPayload(deviceName: string, kg: number): SensorPayload {
  return {
    device_id: deviceName,
    timestamp: new Date().toISOString(),
    sensors: {
      // O firmware publica em kg; a bancada faz igual para que o backend
      // exercite o mesmo caminho de conversão.
      weight: { value: kg, unit: 'kg' },
      weight_stable: true,
    },
    inference: { classification: 'normal', anomaly_score: 0, model_version: MODEL_VERSION },
  };
}

export class BenchPublisher {
  private client: MqttClient | null = null;
  private deviceName: string | null = null;

  constructor(
    private settings: BenchSettings,
    private events: PublisherEvents
  ) {}

  connect(deviceName: string): void {
    this.disconnect();
    this.deviceName = deviceName;
    this.events.onState('connecting');

    const client = mqtt.connect(this.settings.brokerUrl, {
      clientId: `bancada-${Math.random().toString(16).slice(2, 8)}`,
      connectTimeout: 8000,
      reconnectPeriod: 3000,
    });
    this.client = client;

    client.on('connect', () => {
      this.events.onState('online', deviceName);
      client.publish(
        `${this.settings.statusTopicPrefix}${deviceName}`,
        JSON.stringify({
          device_id: deviceName,
          status: 'online',
          firmware_version: MODEL_VERSION,
        })
      );
    });
    client.on('error', (err) => this.events.onState('error', err.message));
    client.on('close', () => this.events.onState('offline'));
  }

  /** @returns true se o peso realmente saiu para o broker. */
  publishWeight(kg: number): boolean {
    if (!this.client?.connected || !this.deviceName) return false;
    this.client.publish(
      `${this.settings.dataTopicPrefix}${this.deviceName}`,
      JSON.stringify(buildSensorPayload(this.deviceName, kg))
    );
    return true;
  }

  disconnect(): void {
    if (!this.client) return;
    try {
      this.client.end(true);
    } catch {
      // Fechar um socket já morto não é um erro que o operador precise ver.
    }
    this.client = null;
  }
}
