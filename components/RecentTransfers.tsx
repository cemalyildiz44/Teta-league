import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export default async function RecentTransfers() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'ACTIVE')
    .single();

  let formattedTransfers: any[] = [];

  if (activeSeason) {
    // 2 & 3. Fetch approved transfers and teams concurrently
    const [ { data: transfers }, { data: teams } ] = await Promise.all([
      supabase.from('transfers').select('id, player_id, from_team_id, to_team_id, effective_at, created_at, profiles!transfers_player_id_fkey(username)').eq('status', 'APPROVED').eq('season_id', activeSeason.id).order('effective_at', { ascending: false, nullsFirst: false }).limit(5),
      supabase.from('teams').select('id, name')
    ]);

    if (transfers && transfers.length > 0) {
      const teamMap = new Map((teams || []).map(t => [t.id, t.name]));

      formattedTransfers = transfers.map((t: any) => {
        const fromTeamName = t.from_team_id ? teamMap.get(t.from_team_id) : null;
        const toTeamName = teamMap.get(t.to_team_id) || 'Bilinmiyor';
        
        return {
          id: t.id,
          playerName: (t.profiles as any)?.username || 'Bilinmiyor',
          fromTeam: fromTeamName,
          toTeam: toTeamName,
          date: new Date(t.effective_at || t.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
        };
      });
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[24px] font-[800] tracking-wide text-white">SON TRANSFERLER</h2>

      <div className="space-y-2">
        {formattedTransfers.map((transfer) => (
          <div key={transfer.id} className="client-glass !p-4 border-l-2 border-l-[#00e5ff] hover:bg-white/5 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[15px] font-[800] text-white truncate max-w-[150px]">{transfer.playerName}</span>
              <span className="data-label !text-[9px] shrink-0">{transfer.date}</span>
            </div>
            
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
              {transfer.fromTeam ? (
                <span className="text-gray-400 truncate max-w-[80px]" title={transfer.fromTeam}>{transfer.fromTeam}</span>
              ) : (
                <span className="text-gray-500">SERBEST</span>
              )}
              <svg className="w-3 h-3 text-[#00e5ff] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="text-[#00e5ff] truncate max-w-[80px]" title={transfer.toTeam}>{transfer.toTeam}</span>
            </div>
          </div>
        ))}

        {formattedTransfers.length === 0 && (
          <div className="empty-state !py-6"><span className="empty-state-title text-[15px]">Transfer Yok</span></div>
        )}
      </div>
    </div>
  );
}
