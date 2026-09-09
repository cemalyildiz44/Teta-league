'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, User, Trophy, ShieldAlert, CheckCircle2, X, Loader2, 
  ExternalLink, Award, FileText, Activity, Save
} from 'lucide-react';
import { updateBetaOldStatsAction, BetaOldStatsPayload } from './actions';

interface PlayerRecord {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  primary_position: string | null;
  alternative_positions: string[] | null;
  is_active: boolean;
  beta_registered: boolean;
  beta_old_stats: BetaOldStatsPayload | null;
  created_at: string;
  active_team: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  achievements: {
    id: string;
    achievement_type: string;
    awarded_at: string;
  }[];
}

interface PlayersManagerProps {
  players: PlayerRecord[];
}

export function PlayersManager({ players }: PlayersManagerProps) {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [betaFilter, setBetaFilter] = useState<'ALL' | 'BETA_YES' | 'BETA_NO'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'CONTRACTED' | 'FREE'>('ALL');

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Form state for controlled Beta Old Stats
  const [betaForm, setBetaForm] = useState<{
    matches_played: number;
    goals: number;
    assists: number;
    rating_avg: number;
    clean_sheets: number;
    red_cards: number;
    market_value: number;
    notes: string;
  }>({
    matches_played: 0,
    goals: 0,
    assists: 0,
    rating_avg: 6.0,
    clean_sheets: 0,
    red_cards: 0,
    market_value: 0,
    notes: ''
  });

  const openPlayerModal = (player: PlayerRecord) => {
    setSelectedPlayer(player);
    const existing = player.beta_old_stats || {} as any;
    setBetaForm({
      matches_played: Number(existing.matches_played) || 0,
      goals: Number(existing.goals) || 0,
      assists: Number(existing.assists) || 0,
      rating_avg: Number(existing.rating_avg) || 6.0,
      clean_sheets: Number(existing.clean_sheets) || 0,
      red_cards: Number(existing.red_cards) || 0,
      market_value: Number(existing.market_value) || 0,
      notes: typeof existing.notes === 'string' ? existing.notes : ''
    });
    setFeedback(null);
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setFeedback(null);
  };

  const handleSaveBetaStats = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;

    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('player_id', selectedPlayer.id);
    formData.append('matches_played', String(betaForm.matches_played));
    formData.append('goals', String(betaForm.goals));
    formData.append('assists', String(betaForm.assists));
    formData.append('rating_avg', String(betaForm.rating_avg));
    formData.append('clean_sheets', String(betaForm.clean_sheets));
    formData.append('red_cards', String(betaForm.red_cards));
    formData.append('market_value', String(betaForm.market_value));
    formData.append('notes', betaForm.notes);

    const res = await updateBetaOldStatsAction(formData);
    setLoading(false);

    if (res.error) {
      setFeedback({ msg: res.error, type: 'error' });
    } else {
      setFeedback({ msg: res.success || 'Başarıyla güncellendi.', type: 'success' });
      // Update local state
      setSelectedPlayer({
        ...selectedPlayer,
        beta_old_stats: {
          ...betaForm
        }
      });
      router.refresh();
    }
  };

  // Filtering
  const filteredPlayers = players.filter(player => {
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchUser = player.username?.toLowerCase().includes(q);
      const matchName = player.full_name?.toLowerCase().includes(q);
      if (!matchUser && !matchName) return false;
    }

    // Beta Filter
    if (betaFilter === 'BETA_YES' && !player.beta_registered) return false;
    if (betaFilter === 'BETA_NO' && player.beta_registered) return false;

    // Platform Filter
    if (platformFilter !== 'ALL' && player.platform !== platformFilter) return false;

    // Team Filter
    if (teamFilter === 'CONTRACTED' && !player.active_team) return false;
    if (teamFilter === 'FREE' && player.active_team) return false;

    return true;
  });

  const getAchievementBadgeColor = (type: string) => {
    switch (type) {
      case 'TOTW': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'MATCH_POTM': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'MONTH_POTM': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'POTS': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'KARMA_WINNER': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case '1V1_WINNER': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'NIGHT_CUP_WINNER': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      default: return 'bg-zinc-800 text-zinc-300 border-white/5';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a1628] p-6 rounded-2xl border border-white/5">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-3">
            OYUNCU YÖNETİMİ
            <span className="text-xs font-bold text-[#00e5ff] bg-[#00e5ff]/10 px-2.5 py-1 rounded-full border border-[#00e5ff]/20">
              {players.length} Toplam
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Kayıtlı oyuncular, platformlar, aktif takımlar, başarımlar ve Beta dönemi eski verileri.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-2 bg-[#060d18] border border-white/5 rounded-xl text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Beta Kaydı Olan</div>
            <div className="text-base font-black text-emerald-400">
              {players.filter(p => p.beta_registered).length}
            </div>
          </div>
          <div className="px-3 py-2 bg-[#060d18] border border-white/5 rounded-xl text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sözleşmeli</div>
            <div className="text-base font-black text-cyan-400">
              {players.filter(p => !!p.active_team).length}
            </div>
          </div>
          <div className="px-3 py-2 bg-[#060d18] border border-white/5 rounded-xl text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Serbest</div>
            <div className="text-base font-black text-zinc-400">
              {players.filter(p => !p.active_team).length}
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card-surface p-4 rounded-xl border border-white/5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Oyuncu ara..."
              className="w-full pl-9 pr-3 py-2 bg-[#060d18] border border-white/5 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5ff]"
            />
          </div>

          {/* Beta Filter */}
          <div>
            <select
              value={betaFilter}
              onChange={e => setBetaFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#060d18] border border-white/5 rounded-lg text-xs font-bold text-zinc-300 focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="ALL">BETA KAYDI: TÜMÜ</option>
              <option value="BETA_YES">BETA KAYDI OLANLAR</option>
              <option value="BETA_NO">BETA KAYDI OLMAYANLAR</option>
            </select>
          </div>

          {/* Platform Filter */}
          <div>
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#060d18] border border-white/5 rounded-lg text-xs font-bold text-zinc-300 focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="ALL">PLATFORM: TÜMÜ</option>
              <option value="common-gen5">Common Gen5</option>
              <option value="PC">PC</option>
              <option value="PS5">PlayStation 5</option>
              <option value="Xbox Series X">Xbox Series X</option>
              <option value="Xbox Series S">Xbox Series S</option>
            </select>
          </div>

          {/* Contract / Free Filter */}
          <div>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#060d18] border border-white/5 rounded-lg text-xs font-bold text-zinc-300 focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="ALL">TAKIM DURUMU: TÜMÜ</option>
              <option value="CONTRACTED">SÖZLEŞMELİ OYUNCULAR</option>
              <option value="FREE">SERBEST OYUNCULAR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#060d18] border-b border-white/5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                <th className="p-4">Oyuncu</th>
                <th className="p-4">Platform</th>
                <th className="p-4">Pozisyon</th>
                <th className="p-4">Aktif Takım</th>
                <th className="p-4 text-center">Beta Kaydı</th>
                <th className="p-4 text-center">Başarımlar</th>
                <th className="p-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-zinc-500 font-mono text-xs">
                    Filtrelere uygun oyuncu bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Oyuncu / Avatar */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          {player.avatar_url ? (
                            <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5 text-zinc-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            @{player.username}
                            {!player.is_active && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-bold border border-red-500/20">
                                PASİF
                              </span>
                            )}
                          </div>
                          {player.full_name && (
                            <div className="text-xs text-zinc-500">{player.full_name}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Platform */}
                    <td className="p-4">
                      <span className="text-xs font-mono text-zinc-400 bg-black/40 px-2 py-1 rounded border border-white/5">
                        {player.platform || 'Gen5'}
                      </span>
                    </td>

                    {/* Pozisyon */}
                    <td className="p-4">
                      <span className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                        {player.primary_position || '-'}
                      </span>
                    </td>

                    {/* Aktif Takım */}
                    <td className="p-4">
                      {player.active_team ? (
                        <div className="flex items-center gap-2">
                          {player.active_team.logo_url && (
                            <img src={player.active_team.logo_url} alt="" className="w-5 h-5 rounded object-cover" />
                          )}
                          <span className="text-xs font-bold text-zinc-300">{player.active_team.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-zinc-500 italic">Serbest</span>
                      )}
                    </td>

                    {/* Beta Kaydı */}
                    <td className="p-4 text-center">
                      {player.beta_registered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> EVET
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-zinc-800 text-zinc-500 border border-white/5">
                          HAYIR
                        </span>
                      )}
                    </td>

                    {/* Başarımlar */}
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                        <Trophy className="w-3 h-3" /> {player.achievements.length}
                      </span>
                    </td>

                    {/* İşlem */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openPlayerModal(player)}
                        className="px-3 py-1.5 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] text-xs font-black rounded-lg border border-[#00e5ff]/30 transition-all tracking-wider uppercase"
                      >
                        İNCELE / BETA
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Player Detail & Beta Old Stats Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card-surface w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex items-start justify-between shrink-0 bg-[#060d18]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedPlayer.avatar_url ? (
                    <img src={selectedPlayer.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-7 h-7 text-zinc-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-wide">
                    @{selectedPlayer.username}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-black uppercase text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      {selectedPlayer.primary_position || 'Pozisyon Yok'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                      {selectedPlayer.platform || 'Gen5'}
                    </span>
                    {selectedPlayer.beta_registered ? (
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        BETA KAYITLI
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                        BETA KAYITSIZ
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={closePlayerModal}
                className="p-2 text-zinc-500 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {feedback && (
                <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  {feedback.type === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{feedback.msg}</span>
                </div>
              )}

              {/* Player Overview Card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#060d18] p-4 rounded-xl border border-white/5">
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Aktif Takım</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {selectedPlayer.active_team ? selectedPlayer.active_team.name : 'Serbest Oyuncu'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ad Soyad</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {selectedPlayer.full_name || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Kayıt Tarihi</div>
                  <div className="text-sm font-mono text-zinc-300 mt-0.5">
                    {new Date(selectedPlayer.created_at).toLocaleDateString('tr-TR')}
                  </div>
                </div>
              </div>

              {/* Achievements Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-zinc-400 tracking-widest uppercase flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    KAZANILAN BAŞARIMLAR ({selectedPlayer.achievements.length})
                  </h4>
                </div>
                {selectedPlayer.achievements.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic bg-[#060d18] p-3 rounded-lg border border-white/5">
                    Henüz kayıtlı bir başarım bulunmuyor.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedPlayer.achievements.map((ach) => (
                      <span 
                        key={ach.id}
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${getAchievementBadgeColor(ach.achievement_type)}`}
                      >
                        {ach.achievement_type.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* BETA OLD STATS FORM (Controlled fields only) */}
              <div className="border-t border-white/5 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-black text-[#00e5ff] tracking-widest uppercase flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      BETA DÖNEMİ ESKİ KAYITLARI
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Eski TETA Beta sitesinden aktarılacak geçmiş istatistikler. Resmi lig verilerine karıştırılmaz.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveBetaStats} className="space-y-4 bg-[#060d18] p-5 rounded-xl border border-white/5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Maç Sayısı */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Oynanan Maç
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={betaForm.matches_played}
                        onChange={e => setBetaForm({ ...betaForm, matches_played: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>

                    {/* Gol */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Gol
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={betaForm.goals}
                        onChange={e => setBetaForm({ ...betaForm, goals: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>

                    {/* Asist */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Asist
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={betaForm.assists}
                        onChange={e => setBetaForm({ ...betaForm, assists: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>

                    {/* Rating Ortalama */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Ort. Rating (0-10)
                      </label>
                      <input 
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={betaForm.rating_avg}
                        onChange={e => setBetaForm({ ...betaForm, rating_avg: Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* Clean Sheet */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Gol Yememe (CS)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={betaForm.clean_sheets}
                        onChange={e => setBetaForm({ ...betaForm, clean_sheets: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>

                    {/* Kırmızı Kart */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Kırmızı Kart
                      </label>
                      <input 
                        type="number"
                        min="0"
                        value={betaForm.red_cards}
                        onChange={e => setBetaForm({ ...betaForm, red_cards: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>

                    {/* Eski Piyasa Değeri */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Eski Piyasa Değeri (€)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        step="10000"
                        value={betaForm.market_value}
                        onChange={e => setBetaForm({ ...betaForm, market_value: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="input-field text-sm py-1.5"
                      />
                    </div>
                  </div>

                  {/* Notlar */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Beta Notu / Sezon Bilgisi (Maksimum 500 karakter)
                    </label>
                    <input 
                      type="text"
                      maxLength={500}
                      value={betaForm.notes}
                      onChange={e => setBetaForm({ ...betaForm, notes: e.target.value })}
                      placeholder="Örn: Beta 1. Sezon En İyi Orta Saha Şampiyonu"
                      className="input-field text-sm py-1.5"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary px-5 py-2.5 text-xs font-black flex items-center gap-2 tracking-widest uppercase"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          KAYDEDİLİYOR...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          BETA VERİLERİNİ KAYDET
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-[#060d18] flex items-center justify-between shrink-0">
              <a
                href={`/oyuncular/${selectedPlayer.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Kamu Profilini Görüntüle
              </a>
              <button
                type="button"
                onClick={closePlayerModal}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
