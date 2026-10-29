import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";

import { getCachedUser, getCachedHeaderData } from "@/lib/fetchers";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { DEFAULT_OG_IMAGE, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "@/lib/seo";

const exo2 = localFont({
  src: "./fonts/Exo2-VariableFont_wght.ttf",
  variable: "--font-sans",
  display: "swap",
  weight: "300 900",
});

// No canonical here: alternates are inherited, so a root canonical would point every page to "/".
export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    locale: "tr_TR",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: "summary" },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();

  let userProfile = null;
  let activeTeam = null;
  let unreadCount = 0;

  if (user) {
    const headerData = await getCachedHeaderData(user.id);
    userProfile = headerData.userProfile;
    activeTeam = headerData.activeTeam;
    unreadCount = headerData.unreadCount;
  }

  return (
    <html
      lang="tr"
      className={`${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Header user={user} userProfile={userProfile} activeTeam={activeTeam} unreadCount={unreadCount} />
        <main className="flex-1">{children}</main>
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
