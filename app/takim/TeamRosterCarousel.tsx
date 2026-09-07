"use client";

import { useRef } from 'react';
import Link from 'next/link';

type PlayerStat = {
  matches: number;
  goals: number;
  assists: number;
  avgRating: string;
};

type RosterPlayer = {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  ea_character_url?: string | null;
  primary_position?: string | null;
  alternative_positions?: string[] | null;
  current_ea_player_id?: string | null;
  role?: string;
  joined_at: string;
  stats: PlayerStat;
};

export default function TeamRosterCarousel({ players }: { players: RosterPlayer[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  if (!players || players.length === 0) {
    return (
      <div className="empty-state !py-12 border border-white/5">
        <span className="empty-state-title text-[15px]">Kadro Boş</span>
        <span className="empty-state-desc text-[13px]">Bu takımın henüz kayıtlı oyuncusu bulunmuyor.</span>
      </div>
    );
  }

  return (
    <div className="relative group">
      
      {/* Scroll Controls */}
      <button 
        onClick={scrollLeft}
        className="absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-[#03070c] border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.2)] opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>

      <button 
        onClick={scrollRight}
        className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-[#03070c] border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.2)] opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>

      {/* Carousel Container */}
      <div 
        ref={scrollRef}
        className="flex overflow-x-auto gap-4 md:gap-6 pb-6 pt-2 px-2 snap-x snap-mandatory custom-scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {players.map((p) => (
          <Link 
            href={`/oyuncular/${p.username}`} 
            key={p.id}
            className="shrink-0 w-[240px] md:w-[260px] snap-center group/card cursor-pointer"
          >
            <div className="relative h-[380px] rounded-2xl overflow-hidden bg-[#03070c] border border-white/10 group-hover/card:border-[#00e5ff]/50 transition-all duration-500 shadow-[0_4px_20px_rgba(0,0,0,0.5)] group-hover/card:shadow-[0_0_30px_rgba(0,229,255,0.15)] flex flex-col">
              
              {/* Image Section */}
              <div className="h-[200px] relative overflow-hidden bg-gradient-to-b from-transparent to-[#03070c]">
                <div className="absolute inset-0 bg-[#00e5ff]/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 z-10" />
                
                {p.ea_character_url ? (
                  <img src={p.ea_character_url} alt={p.username} className="w-full h-full object-cover object-top group-hover/card:scale-105 transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex items-end justify-center pb-0">
                    <svg className="w-40 h-40 text-gray-800 drop-shadow-xl translate-y-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C9.243 2 7 4.243 7 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5zm0 8c-1.654 0-3-1.346-3-3s1.346-3 3-3 3 1.346 3 3-1.346 3-3 3zm9 11v-1c0-3.859-3.141-7-7-7h-4c-3.859 0-7 3.141-7 7v1h2v-1c0-2.757 2.243-5 5-5h4c2.757 0 5 2.243 5 5v1h2z"/>
                    </svg>
                  </div>
                )}
                
                {/* Gradient Overlay for seamless blend */}
                <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[#03070c] to-transparent z-10" />
                
                {/* Badges Overlay */}
                <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
                  {p.primary_position && (
                    <span className="w-8 h-8 rounded-lg bg-[#00e5ff] text-black font-[900] text-[10px] flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.5)]">
                      {p.primary_position}
                    </span>
                  )}
                  {p.role === 'CAPTAIN' && (
                    <span className="px-2 py-1 rounded bg-amber-500/90 text-black font-[900] text-[8px] tracking-widest flex items-center justify-center uppercase shadow-lg">
                      KAPTAN
                    </span>
                  )}
                </div>
              </div>

              {/* Info Section */}
              <div className="flex-1 p-4 flex flex-col z-20 relative bg-[#03070c]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-black flex items-center justify-center overflow-hidden shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[12px] font-[900] text-[#00e5ff]">{p.username.substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <h3 className="text-[18px] font-[900] text-white tracking-widest uppercase truncate group-hover/card:text-[#00e5ff] transition-colors">{p.username}</h3>
                </div>
                
                {p.full_name && (
                  <p className="text-[11px] text-gray-500 font-bold tracking-widest mt-0.5 truncate uppercase">{p.full_name}</p>
                )}

                <div className="mt-auto pt-4 border-t border-white/5">
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-600 font-[900] tracking-widest uppercase mb-1">MAÇ</span>
                      <span className="text-[13px] text-white font-[800]">{p.stats.matches}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-600 font-[900] tracking-widest uppercase mb-1">GOL</span>
                      <span className="text-[13px] text-white font-[800]">{p.stats.goals}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-600 font-[900] tracking-widest uppercase mb-1">ASİST</span>
                      <span className="text-[13px] text-white font-[800]">{p.stats.assists}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-[#00e5ff] font-[900] tracking-widest uppercase mb-1">RTG</span>
                      <span className="text-[13px] text-[#00e5ff] font-[800]">{p.stats.avgRating}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
