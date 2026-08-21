'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/apiClient';

type State = 'unsupported' | 'idle' | 'enabled' | 'denied' | 'working';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushToggle() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.register('/sw.js').then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setState('enabled');
      })
    ).catch(() => setError('Não foi possível registrar o service worker.'));
  }, []);

  async function enable() {
    setError(null);
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await apiClient.getPushPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await apiClient.subscribePush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setState('enabled');
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError && err.status === 503) {
        setError('O servidor ainda não está configurado para enviar notificações. Avise o suporte.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('Este aparelho já está cadastrado para receber alertas de outra loja.');
      } else {
        setError('Não foi possível ativar os alertas neste aparelho.');
      }
    }
  }

  async function disable() {
    setError(null);
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiClient.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('idle');
    } catch {
      setError('Não foi possível desativar.');
      setState('enabled');
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm" style={{ color: 'color-mix(in srgb, var(--color-text) 50%, transparent)' }}>
        Este navegador não suporta notificações. Abra pelo Chrome no Android ou
        instale o app na tela de início do iPhone.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="text-sm" role="alert" style={{ color: 'var(--color-warn)' }}>
        As notificações foram bloqueadas neste aparelho. Para reativar, abra as
        configurações do navegador para este site e permita notificações.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'enabled' ? (
        <button
          onClick={disable}
          className="btn btn-secondary"
        >
          Desativar alertas neste aparelho
        </button>
      ) : (
        <button
          onClick={enable}
          disabled={state === 'working'}
          className="btn btn-primary"
        >
          {state === 'working' ? 'Ativando...' : 'Ativar alertas neste aparelho'}
        </button>
      )}
      {state === 'enabled' && (
        <span className="text-sm" style={{ color: 'var(--color-ok)' }}>Alertas ativos</span>
      )}
      {error && <p role="alert" className="w-full text-sm" style={{ color: 'var(--color-crit)' }}>{error}</p>}
    </div>
  );
}
