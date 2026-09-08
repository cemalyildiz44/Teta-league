import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';

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
    // 2 & 3. Fetch approved transfers and teams concurrently (guaranteed safe, decoupled from team_memberships)
    const [{ data: transfers }, { data: teams }] = await Promise.all([
      supabase
        .from('transfers')
        .select('id, player_id, from_team_id, to_team_id, effective_at, created_at, profiles!transfers_player_id_fkey(username, avatar_url)')
        .eq('status', 'APPROVED')
        .eq('season_id', activeSeason.id)
        .order('effective_at', { ascending: false, nullsFirst: false })
        .limit(5),
      supabase.from('teams').select('id, name, logo_url, slug')
    ]);

    if (transfers && transfers.length > 0) {
      const teamMap = new Map((teams || []).map(t => [t.id, t]));

      formattedTransfers = transfers.map((t: any) => {
        const fromTeam = t.from_team_id ? teamMap.get(t.from_team_id) : null;
        const toTeam = teamMap.get(t.to_team_id);
        const profile = (t.profiles as any);
        const playerName = profile?.username || 'Bilinmiyor';
        const avatarUrl = profile?.avatar_url || null;

        const dateObj = new Date(t.effective_at || t.created_at);
        const dateStr = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }).toUpperCase()
          : '';

        return {
          id: t.id,
          playerName,
          avatarUrl,
          fromTeamName: fromTeam ? fromTeam.name : 'SERBEST',
          isFreeAgent: !fromTeam,
          toTeamName: toTeam?.name || 'Bilinmiyor',
          toTeamLogo: toTeam?.logo_url || null,
          toTeamSlug: toTeam?.slug || null,
          date: dateStr
        };
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-[900] tracking-wide text-white flex items-center gap-2 uppercase">
          <span className="w-2 h-2 rounded-full bg-[#00e5ff] shadow-[0_0_10px_#00e5ff]" />
          SON TRANSFERLER
        </h2>
      </div>

      <div className="space-y-2.5">
        {formattedTransfers.map((transfer) => (
          <div
            key={transfer.id}
            className="client-glass p-3.5 rounded-xl border border-white/5 border-l-2 border-l-[#00e5ff] hover:border-white/10 hover:bg-white/[0.02] transition-all relative overflow-hidden group space-y-2.5"
          >
            {/* ÜST SATIR: Oyuncu Avatarı + Adı + Tarih */}
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Oyuncu Profil Fotoğrafı (40x40) */}
                <div className="w-10 h-10 rounded-full bg-[#0a1628] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {transfer.avatarUrl ? (
                    <img
                      src={transfer.avatarUrl}
                      alt={transfer.playerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00e5ff]/20 to-transparent">
                      <span className="text-xs font-[900] text-[#00e5ff]">
                        {transfer.playerName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Oyuncu Adı & Rozet */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/oyuncular/${transfer.playerName}`}
                    className="text-[14px] font-[900] text-white hover:text-[#00e5ff] transition-colors truncate block tracking-wide"
                    title={transfer.playerName}
                  >
                    {transfer.playerName}
                  </Link>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                    Resmi Transfer
                  </span>
                </div>
              </div>

              {/* Tarih */}
              <span className="text-[10px] font-mono font-bold text-gray-400 bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded tracking-wider shrink-0">
                {transfer.date}
              </span>
            </div>

            {/* ALT SATIR: Transfer Hareketi (FROM → TRANSFER → TO [LOGO]) */}
            <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-white/5 text-[11px] font-bold min-w-0">
              {/* Kaynak: SERBEST veya Takım Adı */}
              <div className="min-w-0 flex-1">
                {transfer.isFreeAgent ? (
                  <span className="text-[10px] font-extrabold text-gray-500 tracking-wider">
                    SERBEST
                  </span>
                ) : (
                  <span
                    className="text-gray-400 truncate block text-[11px]"
                    title={transfer.fromTeamName}
                  >
                    {transfer.fromTeamName}
                  </span>
                )}
              </div>

              {/* TRANSFER Rozeti & Oklar */}
              <div className="flex items-center gap-1 shrink-0">
                <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-[900] tracking-widest uppercase bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 shadow-[0_0_8px_rgba(0,229,255,0.15)] shrink-0">
                  <ArrowRightLeft className="w-2.5 h-2.5 shrink-0" />
                  TRANSFER
                </span>
                <ArrowRight className="w-3 h-3 text-[#00e5ff] shrink-0" />
              </div>

              {/* Hedef Takım Adı & Logosu */}
              <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
                {transfer.toTeamSlug ? (
                  <Link
                    href={`/takim/${transfer.toTeamSlug}`}
                    className="text-white hover:text-[#00e5ff] transition-colors truncate text-right font-extrabold text-[11px] block"
                    title={transfer.toTeamName}
                  >
                    {transfer.toTeamName}
                  </Link>
                ) : (
                  <span
                    className="text-white truncate text-right font-extrabold text-[11px] block"
                    title={transfer.toTeamName}
                  >
                    {transfer.toTeamName}
                  </span>
                )}

                {/* Hedef Takım Logosu (24x24) */}
                <div className="w-6 h-6 rounded-full bg-[#0d1a2d] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {transfer.toTeamLogo ? (
                    <img
                      src={transfer.toTeamLogo}
                      alt={transfer.toTeamName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-black text-[#00e5ff]">
                      {transfer.toTeamName.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {formattedTransfers.length === 0 && (
          <div className="empty-state !py-6">
            <span className="empty-state-title text-[15px]">Transfer Yok</span>
          </div>
        )}
      </div>
    </div>
  );
}
