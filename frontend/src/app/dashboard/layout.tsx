import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-48 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Edge AI</p>
        <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white py-1">
          Dispositivos
        </Link>
        <Link href="/dashboard/readings" className="text-sm text-gray-300 hover:text-white py-1">
          Leituras
        </Link>
        <Link href="/dashboard/anomalies" className="text-sm text-gray-300 hover:text-white py-1">
          Anomalias
        </Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
