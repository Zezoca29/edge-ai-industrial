export interface Device {
  id: string;
  name: string;
  deviceType: string;
  firmwareVersion: string | null;
  location: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SensorReading {
  time: string;
  deviceId: string;
  deviceName: string;
  sensorType: 'temperature' | 'vibration' | 'current' | 'weight';
  value: number;
  unit: string;
  classification: 'normal' | 'anomaly';
  anomalyScore: number;
}

export interface AnomalyRecord extends SensorReading {
  classification: 'anomaly';
}

export interface PickEvent {
  time: string;
  deviceId: string;
  deviceName: string;
  productName: string;
  quantity: number;
  weightDeltaKg: number;
  confidence: number;
}

export interface ProductDemand {
  productName: string;
  totalPicks: number;
  totalQuantity: number;
  lastPick: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  unitWeightG: number;
  toleranceG: number;
  /** Minimo de reposicao combinado na loja. Um slot adota este numero ao
   *  vincular o produto. `null` = sem numero combinado. */
  defaultMinQty: number | null;
  unitPriceCents: number | null;
  active: boolean;
}

export interface Alert {
  id: string;
  /** O dispositivo que levantou o alerta. E como a tela arquiva o alerta
   *  sob a bancada certa sem adivinhar pelo texto da mensagem. */
  deviceId: string;
  /** Null quando o dispositivo ja nao existe mais. */
  deviceName: string | null;
  alertType: 'stock_low' | 'device_silent';
  severity: 'high' | 'medium';
  message: string;
  acknowledged: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ShelfSlot {
  id: string;
  deviceId: string;
  slotIndex: number;
  productId: string | null;
  productName: string | null;
  tareG: number;
  minQty: number;
  currentQty: number | null;
  currentWeightG: number | null;
  suspect: boolean;
}
