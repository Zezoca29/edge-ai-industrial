const BASE_URL = '/api';

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
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const apiClient = {
  getDevices: () => request<import('@/types').Device[]>('/devices'),
  getLatestReadings: () => request<import('@/types').SensorReading[]>('/sensors/latest'),
  getReadings: (deviceId: string, from: string, to: string) =>
    request<import('@/types').SensorReading[]>(
      `/sensors/readings?deviceId=${deviceId}&from=${from}&to=${to}`
    ),
  getAnomalies: () => request<import('@/types').SensorReading[]>('/sensors/anomalies'),
  login: (email: string, password: string) =>
    request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};
