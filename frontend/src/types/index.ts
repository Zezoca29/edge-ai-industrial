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
  sensorType: 'temperature' | 'vibration' | 'current';
  value: number;
  unit: string;
  classification: 'normal' | 'anomaly';
  anomalyScore: number;
}

export interface AnomalyRecord extends SensorReading {
  classification: 'anomaly';
}
