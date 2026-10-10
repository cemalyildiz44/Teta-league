'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy, Plus, Trash2, ShieldAlert, X, Loader2, Users, CheckCircle2,
  XCircle, User, Edit3, Calendar, Clock, Search, ExternalLink, Award, FileText, Swords,
  Image as ImageIcon, Eye, AlertTriangle, Crown
} from 'lucide-react';
import {
  create1V1WinnerAction, createKarmaWinnerAction,
  deleteTournamentAction, updateNightCupApplicationStatusAction, assignNightCupWinnerAction,
  updateNightCupDetailsAction, approveTournamentMatchSubmissionAction, rejectTournamentMatchSubmissionAction,
  adminUpdateNightCupTeamAction, adminAddPlayerToNightCupSquadAction, adminRemovePlayerFromNightCupSquadAction, adminDeleteNightCupApplicationAction
} from './actions';
import TeamLogo from '@/components/TeamLogo';
import TournamentGroupsAdminModal from './TournamentGroupsAdminModal';
import NightCupCreateWizardModal from './NightCupCreateWizardModal';
import { formatTournamentDate, formatForDateTimeLocal } from '@/lib/date-utils';

export function TournamentsManager({ tournaments, winners, applications, seasons, profiles, groups = [], matches = [], submissions = [] }: any) {
  const router = useRouter();

  const [tab, setTab] = useState<'1V1' | 'KARMA' | 'NIGHT_CUP' | 'SONUC_ONAYLARI'>('1V1');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const [search, setSearch] = useState('');
  const [winner1V1PlayerSearch, setWinner1V1PlayerSearch] = useState('');
  const [karmaPlayerSearch, setKarmaPlayerSearch] = useState('');

  // Submissions review states
  const [submissionFilterStatus, setSubmissionFilterStatus] = useState<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING_REVIEW');
  const [submissionTournamentFilter, setSubmissionTournamentFilter] = useState<string>('ALL');
  const [submissionSearch, setSubmissionSearch] = useState<string>('');
  const [rejectModalSubmission, setRejectModalSubmission] = useState<any | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  const [create1V1Modal, setCreate1V1Modal] = useState(false);
  const [createKarmaModal, setCreateKarmaModal] = useState(false);
  const [createNightCupModal, setCreateNightCupModal] = useState(false);
  const [editNightCupModal, setEditNightCupModal] = useState<any>(null);
  const [manageGroupsModal, setManageGroupsModal] = useState<any>(null);

  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [karmaProfiles, setKarmaProfiles] = useState<string[]>([]);
  const [selectedNightCup, setSelectedNightCup] = useState<string | null>(null);

  // Night Cup temporary team management states
  const [editingNightCupTeam, setEditingNightCupTeam] = useState<any | null>(null);
  const [editTeamLogoPreview, setEditTeamLogoPreview] = useState<string | null>(null);
  const [selectedSquadPlayerToAdd, setSelectedSquadPlayerToAdd] = useState<string>('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [nightCupAppFilter, setNightCupAppFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [nightCupAppSearch, setNightCupAppSearch] = useState<string>('');
  const [teamActionLoading, setTeamActionLoading] = useState<boolean>(false);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleEditNightCupTeamSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingNightCupTeam) return;
    setTeamActionLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append('application_id', editingNightCupTeam.id);
    const res = await adminUpdateNightCupTeamAction(formData);
    setTeamActionLoading(false);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Takım bilgileri güncellendi.', 'success');
      setEditingNightCupTeam(null);
      setEditTeamLogoPreview(null);
      router.refresh();
    }
  };

  const handleAddSquadPlayer = async (applicationId: string) => {
    if (!selectedSquadPlayerToAdd) {
      showFeedback('Lütfen eklenecek bir oyuncu seçin.', 'error');
      return;
    }
    setTeamActionLoading(true);
    const res = await adminAddPlayerToNightCupSquadAction(applicationId, selectedSquadPlayerToAdd);
    setTeamActionLoading(false);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Oyuncu kadroya eklendi.', 'success');
      setSelectedSquadPlayerToAdd('');
      router.refresh();
    }
  };

  const handleRemoveSquadPlayer = async (applicationId: string, profileId: string) => {
    setTeamActionLoading(true);
    const res = await adminRemovePlayerFromNightCupSquadAction(applicationId, profileId);
    setTeamActionLoading(false);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Oyuncu kadrodan çıkarıldı.', 'success');
      router.refresh();
    }
  };

  const handleDeleteApplication = (app: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'BAŞVURUYU SİL',
      message: `"${app.team_name}" takımının Night Cup başvurusunu silmek istiyor musunuz? Bu işlem takımın geçici başvuru ve turnuva kadro kayıtlarını kaldırır.`,
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await adminDeleteNightCupApplicationAction(app.id);
        setLoading(false);
        setConfirmModal({ isOpen: false });
        if (res.error) {
          showFeedback(res.error, 'error');
        } else {
          showFeedback(res.success || 'Başvuru silindi.', 'success');
          if (editingNightCupTeam && editingNightCupTeam.id === app.id) {
            setEditingNightCupTeam(null);
          }
          router.refresh();
        }
      }
    });
  };

  const handleCreate1V1 = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const res = await create1V1WinnerAction(new FormData(e.target));
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCreate1V1Modal(false); router.refresh(); }
  };

  const handleCreateKarma = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    formData.append('profiles', JSON.stringify(karmaProfiles));
    const res = await createKarmaWinnerAction(formData);
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCreateKarmaModal(false); setKarmaProfiles([]); router.refresh(); }
  };

  const handleUpdateNightCup = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const res = await updateNightCupDetailsAction(new FormData(e.target));
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else {
      showFeedback(res.success || '', 'success');
      setEditNightCupModal(null);
      router.refresh();
    }
  };

  const handleAction = async (actionFn: any, ...args: any[]) => {
    setLoading(true);
    const res = await actionFn(...args);
    setLoading(false);
    setConfirmModal({ isOpen: false });
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); router.refresh(); }
  };

  const handleApproveSubmission = async (subId: string) => {
    setLoading(true);
    const res = await approveTournamentMatchSubmissionAction(subId);
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else {
      showFeedback(res.success || 'Sonuç onaylandı ve maç skoru işlendi.', 'success');
      router.refresh();
    }
  };

  const handleRejectSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalSubmission) return;
    if (!rejectionReasonInput.trim()) {
      showFeedback('Lütfen bir ret gerekçesi belirtin.', 'error');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('submission_id', rejectModalSubmission.id);
    formData.append('rejection_reason', rejectionReasonInput.trim());

    const res = await rejectTournamentMatchSubmissionAction(formData);
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else {
      showFeedback(res.success || 'Sonuç reddedildi.', 'success');
      setRejectModalSubmission(null);
      setRejectionReasonInput('');
      router.refresh();
    }
  };

  const toggleKarmaProfile = (id: string) => {
    if (karmaProfiles.includes(id)) {
      setKarmaProfiles(karmaProfiles.filter(p => p !== id));
    } else {
      if (karmaProfiles.length >= 11) return showFeedback('En fazla 11 oyuncu seçebilirsiniz.', 'error');
      setKarmaProfiles([...karmaProfiles, id]);
    }
  };

  const formatDateTime = (val: string | null) => {
    if (!val) return '-';
    return formatTournamentDate(val);
  };

  const formatForInput = (val: string | null) => {
    return formatForDateTimeLocal(val);
  };

  const filteredTournaments = tournaments.filter((t: any) => {
    if (t.type !== tab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();

    // Tournament name & description match
    if (t.name?.toLowerCase().includes(q)) return true;
    if (t.description?.toLowerCase().includes(q)) return true;

    // Winner players match (username, full_name, team name)
    const tourWinners = winners.filter((w: any) => w.tournament_id === t.id);
    const winnerMatch = tourWinners.some((w: any) => {
      const u = w.profiles?.username?.toLowerCase() || '';
      const fn = w.profiles?.full_name?.toLowerCase() || '';
      const team = w.tournament_applications?.team_name?.toLowerCase() || '';
      return u.includes(q) || fn.includes(q) || team.includes(q);
    });
    if (winnerMatch) return true;

    // Application players & teams match
    const tourApps = applications.filter((a: any) => a.tournament_id === t.id);
    const appMatch = tourApps.some((a: any) => {
      const captainU = a.profiles?.username?.toLowerCase() || '';
      const captainFn = a.profiles?.full_name?.toLowerCase() || '';
      const team = a.team_name?.toLowerCase() || '';
      const playerMatch = a.tournament_application_players?.some((p: any) => {
        const pu = p.profiles?.username?.toLowerCase() || '';
        const pfn = p.profiles?.full_name?.toLowerCase() || '';
        return pu.includes(q) || pfn.includes(q);
      });
      return captainU.includes(q) || captainFn.includes(q) || team.includes(q) || playerMatch;
    });
    if (appMatch) return true;

    return false;
  });

  // Submissions calculations
  const pendingSubmissionsCount = (submissions || []).filter((s: any) => s.status === 'PENDING_REVIEW').length;
  const approvedSubmissionsCount = (submissions || []).filter((s: any) => s.status === 'APPROVED').length;
  const rejectedSubmissionsCount = (submissions || []).filter((s: any) => s.status === 'REJECTED').length;

  const filteredSubmissions = (submissions || []).filter((s: any) => {
    if (submissionFilterStatus !== 'ALL' && s.status !== submissionFilterStatus) return false;
    if (submissionTournamentFilter !== 'ALL' && s.tournament_id !== submissionTournamentFilter) return false;
    if (submissionSearch.trim()) {
      const q = submissionSearch.toLowerCase().trim();
      const tourName = s.tournament?.name?.toLowerCase() || '';
      const submitterU = s.submitter?.username?.toLowerCase() || '';
      const submitterFn = s.submitter?.full_name?.toLowerCase() || '';
      const teamName = s.team?.team_name?.toLowerCase() || '';
      const homeName = s.match?.home?.team_name?.toLowerCase() || '';
      const awayName = s.match?.away?.team_name?.toLowerCase() || '';
      return tourName.includes(q) || submitterU.includes(q) || submitterFn.includes(q) || teamName.includes(q) || homeName.includes(q) || awayName.includes(q);
    }
    return true;
  });

  return (
    <div className='space-y-6'>
      {feedback && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          <ShieldAlert className='w-5 h-5'/> {feedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div className='flex items-center gap-2 bg-[#060d18] p-1.5 rounded-xl border border-white/5'>
        {(['1V1', 'KARMA', 'NIGHT_CUP', 'SONUC_ONAYLARI'] as const).map(t => {
          const isReviewTab = t === 'SONUC_ONAYLARI';
          return (
            <button
              key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${tab === t ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-zinc-500 hover:text-white'}`}
            >
              <span>{isReviewTab ? 'SONUÇ ONAYLARI' : t.replace('_', ' ')}</span>
              {isReviewTab && pendingSubmissionsCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${tab === 'SONUC_ONAYLARI' ? 'bg-black text-[#00e5ff]' : 'bg-amber-500 text-black animate-pulse'}`}>
                  {pendingSubmissionsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content: SONUC_ONAYLARI vs TOURNAMENTS */}
      {tab === 'SONUC_ONAYLARI' ? (
        <div className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-[#0a1628] p-4 rounded-2xl border border-white/5">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSubmissionFilterStatus('PENDING_REVIEW')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  submissionFilterStatus === 'PENDING_REVIEW'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Onay Bekliyor</span>
                {pendingSubmissionsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-black/40 text-white">
                    {pendingSubmissionsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setSubmissionFilterStatus('APPROVED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  submissionFilterStatus === 'APPROVED'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Onaylananlar ({approvedSubmissionsCount})</span>
              </button>

              <button
                onClick={() => setSubmissionFilterStatus('REJECTED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  submissionFilterStatus === 'REJECTED'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reddedilenler ({rejectedSubmissionsCount})</span>
              </button>

              <button
                onClick={() => setSubmissionFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  submissionFilterStatus === 'ALL'
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                Tümü ({(submissions || []).length})
              </button>
            </div>

            {/* Tournament Dropdown & Search Input */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <select
                value={submissionTournamentFilter}
                onChange={(e) => setSubmissionTournamentFilter(e.target.value)}
                className="w-full sm:w-auto bg-[#060d18] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-500"
              >
                <option value="ALL">Tüm Turnuvalar</option>
                {tournaments
                  .filter((t: any) => t.type === 'NIGHT_CUP')
                  .map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Takım, oyuncu veya maç ara..."
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Submissions Cards */}
          {filteredSubmissions.length === 0 ? (
            <div className="py-24 text-center text-zinc-500 font-mono text-sm card-surface rounded-2xl border border-white/5 space-y-2">
              <Trophy className="w-10 h-10 text-zinc-600 mx-auto opacity-50" />
              <p>Kriterlere uygun sonuç bildirimi bulunamadı.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((sub: any) => {
                const isPending = sub.status === 'PENDING_REVIEW';
                const isApproved = sub.status === 'APPROVED';
                const isRejected = sub.status === 'REJECTED';
                const homeTeam = sub.match?.home;
                const awayTeam = sub.match?.away;

                return (
                  <div
                    key={sub.id}
                    className="bg-[#0a1628] rounded-2xl border border-white/5 hover:border-cyan-500/20 transition-all p-5 md:p-6 space-y-5 shadow-xl"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <Trophy className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-white uppercase tracking-wider">
                            {sub.tournament?.name || 'Turnuva'}
                          </h4>
                          <span className="text-[11px] font-bold text-zinc-400 uppercase">
                            {sub.match ? `${sub.match.round_number}. Hafta • Maç #${sub.match.match_order}` : 'Grup Maçı'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 font-mono">
                          {formatDateTime(sub.created_at)}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                            isPending
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                              : isApproved
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {isPending
                            ? 'ONAY BEKLİYOR'
                            : isApproved
                            ? 'ONAYLANDI'
                            : 'REDDEDİLDİ'}
                        </span>
                      </div>
                    </div>

                    {/* Main Content: 3-column layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Column 1: Match Score & Goalscorers (5 cols) */}
                      <div className="lg:col-span-5 bg-black/40 rounded-2xl border border-white/5 p-4 space-y-4">
                        {/* Score display */}
                        <div className="flex items-center justify-between gap-3">
                          {/* Home */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <TeamLogo src={homeTeam?.logo_url} name={homeTeam?.team_name} size="sm" />
                            <span className="font-black text-xs sm:text-sm text-white uppercase truncate">
                              {homeTeam?.team_name || 'Ev Sahibi'}
                            </span>
                          </div>

                          {/* Big Score Box */}
                          <div className="px-4 py-2 rounded-xl bg-black/80 border border-cyan-500/30 text-center shrink-0">
                            <span className="text-xl sm:text-2xl font-black text-[#00e5ff] font-mono tracking-wider">
                              {sub.home_score} - {sub.away_score}
                            </span>
                          </div>

                          {/* Away */}
                          <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right">
                            <span className="font-black text-xs sm:text-sm text-white uppercase truncate">
                              {awayTeam?.team_name || 'Deplasman'}
                            </span>
                            <TeamLogo src={awayTeam?.logo_url} name={awayTeam?.team_name} size="sm" />
                          </div>
                        </div>

                        {/* Goalscorers breakdown */}
                        <div className="pt-3 border-t border-white/5 space-y-2">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">
                            BİLDİRİLEN GOLCÜLER ({sub.goals?.length || 0})
                          </span>

                          {(!sub.goals || sub.goals.length === 0) ? (
                            <p className="text-xs text-zinc-500 italic">
                              {sub.home_score === 0 && sub.away_score === 0 ? 'Gol yok (0-0 berabere).' : 'Golcü kaydı girilmedi.'}
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {/* Home goals */}
                              <div className="space-y-1">
                                {sub.goals
                                  .filter((g: any) => g.team_application_id === sub.match?.home?.id || g.team_application_id === homeTeam?.id || g.team_application_id === sub.submitted_team_application_id)
                                  .map((g: any) => (
                                    <div key={g.id} className="flex items-center gap-1.5 text-zinc-300">
                                      <span className="text-emerald-400">⚽</span>
                                      <span className="font-bold truncate">{g.player?.username || g.player_name || 'Oyuncu'}</span>
                                      {g.goals > 1 && <span className="text-zinc-500 font-black">({g.goals})</span>}
                                      {g.is_own_goal && <span className="text-red-400 text-[10px] font-black">(K.K.)</span>}
                                    </div>
                                  ))}
                              </div>

                              {/* Away goals */}
                              <div className="space-y-1 text-right">
                                {sub.goals
                                  .filter((g: any) => g.team_application_id === sub.match?.away?.id || g.team_application_id === awayTeam?.id)
                                  .map((g: any) => (
                                    <div key={g.id} className="flex items-center justify-end gap-1.5 text-zinc-300">
                                      {g.is_own_goal && <span className="text-red-400 text-[10px] font-black">(K.K.)</span>}
                                      {g.goals > 1 && <span className="text-zinc-500 font-black">({g.goals})</span>}
                                      <span className="font-bold truncate">{g.player?.username || g.player_name || 'Oyuncu'}</span>
                                      <span className="text-emerald-400">⚽</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Column 2: Submitter & Notes (4 cols) */}
                      <div className="lg:col-span-4 space-y-3">
                        {/* Submitter */}
                        <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                            BİLDİRİMİ YAPAN TEMSİLCİ
                          </span>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden border border-white/10 shrink-0">
                              {sub.submitter?.avatar_url ? (
                                <img src={sub.submitter.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                  <User className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-black text-white block truncate">
                                @{sub.submitter?.username || 'Kullanıcı'}
                              </span>
                              {sub.submitter?.full_name && (
                                <span className="text-[11px] text-zinc-400 block truncate">
                                  {sub.submitter.full_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[11px] text-zinc-400">
                            <span className="font-bold">Takım:</span>
                            <span className="text-cyan-400 font-bold truncate">
                              {sub.team?.team_name || 'Takım'}
                            </span>
                          </div>
                        </div>

                        {/* Notes */}
                        {sub.notes && (
                          <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-xs text-zinc-300">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1">
                              Açıklama / Not:
                            </span>
                            <p className="italic">{sub.notes}</p>
                          </div>
                        )}

                        {/* If Rejected: Rejection Reason */}
                        {isRejected && sub.rejection_reason && (
                          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 space-y-1">
                            <div className="font-black text-red-200 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" /> Ret Gerekçesi
                            </div>
                            <p>{sub.rejection_reason}</p>
                          </div>
                        )}

                        {/* If Approved: Info */}
                        {isApproved && (
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                            <span>Bu skor onaylanarak puan tablosuna işlenmiştir.</span>
                          </div>
                        )}
                      </div>

                      {/* Column 3: Screenshot Proof & Action Buttons (3 cols) */}
                      <div className="lg:col-span-3 space-y-4">
                        {/* Screenshot Thumbnail */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                            MAÇ KANITI (EKRAN GÖRÜNTÜSÜ)
                          </span>
                          {sub.screenshot_url ? (
                            <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/60 aspect-video flex items-center justify-center">
                              <img
                                src={sub.screenshot_url}
                                alt="Maç Kanıtı"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <button
                                onClick={() => setPreviewImageModal(sub.screenshot_url)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-black text-xs uppercase cursor-pointer"
                              >
                                <Eye className="w-4 h-4" /> Büyüt
                              </button>
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center text-xs text-zinc-500">
                              Görsel yüklenmedi
                            </div>
                          )}
                          {sub.screenshot_url && (
                            <a
                              href={sub.screenshot_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 justify-end font-bold"
                            >
                              <ExternalLink className="w-3 h-3" /> Yeni Sekmede Aç
                            </a>
                          )}
                        </div>

                        {/* Actions for Pending */}
                        {isPending && (
                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <button
                              disabled={loading}
                              onClick={() => handleApproveSubmission(sub.id)}
                              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-xs uppercase tracking-wider hover:brightness-110 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                            >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              <span>Sonucu Onayla</span>
                            </button>

                            <button
                              disabled={loading}
                              onClick={() => {
                                setRejectModalSubmission(sub);
                                setRejectionReasonInput('');
                              }}
                              className="w-full py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Reddet</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Action Bar */
        <div className='space-y-4'>
        <div className='flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center'>
          <div className='relative w-full sm:w-80'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
            <input
              type='text'
              placeholder='Turnuva veya Oyuncu Ara...'
              value={search}
              onChange={e => setSearch(e.target.value)}
              className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
            />
          </div>
          <div className='flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end'>
            <div className='text-xs font-bold text-zinc-500 uppercase tracking-wider'>
              {filteredTournaments.length} {tab.replace('_', ' ')} Turnuvası
            </div>
            {tab === '1V1' && (
              <button onClick={() => setCreate1V1Modal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
                <Plus className='w-4 h-4'/> YENİ 1V1 ŞAMPİYONU
              </button>
            )}
            {tab === 'KARMA' && (
              <button onClick={() => setCreateKarmaModal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
                <Plus className='w-4 h-4'/> YENİ KARMA ŞAMPİYONU
              </button>
            )}
            {tab === 'NIGHT_CUP' && (
              <button onClick={() => setCreateNightCupModal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
                <Plus className='w-4 h-4'/> YENİ NIGHT CUP
              </button>
            )}
          </div>
        </div>

        {filteredTournaments.length === 0 ? (
          <div className='py-24 text-center text-zinc-500 font-mono text-sm card-surface rounded-2xl border border-white/5'>
            {tab.replace('_', ' ')} turnuvası bulunamadı.
          </div>
        ) : (
          filteredTournaments.map((tour: any) => {
            const tourWinners = winners.filter((w: any) => w.tournament_id === tour.id);
            const tourApps = applications.filter((a: any) => a.tournament_id === tour.id);
            const hasWinner = tourWinners.length > 0;
            const seasonName = tour.seasons?.name || seasons.find((s: any) => s.id === tour.season_id)?.name || 'Sezon Belirtilmedi';

            return (
              <div key={tour.id} className='bg-[#0a1628] rounded-2xl border border-white/5 overflow-hidden'>
                {/* Tournament Card Header */}
                <div className='p-6 flex flex-col md:flex-row items-start gap-5 border-b border-white/5'>
                  <div className='w-16 h-16 rounded-2xl bg-zinc-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center'>
                    {tour.image_url ? (
                      <img src={tour.image_url} alt="" className='w-full h-full object-cover'/>
                    ) : (
                      <Trophy className='w-8 h-8 text-[#00e5ff]'/>
                    )}
                  </div>

                  <div className='flex-1'>
                    <div className='flex flex-wrap items-center gap-2.5 mb-1'>
                      <h3 className='text-xl font-black text-white uppercase tracking-wider'>{tour.name}</h3>

                      {/* Status Badge */}
                      {hasWinner ? (
                        <span className='px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                          TAMAMLANDI
                        </span>
                      ) : tab === 'NIGHT_CUP' ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${tour.is_registration_open ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-zinc-800 text-zinc-400 border border-white/5'}`}>
                          {tour.is_registration_open ? 'BAŞVURULAR AÇIK' : 'BAŞVURULAR KAPALI'}
                        </span>
                      ) : (
                        <span className='px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'>
                          AÇIK
                        </span>
                      )}

                      {/* Season Badge */}
                      <span className='px-2.5 py-0.5 rounded-full text-[10px] font-bold text-zinc-400 bg-white/5 border border-white/10'>
                        {seasonName}
                      </span>
                    </div>

                    {tour.description && (
                      <p className='text-xs text-zinc-400 mt-1 line-clamp-2'>{tour.description}</p>
                    )}

                    {/* Metadata Bar */}
                    <div className='mt-3 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-zinc-400'>
                      <span className='inline-flex items-center gap-1.5 text-zinc-500'>
                        <Calendar className='w-3.5 h-3.5' />
                        Kayıt: <strong className='text-zinc-300'>{new Date(tour.created_at).toLocaleDateString('tr-TR')}</strong>
                      </span>

                      {tab === 'NIGHT_CUP' && (
                        <>
                          {tour.prize && (
                            <span className='inline-flex items-center gap-1.5 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20'>
                              <Award className='w-3.5 h-3.5 text-yellow-400' />
                              Ödül: <strong className='text-yellow-300'>{tour.prize}</strong>
                            </span>
                          )}

                          <span className='inline-flex items-center gap-1.5 text-zinc-500'>
                            <Users className='w-3.5 h-3.5 text-cyan-400' />
                            Başvuru: <strong className='text-white'>{tourApps.length}</strong>
                            {tour.max_teams && <span className='text-zinc-500'>/ {tour.max_teams}</span>}
                            <span className='text-emerald-400 font-bold'>({tourApps.filter((a: any) => a.status === 'APPROVED').length} Onaylı)</span>
                          </span>

                          {tour.tournament_date && (
                            <span className='inline-flex items-center gap-1.5 text-zinc-500'>
                              <Clock className='w-3.5 h-3.5 text-amber-400' />
                              Maç: <strong className='text-zinc-300'>{formatDateTime(tour.tournament_date)}</strong>
                            </span>
                          )}

                          {(tour.registration_start || tour.registration_end) && (
                            <span className='inline-flex items-center gap-1.5 text-zinc-500'>
                              Başvuru Dönemi: <strong className='text-zinc-300'>{formatDateTime(tour.registration_start)} - {formatDateTime(tour.registration_end)}</strong>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className='flex items-center gap-2 self-start flex-wrap'>
                    {tab === 'NIGHT_CUP' && (
                      <>
                        <Link
                          href={`/turnuvalar/${tour.id}`}
                          target='_blank'
                          className='px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors border border-cyan-500/30 text-xs font-bold inline-flex items-center gap-1.5'
                          title='Turnuva Genel Detay Sayfasını Aç'
                        >
                          <ExternalLink className='w-3.5 h-3.5' />
                          <span>Sayfayı Gör</span>
                        </Link>
                        <button
                          onClick={() => setManageGroupsModal(tour)}
                          className='px-2.5 py-1.5 bg-[#00e5ff]/15 hover:bg-[#00e5ff]/25 text-[#00e5ff] rounded-lg transition-colors border border-[#00e5ff]/30 text-xs font-black inline-flex items-center gap-1.5'
                          title='Grup ve Fikstür Yönetimi'
                        >
                          <Swords className='w-3.5 h-3.5' />
                          <span>Grup & Fikstür</span>
                        </button>
                        <button
                          onClick={() => setEditNightCupModal(tour)}
                          className='p-2 bg-white/5 hover:bg-white/10 text-cyan-400 rounded-lg transition-colors border border-white/10'
                          title='Night Cup Bilgilerini Düzenle'
                        >
                          <Edit3 className='w-4 h-4'/>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setConfirmModal({ action: () => handleAction(deleteTournamentAction, tour.id), title: 'Turnuvayı Sil', type: 'danger', message: 'Bu turnuvayı silmek istiyor musunuz? İlgili kazanan ve başvuru kayıtları da silinecektir.' })}
                      className='p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/10'
                      title='Turnuvayı Sil'
                    >
                      <Trash2 className='w-4 h-4'/>
                    </button>
                  </div>
                </div>

                {/* 1V1 Winner Section */}
                {tab === '1V1' && tourWinners[0] && (
                  <div className='p-4 bg-emerald-500/5 flex items-center gap-4 border-b border-white/5'>
                    <Trophy className='w-5 h-5 text-emerald-400 shrink-0'/>
                    <span className='text-xs font-black text-emerald-400 uppercase tracking-widest'>ŞAMPİYON:</span>
                    <div className='flex items-center gap-2'>
                      {tourWinners[0].profiles?.avatar_url ? (
                        <img src={tourWinners[0].profiles.avatar_url} alt="" className='w-6 h-6 rounded-full object-cover'/>
                      ) : (
                        <User className='w-4 h-4 text-zinc-400'/>
                      )}
                      <span className='text-white font-bold text-sm'>@{tourWinners[0].profiles?.username}</span>
                    </div>
                  </div>
                )}

                {/* Karma Winner Section */}
                {tab === 'KARMA' && (
                  <div className='p-4 bg-emerald-500/5 border-b border-white/5'>
                    <div className='flex items-center gap-3 mb-3'>
                      <Trophy className='w-5 h-5 text-emerald-400 shrink-0'/>
                      <span className='text-xs font-black text-emerald-400 uppercase tracking-widest'>ŞAMPİYON KADRO ({tourWinners.length}/11):</span>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {tourWinners.map((w: any) => (
                        <div key={w.id} className='px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 flex items-center gap-2'>
                          {w.profiles?.avatar_url ? (
                            <img src={w.profiles.avatar_url} alt="" className='w-4 h-4 rounded-full object-cover'/>
                          ) : (
                            <User className='w-3 h-3 text-zinc-500'/>
                          )}
                          <span className='text-xs font-bold text-white'>@{w.profiles?.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Night Cup Applications & Winner Section */}
                {tab === 'NIGHT_CUP' && (
                  <div className='bg-black/20'>
                    <div className='p-4 border-b border-white/5 flex justify-between items-center'>
                      <span className='text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2'>
                        <Users className='w-4 h-4 text-cyan-400' />
                        TAKIM BAŞVURULARI ({tourApps.length})
                      </span>
                      <button
                        onClick={() => setSelectedNightCup(selectedNightCup === tour.id ? null : tour.id)}
                        className='text-xs text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider'
                      >
                        {selectedNightCup === tour.id ? 'BAŞVURULARI GİZLE' : 'BAŞVURULARI GÖRÜNTÜLE'}
                      </button>
                    </div>

                    {hasWinner && (
                      <div className='p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-4'>
                        <Trophy className='w-6 h-6 text-emerald-400 shrink-0'/>
                        <div>
                          <span className='text-[10px] font-bold text-emerald-500 uppercase tracking-widest block'>ŞAMPİYON TAKIM</span>
                          <span className='text-base font-black text-emerald-400 uppercase tracking-wider'>
                            {tourWinners[0].tournament_applications?.team_name}
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedNightCup === tour.id && (() => {
                      const filteredTourApps = tourApps.filter((app: any) => {
                        const q = nightCupAppSearch.toLowerCase().trim();
                        const nameMatch = app.team_name?.toLowerCase().includes(q);
                        const captainMatch = app.profiles?.username?.toLowerCase().includes(q) || app.profiles?.full_name?.toLowerCase().includes(q);
                        const matchesQuery = !q || nameMatch || captainMatch;

                        let matchesStatus = true;
                        if (nightCupAppFilter === 'PENDING') matchesStatus = app.status === 'PENDING';
                        else if (nightCupAppFilter === 'APPROVED') matchesStatus = app.status === 'APPROVED';
                        else if (nightCupAppFilter === 'REJECTED') matchesStatus = app.status === 'REJECTED';
                        else if (nightCupAppFilter === 'CANCELLED') matchesStatus = app.status === 'CANCELLED';

                        return matchesQuery && matchesStatus;
                      });

                      const pendingCount = tourApps.filter((a: any) => a.status === 'PENDING').length;
                      const approvedCount = tourApps.filter((a: any) => a.status === 'APPROVED').length;
                      const rejectedCount = tourApps.filter((a: any) => a.status === 'REJECTED').length;

                      return (
                        <div className='p-4 space-y-4'>
                          {/* Filter and Search Toolbar */}
                          <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#060d18] p-3 rounded-xl border border-white/5'>
                            <div className='flex flex-wrap items-center gap-1.5'>
                              {[
                                { key: 'ALL', label: `TÜMÜ (${tourApps.length})` },
                                { key: 'PENDING', label: `BEKLEMEDE (${pendingCount})` },
                                { key: 'APPROVED', label: `ONAYLANDI (${approvedCount})` },
                                { key: 'REJECTED', label: `REDDEDİLDİ (${rejectedCount})` },
                              ].map(item => (
                                <button
                                  key={item.key}
                                  type='button'
                                  onClick={() => setNightCupAppFilter(item.key as any)}
                                  className={'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ' +
                                    (nightCupAppFilter === item.key
                                      ? 'bg-cyan-500 text-black shadow-sm'
                                      : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10')}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>

                            <div className='relative w-full sm:w-60'>
                              <Search className='w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2' />
                              <input
                                type='text'
                                placeholder='Takım veya kaptan ara...'
                                value={nightCupAppSearch}
                                onChange={(e) => setNightCupAppSearch(e.target.value)}
                                className='w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50'
                              />
                            </div>
                          </div>

                          {/* Applications Cards Grid */}
                          {filteredTourApps.length === 0 ? (
                            <div className='p-8 text-center text-xs text-zinc-500 font-mono card-surface rounded-xl border border-white/5'>
                              {tourApps.length === 0 ? 'Bu turnuvaya henüz başvuru yapılmadı.' : 'Arama kriterlerine uygun başvuru bulunamadı.'}
                            </div>
                          ) : (
                            <div className='grid grid-cols-1 gap-3'>
                              {filteredTourApps.map((app: any) => {
                                const squadPlayers = app.tournament_application_players || [];
                                return (
                                  <div key={app.id} className='bg-[#0a1628] border border-white/10 hover:border-cyan-500/20 rounded-xl p-4 transition-all'>
                                    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
                                      {/* Team Info */}
                                      <div className='flex items-center gap-3.5 min-w-0 flex-1'>
                                        <TeamLogo src={app.logo_url} name={app.team_name} size="md" className="w-12 h-12 shrink-0 rounded-xl" />
                                        <div className='min-w-0'>
                                          <div className='flex items-center gap-2 flex-wrap'>
                                            <h4 className='text-base font-black text-white uppercase tracking-wider truncate'>{app.team_name}</h4>
                                            <span className={'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ' +
                                              (app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                                               app.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                                               app.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                                               'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30')}>
                                              {app.status === 'APPROVED' ? 'ONAYLANDI' :
                                               app.status === 'PENDING' ? 'BEKLEMEDE' :
                                               app.status === 'REJECTED' ? 'REDDEDİLDİ' : 'İPTAL'}
                                            </span>
                                          </div>
                                          <div className='flex items-center gap-3 mt-1 text-xs text-zinc-400 flex-wrap'>
                                            <span className='inline-flex items-center gap-1.5'>
                                              <Crown className='w-3 h-3 text-amber-400' />
                                              Kaptan: <strong className='text-zinc-200'>@{app.profiles?.username || 'Kaptan'}</strong>
                                            </span>
                                            <span className='inline-flex items-center gap-1 text-zinc-500'>
                                              <Users className='w-3 h-3 text-cyan-400' />
                                              Kadro: <strong className='text-white'>{squadPlayers.length} Oyuncu</strong>
                                            </span>
                                            <span className='text-[10px] text-zinc-500 font-mono'>
                                              {formatTournamentDate(app.created_at)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Action Buttons */}
                                      <div className='flex items-center gap-2 shrink-0 flex-wrap'>
                                        {/* Edit & Squad button */}
                                        <button
                                          type='button'
                                          onClick={() => {
                                            setEditingNightCupTeam(app);
                                            setEditTeamLogoPreview(app.logo_url || null);
                                            setSelectedSquadPlayerToAdd('');
                                            setPlayerSearchQuery('');
                                          }}
                                          className='px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors'
                                          title='Takım Bilgilerini & Kadroyu Düzenle'
                                        >
                                          <Edit3 className='w-3.5 h-3.5' />
                                          <span>Düzenle & Kadro</span>
                                        </button>

                                        {app.status === 'PENDING' && (
                                          <>
                                            <button
                                              onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'APPROVED')}
                                              className='p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors'
                                              title='Başvuruyu Onayla'
                                            >
                                              <CheckCircle2 className='w-4 h-4'/>
                                            </button>
                                            <button
                                              onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'REJECTED')}
                                              className='p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors'
                                              title='Başvuruyu Reddet'
                                            >
                                              <XCircle className='w-4 h-4'/>
                                            </button>
                                          </>
                                        )}

                                        {app.status === 'APPROVED' && (
                                          <>
                                            {!hasWinner && (
                                              <button
                                                onClick={() => setConfirmModal({
                                                  action: () => handleAction(assignNightCupWinnerAction, tour.id, app.id),
                                                  title: 'Şampiyon İlan Et',
                                                  type: 'warning',
                                                  message: `${app.team_name} takımını bu Night Cup'ın kazananı olarak belirlemek istiyor musunuz?`
                                                })}
                                                className='px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 transition-colors'
                                                title='Şampiyon İlan Et'
                                              >
                                                <Trophy className='w-3 h-3'/> Şampiyon Yap
                                              </button>
                                            )}
                                            <button
                                              onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'REJECTED')}
                                              className='p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors'
                                              title='Onayı Geri Al / Reddet'
                                            >
                                              <XCircle className='w-4 h-4'/>
                                            </button>
                                          </>
                                        )}

                                        {app.status === 'REJECTED' && (
                                          <button
                                            onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'APPROVED')}
                                            className='p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors'
                                            title='Tekrar Onayla'
                                          >
                                            <CheckCircle2 className='w-4 h-4'/>
                                          </button>
                                        )}

                                        {/* Delete button */}
                                        <button
                                          type='button'
                                          onClick={() => handleDeleteApplication(app)}
                                          className='p-1.5 bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors border border-white/5 hover:border-red-500/30'
                                          title='Başvuruyu Sil'
                                        >
                                          <Trash2 className='w-4 h-4'/>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Squad Preview Pills */}
                                    {squadPlayers.length > 0 && (
                                      <div className='mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-1.5'>
                                        {squadPlayers.map((p: any, i: number) => (
                                          <div key={i} className='bg-black/40 px-2 py-1 rounded-md flex items-center gap-1.5 border border-white/5'>
                                            {p.profiles?.avatar_url ? (
                                              <img src={p.profiles.avatar_url} alt="" className='w-3.5 h-3.5 rounded-full object-cover'/>
                                            ) : (
                                              <User className='w-3 h-3 text-zinc-500'/>
                                            )}
                                            <span className='text-[10px] font-bold text-zinc-300 truncate'>@{p.profiles?.username || 'Oyuncu'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* 1V1 Create Modal */}
      {create1V1Modal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest'>YENİ 1V1 ŞAMPİYONU</h3>
              <button onClick={() => setCreate1V1Modal(false)} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreate1V1} className='p-6 space-y-4'>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>KUPA ADI</label><input required name='name' type='text' className='input-field'/></div>
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>SEZON</label>
                <select required name='season_id' className='input-field'>
                  <option value=''>Seçiniz</option>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>ŞAMPİYON OYUNCU</label>
                <input
                  type='text'
                  placeholder='Oyuncu veya isim ara...'
                  value={winner1V1PlayerSearch}
                  onChange={e => setWinner1V1PlayerSearch(e.target.value)}
                  className='w-full mb-2 bg-[#060d18] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50'
                />
                <select required name='profile_id' className='input-field'>
                  <option value=''>Seçiniz</option>
                  {profiles
                    .filter((p: any) => {
                      if (!winner1V1PlayerSearch.trim()) return true;
                      const q = winner1V1PlayerSearch.toLowerCase().trim();
                      return p.username?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q);
                    })
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>@{p.username}{p.full_name ? ` (${p.full_name})` : ''}</option>
                    ))}
                </select>
              </div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>AÇIKLAMA</label><input name='description' type='text' className='input-field'/></div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>GÖRSEL</label><input name='image_file' type='file' accept='image/*' className='input-field text-sm'/></div>
              <button disabled={loading} className='btn-primary w-full py-3 mt-4'>KAYDET</button>
            </form>
          </div>
        </div>
      )}

      {/* Karma Create Modal */}
      {createKarmaModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center shrink-0'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest'>YENİ KARMA ŞAMPİYONU</h3>
              <button onClick={() => { setCreateKarmaModal(false); setKarmaPlayerSearch(''); }} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreateKarma} className='flex-1 overflow-y-auto p-6 space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>TURNUVA ADI</label><input required name='name' type='text' className='input-field'/></div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>SEZON</label>
                  <select required name='season_id' className='input-field'>
                    <option value=''>Seçiniz</option>
                    {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className='flex items-center justify-between mb-1'>
                  <label className='block text-xs font-bold text-zinc-400'>
                    KAZANAN KADRO (11 KİŞİ SEÇİN: {karmaProfiles.length}/11)
                  </label>
                </div>
                <input
                  type='text'
                  placeholder='Oyuncu veya isim ara...'
                  value={karmaPlayerSearch}
                  onChange={e => setKarmaPlayerSearch(e.target.value)}
                  className='w-full mb-2 bg-[#060d18] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50'
                />
                <div className='grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-black/20 rounded-xl border border-white/5'>
                  {profiles
                    .filter((p: any) => {
                      if (!karmaPlayerSearch.trim()) return true;
                      const q = karmaPlayerSearch.toLowerCase().trim();
                      return p.username?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q);
                    })
                    .map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => toggleKarmaProfile(p.id)}
                        className={`p-2 rounded-lg border text-sm cursor-pointer flex items-center gap-2 transition-all ${karmaProfiles.includes(p.id) ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 font-bold' : 'bg-[#060d18] border-white/5 text-zinc-400 hover:bg-white/5'}`}
                      >
                        {p.avatar_url ? <img src={p.avatar_url} alt="" className='w-5 h-5 rounded-full object-cover'/> : <User className='w-4 h-4'/>}
                        <div className='truncate'>
                          <span className='block truncate'>@{p.username}</span>
                          {p.full_name && <span className='block text-[10px] text-zinc-500 truncate'>{p.full_name}</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <button disabled={loading || karmaProfiles.length !== 11} className='btn-primary w-full py-3 mt-4'>
                {karmaProfiles.length === 11 ? 'KAYDET' : `${11 - karmaProfiles.length} OYUNCU DAHA SEÇİN`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Night Cup 5-Step Create Wizard Modal */}
      {createNightCupModal && (
        <NightCupCreateWizardModal
          isOpen={createNightCupModal}
          onClose={() => setCreateNightCupModal(false)}
          seasons={seasons}
          onSuccess={(msg) => {
            showFeedback(msg, 'success');
            setCreateNightCupModal(false);
            router.refresh();
          }}
          onError={(msg) => {
            showFeedback(msg, 'error');
          }}
        />
      )}

      {/* Night Cup Edit Modal */}
      {editNightCupModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center shrink-0'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest flex items-center gap-2'>
                <Edit3 className='w-4 h-4 text-cyan-400' />
                NIGHT CUP DÜZENLE: {editNightCupModal.name}
              </h3>
              <button onClick={() => setEditNightCupModal(null)} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleUpdateNightCup} className='p-6 space-y-4 overflow-y-auto flex-1'>
              <input type='hidden' name='tournament_id' value={editNightCupModal.id} />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>TURNUVA ADI <span className='text-red-400'>*</span></label>
                  <input required name='name' type='text' defaultValue={editNightCupModal.name} className='input-field'/>
                </div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>TURNUVA DURUMU</label>
                  <select name='status' defaultValue={editNightCupModal.status || 'REGISTRATION'} className='input-field'>
                    <option value='REGISTRATION'>Başvuru Sürecinde (Açık)</option>
                    <option value='DRAFT'>Taslak (Gizli)</option>
                    <option value='IN_PROGRESS'>Devam Ediyor (Maçlar Oynanıyor)</option>
                    <option value='COMPLETED'>Tamamlandı (Şampiyon Belirlendi)</option>
                    <option value='ARCHIVED'>Arşivlendi</option>
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>ÖDÜL BİLGİSİ</label>
                  <input name='prize' type='text' defaultValue={editNightCupModal.prize || ''} placeholder='Örn: 5.000 TL + Kupa' className='input-field'/>
                </div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>DISCORD BAĞLANTISI</label>
                  <input name='discord_url' type='url' defaultValue={editNightCupModal.discord_url || ''} placeholder='https://discord.gg/...' className='input-field text-xs'/>
                </div>
              </div>

              <div className='flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5'>
                <input
                  type='checkbox'
                  name='is_registration_open'
                  value='true'
                  id='edit_reg_open'
                  defaultChecked={editNightCupModal.is_registration_open}
                  className='w-5 h-5 accent-cyan-500'
                />
                <label htmlFor='edit_reg_open' className='text-sm font-bold text-white uppercase tracking-widest cursor-pointer'>
                  BAŞVURULAR AÇIK OLSUN
                </label>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>BAŞVURU BAŞLANGIÇ</label>
                  <input
                    name='registration_start'
                    type='datetime-local'
                    defaultValue={formatForInput(editNightCupModal.registration_start)}
                    className='input-field text-xs'
                  />
                </div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>BAŞVURU BİTİŞ</label>
                  <input
                    name='registration_end'
                    type='datetime-local'
                    defaultValue={formatForInput(editNightCupModal.registration_end)}
                    className='input-field text-xs'
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>MAÇ / BAŞLANGIÇ TARİHİ</label>
                  <input
                    name='tournament_date'
                    type='datetime-local'
                    defaultValue={formatForInput(editNightCupModal.tournament_date)}
                    className='input-field text-xs'
                  />
                </div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>KONTENJAN</label>
                  <input
                    name='max_teams'
                    type='number'
                    min="1"
                    defaultValue={editNightCupModal.max_teams || ''}
                    placeholder='Sınırsız'
                    className='input-field'
                  />
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>GRUP BAŞINA TAKIM</label>
                  <input
                    name='teams_per_group'
                    type='number'
                    min="2"
                    max="16"
                    defaultValue={editNightCupModal.teams_per_group || 4}
                    className='input-field'
                  />
                </div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>ELEME TURUNA ÇIKACAK TAKIM</label>
                  <input
                    name='advancing_teams_per_group'
                    type='number'
                    min="1"
                    max="8"
                    defaultValue={editNightCupModal.advancing_teams_per_group || 2}
                    className='input-field'
                  />
                </div>
              </div>

              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>KISA AÇIKLAMA</label>
                <input
                  name='description'
                  type='text'
                  defaultValue={editNightCupModal.description || ''}
                  className='input-field'
                />
              </div>

              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>TURNUVA KURALLARI</label>
                <textarea
                  name='rules'
                  rows={4}
                  defaultValue={editNightCupModal.rules || ''}
                  className='input-field resize-y text-xs font-mono'
                />
              </div>

              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>DETAYLAR & BAŞVURU REHBERİ</label>
                <textarea
                  name='details'
                  rows={4}
                  defaultValue={editNightCupModal.details || ''}
                  className='input-field resize-y text-xs font-mono'
                />
              </div>

              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>YENİ KAPAK GÖRSELİ (İSTEĞE BAĞLI)</label>
                <input name='image_file' type='file' accept='image/*' className='input-field text-sm'/>
              </div>

              <div className='flex gap-3 pt-2'>
                <button
                  type='button'
                  onClick={() => setEditNightCupModal(null)}
                  className='flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs'
                >
                  İPTAL
                </button>
                <button
                  disabled={loading}
                  type='submit'
                  className='btn-primary flex-1 py-3 text-xs font-black'
                >
                  {loading ? <Loader2 className='w-4 h-4 animate-spin mx-auto'/> : 'GÜNCELLE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Groups & Fixtures Modal */}
      {manageGroupsModal && (
        <TournamentGroupsAdminModal
          tournament={manageGroupsModal}
          approvedApplications={applications.filter(
            (a: any) => a.tournament_id === manageGroupsModal.id && a.status === 'APPROVED'
          )}
          groups={groups.filter((g: any) => g.tournament_id === manageGroupsModal.id)}
          matches={matches.filter((m: any) => m.tournament_id === manageGroupsModal.id)}
          onClose={() => setManageGroupsModal(null)}
        />
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className='p-6'>
              <h3 className={`text-lg font-black uppercase tracking-widest mb-2 ${confirmModal.type === 'danger' ? 'text-red-500' : 'text-amber-500'}`}>
                {confirmModal.title}
              </h3>
              <p className='text-sm text-zinc-400 mb-6'>{confirmModal.message}</p>
              <div className='flex gap-3'>
                <button disabled={loading} onClick={() => setConfirmModal({ isOpen: false })} className='flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-colors'>İPTAL</button>
                <button disabled={loading} onClick={confirmModal.action} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-black transition-colors ${confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-400' : 'bg-amber-500 hover:bg-amber-400'}`}>
                  {loading ? <Loader2 className='w-4 h-4 animate-spin mx-auto'/> : 'ONAYLA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT SUBMISSION MODAL */}
      {rejectModalSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#0a1628] w-full max-w-lg rounded-3xl border border-white/10 p-6 md:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-wider">
                    Skor Bildirimini Reddet
                  </h3>
                  <span className="text-xs text-zinc-400 font-bold">
                    {rejectModalSubmission.match?.home?.team_name || 'Ev Sahibi'} vs{' '}
                    {rejectModalSubmission.match?.away?.team_name || 'Deplasman'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setRejectModalSubmission(null)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmission} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-black text-zinc-300 uppercase tracking-wider">
                  RET NEDENİ / GEREKÇE <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="Örn: Yüklenen ekran görüntüsü net değil veya skor bilgisi ile uyuşmuyor. Lütfen skoru ve golcüleri kontrol ederek tekrar iletiniz."
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 text-xs text-white placeholder:text-zinc-600 focus:border-red-500 outline-none transition-all resize-none"
                />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  * Bu gerekçe takım temsilcisine gösterilecek ve maçı düzelterek yeniden göndermesine izin verilecektir.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setRejectModalSubmission(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 text-zinc-400 font-bold text-xs uppercase tracking-wider hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  disabled={loading}
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-red-500/20 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  <span>Reddet ve Bildir</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCREENSHOT LIGHTBOX MODAL */}
      {previewImageModal && (
        <div
          onClick={() => setPreviewImageModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-[#0a1628] rounded-2xl border border-white/20 overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-3 bg-black/60 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" /> Maç Kanıtı Ekran Görüntüsü
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={previewImageModal}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Orijinal Boyut
                </a>
                <button
                  onClick={() => setPreviewImageModal(null)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-black/40">
              <img
                src={previewImageModal}
                alt="Maç Kanıtı"
                className="max-h-[80vh] w-auto object-contain rounded-lg shadow-xl"
              />
            </div>
          </div>
        </div>
      )}
      {/* EDIT NIGHT CUP TEAM & SQUAD MODAL */}
      {editingNightCupTeam && (() => {
        const currentApp = applications.find((a: any) => a.id === editingNightCupTeam.id) || editingNightCupTeam;
        const squadPlayers = currentApp.tournament_application_players || [];
        const squadProfileIds = new Set(squadPlayers.map((p: any) => p.profile_id));
        const availableProfiles = profiles.filter((p: any) => !squadProfileIds.has(p.id) && p.id !== currentApp.applicant_id);
        const filteredAvailableProfiles = availableProfiles.filter((p: any) => {
          const q = playerSearchQuery.toLowerCase().trim();
          return !q || p.username?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q);
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="bg-[#0a1628] w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 bg-[#060d18] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff]">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-wider">
                      GEÇİCİ TAKIM & KADRO YÖNETİMİ
                    </h3>
                    <p className="text-xs text-cyan-400 font-bold mt-0.5">
                      {currentApp.team_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNightCupTeam(null);
                    setEditTeamLogoPreview(null);
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* 1. Team Name and Logo Form */}
                <form onSubmit={handleEditNightCupTeamSubmit} className="space-y-4 p-4 rounded-2xl bg-black/40 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <TeamLogo src={currentApp.logo_url} name={currentApp.team_name} size="sm" className="w-6 h-6 rounded" />
                      Takım Bilgileri
                    </span>
                    <button
                      type="submit"
                      disabled={teamActionLoading}
                      className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {teamActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Bilgileri Kaydet
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                        Takım Adı <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name="team_name"
                        required
                        minLength={2}
                        maxLength={60}
                        defaultValue={currentApp.team_name}
                        className="w-full bg-[#060d18] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-cyan-500/50 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                        Takım Logosu Değiştir (Maks 5MB)
                      </label>
                      <input
                        type="file"
                        name="logo_file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              showFeedback('Logo 5MB sınırını aşıyor.', 'error');
                              return;
                            }
                            setEditTeamLogoPreview(URL.createObjectURL(file));
                          }
                        }}
                        className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20"
                      />
                    </div>
                  </div>

                  {editTeamLogoPreview && (
                    <div className="flex items-center gap-3 pt-2">
                      <img src={editTeamLogoPreview} alt="Logo Önizleme" className="w-12 h-12 rounded-xl object-contain bg-black/60 border border-white/10" />
                      <span className="text-[11px] text-zinc-400">Yeni logo önizlemesi hazır. Kaydetmek için &apos;Bilgileri Kaydet&apos;e tıklayın.</span>
                    </div>
                  )}
                </form>

                {/* 2. Squad / Roster Management */}
                <div className="space-y-4 p-4 rounded-2xl bg-black/40 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-cyan-400" />
                        Turnuva Kadrosu ({squadPlayers.length} Oyuncu)
                      </h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Yalnızca bu turnuvaya özel geçici kadrodur; resmî kulüp üyeliklerini etkilemez.
                      </p>
                    </div>
                  </div>

                  {/* Captain Banner */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <Crown className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">@{currentApp.profiles?.username || 'Kaptan'}</span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300">KAPTAN</span>
                        </div>
                        {currentApp.profiles?.full_name && (
                          <span className="text-[10px] text-zinc-400 block">{currentApp.profiles.full_name}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">Başvuru Sahibi</span>
                  </div>

                  {/* Squad Players List */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      KADRODAKİ OYUNCULAR
                    </label>

                    {squadPlayers.length === 0 ? (
                      <div className="p-4 rounded-xl bg-[#060d18] border border-white/5 text-center text-xs text-zinc-500">
                        Kadroda ek oyuncu bulunmuyor. Aşağıdan oyuncu ekleyebilirsiniz.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {squadPlayers.map((sp: any) => {
                          const prof = sp.profiles || {};
                          return (
                            <div key={sp.id || sp.profile_id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#060d18] border border-white/5 hover:border-white/10 transition-colors">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                  {prof.avatar_url ? (
                                    <img src={prof.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-3.5 h-3.5 text-zinc-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-white truncate block">@{prof.username || 'Oyuncu'}</span>
                                  {prof.full_name && <span className="text-[10px] text-zinc-500 truncate block">{prof.full_name}</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={teamActionLoading}
                                onClick={() => handleRemoveSquadPlayer(currentApp.id, sp.profile_id)}
                                className="p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors"
                                title="Kadrodan Çıkar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add Player to Squad */}
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                      KADROYA OYUNCU EKLE
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 relative">
                        <select
                          value={selectedSquadPlayerToAdd}
                          onChange={(e) => setSelectedSquadPlayerToAdd(e.target.value)}
                          className="w-full bg-[#060d18] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"
                        >
                          <option value="">Oyuncu Seçin ({filteredAvailableProfiles.length} Uygun Oyuncu)...</option>
                          {filteredAvailableProfiles.slice(0, 100).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              @{p.username} {p.full_name ? `(${p.full_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={!selectedSquadPlayerToAdd || teamActionLoading}
                        onClick={() => handleAddSquadPlayer(currentApp.id)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {teamActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Kadroya Ekle
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 bg-[#060d18] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDeleteApplication(currentApp)}
                  className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Başvuruyu Sil
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingNightCupTeam(null);
                    setEditTeamLogoPreview(null);
                  }}
                  className="px-5 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
