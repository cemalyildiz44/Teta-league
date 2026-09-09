import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlayerSearch } from './PlayerSearch';
import { RosterManagement } from './RosterManagement';
import { TeamSocialsForm } from './TeamSocialsForm';
import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';

export default async function TeamManagementPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Find active CAPTAIN role
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  if (!role || !role.team_id) {
    redirect('/profil');
  }

  const teamId = role.team_id;

  // Active Season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name, roster_min, roster_max')
    .eq('status', 'ACTIVE')
    .single();

  if (!activeSeason) {
    return <div className="p-8 text-center text-white">Aktif sezon bulunamadı.</div>;
  }

  // Active League for this team
  const { data: leagueTeam } = await supabase
    .from('league_teams')
    .select('league_id, leagues(name)')
    .eq('team_id', teamId)
    .eq('season_id', activeSeason.id)
    .maybeSingle();

  // Fetch active penalties for this team's current season
  const { data: teamPenalties } = await supabase
    .from('team_penalties')
    .select('id, penalty_type, points_deducted, violation_order, reason, issued_at, is_revoked')
    .eq('team_id', teamId)
    .eq('season_id', activeSeason.id)
    .eq('is_revoked', false)
    .order('issued_at', { ascending: false });

  // Team Details
  const { data: team } = await supabase
    .from('teams')
    .select('name, logo_url, stream_url, instagram_url')
    .eq('id', teamId)
    .single();

  // Transfer Window
  const { data: window } = await supabase
    .from('transfer_windows')
    .select('id, is_open')
    .eq('season_id', activeSeason.id)
    .maybeSingle();
    
  const isWindowOpen = window?.is_open ?? false;
  const transferWindowId = window?.id || null;

  // Roster (team_memberships)
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('id, joined_at, profiles:player_id(id, username, current_ea_player_id, avatar_url)')
    .eq('team_id', teamId)
    .eq('season_id', activeSeason.id)
    .is('left_at', null)
    .order('joined_at', { ascending: true });

  // Pending Transfers (Outgoing)
  const { data: pendingTransfers } = await supabase
    .from('transfers')
    .select('id, status, created_at, profiles:player_id(username)')
    .eq('to_team_id', teamId)
    .eq('season_id', activeSeason.id)
    .order('created_at', { ascending: false });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_PLAYER': return <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded text-[10px] font-bold">OYUNCU ONAYI BEKLİYOR</span>;
      case 'PENDING_ADMIN': return <span className="px-2 py-1 bg-purple-500/10 text-purple-500 border border-purple-500/30 rounded text-[10px] font-bold">YÖNETİCİ ONAYI BEKLİYOR</span>;
      case 'APPROVED': return <span className="px-2 py-1 bg-green-500/10 text-green-500 border border-green-500/30 rounded text-[10px] font-bold">TAMAMLANDI</span>;
      case 'REJECTED': return <span className="px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/30 rounded text-[10px] font-bold">REDDEDİLDİ</span>;
      default: return <span className="px-2 py-1 bg-gray-500/10 text-gray-500 border border-gray-500/30 rounded text-[10px] font-bold">{status}</span>;
    }
  };

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        
        {/* Header */}
        <div className="card-surface p-8 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center gap-6 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff]/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/4" />
          
          <TeamLogo src={team?.logo_url} name={team?.name} size="xl" />

          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl font-black text-white tracking-widest">{team?.name}</h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
              <span className="text-sm font-bold text-[#00e5ff] bg-[#00e5ff]/10 px-3 py-1 rounded border border-[#00e5ff]/20">
                {activeSeason.name}
              </span>
              <span className="text-sm font-medium text-gray-400">
                {(Array.isArray(leagueTeam?.leagues) ? leagueTeam?.leagues[0] : leagueTeam?.leagues as any)?.name || 'Lig Atanmadı'}
              </span>
            </div>
            
            <div className="mt-4">
              <Link href={`/takim/yonet/maclar`} className="inline-block px-4 py-2 bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] text-xs font-black rounded-lg tracking-widest hover:bg-[#00e5ff]/20 transition-all">
                MAÇLARI YÖNET &rarr;
              </Link>
            </div>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-2 mt-6 md:mt-0">
            <div className="text-right">
              <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Kadro Durumu</div>
              <div className="text-xl font-black text-white">
                {memberships?.length || 0} <span className="text-sm text-gray-500">/ {activeSeason.roster_max}</span>
              </div>
            </div>
            <div className="text-[10px] font-medium text-gray-500">Min: {activeSeason.roster_min}</div>
            {isWindowOpen ? (
              <span className="text-[10px] font-bold text-green-500 flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> TRANSFER AÇIK
              </span>
            ) : (
              <span className="text-[10px] font-bold text-red-500 mt-1">TRANSFER KAPALI</span>
            )}
          </div>
        </div>

        {/* Penalty Info (Read-only) */}
        {teamPenalties && teamPenalties.length > 0 && (
          <div className="card-surface p-6 rounded-2xl border border-red-500/20 bg-red-500/5 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-red-400 text-lg">⚠</span>
              <h3 className="text-sm font-black text-red-400 tracking-widest uppercase">CEZA BİLGİSİ</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Aktif Ceza</div>
                <div className="text-2xl font-black text-red-400 mt-1">{teamPenalties.length}</div>
              </div>
              <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Toplam Puan Kesintisi</div>
                <div className="text-2xl font-black text-orange-400 mt-1">
                  -{teamPenalties.reduce((sum, p) => sum + (p.points_deducted || 0), 0)}
                </div>
              </div>
              <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">İhraç Durumu</div>
                <div className="text-2xl font-black mt-1">
                  {teamPenalties.some(p => p.penalty_type === 'EXPULSION') ? (
                    <span className="text-red-500">İHRAÇ</span>
                  ) : (
                    <span className="text-green-400">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {teamPenalties.slice(0, 3).map(p => {
                const typeLabels: Record<string, string> = {
                  WARNING: 'UYARI',
                  POINTS_DEDUCTION: 'PUAN CEZASI',
                  EXPULSION: 'İHRAÇ',
                };
                const typeColors: Record<string, string> = {
                  WARNING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
                  POINTS_DEDUCTION: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
                  EXPULSION: 'text-red-400 bg-red-500/10 border-red-500/30',
                };
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest border ${typeColors[p.penalty_type] || ''}`}>
                      {typeLabels[p.penalty_type] || p.penalty_type}
                    </span>
                    <span className="text-xs text-gray-500">#{p.violation_order}</span>
                    {p.points_deducted > 0 && (
                      <span className="text-xs text-orange-400 font-bold">-{p.points_deducted} puan</span>
                    )}
                    <span className="text-xs text-gray-400 flex-1 truncate">{p.reason}</span>
                    <span className="text-[10px] text-gray-600">{new Date(p.issued_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Search & Roster & Socials */}
          <div className="lg:col-span-2 space-y-8">
            <TeamSocialsForm
              teamId={teamId}
              initialStreamUrl={team?.stream_url}
              initialInstagramUrl={team?.instagram_url}
            />

            <PlayerSearch 
              teamId={teamId} 
              seasonId={activeSeason.id} 
              transferWindowId={transferWindowId}
              isWindowOpen={isWindowOpen} 
            />
            
            <RosterManagement 
              memberships={memberships || []} 
              seasonId={activeSeason.id} 
              isWindowOpen={isWindowOpen}
              captainId={user.id}
            />
          </div>

          {/* Right Column: Pending Transfers */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-white tracking-widest px-2">TRANSFER GEÇMİŞİ</h3>
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
              {(!pendingTransfers || pendingTransfers.length === 0) ? (
                <div className="p-6 text-center text-sm text-gray-500 italic font-medium">
                  Hiç transfer kaydı yok.
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {pendingTransfers.map((tx) => (
                    <div key={tx.id} className="p-4 bg-[#060d18] hover:bg-[#0a1628] transition-colors">
                      <div className="font-bold text-white text-sm mb-1">{(Array.isArray(tx.profiles) ? tx.profiles[0] : tx.profiles as any)?.username}</div>
                      <div className="flex items-center justify-between mt-2">
                        {getStatusBadge(tx.status)}
                        <span className="text-[10px] text-gray-500 font-medium">{new Date(tx.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
