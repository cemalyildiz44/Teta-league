import NewsSection from "@/components/NewsSection";
import UpcomingMatches from "@/components/UpcomingMatches";
import MiniStats from "@/components/MiniStats";
import Rewards from "@/components/Rewards";
import Standings from "@/components/Standings";
import RecentTransfers from "@/components/RecentTransfers";
import SocialFeed from "@/components/SocialFeed";
import Hero from "@/components/Hero";

export default async function Home() {
  return (
    <div className="w-full flex flex-col">
      <Hero />
      <div className="mx-auto max-w-[1500px] w-full px-4 lg:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px] gap-8 xl:gap-12">
        
          {/* MAIN COLUMN: MiniStats, News, Standings, UpcomingMatches */}
          <div className="space-y-12 xl:space-y-16">
            <MiniStats />
            <NewsSection />
            <Standings />
            <UpcomingMatches />
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
