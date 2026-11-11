import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getActiveSeason, getCachedUser } from '@/lib/fetchers';
import TeamReplacementClient, { type ReplacementLeague, type ReplacementTeam } from './TeamReplacementClient';

export const metadata = {
  title: 'Takım Değişimi | TETA League Admin',
};

export default async function TeamReplacementPage() {
  const supabase = createClient(await cookies());

  const user = await getCachedUser();
  if (!user) redirect('/giris');
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();
  if (!adminRole) redirect('/');

  const season = await getActiveSeason();
  const [leaguesRes, leagueTeamsRes, teamsRes] = season
    ? await Promise.all([
        supabase.from('leagues').select('id, name, level').eq('season_id', season.id).order('level', { ascending: true }),
        supabase.from('league_teams').select('league_id, team_id, is_active').eq('season_id', season.id),
        supabase.from('teams').select('id, name, is_active').order('name', { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const teams = teamsRes.data || [];
  const teamName = new Map(teams.map((t) => [t.id, t.name as string]));
  const leagueTeams = leagueTeamsRes.data || [];
  const registered = new Set(leagueTeams.map((lt) => lt.team_id));

  const leagues: ReplacementLeague[] = (leaguesRes.data || []).map((league) => ({
    id: league.id,
    name: league.name,
    teams: leagueTeams
      .filter((lt) => lt.league_id === league.id && lt.is_active)
      .map((lt) => ({ id: lt.team_id, name: teamName.get(lt.team_id) || 'Takım' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
  }));
  // Entering team: active and not registered in any league this season
  const candidates: ReplacementTeam[] = teams
    .filter((t) => t.is_active && !registered.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className='max-w-3xl mx-auto space-y-8'>
      <div>
        <Link href='/admin/teams' className='text-xs font-bold text-zinc-500 hover:text-[#00e5ff] transition-colors'>
          ← Takım Yönetimi
        </Link>
        <h1 className='mt-3 text-2xl font-black text-white tracking-widest'>TAKIM DEĞİŞİMİ</h1>
        <p className='text-sm text-zinc-400 mt-1'>
          {season ? `${season.name} · ` : ''}Ligden çekilen takımın yerine yeni takımı alır. Çekilen takımın oynanmış maçları ve geçmişi korunur;
          puan tablosunda yerine giren takım, onun istatistikleriyle devam eder.
        </p>
      </div>
      <TeamReplacementClient leagues={leagues} candidates={candidates} />
    </div>
  );
}
