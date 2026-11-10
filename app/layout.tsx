import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import NavigationProgress from "@/components/NavigationProgress";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { Suspense } from "react";

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

// The layout must not read cookies or headers: that would make every page dynamic. The Header loads the
// signed-in user's data client-side from /api/session.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="tr"
      className={`${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {/* Suspense: useSearchParams in a layout would otherwise opt static pages out of prerendering */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {/* Keyboard / screen-reader shortcut past the header; visible only while focused */}
        <a
          href="#icerik"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[130] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#00e5ff] focus:text-[#050a0f] focus:text-xs focus:font-black focus:uppercase focus:tracking-wider"
        >
          Ana içeriğe geç
        </a>
        <FeedbackProvider>
          <Header />
          <main id="icerik" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
          <Footer />
          <CookieBanner />
        </FeedbackProvider>
      </body>
    </html>
  );
}
