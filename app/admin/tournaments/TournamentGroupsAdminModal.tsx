'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Swords,
  Users,
  Calendar,
  Trophy,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Edit2,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { formatTournamentDate, formatForDateTimeLocal } from '@/lib/date-utils';
import {
  generateTournamentGroupsAction,
  updateTournamentGroupNameAction,
  updateTournamentMatchAction,
  resetTournamentGroupsAction,
  generateKnockoutStageAction,
  updateTournamentKnockoutMatchWinnerAction,
  resetKnockoutStageAction,
  updateTournamentStatusAction,
} from './actions';
import {
  calculateGroupStandings,
  validateGroupStageCompleted,
  getTournamentStageLabel,
} from '@/lib/tournament-engine';
import TournamentKnockoutBracket from '@/components/TournamentKnockoutBracket';

interface TournamentGroupsAdminModalProps {
  tournament: any;
  approvedApplications: any[];
  groups: any[];
  matches: any[];
  onClose: () => void;
}

export default function TournamentGroupsAdminModal({
  tournament,
  approvedApplications,
  groups,
  matches,
  onClose,
}: TournamentGroupsAdminModalProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'generator' | 'groups' | 'matches' | 'standings' | 'knockout'>('generator');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Generator states
  const initialGroupCount = Math.max(
    1,
    Math.ceil(approvedApplications.length / (tournament.teams_per_group || 4))
  );
  const [groupCount, setGroupCount] = useState<number>(initialGroupCount || 2);
  const [previewData, setPreviewData] = useState<any>(null);
  const [forceReset, setForceReset] = useState(false);
  const [hasPlayedMatchesWarning, setHasPlayedMatchesWarning] = useState(false);

  // Group editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // Match editing modal
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [matchHomeScore, setMatchHomeScore] = useState<string>('');
  const [matchAwayScore, setMatchAwayScore] = useState<string>('');
  const [matchStatus, setMatchStatus] = useState<string>('COMPLETED');
  const [matchDate, setMatchDate] = useState<string>('');

  // Fixture filter
  const [fixtureGroupFilter, setFixtureGroupFilter] = useState<string>('ALL');

  // Knockout stage generator states
  const [knockoutAdvancingCount, setKnockoutAdvancingCount] = useState<number>(
    tournament.advancing_teams_per_group || 2
  );
  const [knockoutIncludeThirdPlace, setKnockoutIncludeThirdPlace] = useState(true);
  const [knockoutPreview, setKnockoutPreview] = useState<any>(null);
  const [knockoutForceReset, setKnockoutForceReset] = useState(false);
  const [hasPlayedKnockoutWarning, setHasPlayedKnockoutWarning] = useState(false);

  // Knockout Match Edit Modal
  const [selectedKnockoutMatch, setSelectedKnockoutMatch] = useState<any>(null);
  const [knockoutHomeScore, setKnockoutHomeScore] = useState<string>('');
  const [knockoutAwayScore, setKnockoutAwayScore] = useState<string>('');
  const [knockoutPenaltyHomeScore, setKnockoutPenaltyHomeScore] = useState<string>('');
  const [knockoutPenaltyAwayScore, setKnockoutPenaltyAwayScore] = useState<string>('');
  const [knockoutWinnerAppId, setKnockoutWinnerAppId] = useState<string>('');
  const [knockoutMatchStatus, setKnockoutMatchStatus] = useState<string>('APPROVED');

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  // 1. Generate Preview
  const handleGeneratePreview = async () => {
    setLoading(true);
    setPreviewData(null);
    setHasPlayedMatchesWarning(false);

    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('group_count', groupCount.toString());
    formData.append('preview_only', 'true');

    const res = await generateTournamentGroupsAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else if (res.preview) {
      setPreviewData(res.preview);
    }
  };

  // 2. Commit Generation
  const handleCommitGeneration = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('group_count', groupCount.toString());
    formData.append('preview_only', 'false');
    if (forceReset) {
      formData.append('force_reset', 'true');
    }

    const res = await generateTournamentGroupsAction(formData);
    setLoading(false);

    if (res.error) {
      if (res.has_played_matches) {
        setHasPlayedMatchesWarning(true);
      }
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Gruplar ve fikstür başarıyla oluşturuldu!', 'success');
      setPreviewData(null);
      setForceReset(false);
      setHasPlayedMatchesWarning(false);
      setActiveTab('groups');
      router.refresh();
    }
  };

  // 3. Reset Groups
  const handleReset = async () => {
    if (!confirm('Tüm grupları ve grup maçlarını silmek istediğinize emin misiniz?')) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('confirm_force', 'true');

    const res = await resetTournamentGroupsAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Gruplar sıfırlandı.', 'success');
      setPreviewData(null);
      router.refresh();
    }
  };

  // 4. Update Group Name
  const handleSaveGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) return;
    setLoading(true);

    const formData = new FormData();
    formData.append('group_id', groupId);
    formData.append('name', editingGroupName.trim());
    formData.append('tournament_id', tournament.id);

    const res = await updateTournamentGroupNameAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Grup adı güncellendi.', 'success');
      setEditingGroupId(null);
      setEditingGroupName('');
      router.refresh();
    }
  };

  // 5. Open Match Edit Modal
  const openEditMatch = (m: any) => {
    setSelectedMatch(m);
    setMatchHomeScore(m.home_score !== null ? m.home_score.toString() : '');
    setMatchAwayScore(m.away_score !== null ? m.away_score.toString() : '');
    setMatchStatus(m.status || 'SCHEDULED');
    setMatchDate(m.scheduled_at ? formatForDateTimeLocal(m.scheduled_at) : '');
  };

  // 6. Save Match
  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatch) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('match_id', selectedMatch.id);
    formData.append('tournament_id', tournament.id);
    formData.append('home_score', matchHomeScore);
    formData.append('away_score', matchAwayScore);
    formData.append('status', matchStatus);
    formData.append('scheduled_at', matchDate);

    const res = await updateTournamentMatchAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Maç güncellendi.', 'success');
      setSelectedMatch(null);
      router.refresh();
    }
  };

  // Group and Knockout match partitions
  const groupMatches = matches.filter((m) => !m.stage || m.stage === 'GROUP');
  const knockoutMatches = matches.filter((m) => m.stage && m.stage !== 'GROUP');
  const groupValidation = validateGroupStageCompleted(groups, matches);

  // Filter matches for group fixture tab
  const filteredMatches = groupMatches.filter((m) => {
    if (fixtureGroupFilter === 'ALL') return true;
    return m.group_id === fixtureGroupFilter;
  });

  // Knockout handlers
  const handleGenerateKnockoutPreview = async () => {
    setLoading(true);
    setKnockoutPreview(null);
    setHasPlayedKnockoutWarning(false);

    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('advancing_per_group', knockoutAdvancingCount.toString());
    formData.append('include_third_place', knockoutIncludeThirdPlace ? 'true' : 'false');
    formData.append('preview_only', 'true');

    const res = await generateKnockoutStageAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else if (res.preview) {
      setKnockoutPreview(res.preview);
    }
  };

  const handleCommitKnockout = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('advancing_per_group', knockoutAdvancingCount.toString());
    formData.append('include_third_place', knockoutIncludeThirdPlace ? 'true' : 'false');
    formData.append('preview_only', 'false');
    if (knockoutForceReset) {
      formData.append('confirm_force_reset', 'true');
    }

    const res = await generateKnockoutStageAction(formData);
    setLoading(false);

    if (res.error) {
      if (res.has_played_matches) {
        setHasPlayedKnockoutWarning(true);
      }
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Eleme aşaması ve bracket başarıyla oluşturuldu!', 'success');
      setKnockoutPreview(null);
      setKnockoutForceReset(false);
      setHasPlayedKnockoutWarning(false);
      router.refresh();
    }
  };

  const handleResetKnockout = async () => {
    if (
      !confirm(
        'Eleme aşamasını sıfırlamak istediğinize emin misiniz? Grup maçları KORUNACAK, yalnızca eleme maçları ve şampiyon kaydı silinecektir.'
      )
    ) {
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('tournament_id', tournament.id);

    const res = await resetKnockoutStageAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Eleme aşaması sıfırlandı. Grup maçları korundu.', 'success');
      setKnockoutPreview(null);
      router.refresh();
    }
  };

  const openEditKnockoutMatch = (m: any) => {
    setSelectedKnockoutMatch(m);
    setKnockoutHomeScore(
      m.home_score !== null && m.home_score !== undefined ? m.home_score.toString() : ''
    );
    setKnockoutAwayScore(
      m.away_score !== null && m.away_score !== undefined ? m.away_score.toString() : ''
    );
    setKnockoutPenaltyHomeScore(
      m.penalty_home_score !== null && m.penalty_home_score !== undefined
        ? m.penalty_home_score.toString()
        : ''
    );
    setKnockoutPenaltyAwayScore(
      m.penalty_away_score !== null && m.penalty_away_score !== undefined
        ? m.penalty_away_score.toString()
        : ''
    );
    setKnockoutWinnerAppId(m.winner_application_id || '');
    setKnockoutMatchStatus(m.status || 'APPROVED');
  };

  const handleSaveKnockoutMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKnockoutMatch) return;

    if (!knockoutWinnerAppId) {
      showFeedback(
        'Lütfen kazanan takımı seçiniz (beraberlik veya penaltı durumunda zorunludur).',
        'error'
      );
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('match_id', selectedKnockoutMatch.id);
    formData.append('tournament_id', tournament.id);
    formData.append('home_score', knockoutHomeScore);
    formData.append('away_score', knockoutAwayScore);
    formData.append('penalty_home_score', knockoutPenaltyHomeScore);
    formData.append('penalty_away_score', knockoutPenaltyAwayScore);
    formData.append('winner_application_id', knockoutWinnerAppId);
    formData.append('status', knockoutMatchStatus);

    const res = await updateTournamentMatchAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(
        res.success || 'Eleme maçı güncellendi ve kazanan bir sonraki tura ilerletildi.',
        'success'
      );
      setSelectedKnockoutMatch(null);
      router.refresh();
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!confirm(`Turnuva durumunu "${status}" olarak güncellemek istediğinize emin misiniz?`)) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('tournament_id', tournament.id);
    formData.append('status', status);

    const res = await updateTournamentStatusAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Turnuva durumu güncellendi.', 'success');
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-[#0a1628] w-full max-w-5xl rounded-[2rem] border border-white/10 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#060d18]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff]">
              <Swords className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[#00e5ff] text-[10px] font-black tracking-widest uppercase block">
                NIGHT CUP FAZ 2 MOTORU
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                {tournament.name} — Grup ve Fikstür Yönetimi
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 text-center text-xs font-black uppercase tracking-wider ${
              feedback.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-[#00e5ff] text-black'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/10 bg-[#081220] overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('generator')}
            className={`px-4 py-3 rounded-t-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'generator'
                ? 'bg-[#0a1628] text-[#00e5ff] border-t-2 border-[#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Grup & Kura Oluşturucu
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-3 rounded-t-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'groups'
                ? 'bg-[#0a1628] text-[#00e5ff] border-t-2 border-[#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Gruplar ({groups.length})
          </button>

          <button
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-3 rounded-t-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'matches'
                ? 'bg-[#0a1628] text-[#00e5ff] border-t-2 border-[#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" /> Fikstür & Skorlar ({matches.length})
          </button>

          <button
            onClick={() => setActiveTab('standings')}
            className={`px-4 py-3 rounded-t-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'standings'
                ? 'bg-[#0a1628] text-[#00e5ff] border-t-2 border-[#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" /> Canlı Puan Tablosu
          </button>

          <button
            onClick={() => setActiveTab('knockout')}
            className={`px-4 py-3 rounded-t-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'knockout'
                ? 'bg-[#0a1628] text-amber-400 border-t-2 border-amber-400'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" /> Eleme Aşaması ({knockoutMatches.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: GENERATOR & PREVIEW */}
          {activeTab === 'generator' && (
            <div className="space-y-6">
              {/* Quick Info Bar */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Onaylı Takım Sayısı
                  </span>
                  <span className="text-xl font-black text-emerald-400">
                    {approvedApplications.length} Takım
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Mevcut Durum
                  </span>
                  <span className="text-sm font-black text-white">
                    {groups.length > 0
                      ? `${groups.length} Grup / ${matches.length} Maç Hazır`
                      : 'Gruplar Henüz Oluşturulmadı'}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                    Hedef Format
                  </span>
                  <span className="text-sm font-black text-[#00e5ff]">
                    {tournament.teams_per_group || 4}&apos;erli Grup, İlk{' '}
                    {tournament.advancing_teams_per_group || 2} Üst Tura
                  </span>
                </div>
              </div>

              {/* Generator Form */}
              <div className="p-6 rounded-2xl bg-[#081220] border border-white/10 space-y-4">
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#00e5ff]" /> Otomatik Kura ve Grup Fikstürü Oluşturma
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Onaylanan {approvedApplications.length} takım belirlenen grup sayısına dengeli biçimde dağıtılır ve her
                  grup için tek devreli round-robin (her takım birbiriyle bir kez) fikstürü otomatik üretilir.
                </p>

                <div className="flex flex-wrap items-end gap-4 pt-2">
                  <div className="w-48">
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                      Grup Sayısı
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, approvedApplications.length)}
                      value={groupCount}
                      onChange={(e) => setGroupCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold text-sm focus:border-[#00e5ff] outline-none"
                    />
                  </div>

                  <button
                    disabled={loading || approvedApplications.length < 2}
                    onClick={handleGeneratePreview}
                    className="px-6 py-2.5 rounded-xl bg-[#00e5ff] text-black font-black uppercase tracking-wider text-xs hover:bg-[#00c5ff] transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dağılımı Önizle'}
                  </button>

                  {groups.length > 0 && (
                    <button
                      disabled={loading}
                      onClick={handleReset}
                      className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold uppercase tracking-wider text-xs transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Grupları Sıfırla
                    </button>
                  )}
                </div>

                {approvedApplications.length < 2 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Kura çekimi yapabilmek için en az 2 ONAYLI takım bulunmalıdır. Lütfen önce başvuruları onaylayın.
                  </div>
                )}
              </div>

              {/* Warning if played matches exist */}
              {hasPlayedMatchesWarning && (
                <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 space-y-3">
                  <div className="flex items-center gap-2 font-black text-sm uppercase">
                    <ShieldAlert className="w-5 h-5 text-red-400" /> DİKKAT: Oynanmış Maçlar Bulunuyor!
                  </div>
                  <p className="text-xs leading-relaxed">
                    Bu turnuvada daha önceden skoru girilmiş veya tamamlanmış maçlar mevcuttur. Grupları ve fikstürü
                    sıfırdan yeniden oluşturmak mevcut maç sonuçlarını silecektir.
                  </p>
                  <label className="flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceReset}
                      onChange={(e) => setForceReset(e.target.checked)}
                      className="w-4 h-4 rounded text-[#00e5ff]"
                    />
                    Mevcut maç skorlarını silmeyi ve sıfırdan oluşturmayı onaylıyorum.
                  </label>
                </div>
              )}

              {/* Preview Box */}
              {previewData && (
                <div className="p-6 rounded-2xl bg-black/40 border border-[#00e5ff]/30 space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <span className="text-[#00e5ff] text-[10px] font-black uppercase tracking-widest block">
                        KURA ÖNİZLEMESİ
                      </span>
                      <h4 className="text-lg font-black text-white uppercase tracking-wider">
                        {previewData.group_count} Grup / Toplam {previewData.total_matches} Maçlık Fikstür
                      </h4>
                    </div>
                    <button
                      disabled={loading || (hasPlayedMatchesWarning && !forceReset)}
                      onClick={handleCommitGeneration}
                      className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      KURA VE FİKSTÜRÜ ONAYLA (KAYDET)
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {previewData.groups.map((g: any, gIdx: number) => (
                      <div key={gIdx} className="p-4 rounded-xl bg-[#0a1628] border border-white/10 space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <h5 className="font-black text-white uppercase text-sm">{g.name}</h5>
                          <span className="text-[10px] text-zinc-400 font-bold">
                            {g.teams.length} Takım • {g.matches.length} Maç
                          </span>
                        </div>

                        {/* Teams in group */}
                        <div className="space-y-1.5">
                          {g.teams.map((t: any, tIdx: number) => (
                            <div
                              key={t.id}
                              className="flex items-center gap-2.5 p-2 rounded-lg bg-black/30 border border-white/5 text-xs"
                            >
                              <span className="text-zinc-500 font-mono text-[10px] w-4">{tIdx + 1}.</span>
                              <TeamLogo src={t.logo_url} name={t.team_name} size="xs" />
                              <span className="font-bold text-white uppercase truncate">{t.team_name}</span>
                            </div>
                          ))}
                        </div>

                        {/* Round-Robin match preview */}
                        <div className="pt-2 border-t border-white/5">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">
                            Fikstür Eşleşmeleri ({g.matches.length})
                          </span>
                          <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar text-[11px]">
                            {g.matches.map((m: any, mIdx: number) => (
                              <div
                                key={mIdx}
                                className="flex items-center justify-between p-1.5 rounded bg-white/5 text-zinc-300 font-medium"
                              >
                                <span className="text-zinc-500 text-[10px] font-mono">Hafta {m.round}</span>
                                <span className="truncate max-w-[120px] text-right font-bold text-white">
                                  {m.homeTeam?.team_name}
                                </span>
                                <span className="text-zinc-500 px-1 font-bold">vs</span>
                                <span className="truncate max-w-[120px] text-left font-bold text-white">
                                  {m.awayTeam?.team_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GROUPS VIEW & EDIT */}
          {activeTab === 'groups' && (
            <div className="space-y-6">
              {groups.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-sm">
                  Henüz oluşturulmuş grup bulunmamaktadır. Kura oluşturucu sekmesinden oluşturabilirsiniz.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  {groups.map((g) => {
                    const groupTeams = g.tournament_group_teams || [];
                    const isEditing = editingGroupId === g.id;

                    return (
                      <div key={g.id} className="p-5 rounded-2xl bg-[#081220] border border-white/10 space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <input
                                type="text"
                                value={editingGroupName}
                                onChange={(e) => setEditingGroupName(e.target.value)}
                                className="bg-black/50 border border-white/20 rounded-lg px-3 py-1.5 text-sm font-bold text-white outline-none focus:border-[#00e5ff] flex-1"
                              />
                              <button
                                onClick={() => handleSaveGroupName(g.id)}
                                className="px-3 py-1.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg uppercase"
                              >
                                Kaydet
                              </button>
                              <button
                                onClick={() => setEditingGroupId(null)}
                                className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs"
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-black text-white uppercase">{g.name}</h4>
                              <button
                                onClick={() => {
                                  setEditingGroupId(g.id);
                                  setEditingGroupName(g.name);
                                }}
                                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-cyan-400 transition-colors"
                                title="Grup Adını Düzenle"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">
                            {groupTeams.length} Takım
                          </span>
                        </div>

                        {/* Teams in group */}
                        <div className="space-y-2">
                          {groupTeams.map((gt: any, idx: number) => {
                            const app = gt.tournament_applications;
                            return (
                              <div
                                key={gt.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] font-mono text-zinc-500 w-4">{idx + 1}.</span>
                                  <TeamLogo src={app?.logo_url} name={app?.team_name} size="xs" />
                                  <span className="text-xs font-black text-white uppercase">
                                    {app?.team_name || 'Takım'}
                                  </span>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400 uppercase">Onaylı</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FIXTURES & MATCH SCORES */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              {/* Filter */}
              <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl bg-[#081220] border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Grup Filtresi:</span>
                  <select
                    value={fixtureGroupFilter}
                    onChange={(e) => setFixtureGroupFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                  >
                    <option value="ALL">Tüm Gruplar ({matches.length} Maç)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-xs text-zinc-400">
                  Toplam {filteredMatches.length} maç gösteriliyor
                </span>
              </div>

              {filteredMatches.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-sm">
                  Maç bulunamadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMatches.map((m) => {
                    const isCompleted = m.status === 'COMPLETED' || m.status === 'APPROVED';
                    const isPendingReview = m.status === 'PENDING_REVIEW';
                    const isRejected = m.status === 'REJECTED';
                    const group = groups.find((g) => g.id === m.group_id);

                    return (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl bg-[#081220] border border-white/5 hover:border-white/15 transition-all gap-4"
                      >
                        {/* Group and Round Info */}
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          <span className="px-2 py-0.5 rounded bg-white/5 text-zinc-400 font-bold uppercase text-[10px]">
                            {group?.name || 'Grup'}
                          </span>
                          <span className="text-zinc-500 font-bold text-[11px]">Hafta {m.round_number}</span>
                          {m.scheduled_at && (
                            <span className="text-zinc-500 text-[10px] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              {formatTournamentDate(m.scheduled_at, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          )}
                          {isPendingReview && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                              İncelemede
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                              Reddedildi
                            </span>
                          )}
                        </div>

                        {/* Match Teams & Score */}
                        <div className="flex items-center gap-4 flex-1 justify-center max-w-lg">
                          <div className="flex items-center gap-2 justify-end flex-1 min-w-0">
                            <span className="text-xs font-black text-white uppercase truncate text-right">
                              {m.home?.team_name || 'Ev Sahibi'}
                            </span>
                            <TeamLogo src={m.home?.logo_url} name={m.home?.team_name} size="xs" />
                          </div>

                          {/* Score badge */}
                          <div
                            onClick={() => openEditMatch(m)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-black cursor-pointer transition-all ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                                : isPendingReview
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 animate-pulse'
                                : isRejected
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                                : 'bg-black/50 text-zinc-400 border border-white/10 hover:border-[#00e5ff]/50 hover:text-white'
                            }`}
                            title="Skor ve Maç Detayını Düzenle"
                          >
                            {m.home_score !== null && m.away_score !== null
                              ? `${m.home_score} - ${m.away_score}`
                              : 'vs'}
                          </div>

                          <div className="flex items-center gap-2 justify-start flex-1 min-w-0">
                            <TeamLogo src={m.away?.logo_url} name={m.away?.team_name} size="xs" />
                            <span className="text-xs font-black text-white uppercase truncate text-left">
                              {m.away?.team_name || 'Deplasman'}
                            </span>
                          </div>
                        </div>

                        {/* Edit Button */}
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => openEditMatch(m)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#00e5ff]/15 text-zinc-300 hover:text-[#00e5ff] text-xs font-bold transition-colors"
                          >
                            Skor / Saat Düzenle
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STANDINGS PREVIEW */}
          {activeTab === 'standings' && (
            <div className="space-y-8">
              {groups.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-sm">
                  Grup bulunamadı.
                </div>
              ) : (
                groups.map((g) => {
                  const gTeams = (g.tournament_group_teams || []).map((gt: any) => ({
                    application_id: gt.application_id,
                    team_name: gt.tournament_applications?.team_name || 'Takım',
                    logo_url: gt.tournament_applications?.logo_url,
                  }));

                  const gMatches = matches.filter((m) => m.group_id === g.id);
                  const standings = calculateGroupStandings(gTeams, gMatches);
                  const advancingCount = tournament.advancing_teams_per_group || 2;

                  return (
                    <div key={g.id} className="p-6 rounded-2xl bg-[#081220] border border-white/10 space-y-4">
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <h4 className="text-base font-black text-white uppercase flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-[#00e5ff]" /> {g.name} Puan Tablosu
                        </h4>
                        <span className="text-[11px] font-bold text-emerald-400">
                          İlk {advancingCount} Takım Üst Tura Yükselir
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="text-zinc-500 uppercase border-b border-white/5 font-black text-[10px]">
                              <th className="py-2.5 px-3">#</th>
                              <th className="py-2.5 px-3">Takım</th>
                              <th className="py-2.5 px-3 text-center">O</th>
                              <th className="py-2.5 px-3 text-center">G</th>
                              <th className="py-2.5 px-3 text-center">B</th>
                              <th className="py-2.5 px-3 text-center">M</th>
                              <th className="py-2.5 px-3 text-center">AG</th>
                              <th className="py-2.5 px-3 text-center">YG</th>
                              <th className="py-2.5 px-3 text-center">AV</th>
                              <th className="py-2.5 px-3 text-center text-white">P</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row, idx) => {
                              const isAdvancing = idx < advancingCount;
                              return (
                                <tr
                                  key={row.application_id}
                                  className={`border-b border-white/5 font-bold transition-colors ${
                                    isAdvancing ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-white/5'
                                  }`}
                                >
                                  <td className="py-3 px-3">
                                    <span
                                      className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] ${
                                        isAdvancing
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : 'text-zinc-500'
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2.5">
                                      <TeamLogo src={row.logo_url} name={row.team_name} size="xs" />
                                      <span className="text-white uppercase truncate font-black">
                                        {row.team_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center text-zinc-300">{row.played}</td>
                                  <td className="py-3 px-3 text-center text-zinc-300">{row.won}</td>
                                  <td className="py-3 px-3 text-center text-zinc-300">{row.drawn}</td>
                                  <td className="py-3 px-3 text-center text-zinc-300">{row.lost}</td>
                                  <td className="py-3 px-3 text-center text-zinc-400">{row.goals_for}</td>
                                  <td className="py-3 px-3 text-center text-zinc-400">{row.goals_against}</td>
                                  <td className="py-3 px-3 text-center text-zinc-300">
                                    {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                                  </td>
                                  <td className="py-3 px-3 text-center text-white font-black text-sm text-[#00e5ff]">
                                    {row.points}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 5: KNOCKOUT STAGE */}
          {activeTab === 'knockout' && (
            <div className="space-y-6">
              {knockoutMatches.length === 0 ? (
                <div className="space-y-6">
                  {/* Prerequisite Check */}
                  {!groupValidation.isComplete ? (
                    <div className="bg-[#0a1628] border border-amber-500/30 rounded-2xl p-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-white uppercase tracking-wider">
                            Grup Aşaması Henüz Tamamlanmadı
                          </h4>
                          <p className="text-xs text-zinc-300 leading-relaxed">
                            Eleme ağacının oluşturulabilmesi için tüm grup maçlarının tamamlanmış ve sonuçlarının onaylanmış olması gerekmektedir.
                          </p>
                          <div className="pt-2 flex items-center gap-3">
                            <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Bekleyen Maç: {groupValidation.pendingCount} / {groupValidation.totalGroupMatches}
                            </span>
                            <button
                              onClick={() => setActiveTab('matches')}
                              className="px-4 py-2 rounded-xl bg-[#00e5ff] text-black font-black text-xs uppercase tracking-wider hover:bg-[#00c5ff] transition-all"
                            >
                              Grup Fikstürüne Git & Skor Onayla
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-6 space-y-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Trophy className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-amber-400 text-[10px] font-black tracking-widest uppercase block">
                              GRUP AŞAMASI TAMAMLANDI
                            </span>
                            <h4 className="text-lg font-black text-white uppercase tracking-wider">
                              Eleme Aşaması ve Bracket Kurulumu
                            </h4>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Tüm Maçlar Onaylandı
                        </span>
                      </div>

                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Şampiyonlar Ligi grup sonrası kurallarına göre çapraz eşleşmeli (Grup 1.si vs Farklı Grup 2.si) eleme ağacı oluşturulur.
                        Aynı gruptan çıkan takımlar ilk eleme turunda birbirine rakip olamaz ve mümkün olduğunca farklı ağaç kollarına yerleştirilir.
                      </p>

                      {/* Setup Form */}
                      <div className="grid sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                            Her Gruptan Çıkacak Takım Sayısı
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={4}
                            value={knockoutAdvancingCount}
                            onChange={(e) => setKnockoutAdvancingCount(parseInt(e.target.value) || 2)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold text-sm focus:border-amber-400 outline-none"
                          />
                          <span className="text-[10px] text-zinc-500 mt-1 block">
                            Varsayılan: 2 (Grup birincileri ve ikincileri ilerler)
                          </span>
                        </div>

                        <div className="flex items-center gap-3 pt-6">
                          <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={knockoutIncludeThirdPlace}
                              onChange={(e) => setKnockoutIncludeThirdPlace(e.target.checked)}
                              className="rounded border-white/20 bg-black/50 text-amber-400 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <span>Üçüncülük Maçı Oluştur (Yarı Final Mağlupları)</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                        <button
                          disabled={loading}
                          onClick={handleGenerateKnockoutPreview}
                          className="px-6 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          Eşleşmeleri Önizle (Kura & Ağaç)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Knockout Preview Panel */}
                  {knockoutPreview && (
                    <div className="space-y-6 pt-4 border-t border-white/10">
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider">
                            Eleme Eşleşme Önizlemesi
                          </h4>
                          <p className="text-xs text-zinc-300">
                            {knockoutPreview.advancingTeams.length} Takım Çıktı • {knockoutPreview.totalMatches} Eleme Maçı Planlandı
                          </p>
                        </div>
                        <button
                          disabled={loading}
                          onClick={handleCommitKnockout}
                          className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-amber-400/20 cursor-pointer"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Eleme Aşamasını Başlat ve Maçları Oluştur
                        </button>
                      </div>

                      {/* Advancing Teams List */}
                      <div>
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">
                          Gruplardan Çıkan Takımlar ({knockoutPreview.advancingTeams.length})
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {knockoutPreview.advancingTeams.map((t: any) => (
                            <div key={t.application_id} className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2">
                              <TeamLogo src={t.logo_url} name={t.team_name} size="xs" />
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-black text-white uppercase truncate block">
                                  {t.team_name}
                                </span>
                                <span className="text-[9px] text-zinc-400 block">
                                  {t.group_name} {t.rank}.si ({t.points}p)
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* First Round Pairings */}
                      <div>
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">
                          İlk Tur Çapraz Eşleşmeleri
                        </span>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {knockoutPreview.pairings.map((p: any, idx: number) => (
                            <div key={idx} className="p-3 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <TeamLogo src={p.home.logo_url} name={p.home.name} size="xs" />
                                <span className="text-xs font-black text-white uppercase truncate">{p.home.name}</span>
                                <span className="text-[9px] text-zinc-500">({p.home.group} {p.home.rank}.)</span>
                              </div>
                              <span className="px-2 text-zinc-500 font-bold text-xs">vs</span>
                              <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                                <span className="text-[9px] text-zinc-500">({p.away.group} {p.away.rank}.)</span>
                                <span className="text-xs font-black text-white uppercase truncate text-right">{p.away.name}</span>
                                <TeamLogo src={p.away.logo_url} name={p.away.name} size="xs" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* BYEs if any */}
                      {knockoutPreview.byes.length > 0 && (
                        <div>
                          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-2">
                            Doğrudan Üst Tura Yükselen Takımlar (BYE - En İyi Grup 1.leri)
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {knockoutPreview.byes.map((b: any) => (
                              <div key={b.id} className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                                <TeamLogo src={b.logo_url} name={b.name} size="xs" />
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-black text-emerald-400 uppercase truncate block">{b.name}</span>
                                  <span className="text-[9px] text-zinc-400 block">{b.group} {b.rank}.si</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* KNOCKOUT ACTIVE VIEW */
                <div className="space-y-6">
                  {/* Management Bar */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-white uppercase tracking-wider">
                            Eleme Aşaması Aktif
                          </h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {knockoutMatches.length} Maç
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Maç sonuçlarını girdikçe kazanan takımlar otomatik olarak bir sonraki tura ilerletilir.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {tournament.status !== 'COMPLETED' && tournament.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => handleUpdateStatus('COMPLETED')}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Turnuvayı Tamamla
                        </button>
                      )}

                      {tournament.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => handleUpdateStatus('ARCHIVED')}
                          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Arşivle
                        </button>
                      )}

                      <button
                        onClick={handleResetKnockout}
                        className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Eleme Aşamasını Sıfırla
                      </button>
                    </div>
                  </div>

                  {/* Knockout Bracket View with Admin Edit Callbacks */}
                  <TournamentKnockoutBracket
                    tournament={tournament}
                    matches={matches}
                    isAdmin={true}
                    onEditMatch={openEditKnockoutMatch}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Match Score Modal */}
        {selectedMatch && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-[#0a1628] w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-sm font-black text-white uppercase">Maç Skoru & Durumu Düzenle</h4>
                <button
                  onClick={() => setSelectedMatch(null)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveMatch} className="space-y-4">
                {/* Teams */}
                <div className="flex items-center justify-between text-xs font-black uppercase text-center">
                  <div className="flex-1 truncate text-white">{selectedMatch.home?.team_name}</div>
                  <span className="px-2 text-zinc-500">vs</span>
                  <div className="flex-1 truncate text-white">{selectedMatch.away?.team_name}</div>
                </div>

                {/* Score inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Ev Sahibi Skor</label>
                    <input
                      type="number"
                      min={0}
                      value={matchHomeScore}
                      onChange={(e) => setMatchHomeScore(e.target.value)}
                      placeholder="Skor"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-black text-center text-lg focus:border-[#00e5ff] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Deplasman Skor</label>
                    <input
                      type="number"
                      min={0}
                      value={matchAwayScore}
                      onChange={(e) => setMatchAwayScore(e.target.value)}
                      placeholder="Skor"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-black text-center text-lg focus:border-[#00e5ff] outline-none"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Maç Durumu</label>
                  <select
                    value={matchStatus}
                    onChange={(e) => setMatchStatus(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold text-xs focus:border-[#00e5ff] outline-none"
                  >
                    <option value="SCHEDULED">Planlandı (Oynanmadı)</option>
                    <option value="PLAYING">Canlı / Oynanıyor</option>
                    <option value="COMPLETED">Tamamlandı (Onaylı Skor)</option>
                    <option value="CANCELLED">İptal Edildi</option>
                  </select>
                </div>

                {/* Scheduled At */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Maç Tarihi & Saati</label>
                  <input
                    type="datetime-local"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-xs focus:border-[#00e5ff] outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMatch(null)}
                    className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 font-bold text-xs"
                  >
                    Vazgeç
                  </button>
                  <button
                    disabled={loading}
                    type="submit"
                    className="px-6 py-2 rounded-xl bg-[#00e5ff] text-black font-black text-xs uppercase"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Knockout Match Score Modal */}
        {selectedKnockoutMatch && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-[#0a1628] w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest block">
                    {getTournamentStageLabel(selectedKnockoutMatch.stage)} • {selectedKnockoutMatch.bracket_slot || 'Eleme Maçı'}
                  </span>
                  <h4 className="text-sm font-black text-white uppercase">
                    Eleme Maç Skoru & Kazananı Belirle
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedKnockoutMatch(null)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveKnockoutMatch} className="space-y-4">
                {/* Teams Display */}
                <div className="flex items-center justify-between text-xs font-black uppercase text-center p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex-1 truncate text-white">
                    {selectedKnockoutMatch.home?.team_name || 'Ev Sahibi'}
                  </div>
                  <span className="px-2 text-zinc-500">vs</span>
                  <div className="flex-1 truncate text-white">
                    {selectedKnockoutMatch.away?.team_name || 'Deplasman'}
                  </div>
                </div>

                {/* Score inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                      Ev Sahibi Skor
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={knockoutHomeScore}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKnockoutHomeScore(val);
                        const h = parseInt(val);
                        const a = parseInt(knockoutAwayScore);
                        if (!isNaN(h) && !isNaN(a)) {
                          if (h > a && selectedKnockoutMatch.home_application_id) {
                            setKnockoutWinnerAppId(selectedKnockoutMatch.home_application_id);
                          } else if (a > h && selectedKnockoutMatch.away_application_id) {
                            setKnockoutWinnerAppId(selectedKnockoutMatch.away_application_id);
                          }
                        }
                      }}
                      placeholder="Skor"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-black text-center text-lg focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                      Deplasman Skor
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={knockoutAwayScore}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKnockoutAwayScore(val);
                        const h = parseInt(knockoutHomeScore);
                        const a = parseInt(val);
                        if (!isNaN(h) && !isNaN(a)) {
                          if (h > a && selectedKnockoutMatch.home_application_id) {
                            setKnockoutWinnerAppId(selectedKnockoutMatch.home_application_id);
                          } else if (a > h && selectedKnockoutMatch.away_application_id) {
                            setKnockoutWinnerAppId(selectedKnockoutMatch.away_application_id);
                          }
                        }
                      }}
                      placeholder="Skor"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-black text-center text-lg focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>

                {/* Penalty Shootout inputs (Optional or for draws) */}
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    Penaltı Atışları (Beraberlik Durumunda)
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input
                        type="number"
                        min={0}
                        value={knockoutPenaltyHomeScore}
                        onChange={(e) => setKnockoutPenaltyHomeScore(e.target.value)}
                        placeholder="Ev Penaltı"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-center text-sm focus:border-amber-400 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min={0}
                        value={knockoutPenaltyAwayScore}
                        onChange={(e) => setKnockoutPenaltyAwayScore(e.target.value)}
                        placeholder="Dep Penaltı"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-center text-sm focus:border-amber-400 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Explicit Winner Designation */}
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                    Üst Tura Yükselecek Kazanan Takım *
                  </label>
                  <select
                    value={knockoutWinnerAppId}
                    onChange={(e) => setKnockoutWinnerAppId(e.target.value)}
                    className="w-full bg-black/50 border border-amber-500/30 rounded-xl px-4 py-2.5 text-white font-black text-xs focus:border-amber-400 outline-none"
                  >
                    <option value="">-- Kazanan Takımı Seçiniz --</option>
                    {selectedKnockoutMatch.home_application_id && (
                      <option value={selectedKnockoutMatch.home_application_id}>
                        {selectedKnockoutMatch.home?.team_name || 'Ev Sahibi'} (Galip)
                      </option>
                    )}
                    {selectedKnockoutMatch.away_application_id && (
                      <option value={selectedKnockoutMatch.away_application_id}>
                        {selectedKnockoutMatch.away?.team_name || 'Deplasman'} (Galip)
                      </option>
                    )}
                  </select>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Seçilen takım otomatik olarak bir sonraki eşleşmeye yerleştirilecektir.
                  </span>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                    Maç Durumu
                  </label>
                  <select
                    value={knockoutMatchStatus}
                    onChange={(e) => setKnockoutMatchStatus(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold text-xs focus:border-amber-400 outline-none"
                  >
                    <option value="APPROVED">Onaylandı / Tamamlandı (APPROVED)</option>
                    <option value="COMPLETED">Tamamlandı (COMPLETED)</option>
                    <option value="PLAYING">Canlı / Oynanıyor (PLAYING)</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedKnockoutMatch(null)}
                    className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 font-bold text-xs"
                  >
                    Vazgeç
                  </button>
                  <button
                    disabled={loading}
                    type="submit"
                    className="px-6 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-400/20"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet & İlerlet'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
