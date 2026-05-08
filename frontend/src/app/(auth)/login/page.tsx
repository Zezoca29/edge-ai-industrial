'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/services/apiClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@edgeai.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await apiClient.login(email, password);
      localStorage.setItem('jwt_token', token);
      document.cookie = `jwt_token=${token}; path=/; max-age=86400`;
      router.push('/dashboard');
    } catch {
      setError('Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-white mb-6">Edge AI Industrial</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
