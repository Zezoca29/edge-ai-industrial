import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gôndola — Controle de Prateleira',
  description: 'Avisa quando o produto está acabando na prateleira.',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#14624A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
