import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PlayerStatsForm } from './PlayerStatsForm';

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const matchId = resolvedParams.id;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Verify Captain
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  if (!role || !role.team_id) redirect('/profil');
  const teamId = role.team_id;

  const { data: match } = await supabase
    .from('matches')
    .select('*, fixtures(week_number)')
    .eq('id', matchId)
    .single();

  if (!match) return <div className="p-8 text-white">Maç bulunamadı.</div>;

  if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
    return <div className="p-8 text-red-500">Bu maçı inceleme yetkiniz yok.</div>;
  }

  const { data: homeTeam } = await supabase.from('teams').select('name, logo_url').eq('id', match.home_team_id).single();
  const { data: awayTeam } = await supabase.from('teams').select('name, logo_url').eq('id', match.away_team_id).single();

  // Fetch Roster (active members for this season)
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('profiles:player_id(id, username)')
    .eq('team_id', teamId)
    .eq('season_id', match.season_id)
    .is('left_at', null);

  const roster = (memberships || []).map((m: any) => m.profiles);

  // Fetch existing stats for THIS team
  const { data: existingStats } = await supabase
    .from('match_player_stats')
    .select('*')
    .eq('match_id', matchId)
    .eq('team_id', teamId);

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-1">MAÇ DETAYI / İSTATİSTİK GİRİŞİ</h1>
            <p className="text-sm font-bold text-gray-400">
              Hafta {(match.fixtures as any)?.week_number} • {new Date(match.played_at).toLocaleString('tr-TR')}
            </p>
          </div>
          <Link href="/takim/yonet/maclar" className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black rounded tracking-widest hover:bg-white/10 transition-all">
            GERİ DÖN
          </Link>
        </div>

        {/* Scoreboard */}
        <div className="card-surface p-6 rounded-xl border border-white/5 mb-8">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">Ev Sahibi</span>
              <span className="text-xl font-black text-white text-center">{homeTeam?.name}</span>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4 bg-[#0a1628] px-6 py-4 rounded-xl border border-white/10">
                <span className="text-3xl font-black text-white">{match.home_score}</span>
                <span className="text-xl font-black text-gray-600">-</span>
                <span className="text-3xl font-black text-white">{match.away_score}</span>
              </div>
              <span className={`mt-3 px-2 py-1 rounded text-[10px] font-black tracking-widest uppercase ${
                match.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' :
                match.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' :
                'bg-yellow-500/10 text-yellow-500'
              }`}>
                {match.status}
              </span>
            </div>

            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">Deplasman</span>
              <span className="text-xl font-black text-white text-center">{awayTeam?.name}</span>
            </div>
          </div>
        </div>

        {/* Notes & Screenshot */}
        {(match.notes || match.screenshot_url) && (
          <div className="card-surface p-6 rounded-xl border border-white/5 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">Maç Notları</h4>
              <p className="text-sm text-gray-300">{match.notes || '-'}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">Kanıt (Screenshot)</h4>
              {match.screenshot_url ? (
                <div className="space-y-2">
                  <div className="relative max-h-48 max-w-sm rounded-lg overflow-hidden border border-white/10 bg-black/40">
                    <img src={match.screenshot_url} alt="Kanıt Görseli" className="max-h-48 w-auto object-contain rounded-lg" />
                  </div>
                  <a href={match.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-[#00e5ff] text-xs font-bold hover:underline inline-flex items-center gap-1">
                    Tam Boyut Aç &rarr;
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-500">-</p>
              )}
            </div>
          </div>
        )}

        {/* Stats Form */}
        {match.status === 'PENDING_REVIEW' ? (
          <PlayerStatsForm matchId={matchId} roster={roster} existingStats={existingStats || []} />
        ) : (
          <div className="card-surface p-8 text-center rounded-xl border border-white/5">
            <span className="text-gray-500 text-sm font-medium italic">Bu maç {match.status} durumunda olduğu için istatistikler değiştirilemez.</span>
          </div>
        )}
      </div>
    </main>
  );
}
