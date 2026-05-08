import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Edge AI Industrial',
  description: 'Monitoramento industrial com inferência em edge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
