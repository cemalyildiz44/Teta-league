import type { Metadata } from 'next';

// See app/giris/layout.tsx
export const metadata: Metadata = {
  title: 'Kayıt Ol | TETA League',
  description: 'TETA League hesabı oluştur.',
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
