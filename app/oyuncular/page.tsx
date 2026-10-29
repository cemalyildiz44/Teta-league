import { Metadata } from 'next';
import PlayerRankingsClient from './PlayerRankingsClient';
import { getCachedPlayerRankings } from './rankings';

export const metadata: Metadata = {
  title: 'Oyuncular Sıralaması | TETA League',
  description: 'TETA League tarihindeki en değerli oyuncular. Oyuncu piyasa değeri sıralaması.',
  alternates: { canonical: '/oyuncular' },
};

export const revalidate = 60; // 1 min cache

export default async function PlayersPage() {
  const rankingsArray = await getCachedPlayerRankings();

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      {/* PAGE HEADER */}
      <div className="mb-12 md:mb-16 text-center fade-in-up flex flex-col items-center">
        <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-6 glow-cyan-strong shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          All-Time Leaderboard
        </span>
        <h1 className="text-[42px] md:text-[64px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
          OYUNCULAR
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[17px] leading-relaxed">
          TETA League tarihindeki en değerli oyuncular.
        </p>
      </div>

      <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
        <PlayerRankingsClient rankings={rankingsArray} />
      </div>
    </div>
  );
}
