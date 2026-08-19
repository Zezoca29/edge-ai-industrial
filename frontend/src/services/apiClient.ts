const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`API error: ${status}`);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jwt_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('jwt_token');
    document.cookie = 'jwt_token=; max-age=0; path=/';
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new ApiError(res.status);

  // Several endpoints (acknowledge, subscribe, unsubscribe, ping) return
  // `void` on the backend, which Spring answers as 200/204 with an empty
  // body. `res.json()` throws SyntaxError on an empty body, so read as text
  // first and only parse when there is actually something to parse. Do not
  // "simplify" this back to `res.json()`.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const apiClient = {
  getDevices: () => request<import('@/types').Device[]>('/devices'),
  getLatestReadings: () => request<import('@/types').SensorReading[]>('/sensors/latest'),
  getRecentReadings: (minutes = 60) => request<import('@/types').SensorReading[]>(`/sensors/recent?minutes=${minutes}`),
  getReadings: (deviceId: string, from: string, to: string) =>
    request<import('@/types').SensorReading[]>(
      `/sensors/readings?deviceId=${deviceId}&from=${from}&to=${to}`
    ),
  getAnomalies: () => request<import('@/types').SensorReading[]>('/sensors/anomalies'),
  getRecentPicks: (hours = 24) =>
    request<import('@/types').PickEvent[]>(`/picks/recent?hours=${hours}`),
  getProductDemand: (hours = 168) =>
    request<import('@/types').ProductDemand[]>(`/picks/demand?hours=${hours}`),
  pingDevice: (name: string) =>
    request<void>(`/devices/${encodeURIComponent(name)}/ping`, { method: 'POST' }),
  login: (email: string, password: string) =>
    request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getProducts: () => request<import('@/types').Product[]>('/products'),
  createProduct: (body: Omit<import('@/types').Product, 'id'>) =>
    request<import('@/types').Product>('/products', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProduct: (id: string, body: Omit<import('@/types').Product, 'id'>) =>
    request<import('@/types').Product>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getShelfSlots: () => request<import('@/types').ShelfSlot[]>('/shelf-slots'),
  updateShelfSlot: (id: string, body: { productId: string | null; minQty: number }) =>
    request<import('@/types').ShelfSlot>(`/shelf-slots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  tareShelfSlot: (id: string) =>
    request<import('@/types').ShelfSlot>(`/shelf-slots/${id}/tare`, { method: 'POST' }),
  getAlerts: (onlyOpen = true) =>
    request<import('@/types').Alert[]>(`/alerts?onlyOpen=${onlyOpen}`),
  getAlertCount: () => request<{ open: number }>('/alerts/count'),
  acknowledgeAlert: (id: string) =>
    request<void>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  getPushPublicKey: () => request<{ publicKey: string }>('/push/public-key'),
  subscribePush: (body: { endpoint: string; p256dh: string; auth: string }) =>
    request<void>('/push/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  unsubscribePush: (endpoint: string) =>
    request<void>(`/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }),
};
