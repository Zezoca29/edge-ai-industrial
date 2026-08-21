'use client';

import { useState } from 'react';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import { NavBar, NavRail } from '@/components/nav/NavShell';

/**
 * A casca do dashboard. O contador de alertas mora aqui porque é a única coisa
 * que precisa estar viva em toda tela — o resto cada página busca por si.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [openAlerts, setOpenAlerts] = useState(0);

  usePolling(() => {
    apiClient
      .getAlertCount()
      .then((r) => setOpenAlerts(r.open))
      .catch(() => setOpenAlerts(0));
  }, 15000);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavRail openAlerts={openAlerts} />
      <main className="noct-scroll min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6 lg:px-7 lg:pt-6">
        {children}
      </main>
      <NavBar openAlerts={openAlerts} />
    </div>
  );
}
