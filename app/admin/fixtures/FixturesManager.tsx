'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Calendar, Shield, X, AlertTriangle, CheckCircle2, Loader2,
  Trash2, Edit2, Play, Eye, Filter, ArrowRight, Clock, Check, XCircle,
  HelpCircle, ChevronRight, Layers, FileText, PauseCircle
} from 'lucide-react';
import {
  previewLeagueFixturesAction, generateLeagueFixturesAction,
  updateFixtureAction, updateFixtureDateAction, cancelFixtureAction,
  deleteFixtureAction, updateFixtureScoreAction, getFixtureDetailAction,
  FixturePreviewItem
} from './actions';
import { getMondaySessionDetails, getMidSeasonBreakInfo } from '@/lib/fixture-generator';
import TeamLogo from '@/components/TeamLogo';

export function FixturesManager({ initialFixtures, seasons, leagues, leagueTeams, teams }: any) {
  const router = useRouter();
  const [fixtures, setFixtures] = useState(initialFixtures);
  useEffect(() => { setFixtures(initialFixtures); }, [initialFixtures]);

  // Filters
  const [filterSeason, setFilterSeason] = useState(seasons[0]?.id || '');
  const [filterLeague, setFilterLeague] = useState('ALL');
  const [filterWeek, setFilterWeek] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterScoreStatus, setFilterScoreStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [groupByWeek, setGroupByWeek] = useState(true);

  // Modals & States
  const [previewModal, setPreviewModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [genSeason, setGenSeason] = useState(seasons[0]?.id || '');
  const [genLeague, setGenLeague] = useState(leagues[0]?.id || '');
  const [genStartDate, setGenStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [genDoubleRound, setGenDoubleRound] = useState(true);

  const [editModal, setEditModal] = useState<any>(null);
  const [scoreModal, setScoreModal] = useState<any>(null);
  const [detailModal, setDetailModal] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // Teams available in currently selected league (for filters and edit modal)
  const availableTeamsInLeague = useMemo(() => {
    if (filterLeague === 'ALL') return teams;
    const teamIds = new Set(
      leagueTeams.filter((lt: any) => lt.league_id === filterLeague).map((lt: any) => lt.team_id)
    );
    return teams.filter((t: any) => teamIds.has(t.id));
  }, [teams, leagueTeams, filterLeague]);

  // Filtered fixtures
  const filteredFixtures = useMemo(() => {
    return fixtures.filter((f: any) => {
      if (filterSeason && f.season_id !== filterSeason) return false;
      if (filterLeague !== 'ALL' && f.league_id !== filterLeague) return false;
      if (filterWeek !== 'ALL' && f.week_number.toString() !== filterWeek) return false;
      if (filterTeam !== 'ALL' && f.home_team_id !== filterTeam && f.away_team_id !== filterTeam) return false;
      if (filterStatus !== 'ALL' && f.status !== filterStatus) return false;

      // Score status filter
      if (filterScoreStatus === 'HAS_SCORE') {
        if (!f.match || f.match.home_score === null || f.match.away_score === null) return false;
      } else if (filterScoreStatus === 'NO_SCORE') {
        if (f.match && f.match.home_score !== null && f.match.away_score !== null) return false;
      } else if (filterScoreStatus === 'PENDING_REVIEW') {
        if (!f.match || f.match.status !== 'PENDING_REVIEW') return false;
      } else if (filterScoreStatus === 'APPROVED') {
        if (!f.match || f.match.status !== 'APPROVED') return false;
      }

      if (search) {
        const s = search.toLowerCase();
        const homeName = f.home?.name?.toLowerCase() || '';
        const awayName = f.away?.name?.toLowerCase() || '';
        if (!homeName.includes(s) && !awayName.includes(s)) return false;
      }
      return true;
    });
  }, [fixtures, filterSeason, filterLeague, filterWeek, filterTeam, filterStatus, filterScoreStatus, search]);

  // Statistics
  const total = fixtures.length;
  const scheduledCount = fixtures.filter((f: any) => f.status === 'SCHEDULED').length;
  const completedCount = fixtures.filter((f: any) => f.status === 'COMPLETED' || f.match?.status === 'APPROVED').length;
  const pendingCount = fixtures.filter((f: any) => f.match?.status === 'PENDING_REVIEW').length;
  const cancelledCount = fixtures.filter((f: any) => f.status === 'CANCELLED').length;

  const availableWeeks = useMemo(() => {
    const ws = Array.from(new Set(fixtures.map((f: any) => f.week_number))) as number[];
    return ws.sort((a, b) => a - b);
  }, [fixtures]);

  const weeks = useMemo(() => {
    const ws = Array.from(new Set(filteredFixtures.map((f: any) => f.week_number))) as number[];
    return ws.sort((a, b) => a - b);
  }, [filteredFixtures]);

  // Status badge helper
  const StatusBadge = ({ fixtureStatus, matchStatus }: { fixtureStatus: string, matchStatus?: string }) => {
    if (matchStatus === 'PENDING_REVIEW') {
      return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30'>ONAY BEKLİYOR</span>;
    }
    if (matchStatus === 'APPROVED') {
      return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30'>ONAYLANDI</span>;
    }
    if (fixtureStatus === 'COMPLETED') {
      return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30'>TAMAMLANDI</span>;
    }
    if (fixtureStatus === 'CANCELLED') {
      return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 ring-1 ring-red-500/30'>İPTAL</span>;
    }
    if (fixtureStatus === 'POSTPONED') {
      return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/30'>ERTELENDİ</span>;
    }
    return <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30'>PLANLANDI</span>;
  };

  // Preview Handler
  const handleOpenPreview = async () => {
    setPreviewModal(true);
    setPreviewData(null);
    setPreviewLoading(true);
    const res = await previewLeagueFixturesAction(genSeason, genLeague, genStartDate, genDoubleRound);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      setPreviewData(res.data);
    }
    setPreviewLoading(false);
  };

  // Generate / Import confirm handler
  const handleConfirmGenerate = async () => {
    setLoading(true);
    const res = await generateLeagueFixturesAction(genSeason, genLeague, genStartDate, genDoubleRound);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setPreviewModal(false);
      router.refresh();
    }
    setLoading(false);
  };

  // Edit Fixture submit handler
  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editModal) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateFixtureAction(editModal.id, {
      week_number: parseInt(fd.get('week_number') as string, 10),
      scheduled_at: fd.get('scheduled_at') as string,
      home_team_id: fd.get('home_team_id') as string,
      away_team_id: fd.get('away_team_id') as string,
      status: fd.get('status') as any,
      notes: fd.get('notes') as string
    });
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setEditModal(null);
      router.refresh();
    }
    setLoading(false);
  };

  // Score submit handler
  const handleScoreSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!scoreModal) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const homeScore = parseInt(fd.get('home_score') as string, 10);
    const awayScore = parseInt(fd.get('away_score') as string, 10);

    const res = await updateFixtureScoreAction(scoreModal.id, homeScore, awayScore);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setScoreModal(null);
      router.refresh();
    }
    setLoading(false);
  };

  // View Match Detail handler
  const handleOpenDetail = async (f: any) => {
    setLoading(true);
    const res = await getFixtureDetailAction(f.id);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      setDetailModal(res.data);
    }
    setLoading(false);
  };

  // Cancel Handler
  const handleCancel = (f: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fikstürü İptal Et',
      message: `Hafta ${f.week_number} - "${f.home?.name || 'Ev'}" vs "${f.away?.name || 'Dep'}" karşılaşmasını iptal etmek istediğinize emin misiniz?`,
      type: 'warning',
      action: async () => {
        setLoading(true);
        const res = await cancelFixtureAction(f.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  // Delete Handler
  const handleDelete = (f: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fikstürü Sil',
      message: `Hafta ${f.week_number} - "${f.home?.name || 'Ev'}" vs "${f.away?.name || 'Dep'}" fikstürünü tamamen silmek istediğinize emin misiniz? Bağlı maç kaydı varsa silme işlemi engellenecektir.`,
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await deleteFixtureAction(f.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  return (
    <div className='space-y-6'>
      {/* Toast Feedback */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-xl flex items-center gap-3 transition-all ${
          feedback.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'}`}>
          {feedback.type === 'error' ? <AlertTriangle className='w-5 h-5 flex-shrink-0' /> : <CheckCircle2 className='w-5 h-5 flex-shrink-0' />}
          <p className='text-sm font-medium'>{feedback.msg}</p>
        </div>
      )}

      {/* Top Stat Cards */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'>
        <div className='bg-[#0e1726]/60 p-4 rounded-xl border border-white/5'>
          <p className='text-xs font-semibold text-zinc-400 uppercase tracking-wider'>Toplam Fikstür</p>
          <p className='text-2xl font-black text-white mt-1'>{total}</p>
        </div>
        <div className='bg-[#0e1726]/60 p-4 rounded-xl border border-white/5'>
          <p className='text-xs font-semibold text-cyan-400 uppercase tracking-wider'>Planlandı</p>
          <p className='text-2xl font-black text-cyan-400 mt-1'>{scheduledCount}</p>
        </div>
        <div className='bg-[#0e1726]/60 p-4 rounded-xl border border-white/5'>
          <p className='text-xs font-semibold text-emerald-400 uppercase tracking-wider'>Tamamlandı</p>
          <p className='text-2xl font-black text-emerald-400 mt-1'>{completedCount}</p>
        </div>
        <div className='bg-[#0e1726]/60 p-4 rounded-xl border border-white/5'>
          <p className='text-xs font-semibold text-amber-400 uppercase tracking-wider'>Onay Bekleyen</p>
          <p className='text-2xl font-black text-amber-400 mt-1'>{pendingCount}</p>
        </div>
        <div className='bg-[#0e1726]/60 p-4 rounded-xl border border-white/5'>
          <p className='text-xs font-semibold text-red-400 uppercase tracking-wider'>İptal Edilen</p>
          <p className='text-2xl font-black text-red-400 mt-1'>{cancelledCount}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className='bg-[#0e1726]/80 p-4 rounded-xl border border-white/5 flex flex-wrap items-center justify-between gap-4'>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => { setGenSeason(filterSeason); setPreviewModal(true); }}
            className='px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all'>
            <Calendar className='w-4 h-4' />
            Fikstür Üret / İçe Aktar (Ön İzleme)
          </button>
          <Link
            href='/admin/matches'
            className='px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border border-white/10 transition-all'>
            <Shield className='w-4 h-4 text-amber-400' />
            Maç Onay Merkezi ({pendingCount})
          </Link>
        </div>

        <div className='flex items-center gap-2'>
          <button
            onClick={() => setGroupByWeek(!groupByWeek)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              groupByWeek ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'}`}>
            <Layers className='w-3.5 h-3.5' />
            {groupByWeek ? 'Haftalara Göre Gruplu' : 'Düz Liste'}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className='bg-[#0e1726]/80 p-4 rounded-xl border border-white/5 space-y-3'>
        <div className='flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider'>
          <Filter className='w-3.5 h-3.5 text-cyan-400' />
          Gelişmiş Fikstür Filtreleri
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
          {/* Season */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Sezon</label>
            <select
              value={filterSeason}
              onChange={e => setFilterSeason(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              {seasons.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* League */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Lig</label>
            <select
              value={filterLeague}
              onChange={e => setFilterLeague(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              <option value='ALL'>Tüm Ligler</option>
              {leagues
                .filter((l: any) => !filterSeason || l.season_id === filterSeason)
                .map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
            </select>
          </div>

          {/* Week */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Hafta</label>
            <select
              value={filterWeek}
              onChange={e => setFilterWeek(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              <option value='ALL'>Tüm Haftalar</option>
              {availableWeeks.map(w => (
                <option key={w} value={w.toString()}>{w}. Hafta</option>
              ))}
            </select>
          </div>

          {/* Team */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Takım</label>
            <select
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              <option value='ALL'>Tüm Takımlar</option>
              {availableTeamsInLeague.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Fikstür Durumu</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              <option value='ALL'>Tüm Durumlar</option>
              <option value='SCHEDULED'>Planlandı (SCHEDULED)</option>
              <option value='COMPLETED'>Tamamlandı (COMPLETED)</option>
              <option value='POSTPONED'>Ertelendi (POSTPONED)</option>
              <option value='CANCELLED'>İptal Edildi (CANCELLED)</option>
            </select>
          </div>

          {/* Score status */}
          <div>
            <label className='text-[10px] text-zinc-400 block mb-1'>Skor / Maç Durumu</label>
            <select
              value={filterScoreStatus}
              onChange={e => setFilterScoreStatus(e.target.value)}
              className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500'>
              <option value='ALL'>Tümü</option>
              <option value='HAS_SCORE'>Skoru Girilmiş</option>
              <option value='NO_SCORE'>Skor Bekliyor</option>
              <option value='PENDING_REVIEW'>Onay Bekleyen Maçlar</option>
              <option value='APPROVED'>Onaylanmış Maçlar</option>
            </select>
          </div>
        </div>

        {/* Search row */}
        <div className='relative'>
          <Search className='w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2' />
          <input
            type='text'
            placeholder='Takım adına göre ara...'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='w-full bg-[#121c2d] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-cyan-500'
          />
        </div>
      </div>

      {/* Main Fixtures Table Content */}
      {filteredFixtures.length === 0 ? (
        <div className='bg-[#0e1726]/60 p-12 rounded-xl border border-white/5 text-center'>
          <Calendar className='w-12 h-12 text-zinc-600 mx-auto mb-3' />
          <h3 className='text-sm font-bold text-white uppercase tracking-wider'>Fikstür Bulunamadı</h3>
          <p className='text-xs text-zinc-400 mt-1 max-w-sm mx-auto'>
            Seçilen filtre kriterlerine uygun karşılaşma bulunamadı. Fikstür oluşturmak için yukarıdaki "Fikstür Üret" butonunu kullanabilirsiniz.
          </p>
        </div>
      ) : groupByWeek ? (
        /* Week-grouped layout */
        <div className='space-y-6'>
          {weeks.map(weekNum => {
            const weekFixtures = filteredFixtures.filter((f: any) => f.week_number === weekNum);
            const sessionSlot = getMondaySessionDetails(weekNum);
            return (
              <div key={weekNum} className='space-y-6'>
                {/* Devre Arası (Mid-Season Break) Banner before Week 13 */}
                {weekNum === 13 && (
                  <div className='p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-cyan-500/10 border border-amber-500/30 flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)] animate-pulse' />
                      <div>
                        <span className='font-black text-amber-400 text-xs uppercase tracking-wider block'>
                          DEVRE ARASI & RESMİ TRANSFER DÖNEMİ
                        </span>
                        <span className='text-[11px] text-zinc-300'>
                          1. Devre (1-12. Haftalar) tamamlandı. 1 Pazartesi gecesi boş geçilir (Maç oynanmaz; transfer dönemi). 13. Hafta bir sonraki Pazartesi başlar.
                        </span>
                      </div>
                    </div>
                    <span className='px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-black text-[10px] uppercase tracking-wider border border-amber-500/30 shrink-0 ml-3'>
                      1 Hafta Ara
                    </span>
                  </div>
                )}

                <div className='bg-[#0e1726]/80 rounded-xl border border-white/5 overflow-hidden'>
                  <div className='bg-[#121c2d] px-4 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <span className='px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-black text-xs border border-cyan-500/20'>
                        {weekNum}. HAFTA
                      </span>
                      <span className='px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold text-[10px] border border-blue-500/20'>
                        {sessionSlot.session}. PAZARTESİ OTURUMU • {sessionSlot.timeTRT} TRT
                      </span>
                      <span className='text-xs text-zinc-400'>
                        ({weekFixtures.length} Karşılaşma)
                      </span>
                    </div>
                  </div>

                  <div className='divide-y divide-white/5'>
                    {weekFixtures.map((f: any) => renderFixtureRow(f))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat list layout */
        <div className='bg-[#0e1726]/80 rounded-xl border border-white/5 overflow-hidden'>
          <div className='divide-y divide-white/5'>
            {filteredFixtures.map((f: any) => renderFixtureRow(f))}
          </div>
        </div>
      )}

      {/* PREVIEW & GENERATE MODAL */}
      {previewModal && (
        <div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
          <div className='bg-[#0d1522] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl'>
            <div className='p-6 border-b border-white/5 flex items-center justify-between flex-shrink-0'>
              <div>
                <h3 className='text-lg font-black text-white tracking-wider flex items-center gap-2'>
                  <Calendar className='w-5 h-5 text-cyan-400' />
                  FİKSTÜR ÖN İZLEME VE ÜRETİM MERKEZİ
                </h3>
                <p className='text-xs text-zinc-400 mt-1'>
                  Ligdeki aktif takımlara Round-Robin eşleştirmesi uygulayın ve oluşturmadan önce çakışmaları inceleyin.
                </p>
              </div>
              <button onClick={() => setPreviewModal(false)} className='text-zinc-400 hover:text-white'>
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='p-6 overflow-y-auto space-y-6 flex-1'>
              {/* Parameter Selection */}
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-[#121c2d] p-4 rounded-xl border border-white/5'>
                <div>
                  <label className='text-xs font-semibold text-zinc-300 block mb-1'>Sezon</label>
                  <select
                    value={genSeason}
                    onChange={e => setGenSeason(e.target.value)}
                    className='w-full bg-[#0e1726] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500'>
                    {seasons.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='text-xs font-semibold text-zinc-300 block mb-1'>Lig</label>
                  <select
                    value={genLeague}
                    onChange={e => setGenLeague(e.target.value)}
                    className='w-full bg-[#0e1726] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500'>
                    {leagues.filter((l: any) => !genSeason || l.season_id === genSeason).map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='text-xs font-semibold text-zinc-300 block mb-1'>Başlangıç Tarihi</label>
                  <input
                    type='date'
                    value={genStartDate}
                    onChange={e => setGenStartDate(e.target.value)}
                    className='w-full bg-[#0e1726] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500'
                  />
                </div>

                <div className='flex flex-col justify-end'>
                  <label className='text-xs font-semibold text-zinc-300 flex items-center gap-2 cursor-pointer pb-2'>
                    <input
                      type='checkbox'
                      checked={genDoubleRound}
                      onChange={e => setGenDoubleRound(e.target.checked)}
                      className='rounded border-white/10 text-cyan-500 focus:ring-0 bg-[#0e1726]'
                    />
                    Çift Devreli (Rövanşlı)
                  </label>
                  <button
                    onClick={handleOpenPreview}
                    disabled={previewLoading}
                    className='w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50'>
                    {previewLoading ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Eye className='w-3.5 h-3.5' />}
                    Ön İzleme Oluştur
                  </button>
                </div>
              </div>

              {/* Preview Results Table */}
              {previewData && (
                <div className='space-y-4'>
                  {/* Summary Bar */}
                  <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                    <div className='bg-cyan-500/10 border border-cyan-500/20 p-3 rounded-lg text-center'>
                      <p className='text-[10px] text-cyan-400 font-bold uppercase'>Üretilen Maç</p>
                      <p className='text-xl font-black text-cyan-300 mt-0.5'>{previewData.totalMatches}</p>
                    </div>
                    <div className='bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-center'>
                      <p className='text-[10px] text-emerald-400 font-bold uppercase'>Eklenecek Yeni</p>
                      <p className='text-xl font-black text-emerald-300 mt-0.5'>{previewData.newMatchesCount}</p>
                    </div>
                    <div className='bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-center'>
                      <p className='text-[10px] text-amber-400 font-bold uppercase'>Mükerrer / Mevcut</p>
                      <p className='text-xl font-black text-amber-300 mt-0.5'>{previewData.duplicateMatchesCount}</p>
                    </div>
                    <div className='bg-purple-500/10 border border-purple-500/20 p-3 rounded-lg text-center'>
                      <p className='text-[10px] text-purple-400 font-bold uppercase'>Takvim Planı</p>
                      <p className='text-sm font-black text-purple-300 mt-1.5'>
                        {previewData.weeksCount} Hafta • 8 Oturum + 1 Ara
                      </p>
                    </div>
                  </div>

                  {/* Devre Arası Banner */}
                  {previewData.breakInfo && (
                    <div className='p-3 bg-gradient-to-r from-amber-500/15 to-transparent border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <PauseCircle className='w-4 h-4 text-amber-400 flex-shrink-0' />
                        <span>
                          <strong>Devre Arası:</strong> 12. ve 13. Haftalar arasında 1 Pazartesi boş geçilecek (Maç oynanmaz, transfer penceresi açıktır).
                        </span>
                      </div>
                      <span className='text-[10px] font-mono font-bold text-amber-400 shrink-0 ml-2'>
                        {previewData.breakInfo.breakMondayDate}
                      </span>
                    </div>
                  )}

                  {previewData.duplicateMatchesCount > 0 && (
                    <div className='p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2'>
                      <AlertTriangle className='w-4 h-4 flex-shrink-0' />
                      <span>Bu lig için veritabanında zaten fikstür kayıtları mevcut. Sistem mükerrer maç oluşturulmasını engelleyecektir.</span>
                    </div>
                  )}

                  {/* Fixtures List */}
                  <div className='border border-white/5 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-white/5'>
                    {previewData.items.map((item: FixturePreviewItem, idx: number) => {
                      const prevItem = idx > 0 ? previewData.items[idx - 1] : null;
                      const isFirstMatchOfWeek13 = item.week === 13 && (!prevItem || prevItem.week !== 13);

                      return (
                        <div key={idx}>
                          {isFirstMatchOfWeek13 && (
                            <div className='px-4 py-2 bg-gradient-to-r from-amber-500/20 to-purple-500/10 border-y border-amber-500/30 flex items-center justify-between text-[11px] font-bold text-amber-300'>
                              <div className='flex items-center gap-2'>
                                <PauseCircle className='w-3.5 h-3.5 text-amber-400' />
                                <span>DEVRE ARASI & RESMİ TRANSFER DÖNEMİ (1 Pazartesi Gecesi Boş)</span>
                              </div>
                              <span className='text-[10px] font-mono'>1 Hafta Boş</span>
                            </div>
                          )}
                          <div className={`p-3 text-xs flex items-center justify-between ${item.is_duplicate ? 'bg-amber-500/5' : 'bg-[#121c2d]/40'}`}>
                            <div className='flex items-center gap-3'>
                              <div className='w-28 flex flex-col'>
                                <span className='font-black text-white'>{item.week}. Hafta</span>
                                {item.session_number && (
                                  <span className='text-[10px] text-cyan-400 font-semibold'>
                                    {item.session_number}. Oturum • {item.time_trt}
                                  </span>
                                )}
                              </div>
                              <span className='font-bold text-white'>{item.home_team_name}</span>
                              <span className='text-zinc-500 text-[10px]'>vs</span>
                              <span className='font-bold text-white'>{item.away_team_name}</span>
                            </div>
                            <div className='flex items-center gap-3'>
                              <span className='text-zinc-400 text-[11px]'>{new Date(item.scheduled_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' })}</span>
                              {item.is_duplicate ? (
                                <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20'>MEVCUT</span>
                              ) : (
                                <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>YENİ</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className='p-6 border-t border-white/5 flex items-center justify-end gap-3 flex-shrink-0'>
              <button
                onClick={() => setPreviewModal(false)}
                className='px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-all'>
                Kapat
              </button>
              {previewData && (
                <button
                  onClick={handleConfirmGenerate}
                  disabled={loading || previewData.newMatchesCount === 0}
                  className='px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50'>
                  {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <CheckCircle2 className='w-4 h-4' />}
                  Fikstürü Onayla ve Sisteme Aktar ({previewData.newMatchesCount} Maç)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT COMPREHENSIVE FIXTURE MODAL */}
      {editModal && (
        <div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'>
          <div className='bg-[#0d1522] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden'>
            <div className='p-5 border-b border-white/5 flex items-center justify-between'>
              <h3 className='text-sm font-black text-white tracking-wider flex items-center gap-2'>
                <Edit2 className='w-4 h-4 text-cyan-400' />
                FİKSTÜRÜ DÜZENLE
              </h3>
              <button onClick={() => setEditModal(null)} className='text-zinc-400 hover:text-white'>
                <X className='w-4 h-4' />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className='p-5 space-y-4 text-xs'>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-zinc-400 block mb-1 font-semibold'>Hafta Numarası</label>
                  <input
                    type='number'
                    name='week_number'
                    defaultValue={editModal.week_number}
                    min={1}
                    required
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500'
                  />
                </div>
                <div>
                  <label className='text-zinc-400 block mb-1 font-semibold'>Fikstür Durumu</label>
                  <select
                    name='status'
                    defaultValue={editModal.status}
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500'>
                    <option value='SCHEDULED'>Planlandı (SCHEDULED)</option>
                    <option value='COMPLETED'>Tamamlandı (COMPLETED)</option>
                    <option value='POSTPONED'>Ertelendi (POSTPONED)</option>
                    <option value='CANCELLED'>İptal (CANCELLED)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className='text-zinc-400 block mb-1 font-semibold'>Tarih ve Saat</label>
                <input
                  type='datetime-local'
                  name='scheduled_at'
                  defaultValue={editModal.scheduled_at ? new Date(editModal.scheduled_at).toISOString().slice(0, 16) : ''}
                  required
                  className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500'
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-zinc-400 block mb-1 font-semibold'>Ev Sahibi Takım</label>
                  <select
                    name='home_team_id'
                    defaultValue={editModal.home_team_id}
                    disabled={Boolean(editModal.match)}
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50'>
                    {availableTeamsInLeague.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='text-zinc-400 block mb-1 font-semibold'>Deplasman Takım</label>
                  <select
                    name='away_team_id'
                    defaultValue={editModal.away_team_id}
                    disabled={Boolean(editModal.match)}
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50'>
                    {availableTeamsInLeague.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editModal.match && (
                <div className='p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300'>
                  ⚠️ Bu fikstüre bağlı maç kaydı bulunduğu için takımlar kilitlenmiştir. Takımları değiştirmek için önce bağlı maçı silmelisiniz.
                </div>
              )}

              <div>
                <label className='text-zinc-400 block mb-1 font-semibold'>Notlar / Açıklama</label>
                <textarea
                  name='notes'
                  defaultValue={editModal.notes || ''}
                  rows={2}
                  placeholder='Fikstürle ilgili ek notlar...'
                  className='w-full bg-[#121c2d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500'
                />
              </div>

              <div className='flex items-center justify-end gap-2 pt-2 border-t border-white/5'>
                <button
                  type='button'
                  onClick={() => setEditModal(null)}
                  className='px-4 py-2 text-zinc-400 hover:text-white font-medium'>
                  İptal
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2'>
                  {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Check className='w-4 h-4' />}
                  Değişiklikleri Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK SCORE MODAL */}
      {scoreModal && (
        <div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'>
          <div className='bg-[#0d1522] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden'>
            <div className='p-5 border-b border-white/5 flex items-center justify-between'>
              <h3 className='text-sm font-black text-white tracking-wider flex items-center gap-2'>
                <Play className='w-4 h-4 text-emerald-400' />
                SKOR GİR / DÜZENLE
              </h3>
              <button onClick={() => setScoreModal(null)} className='text-zinc-400 hover:text-white'>
                <X className='w-4 h-4' />
              </button>
            </div>

            <form onSubmit={handleScoreSubmit} className='p-5 space-y-4 text-xs'>
              <div className='text-center p-3 bg-[#121c2d] rounded-xl border border-white/5'>
                <p className='text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2'>
                  Hafta {scoreModal.week_number} Karşılaşması
                </p>
                <div className='flex items-center justify-center gap-4 text-sm font-bold text-white'>
                  <span>{scoreModal.home?.name}</span>
                  <span className='text-zinc-500'>vs</span>
                  <span>{scoreModal.away?.name}</span>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='text-zinc-300 block mb-1 font-semibold text-center'>
                    {scoreModal.home?.name}
                  </label>
                  <input
                    type='number'
                    name='home_score'
                    defaultValue={scoreModal.match?.home_score ?? 0}
                    min={0}
                    required
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg p-3 text-center text-xl font-black text-white focus:outline-none focus:border-cyan-500'
                  />
                </div>
                <div>
                  <label className='text-zinc-300 block mb-1 font-semibold text-center'>
                    {scoreModal.away?.name}
                  </label>
                  <input
                    type='number'
                    name='away_score'
                    defaultValue={scoreModal.match?.away_score ?? 0}
                    min={0}
                    required
                    className='w-full bg-[#121c2d] border border-white/10 rounded-lg p-3 text-center text-xl font-black text-white focus:outline-none focus:border-cyan-500'
                  />
                </div>
              </div>

              <div className='p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-[11px] text-cyan-300'>
                ℹ️ <strong>İş Kuralı:</strong> Skor girmek maçı otomatik olarak onaylamaz. Kaydedilen skor maç onay kuyruğunda incelenip onaylanana kadar puan durumunu etkilemez.
              </div>

              <div className='flex items-center justify-end gap-2 pt-2 border-t border-white/5'>
                <button
                  type='button'
                  onClick={() => setScoreModal(null)}
                  className='px-4 py-2 text-zinc-400 hover:text-white font-medium'>
                  İptal
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-2'>
                  {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Check className='w-4 h-4' />}
                  Skoru Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL MATCH DETAIL & STATS MODAL */}
      {detailModal && (
        <div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
          <div className='bg-[#0d1522] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl'>
            <div className='p-6 border-b border-white/5 flex items-center justify-between flex-shrink-0'>
              <div>
                <h3 className='text-base font-black text-white tracking-wider flex items-center gap-2'>
                  <FileText className='w-4 h-4 text-cyan-400' />
                  KARŞILAŞMA DETAYI VE İSTATİSTİKLER
                </h3>
                <p className='text-xs text-zinc-400 mt-0.5'>
                  Hafta {detailModal.week_number} • {detailModal.leagues?.name} • {new Date(detailModal.scheduled_at).toLocaleDateString('tr-TR')}
                </p>
              </div>
              <button onClick={() => setDetailModal(null)} className='text-zinc-400 hover:text-white'>
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='p-6 overflow-y-auto space-y-6 flex-1 text-xs'>
              {/* Score Header */}
              <div className='bg-[#121c2d] p-6 rounded-xl border border-white/5 text-center'>
                <div className='flex items-center justify-center gap-8'>
                  <div className='flex items-center gap-3 w-48 justify-end'>
                    <span className='font-bold text-white text-sm'>{detailModal.home_team?.name}</span>
                    <TeamLogo src={detailModal.home_team?.logo_url} name={detailModal.home_team?.name} size='sm' />
                  </div>

                  <div className='px-6 py-2 bg-[#0e1726] rounded-xl border border-white/10 flex items-center gap-3'>
                    <span className='text-2xl font-black text-white'>
                      {detailModal.matches?.home_score ?? '-'}
                    </span>
                    <span className='text-zinc-600 font-bold'>:</span>
                    <span className='text-2xl font-black text-white'>
                      {detailModal.matches?.away_score ?? '-'}
                    </span>
                  </div>

                  <div className='flex items-center gap-3 w-48 justify-start'>
                    <TeamLogo src={detailModal.away_team?.logo_url} name={detailModal.away_team?.name} size='sm' />
                    <span className='font-bold text-white text-sm'>{detailModal.away_team?.name}</span>
                  </div>
                </div>

                <div className='mt-4 flex items-center justify-center gap-3'>
                  <StatusBadge fixtureStatus={detailModal.status} matchStatus={detailModal.matches?.status} />
                  {detailModal.matches?.ea_match_id && (
                    <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20'>
                      EA ID #{detailModal.matches.ea_match_id}
                    </span>
                  )}
                  {detailModal.matches?.source && (
                    <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/10'>
                      Kaynak: {detailModal.matches.source}
                    </span>
                  )}
                </div>
              </div>

              {/* Player Stats Table (if any) */}
              {detailModal.matches?.stats && detailModal.matches.stats.length > 0 ? (
                <div>
                  <h4 className='font-bold text-white uppercase tracking-wider text-xs mb-3 flex items-center gap-2'>
                    <Shield className='w-4 h-4 text-cyan-400' />
                    Oyuncu İstatistikleri ({detailModal.matches.stats.length} Oyuncu)
                  </h4>
                  <div className='border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5'>
                    {detailModal.matches.stats.map((s: any) => (
                      <div key={s.id} className='p-3 flex items-center justify-between bg-[#121c2d]/40'>
                        <div className='flex items-center gap-3'>
                          <span className='w-8 font-mono text-[10px] text-zinc-400 uppercase'>{s.position || '-'}</span>
                          <div>
                            <p className='font-bold text-white'>{s.profiles?.full_name || s.profiles?.username || s.ea_player_name || 'Bilinmeyen Oyuncu'}</p>
                            <p className='text-[10px] text-zinc-400 font-mono'>EA ID: {s.ea_player_id || '-'}</p>
                          </div>
                        </div>
                        <div className='flex items-center gap-4 text-zinc-300'>
                          <span className='font-mono'>⚽ {s.goals}</span>
                          <span className='font-mono'>👟 {s.assists}</span>
                          <span className='font-mono text-cyan-400 font-bold'>★ {s.rating || '-'}</span>
                          {s.extra_stats?.roster_status === 'VALID' && (
                            <span className='px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>LİSANSLI</span>
                          )}
                          {s.extra_stats?.roster_status === 'ROSTER_MISMATCH' && (
                            <span className='px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20'>KADRO UYUŞMAZLIĞI</span>
                          )}
                          {(!s.player_id || s.extra_stats?.roster_status === 'UNMATCHED') && (
                            <span className='px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20'>EŞLEŞMEDİ</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className='p-6 bg-[#121c2d]/40 rounded-xl border border-white/5 text-center text-zinc-400'>
                  Bu karşılaşma için henüz kaydedilmiş oyuncu istatistiği bulunmuyor.
                </div>
              )}
            </div>

            <div className='p-6 border-t border-white/5 flex items-center justify-between flex-shrink-0'>
              <Link
                href='/admin/matches'
                className='text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5'>
                Maç Onay Merkezi&apos;ne Git
                <ArrowRight className='w-3.5 h-3.5' />
              </Link>
              <button
                onClick={() => setDetailModal(null)}
                className='px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg'>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'>
          <div className='bg-[#0d1522] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl'>
            <div className='flex items-center gap-3 mb-4'>
              <div className={`p-2 rounded-xl ${confirmModal.type === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                <AlertTriangle className='w-6 h-6' />
              </div>
              <div>
                <h3 className='text-sm font-black text-white uppercase tracking-wider'>{confirmModal.title}</h3>
                <p className='text-xs text-zinc-400 mt-1 whitespace-pre-line'>{confirmModal.message}</p>
              </div>
            </div>
            <div className='flex items-center justify-end gap-2 mt-6'>
              <button onClick={closeConfirm} className='px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white'>Vazgeç</button>
              <button
                onClick={confirmModal.action}
                disabled={loading}
                className={`px-5 py-2 text-xs font-bold rounded-lg text-white flex items-center gap-2 ${
                  confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                {loading && <Loader2 className='w-3.5 h-3.5 animate-spin' />}
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render a single fixture row
  function renderFixtureRow(f: any) {
    const isPlayed = f.match && f.match.home_score !== null && f.match.away_score !== null;

    return (
      <div key={f.id} className='p-4 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4'>
        {/* Match Info & Teams */}
        <div className='flex items-center gap-4 flex-1'>
          <div className='w-12 text-center flex-shrink-0'>
            <span className='text-[10px] font-black text-zinc-500 block uppercase'>HAFTA</span>
            <span className='text-sm font-black text-white'>{f.week_number}</span>
          </div>

          <div className='h-8 w-px bg-white/10 flex-shrink-0 hidden sm:block' />

          <div className='flex items-center gap-4 flex-1'>
            {/* Home Team */}
            <div className='flex items-center gap-2.5 flex-1 justify-end text-right'>
              <span className='font-bold text-white text-xs sm:text-sm truncate'>{f.home?.name || 'Ev Sahibi'}</span>
              <TeamLogo src={f.home?.logo_url} name={f.home?.name} size='sm' />
            </div>

            {/* Score or VS */}
            <div className='px-3 py-1 rounded-lg bg-[#121c2d] border border-white/5 flex-shrink-0 min-w-16 text-center'>
              {isPlayed ? (
                <div className='flex items-center justify-center gap-1.5 font-black text-sm text-white'>
                  <span>{f.match.home_score}</span>
                  <span className='text-zinc-600'>-</span>
                  <span>{f.match.away_score}</span>
                </div>
              ) : (
                <span className='text-xs font-black text-zinc-500'>vs</span>
              )}
            </div>

            {/* Away Team */}
            <div className='flex items-center gap-2.5 flex-1 justify-start text-left'>
              <TeamLogo src={f.away?.logo_url} name={f.away?.name} size='sm' />
              <span className='font-bold text-white text-xs sm:text-sm truncate'>{f.away?.name || 'Deplasman'}</span>
            </div>
          </div>
        </div>

        {/* Date, Status and Actions */}
        <div className='flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-white/5'>
          <div className='text-left md:text-right flex flex-col justify-center'>
            <span className='text-[11px] font-semibold text-zinc-300 flex items-center md:justify-end gap-1'>
              <Clock className='w-3 h-3 text-zinc-500' />
              {f.scheduled_at ? new Intl.DateTimeFormat('tr-TR', {
                timeZone: 'Europe/Istanbul',
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              }).format(new Date(f.scheduled_at)) : 'Tarih Yok'}
            </span>
            <div className='mt-1 flex items-center md:justify-end gap-1.5'>
              <StatusBadge fixtureStatus={f.status} matchStatus={f.match?.status} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex items-center gap-1.5'>
            <button
              onClick={() => setScoreModal(f)}
              title='Skor Gir / Güncelle'
              className='p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all'>
              <Play className='w-3.5 h-3.5' />
            </button>
            <button
              onClick={() => setEditModal(f)}
              title='Fikstürü Düzenle'
              className='p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-all'>
              <Edit2 className='w-3.5 h-3.5' />
            </button>
            <button
              onClick={() => handleOpenDetail(f)}
              title='Maç Detayı & Kadrolar'
              className='p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition-all'>
              <Eye className='w-3.5 h-3.5' />
            </button>
            <button
              onClick={() => handleCancel(f)}
              title='İptal Et'
              className='p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all'>
              <XCircle className='w-3.5 h-3.5' />
            </button>
            <button
              onClick={() => handleDelete(f)}
              title='Sil'
              className='p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all'>
              <Trash2 className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
