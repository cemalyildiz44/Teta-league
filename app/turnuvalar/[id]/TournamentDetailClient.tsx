'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy,
  Medal,
  Calendar,
  Users,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Info,
  User,
  Swords,
  FileText,
  Sparkles,
  X,
  AlertTriangle,
  ChevronRight,
  Share2,
  Search,
  UserPlus,
} from 'lucide-react';
import {
  submitNightCupApplicationAction,
  cancelMyApplicationAction,
  captainAddPlayerToSquadAction,
  captainRemovePlayerFromSquadAction,
} from '../actions';
import TeamLogo from '@/components/TeamLogo';
import TournamentScoreReportModal from './TournamentScoreReportModal';
import TournamentKnockoutBracket from '@/components/TournamentKnockoutBracket';

import { calculateGroupStandings, getTournamentStageLabel } from '@/lib/tournament-engine';
import { formatTournamentDate } from '@/lib/date-utils';

interface TournamentDetailClientProps {
  tournament: any;
  applications: any[];
  winners: any[];
  currentUser: any;
  profiles: any[];
  groups?: any[];
  matches?: any[];
}

export default function TournamentDetailClient({
  tournament,
  applications,
  winners,
  currentUser,
  profiles,
  groups = [],
  matches = [],
}: TournamentDetailClientProps) {
  const router = useRouter();

  const knockoutMatches = matches.filter((m) => m.stage && m.stage !== 'GROUP');

  const [activeTab, setActiveTab] = useState<'genel' | 'kurallar' | 'takimlar' | 'gruplar' | 'fikstur' | 'bracket'>(
    knockoutMatches.length > 0 && tournament.status === 'COMPLETED' ? 'bracket' : 'genel'
  );
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedSquad, setSelectedSquad] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fixtureGroupFilter, setFixtureGroupFilter] = useState<string>('ALL');
  const [fixtureRoundFilter, setFixtureRoundFilter] = useState<string>('ALL');
  const [scoreReportMatch, setScoreReportMatch] = useState<any | null>(null);

  // Captain squad edit states
  const [captainEditApp, setCaptainEditApp] = useState<any | null>(null);
  const [captainSearch, setCaptainSearch] = useState('');
  const [captainActionLoading, setCaptainActionLoading] = useState(false);
  const [captainFeedback, setCaptainFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleCaptainAddPlayer = async (profileId: string) => {
    if (!captainEditApp) return;
    setCaptainActionLoading(true);
    setCaptainFeedback(null);
    try {
      const res = await captainAddPlayerToSquadAction(captainEditApp.id, profileId);
      if (res.error) {
        setCaptainFeedback({ msg: res.error, type: 'error' });
      } else {
        setCaptainFeedback({ msg: res.success || 'Oyuncu kadroya eklendi.', type: 'success' });
        const targetProf = profiles.find((p) => p.id === profileId);
        const newPlayer = {
          id: 'temp-' + Date.now(),
          profile_id: profileId,
          profile: targetProf || { id: profileId, username: 'Oyuncu' },
        };
        setCaptainEditApp((prev: any) =>
          prev ? { ...prev, players: [...(prev.players || []), newPlayer] } : null
        );
        router.refresh();
      }
    } catch (err: any) {
      setCaptainFeedback({ msg: err.message || 'Oyuncu eklenirken bir hata oluştu.', type: 'error' });
    } finally {
      setCaptainActionLoading(false);
    }
  };

  const handleCaptainRemovePlayer = async (profileId: string) => {
    if (!captainEditApp) return;
    setCaptainActionLoading(true);
    setCaptainFeedback(null);
    try {
      const res = await captainRemovePlayerFromSquadAction(captainEditApp.id, profileId);
      if (res.error) {
        setCaptainFeedback({ msg: res.error, type: 'error' });
      } else {
        setCaptainFeedback({ msg: res.success || 'Oyuncu kadrodan çıkarıldı.', type: 'success' });
        setCaptainEditApp((prev: any) =>
          prev
            ? {
                ...prev,
                players: (prev.players || []).filter((p: any) => p.profile_id !== profileId),
              }
            : null
        );
        router.refresh();
      }
    } catch (err: any) {
      setCaptainFeedback({ msg: err.message || 'Oyuncu çıkarılırken bir hata oluştu.', type: 'error' });
    } finally {
      setCaptainActionLoading(false);
    }
  };

  const now = new Date();
  const regStart = tournament.registration_start ? new Date(tournament.registration_start) : null;
  const regEnd = tournament.registration_end ? new Date(tournament.registration_end) : null;
  const tourDate = tournament.tournament_date ? new Date(tournament.tournament_date) : null;

  const approvedApps = applications.filter((a) => a.status === 'APPROVED');
  const pendingApps = applications.filter((a) => a.status === 'PENDING');
  const userApp = currentUser ? applications.find((a) => a.applicant_id === currentUser.id) : null;

  // Registration open status calculation
  let isRegistrationOpen = tournament.is_registration_open !== false;
  if (tournament.status && tournament.status !== 'REGISTRATION') {
    isRegistrationOpen = false;
  }
  if (regStart && regStart > now) isRegistrationOpen = false;
  if (regEnd && regEnd < now) isRegistrationOpen = false;
  if (tournament.max_teams && approvedApps.length >= tournament.max_teams) {
    isRegistrationOpen = false;
  }

  // Resolve status text and badge style
  const getStatusBadge = () => {
    const status = tournament.status || (winners.length > 0 ? 'COMPLETED' : isRegistrationOpen ? 'REGISTRATION' : 'DRAFT');
    switch (status) {
      case 'REGISTRATION':
        return isRegistrationOpen ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Kayıtlar Açık
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
            Kayıt Kapalı
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 shadow-[0_0_12px_rgba(0,229,255,0.15)]">
            <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
            Turnuva Sürüyor
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <Trophy className="w-3.5 h-3.5" />
            Tamamlandı
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
            Arşivlendi
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
            Kayıt Kapalı
          </span>
        );
    }
  };

  const handleApply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append('tournament_id', tournament.id);
    formData.append('profiles', JSON.stringify(selectedSquad));

    const res = await submitNightCupApplicationAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Başvurunuz başarıyla alındı!', 'success');
      setApplyModalOpen(false);
      setSelectedSquad([]);
      router.refresh();
    }
  };

  const handleCancelApplication = async () => {
    if (!userApp) return;
    setLoading(true);
    const res = await cancelMyApplicationAction(userApp.id);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Başvurunuz iptal edildi.', 'success');
      setCancelModalOpen(false);
      router.refresh();
    }
  };

  const toggleSquadMember = (profileId: string) => {
    if (selectedSquad.includes(profileId)) {
      setSelectedSquad(selectedSquad.filter((id) => id !== profileId));
    } else {
      if (selectedSquad.length >= 20) {
        showFeedback('Kadroya en fazla 20 oyuncu ekleyebilirsiniz.', 'error');
        return;
      }
      setSelectedSquad([...selectedSquad, profileId]);
    }
  };

  const searchProfiles = profiles
    .filter((p) => p.username.toLowerCase().includes(searchTerm.toLowerCase()))
    .slice(0, 25);

  const bannerImg = tournament.banner_url || tournament.image_url;

  return (
    <div className="w-full relative pb-20">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs md:text-sm font-[900] uppercase tracking-wider backdrop-blur-md transition-all animate-fade-in-up ${
            feedback.type === 'error'
              ? 'bg-red-500/90 text-white border border-red-400/40 shadow-red-500/20'
              : 'bg-[#00e5ff] text-black shadow-[0_0_25px_rgba(0,229,255,0.4)]'
          }`}
        >
          <Info className="w-4 h-4 shrink-0" />
          {feedback.msg}
        </div>
      )}

      {/* TOP NAVIGATION / BREADCRUMB */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-[800] text-zinc-400 uppercase tracking-widest">
            <Link
              href="/turnuvalar"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#00e5ff]/10 border border-white/10 hover:border-[#00e5ff]/30 text-zinc-300 hover:text-[#00e5ff] transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Turnuvalar
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{tournament.seasons?.name || 'Sezon'}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-[#00e5ff] font-black truncate max-w-[200px] sm:max-w-md">
              {tournament.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* HERO SHOWCASE HEADER */}
      {/* ============================================================================== */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 mb-8 md:mb-10">
        <div className="relative rounded-[2rem] md:rounded-[2.5rem] overflow-hidden border border-white/10 bg-gradient-to-b from-[#081324] via-[#050b14] to-[#03070c] shadow-2xl shadow-black/80">
          {/* Subtle Ambient Background Layer */}
          {bannerImg ? (
            <div className="absolute inset-0 z-0 pointer-events-none">
              <img
                src={bannerImg}
                alt=""
                className="w-full h-full object-cover opacity-15 filter blur-md scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050b14] via-[#050b14]/90 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050b14] via-[#050b14]/80 to-transparent" />
            </div>
          ) : (
            <div className="absolute inset-0 z-0 bg-radial from-[#00e5ff]/10 via-transparent to-transparent opacity-40 pointer-events-none" />
          )}

          {/* Main Hero Grid */}
          <div className="relative z-10 p-6 sm:p-8 md:p-10 lg:p-12">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 lg:gap-12">
              {/* Left Column: Badges, Title, Description & Action Box */}
              <div className="space-y-5 flex-1 min-w-0">
                {/* Badges Bar */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <span className="px-3 py-1 rounded-full text-[11px] font-[900] uppercase tracking-wider bg-white/5 text-gray-300 border border-white/10">
                    {tournament.seasons?.name || 'Özel Turnuva'}
                  </span>
                  <span className="px-3 py-1 rounded-full text-[11px] font-[900] uppercase tracking-wider bg-cyan-500/10 text-[#00e5ff] border border-cyan-500/30 flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                    <Trophy className="w-3.5 h-3.5" /> NIGHT CUP
                  </span>
                  {tournament.prize && (
                    <span className="px-3.5 py-1 rounded-full text-[11px] font-[900] uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {tournament.prize}
                    </span>
                  )}
                </div>

                {/* Tournament Name */}
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-[900] text-white uppercase tracking-tight leading-[1.1] drop-shadow-[0_0_25px_rgba(0,229,255,0.25)]">
                  {tournament.name}
                </h1>

                {/* Tournament Description */}
                {tournament.description ? (
                  <p className="text-zinc-300 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
                    {tournament.description}
                  </p>
                ) : (
                  <p className="text-zinc-500 text-sm italic">
                    TETA League resmi Night Cup turnuva aşaması ve grup fikstürü.
                  </p>
                )}

                {/* Primary CTA & User Registration State */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl">
                  {!currentUser ? (
                    <Link
                      href={`/giris?redirectTo=${encodeURIComponent('/turnuvalar/' + tournament.id)}`}
                      className="px-6 py-4 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] uppercase tracking-wider text-xs text-center hover:brightness-110 hover:shadow-[0_0_25px_rgba(0,229,255,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      GİRİŞ YAP VE BAŞVUR
                    </Link>
                  ) : userApp ? (
                    <div className="flex-1 p-3.5 rounded-xl bg-[#0a1628]/95 border border-cyan-500/30 flex items-center justify-between gap-3 shadow-lg shadow-black/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamLogo src={userApp.logo_url} name={userApp.team_name} size="sm" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                            BAŞVURU TAKIMINIZ
                          </span>
                          <span className="text-sm font-black text-white uppercase truncate block">
                            {userApp.team_name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            userApp.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : userApp.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : userApp.status === 'CANCELLED'
                              ? 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {userApp.status === 'APPROVED'
                            ? 'ONAYLANDI'
                            : userApp.status === 'REJECTED'
                            ? 'REDDEDİLDİ'
                            : userApp.status === 'CANCELLED'
                            ? 'İPTAL'
                            : 'BEKLEMEDE'}
                        </span>

                        {userApp.status === 'PENDING' && (
                          <button
                            onClick={() => setCancelModalOpen(true)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                            title="Başvuruyu İptal Et"
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isRegistrationOpen ? (
                    <button
                      onClick={() => setApplyModalOpen(true)}
                      className="px-7 py-4 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] uppercase tracking-widest text-xs text-center hover:brightness-110 hover:shadow-[0_0_25px_rgba(0,229,255,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" /> TAKIMINLA BAŞVUR
                    </button>
                  ) : (
                    <div className="px-6 py-3.5 rounded-xl bg-white/5 border border-white/5 text-zinc-500 font-bold uppercase tracking-widest text-xs text-center">
                      Kayıtlar Kapalıdır
                    </div>
                  )}

                  {tournament.discord_url && (
                    <a
                      href={tournament.discord_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-3.5 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/40 text-white font-[800] text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(88,101,242,0.2)]"
                    >
                      <span>Discord</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  )}
                </div>
              </div>

              {/* Right Column: Dedicated Afiş / Banner Showcase (Preserves exact aspect ratio) */}
              {bannerImg && (
                <div className="w-full lg:w-[420px] xl:w-[480px] shrink-0">
                  <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black/60 shadow-2xl group aspect-[16/9] w-full">
                    <img
                      src={bannerImg}
                      alt={tournament.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-bold text-white">
                      <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 uppercase tracking-wider text-[#00e5ff] text-[10px]">
                        Turnuva Afişi
                      </span>
                      <span className="text-zinc-400 text-[10px]">TETA League</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats Grid (4 Balanced Stat Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 mt-8 pt-8 border-t border-white/10">
              {/* Stat 1: Tarih */}
              <div className="bg-[#0a1628]/60 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-cyan-500/30 transition-all flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" /> TURNUVA TARİHİ
                  </span>
                  <span className="text-sm sm:text-base font-[900] text-white uppercase tracking-tight block">
                    {formatTournamentDate(tournament.tournament_date, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 mt-2 block font-medium">Maç Başlangıcı</span>
              </div>

              {/* Stat 2: Son Başvuru */}
              <div className="bg-[#0a1628]/60 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-amber-500/30 transition-all flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" /> SON BAŞVURU
                  </span>
                  <span className="text-sm sm:text-base font-[900] text-white uppercase tracking-tight block">
                    {formatTournamentDate(tournament.registration_end, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 mt-2 block font-medium">Kayıt Bitiş Tarihi</span>
              </div>

              {/* Stat 3: Kontenjan */}
              <div className="bg-[#0a1628]/60 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-400" /> KONTENJAN
                  </span>
                  <span className="text-sm sm:text-base font-[900] text-white uppercase tracking-tight block">
                    {approvedApps.length} / {tournament.max_teams || '∞'} Takım
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 mt-2 block font-medium">
                  {applications.length > approvedApps.length
                    ? `${applications.length} başvuru alındı`
                    : 'Onaylı Takım Sayısı'}
                </span>
              </div>

              {/* Stat 4: Format */}
              <div className="bg-[#0a1628]/60 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-purple-500/30 transition-all flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                    <Swords className="w-3.5 h-3.5 text-purple-400" /> FORMAT & ELEME
                  </span>
                  <span className="text-sm sm:text-base font-[900] text-white uppercase tracking-tight block">
                    {tournament.teams_per_group ? `${tournament.teams_per_group}'erli Gruplar` : 'Standart Format'}
                  </span>
                </div>
                <span className="text-[10px] text-purple-400 mt-2 block font-bold">
                  {tournament.advancing_teams_per_group
                    ? `İlk ${tournament.advancing_teams_per_group} Üst Tura`
                    : 'Grup + Eleme Ağacı'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Completed / Archived Status Notice */}
      {(tournament.status === 'COMPLETED' || tournament.status === 'ARCHIVED') && (
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 mb-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-amber-200">
                Bu turnuva {tournament.status === 'ARCHIVED' ? 'arşivlenmiştir' : 'tamamlanmıştır'}. Yeni takım başvuruları ve maç skoru bildirimleri kapanmıştır.
              </span>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              {tournament.status === 'ARCHIVED' ? 'ARŞİVLENDİ' : 'TAMAMLANDI'}
            </span>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* TABS NAVIGATION (Responsive & Elegant) */}
      {/* ============================================================================== */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 mb-8">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto no-scrollbar">
          {/* Tab 1: Bilgiler */}
          <button
            onClick={() => setActiveTab('genel')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'genel'
                ? 'bg-cyan-500/15 text-[#00e5ff] border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <FileText className="w-4 h-4" /> Bilgiler
          </button>

          {/* Tab 2: Kurallar & Rehber */}
          <button
            onClick={() => setActiveTab('kurallar')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'kurallar'
                ? 'bg-cyan-500/15 text-[#00e5ff] border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Shield className="w-4 h-4" /> Kurallar & Rehber
          </button>

          {/* Tab 3: Katılımcı Takımlar */}
          <button
            onClick={() => setActiveTab('takimlar')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'takimlar'
                ? 'bg-cyan-500/15 text-[#00e5ff] border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Users className="w-4 h-4" /> Katılımcı Takımlar
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'takimlar' ? 'bg-cyan-500/20 text-[#00e5ff]' : 'bg-white/10 text-zinc-400'
              }`}
            >
              {approvedApps.length}
            </span>
          </button>

          {/* Tab 4: Gruplar & Puan Durumu */}
          <button
            onClick={() => setActiveTab('gruplar')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'gruplar'
                ? 'bg-cyan-500/15 text-[#00e5ff] border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Swords className="w-4 h-4" /> Gruplar & Puan Durumu
            {groups.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'gruplar' ? 'bg-cyan-500/20 text-[#00e5ff]' : 'bg-white/10 text-zinc-400'
                }`}
              >
                {groups.length}
              </span>
            )}
          </button>

          {/* Tab 5: Fikstür & Maçlar */}
          <button
            onClick={() => setActiveTab('fikstur')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'fikstur'
                ? 'bg-cyan-500/15 text-[#00e5ff] border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Calendar className="w-4 h-4" /> Fikstür & Maçlar
            {matches.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'fikstur' ? 'bg-cyan-500/20 text-[#00e5ff]' : 'bg-white/10 text-zinc-400'
                }`}
              >
                {matches.length}
              </span>
            )}
          </button>

          {/* Tab 6: Eleme Ağacı */}
          <button
            onClick={() => setActiveTab('bracket')}
            className={`px-4 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-[900] uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'bracket'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" /> Eleme Ağacı
            {knockoutMatches.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* TAB CONTENTS */}
      {/* ============================================================================== */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        {/* ---------------- 1. BİLGİLER (OVERVIEW) ---------------- */}
        {activeTab === 'genel' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Left 2 Cols: Details & Format */}
            <div className="lg:col-span-2 space-y-6">
              {/* About card */}
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-xl">
                <h3 className="text-lg sm:text-xl font-[900] text-white uppercase tracking-wider mb-4 flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-[#00e5ff]" /> Turnuva Hakkında
                </h3>
                {tournament.details || tournament.description ? (
                  <div className="text-zinc-300 leading-relaxed space-y-3.5 whitespace-pre-wrap text-sm sm:text-base font-normal">
                    {tournament.details || tournament.description}
                  </div>
                ) : (
                  <p className="text-zinc-500 italic text-sm">Bu turnuva için henüz ayrıntılı bir açıklama girilmemiş.</p>
                )}
              </div>

              {/* Tournament Format Card */}
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-xl">
                <h3 className="text-lg sm:text-xl font-[900] text-white uppercase tracking-wider mb-5 flex items-center gap-2.5">
                  <Swords className="w-5 h-5 text-purple-400" /> Turnuva Yapısı ve Formatı
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] block mb-1">
                      Kategori & Tür
                    </span>
                    <span className="text-base font-[900] text-white uppercase">
                      {tournament.type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] block mb-1">
                      Maksimum Takım Sayısı
                    </span>
                    <span className="text-base font-[900] text-white uppercase">
                      {tournament.max_teams ? `${tournament.max_teams} Takım` : 'Sınırsız'}
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] block mb-1">
                      Grup Formatı
                    </span>
                    <span className="text-base font-[900] text-white uppercase">
                      {tournament.teams_per_group ? `${tournament.teams_per_group}'erli Takımlar` : 'Standart Format'}
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-[10px] font-[900] text-gray-400 uppercase tracking-[0.2em] block mb-1">
                      Eleme Turuna Yükselme
                    </span>
                    <span className="text-base font-[900] text-white uppercase">
                      {tournament.advancing_teams_per_group
                        ? `Gruptan İlk ${tournament.advancing_teams_per_group} Takım`
                        : 'Standart Eleme'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Prize, Winners, Discord */}
            <div className="space-y-6">
              {/* Prize Card (Luxurious & Measured) */}
              {tournament.prize && (
                <div className="bg-gradient-to-br from-amber-500/15 via-[#0c182c] to-[#060d18] border border-amber-500/30 rounded-3xl p-6 sm:p-7 backdrop-blur-md shadow-[0_0_35px_rgba(245,158,11,0.12)]">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-md shadow-amber-500/20">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-[900] text-amber-400 uppercase tracking-[0.2em] block mb-1">
                    ÖDÜL HAVUZU
                  </span>
                  <h4 className="text-2xl sm:text-3xl font-[900] text-amber-300 uppercase tracking-tight">
                    {tournament.prize}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed font-normal">
                    Turnuva şampiyonu ve dereceye giren takımlar için hazırlanan resmi ödül paketi.
                  </p>
                </div>
              )}

              {/* Winners Podium (If Completed / Assigned) */}
              {winners.length > 0 && (
                <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 backdrop-blur-md shadow-xl">
                  <h4 className="text-xs font-[900] text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Medal className="w-4 h-4" /> Turnuva Kazananları
                  </h4>
                  <div className="space-y-2.5">
                    {winners.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-black/40 border border-white/5"
                      >
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-[900] text-xs shrink-0 ${
                            w.placement === 1
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                              : w.placement === 2
                              ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30'
                              : 'bg-amber-700/20 text-amber-500 border border-amber-700/30'
                          }`}
                        >
                          {w.placement || 1}
                        </span>
                        {w.tournament_applications?.team_name ? (
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamLogo
                              src={w.tournament_applications.logo_url}
                              name={w.tournament_applications.team_name}
                              size="xs"
                            />
                            <span className="text-sm font-[900] text-white uppercase truncate">
                              {w.tournament_applications.team_name}
                            </span>
                          </div>
                        ) : w.profiles?.username ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="w-4 h-4 text-zinc-400 shrink-0" />
                            <span className="text-sm font-bold text-white truncate">
                              @{w.profiles.username}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-white">Kazanan</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discord Support Card */}
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 backdrop-blur-md shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center mb-4 text-[#5865F2]">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-base font-[900] text-white uppercase tracking-wider mb-2">Turnuva Koordinasyonu</h4>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed font-normal">
                  Maç saatleri, oda şifreleri, hakem duyuruları ve kura çekimleri Discord sunucumuz üzerinden yürütülür.
                </p>
                {tournament.discord_url ? (
                  <a
                    href={tournament.discord_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-[900] text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20"
                  >
                    Discord Kanalına Katıl <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="text-xs text-zinc-500 italic block">Discord bağlantısı yönetici tarafından eklenecektir.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 2. KURALLAR & REHBER ---------------- */}
        {activeTab === 'kurallar' && (
          <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 sm:p-8 md:p-10 backdrop-blur-md space-y-8 shadow-xl">
            <div className="border-b border-white/5 pb-4">
              <span className="text-[#00e5ff] text-[10px] font-[900] uppercase tracking-[0.2em] block mb-1">
                TETA LEAGUE RESMİ TURNUVA YÖNERGESİ
              </span>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-[900] text-white uppercase tracking-wider">
                Turnuva Kuralları & Katılım Şartları
              </h3>
            </div>

            {tournament.rules ? (
              <div className="text-zinc-300 leading-relaxed space-y-4 whitespace-pre-wrap text-sm sm:text-base p-6 rounded-2xl bg-black/40 border border-white/5 font-normal">
                {tournament.rules}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
                  <h4 className="text-sm font-[900] text-white uppercase flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#00e5ff]" /> 1. Takım Temsilciliği ve Kaptanlık
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
                    Başvuruyu yapan oyuncu takımın resmi temsilcisi ve kaptanı kabul edilir. İletişim, oda davetleri ve maç skoru bildirimleri kaptan sorumluluğundadır.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
                  <h4 className="text-sm font-[900] text-white uppercase flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" /> 2. Kadro ve Oyuncu Katılımı
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
                    Kadroya eklenen oyuncular TETA League sistemine kayıtlı olmalıdır. Takım kurucusu tek başına veya belirlediği kadroyla katılabilir; katı 11 oyuncu şartı aranmaz.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
                  <h4 className="text-sm font-[900] text-white uppercase flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" /> 3. Maç Saati ve Hükmen Mağlubiyet
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
                    Maç saatinden itibaren 10 dakika içerisinde odada hazır bulunmayan takımlar hakem heyeti kararıyla hükmen mağlup sayılır.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
                  <h4 className="text-sm font-[900] text-white uppercase flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" /> 4. Fair-Play ve Disiplin Kuralları
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
                    Oyun içi ve Discord üzerindeki sportmenlik dışı hareketler, hile veya hakaret doğrudan turnuvadan diskalifiye edilme sebebidir.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- 3. KATILIMCI TAKIMLAR ---------------- */}
        {activeTab === 'takimlar' && (
          <div className="space-y-6">
            {/* Header bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 backdrop-blur-md shadow-xl">
              <div>
                <h3 className="text-lg sm:text-xl font-[900] text-white uppercase tracking-wider">
                  Katılımcı Takımlar ({approvedApps.length} Onaylı)
                </h3>
                <p className="text-xs text-zinc-400 mt-1 font-medium">
                  Kontenjan: {approvedApps.length} / {tournament.max_teams || '∞'} onaylı takım
                  {pendingApps.length > 0 && ` • (${pendingApps.length} başvuru değerlendiriliyor)`}
                </p>
              </div>

              {isRegistrationOpen && !userApp && (
                <button
                  onClick={() => {
                    if (!currentUser) router.push(`/giris?redirectTo=${encodeURIComponent('/turnuvalar/' + tournament.id)}`);
                    else setApplyModalOpen(true);
                  }}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] uppercase tracking-wider text-xs hover:brightness-110 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  Takımınla Başvur
                </button>
              )}
            </div>

            {/* Empty state or Grid */}
            {approvedApps.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/50 border border-white/5 rounded-3xl p-8">
                <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                <h4 className="text-base font-[900] text-white uppercase tracking-widest mb-1.5">
                  HENÜZ ONAYLANAN TAKIM YOK
                </h4>
                <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                  {isRegistrationOpen
                    ? 'Başvurular devam ediyor. İlk başvuran takımlardan biri olmak için hemen takımını kaydet!'
                    : 'Henüz onaylanmış takım bulunmuyor.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {approvedApps.map((app) => {
                  const teamGroup = groups.find((g) =>
                    (g.tournament_group_teams || []).some((gt: any) => gt.application_id === app.id)
                  );

                  return (
                    <div
                      key={app.id}
                      className="bg-[#0a1628]/80 border border-white/10 hover:border-cyan-500/30 rounded-3xl p-6 transition-all flex flex-col justify-between shadow-lg"
                    >
                      <div>
                        {/* Team Header */}
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                            <TeamLogo src={app.logo_url} name={app.team_name} size="md" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-base font-[900] text-white uppercase tracking-wider truncate">
                              {app.team_name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Onaylandı
                              </span>
                              {teamGroup && (
                                <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[#00e5ff] text-[10px] font-black uppercase">
                                  {teamGroup.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Captain row */}
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5 mb-4">
                          <span className="text-[9px] font-[900] text-gray-500 uppercase tracking-[0.2em] block mb-1">
                            TAKIM KAPTANI
                          </span>
                          <Link
                            href={`/oyuncular/${app.applicant?.username || ''}`}
                            className="flex items-center gap-2 hover:text-[#00e5ff] transition-colors"
                          >
                            {app.applicant?.avatar_url ? (
                              <img src={app.applicant.avatar_url} className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <User className="w-5 h-5 p-1 bg-white/10 rounded-full text-zinc-400" />
                            )}
                            <span className="text-xs font-bold text-zinc-200">
                              @{app.applicant?.username || 'Kaptan'}
                            </span>
                          </Link>
                        </div>

                        {/* Squad members */}
                        {app.players && app.players.length > 0 && (
                          <div>
                            <span className="text-[9px] font-[900] text-gray-500 uppercase tracking-[0.2em] block mb-2">
                              KADRO ({app.players.length} Oyuncu)
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
                              {app.players.map((p: any) => (
                                <Link
                                  key={p.id}
                                  href={`/oyuncular/${p.profile?.username || ''}`}
                                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/20 text-[10px] font-bold text-zinc-300 transition-colors flex items-center gap-1.5"
                                >
                                  {p.profile?.avatar_url ? (
                                    <img src={p.profile.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" />
                                  ) : (
                                    <User className="w-3 h-3 text-zinc-500" />
                                  )}
                                  <span>@{p.profile?.username || 'Oyuncu'}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Captain squad edit action button / deadline notice */}
                      {Boolean(currentUser && app.applicant_id === currentUser.id) && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          {!(
                            (tournament.registration_end && new Date() > new Date(tournament.registration_end)) ||
                            tournament.is_registration_open === false ||
                            tournament.status === 'COMPLETED' ||
                            tournament.status === 'ARCHIVED'
                          ) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCaptainFeedback(null);
                                setCaptainSearch('');
                                setCaptainEditApp(app);
                              }}
                              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-400/40 text-cyan-300 font-[900] uppercase text-[11px] tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20"
                            >
                              <Users className="w-4 h-4 text-[#00e5ff]" />
                              KADROYU DÜZENLE
                            </button>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold text-center flex items-center justify-center gap-1.5 leading-tight">
                              <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-4 mt-4 border-t border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        Kayıt: {formatTournamentDate(app.created_at, { dateStyle: 'short' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------------- 4. GRUPLAR & PUAN DURUMU ---------------- */}
        {activeTab === 'gruplar' && (
          <div className="space-y-8">
            {groups.length === 0 ? (
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-md text-center max-w-2xl mx-auto space-y-6 shadow-xl">
                <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-[#00e5ff] shadow-[0_0_30px_rgba(0,229,255,0.2)]">
                  <Swords className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-[900] uppercase tracking-widest bg-white/10 text-[#00e5ff] border border-white/10">
                    KURA ÇEKİMİ BEKLENİYOR
                  </span>
                  <h3 className="text-xl sm:text-2xl font-[900] text-white uppercase tracking-wider">
                    Grup Eşleşmeleri ve Puan Durumu
                  </h3>
                </div>

                <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed font-normal">
                  Başvurular tamamlandıktan ve kura çekimi yapıldıktan sonra grup puan durumları, oynanan maçlar ve averajlar bu ekranda canlı olarak listelenecektir.
                </p>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 text-xs text-zinc-400 space-y-1.5 text-left font-normal">
                  <div className="font-[900] text-white uppercase mb-1">📋 Hedeflenen Format:</div>
                  <div>• {tournament.teams_per_group || 4}&apos;er takımlı gruplar</div>
                  <div>• Her gruptan ilk {tournament.advancing_teams_per_group || 2} takım eleme turlarına yükselir</div>
                  <div>• Resmî lig puan durumlarından tamamen bağımsız turnuva puan sistemi</div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {groups.map((g) => {
                  const gTeams = (g.tournament_group_teams || []).map((gt: any) => ({
                    application_id: gt.application_id,
                    team_name: gt.tournament_applications?.team_name || 'Takım',
                    logo_url: gt.tournament_applications?.logo_url,
                  }));

                  const gMatches = matches.filter((m) => m.group_id === g.id);
                  const standings = calculateGroupStandings(gTeams, gMatches);
                  const advancingCount = tournament.advancing_teams_per_group || 2;

                  return (
                    <div
                      key={g.id}
                      className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-md space-y-4 shadow-xl"
                    >
                      {/* Group Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff]">
                            <Trophy className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-lg font-[900] text-white uppercase tracking-wider">{g.name}</h4>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">
                              {gTeams.length} Takım • {gMatches.length} Maç
                            </span>
                          </div>
                        </div>

                        <span className="px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          İlk {advancingCount} Takım Üst Tura Yükselir
                        </span>
                      </div>

                      {/* Standings Table */}
                      <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-xs text-left min-w-[620px]">
                          <thead>
                            <tr className="text-zinc-500 uppercase border-b border-white/5 font-[900] text-[10px]">
                              <th className="py-3 px-3 w-12">#</th>
                              <th className="py-3 px-4">Takım</th>
                              <th className="py-3 px-3 text-center" title="Oynanan Maç">O</th>
                              <th className="py-3 px-3 text-center" title="Galibiyet">G</th>
                              <th className="py-3 px-3 text-center" title="Beraberlik">B</th>
                              <th className="py-3 px-3 text-center" title="Mağlubiyet">M</th>
                              <th className="py-3 px-3 text-center" title="Atılan Gol">AG</th>
                              <th className="py-3 px-3 text-center" title="Yenilen Gol">YG</th>
                              <th className="py-3 px-3 text-center" title="Averaj">AV</th>
                              <th className="py-3 px-4 text-center text-[#00e5ff] font-black text-sm" title="Puan">P</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row, idx) => {
                              const isAdvancing = idx < advancingCount;
                              return (
                                <tr
                                  key={row.application_id}
                                  className={`border-b border-white/5 font-bold transition-colors ${
                                    isAdvancing
                                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-2 border-emerald-400'
                                      : 'hover:bg-white/5'
                                  }`}
                                >
                                  <td className="py-3.5 px-3">
                                    <span
                                      className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-black ${
                                        isAdvancing
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : 'text-zinc-500'
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <TeamLogo src={row.logo_url} name={row.team_name} size="xs" />
                                      <span className="text-white uppercase truncate font-[900] text-sm">
                                        {row.team_name}
                                      </span>
                                      {isAdvancing && (
                                        <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400">
                                          Eleme Potası
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-3 text-center text-zinc-300 font-mono">{row.played}</td>
                                  <td className="py-3.5 px-3 text-center text-zinc-300 font-mono">{row.won}</td>
                                  <td className="py-3.5 px-3 text-center text-zinc-300 font-mono">{row.drawn}</td>
                                  <td className="py-3.5 px-3 text-center text-zinc-300 font-mono">{row.lost}</td>
                                  <td className="py-3.5 px-3 text-center text-zinc-400 font-mono">{row.goals_for}</td>
                                  <td className="py-3.5 px-3 text-center text-zinc-400 font-mono">{row.goals_against}</td>
                                  <td className="py-3.5 px-3 text-center font-mono">
                                    <span
                                      className={
                                        row.goal_difference > 0
                                          ? 'text-emerald-400'
                                          : row.goal_difference < 0
                                          ? 'text-red-400'
                                          : 'text-zinc-400'
                                      }
                                    >
                                      {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-[900] text-base text-[#00e5ff] font-mono">
                                    {row.points}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Footnote */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500 font-medium border-t border-white/5">
                        <span>* Puan Eşitliği Kriterleri: 1. Puan, 2. Genel Averaj, 3. Atılan Gol, 4. Galibiyet Sayısı.</span>
                        <span>* Yalnızca onaylanmış ve tamamlanan maç skorları puan tablosuna yansır.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------------- 5. FİKSTÜR & MAÇLAR ---------------- */}
        {activeTab === 'fikstur' && (
          <div className="space-y-8">
            {matches.length === 0 ? (
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-md text-center max-w-2xl mx-auto space-y-6 shadow-xl">
                <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                  <Calendar className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-[900] uppercase tracking-widest bg-white/10 text-purple-400 border border-white/10">
                    FİKSTÜR HAZIRLANIYOR
                  </span>
                  <h3 className="text-xl sm:text-2xl font-[900] text-white uppercase tracking-wider">
                    Turnuva Fikstürü ve Canlı Maçlar
                  </h3>
                </div>

                <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed font-normal">
                  Grup kuraları tamamlandıktan sonra maç eşleşmeleri, maç günleri ve skorlar bu alanda canlı olarak listelenecektir.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#0a1628]/80 border border-white/10 backdrop-blur-md">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Group Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-[800] text-zinc-400 uppercase">Grup:</span>
                      <select
                        value={fixtureGroupFilter}
                        onChange={(e) => setFixtureGroupFilter(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                      >
                        <option value="ALL">Tüm Gruplar ({matches.length} Maç)</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Round Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-[800] text-zinc-400 uppercase">Hafta:</span>
                      <select
                        value={fixtureRoundFilter}
                        onChange={(e) => setFixtureRoundFilter(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                      >
                        <option value="ALL">Tüm Haftalar</option>
                        {Array.from(new Set(matches.map((m) => m.round_number)))
                          .sort((a, b) => a - b)
                          .map((r) => (
                            <option key={r} value={r.toString()}>
                              {r}. Hafta
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <span className="text-xs text-zinc-400 font-bold">
                    {matches
                      .filter((m) => fixtureGroupFilter === 'ALL' || m.group_id === fixtureGroupFilter)
                      .filter((m) => fixtureRoundFilter === 'ALL' || m.round_number.toString() === fixtureRoundFilter)
                      .length}{' '}
                    maç listeleniyor
                  </span>
                </div>

                {/* Matches Grouped by Round */}
                {(() => {
                  const filtered = matches
                    .filter((m) => fixtureGroupFilter === 'ALL' || m.group_id === fixtureGroupFilter)
                    .filter((m) => fixtureRoundFilter === 'ALL' || m.round_number.toString() === fixtureRoundFilter);

                  const distinctRounds = Array.from(new Set(filtered.map((m) => m.round_number))).sort(
                    (a, b) => a - b
                  );

                  if (distinctRounds.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                        Seçilen filtrelere uygun maç bulunamadı.
                      </div>
                    );
                  }

                  return distinctRounds.map((roundNum) => {
                    const roundMatches = filtered.filter((m) => m.round_number === roundNum);

                    return (
                      <div key={roundNum} className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-xs font-[900] uppercase tracking-wider bg-white/10 text-[#00e5ff] border border-white/10">
                            {roundNum}. Hafta Maçları
                          </span>
                          <span className="h-px flex-1 bg-white/10" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {roundMatches.map((m) => {
                            const isApproved = m.status === 'APPROVED' || m.status === 'COMPLETED';
                            const isPendingReview = m.status === 'PENDING_REVIEW';
                            const isRejected = m.status === 'REJECTED';
                            const isPlaying = m.status === 'PLAYING';
                            const isCancelled = m.status === 'CANCELLED';
                            const isScheduled = m.status === 'SCHEDULED';
                            const groupObj = groups.find((g) => g.id === m.group_id);

                            // Captain authorization check
                            const isHomeRep = currentUser && (
                              currentUser.id === m.home?.applicant_id ||
                              currentUser.id === applications.find((a: any) => a.id === m.home_application_id)?.applicant_id
                            );
                            const isAwayRep = currentUser && (
                              currentUser.id === m.away?.applicant_id ||
                              currentUser.id === applications.find((a: any) => a.id === m.away_application_id)?.applicant_id
                            );
                            const isFinishedOrArchived = tournament.status === 'COMPLETED' || tournament.status === 'ARCHIVED';
                            const canSubmitScore = !isFinishedOrArchived && (isHomeRep || isAwayRep) && (isScheduled || isRejected);

                            return (
                              <div
                                key={m.id}
                                className="bg-[#0a1628]/80 border border-white/10 hover:border-cyan-500/30 rounded-2xl p-4 sm:p-5 transition-all flex flex-col justify-between gap-4 shadow-lg"
                              >
                                {/* Match Top Bar */}
                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-white/5 text-[#00e5ff] uppercase text-[10px] font-black">
                                      {m.stage && m.stage !== 'GROUP'
                                        ? getTournamentStageLabel(m.stage)
                                        : (groupObj?.name || 'Grup')}
                                    </span>
                                    <span>Maç #{m.match_order}</span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {m.scheduled_at && (
                                      <span className="flex items-center gap-1 text-zinc-400">
                                        <Clock className="w-3 h-3 text-amber-400" />
                                        {formatTournamentDate(m.scheduled_at, {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })}
                                      </span>
                                    )}

                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                        isApproved
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : isPendingReview
                                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                          : isRejected
                                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                          : isPlaying
                                          ? 'bg-[#00e5ff]/20 text-[#00e5ff] animate-pulse'
                                          : isCancelled
                                          ? 'bg-red-500/10 text-red-400'
                                          : 'bg-zinc-800 text-zinc-400'
                                      }`}
                                    >
                                      {isApproved
                                        ? 'BİTTİ'
                                        : isPendingReview
                                        ? 'İNCELEMEDE'
                                        : isRejected
                                        ? 'REDDEDİLDİ'
                                        : isPlaying
                                        ? 'CANLI'
                                        : isCancelled
                                        ? 'İPTAL'
                                        : 'PLANLANDI'}
                                    </span>
                                  </div>
                                </div>

                                {/* Teams & Scores */}
                                <div className="flex items-center justify-between gap-3 sm:gap-4 py-2">
                                  {/* Home Team */}
                                  <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                                    <TeamLogo src={m.home?.logo_url} name={m.home?.team_name} size="sm" />
                                    <span className="font-[900] text-xs sm:text-sm text-white uppercase truncate">
                                      {m.home?.team_name || 'Ev Sahibi'}
                                    </span>
                                  </div>

                                  {/* Score Box */}
                                  <div className="shrink-0 px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 text-center min-w-[65px] sm:min-w-[70px]">
                                    {isApproved || isPlaying || isPendingReview ? (
                                      <span
                                        className={`text-sm sm:text-base font-[900] font-mono tracking-wider ${
                                          isApproved ? 'text-[#00e5ff]' : 'text-white'
                                        }`}
                                      >
                                        {m.home_score} - {m.away_score}
                                      </span>
                                    ) : (
                                      <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">
                                        VS
                                      </span>
                                    )}
                                  </div>

                                  {/* Away Team */}
                                  <div className="flex items-center justify-end gap-2.5 sm:gap-3 flex-1 min-w-0">
                                    <span className="font-[900] text-xs sm:text-sm text-white uppercase truncate text-right">
                                      {m.away?.team_name || 'Deplasman'}
                                    </span>
                                    <TeamLogo src={m.away?.logo_url} name={m.away?.team_name} size="sm" />
                                  </div>
                                </div>

                                {/* Goalscorers Display for Completed / Approved Matches */}
                                {isApproved && m.tournament_match_goals && m.tournament_match_goals.length > 0 && (
                                  <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-4 text-[11px]">
                                    <div className="space-y-1">
                                      {m.tournament_match_goals
                                        .filter((g: any) => g.team_application_id === m.home_application_id)
                                        .map((g: any) => (
                                          <div key={g.id} className="flex items-center gap-1 text-zinc-300">
                                            <span className="text-emerald-400">⚽</span>
                                            <span className="font-semibold truncate">
                                              {g.player?.username || g.player_name || 'Oyuncu'}
                                            </span>
                                            {g.goals > 1 && (
                                              <span className="text-zinc-500 font-bold">({g.goals})</span>
                                            )}
                                            {g.is_own_goal && (
                                              <span className="text-red-400 text-[10px] font-bold">(K.K.)</span>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                    <div className="space-y-1 text-right">
                                      {m.tournament_match_goals
                                        .filter((g: any) => g.team_application_id === m.away_application_id)
                                        .map((g: any) => (
                                          <div key={g.id} className="flex items-center justify-end gap-1 text-zinc-300">
                                            {g.is_own_goal && (
                                              <span className="text-red-400 text-[10px] font-bold">(K.K.)</span>
                                            )}
                                            {g.goals > 1 && (
                                              <span className="text-zinc-500 font-bold">({g.goals})</span>
                                            )}
                                            <span className="font-semibold truncate">
                                              {g.player?.username || g.player_name || 'Oyuncu'}
                                            </span>
                                            <span className="text-emerald-400">⚽</span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}

                                {/* Pending Review Notice */}
                                {isPendingReview && (
                                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                                      <span>
                                        Bildirilen Skor: <strong className="text-white font-mono">{m.home_score} - {m.away_score}</strong> (Onay Bekliyor)
                                      </span>
                                    </div>
                                    {m.screenshot_url && (
                                      <a
                                        href={m.screenshot_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#00e5ff] hover:underline flex items-center gap-1 font-bold text-[10px] shrink-0"
                                      >
                                        <ImageIcon className="w-3 h-3" /> Kanıt
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* Rejection Notice with Reason */}
                                {isRejected && (
                                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                                    <div className="space-y-0.5">
                                      <div className="font-bold text-red-200">Skor Bildirimi Reddedildi</div>
                                      <div className="text-zinc-300">
                                        {m.rejection_reason || 'Yönetici tarafından geçersiz görüldü. Lütfen skoru ve ekran görüntüsünü kontrol ederek yeniden iletiniz.'}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Action Button for Authorized Captains */}
                                {canSubmitScore && (
                                  <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                                    <button
                                      onClick={() => setScoreReportMatch(m)}
                                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] text-xs uppercase tracking-wider hover:brightness-110 shadow-lg shadow-[#00e5ff]/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Swords className="w-3.5 h-3.5" />
                                      {isRejected ? 'Skoru Yeniden Gönder' : 'Skor Bildir'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* ---------------- 6. ELEME AĞACI & BRACKET ---------------- */}
        {activeTab === 'bracket' && (
          <div className="space-y-8">
            <TournamentKnockoutBracket
              tournament={tournament}
              matches={matches}
              winners={winners}
              isAdmin={false}
            />
          </div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* APPLICATION MODAL */}
      {/* ============================================================================== */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#0a1628] w-full max-w-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[95vh] animate-fade-in-up">
            <div className="p-6 md:p-8 border-b border-white/10 flex justify-between items-center shrink-0">
              <div>
                <span className="text-[#00e5ff] text-[10px] font-[900] tracking-widest uppercase mb-1 block">
                  TURNUVA TAKIM BAŞVURUSU
                </span>
                <h3 className="text-xl md:text-2xl font-[900] text-white uppercase tracking-widest">
                  {tournament.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setApplyModalOpen(false);
                  setSelectedSquad([]);
                }}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Left col: Team name and Logo */}
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-[900] text-zinc-300 uppercase tracking-widest mb-2">
                      TAKIM ADI <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      name="team_name"
                      type="text"
                      placeholder="Örn: Kuzey Yıldızları FC"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold placeholder:text-zinc-600 focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-[900] text-zinc-300 uppercase tracking-widest mb-2">
                      TAKIM LOGOSU (İsteğe Bağlı)
                    </label>
                    <div className="relative overflow-hidden group rounded-xl border border-dashed border-white/20 hover:border-[#00e5ff]/50 transition-colors bg-black/50">
                      <input
                        name="image_file"
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="p-6 text-center">
                        <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2 group-hover:text-[#00e5ff] transition-colors" />
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
                          Logo Seç veya Sürükle
                        </span>
                        <span className="text-[10px] text-zinc-600 uppercase mt-1 block">PNG, JPG, WEBP (Max 5MB)</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-zinc-400 space-y-1">
                    <span className="font-bold text-white uppercase block">👑 Takım Temsilcisi:</span>
                    <p className="font-normal leading-relaxed">
                      Başvuruyu gönderen kullanıcı olarak otomatik olarak takım kaptanı ve yöneticisi olarak atanacaksınız.
                    </p>
                  </div>
                </div>

                {/* Right col: Squad Selection */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-[900] text-zinc-300 uppercase tracking-widest">
                        KADRO OLUŞTUR ({selectedSquad.length} Oyuncu)
                      </label>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">İsteğe Bağlı</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
                      Turnuvada takımınızda yer almasını istediğiniz kayıtlı oyuncuları aratıp ekleyebilirsiniz. Katı 11 oyuncu şartı yoktur.
                    </p>

                    <input
                      type="text"
                      placeholder="Oyuncu adı ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-bold placeholder:text-zinc-600 focus:border-[#00e5ff] outline-none transition-all mb-2"
                    />

                    <div className="h-52 overflow-y-auto bg-black/30 rounded-xl border border-white/5 p-2 grid grid-cols-2 gap-2 content-start">
                      {searchProfiles.map((p) => {
                        const isSelected = selectedSquad.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => toggleSquadMember(p.id)}
                            className={`p-2 rounded-lg border text-[11px] cursor-pointer flex items-center gap-2 transition-all select-none ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-[#00e5ff] font-black'
                                : 'bg-white/5 border-transparent text-zinc-400 font-bold hover:bg-white/10'
                            }`}
                          >
                            {p.avatar_url ? (
                              <img src={p.avatar_url} className="w-5 h-5 rounded-full object-cover shrink-0" />
                            ) : (
                              <User className="w-5 h-5 p-1 bg-black/50 rounded-full shrink-0" />
                            )}
                            <span className="truncate">@{p.username}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setApplyModalOpen(false);
                    setSelectedSquad([]);
                  }}
                  className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-[900] uppercase tracking-wider text-xs transition-colors cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  disabled={loading}
                  type="submit"
                  className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] uppercase tracking-widest text-xs hover:brightness-110 hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'BAŞVURUYU GÖNDER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* CANCEL APPLICATION CONFIRMATION MODAL */}
      {/* ============================================================================== */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#0a1628] w-full max-w-md rounded-3xl border border-white/10 p-6 space-y-6 shadow-2xl animate-fade-in-up">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-[900] text-white uppercase tracking-wider">Başvuruyu İptal Et</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                Bu turnuvaya yapmış olduğunuz başvuruyu iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-[900] uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                disabled={loading}
                onClick={handleCancelApplication}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-[900] uppercase tracking-wider text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Evet, İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* CAPTAIN SQUAD EDIT MODAL */}
      {/* ============================================================================== */}
      {captainEditApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#0a1628] w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-white/10 shadow-2xl animate-fade-in-up overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/20">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <TeamLogo src={captainEditApp.logo_url} name={captainEditApp.team_name} size="sm" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#00e5ff] text-[10px] font-[900] uppercase tracking-[0.2em]">
                      KAPTAN KADRO YÖNETİMİ
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[#00e5ff] text-[9px] font-black uppercase">
                      Night Cup
                    </span>
                  </div>
                  <h3 className="text-lg font-[900] text-white uppercase tracking-wider truncate max-w-[280px] sm:max-w-md">
                    {captainEditApp.team_name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => {
                  setCaptainEditApp(null);
                  setCaptainFeedback(null);
                  setCaptainSearch('');
                }}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - scrollable */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Deadline Check Banner */}
              {(tournament.registration_end && new Date() > new Date(tournament.registration_end)) ||
              tournament.is_registration_open === false ||
              tournament.status === 'COMPLETED' ||
              tournament.status === 'ARCHIVED' ? (
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-black text-amber-200 block mb-0.5">SÜRE DOLDU</span>
                    Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-[#00e5ff] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block mb-0.5">Kadro Düzenleme Kuralları</span>
                    Turnuva başvuru süresi sona erene kadar takım kadronuza yeni oyuncu ekleyebilir veya çıkarabilirsiniz. Yapılan değişiklikler yalnızca bu Night Cup turnuvasını kapsar.
                  </div>
                </div>
              )}

              {/* Feedback Alert */}
              {captainFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    captainFeedback.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/15 border border-red-500/30 text-red-300'
                  }`}
                >
                  {captainFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{captainFeedback.msg}</span>
                </div>
              )}

              {/* Current Squad list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-[900] text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#00e5ff]" />
                    Mevcut Kadro ({(captainEditApp.players || []).length} Oyuncu)
                  </h4>
                  <span className="text-[10px] text-zinc-500">
                    Kaptan hariç oyuncuları çıkarabilirsiniz
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Captain Row */}
                  <div className="p-3 rounded-xl bg-black/40 border border-[#00e5ff]/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {captainEditApp.applicant?.avatar_url ? (
                        <img
                          src={captainEditApp.applicant.avatar_url}
                          className="w-8 h-8 rounded-full object-cover border border-[#00e5ff]/40"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff]">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">
                            @{captainEditApp.applicant?.username || 'Kaptan'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#00e5ff]/20 text-[#00e5ff] text-[9px] font-black uppercase">
                            KAPTAN
                          </span>
                        </div>
                        {captainEditApp.applicant?.full_name && (
                          <span className="text-[10px] text-zinc-400 block">
                            {captainEditApp.applicant.full_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-1">
                      Çıkarılamaz
                    </span>
                  </div>

                  {/* Other Players in squad */}
                  {(captainEditApp.players || []).map((p: any) => {
                    const isCaptainSelf = p.profile_id === captainEditApp.applicant_id;
                    if (isCaptainSelf) return null;

                    const deadlineExpired =
                      (tournament.registration_end && new Date() > new Date(tournament.registration_end)) ||
                      tournament.is_registration_open === false ||
                      tournament.status === 'COMPLETED' ||
                      tournament.status === 'ARCHIVED';

                    return (
                      <div
                        key={p.id || p.profile_id}
                        className="p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {p.profile?.avatar_url ? (
                            <img
                              src={p.profile.avatar_url}
                              className="w-8 h-8 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-zinc-400">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <span className="text-xs font-black text-zinc-200 block">
                              @{p.profile?.username || 'Oyuncu'}
                            </span>
                            {p.profile?.full_name && (
                              <span className="text-[10px] text-zinc-400 block">
                                {p.profile.full_name}
                              </span>
                            )}
                          </div>
                        </div>

                        {!deadlineExpired && (
                          <button
                            type="button"
                            disabled={captainActionLoading}
                            onClick={() => handleCaptainRemovePlayer(p.profile_id)}
                            title="Kadrodan Çıkar"
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Player Section */}
              {!(
                (tournament.registration_end && new Date() > new Date(tournament.registration_end)) ||
                tournament.is_registration_open === false ||
                tournament.status === 'COMPLETED' ||
                tournament.status === 'ARCHIVED'
              ) && (
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-xs font-[900] text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                    <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                    Kadroya Oyuncu Ekle
                  </h4>

                  {/* Search bar */}
                  <div className="relative mb-3">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={captainSearch}
                      onChange={(e) => setCaptainSearch(e.target.value)}
                      placeholder="Oyuncu ara (kullanıcı adı veya isim)..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                    />
                  </div>

                  {/* Filtered Profile List */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {profiles
                      .filter((prof: any) => {
                        if (prof.id === captainEditApp.applicant_id) return false;
                        if (prof.status === 'BANNED' || prof.status === 'SUSPENDED' || prof.is_active === false) return false;
                        const alreadyInSquad = (captainEditApp.players || []).some(
                          (p: any) => p.profile_id === prof.id
                        );
                        if (alreadyInSquad) return false;
                        if (!captainSearch.trim()) return false;
                        const q = captainSearch.toLowerCase();
                        const un = (prof.username || '').toLowerCase();
                        const fn = (prof.full_name || '').toLowerCase();
                        return un.includes(q) || fn.includes(q);
                      })
                      .slice(0, 6)
                      .map((prof: any) => (
                        <div
                          key={prof.id}
                          className="p-2.5 rounded-xl bg-black/40 border border-white/5 hover:border-cyan-500/20 flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            {prof.avatar_url ? (
                              <img
                                src={prof.avatar_url}
                                className="w-7 h-7 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-zinc-400">
                                <User className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <div>
                              <span className="text-xs font-bold text-white block">
                                @{prof.username}
                              </span>
                              {prof.full_name && (
                                <span className="text-[10px] text-zinc-400 block">
                                  {prof.full_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={captainActionLoading}
                            onClick={() => handleCaptainAddPlayer(prof.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                          >
                            {captainActionLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <UserPlus className="w-3 h-3" />
                                Ekle
                              </>
                            )}
                          </button>
                        </div>
                      ))}

                    {captainSearch.trim().length > 0 &&
                      profiles.filter((prof: any) => {
                        if (prof.id === captainEditApp.applicant_id) return false;
                        if (prof.status === 'BANNED' || prof.status === 'SUSPENDED' || prof.is_active === false) return false;
                        const alreadyInSquad = (captainEditApp.players || []).some(
                          (p: any) => p.profile_id === prof.id
                        );
                        if (alreadyInSquad) return false;
                        const q = captainSearch.toLowerCase();
                        const un = (prof.username || '').toLowerCase();
                        const fn = (prof.full_name || '').toLowerCase();
                        return un.includes(q) || fn.includes(q);
                      }).length === 0 && (
                        <p className="text-center py-4 text-xs text-zinc-500">
                          Aramanıza uygun eklenebilir oyuncu bulunamadı.
                        </p>
                      )}

                    {!captainSearch.trim() && (
                      <p className="text-center py-3 text-[11px] text-zinc-600">
                        Kadroya oyuncu eklemek için yukarıdaki arama kutusuna oyuncu adı yazın.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end shrink-0 bg-black/20">
              <button
                type="button"
                onClick={() => {
                  setCaptainEditApp(null);
                  setCaptainFeedback(null);
                  setCaptainSearch('');
                }}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-[900] uppercase tracking-wider transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MATCH SCORE REPORT MODAL */}
      {/* ============================================================================== */}
      {scoreReportMatch && (
        <TournamentScoreReportModal
          match={scoreReportMatch}
          tournamentId={tournament.id}
          currentUser={currentUser}
          profiles={profiles}
          homePlayers={applications.find((a: any) => a.id === scoreReportMatch.home_application_id)?.players || []}
          awayPlayers={applications.find((a: any) => a.id === scoreReportMatch.away_application_id)?.players || []}
          onClose={() => {
            setScoreReportMatch(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
