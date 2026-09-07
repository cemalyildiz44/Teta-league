import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import LeagueRulesButton from "@/components/LeagueRulesButton";
import { slugify } from "@/app/lig/utils";

export const metadata = {
  title: "Ligler | Teta League",
  description: "Teta League resmi ligleri ve güncel sezon bilgileri.",
};

export default async function LiglerPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Fetch Seasons and Leagues
  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, name, slug, status, leagues(id, name, level, status, rules)")
    .order("created_at", { ascending: false });
    
  // Get all active/upcoming seasons and their active/upcoming leagues
  let leaguesToDisplay: any[] = [];
  
  if (seasons) {
    const activeSeasons = seasons.filter(s => s.status === "ACTIVE" || s.status === "UPCOMING");
    for (const season of activeSeasons) {
      if (season.leagues) {
        const activeLeagues = (season.leagues as any[])
          .filter(l => l.status === "ACTIVE" || l.status === "UPCOMING")
          .map(l => ({
            ...l,
            seasonName: season.name,
            seasonSlug: season.slug,
          }));
        leaguesToDisplay.push(...activeLeagues);
      }
    }
    
    // Sort leagues primarily by level, then by name
    leaguesToDisplay.sort((a, b) => {
      if ((a.level || 0) !== (b.level || 0)) {
        return (a.level || 0) - (b.level || 0);
      }
      return a.name.localeCompare(b.name);
    });
  }
  
  const activeLeagueIds = leaguesToDisplay.map(l => l.id);
  const [ { data: teamSeasonStats }, { data: playerSeasonStats } ] = await Promise.all([
    supabase.from("team_season_stats").select("league_id, team_id").in("league_id", activeLeagueIds),
    supabase.from("player_team_season_stats").select("league_id, player_id").in("league_id", activeLeagueIds)
  ]);

  // Precalculate stats per league
  const getLeagueStats = (leagueId: string) => {
    const teams = new Set(teamSeasonStats?.filter(s => s.league_id === leagueId).map(s => s.team_id)).size;
    const players = new Set(playerSeasonStats?.filter(s => s.league_id === leagueId).map(s => s.player_id)).size;
    return { teams, players };
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      {/* HEADER */}
      <div className="flex flex-col items-center text-center mb-16 fade-in-up">
        <h1 className="text-5xl md:text-7xl font-[900] text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] mb-4">
          RESMİ <span className="text-[#00e5ff]">LİGLER</span>
        </h1>
        <p className="text-[#a0b0c0] max-w-2xl text-[15px] leading-relaxed font-medium">
          Teta League ekosistemindeki profesyonel ligler. Dünyanın en iyi sanal futbol takımlarının kıyasıya mücadelesine tanık olun.
        </p>
      </div>

      {/* LEAGUE CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-24">
        {leaguesToDisplay.length > 0 ? leaguesToDisplay.map((league, idx) => {
          const isLevel2 = league.level === 2 || league.name.toLowerCase().includes("ecl");
          
          // Theme configurations
          const theme = isLevel2 
            ? {
                accent: "#ff0044",
                text: "text-[#ff0044]",
                borderHover: "hover:border-[#ff0044]/40",
                borderAccent: "border-[#ff0044]/30",
                bgAccent: "bg-[#ff0044]/10",
                bgAccentHover: "hover:bg-[#ff0044]/20",
                logo: "/ecl-logo.png",
                desc: "Teta League'in rekabetçi 2. seviye ligi. Geleceğin şampiyonlarının Süper Lig'e yükselme mücadelesi.",
                levelText: "2. SEVİYE LİG"
              }
            : {
                accent: "#00e5ff",
                text: "text-[#00e5ff]",
                borderHover: "hover:border-[#00e5ff]/40",
                borderAccent: "border-[#00e5ff]/30",
                bgAccent: "bg-[#00e5ff]/10",
                bgAccentHover: "hover:bg-[#00e5ff]/20",
                logo: "/teta-superlig-logo.png",
                desc: "Teta League'in en üst düzey profesyonel mücadele alanı. Sadece en iyi takımlar burada kalabilir.",
                levelText: "1. SEVİYE LİG"
              };

          const stats = getLeagueStats(league.id);

          return (
            <div 
              key={league.id} 
              className={`fade-in-up flex flex-col client-glass p-0 rounded-3xl border border-white/5 ${theme.borderHover} transition-all duration-500 overflow-hidden relative group shadow-2xl`}
              style={{ animationDelay: `${0.1 * idx}s` }}
            >
              {/* Blur behind logo */}
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-700 blur-[80px] mix-blend-screen"
                style={{ backgroundColor: theme.accent }}
              />

              {/* CARD TOP CONTENT */}
              <div className="p-8 md:p-12 flex flex-col items-center text-center border-b border-white/5 bg-black/40 relative z-10 flex-1">
                
                <div className="relative mb-8 group-hover:scale-105 transition-transform duration-700 h-[160px] flex items-center justify-center">
                  <Image 
                    src={theme.logo} 
                    alt={league.name} 
                    width={160} 
                    height={160} 
                    className="object-contain max-h-full drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]"
                    priority={idx === 0}
                  />
                </div>

                <span className={`px-4 py-1.5 ${theme.bgAccent} border ${theme.borderAccent} ${theme.text} text-[11px] font-black tracking-widest rounded-full uppercase mb-5 shadow-lg`}>
                  {theme.levelText}
                </span>

                <h3 className="text-3xl md:text-[40px] leading-tight font-black text-white tracking-widest uppercase mb-4 drop-shadow-md">
                  {league.name}
                </h3>
                
                <p className="text-[#a0b0c0] text-[14px] font-medium max-w-[320px] mx-auto leading-relaxed mb-8">
                  {theme.desc}
                </p>

                {/* DB Stats */}
                <div className="flex flex-wrap justify-center items-center gap-3 w-full">
                  <div className="flex-1 min-w-[100px] px-3 py-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center">
                    <span className="text-gray-500 text-[10px] font-black tracking-widest uppercase mb-1">SEZON</span>
                    <span className="text-white text-[13px] font-bold tracking-wider truncate max-w-[100px]">{league.seasonName}</span>
                  </div>
                  <div className="flex-1 min-w-[100px] px-3 py-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center">
                    <span className="text-gray-500 text-[10px] font-black tracking-widest uppercase mb-1">TAKIM</span>
                    <span className="text-white text-[13px] font-bold tracking-wider">{stats.teams}</span>
                  </div>
                  <div className="flex-1 min-w-[100px] px-3 py-3 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center">
                    <span className="text-gray-500 text-[10px] font-black tracking-widest uppercase mb-1">OYUNCU</span>
                    <span className="text-white text-[13px] font-bold tracking-wider">{stats.players}</span>
                  </div>
                </div>

              </div>

              {/* CARD ACTION BUTTONS */}
              <div className="p-6 md:p-8 bg-black/60 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 relative z-20">
                <Link 
                  href={`/lig/${league.seasonSlug}/${slugify(league.name)}`} 
                  className={`flex items-center justify-center py-4 px-4 rounded-xl ${theme.bgAccent} ${theme.bgAccentHover} border ${theme.borderAccent} ${theme.text} font-black text-[12px] md:text-[11px] tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]`}
                >
                  LİG MERKEZİ
                </Link>
                <Link 
                  href={`/lig/${league.seasonSlug}/${slugify(league.name)}`} 
                  className="flex items-center justify-center py-4 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[12px] md:text-[11px] tracking-widest uppercase transition-all"
                >
                  PUAN DURUMU
                </Link>
                
                <LeagueRulesButton 
                  leagueName={league.name} 
                  seasonName={league.seasonName} 
                  rules={league.rules}
                  className="w-full flex items-center justify-center py-4 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[12px] md:text-[11px] tracking-widest uppercase transition-all" 
                />
              </div>

            </div>
          );
        }) : (
          <div className="col-span-1 lg:col-span-2 empty-state !py-24 fade-in-up">
            <span className="empty-state-title text-[24px]">AKTİF LİG BULUNAMADI</span>
            <span className="empty-state-desc">Teta League'de şu anda aktif bir lig bulunmuyor.</span>
          </div>
        )}
      </div>

      {/* 4 FEATURE AREAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="client-glass p-6 md:p-8 rounded-2xl border border-white/5 flex flex-col items-center text-center fade-in-up" style={{ animationDelay: "0.2s" }}>
          <div className="w-14 h-14 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
          </div>
          <h4 className="text-[15px] font-black tracking-widest text-white uppercase mb-2">2 Resmi Lig</h4>
          <p className="text-[#a0b0c0] text-[13px] leading-relaxed font-medium">Süper Lig ve ECL 1. Lig olmak üzere iki ayrı seviyede profesyonel sanal futbol deneyimi.</p>
        </div>

        <div className="client-glass p-6 md:p-8 rounded-2xl border border-white/5 flex flex-col items-center text-center fade-in-up" style={{ animationDelay: "0.3s" }}>
          <div className="w-14 h-14 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"></path><path d="M7 20V4"></path><path d="m21 8-4-4-4 4"></path><path d="M17 4v16"></path></svg>
          </div>
          <h4 className="text-[15px] font-black tracking-widest text-white uppercase mb-2">Yükselme & Düşme</h4>
          <p className="text-[#a0b0c0] text-[13px] leading-relaxed font-medium">Başarılı takımlar bir üst lige terfi ederken, başarısız olanlar küme düşme heyecanını yaşar.</p>
        </div>

        <div className="client-glass p-6 md:p-8 rounded-2xl border border-white/5 flex flex-col items-center text-center fade-in-up" style={{ animationDelay: "0.4s" }}>
          <div className="w-14 h-14 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
          </div>
          <h4 className="text-[15px] font-black tracking-widest text-white uppercase mb-2">Adil Rekabet</h4>
          <p className="text-[#a0b0c0] text-[13px] leading-relaxed font-medium">Katı kurallar, disiplinli yönetim ve şeffaf istatistiklerle %100 adil e-spor ortamı.</p>
        </div>

        <div className="client-glass p-6 md:p-8 rounded-2xl border border-white/5 flex flex-col items-center text-center fade-in-up" style={{ animationDelay: "0.5s" }}>
          <div className="w-14 h-14 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3"></path><path d="m8.5 6.5 3.5-3.5 3.5 3.5"></path><path d="M2 21h20"></path></svg>
          </div>
          <h4 className="text-[15px] font-black tracking-widest text-white uppercase mb-2">Prestij & Ödüller</h4>
          <p className="text-[#a0b0c0] text-[13px] leading-relaxed font-medium">Şampiyonluk kupaları, gol krallığı ve sezon sonu resmi Teta ödülleri seni bekliyor.</p>
        </div>
      </div>
    </div>
  );
}
