import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TransferInbox } from './TransferInbox';
import { LeaveTeamButton } from './LeaveTeamButton';

export default async function PlayerTransfersPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Active Season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'ACTIVE')
    .single();

  if (!activeSeason) {
    return <div className="p-8 text-center text-white">Aktif sezon bulunamadı.</div>;
  }

  // Check if player is CAPTAIN
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();
    
  const isCaptain = !!role;

  // Player's active membership
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('teams(name, logo_url)')
    .eq('player_id', user.id)
    .eq('season_id', activeSeason.id)
    .is('left_at', null)
    .maybeSingle();

  // Incoming transfers
  const { data: transfers } = await supabase
    .from('transfers')
    .select('id, status, created_at, teams!transfers_to_team_id_fkey(name, logo_url), seasons(name)')
    .eq('player_id', user.id)
    .eq('season_id', activeSeason.id)
    .order('created_at', { ascending: false });

  // Transfer Window status
  const { data: window } = await supabase
    .from('transfer_windows')
    .select('is_open')
    .eq('season_id', activeSeason.id)
    .maybeSingle();

  const isWindowOpen = window?.is_open ?? false;

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 lg:px-6">
        
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-2">TRANSFER KUTUSU</h1>
          <p className="text-gray-400 font-medium">Sana gelen transfer tekliflerini yönet.</p>
        </div>

        {membership && (() => {
          const mTeam = Array.isArray(membership.teams) ? membership.teams[0] : membership.teams;
          return (
            <div className="card-surface p-6 rounded-xl border border-white/5 mb-8 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">Mevcut Takımın</div>
                <div className="flex items-center gap-3">
                  {(mTeam as any)?.logo_url ? (
                    <img src={(mTeam as any).logo_url} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#0a1628] border border-white/5 flex items-center justify-center text-[10px] font-bold text-[#00e5ff]">
                      {(mTeam as any)?.name?.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold text-white text-lg">{(mTeam as any)?.name}</span>
                </div>
              </div>
            </div>
          );
        })()}

        <TransferInbox transfers={transfers || []} />

        {membership && !isCaptain && (
          <LeaveTeamButton seasonId={activeSeason.id} isWindowOpen={isWindowOpen} />
        )}
        
      </div>
    </main>
  );
}
