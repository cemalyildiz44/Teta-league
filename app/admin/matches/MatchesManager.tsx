
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, Shield, X, AlertTriangle, CheckCircle2, Loader2, Trash2, Edit2, Check, XCircle,
  Camera, Image as ImageIcon, ExternalLink, UserCheck, UserX, AlertCircle, ShieldAlert,
  Calendar, ArrowRight, RefreshCw, Layers, Lock
} from 'lucide-react';
import { 
  reviewMatchAction, deleteMatchAction, updateMatchScoreAction,
  assignPlayerStatsProfileAction, getTeamRosterCandidatesAction, searchProfilesAction, updatePlayerStatsAction,
  updateApprovedMatchDetailsAction, type UpdateApprovedMatchPayload
} from './actions';
import TeamLogo from '@/components/TeamLogo';
import { DualTeamReportsSection } from './DualTeamReportsSection';

type StatsRow = { id: string; ea_player_name?: string | null; ea_player_id?: string | null; profiles?: { username?: string | null } | null; rating?: number | null; is_mom?: boolean | null; [k: string]: unknown };
interface DetailStat {
  id: string;
  team_id?: string | null;
  player_id?: string | null;
  ea_player_name?: string | null;
  ea_player_id?: string | null;
  position?: string | null;
  goals?: number;
  assists?: number;
  rating?: number | null;
  is_mom?: boolean | null;
  profiles?: {
    id?: string;
    username?: string | null;
    full_name?: string | null;
    current_ea_player_id?: string | null;
  } | null;
  extra_stats?: {
    roster_status?: string | null;
    registered_team_name?: string | null;
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
}

function getMatchEaData(m: any) {
  if (!m) return null;
  const rawEa = Array.isArray(m.match_raw_ea_data) ? m.match_raw_ea_data[0] : m.match_raw_ea_data;
  if (!rawEa || !rawEa.raw_data) return null;
  const rawData = rawEa.raw_data;
  const clubs = rawData.clubs;
  if (!clubs) return null;

  const homeEaClub = m.home?.ea_club_id ? String(m.home.ea_club_id) : null;
  const awayEaClub = m.away?.ea_club_id ? String(m.away.ea_club_id) : null;

  let homeEaScore: number | null = null;
  let awayEaScore: number | null = null;

  if (homeEaClub && clubs[homeEaClub] !== undefined) {
    homeEaScore = Number(clubs[homeEaClub].goals ?? clubs[homeEaClub].score ?? 0);
  }
  if (awayEaClub && clubs[awayEaClub] !== undefined) {
    awayEaScore = Number(clubs[awayEaClub].goals ?? clubs[awayEaClub].score ?? 0);
  }

  if (homeEaScore === null || awayEaScore === null) {
    const clubKeys = Object.keys(clubs);
    if (clubKeys.length === 2) {
      homeEaScore = Number(clubs[clubKeys[0]]?.goals ?? clubs[clubKeys[0]]?.score ?? 0);
      awayEaScore = Number(clubs[clubKeys[1]]?.goals ?? clubs[clubKeys[1]]?.score ?? 0);
    }
  }

  return {
    homeScore: homeEaScore,
    awayScore: awayEaScore,
    eaMatchId: rawEa.ea_match_id || m.ea_match_id
  };
}

export function MatchesManager({ initialMatches, seasons, leagues }: any) {
  const router = useRouter();
  
  const [filterSeason, setFilterSeason] = useState(seasons[0]?.id || '');
  const [filterLeague, setFilterLeague] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  
  // Modals
  const [detailModal, setDetailModal] = useState<any>(null); // holds match info
  const [editScoreModal, setEditScoreModal] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [assignModal, setAssignModal] = useState<any>(null);
  const [statsModal, setStatsModal] = useState<StatsRow | null>(null); // player stats row being edited

  // Edit mode for approved matches
  const [isEditMode, setIsEditMode] = useState(false);
  const [editScores, setEditScores] = useState<{ home_score: number; away_score: number }>({ home_score: 0, away_score: 0 });
  const [editPlayerStats, setEditPlayerStats] = useState<Record<string, { goals: number; assists: number; rating: number | null; [k: string]: any }>>({});
  const [savingApprovedMatch, setSavingApprovedMatch] = useState(false);

  // After router.refresh() keep the open detail modal in sync with the refreshed match (edits, assignments, re-check)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the modal snapshot with refreshed server data
    setDetailModal((d: { id: string } | null) => (d ? (initialMatches as { id: string }[]).find((m) => m.id === d.id) ?? d : d));
  }, [initialMatches]);
  const [rosterCandidates, setRosterCandidates] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchProfileQuery, setSearchProfileQuery] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  const closeDetailModal = () => {
    setIsEditMode(false);
    setEditPlayerStats({});
    setDetailModal(null);
  };

  // Filtered
  const filteredMatches = useMemo(() => {
    return initialMatches.filter((m: any) => {
      if (filterSeason && m.season_id !== filterSeason) return false;
      if (filterLeague !== 'ALL' && m.league_id !== filterLeague) return false;
      if (filterStatus === 'PENDING_REVIEW') {
        const hasPendingReport = m.status === 'PENDING_REVIEW' || m.home_report?.status === 'PENDING_REVIEW' || m.away_report?.status === 'PENDING_REVIEW';
        if (!hasPendingReport) return false;
      } else if (filterStatus !== 'ALL' && m.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!m.home?.name?.toLowerCase().includes(s) && !m.away?.name?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [initialMatches, filterSeason, filterLeague, filterStatus, search]);

  const total = initialMatches.length;
  const pending = initialMatches.filter((m:any) => m.status === 'PENDING_REVIEW' || m.home_report?.status === 'PENDING_REVIEW' || m.away_report?.status === 'PENDING_REVIEW').length;
  const approved = initialMatches.filter((m:any) => m.status === 'APPROVED').length;
  const rejected = initialMatches.filter((m:any) => ['REJECTED', 'CANCELLED'].includes(m.status)).length;

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
      PENDING_REVIEW: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
      APPROVED: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
      REJECTED: 'bg-red-500/10 text-red-400 ring-red-500/30',
      CANCELLED: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30'
    };
    return <span className={'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + (styles[status] || 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30')}>{status}</span>;
  };

  const handleStatus = (m: any, status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'CANCELLED') => {
    const warningDetails: string[] = [];
    if (status === 'APPROVED' && m.stats && m.stats.length > 0) {
      const unmatched = m.stats.filter((s: any) => !s.player_id).length;
      const mismatch = m.stats.filter((s: any) => s.extra_stats?.roster_status === 'ROSTER_MISMATCH').length;
      const unlicensed = m.stats.filter((s: any) => s.extra_stats?.roster_status === 'UNLICENSED').length;

      if (unmatched > 0) {
        warningDetails.push(`${unmatched} oyuncunun profili eşleşmedi (istatistikleri bireysel tablolara yazılmayacaktır).`);
      }
      if (mismatch > 0) {
        warningDetails.push(`${mismatch} oyuncu farklı takımda lisanslı görünüyor (kadro uyuşmazlığı).`);
      }
      if (unlicensed > 0) {
        warningDetails.push(`${unlicensed} lisanssız oyuncu yer alıyor.`);
      }
    }

    const hasWarnings = warningDetails.length > 0;
    let message = '';
    if (status === 'APPROVED') {
      message = (hasWarnings ? 'AŞAĞIDAKİ DURUMLAR TESPİT EDİLDİ:\n• ' + warningDetails.join('\n• ') + '\n\n' : '') +
        'ONAY İŞLEMİ VE ETKİLERİ:\n' +
        '1. Veritabanı tetikleyicisi (trg_recalculate_on_match) otomatik olarak "recalculate_season_stats" fonksiyonunu çalıştıracaktır.\n' +
        '2. Lig puan durumu (galibiyet, beraberlik, averaj, puanlar) baştan sona yeniden hesaplanacaktır.\n' +
        '3. Oyuncu istatistikleri (gol, asist vb.) yalnızca profili eşleşmiş lisanslı oyuncuların profillerine kaydedilecektir (eşleşmemiş oyuncular hariç tutulur).\n' +
        '4. Bağlı fikstür kaydının durumu "COMPLETED" (Tamamlandı) olarak güncellenecektir.\n\n' +
        'Bu maçı onaylamak istediğinize emin misiniz?';
    } else {
      message = 'Maçı ' + status + ' olarak işaretlemek istediğinize emin misiniz? Bu işlem puan durumu ve istatistik hesaplamalarını doğrudan etkileyecektir.';
    }

    setConfirmModal({
      isOpen: true,
      title: status === 'APPROVED' ? (hasWarnings ? 'Uyarılarla Maçı Onayla' : 'Maçı Onayla ve İstatistikleri İşle') : 'Maç Durumunu Değiştir',
      message,
      type: status === 'REJECTED' || status === 'CANCELLED' ? 'danger' : hasWarnings ? 'warning' : 'success',
      action: async () => {
        setLoading(true);
        const res = await reviewMatchAction(m.id, status);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); setDetailModal(null); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const enterEditMode = () => {
    if (!detailModal) return;
    setEditScores({
      home_score: detailModal.home_score ?? 0,
      away_score: detailModal.away_score ?? 0,
    });
    const statsMap: Record<string, any> = {};
    for (const s of detailModal.stats || []) {
      statsMap[s.id] = {
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        rating: s.rating ?? null,
        shots: s.shots ?? 0,
        passes_made: s.passes_made ?? 0,
        pass_attempts: s.pass_attempts ?? 0,
        tackles_made: s.tackles_made ?? 0,
        tackle_attempts: s.tackle_attempts ?? 0,
        saves: s.saves ?? 0,
        goals_conceded: s.goals_conceded ?? 0,
        cleansheets_gk: s.cleansheets_gk ?? 0,
        cleansheets_def: s.cleansheets_def ?? 0,
        red_cards: s.red_cards ?? 0,
        is_mom: !!s.is_mom,
      };
    }
    setEditPlayerStats(statsMap);
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setEditPlayerStats({});
  };

  const executeSaveApprovedMatch = async (allowDiscrepancy: boolean) => {
    if (!detailModal) return;
    setSavingApprovedMatch(true);

    const payload: UpdateApprovedMatchPayload = {
      home_score: editScores.home_score,
      away_score: editScores.away_score,
      player_stats: Object.entries(editPlayerStats).map(([id, stats]) => ({
        id,
        ...stats,
      })),
      allow_discrepancy: allowDiscrepancy,
    };

    const res = await updateApprovedMatchDetailsAction(detailModal.id, payload);

    if (res.error) {
      showFeedback(res.error, 'error');
      setSavingApprovedMatch(false);
      return;
    }

    showFeedback(res.success || 'Maç ve istatistikler başarıyla güncellendi.', 'success');

    // Update local state so modal immediately reflects new scores and stats
    setDetailModal((prev: any) => {
      if (!prev) return prev;
      const updatedStats = (prev.stats || []).map((s: any) => {
        const draft = editPlayerStats[s.id];
        return draft ? { ...s, ...draft } : s;
      });
      return {
        ...prev,
        home_score: editScores.home_score,
        away_score: editScores.away_score,
        stats: updatedStats,
      };
    });

    setIsEditMode(false);
    setSavingApprovedMatch(false);
    router.refresh();
  };

  const handleSaveApprovedMatch = () => {
    if (!detailModal) return;

    const allStats = (detailModal.stats || []) as DetailStat[];
    const homeStats = allStats.filter((s) => s.team_id === detailModal.home_team_id);
    const awayStats = allStats.filter((s) => s.team_id === detailModal.away_team_id);

    const homePlayerGoals = homeStats.reduce((sum, s) => {
      const g = editPlayerStats[s.id]?.goals ?? s.goals ?? 0;
      return sum + (typeof g === 'number' ? g : 0);
    }, 0);
    const awayPlayerGoals = awayStats.reduce((sum, s) => {
      const g = editPlayerStats[s.id]?.goals ?? s.goals ?? 0;
      return sum + (typeof g === 'number' ? g : 0);
    }, 0);

    const hasDiscrepancy = homePlayerGoals > editScores.home_score || awayPlayerGoals > editScores.away_score;

    if (hasDiscrepancy) {
      const reasons: string[] = [];
      if (homePlayerGoals > editScores.home_score) {
        reasons.push(`${detailModal.home?.name || 'Ev Sahibi'}: Oyuncu golleri (${homePlayerGoals}) > Takım skoru (${editScores.home_score})`);
      }
      if (awayPlayerGoals > editScores.away_score) {
        reasons.push(`${detailModal.away?.name || 'Deplasman'}: Oyuncu golleri (${awayPlayerGoals}) > Takım skoru (${editScores.away_score})`);
      }

      setConfirmModal({
        isOpen: true,
        title: 'Gol Uyuşmazlığı Uyarısı',
        type: 'warning',
        message: `Aşağıdaki takımlarda oyuncu golleri toplamı maç skorundan fazladır:\n\n• ` +
          reasons.join('\n• ') +
          `\n\nBu durum istatistiksel tutarsızlığa yol açabilir. Yine de bu değerlerle kaydetmek istiyor musunuz?`,
        action: async () => {
          closeConfirm();
          await executeSaveApprovedMatch(true);
        },
      });
      return;
    }

    executeSaveApprovedMatch(false);
  };

  const handleStatsSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!statsModal) return;
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => Number(fd.get(k));
    const ratingRaw = String(fd.get('rating') ?? '').trim();
    const statsData = {
      goals: num('goals'), assists: num('assists'), shots: num('shots'), passes_made: num('passes_made'), pass_attempts: num('pass_attempts'),
      tackles_made: num('tackles_made'), tackle_attempts: num('tackle_attempts'), saves: num('saves'), goals_conceded: num('goals_conceded'),
      cleansheets_gk: num('cleansheets_gk'), cleansheets_def: num('cleansheets_def'), red_cards: num('red_cards'),
      rating: ratingRaw === '' ? null : Number(ratingRaw),
      is_mom: fd.get('is_mom') === 'on',
    };

    if (isEditMode) {
      setEditPlayerStats((prev) => ({
        ...prev,
        [statsModal.id]: {
          ...(prev[statsModal.id] || {}),
          ...statsData,
        },
      }));
      setStatsModal(null);
      showFeedback('Detay istatistikler taslağa işlendi. Kaydet butonuna basmayı unutmayınız.', 'success');
      return;
    }

    setLoading(true);
    const res = await updatePlayerStatsAction(statsModal.id, statsData);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback((res.success || '') + ' Kontrol yenileniyor.', 'success'); setStatsModal(null); router.refresh(); }
    setLoading(false);
  };

  const openAssignModal = async (stat: any) => {
    setAssignModal(stat);
    setSelectedProfileId(stat.player_id || null);
    setAssignReason('');
    setSearchProfileQuery('');
    setSearchResults([]);
    setLoadingCandidates(true);

    try {
      const res = await getTeamRosterCandidatesAction(stat.team_id, detailModal?.season_id);
      if (res.data) {
        setRosterCandidates(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleSearchProfiles = async (q: string) => {
    setSearchProfileQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const res = await searchProfilesAction(q);
    if (res.data) {
      setSearchResults(res.data);
    }
  };

  const handleAssignSubmit = async (e: any) => {
    e.preventDefault();
    if (!assignModal) return;
    setLoading(true);
    const res = await assignPlayerStatsProfileAction(assignModal.id, selectedProfileId, assignReason);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      if (detailModal && detailModal.stats) {
        const updatedStats = detailModal.stats.map((s: any) => {
          if (s.id === assignModal.id) {
            let matchedProfile = null;
            if (selectedProfileId) {
              matchedProfile = rosterCandidates.find((c: any) => c.id === selectedProfileId) ||
                searchResults.find((c: any) => c.id === selectedProfileId) ||
                (s.profiles?.id === selectedProfileId ? s.profiles : { id: selectedProfileId, username: 'Atandı' });
            }
            return {
              ...s,
              player_id: selectedProfileId,
              profiles: matchedProfile,
              extra_stats: {
                ...(s.extra_stats || {}),
                roster_status: selectedProfileId ? (s.team_id === assignModal.team_id ? 'VALID' : 'ROSTER_MISMATCH') : 'UNMATCHED',
                roster_warning: selectedProfileId ? null : 'PROFİL EŞLEŞMEDİ'
              }
            };
          }
          return s;
        });
        setDetailModal({ ...detailModal, stats: updatedStats });
      }
      setAssignModal(null);
      router.refresh();
    }
    setLoading(false);
  };

  const handleDelete = (m: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Maçı Sil',
      message: 'Bu maç kaydını ve bağlı oyuncu istatistiklerini tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await deleteMatchAction(m.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); setDetailModal(null); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleEditScore = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const newHome = parseInt(fd.get('home_score') as string, 10);
    const newAway = parseInt(fd.get('away_score') as string, 10);
    const res = await updateMatchScoreAction(editScoreModal.id, newHome, newAway);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setEditScoreModal(null);
      setDetailModal((prev: any) => (prev && prev.id === editScoreModal.id ? { ...prev, home_score: newHome, away_score: newAway } : prev));
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className='space-y-6'>
      {feedback && (
        <div className={'fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-xl flex items-center gap-3 transition-all ' + 
          (feedback.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400')}>
          {feedback.type === 'error' ? <AlertTriangle className='w-5 h-5' /> : <CheckCircle2 className='w-5 h-5' />}
          <p className='text-sm font-medium'>{feedback.msg}</p>
        </div>
      )}

      {/* Pending Review Queue Banner */}
      {pending > 0 && (
        <div className='p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-amber-950/20'>
          <div className='flex items-center gap-3.5'>
            <div className='w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0'>
              <AlertTriangle className='w-5 h-5 animate-pulse' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='text-sm font-black text-amber-300 tracking-wider uppercase'>
                  Onay Bekleyen {pending} Karşılaşma Bulunuyor
                </h3>
                <span className='px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-black'>
                  İNCELEME KUYRUĞU
                </span>
              </div>
              <p className='text-xs text-zinc-300 mt-0.5'>
                Maçlar onaylanana kadar puan durumu güncellenmez ve bireysel oyuncu istatistikleri işlenmez.
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2 shrink-0 w-full sm:w-auto'>
            <button
              onClick={() => setFilterStatus(filterStatus === 'PENDING_REVIEW' ? 'ALL' : 'PENDING_REVIEW')}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                filterStatus === 'PENDING_REVIEW'
                  ? 'bg-amber-500 text-black font-black'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {filterStatus === 'PENDING_REVIEW' ? 'Tüm Maçları Göster' : 'Yalnızca Bekleyenleri Listele'}
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM MAÇ</p>
          <p className='text-2xl font-black text-white'>{total}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-amber-400 font-medium mb-1'>BEKLEYEN ONAY</p>
          <p className='text-2xl font-black text-white'>{pending}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-emerald-400 font-medium mb-1'>ONAYLANAN</p>
          <p className='text-2xl font-black text-white'>{approved}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-red-400 font-medium mb-1'>İPTAL / GEÇERSİZ</p>
          <p className='text-2xl font-black text-white'>{rejected}</p>
        </div>
      </div>

      {/* Quick Filter Tabs */}
      <div className='flex items-center gap-2 border-b border-white/5 pb-2 overflow-x-auto'>
        <button
          onClick={() => setFilterStatus('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            filterStatus === 'ALL'
              ? 'bg-cyan-500 text-black font-black'
              : 'bg-white/5 hover:bg-white/10 text-zinc-300'
          }`}
        >
          Tüm Maçlar ({total})
        </button>
        <button
          onClick={() => setFilterStatus('PENDING_REVIEW')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filterStatus === 'PENDING_REVIEW'
              ? 'bg-amber-500 text-black font-black'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20'
          }`}
        >
          <AlertTriangle className='w-3.5 h-3.5' />
          Onay Bekleyenler ({pending})
        </button>
        <button
          onClick={() => setFilterStatus('APPROVED')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filterStatus === 'APPROVED'
              ? 'bg-emerald-500 text-black font-black'
              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          <CheckCircle2 className='w-3.5 h-3.5' />
          Onaylananlar ({approved})
        </button>
        <button
          onClick={() => setFilterStatus('REJECTED')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            filterStatus === 'REJECTED'
              ? 'bg-red-500 text-white font-black'
              : 'bg-white/5 hover:bg-white/10 text-zinc-400'
          }`}
        >
          İptal / Red ({rejected})
        </button>
      </div>

      {/* Filters */}
      <div className='card-surface p-4 rounded-xl border border-white/5 flex flex-wrap gap-4'>
        <div className='relative flex-1 min-w-[200px]'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
          <input 
            type='text' placeholder='Takım Ara...' value={search} onChange={e => setSearch(e.target.value)}
            className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
          />
        </div>
        <select value={filterSeason} onChange={e => { setFilterSeason(e.target.value); setFilterLeague('ALL'); }} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          {seasons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          <option value='ALL'>Tüm Ligler</option>
          {leagues.filter((l:any) => l.season_id === filterSeason).map((l:any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          <option value='ALL'>Tüm Durumlar</option>
          <option value='PENDING_REVIEW'>Onay Bekleyen</option>
          <option value='APPROVED'>Onaylanmış</option>
          <option value='REJECTED'>Reddedilmiş</option>
        </select>
      </div>

      {/* List */}
      <div className='card-surface rounded-xl border border-white/5 overflow-x-auto'>
        <table className='w-full text-left text-sm text-zinc-400'>
          <thead className='bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-cyan-400'>
            <tr>
              <th className='px-4 py-4'>Hafta / Tarih</th>
              <th className='px-4 py-4'>Lig</th>
              <th className='px-4 py-4'>Ev Sahibi</th>
              <th className='px-4 py-4 text-center'>Skor / Kaynak</th>
              <th className='px-4 py-4 text-right'>Deplasman</th>
              <th className='px-4 py-4'>Durum</th>
              <th className='px-4 py-4 text-right'>İşlemler</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5'>
            {filteredMatches.map((m: any) => {
              const eaInfo = getMatchEaData(m);
              const isScoreEdited = eaInfo && eaInfo.homeScore !== null && eaInfo.awayScore !== null &&
                (eaInfo.homeScore !== m.home_score || eaInfo.awayScore !== m.away_score);

              return (
                <tr
                  key={m.id}
                  className={`hover:bg-white/5 transition-colors group cursor-pointer ${
                    m.status === 'PENDING_REVIEW' ? 'bg-amber-500/[0.02] border-l-2 border-l-amber-500/60' : ''
                  }`}
                  onClick={(e) => { if ((e.target as any).tagName !== 'BUTTON') setDetailModal(m); }}
                >
                  <td className='px-4 py-3'>
                    <div className='font-bold text-white'>Hafta {m.fixtures?.week_number || '?'}</div>
                    <div className='text-[10px] text-zinc-500'>{new Date(m.played_at).toLocaleString('tr-TR')}</div>
                  </td>
                  <td className='px-4 py-3 text-xs'>{m.leagues?.name}</td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      <TeamLogo src={m.home?.logo_url} name={m.home?.name} size="sm" />
                      <span className='font-bold text-white'>{m.home?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {m.home_score !== null && m.away_score !== null ? (
                      <div className='inline-flex flex-col items-center gap-1'>
                        <span className='font-black text-white bg-[#060d18] px-2.5 py-1 border border-white/10 rounded text-sm'>
                          {m.home_score} - {m.away_score}
                        </span>
                        {m.ea_match_id ? (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                            isScoreEdited
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          }`}>
                            EA #{m.ea_match_id.substring(0, 6)}
                            {isScoreEdited && ' (Düzeltildi)'}
                          </span>
                        ) : (
                          <span className='text-[9px] text-zinc-500 font-mono'>
                            {m.source || 'MANUAL'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className='text-[10px] text-zinc-500'>-</span>
                    )}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center justify-end gap-2'>
                      <span className='font-bold text-white'>{m.away?.name || 'Unknown'}</span>
                      <TeamLogo src={m.away?.logo_url} name={m.away?.name} size="sm" />
                    </div>
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex flex-col gap-1'>
                      <StatusBadge status={m.status} />
                      {(m.home_report || m.away_report) && (
                        <div className='flex items-center gap-1 text-[9px] font-bold'>
                          <span className={m.home_report?.status === 'APPROVED' ? 'text-emerald-400' : m.home_report?.status === 'PENDING_REVIEW' ? 'text-amber-400' : 'text-zinc-500'}>
                            Ev: {m.home_report ? m.home_report.status : 'Yok'}
                          </span>
                          <span className='text-zinc-600'>•</span>
                          <span className={m.away_report?.status === 'APPROVED' ? 'text-emerald-400' : m.away_report?.status === 'PENDING_REVIEW' ? 'text-amber-400' : 'text-zinc-500'}>
                            Dep: {m.away_report ? m.away_report.status : 'Yok'}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className='px-4 py-3 text-right'>
                    <button onClick={(e) => { e.stopPropagation(); setDetailModal(m); }} className='px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded transition-colors'>
                      DETAY
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredMatches.length === 0 && (
              <tr>
                <td colSpan={7} className='px-4 py-12 text-center text-zinc-500'>Bu filtrelerle eşleşen maç bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailModal && (() => {
        const isEaMatch = detailModal.source === 'AUTO' || Boolean(detailModal.ea_match_id) || (Array.isArray(detailModal.match_raw_ea_data) ? detailModal.match_raw_ea_data.length > 0 : Boolean(detailModal.match_raw_ea_data));
        const allStats = (detailModal.stats || []) as DetailStat[];
        const homeStats = allStats.filter((s) => s.team_id === detailModal.home_team_id);
        const awayStats = allStats.filter((s) => s.team_id === detailModal.away_team_id);
        const otherStats = allStats.filter((s) => s.team_id !== detailModal.home_team_id && s.team_id !== detailModal.away_team_id);

        const unmatchedCount = allStats.filter((s) => !s.player_id).length;
        const mismatchCount = allStats.filter((s) => s.extra_stats?.roster_status === 'ROSTER_MISMATCH').length;
        const unlicensedCount = allStats.filter((s) => s.extra_stats?.roster_status === 'UNLICENSED').length;
        const hasRosterWarnings = unmatchedCount > 0 || mismatchCount > 0 || unlicensedCount > 0;

        const eaInfo = getMatchEaData(detailModal);
        const hasEaScores = eaInfo && eaInfo.homeScore !== null && eaInfo.awayScore !== null;
        const isScoreEdited = hasEaScores && (eaInfo.homeScore !== detailModal.home_score || eaInfo.awayScore !== detailModal.away_score);

        const homePlayerGoalsTotal = homeStats.reduce((sum, s) => {
          const g = isEditMode ? (editPlayerStats[s.id]?.goals ?? s.goals ?? 0) : (s.goals ?? 0);
          return sum + (typeof g === 'number' ? g : 0);
        }, 0);
        const awayPlayerGoalsTotal = awayStats.reduce((sum, s) => {
          const g = isEditMode ? (editPlayerStats[s.id]?.goals ?? s.goals ?? 0) : (s.goals ?? 0);
          return sum + (typeof g === 'number' ? g : 0);
        }, 0);

        const renderTeamPanel = (teamStats: DetailStat[], team: { name?: string | null; logo_url?: string | null } | null | undefined, isHome: boolean) => {
          const teamName = team?.name || (isHome ? 'Ev Sahibi' : 'Deplasman');
          const targetScore = isEditMode
            ? (isHome ? editScores.home_score : editScores.away_score)
            : (isHome ? detailModal.home_score : detailModal.away_score);
          const teamPlayerGoals = teamStats.reduce((sum, s) => {
            const g = isEditMode ? (editPlayerStats[s.id]?.goals ?? s.goals ?? 0) : (s.goals ?? 0);
            return sum + (typeof g === 'number' ? g : 0);
          }, 0);
          const isExcess = targetScore !== null && targetScore !== undefined && teamPlayerGoals > targetScore;
          const isExact = targetScore !== null && targetScore !== undefined && teamPlayerGoals === targetScore;

          return (
            <div className='flex flex-col bg-[#060d18] rounded-xl border border-white/5 overflow-hidden shadow-lg'>
              {/* Panel Header */}
              <div className='flex items-center justify-between p-3.5 bg-[#0a1628] border-b border-white/10 shrink-0'>
                <div className='flex items-center gap-2.5 min-w-0'>
                  <TeamLogo src={team?.logo_url} name={teamName} size='sm' className='w-6 h-6' />
                  <div className='min-w-0'>
                    <span className='font-black text-xs sm:text-sm text-white tracking-wide truncate block'>
                      {teamName}
                    </span>
                    <span className='text-[10px] text-zinc-400 font-medium'>
                      {isHome ? 'Ev Sahibi Kadrosu' : 'Deplasman Kadrosu'}
                    </span>
                  </div>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  {targetScore !== null && targetScore !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                        isExcess
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : isExact
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                      title={isExcess ? 'Oyuncu golleri maç skorunu aşıyor!' : isExact ? 'Goller maç skoru ile tam uyuşuyor' : 'Kendi kalesine / atanmamış goller olabilir'}
                    >
                      Goller: {teamPlayerGoals}/{targetScore}
                      {isExcess && ' ⚠️'}
                    </span>
                  )}
                  <span className='text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded shrink-0'>
                    {teamStats.length} Oyuncu
                  </span>
                </div>
              </div>

              {/* Panel Content */}
              {teamStats.length > 0 ? (
                <div className='overflow-x-auto'>
                  <table className='w-full text-left text-xs'>
                    <thead className='bg-[#081220] text-[10px] uppercase font-black text-zinc-500 border-b border-white/5'>
                      <tr>
                        <th className='px-3 py-2'>Oyuncu & Profil</th>
                        <th className='px-2 py-2 text-center'>Poz</th>
                        <th className='px-1.5 py-2 text-center' title='Gol'>G</th>
                        <th className='px-1.5 py-2 text-center' title='Asist'>A</th>
                        <th className='px-1.5 py-2 text-center' title='Rating'>Rat</th>
                        <th className='px-3 py-2 text-right'>İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-white/5'>
                      {teamStats.map((s) => {
                        const rosterStatus = s.extra_stats?.roster_status;
                        const registeredName = s.extra_stats?.registered_team_name;
                        const hasWarning = !s.player_id || rosterStatus === 'ROSTER_MISMATCH' || rosterStatus === 'UNLICENSED';

                        return (
                          <tr key={s.id} className={'hover:bg-white/5 transition-colors ' + (hasWarning ? 'bg-amber-500/[0.03]' : '')}>
                            <td className='px-3 py-2.5'>
                              <div className='flex flex-col gap-0.5 min-w-0'>
                                {s.profiles?.username ? (
                                  <div className='flex items-center gap-1.5 flex-wrap'>
                                    <span className='font-bold text-white text-xs'>
                                      @{s.profiles.username}
                                    </span>
                                    {s.profiles.full_name && (
                                      <span className='text-[10px] text-zinc-400 font-normal'>
                                        ({s.profiles.full_name})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 w-fit'>
                                    <AlertTriangle className='w-2.5 h-2.5' /> PROFİL EŞLEŞMEDİ
                                  </span>
                                )}
                                <span className='text-[10px] text-zinc-400 font-mono truncate'>
                                  EA: {s.ea_player_name || s.ea_player_id || 'Bilinmiyor'}
                                </span>
                                <div className='pt-0.5'>
                                  {rosterStatus === 'VALID' && (
                                    <span className='inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20'>
                                      <Check className='w-2.5 h-2.5' /> Lisanslı
                                    </span>
                                  )}
                                  {rosterStatus === 'ROSTER_MISMATCH' && (
                                    <span className='inline-flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20'>
                                      <ShieldAlert className='w-2.5 h-2.5' /> Kadro Uyuşmazlığı ({registeredName || 'Başka Takım'})
                                    </span>
                                  )}
                                  {rosterStatus === 'UNLICENSED' && (
                                    <span className='inline-flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20'>
                                      <AlertCircle className='w-2.5 h-2.5' /> Lisanssız
                                    </span>
                                  )}
                                  {(!s.player_id || rosterStatus === 'UNMATCHED') && (
                                    <span className='inline-flex items-center gap-1 text-[9px] font-bold text-amber-300/80 bg-white/5 px-1.5 py-0.5 rounded border border-white/10'>
                                      <UserX className='w-2.5 h-2.5' /> Profil Yok
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className='px-2 py-2.5 text-center'>
                              <span className='font-mono font-bold text-[10px] text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/5'>
                                {s.position || '-'}
                              </span>
                            </td>
                            {isEditMode ? (
                              <>
                                <td className='px-1 py-2 text-center'>
                                  <input
                                    type='number'
                                    min='0'
                                    max='99'
                                    value={editPlayerStats[s.id]?.goals ?? 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      setEditPlayerStats(prev => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] || {}), goals: val }
                                      }));
                                    }}
                                    disabled={savingApprovedMatch}
                                    aria-label={`${s.profiles?.username || s.ea_player_name || 'Oyuncu'} gol`}
                                    className='w-11 sm:w-12 text-center font-bold bg-[#060d18] border border-cyan-500/30 focus:border-cyan-400 rounded px-1 py-1 text-emerald-400 text-xs focus:outline-none font-mono'
                                  />
                                </td>
                                <td className='px-1 py-2 text-center'>
                                  <input
                                    type='number'
                                    min='0'
                                    max='99'
                                    value={editPlayerStats[s.id]?.assists ?? 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      setEditPlayerStats(prev => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] || {}), assists: val }
                                      }));
                                    }}
                                    disabled={savingApprovedMatch}
                                    aria-label={`${s.profiles?.username || s.ea_player_name || 'Oyuncu'} asist`}
                                    className='w-11 sm:w-12 text-center font-bold bg-[#060d18] border border-cyan-500/30 focus:border-cyan-400 rounded px-1 py-1 text-cyan-400 text-xs focus:outline-none font-mono'
                                  />
                                </td>
                                <td className='px-1 py-2 text-center'>
                                  <input
                                    type='number'
                                    step='0.01'
                                    min='0'
                                    max='10'
                                    placeholder='-'
                                    value={editPlayerStats[s.id]?.rating ?? ''}
                                    onChange={(e) => {
                                      const str = e.target.value;
                                      const val = str === '' ? null : Math.min(10, Math.max(0, parseFloat(str) || 0));
                                      setEditPlayerStats(prev => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] || {}), rating: val }
                                      }));
                                    }}
                                    disabled={savingApprovedMatch}
                                    aria-label={`${s.profiles?.username || s.ea_player_name || 'Oyuncu'} rating`}
                                    className='w-13 sm:w-14 text-center font-mono font-bold bg-[#060d18] border border-amber-500/30 focus:border-amber-400 rounded px-1 py-1 text-amber-400 text-xs focus:outline-none'
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td className='px-1.5 py-2.5 text-center font-bold text-white'>
                                  {(s.goals ?? 0) > 0 ? <span className='text-emerald-400'>{s.goals}</span> : <span className='text-zinc-600'>0</span>}
                                </td>
                                <td className='px-1.5 py-2.5 text-center font-bold text-white'>
                                  {(s.assists ?? 0) > 0 ? <span className='text-cyan-400'>{s.assists}</span> : <span className='text-zinc-600'>0</span>}
                                </td>
                                <td className='px-1.5 py-2.5 text-center font-mono font-bold'>
                                  {s.rating ? (
                                    <span className='text-amber-400 flex items-center justify-center gap-0.5'>
                                      {s.rating}
                                      {s.is_mom && <span title='Maçın Adamı' className='text-[10px]'>⭐</span>}
                                    </span>
                                  ) : (
                                    <span className='text-zinc-600'>-</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className='px-3 py-2.5 text-right whitespace-nowrap'>
                              <div className='flex items-center justify-end gap-1.5'>
                                <button
                                  type='button'
                                  onClick={() => {
                                    if (isEditMode && editPlayerStats[s.id]) {
                                      setStatsModal({ ...s, ...editPlayerStats[s.id] });
                                    } else {
                                      setStatsModal(s);
                                    }
                                  }}
                                  className='px-2 py-1 bg-white/5 hover:bg-cyan-500/10 text-zinc-300 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 rounded text-[10px] font-bold transition-all'
                                  title='İstatistik Detaylarını Düzenle'
                                >
                                  {isEditMode ? 'İst. Detay' : 'İst. Düzenle'}
                                </button>
                                <button
                                  type='button'
                                  onClick={() => openAssignModal(s)}
                                  className='px-2 py-1 bg-white/5 hover:bg-cyan-500/10 text-zinc-300 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 rounded text-[10px] font-bold transition-all inline-flex items-center gap-1'
                                  title={s.player_id ? 'Profili Değiştir' : 'Profil Ata'}
                                >
                                  <UserCheck className='w-3 h-3' />
                                  {s.player_id ? 'Değiştir' : 'Ata'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className='p-8 text-center text-zinc-500 text-xs italic'>
                  Bu takım için oyuncu kaydı bulunmuyor.
                </div>
              )}
            </div>
          );
        };

        return (
          <div className='fixed inset-0 z-50 flex justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto'>
            <div className='card-surface w-full max-w-6xl xl:max-w-7xl rounded-2xl border border-white/10 flex flex-col my-auto max-h-[92vh] shadow-2xl'>
              <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628] shrink-0'>
                <div className='flex items-center gap-2.5 flex-wrap'>
                  <Shield className='w-4 h-4 text-cyan-400' />
                  <h2 className='text-sm font-black text-white tracking-widest uppercase'>
                    {isEditMode ? 'MAÇ VE İSTATİSTİK DÜZENLEME' : 'MAÇ İNCELEME & DETAY'}
                  </h2>
                  <StatusBadge status={detailModal.status} />
                  {isEditMode && (
                    <span className='px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse'>
                      <Edit2 className='w-3 h-3' /> DÜZENLEME MODU
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  {isEditMode ? (
                    <>
                      <button
                        type='button'
                        onClick={cancelEditMode}
                        disabled={savingApprovedMatch}
                        className='px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-lg text-xs font-bold transition-colors'
                      >
                        İPTAL
                      </button>
                      <button
                        type='button'
                        onClick={handleSaveApprovedMatch}
                        disabled={savingApprovedMatch}
                        className='px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-950/40 disabled:opacity-50'
                      >
                        {savingApprovedMatch ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Check className='w-3.5 h-3.5' />}
                        KAYDET
                      </button>
                    </>
                  ) : (
                    <button
                      type='button'
                      onClick={enterEditMode}
                      className='px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm'
                      title='Skor ve oyuncu istatistiklerini düzenle'
                    >
                      <Edit2 className='w-3.5 h-3.5' /> DÜZENLE
                    </button>
                  )}
                  <button
                    type='button'
                    onClick={closeDetailModal}
                    className='text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors ml-1'
                    aria-label='Kapat'
                  >
                    <X className='w-5 h-5'/>
                  </button>
                </div>
              </div>

              <div className='flex-1 overflow-y-auto p-4 sm:p-6 space-y-6'>
                {/* 1. Header Info: Teams, Clickable Score */}
                <div className='flex flex-col items-center justify-center gap-4 bg-[#060d18] p-5 sm:p-6 rounded-xl border border-white/5'>
                  <div className='text-xs font-bold text-zinc-400 uppercase tracking-widest text-center'>
                    {detailModal.seasons?.name} • {detailModal.leagues?.name} • Hafta {detailModal.fixtures?.week_number || '?'}
                    {detailModal.fixtures?.id && (
                      <Link
                        href='/admin/fixtures'
                        className='ml-2 text-cyan-400 hover:text-cyan-300 underline font-normal text-[11px]'
                      >
                        (Fikstür #{detailModal.fixtures.id.substring(0, 8)})
                      </Link>
                    )}
                    <br/>
                    <span className='text-[10px] text-zinc-500 font-medium'>
                      {new Date(detailModal.played_at).toLocaleString('tr-TR')}
                    </span>
                  </div>

                  <div className='flex items-center justify-between w-full max-w-2xl px-2'>
                    {/* Home Team */}
                    <div className='flex flex-col items-center gap-2 w-32 sm:w-40'>
                      <TeamLogo src={detailModal.home?.logo_url} name={detailModal.home?.name} size="xl" className="w-14 h-14 sm:w-16 sm:h-16" />
                      <span className='font-bold text-white text-xs sm:text-sm text-center line-clamp-2'>
                        {detailModal.home?.name || 'Ev Sahibi'}
                      </span>
                    </div>

                    {/* Interactive Clickable Score */}
                    <div className='flex flex-col items-center gap-1.5'>
                      {isEditMode ? (
                        <div className='flex flex-col items-center gap-1 px-4 sm:px-6 py-2 bg-[#0a1628] border border-cyan-500/40 rounded-xl shadow-xl'>
                          <div className='flex items-center gap-2.5'>
                            <div className='flex flex-col items-center'>
                              <span className='text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5'>Ev Sahibi</span>
                              <input
                                type='number'
                                min='0'
                                max='99'
                                value={editScores.home_score}
                                onChange={(e) => setEditScores(prev => ({ ...prev, home_score: Math.max(0, parseInt(e.target.value) || 0) }))}
                                disabled={savingApprovedMatch}
                                aria-label='Ev sahibi skor'
                                className='w-14 sm:w-16 text-center text-2xl sm:text-4xl font-black bg-[#060d18] border border-cyan-500/50 rounded-lg py-1 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono'
                              />
                            </div>
                            <span className='text-zinc-600 font-sans text-2xl sm:text-4xl font-black mt-3'>-</span>
                            <div className='flex flex-col items-center'>
                              <span className='text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5'>Deplasman</span>
                              <input
                                type='number'
                                min='0'
                                max='99'
                                value={editScores.away_score}
                                onChange={(e) => setEditScores(prev => ({ ...prev, away_score: Math.max(0, parseInt(e.target.value) || 0) }))}
                                disabled={savingApprovedMatch}
                                aria-label='Deplasman skor'
                                className='w-14 sm:w-16 text-center text-2xl sm:text-4xl font-black bg-[#060d18] border border-cyan-500/50 rounded-lg py-1 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono'
                              />
                            </div>
                          </div>
                          <span className='text-[9px] text-cyan-300 font-medium'>
                            Skorları düzenliyorsunuz
                          </span>
                        </div>
                      ) : (
                        <button
                          type='button'
                          onClick={enterEditMode}
                          className='group relative flex flex-col items-center gap-1 px-5 sm:px-7 py-2 sm:py-2.5 bg-[#0a1628] hover:bg-[#0d1d36] border border-white/10 hover:border-cyan-500/50 rounded-xl shadow-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50'
                          title='Skor ve istatistikleri düzenlemek için tıklayın'
                          aria-label='Skor ve istatistikleri düzenlemek için tıklayın'
                        >
                          <div className='flex items-center gap-3 text-3xl sm:text-5xl font-black text-white font-mono tracking-tight'>
                            <span className='group-hover:text-cyan-400 transition-colors'>
                              {detailModal.home_score !== null && detailModal.home_score !== undefined ? detailModal.home_score : '-'}
                            </span>
                            <span className='text-zinc-600 font-sans'>-</span>
                            <span className='group-hover:text-cyan-400 transition-colors'>
                              {detailModal.away_score !== null && detailModal.away_score !== undefined ? detailModal.away_score : '-'}
                            </span>
                            <Edit2 className='w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400/80 group-hover:text-cyan-300 transition-colors ml-1' />
                          </div>
                          <span className='text-[9px] sm:text-[10px] text-zinc-400 group-hover:text-cyan-300 transition-colors font-medium'>
                            Skor &amp; istatistikleri düzenlemek için tıklayın
                          </span>
                        </button>
                      )}
                      <div className='flex items-center gap-2 mt-1'>
                        <StatusBadge status={detailModal.status} />
                        {detailModal.ea_match_id && (
                          <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono'>
                            EA #{detailModal.ea_match_id}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Away Team */}
                    <div className='flex flex-col items-center gap-2 w-32 sm:w-40'>
                      <TeamLogo src={detailModal.away?.logo_url} name={detailModal.away?.name} size="xl" className="w-14 h-14 sm:w-16 sm:h-16" />
                      <span className='font-bold text-white text-xs sm:text-sm text-center line-clamp-2'>
                        {detailModal.away?.name || 'Deplasman'}
                      </span>
                    </div>
                  </div>

                  {/* EA Raw Score vs Current Match Score Comparison Card */}
                  {(() => {
                    if (!eaInfo && !detailModal.ea_match_id) return null;

                    return (
                      <div className={`w-full max-w-2xl mt-2 p-3 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isScoreEdited
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-[#0a1628] border-white/10 text-zinc-300'
                      }`}>
                        <div className='flex items-center gap-2.5'>
                          {isScoreEdited ? (
                            <AlertTriangle className='w-4 h-4 text-amber-400 shrink-0' />
                          ) : (
                            <CheckCircle2 className='w-4 h-4 text-emerald-400 shrink-0' />
                          )}
                          <div>
                            <div className='flex items-center gap-2 flex-wrap'>
                              <span className='font-bold text-white'>EA Maç Kaydı:</span>
                              {hasEaScores ? (
                                <span className='font-mono font-bold bg-[#060d18] px-2 py-0.5 rounded border border-white/10'>
                                  {eaInfo.homeScore} - {eaInfo.awayScore}
                                </span>
                              ) : (
                                <span className='font-mono text-zinc-400'>Skor EA API&apos;den çekilemedi</span>
                              )}
                              {isScoreEdited && (
                                <span className='text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30'>
                                  Skor Yönetici Tarafından Düzeltildi
                                </span>
                              )}
                              {!isScoreEdited && hasEaScores && (
                                <span className='text-[10px] font-bold text-emerald-400'>
                                  ✓ EA API skoru ile birebir uyumlu
                                </span>
                              )}
                            </div>
                            {isScoreEdited && (
                              <p className='text-[11px] text-zinc-400 mt-1'>
                                Onaylandığında puan durumuna ve kayıtlara <strong>{detailModal.home_score} - {detailModal.away_score}</strong> skoru işlenecektir.
                              </p>
                            )}
                          </div>
                        </div>
                        {detailModal.ea_match_id && (
                          <span className='text-[10px] font-mono text-zinc-400 shrink-0'>
                            EA ID #{detailModal.ea_match_id}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* 2. Player Warning Alert Banner (Retained) */}
                {hasRosterWarnings && (
                  <div className='p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 flex items-start gap-3'>
                    <AlertTriangle className='w-4 h-4 text-amber-400 mt-0.5 shrink-0' />
                    <div className='space-y-1 flex-1'>
                      <p className='font-bold text-white'>Kadro ve Lisans Uyuşmazlığı Uyarıları:</p>
                      <ul className='list-disc list-inside space-y-0.5 text-zinc-300 text-[11px]'>
                        {unmatchedCount > 0 && (
                          <li>
                            <strong className='text-amber-400'>{unmatchedCount} oyuncunun profili eşleşmedi.</strong> Bu oyuncuların gol/asist verileri genel liderlik tablosuna dahil edilmeyecektir. &quot;Ata&quot; butonunu kullanarak eşleştirebilirsiniz.
                          </li>
                        )}
                        {mismatchCount > 0 && (
                          <li>
                            <strong className='text-red-400'>{mismatchCount} oyuncu</strong> bu ligde başka bir takımda lisanslı görünüyor (kadro uyuşmazlığı).
                          </li>
                        )}
                        {unlicensedCount > 0 && (
                          <li>
                            <strong className='text-amber-400'>{unlicensedCount} oyuncu</strong> için geçerli takım lisansı bulunamadı.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {/* 3. Evidence Screenshot & Notes (ONLY for non-EA matches) */}
                {!isEaMatch && (
                  <div className='bg-[#060d18] p-5 rounded-xl border border-white/5 space-y-4'>
                    <div className='flex items-center justify-between border-b border-white/5 pb-2'>
                      <h3 className='text-xs font-black text-cyan-400 tracking-widest uppercase flex items-center gap-2'>
                        <Camera className='w-3.5 h-3.5' /> Maç Kanıtı & Kaptan Notları
                      </h3>
                      {detailModal.source && (
                        <span className='text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-400'>
                          Kaynak: {detailModal.source}
                        </span>
                      )}
                    </div>

                    {detailModal.notes && (
                      <div className='text-xs text-zinc-300 bg-[#0a1628] p-3 rounded-lg border border-white/5'>
                        <span className='font-bold text-zinc-400 block mb-1 text-[10px] uppercase tracking-wider'>Kaptan Notu:</span>
                        {detailModal.notes}
                      </div>
                    )}

                    {detailModal.screenshot_url ? (
                      <div className='space-y-2'>
                        <div className='relative max-h-96 rounded-lg overflow-hidden border border-white/10 bg-black/50 flex items-center justify-center group'>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={detailModal.screenshot_url}
                            alt="Maç Kanıtı"
                            className='max-h-96 w-auto object-contain rounded-lg transition-transform group-hover:scale-[1.01]'
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.screenshot-error-fallback');
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                          <div className='screenshot-error-fallback hidden p-8 text-center text-zinc-500 text-xs'>
                            <AlertTriangle className='w-8 h-8 text-amber-500/70 mx-auto mb-2' />
                            Görsel yüklenemedi veya bağlantı geçersiz.
                            <div className='mt-2'>
                              <a href={detailModal.screenshot_url} target='_blank' rel='noopener noreferrer' className='text-cyan-400 underline'>
                                Doğrudan bağlantıyı aç
                              </a>
                            </div>
                          </div>
                        </div>
                        <div className='flex justify-end'>
                          <a
                            href={detailModal.screenshot_url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors'
                          >
                            <ExternalLink className='w-3 h-3' /> Görseli Tam Boyut Görüntüle
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className='p-6 bg-[#0a1628]/60 rounded-lg border border-dashed border-white/10 text-center text-zinc-500 text-xs flex flex-col items-center gap-2'>
                        <ImageIcon className='w-6 h-6 text-zinc-600' />
                        <span>Bu maç için kanıt görseli (ekran görüntüsü) yüklenmemiş.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3B. Dual-Sided Captain Match Reports */}
                <DualTeamReportsSection
                  match={detailModal}
                  onUpdated={() => router.refresh()}
                  showFeedback={showFeedback}
                />

                {/* 4. Player Stats: Two Columns (Home & Away) */}
                <div>
                  <div className='flex items-center justify-between mb-4 border-b border-white/5 pb-2'>
                    <h3 className='text-xs font-black text-cyan-400 tracking-widest uppercase flex items-center gap-2'>
                      <Shield className='w-3.5 h-3.5' /> Oyuncu İstatistikleri ({allStats.length} Oyuncu)
                    </h3>
                    {allStats.length > 0 && (
                      <span className='text-[10px] text-zinc-500 font-mono hidden sm:inline'>
                        Yalnızca eşleşmiş lisanslı oyuncuların verileri profil liderlik tablolarına işlenir
                      </span>
                    )}
                  </div>

                  {allStats.length > 0 ? (
                    <div className='space-y-6'>
                      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                        {renderTeamPanel(homeStats, detailModal.home, true)}
                        {renderTeamPanel(awayStats, detailModal.away, false)}
                      </div>
                      {otherStats.length > 0 && (
                        <div className='mt-4'>
                          {renderTeamPanel(otherStats, { name: 'Diğer Oyuncular' }, false)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='p-8 bg-[#060d18] rounded-xl border border-white/5 text-center text-zinc-500 text-sm'>
                      Bu maç için oyuncu istatistiği bulunmuyor.
                    </div>
                  )}
                </div>

                {/* 5. Bottom Actions */}
                <div className='pt-4 border-t border-white/10'>
                  {isEditMode ? (
                    <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#0a1628] p-4 rounded-xl border border-cyan-500/30 shadow-xl'>
                      <div className='space-y-1'>
                        <div className='flex items-center gap-2'>
                          <Edit2 className='w-4 h-4 text-cyan-400' />
                          <span className='font-black text-white text-xs sm:text-sm tracking-wide'>
                            Maç Düzenleme Modu Aktif
                          </span>
                        </div>
                        <div className='text-xs text-zinc-400 flex items-center gap-3 flex-wrap'>
                          <span>
                            Skor: <strong className='text-white font-mono'>{editScores.home_score} - {editScores.away_score}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Ev Oyuncu Golleri: <strong className={homePlayerGoalsTotal > editScores.home_score ? 'text-red-400 font-mono' : 'text-emerald-400 font-mono'}>{homePlayerGoalsTotal}</strong> / {editScores.home_score}
                          </span>
                          <span>•</span>
                          <span>
                            Dep Oyuncu Golleri: <strong className={awayPlayerGoalsTotal > editScores.away_score ? 'text-red-400 font-mono' : 'text-emerald-400 font-mono'}>{awayPlayerGoalsTotal}</strong> / {editScores.away_score}
                          </span>
                        </div>
                        {(homePlayerGoalsTotal > editScores.home_score || awayPlayerGoalsTotal > editScores.away_score) && (
                          <p className='text-[11px] text-amber-300 font-semibold flex items-center gap-1.5 pt-1'>
                            <AlertTriangle className='w-3.5 h-3.5 text-amber-400 shrink-0' />
                            Dikkat: Oyuncu golleri toplamı girilen maç skorunu aşıyor.
                          </p>
                        )}
                      </div>

                      <div className='flex items-center gap-2.5 shrink-0'>
                        <button
                          type='button'
                          onClick={cancelEditMode}
                          disabled={savingApprovedMatch}
                          className='flex-1 sm:flex-none px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-lg text-xs font-bold transition-colors'
                        >
                          İPTAL
                        </button>
                        <button
                          type='button'
                          onClick={handleSaveApprovedMatch}
                          disabled={savingApprovedMatch}
                          className='flex-1 sm:flex-none px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40 disabled:opacity-50'
                        >
                          {savingApprovedMatch ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Check className='w-3.5 h-3.5' />}
                          DEĞİŞİKLİKLERİ KAYDET
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a1628]/60 p-4 rounded-xl border border-white/5'>
                      <div className='flex flex-wrap items-center gap-2.5'>
                        {detailModal.status !== 'REJECTED' && (
                          <button
                            type='button'
                            onClick={() => handleStatus(detailModal, 'REJECTED')}
                            className='px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2'
                          >
                            <XCircle className='w-4 h-4' /> Reddet / Geçersiz Kıl
                          </button>
                        )}
                        <button
                          type='button'
                          onClick={() => handleDelete(detailModal)}
                          className='px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition-colors flex items-center gap-2'
                        >
                          <Trash2 className='w-4 h-4' /> Maçı Sil
                        </button>
                      </div>

                      <div className='flex items-center gap-2'>
                        {detailModal.status === 'APPROVED' ? (
                          <button
                            type='button'
                            onClick={enterEditMode}
                            className='w-full sm:w-auto px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40'
                          >
                            <Edit2 className='w-4 h-4' /> Maçı Düzenle (Skor &amp; İstatistikler)
                          </button>
                        ) : (
                          <button
                            type='button'
                            onClick={() => handleStatus(detailModal, 'APPROVED')}
                            className='w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40'
                          >
                            <CheckCircle2 className='w-4 h-4' /> Maçı Onayla (Puan Durumu &amp; İstatistikleri Güncelle)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className='text-center text-[11px] text-zinc-500 flex items-center justify-center gap-1.5 mt-2'>
                    <RefreshCw className='w-3 h-3 text-emerald-500 shrink-0' />
                    {isEditMode
                      ? 'Değişiklikler kaydedildiğinde puan durumu ve oyuncu liderlik tabloları otomatik güncellenir.'
                      : 'Onaylama işlemi veritabanı tetikleyicisiyle lig puan tablosunu ve liderlik sıralamasını otomatik hesaplar.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Score Modal */}
      {editScoreModal && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>SKOR DÜZENLE</h2>
              <button onClick={() => setEditScoreModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleEditScore} className='p-6 space-y-6'>
              <div className='flex items-center justify-between gap-4'>
                <div className='flex flex-col items-center flex-1'>
                  <span className='text-xs font-bold text-zinc-400 mb-2 truncate max-w-[100px]'>{editScoreModal.home?.name}</span>
                  <input name='home_score' type='number' defaultValue={editScoreModal.home_score} required min='0' className='w-20 text-center text-2xl font-black bg-[#060d18] border border-white/10 rounded-lg py-2 text-white' />
                </div>
                <span className='text-xl font-black text-zinc-600'>-</span>
                <div className='flex flex-col items-center flex-1'>
                  <span className='text-xs font-bold text-zinc-400 mb-2 truncate max-w-[100px]'>{editScoreModal.away?.name}</span>
                  <input name='away_score' type='number' defaultValue={editScoreModal.away_score} required min='0' className='w-20 text-center text-2xl font-black bg-[#060d18] border border-white/10 rounded-lg py-2 text-white' />
                </div>
              </div>
              
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setEditScoreModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} KAYDET
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className={'flex p-4 border-b border-white/5 ' + (confirmModal.type === 'danger' ? 'bg-red-500/10' : confirmModal.type === 'warning' ? 'bg-amber-500/10' : 'bg-emerald-500/10')}>
              <h2 className={'text-sm font-black tracking-widest ' + (confirmModal.type === 'danger' ? 'text-red-400' : confirmModal.type === 'warning' ? 'text-amber-400' : 'text-emerald-400')}>
                {confirmModal.title}
              </h2>
            </div>
            <div className='p-6'>
              <p className='text-sm text-zinc-300 leading-relaxed mb-6 whitespace-pre-line'>{confirmModal.message}</p>
              <div className='flex gap-2'>
                <button onClick={closeConfirm} className='flex-1 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold'>Vazgeç</button>
                <button onClick={confirmModal.action} disabled={loading} className={'flex-1 py-2.5 rounded-lg text-xs font-black flex justify-center items-center gap-2 ' + (confirmModal.type === 'danger' ? 'bg-red-500 text-white' : confirmModal.type === 'warning' ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black')}>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Player Profile Modal */}
      {statsModal && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4'>
          <form onSubmit={handleStatsSave} className='w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a1628] p-6 space-y-4' data-testid='stats-modal'>
            <h2 className='text-sm font-black tracking-widest text-cyan-400'>OYUNCU İSTATİSTİKLERİ — {statsModal.profiles?.username || statsModal.ea_player_name || statsModal.ea_player_id}</h2>
            <div className='grid grid-cols-3 gap-3 text-xs'>
              {([['goals', 'Gol'], ['assists', 'Asist'], ['shots', 'Şut'], ['passes_made', 'Başarılı pas'], ['pass_attempts', 'Pas denemesi'], ['tackles_made', 'Top çalma'], ['tackle_attempts', 'Top çalma den.'], ['saves', 'Kurtarış'], ['goals_conceded', 'Yenilen gol'], ['cleansheets_gk', 'Gol yemeden (K)'], ['cleansheets_def', 'Gol yemeden (D)'], ['red_cards', 'Kırmızı kart']] as [string, string][]).map(([k, label]) => (
                <label key={k} className='block text-zinc-400'>{label}
                  <input name={k} type='number' min='0' max='1000' required defaultValue={(statsModal[k] as number | undefined) ?? 0} className='mt-1 w-full rounded bg-[#060d18] border border-white/10 px-2 py-1.5 text-white' />
                </label>
              ))}
              <label className='block text-zinc-400'>Rating (0-10)
                <input name='rating' type='number' step='0.01' min='0' max='10' defaultValue={statsModal.rating ?? ''} className='mt-1 w-full rounded bg-[#060d18] border border-white/10 px-2 py-1.5 text-white' />
              </label>
              <label className='flex items-end gap-2 text-zinc-300 pb-1.5'>
                <input name='is_mom' type='checkbox' defaultChecked={!!statsModal.is_mom} /> Maçın adamı
              </label>
            </div>
            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => setStatsModal(null)} className='px-4 py-2 text-zinc-400 hover:text-white text-xs font-bold'>Vazgeç</button>
              <button type='submit' disabled={loading} className='px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-black disabled:opacity-50'>Kaydet ve Yeniden Kontrol Et</button>
            </div>
          </form>
        </div>
      )}

      {assignModal && (
        <div className='fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <div className='flex items-center gap-2'>
                <UserCheck className='w-4 h-4 text-cyan-400' />
                <h2 className='text-sm font-black text-white tracking-widest uppercase'>
                  OYUNCU PROFİLİ EŞLEŞTİRME
                </h2>
              </div>
              <button onClick={() => setAssignModal(null)} className='text-zinc-400 hover:text-white'>
                <X className='w-5 h-5'/>
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className='p-6 space-y-5'>
              {/* Target EA Info */}
              <div className='p-3 rounded-lg bg-[#060d18] border border-white/5 flex flex-col gap-1 text-xs'>
                <div className='flex justify-between'>
                  <span className='text-zinc-400'>EA Oyuncu Adı:</span>
                  <span className='font-bold text-white font-mono'>{assignModal.ea_player_name || 'Bilinmiyor'}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-400'>EA Player ID:</span>
                  <span className='text-zinc-400 font-mono'>{assignModal.ea_player_id || '-'}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-400'>Maçta Oynadığı Takım:</span>
                  <span className='font-bold text-cyan-400'>
                    {assignModal.team_id === detailModal?.home_team_id ? detailModal?.home?.name : detailModal?.away?.name}
                  </span>
                </div>
              </div>

              {/* Quick Select: Team Roster Candidates */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2'>
                  1. Takım Kadrosundan Seç ({rosterCandidates.length} Oyuncu)
                </label>
                {loadingCandidates ? (
                  <div className='p-3 text-center text-xs text-zinc-500 flex items-center justify-center gap-2'>
                    <Loader2 className='w-4 h-4 animate-spin text-cyan-400' /> Kadro yükleniyor...
                  </div>
                ) : (
                  <select
                    value={selectedProfileId || ''}
                    onChange={(e) => setSelectedProfileId(e.target.value || null)}
                    className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500/50'
                  >
                    <option value=''>-- Seçim Yapın veya Boş Bırakın --</option>
                    {rosterCandidates.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.username} {c.full_name ? `(${c.full_name})` : ''} {c.current_ea_player_id ? `[EA: ${c.current_ea_player_id}]` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Or Search: Any Profile */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2'>
                  2. Veya Tüm Sistemde Oyuncu Ara
                </label>
                <div className='relative'>
                  <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500' />
                  <input
                    type='text'
                    placeholder='Kullanıcı adı veya EA ID ara...'
                    value={searchProfileQuery}
                    onChange={(e) => handleSearchProfiles(e.target.value)}
                    className='w-full pl-9 pr-3 py-2 bg-[#060d18] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500/50'
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className='mt-2 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-[#060d18] divide-y divide-white/5'>
                    {searchResults.map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => { setSelectedProfileId(p.id); setSearchResults([]); }}
                        className={'p-2 hover:bg-white/5 cursor-pointer flex justify-between items-center text-xs ' + (selectedProfileId === p.id ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-300')}
                      >
                        <span className='font-bold'>{p.username} {p.full_name && `(${p.full_name})`}</span>
                        <span className='text-[10px] text-zinc-500 font-mono'>EA: {p.current_ea_player_id || '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reason for change */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  İşlem Açıklaması / Gerekçe (Audit Log)
                </label>
                <input
                  type='text'
                  placeholder='Örn: Gamertag harf hatası düzeltildi, doğru profile bağlandı'
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/50'
                />
              </div>

              {/* Selected Profile Status Summary */}
              <div className='p-3 rounded-lg border border-white/5 bg-[#0a1628] flex items-center justify-between text-xs'>
                <span className='text-zinc-400'>Seçili Durum:</span>
                {selectedProfileId ? (
                  <span className='font-bold text-emerald-400 flex items-center gap-1'>
                    <Check className='w-3.5 h-3.5' /> Profil Seçildi
                  </span>
                ) : (
                  <span className='font-bold text-amber-400 flex items-center gap-1'>
                    <UserX className='w-3.5 h-3.5' /> Boş Bırakılacak (player_id = NULL)
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className='flex gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setSelectedProfileId(null)}
                  className='px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold border border-red-500/20'
                >
                  Boş Bırak
                </button>
                <button
                  type='button'
                  onClick={() => setAssignModal(null)}
                  className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'
                >
                  İptal
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'
                >
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

