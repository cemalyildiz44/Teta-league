import NewsSection from "@/components/NewsSection";
import UpcomingMatches from "@/components/UpcomingMatches";
import MiniStats from "@/components/MiniStats";
import LiveStream from "@/components/LiveStream";
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
        
          {/* MAIN COLUMN: News, Matches, Stats */}
          <div className="space-y-12 xl:space-y-16">
            <NewsSection />
            <UpcomingMatches />
            <MiniStats />
          </div>

          {/* RIGHT SIDEBAR: Stream, Standings, Transfers, Social */}
          <div className="space-y-10 xl:space-y-12">
            <LiveStream />
            <Standings compact={true} />
            <RecentTransfers />
            <SocialFeed />
          </div>
        
        </div>
      </div>
    </div>
  );
}
