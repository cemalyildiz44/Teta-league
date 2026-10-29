import NewsSection from "@/components/NewsSection";
import UpcomingMatches from "@/components/UpcomingMatches";
import MiniStats from "@/components/MiniStats";
import Rewards from "@/components/Rewards";
import Standings from "@/components/Standings";
import RecentTransfers from "@/components/RecentTransfers";
import SocialFeed from "@/components/SocialFeed";
import Hero from "@/components/Hero";
import type { Metadata } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { buildOpenGraph, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: buildOpenGraph({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
};

export default async function Home() {
  const siteUrl = getCanonicalSiteUrl();
  // Only facts visible on the site: name, URL, logo and the official social accounts linked in the footer.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        logo: `${siteUrl}/logo.jpg`,
        description: HOME_DESCRIPTION,
        sameAs: ["https://kick.com/tetaleague", "https://www.instagram.com/teta.league/"],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: SITE_NAME,
        url: siteUrl,
        inLanguage: "tr-TR",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <div className="w-full flex flex-col page-enter">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero />
      <div className="mx-auto max-w-[1500px] w-full px-4 lg:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px] gap-8 xl:gap-12">
        
          {/* MAIN COLUMN: Standings, UpcomingMatches, MiniStats, News */}
          <div className="space-y-10 xl:space-y-12">
            <Standings />
            <UpcomingMatches />
            <MiniStats />
            <NewsSection />
          </div>

          {/* RIGHT SIDEBAR: Rewards, Transfers, Social */}
          <div className="space-y-10 xl:space-y-12">
            <Rewards />
            <RecentTransfers />
            <SocialFeed />
          </div>
        
        </div>
      </div>
    </div>
  );
}
