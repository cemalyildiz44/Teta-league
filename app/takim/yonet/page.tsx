import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlayerSearch } from './PlayerSearch';
import { RosterManagement } from './RosterManagement';
import { TeamSocialsForm } from './TeamSocialsForm';
import Link from 'next/link';

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
    .select('leagues(name)')
    .eq('team_id', teamId)
    .eq('season_id', activeSeason.id)
    .maybeSingle();

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
          
          {team?.logo_url ? (
            <img src={team.logo_url} alt="" className="w-24 h-24 rounded-full object-cover border border-[#00e5ff]/30 shadow-[0_0_20px_rgba(0,229,255,0.2)]" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#0a1628] flex items-center justify-center text-3xl font-black text-[#00e5ff] shadow-[0_0_20px_rgba(0,229,255,0.2)]">
              {team?.name.slice(0, 2).toUpperCase()}
            </div>
          )}

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
