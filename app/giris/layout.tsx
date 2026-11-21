import type { Metadata } from 'next';

// Account pages have no content for search results; without their own metadata they showed the home
// page description as Google sitelinks.
export const metadata: Metadata = {
  title: 'Giriş Yap | TETA League',
  description: 'TETA League hesabına giriş yap.',
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
