import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Inter servida pelo next/font: sem requisição a CDN em runtime e sem o
 * pisca-pisca de fonte que um `@import` traria. As duas variáveis alimentam
 * os tokens `--font-body`/`--font-heading` do design system.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Bancadas Interativas — Edge AI',
  description: 'Cada bancada é um circuito ao vivo: peso na balança, contagem no backend.',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#161826',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={inter.variable}
      style={
        {
          '--font-body': 'var(--font-inter), system-ui, sans-serif',
          '--font-heading': 'var(--font-inter), system-ui, sans-serif',
        } as React.CSSProperties
      }
    >
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
