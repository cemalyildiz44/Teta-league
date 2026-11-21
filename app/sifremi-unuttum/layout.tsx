import type { Metadata } from 'next';

// See app/giris/layout.tsx
export const metadata: Metadata = {
  title: 'Şifremi Unuttum | TETA League',
  description: 'TETA League hesabının şifresini sıfırla.',
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
