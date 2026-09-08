
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { 
  Users, Shield, Trophy, Swords, Calendar, Clock, 
  CheckCircle2, XCircle, AlertCircle, Database, Lock, Check,
  Activity, ArrowRight, UserPlus, FileText, Plus
} from 'lucide-react';

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Check connection basically by making the first fast queries
  let isDbConnected = true;

  // 1. Parallel Fetching (Avoid N+1)
  const [
    { count: profilesCount, error: dbErr },
    { count: teamsCount },
    { count: leaguesCount },
    { count: matchesCount },
    { data: activeSeason },
    { data: recentMatches },
    { data: upcomingFixtures },
    { data: latestProfiles },
    { data: activeMemberships },
    { data: allMatches },
    { count: postsCount },
    { data: latestPosts },
    { data: activeTeamsData }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('leagues').select('*', { count: 'exact', head: true }),
    supabase.from('matches').select('*', { count: 'exact', head: true }),
    supabase.from('seasons').select('id, name, status, start_date, end_date').eq('status', 'ACTIVE').maybeSingle(),
    supabase.from('matches').select('id, home_score, away_score, status, played_at, leagues(name), home:teams!matches_home_team_id_fkey(name, logo_url), away:teams!matches_away_team_id_fkey(name, logo_url)').order('played_at', { ascending: false }).limit(6),
    supabase.from('fixtures').select('id, week_number, scheduled_at, leagues(name), home:teams!fixtures_home_team_id_fkey(name), away:teams!fixtures_away_team_id_fkey(name)').eq('status', 'SCHEDULED').order('scheduled_at', { ascending: true }).limit(5),
    supabase.from('profiles').select('id, username, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('team_memberships').select('team_id').is('left_at', null),
    supabase.from('matches').select('status'),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('id, created_at, profiles(username)').order('created_at', { ascending: false }).limit(1),
    supabase.from('teams').select('id, name, logo_url').eq('is_active', true).limit(6)
  ]);

  if (dbErr) isDbConnected = false;

  // 2. Secondary fetching for active season data
  const { data: activeLeagues } = activeSeason ? await supabase.from('leagues').select('id, name, level').eq('season_id', activeSeason.id).order('level') : { data: [] };
  const { data: activeLeagueTeams } = activeSeason && activeLeagues?.length ? await supabase.from('league_teams').select('league_id, team_id').in('league_id', activeLeagues.map(l=>l.id)) : { data: [] };
  const { data: activeLeagueMatches } = activeSeason && activeLeagues?.length ? await supabase.from('matches').select('league_id, status').in('league_id', activeLeagues.map(l=>l.id)) : { data: [] };

  // Calculate Match Statuses
  const pendingMatches = (allMatches || []).filter(m => m.status === 'PENDING_REVIEW').length;
  const approvedMatches = (allMatches || []).filter(m => m.status === 'APPROVED').length;
  const rejectedMatches = (allMatches || []).filter(m => ['REJECTED', 'CANCELLED'].includes(m.status)).length;

  return (
    <div className='max-w-[1400px] mx-auto space-y-8'>
      {/* HEADER */}
      <div className='flex flex-col md:flex-row md:items-end justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-black text-white tracking-widest'>GENEL BAKIŞ</h1>
          <p className='text-sm text-zinc-400 mt-1'>TETA League operasyonunun tüm önemli verilerini tek merkezden takip et.</p>
        </div>
        <div className='text-right'>
          <p className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1'>AKTİF SEZON</p>
          {activeSeason ? (
            <div className='inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg'>
              <div className='w-2 h-2 rounded-full bg-cyan-400 animate-pulse'></div>
              <span className='text-sm font-black text-cyan-400'>{activeSeason.name}</span>
            </div>
          ) : (
            <div className='inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-500/10 border border-zinc-500/20 rounded-lg text-sm font-bold text-zinc-500'>
              Aktif sezon bulunmuyor.
            </div>
          )}
        </div>
      </div>

      {!isDbConnected && (
        <div className='p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold flex items-center gap-2'>
          <AlertCircle className='w-5 h-5' /> Veritabanına bağlanılamadı. Veriler eksik veya hatalı olabilir.
        </div>
      )}

      {/* 4 KPI CARDS */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <Link href='/admin/players' className='card-surface p-6 rounded-xl border border-white/5 hover:border-white/10 transition-colors group relative overflow-hidden'>
          <div className='absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity'>
            <Users className='w-24 h-24' />
          </div>
          <div className='relative z-10'>
            <p className='text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>OYUNCULAR</p>
            <p className='text-4xl font-black text-white'>{profilesCount || 0}</p>
            <p className='text-xs text-zinc-500 mt-1'>Kayıtlı oyuncu</p>
          </div>
        </Link>
        <Link href='/admin/teams' className='card-surface p-6 rounded-xl border border-white/5 hover:border-white/10 transition-colors group relative overflow-hidden'>
          <div className='absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity'>
            <Shield className='w-24 h-24' />
          </div>
          <div className='relative z-10'>
            <p className='text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>TAKIMLAR</p>
            <p className='text-4xl font-black text-white'>{teamsCount || 0}</p>
            <p className='text-xs text-zinc-500 mt-1'>Aktif takımlar</p>
          </div>
        </Link>
        <Link href='/admin/leagues' className='card-surface p-6 rounded-xl border border-white/5 hover:border-white/10 transition-colors group relative overflow-hidden'>
          <div className='absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity'>
            <Trophy className='w-24 h-24' />
          </div>
          <div className='relative z-10'>
            <p className='text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>LİGLER</p>
            <p className='text-4xl font-black text-white'>{leaguesCount || 0}</p>
            <p className='text-xs text-zinc-500 mt-1'>Kayıtlı lig</p>
          </div>
        </Link>
        <Link href='/admin/matches' className='card-surface p-6 rounded-xl border border-white/5 hover:border-white/10 transition-colors group relative overflow-hidden'>
          <div className='absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity'>
            <Swords className='w-24 h-24' />
          </div>
          <div className='relative z-10'>
            <p className='text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>MAÇLAR</p>
            <p className='text-4xl font-black text-white'>{matchesCount || 0}</p>
            <p className='text-xs text-zinc-500 mt-1'>Gerçekleşen maç kaydı</p>
          </div>
        </Link>
      </div>

      {/* MATCH STATUS & ACTIVE SEASON */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2 card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest'>MAÇ DURUMU ÖZETİ</h3>
            <Link href='/admin/matches' className='text-[10px] font-bold text-cyan-400 hover:underline'>TÜMÜNÜ GÖR</Link>
          </div>
          <div className='p-6 grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 items-center'>
            <div className='flex flex-col items-center justify-center p-4 bg-[#060d18] rounded-xl border border-white/5'>
              <span className='text-2xl font-black text-amber-400 mb-1'>{pendingMatches}</span>
              <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center'>Bekleyen<br/>Onay</span>
            </div>
            <div className='flex flex-col items-center justify-center p-4 bg-[#060d18] rounded-xl border border-white/5'>
              <span className='text-2xl font-black text-emerald-400 mb-1'>{approvedMatches}</span>
              <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center'>Onaylanan<br/>Maçlar</span>
            </div>
            <div className='flex flex-col items-center justify-center p-4 bg-[#060d18] rounded-xl border border-white/5'>
              <span className='text-2xl font-black text-red-400 mb-1'>{rejectedMatches}</span>
              <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center'>İptal /<br/>Reddedilen</span>
            </div>
            <div className='flex flex-col items-center justify-center p-4 bg-[#060d18] rounded-xl border border-white/5'>
              <span className='text-2xl font-black text-white mb-1'>{allMatches?.length || 0}</span>
              <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center'>Toplam<br/>Kayıt</span>
            </div>
          </div>
        </div>

        <div className='card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col relative'>
          <div className='absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none' />
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between z-10'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase'>AKTİF SEZON PANELİ</h3>
          </div>
          <div className='p-6 flex-1 flex flex-col z-10'>
            {activeSeason ? (
              <>
                <h4 className='text-xl font-black text-white mb-4'>{activeSeason.name}</h4>
                <div className='space-y-3 mb-6 flex-1'>
                  <div className='flex justify-between items-center text-sm'>
                    <span className='text-zinc-500'>Durum</span>
                    <span className='text-cyan-400 font-bold'>ACTIVE</span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className='text-zinc-500'>Başlangıç</span>
                    <span className='text-white font-mono'>{new Date(activeSeason.start_date).toLocaleDateString('tr-TR')}</span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className='text-zinc-500'>Lig Sayısı</span>
                    <span className='text-white font-bold'>{activeLeagues?.length || 0}</span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className='text-zinc-500'>Takım Sayısı</span>
                    <span className='text-white font-bold'>{new Set(activeLeagueTeams?.map(lt=>lt.team_id) || []).size || 0}</span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className='text-zinc-500'>Oynanan Maç</span>
                    <span className='text-white font-bold'>{activeLeagueMatches?.length || 0}</span>
                  </div>
                </div>
                <Link href='/admin/seasons' className='block w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-center text-xs font-black rounded-lg transition-colors border border-cyan-500/30'>
                  SEZONU YÖNET
                </Link>
              </>
            ) : (
              <div className='flex-1 flex flex-col items-center justify-center text-center'>
                <AlertCircle className='w-8 h-8 text-zinc-600 mb-2' />
                <p className='text-sm text-zinc-400 mb-4'>Şu anda aktif bir sezon bulunmuyor.</p>
                <Link href='/admin/seasons' className='px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition-colors'>
                  Sezonlara Git
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LEAGUES & FIXTURES */}
      <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
        <div className='xl:col-span-2 card-surface rounded-xl border border-white/5 overflow-hidden'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest'>LİG DURUMU (AKTİF SEZON)</h3>
            <Link href='/admin/leagues' className='text-[10px] font-bold text-cyan-400 hover:underline'>LİGLERİ YÖNET</Link>
          </div>
          <div className='p-0 divide-y divide-white/5'>
            {activeLeagues && activeLeagues.length > 0 ? (
              activeLeagues.map((l:any) => {
                const lTeams = activeLeagueTeams?.filter(lt => lt.league_id === l.id).length || 0;
                const lMatches = activeLeagueMatches?.filter(m => m.league_id === l.id).length || 0;
                return (
                  <div key={l.id} className='p-4 flex items-center justify-between hover:bg-white/5 transition-colors'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-lg bg-[#060d18] border border-white/10 flex items-center justify-center'>
                        <Trophy className='w-4 h-4 text-cyan-500' />
                      </div>
                      <div>
                        <h4 className='font-bold text-white text-sm'>{l.name}</h4>
                        <p className='text-[10px] text-zinc-500'>Seviye {l.level}</p>
                      </div>
                    </div>
                    <div className='flex gap-6 text-right'>
                      <div>
                        <p className='text-[10px] text-zinc-500 uppercase font-bold'>Takım</p>
                        <p className='font-mono text-sm text-white'>{lTeams}</p>
                      </div>
                      <div>
                        <p className='text-[10px] text-zinc-500 uppercase font-bold'>Maç</p>
                        <p className='font-mono text-sm text-white'>{lMatches}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className='p-8 text-center text-zinc-500 text-sm'>Bu sezonda henüz lig bulunmuyor.</div>
            )}
          </div>
        </div>

        <div className='card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <Calendar className='w-4 h-4 text-amber-500' /> FİKSTÜR AKIŞI
            </h3>
            <Link href='/admin/fixtures' className='text-[10px] font-bold text-cyan-400 hover:underline'>YÖNET</Link>
          </div>
          <div className='p-4 bg-[#060d18] border-b border-white/5 flex justify-between items-center'>
            <div>
              <p className='text-[10px] font-bold text-zinc-500 uppercase'>Yaklaşan Fikstür</p>
              <p className='text-lg font-black text-white'>{upcomingFixtures?.length || 0}</p>
            </div>
          </div>
          <div className='p-0 divide-y divide-white/5 flex-1 overflow-y-auto'>
            {upcomingFixtures && upcomingFixtures.length > 0 ? (
              upcomingFixtures.map((f:any) => (
                <div key={f.id} className='p-4 hover:bg-white/5 transition-colors'>
                  <div className='flex justify-between items-start mb-2'>
                    <span className='text-[10px] font-bold text-cyan-400 uppercase'>{f.leagues?.name}</span>
                    <span className='text-[10px] text-zinc-500 font-mono'>{new Date(f.scheduled_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm font-bold text-white'>
                    <span className='truncate w-2/5'>{f.home?.name || 'BYE'}</span>
                    <span className='text-[10px] text-zinc-600'>vs</span>
                    <span className='truncate w-2/5 text-right'>{f.away?.name || 'BYE'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className='p-8 text-center text-zinc-500 text-sm'>Henüz yaklaşan fikstür oluşturulmamış.</div>
            )}
          </div>
        </div>
      </div>

      {/* RECENT MATCHES & PLAYER ACTIVITY */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2 card-surface rounded-xl border border-white/5 overflow-hidden'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <Clock className='w-4 h-4 text-emerald-500' /> SON MAÇLAR
            </h3>
            <Link href='/admin/matches' className='text-[10px] font-bold text-cyan-400 hover:underline'>TÜMÜNÜ GÖR</Link>
          </div>
          <div className='p-0 divide-y divide-white/5'>
            {recentMatches && recentMatches.length > 0 ? (
              recentMatches.map((m:any) => (
                <div key={m.id} className='p-4 hover:bg-white/5 transition-colors flex flex-col md:flex-row items-center justify-between gap-4'>
                  <div className='flex items-center gap-4 flex-1 w-full'>
                    <div className='flex items-center gap-2 w-1/3 justify-end'>
                      <span className='text-sm font-bold text-white truncate'>{m.home?.name}</span>
                      <div className='w-6 h-6 rounded-full bg-[#060d18] border border-white/10 shrink-0 overflow-hidden flex justify-center items-center'>
                        {m.home?.logo_url ? <img src={m.home.logo_url} className='w-full h-full object-cover'/> : <Shield className='w-3 h-3 text-zinc-600'/>}
                      </div>
                    </div>
                    <div className='w-16 text-center'>
                      {m.home_score !== null ? (
                        <span className='px-2 py-1 bg-[#060d18] border border-white/10 rounded font-black text-white text-sm'>
                          {m.home_score} - {m.away_score}
                        </span>
                      ) : <span className='text-zinc-600'>-</span>}
                    </div>
                    <div className='flex items-center gap-2 w-1/3'>
                      <div className='w-6 h-6 rounded-full bg-[#060d18] border border-white/10 shrink-0 overflow-hidden flex justify-center items-center'>
                        {m.away?.logo_url ? <img src={m.away.logo_url} className='w-full h-full object-cover'/> : <Shield className='w-3 h-3 text-zinc-600'/>}
                      </div>
                      <span className='text-sm font-bold text-white truncate'>{m.away?.name}</span>
                    </div>
                  </div>
                  <div className='flex items-center gap-4 w-full md:w-auto justify-between md:justify-end'>
                    <div className='text-[10px] text-zinc-500 text-right'>
                      <p>{m.leagues?.name}</p>
                      <p>{new Date(m.played_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                    {m.status === 'APPROVED' ? (
                      <CheckCircle2 className='w-5 h-5 text-emerald-500' />
                    ) : m.status === 'PENDING_REVIEW' ? (
                      <AlertCircle className='w-5 h-5 text-amber-500' />
                    ) : (
                      <XCircle className='w-5 h-5 text-red-500' />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className='p-8 text-center text-zinc-500 text-sm'>Henüz kayıtlı maç bulunmuyor.</div>
            )}
          </div>
        </div>

        <div className='card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <UserPlus className='w-4 h-4 text-indigo-500' /> OYUNCU AKTİVİTESİ
            </h3>
          </div>
          <div className='p-4 bg-[#060d18] border-b border-white/5 grid grid-cols-2 gap-4'>
            <div>
              <p className='text-[10px] font-bold text-zinc-500 uppercase'>Sözleşmeli</p>
              <p className='text-lg font-black text-emerald-400'>{activeMemberships?.length || 0}</p>
            </div>
            <div>
              <p className='text-[10px] font-bold text-zinc-500 uppercase'>Serbest</p>
              <p className='text-lg font-black text-amber-400'>{(profilesCount || 0) - (activeMemberships?.length || 0)}</p>
            </div>
          </div>
          <div className='p-4 flex-1'>
            <p className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3'>Son Katılanlar</p>
            <div className='space-y-3'>
              {latestProfiles && latestProfiles.length > 0 ? (
                latestProfiles.map((p:any) => (
                  <div key={p.id} className='flex items-center gap-3'>
                    <div className='w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-xs border border-indigo-500/20'>
                      {p.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className='text-sm font-bold text-white'>{p.username}</p>
                      <p className='text-[10px] text-zinc-500'>{new Date(p.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className='text-zinc-500 text-sm'>Kayıtlı oyuncu yok.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TEAMS OVERVIEW & SOCIAL & SYSTEM */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* Teams */}
        <div className='card-surface rounded-xl border border-white/5 overflow-hidden'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase'>TAKIMLAR</h3>
            <Link href='/admin/teams' className='text-[10px] font-bold text-cyan-400 hover:underline'>YÖNET</Link>
          </div>
          <div className='p-0 divide-y divide-white/5'>
            {activeTeamsData && activeTeamsData.length > 0 ? (
              activeTeamsData.map((t:any) => {
                const pCount = activeMemberships?.filter((m:any) => m.team_id === t.id).length || 0;
                return (
                  <div key={t.id} className='p-4 flex items-center justify-between hover:bg-white/5 transition-colors'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-lg bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center'>
                        {t.logo_url ? <img src={t.logo_url} className='w-full h-full object-cover'/> : <Shield className='w-4 h-4 text-zinc-600'/>}
                      </div>
                      <span className='font-bold text-white text-sm'>{t.name}</span>
                    </div>
                    <div className='text-right'>
                      <span className='px-2 py-1 bg-white/5 rounded text-xs font-mono text-zinc-300'>{pCount} OY.</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className='p-8 text-center text-zinc-500 text-sm'>Aktif takım bulunmuyor.</div>
            )}
          </div>
        </div>

        {/* TETA Network */}
        <div className='card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <Activity className='w-4 h-4 text-cyan-500' /> TETA NETWORK
            </h3>
            <Link href='/sosyal' className='text-[10px] font-bold text-cyan-400 hover:underline'>GİT</Link>
          </div>
          <div className='p-6 flex-1 flex flex-col justify-center items-center text-center'>
            {postsCount !== undefined && postsCount !== null ? (
              <>
                <p className='text-4xl font-black text-white mb-2'>{postsCount}</p>
                <p className='text-xs text-zinc-500 uppercase tracking-widest mb-6'>Toplam Gönderi</p>
                
                {latestPosts && latestPosts.length > 0 && (
                  <div className='w-full p-4 bg-[#060d18] rounded-xl border border-white/5 text-left'>
                    <p className='text-[10px] font-bold text-cyan-400 uppercase mb-1'>Son Paylaşım</p>
                    <p className='text-sm text-white font-bold mb-1'>@{((latestPosts[0] as any).profiles as any)?.username || 'Kullanıcı'}</p>
                    <p className='text-[10px] text-zinc-500'>{new Date(latestPosts[0].created_at).toLocaleString('tr-TR')}</p>
                  </div>
                )}
              </>
            ) : (
              <p className='text-sm text-zinc-500'>Topluluk modülü aktif değil veya boş.</p>
            )}
          </div>
        </div>

        {/* Quick Actions & System Status */}
        <div className='flex flex-col gap-6'>
          <div className='card-surface p-4 rounded-xl border border-white/5'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase mb-4'>HIZLI İŞLEMLER</h3>
            <div className='grid grid-cols-2 gap-2'>
              <Link href='/admin/seasons' className='p-3 bg-[#060d18] hover:bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-white transition-colors text-center'>
                <Plus className='w-5 h-5' />
                <span className='text-[10px] font-bold uppercase'>Yeni Sezon</span>
              </Link>
              <Link href='/admin/leagues' className='p-3 bg-[#060d18] hover:bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-white transition-colors text-center'>
                <Plus className='w-5 h-5' />
                <span className='text-[10px] font-bold uppercase'>Yeni Lig</span>
              </Link>
              <Link href='/admin/teams' className='p-3 bg-[#060d18] hover:bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-white transition-colors text-center'>
                <Plus className='w-5 h-5' />
                <span className='text-[10px] font-bold uppercase'>Yeni Takım</span>
              </Link>
              <Link href='/admin/fixtures' className='p-3 bg-[#060d18] hover:bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-2 text-cyan-500 hover:text-cyan-400 transition-colors text-center'>
                <Calendar className='w-5 h-5' />
                <span className='text-[10px] font-bold uppercase'>Fikstür Üret</span>
              </Link>
            </div>
          </div>
          
          <div className='card-surface p-4 rounded-xl border border-white/5 flex-1 flex flex-col justify-end'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase mb-4'>SİSTEM DURUMU</h3>
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Database className='w-4 h-4 text-zinc-500' />
                  <span className='text-xs text-zinc-400'>Database</span>
                </div>
                {isDbConnected ? <span className='px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded ring-1 inset-ring ring-emerald-500/30'>CONNECTED</span> : <span className='px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded ring-1 inset-ring ring-red-500/30'>UNAVAILABLE</span>}
              </div>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Lock className='w-4 h-4 text-zinc-500' />
                  <span className='text-xs text-zinc-400'>Auth</span>
                </div>
                <span className='px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded ring-1 inset-ring ring-emerald-500/30'>ACTIVE</span>
              </div>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Check className='w-4 h-4 text-zinc-500' />
                  <span className='text-xs text-zinc-400'>Admin Access</span>
                </div>
                <span className='px-2 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold rounded ring-1 inset-ring ring-cyan-500/30'>AUTHORIZED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

