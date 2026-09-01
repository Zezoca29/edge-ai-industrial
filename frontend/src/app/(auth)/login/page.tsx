'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/services/apiClient';
import { muted } from '@/components/ui/primitives';

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="elev-md w-full max-w-sm rounded-lg p-8" style={{ background: 'var(--color-surface)' }}>
        <div className="text-[11px] uppercase tracking-[.12em]" style={{ color: muted(45) }}>
          PJI610 · Edge AI
        </div>
        <h4 className="mb-6 mt-1">Bancadas Interativas</h4>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="m-0 text-xs" style={{ color: 'var(--color-crit)' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary btn-block min-h-[42px]">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
