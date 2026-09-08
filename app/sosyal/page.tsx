import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { SocialFeed } from './SocialFeed';
import { fetchSocialFeedAction } from './actions';

export const revalidate = 0;

export default async function SocialPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  
  const [
    { data: currentUserProfile },
    initialFeedRes,
    { data: activePlayers },
    { data: allRecent },
    { count: totalProfiles },
    { count: totalTeams },
    { count: totalLeagues },
    { count: totalPosts },
    { data: newMembers },
    userStatsRes
  ] = await Promise.all([
    user ? supabase.from('profiles').select('id, username, avatar_url, full_name, primary_position, platform').eq('id', user.id).single() : Promise.resolve({ data: null }),
    fetchSocialFeedAction(0, 20, '', 'son'),
    supabase.from('profiles').select('id, username, avatar_url, primary_position, platform').limit(5), // Simplified active players
    supabase.from('posts').select(`
      id, content,
      author:profiles!posts_author_id_fkey ( id, username, avatar_url ),
      likes ( id )
    `).eq('is_deleted', false).order('created_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }),
    supabase.from('leagues').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('profiles').select('id, username, avatar_url, primary_position, platform, created_at').order('created_at', { ascending: false }).limit(5),
    user ? supabase.from('posts').select('id, likes(id)').eq('author_id', user.id).eq('is_deleted', false) : Promise.resolve({ data: [] })
  ]);

  const initialPosts = initialFeedRes.data || [];
    
  const popularWidgetPosts = (allRecent || [])
    .sort((a: any, b: any) => (b.likes?.length || 0) - (a.likes?.length || 0))
    .slice(0, 3)
    .filter((p: any) => (p.likes?.length || 0) > 0);

  // Calculate User Stats
  let userPostCount = 0;
  let userTotalLikes = 0;
  if (user && userStatsRes.data) {
    userPostCount = userStatsRes.data.length;
    userTotalLikes = userStatsRes.data.reduce((acc, curr) => acc + (curr.likes?.length || 0), 0);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-8 md:py-12">
      
      {/* PREMIUM HEADER */}
      <div className="mb-6 flex flex-col items-center text-center fade-in-up">
        <span className="text-[10px] font-[900] tracking-[0.3em] text-[#00e5ff] uppercase mb-4 px-3 py-1 bg-[#00e5ff]/10 border border-[#00e5ff]/20 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          COMMUNITY HUB
        </span>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-[900] text-white tracking-tighter uppercase mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
          TETA <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#00aaff] drop-shadow-[0_0_12px_rgba(0,229,255,0.4)]">NETWORK</span>
        </h1>
        <p className="text-gray-400 text-[15px] md:text-[16px] font-[500] tracking-wide max-w-lg px-4">
          TETA League topluluğunun buluşma noktası.
        </p>
      </div>

      {/* NETWORK STATUS BAR */}
      <div className="mb-10 flex justify-center fade-in-up">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-3 bg-[#01060b] border border-white/5 rounded-2xl shadow-[0_0_15px_rgba(0,0,0,0.5)] text-[11px] font-[900] tracking-[0.15em] text-gray-500 uppercase">
          <span className="flex items-center gap-2"><span className="text-white text-[13px]">{totalProfiles || 0}</span> OYUNCU</span>
          <span className="w-1 h-1 rounded-full bg-white/20 hidden md:block"></span>
          <span className="flex items-center gap-2"><span className="text-white text-[13px]">{totalTeams || 0}</span> TAKIM</span>
          <span className="w-1 h-1 rounded-full bg-white/20 hidden md:block"></span>
          <span className="flex items-center gap-2"><span className="text-white text-[13px]">{totalLeagues || 0}</span> LİG</span>
          <span className="w-1 h-1 rounded-full bg-white/20 hidden md:block"></span>
          <span className="flex items-center gap-2"><span className="text-white text-[13px]">{totalPosts || 0}</span> GÖNDERİ</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT SIDEBAR (Hidden on mobile/tablet, visible on desktop lg+) */}
        <div className="hidden lg:block lg:col-span-3">
          <div className="sticky top-24 space-y-4">
            <div className="client-glass p-2 rounded-xl border border-white/5 bg-[#01060b]">
              <nav className="flex flex-col gap-1 p-2">
                <Link href="/sosyal" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 group">
                  <div className="w-8 h-8 rounded-full bg-[#00e5ff] text-black flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-white">Ana Akış</span>
                </Link>
                <Link href={user ? "/profil" : "/giris"} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-gray-300 group-hover:text-white transition-colors">{user ? "Profilim" : "Giriş Yap"}</span>
                </Link>
                <Link href="/oyuncular" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center group-hover:bg-emerald-400 group-hover:text-black transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-gray-300 group-hover:text-white transition-colors">Oyuncular</span>
                </Link>
                <Link href="/takimlar" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center group-hover:bg-amber-400 group-hover:text-black transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-gray-300 group-hover:text-white transition-colors">Takımlar</span>
                </Link>
                <Link href="/ligler" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center group-hover:bg-[#00e5ff] group-hover:text-black transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-gray-300 group-hover:text-white transition-colors">Ligler</span>
                </Link>
                <Link href="/turnuvalar" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="m11 5 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"></path><path d="m14 10 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"></path><path d="m7 12 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"></path></svg>
                  </div>
                  <span className="text-[13px] font-[800] tracking-widest uppercase text-gray-300 group-hover:text-white transition-colors">Turnuvalar</span>
                </Link>
              </nav>
            </div>

            {/* COMMUNITY LINKS */}
            <div className="client-glass p-4 rounded-xl border border-white/5 bg-[#01060b]">
              <h3 className="text-[11px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-3 ml-2 flex items-center gap-2">
                TOPLULUK
              </h3>
              <nav className="flex flex-col gap-1">
                <a href="https://kick.com/tetaleague" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-6 h-6 flex items-center justify-center transition-colors">
                    <img src="/kick-logo.png" alt="Kick" className="w-[14px] h-[14px] object-contain opacity-70 group-hover:opacity-100 group-hover:drop-shadow-[0_0_5px_rgba(83,252,24,0.6)] transition-all" />
                  </div>
                  <span className="text-[12px] font-[800] tracking-widest text-gray-400 group-hover:text-white transition-colors">TETA League</span>
                </a>
                <a href="https://discord.gg/Cd9b4jpcAZ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-6 h-6 flex items-center justify-center text-gray-400 group-hover:text-[#5865F2] transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M19.73 4.87a18.2 18.2 0 00-4.6-1.44c-.21.38-.44.88-.6 1.28a16.69 16.69 0 00-5.06 0c-.16-.4-.4-.9-.6-1.28a18.2 18.2 0 00-4.6 1.44A18.52 18.52 0 001.3 16.7a18.3 18.3 0 005.61 2.85 13.06 13.06 0 001.2-1.95 12.3 12.3 0 01-1.93-.94 9 9 0 00.36-.28c3.84 1.76 8 1.76 11.83 0a9 9 0 00.36.28 12.3 12.3 0 01-1.93.94c.36.69.76 1.34 1.2 1.95a18.3 18.3 0 005.61-2.85 18.66 18.66 0 00-4.27-11.82zM8.5 13.91c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3zm7 0c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-[12px] font-[800] tracking-widest text-gray-400 group-hover:text-white transition-colors">Discord</span>
                </a>
                <a href="https://www.instagram.com/teta.league/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-6 h-6 flex items-center justify-center text-gray-400 group-hover:text-[#E1306C] transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-[12px] font-[800] tracking-widest text-gray-400 group-hover:text-white transition-colors">Instagram</span>
                </a>
              </nav>
            </div>
          </div>
        </div>

        {/* CENTER FEED */}
        <div className="col-span-1 lg:col-span-6 min-w-0">
          
          {/* Mobile Quick Nav */}
          <div className="flex lg:hidden overflow-x-auto custom-scrollbar-hide gap-2 pb-4 -mx-4 px-4 snap-x">
            <Link href="/sosyal" className="shrink-0 px-4 py-2 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded-full text-[12px] font-bold tracking-widest text-[#00e5ff] uppercase snap-start">Ana Akış</Link>
            <Link href={user ? "/profil" : "/giris"} className="shrink-0 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[12px] font-bold tracking-widest text-white uppercase snap-start">Profilim</Link>
            <Link href="/oyuncular" className="shrink-0 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[12px] font-bold tracking-widest text-white uppercase snap-start">Oyuncular</Link>
            <Link href="/takimlar" className="shrink-0 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[12px] font-bold tracking-widest text-white uppercase snap-start">Takımlar</Link>
          </div>

          <SocialFeed 
            initialPosts={initialPosts} 
            userProfile={currentUserProfile} 
            currentUser={user} 
          />
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="col-span-1 lg:col-span-3">
          <div className="sticky top-24 space-y-4">
            
            {/* 1. OYUNCU KÜNYESİ */}
            <div className="client-glass p-5 rounded-xl border border-white/5 bg-[#01060b]">
              {currentUserProfile ? (
                <div className="flex flex-col items-center">
                  <Link href={`/oyuncular/${currentUserProfile.username}`} className="relative w-16 h-16 rounded-full overflow-hidden bg-black border border-white/10 group mb-3">
                    {currentUserProfile.avatar_url ? (
                      <img src={currentUserProfile.avatar_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-[#00e5ff] text-xl">
                        {currentUserProfile.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <Link href={`/oyuncular/${currentUserProfile.username}`} className="text-[15px] font-[900] text-white hover:text-[#00e5ff] transition-colors truncate w-full text-center">
                    {currentUserProfile.username}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 mb-4">
                    {currentUserProfile.primary_position && (
                      <span className="text-[10px] text-[#00e5ff] border border-[#00e5ff]/30 bg-[#00e5ff]/10 px-1.5 py-0.5 rounded font-[900] uppercase tracking-widest">
                        {currentUserProfile.primary_position}
                      </span>
                    )}
                    {currentUserProfile.platform && (
                      <span className="text-[10px] text-gray-400 border border-gray-700 bg-gray-800 px-1.5 py-0.5 rounded font-[900] uppercase tracking-widest">
                        {currentUserProfile.platform}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex w-full divide-x divide-white/5 border-t border-white/5 pt-4">
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[16px] font-[900] text-white">{userPostCount}</span>
                      <span className="text-[9px] text-gray-500 font-[800] tracking-widest uppercase mt-0.5">PAYLAŞIM</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[16px] font-[900] text-white">{userTotalLikes}</span>
                      <span className="text-[9px] text-gray-500 font-[800] tracking-widest uppercase mt-0.5">BEĞENİ</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center opacity-50">
                      <span className="text-[16px] font-[900] text-white">—</span>
                      <span className="text-[9px] text-gray-500 font-[800] tracking-widest uppercase mt-0.5">TAKİPÇİ</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center text-xl text-gray-600 mb-1">
                    👋
                  </div>
                  <p className="text-[12px] text-gray-400 font-medium">Giriş yaparak kendi künyeni görüntüle ve topluluğa katıl.</p>
                  <Link href="/giris" className="mt-2 px-6 py-2 bg-[#00e5ff] text-black text-[11px] font-[900] tracking-widest uppercase rounded-lg hover:bg-[#00cce6] transition-colors">
                    GİRİŞ YAP
                  </Link>
                </div>
              )}
            </div>

            {/* 2. TETA DUYURULARI */}
            <div className="client-glass p-5 rounded-xl border border-white/5 bg-gradient-to-b from-[#00e5ff]/[0.02] to-[#01060b]">
              <h3 className="text-[11px] font-[900] text-gray-400 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                <span className="text-[#00e5ff] text-[14px]">📢</span>
                TETA DUYURULARI
              </h3>
              <div className="text-center py-4 border border-dashed border-white/10 rounded-lg">
                <span className="text-[11px] text-gray-600 font-[600] tracking-wide">Henüz duyuru bulunmuyor.</span>
              </div>
            </div>

            {/* 3. TREND GÖNDERİLER */}
            {popularWidgetPosts.length > 0 && (
              <div className="client-glass p-5 rounded-xl border border-white/5 bg-[#01060b]">
                <h3 className="text-[11px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  TREND GÖNDERİLER
                </h3>
                <div className="space-y-4">
                  {popularWidgetPosts.map((p: any) => (
                    <Link href={`/sosyal#post-${p.id}`} key={p.id} className="block group min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-black overflow-hidden border border-white/10 shrink-0 group-hover:border-[#00e5ff]/50 transition-colors">
                          {p.author?.avatar_url ? (
                            <img src={p.author.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#00e5ff]">{p.author?.username?.charAt(0)?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-[800] text-white truncate group-hover:text-[#00e5ff] transition-colors">{p.author?.username}</p>
                          <p className="text-[12px] text-gray-400 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors mt-0.5 break-words">{p.content}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 4. AKTİF OYUNCULAR */}
            <div className="client-glass p-5 rounded-xl border border-white/5 bg-[#01060b]">
              <h3 className="text-[11px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                AKTİF OYUNCULAR
              </h3>
              <div className="space-y-3">
                {activePlayers && activePlayers.length > 0 ? activePlayers.map((ap: any) => (
                  <Link href={`/oyuncular/${ap.username}`} key={ap.id} className="flex items-center gap-3 group min-w-0 p-1.5 -m-1.5 hover:bg-white/5 rounded-lg transition-colors">
                    <div className="w-8 h-8 rounded-full bg-black overflow-hidden border border-white/10 shrink-0 group-hover:border-[#00e5ff]/50 transition-colors">
                      {ap.avatar_url ? (
                        <img src={ap.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500">{ap.username?.charAt(0)?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-[13px] font-[800] text-white truncate group-hover:text-[#00e5ff] transition-colors">{ap.username}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ap.primary_position && <span className="text-[9px] text-[#00e5ff] font-[900] uppercase tracking-widest">{ap.primary_position}</span>}
                        {ap.platform && <span className="text-[9px] text-gray-500 font-[800] uppercase tracking-widest before:content-['·'] before:mr-1.5 before:text-gray-700">{ap.platform}</span>}
                      </div>
                    </div>
                  </Link>
                )) : (
                  <p className="text-[11px] text-gray-500 font-medium italic text-center py-2">Henüz aktif oyuncu bulunmuyor.</p>
                )}
              </div>
            </div>

            {/* 5. SON KATILANLAR */}
            <div className="client-glass p-5 rounded-xl border border-white/5 bg-[#01060b]">
              <h3 className="text-[11px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                <span className="text-[14px]">🔥</span>
                SON KATILANLAR
              </h3>
              <div className="space-y-3">
                {newMembers && newMembers.length > 0 ? newMembers.map((ap: any) => (
                  <Link href={`/oyuncular/${ap.username}`} key={ap.id} className="flex items-center gap-3 group min-w-0 p-1.5 -m-1.5 hover:bg-white/5 rounded-lg transition-colors">
                    <div className="w-8 h-8 rounded-full bg-black overflow-hidden border border-white/10 shrink-0 group-hover:border-[#00e5ff]/50 transition-colors">
                      {ap.avatar_url ? (
                        <img src={ap.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500">{ap.username?.charAt(0)?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-[13px] font-[800] text-white truncate group-hover:text-[#00e5ff] transition-colors">{ap.username}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ap.primary_position && <span className="text-[9px] text-white font-[900] uppercase tracking-widest">{ap.primary_position}</span>}
                        {ap.platform && <span className="text-[9px] text-gray-500 font-[800] uppercase tracking-widest before:content-['·'] before:mr-1.5 before:text-gray-700">{ap.platform}</span>}
                      </div>
                    </div>
                  </Link>
                )) : (
                  <p className="text-[11px] text-gray-500 font-medium italic text-center py-2">Henüz yeni katılan oyuncu yok.</p>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
