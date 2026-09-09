'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, User, Trophy, ShieldAlert, CheckCircle2, X, Loader2,
  ExternalLink, Award, FileText, Save,
  Plus, Edit2, Trash2, Calendar, Shield, AlertTriangle
} from 'lucide-react';
import {
  addPlayerLegacyCareerAction,
  updatePlayerLegacyCareerAction,
  deletePlayerLegacyCareerAction,
  PlayerLegacyCareerStat,
  updatePlayerAccountAdminAction,
  PlayerAccountStatus
} from './actions';
import TeamLogo from '@/components/TeamLogo';

export interface TeamOption {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
}

interface PlayerRecord {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  primary_position: string | null;
  alternative_positions: string[] | null;
  is_active: boolean;
  status: PlayerAccountStatus;
  current_ea_player_id: string | null;
  beta_registered: boolean;
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
  legacy_stats: PlayerLegacyCareerStat[];
}

interface PlayersManagerProps {
  players: PlayerRecord[];
  teams: TeamOption[];
}

export function PlayersManager({ players, teams }: PlayersManagerProps) {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [betaFilter, setBetaFilter] = useState<'ALL' | 'BETA_YES' | 'BETA_NO'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'CONTRACTED' | 'FREE'>('ALL');

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Synchronize selectedPlayer with updated players prop when router.refresh triggers
  useEffect(() => {
    if (selectedPlayer) {
      const updated = players.find(p => p.id === selectedPlayer.id);
      if (updated) {
        setSelectedPlayer(updated);
      }
    }
  }, [players]);

  // Player Account Management State
  const [accountUsername, setAccountUsername] = useState('');
  const [accountEaId, setAccountEaId] = useState('');
  const [accountStatus, setAccountStatus] = useState<PlayerAccountStatus>('ACTIVE');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [banConfirmOpen, setBanConfirmOpen] = useState(false);

  // Legacy Career Stats State
  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [editingLegacyStat, setEditingLegacyStat] = useState<PlayerLegacyCareerStat | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyFeedback, setLegacyFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [deleteConfirmStatId, setDeleteConfirmStatId] = useState<string | null>(null);

  const initialLegacyForm = {
    season_name: '',
    league_name: '',
    team_mode: 'EXISTING' as 'EXISTING' | 'CUSTOM',
    team_id: teams[0]?.id || '',
    custom_team_name: '',
    matches_played: 0,
    goals: 0,
    assists: 0,
    rating_avg: 7.0
  };

  const [legacyForm, setLegacyForm] = useState(initialLegacyForm);

  const openAddLegacyModal = () => {
    setEditingLegacyStat(null);
    setLegacyForm({
      ...initialLegacyForm,
      team_id: teams[0]?.id || ''
    });
    setLegacyFeedback(null);
    setLegacyModalOpen(true);
  };

  const openEditLegacyModal = (stat: PlayerLegacyCareerStat) => {
    setEditingLegacyStat(stat);
    setLegacyForm({
      season_name: stat.season_name,
      league_name: stat.league_name,
      team_mode: stat.team_id ? 'EXISTING' : 'CUSTOM',
      team_id: stat.team_id || (teams[0]?.id || ''),
      custom_team_name: stat.team_id ? '' : stat.team_name,
      matches_played: stat.matches_played,
      goals: stat.goals,
      assists: stat.assists,
      rating_avg: Number(stat.rating_avg)
    });
    setLegacyFeedback(null);
    setLegacyModalOpen(true);
  };

  const closeLegacyModal = () => {
    setLegacyModalOpen(false);
    setEditingLegacyStat(null);
    setLegacyFeedback(null);
  };

  const handleSaveLegacyStat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;

    setLegacyLoading(true);
    setLegacyFeedback(null);

    const formData = new FormData();
    formData.append('season_name', legacyForm.season_name);
    formData.append('league_name', legacyForm.league_name);
    formData.append('team_mode', legacyForm.team_mode);
    if (legacyForm.team_mode === 'EXISTING') {
      formData.append('team_id', legacyForm.team_id);
    } else {
      formData.append('custom_team_name', legacyForm.custom_team_name.trim());
      formData.append('team_name', legacyForm.custom_team_name.trim());
    }
    formData.append('matches_played', String(legacyForm.matches_played));
    formData.append('goals', String(legacyForm.goals));
    formData.append('assists', String(legacyForm.assists));
    formData.append('rating_avg', String(legacyForm.rating_avg));

    let res;
    if (editingLegacyStat) {
      res = await updatePlayerLegacyCareerAction(editingLegacyStat.id, formData);
    } else {
      formData.append('player_id', selectedPlayer.id);
      res = await addPlayerLegacyCareerAction(selectedPlayer.id, formData);
    }

    setLegacyLoading(false);

    if (res.error) {
      setLegacyFeedback({ msg: res.error, type: 'error' });
    } else {
      setFeedback({ msg: res.success || 'İşlem başarılı.', type: 'success' });
      closeLegacyModal();
      router.refresh();
    }
  };

  const handleDeleteLegacyStat = async (statId: string) => {
    if (!selectedPlayer) return;
    setLegacyLoading(true);

    const res = await deletePlayerLegacyCareerAction(statId);
    setLegacyLoading(false);
    setDeleteConfirmStatId(null);

    if (res.error) {
      setFeedback({ msg: res.error, type: 'error' });
    } else {
      setFeedback({ msg: res.success || 'Kayıt başarıyla silindi (arşivlendi).', type: 'success' });
      setSelectedPlayer({
        ...selectedPlayer,
        legacy_stats: selectedPlayer.legacy_stats.filter(s => s.id !== statId)
      });
      router.refresh();
    }
  };

  const openPlayerModal = (player: PlayerRecord) => {
    setSelectedPlayer(player);
    setAccountUsername(player.username || '');
    setAccountEaId(player.current_ea_player_id || '');
    setAccountStatus(player.status || (player.is_active ? 'ACTIVE' : 'SUSPENDED'));
    setAccountFeedback(null);
    setBanConfirmOpen(false);
    setFeedback(null);
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setFeedback(null);
    setAccountFeedback(null);
    setBanConfirmOpen(false);
  };

  const handleSaveAccount = async (e?: React.FormEvent, forceBan = false) => {
    if (e) e.preventDefault();
    if (!selectedPlayer) return;

    // Trigger confirmation modal if changing to BANNED
    if (accountStatus === 'BANNED' && selectedPlayer.status !== 'BANNED' && !forceBan) {
      setBanConfirmOpen(true);
      return;
    }

    setAccountLoading(true);
    setAccountFeedback(null);

    const formData = new FormData();
    formData.append('player_id', selectedPlayer.id);
    formData.append('username', accountUsername);
    formData.append('current_ea_player_id', accountEaId);
    formData.append('status', accountStatus);

    const res = await updatePlayerAccountAdminAction(formData);
    setAccountLoading(false);

    if (res.error) {
      setAccountFeedback({ msg: res.error, type: 'error' });
    } else {
      setAccountFeedback({ msg: res.success || 'Hesap bilgileri başarıyla güncellendi.', type: 'success' });
      setBanConfirmOpen(false);
      setSelectedPlayer({
        ...selectedPlayer,
        username: accountUsername,
        current_ea_player_id: accountEaId.trim() ? accountEaId.trim() : null,
        status: accountStatus,
        is_active: accountStatus === 'ACTIVE'
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
                            {player.status === 'BANNED' ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-black border border-red-500/20">
                                BANLI
                              </span>
                            ) : player.status === 'SUSPENDED' || !player.is_active ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                                ASKIDA
                              </span>
                            ) : null}
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
                          <TeamLogo
                            src={player.active_team.logo_url}
                            name={player.active_team.name}
                            size="xs"
                          />
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
                    {selectedPlayer.status === 'BANNED' ? (
                      <span className="text-[10px] font-black uppercase text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        BANLI
                      </span>
                    ) : selectedPlayer.status === 'SUSPENDED' || !selectedPlayer.is_active ? (
                      <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        ASKIDA
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        AKTİF
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

              {/* OYUNCU HESAP & ERİŞİM YÖNETİMİ */}
              <div className="bg-[#060d18] p-5 rounded-xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-[#00e5ff] tracking-widest uppercase flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" />
                      HESAP & ERİŞİM YÖNETİMİ
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Kullanıcı adı, EA ID ve hesap aktiflik/yasaklama durumunu buradan yönetebilirsiniz.
                    </p>
                  </div>
                </div>

                {accountFeedback && (
                  <div className={`p-3 rounded-lg text-xs font-bold flex items-center gap-2 ${accountFeedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {accountFeedback.type === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    <span>{accountFeedback.msg}</span>
                  </div>
                )}

                <form onSubmit={(e) => handleSaveAccount(e)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Kullanıcı Adı */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        Kullanıcı Adı
                      </label>
                      <input
                        type="text"
                        required
                        value={accountUsername}
                        onChange={e => setAccountUsername(e.target.value)}
                        placeholder="kullanici_adi"
                        className="input-field text-sm py-2 font-mono"
                      />
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Harf, rakam, alt çizgi, nokta ve tire içerebilir (3-30 karakter).
                      </p>
                    </div>

                    {/* EA ID */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        EA ID (Pro Clubs)
                      </label>
                      <input
                        type="text"
                        value={accountEaId}
                        onChange={e => setAccountEaId(e.target.value)}
                        placeholder="Örn: EA_Player_99"
                        className="input-field text-sm py-2 font-mono"
                      />
                      <p className="text-[10px] text-zinc-500 mt-1">
                        EA maç istatistiklerinin oyuncuyla eşleşmesini sağlar.
                      </p>
                    </div>
                  </div>

                  {/* Hesap Durumu */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Hesap Durumu
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* AKTİF */}
                      <button
                        type="button"
                        onClick={() => setAccountStatus('ACTIVE')}
                        className={`p-3 rounded-xl border text-left transition-all ${accountStatus === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 ring-1 ring-emerald-500/50' : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'}`}
                      >
                        <div className="flex items-center gap-2 font-black text-xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          AKTİF
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 leading-snug">
                          Normal erişim. Giriş yapabilir, transfer & maç aktif.
                        </div>
                      </button>

                      {/* ASKIDA */}
                      <button
                        type="button"
                        onClick={() => setAccountStatus('SUSPENDED')}
                        className={`p-3 rounded-xl border text-left transition-all ${accountStatus === 'SUSPENDED' ? 'bg-amber-500/10 border-amber-500 text-amber-400 ring-1 ring-amber-500/50' : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'}`}
                      >
                        <div className="flex items-center gap-2 font-black text-xs">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          ASKIDA
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 leading-snug">
                          Kısıtlı hesap. Giriş yapabilir; transfer & maç engelli.
                        </div>
                      </button>

                      {/* BANLI */}
                      <button
                        type="button"
                        onClick={() => setAccountStatus('BANNED')}
                        className={`p-3 rounded-xl border text-left transition-all ${accountStatus === 'BANNED' ? 'bg-red-500/10 border-red-500 text-red-400 ring-1 ring-red-500/50' : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'}`}
                      >
                        <div className="flex items-center gap-2 font-black text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-400" />
                          BANLI
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 leading-snug">
                          Yasaklı hesap. Giriş engelli. Takım üyeliği korunur.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={accountLoading}
                      className="btn-primary px-5 py-2.5 text-xs font-black flex items-center gap-2 tracking-widest uppercase"
                    >
                      {accountLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          GÜNCELLENİYOR...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          HESAP BİLGİLERİNİ GÜNCELLE
                        </>
                      )}
                    </button>
                  </div>
                </form>
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

              {/* KARİYER GEÇMİŞİ (ESKİ SEZONLAR) */}
              <div className="border-t border-white/5 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-black text-[#00e5ff] tracking-widest uppercase flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      KARİYER GEÇMİŞİ (ESKİ SEZONLAR) ({selectedPlayer.legacy_stats?.length || 0})
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Önceki sezonlara ait takım ve maç performansları. Public profilde Sezonlar sekmesine ve kariyer toplamlarına dahil edilir.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddLegacyModal}
                    className="px-3 py-1.5 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] text-xs font-bold rounded-lg border border-[#00e5ff]/30 flex items-center gap-1.5 transition-all tracking-wider shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    YENİ SEZON EKLE
                  </button>
                </div>

                {!selectedPlayer.legacy_stats || selectedPlayer.legacy_stats.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#060d18] border border-white/5 text-center text-xs text-zinc-500 italic">
                    Henüz kayıtlı bir eski kariyer sezonu bulunmuyor. Yeni sezon performansı eklemek için yukarıdaki &quot;Yeni Sezon Ekle&quot; butonunu kullanın.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedPlayer.legacy_stats.map((stat) => {
                      const linkedTeam = stat.team_id ? teams.find(t => t.id === stat.team_id) : null;
                      const teamLogo = linkedTeam?.logo_url;
                      const contribution = (Number(stat.matches_played) > 0)
                        ? ((Number(stat.goals) + Number(stat.assists)) / Number(stat.matches_played)).toFixed(2)
                        : '0.00';

                      return (
                        <div key={stat.id} className="p-4 rounded-xl bg-[#060d18] border border-white/5 hover:border-white/10 transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                            <div className="flex items-center gap-3">
                              <TeamLogo src={teamLogo} name={stat.team_name} size="md" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-white">{stat.team_name}</span>
                                  {stat.team_id ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                      SİSTEM TAKIMI
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/5">
                                      TARİHSEL / ÖZEL
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                                  <span className="font-bold text-amber-400">{stat.season_name}</span>
                                  <span className="text-zinc-600">•</span>
                                  <span>{stat.league_name}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => openEditLegacyModal(stat)}
                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmStatId(stat.id)}
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Sil (Arşivle)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 text-center">
                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase">Maç</div>
                              <div className="text-xs font-black text-white mt-0.5">{stat.matches_played}</div>
                            </div>
                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase">Gol</div>
                              <div className="text-xs font-black text-white mt-0.5">{stat.goals}</div>
                            </div>
                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase">Asist</div>
                              <div className="text-xs font-black text-white mt-0.5">{stat.assists}</div>
                            </div>
                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase">Ort. Rating</div>
                              <div className="text-xs font-black text-[#00e5ff] mt-0.5">★ {Number(stat.rating_avg).toFixed(2)}</div>
                            </div>
                            <div className="bg-black/30 p-2 rounded-lg border border-white/5 col-span-2 sm:col-span-1">
                              <div className="text-[9px] font-bold text-zinc-500 uppercase">Katkı / Maç</div>
                              <div className="text-xs font-black text-emerald-400 mt-0.5">{contribution}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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

      {/* Legacy Career Stat Add/Edit Modal */}
      {legacyModalOpen && selectedPlayer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="card-surface w-full max-w-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[95vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-[#060d18] shrink-0">
              <div>
                <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#00e5ff]" />
                  {editingLegacyStat ? 'Eski Sezon Kaydını Düzenle' : 'Yeni Eski Sezon Kaydı Ekle'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Oyuncu: <span className="text-white font-bold">@{selectedPlayer.username}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeLegacyModal}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveLegacyStat} className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {legacyFeedback && (
                <div className={`p-3.5 rounded-xl text-xs font-bold flex items-start gap-2 ${legacyFeedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  {legacyFeedback.type === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{legacyFeedback.msg}</span>
                </div>
              )}

              {/* Sezon & Lig Adı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Sezon Adı *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    placeholder="Örn: 5. Sezon"
                    value={legacyForm.season_name}
                    onChange={e => setLegacyForm({ ...legacyForm, season_name: e.target.value })}
                    className="input-field text-sm py-2"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Lig / Turnuva Adı *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="Örn: TETA Süper Lig"
                    value={legacyForm.league_name}
                    onChange={e => setLegacyForm({ ...legacyForm, league_name: e.target.value })}
                    className="input-field text-sm py-2"
                  />
                </div>
              </div>

              {/* Takım Seçimi */}
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Takım Türü ve Seçimi *
                  </label>
                  <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-white/5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setLegacyForm({ ...legacyForm, team_mode: 'EXISTING' })}
                      className={`px-3 py-1 rounded-md transition-all ${legacyForm.team_mode === 'EXISTING' ? 'bg-[#00e5ff]/20 text-[#00e5ff] shadow' : 'text-zinc-500 hover:text-white'}`}
                    >
                      Mevcut Takım
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegacyForm({ ...legacyForm, team_mode: 'CUSTOM' })}
                      className={`px-3 py-1 rounded-md transition-all ${legacyForm.team_mode === 'CUSTOM' ? 'bg-[#00e5ff]/20 text-[#00e5ff] shadow' : 'text-zinc-500 hover:text-white'}`}
                    >
                      Özel / Tarihsel
                    </button>
                  </div>
                </div>

                {legacyForm.team_mode === 'EXISTING' ? (
                  <div>
                    <select
                      value={legacyForm.team_id}
                      onChange={e => setLegacyForm({ ...legacyForm, team_id: e.target.value })}
                      className="input-field text-sm py-2"
                    >
                      <option value="">-- Takım Seçin --</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} {!t.is_active ? '(Arşiv / Pasif)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Mevcut sistem takımı seçildiğinde takım adı ve logosu otomatik olarak eşleştirilir.
                    </p>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      name="custom_team_name"
                      maxLength={80}
                      placeholder="Örn: Anatolian Lions, FC Bosphorus..."
                      value={legacyForm.custom_team_name}
                      onChange={e => setLegacyForm({ ...legacyForm, custom_team_name: e.target.value })}
                      className="input-field text-sm py-2"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Artık aktif olmayan veya sistemde yer almayan eski takım adını girin.
                    </p>
                  </div>
                )}
              </div>

              {/* Bireysel İstatistikler Grid: MAÇ, GOL, ASİST, RATING */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Oynanan Maç *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={legacyForm.matches_played}
                    onChange={e => setLegacyForm({ ...legacyForm, matches_played: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="input-field text-sm py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    Gol
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={legacyForm.goals}
                    onChange={e => setLegacyForm({ ...legacyForm, goals: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="input-field text-sm py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    Asist
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={legacyForm.assists}
                    onChange={e => setLegacyForm({ ...legacyForm, assists: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="input-field text-sm py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#00e5ff] uppercase tracking-wider mb-1">
                    Ort. Rating (0-10)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={legacyForm.rating_avg}
                    onChange={e => setLegacyForm({ ...legacyForm, rating_avg: Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)) })}
                    className="input-field text-sm py-2 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Katkı / Maç - Read-only canlı gösterim */}
              {(() => {
                const liveMatches = Number(legacyForm.matches_played);
                const liveGoals = Number(legacyForm.goals);
                const liveAssists = Number(legacyForm.assists);
                const liveContribution = liveMatches > 0
                  ? ((liveGoals + liveAssists) / liveMatches).toFixed(2)
                  : '0.00';

                return (
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        Katkı / Maç (Otomatik Hesaplanır)
                      </span>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        (Toplam {liveGoals} Gol + {liveAssists} Asist) / {liveMatches} Maç
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                        {liveContribution} / maç
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Footer Actions */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeLegacyModal}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={
                    legacyLoading ||
                    !legacyForm.season_name.trim() ||
                    !legacyForm.league_name.trim() ||
                    (legacyForm.team_mode === 'EXISTING' && !legacyForm.team_id) ||
                    (legacyForm.team_mode === 'CUSTOM' && !legacyForm.custom_team_name.trim())
                  }
                  className="btn-primary px-5 py-2 text-xs font-black flex items-center gap-2 tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {legacyLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      KAYDEDİLİYOR...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingLegacyStat ? 'DEĞİŞİKLİKLERİ KAYDET' : 'SEZON KAYDINI EKLE'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmStatId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="card-surface w-full max-w-md rounded-2xl border border-red-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-white">Eski Sezonu Sil</h4>
                <p className="text-xs text-zinc-400 mt-0.5">Bu işlem geri alınabilir (soft delete).</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Bu eski sezon kaydını silmek istediğinizden emin misiniz? Kayıt veritabanından kalıcı olarak silinmeyecek, güvenli şekilde arşivlenecektir.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStatId(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs rounded-lg transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => handleDeleteLegacyStat(deleteConfirmStatId)}
                disabled={legacyLoading}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg transition-colors flex items-center gap-2 tracking-wider uppercase disabled:opacity-50"
              >
                {legacyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                EVET, ARŞİVLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Confirmation Modal */}
      {banConfirmOpen && selectedPlayer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="card-surface w-full max-w-md rounded-2xl border border-red-500/40 p-6 shadow-2xl space-y-4 bg-[#060d18]">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-wide">OYUNCUYU BANLAMAK ÜZERESİNİZ</h4>
                <p className="text-xs text-red-400 font-bold mt-0.5">Dikkat: Bu işlem oyuncunun erişimini kısıtlar.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              <span className="font-bold text-white">@{selectedPlayer.username}</span> adlı oyuncunun hesabını <span className="font-bold text-red-400">BANLI</span> durumuna getirmek istediğinizden emin misiniz?
            </p>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-[11px] text-red-300 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span>Oyuncunun sisteme girişi (Login) tamamen engellenir.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span>Transfer, takım daveti ve maç işlemleri engellenir.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-emerald-300">Takım üyeliği ve geçmiş kariyer kayıtları güvenle korunur.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={accountLoading}
                onClick={() => setBanConfirmOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs rounded-lg transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={accountLoading}
                onClick={() => handleSaveAccount(undefined, true)}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg transition-colors flex items-center gap-2 tracking-wider uppercase disabled:opacity-50 shadow-lg shadow-red-600/20"
              >
                {accountLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                EVET, OYUNCUYU BANLA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
