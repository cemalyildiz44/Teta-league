'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Trophy,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  User,
  Image as ImageIcon,
  Info,
} from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { submitTournamentMatchScoreAction } from '../actions';

interface TournamentScoreReportModalProps {
  match: any;
  tournamentId: string;
  currentUser: any;
  profiles: any[];
  homePlayers: any[];
  awayPlayers: any[];
  onClose: () => void;
}

export default function TournamentScoreReportModal({
  match,
  tournamentId,
  currentUser,
  profiles,
  homePlayers,
  awayPlayers,
  onClose,
}: TournamentScoreReportModalProps) {
  const router = useRouter();

  const [homeScore, setHomeScore] = useState<string>('0');
  const [awayScore, setAwayScore] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // Scorers list: { team_application_id, player_id, player_name, goals, is_own_goal }
  const [scorers, setScorers] = useState<
    Array<{
      id: string;
      team_application_id: string;
      player_id?: string | null;
      player_name: string;
      goals: number;
      is_own_goal?: boolean;
    }>
  >([]);

  // Add scorer form temp states
  const [selectedTeamId, setSelectedTeamId] = useState<string>(match.home_application_id);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [scorerGoals, setScorerGoals] = useState<number>(1);
  const [isOwnGoal, setIsOwnGoal] = useState<boolean>(false);
  const [playerSearch, setPlayerSearch] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const homeParsedScore = parseInt(homeScore, 10) || 0;
  const awayParsedScore = parseInt(awayScore, 10) || 0;

  // Calculate current sum of assigned goals
  const homeAssignedGoals = scorers
    .filter((s) => s.team_application_id === match.home_application_id)
    .reduce((sum, s) => sum + s.goals, 0);

  const awayAssignedGoals = scorers
    .filter((s) => s.team_application_id === match.away_application_id)
    .reduce((sum, s) => sum + s.goals, 0);

  const isHomeGoalsMatched = homeAssignedGoals === homeParsedScore;
  const isAwayGoalsMatched = awayAssignedGoals === awayParsedScore;
  const isScoreMatched = isHomeGoalsMatched && isAwayGoalsMatched;

  // Handle screenshot file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Ekran görüntüsü boyutu 5MB limitini aşıyor.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Yalnızca JPG, PNG veya WEBP formatında ekran görüntüsü yükleyebilirsiniz.');
      return;
    }

    setErrorMsg(null);
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  // Add a goalscorer to list
  const handleAddScorer = () => {
    setErrorMsg(null);

    let playerName = '';
    let playerId: string | null = selectedPlayerId || null;

    if (isOwnGoal) {
      playerName = 'Kendi Kalesine Gol (KK)';
      playerId = null;
    } else {
      if (!selectedPlayerId) {
        setErrorMsg('Lütfen gol atan oyuncuyu seçiniz.');
        return;
      }
      const p = profiles.find((prof) => prof.id === selectedPlayerId);
      playerName = p ? `@${p.username}` : 'Oyuncu';
    }

    const newScorer = {
      id: Math.random().toString(36).substring(2, 9),
      team_application_id: selectedTeamId,
      player_id: playerId,
      player_name: playerName,
      goals: scorerGoals,
      is_own_goal: isOwnGoal,
    };

    setScorers([...scorers, newScorer]);
    setSelectedPlayerId('');
    setScorerGoals(1);
    setIsOwnGoal(false);
    setPlayerSearch('');
  };

  // Remove a goalscorer
  const handleRemoveScorer = (id: string) => {
    setScorers(scorers.filter((s) => s.id !== id));
  };

  // Submit report
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!screenshotFile) {
      setErrorMsg('Maç sonucu kanıtı için ekran görüntüsü yüklenmesi zorunludur.');
      return;
    }

    if (!isScoreMatched) {
      setErrorMsg('Girilen golcülerin toplam gol sayısı, takım skorları ile birebir eşleşmelidir.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('match_id', match.id);
    formData.append('tournament_id', tournamentId);
    formData.append('home_score', homeParsedScore.toString());
    formData.append('away_score', awayParsedScore.toString());
    formData.append('notes', notes);
    formData.append('screenshot_file', screenshotFile);
    formData.append('goals_json', JSON.stringify(scorers));

    const res = await submitTournamentMatchScoreAction(formData);
    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setSuccessMsg(res.success || 'Sonuç bildirimi başarıyla gönderildi.');
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1500);
    }
  };

  // Available squad or all registered profiles for scorer selection
  const relevantTeamPlayers =
    selectedTeamId === match.home_application_id ? homePlayers : awayPlayers;

  // Filter profiles based on search
  const filteredProfiles = profiles
    .filter((p) => p.username.toLowerCase().includes(playerSearch.toLowerCase()))
    .slice(0, 15);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-[#0a1628] w-full max-w-2xl rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#060d18]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[#00e5ff] text-[10px] font-black tracking-widest uppercase block">
                RESMİ MAÇ SKOR BİLDİRİMİ
              </span>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                {match.home?.team_name} vs {match.away?.team_name}
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

        {/* Rejection Warning if applicable */}
        {match.status === 'REJECTED' && match.rejection_reason && (
          <div className="p-4 bg-red-500/15 border-b border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-black uppercase text-red-400 mb-0.5">
                Önceki Bildirim Yönetici Tarafından Reddedildi:
              </strong>
              <span>{match.rejection_reason}</span>
            </div>
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3 bg-red-500/90 text-white text-xs font-black uppercase tracking-wider text-center">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-500/90 text-black text-xs font-black uppercase tracking-wider text-center">
            {successMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Match Score Input */}
          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-4">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block text-center">
              MAÇ SKORU
            </span>

            <div className="flex items-center justify-center gap-6">
              {/* Home Team */}
              <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
                <TeamLogo src={match.home?.logo_url} name={match.home?.team_name} size="md" />
                <span className="text-xs font-black text-white uppercase text-center truncate w-full">
                  {match.home?.team_name}
                </span>
                <input
                  type="number"
                  min={0}
                  required
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-20 bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-2xl font-black text-center text-white focus:border-[#00e5ff] outline-none"
                />
              </div>

              <span className="text-xl font-black text-zinc-500 mb-6">-</span>

              {/* Away Team */}
              <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
                <TeamLogo src={match.away?.logo_url} name={match.away?.team_name} size="md" />
                <span className="text-xs font-black text-white uppercase text-center truncate w-full">
                  {match.away?.team_name}
                </span>
                <input
                  type="number"
                  min={0}
                  required
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-20 bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-2xl font-black text-center text-white focus:border-[#00e5ff] outline-none"
                />
              </div>
            </div>

            {/* Score Match Status Badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-white/5 text-[11px] font-bold">
              <span
                className={`px-3 py-1 rounded-full ${
                  isHomeGoalsMatched ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {match.home?.team_name}: {homeAssignedGoals} / {homeParsedScore} Gol{' '}
                {isHomeGoalsMatched ? '✓' : '⚠️'}
              </span>

              <span
                className={`px-3 py-1 rounded-full ${
                  isAwayGoalsMatched ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {match.away?.team_name}: {awayAssignedGoals} / {awayParsedScore} Gol{' '}
                {isAwayGoalsMatched ? '✓' : '⚠️'}
              </span>
            </div>
          </div>

          {/* Goalscorers Section */}
          <div className="p-6 rounded-2xl bg-[#081220] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-wider">
                GOL ATAN OYUNCULAR ({scorers.length})
              </span>
              <span className="text-[10px] text-zinc-400 uppercase">Toplam skorla birebir eşleşmeli</span>
            </div>

            {/* Add Scorer Sub-Form */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Team selector */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Takım</label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                  >
                    <option value={match.home_application_id}>{match.home?.team_name} (Ev Sahibi)</option>
                    <option value={match.away_application_id}>{match.away?.team_name} (Deplasman)</option>
                  </select>
                </div>

                {/* Goals count */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Gol Sayısı</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={scorerGoals}
                    onChange={(e) => setScorerGoals(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              {/* Player selector / search */}
              {!isOwnGoal ? (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase">
                    Oyuncu Seçimi (Kayıtlı Profiller)
                  </label>

                  {/* If team has squad members */}
                  {relevantTeamPlayers.length > 0 ? (
                    <select
                      value={selectedPlayerId}
                      onChange={(e) => setSelectedPlayerId(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff]"
                    >
                      <option value="">Kadrodan Oyuncu Seçin...</option>
                      {relevantTeamPlayers.map((p: any) => (
                        <option key={p.profile_id} value={p.profile_id}>
                          @{p.profile?.username}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {/* Search in all profiles fallback */}
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="Oyuncu ara (Kullanıcı adı)..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      className="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-[#00e5ff]"
                    />
                    {playerSearch.trim() && (
                      <div className="max-h-28 overflow-y-auto bg-black/60 rounded-xl border border-white/10 p-1 grid grid-cols-2 gap-1">
                        {filteredProfiles.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPlayerId(p.id);
                              setPlayerSearch('');
                            }}
                            className={`p-1.5 rounded text-[11px] cursor-pointer flex items-center gap-1.5 ${
                              selectedPlayerId === p.id
                                ? 'bg-[#00e5ff]/20 text-[#00e5ff] font-black'
                                : 'hover:bg-white/10 text-zinc-300 font-bold'
                            }`}
                          >
                            <User className="w-3 h-3 text-zinc-500" />
                            <span className="truncate">@{p.username}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Own Goal toggle & Add button */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isOwnGoal}
                    onChange={(e) => setIsOwnGoal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#00e5ff]"
                  />
                  <span>Kendi Kalesine Gol (KK)</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddScorer}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-[#00e5ff] hover:text-black text-white text-xs font-black uppercase transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Golcü Ekle
                </button>
              </div>
            </div>

            {/* Added Scorers List */}
            {scorers.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {scorers.map((s) => {
                  const isHome = s.team_application_id === match.home_application_id;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs font-bold"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            isHome ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'
                          }`}
                        >
                          {isHome ? match.home?.team_name : match.away?.team_name}
                        </span>
                        <span className="text-white font-black">{s.player_name}</span>
                        <span className="text-[#00e5ff] font-mono font-black">({s.goals} Gol)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveScorer(s.id)}
                        className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Match Screenshot Upload */}
          <div className="p-6 rounded-2xl bg-[#081220] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-white uppercase tracking-wider">
                MAÇ SONUCU EKRAN GÖRÜNTÜSÜ <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-zinc-500 uppercase">Max 5MB (JPG, PNG, WEBP)</span>
            </div>

            {screenshotPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/50 group max-h-56">
                <img src={screenshotPreview} alt="Screenshot" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setScreenshotFile(null);
                    setScreenshotPreview(null);
                  }}
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-white/10 hover:border-[#00e5ff]/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-black/30 group">
                <Upload className="w-8 h-8 text-zinc-600 group-hover:text-[#00e5ff] mb-2 transition-colors" />
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                  Ekran Görüntüsü Seç veya Sürükle
                </span>
                <span className="text-[10px] text-zinc-500">Oyun sonu maç istatistikleri veya skor tablosu</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Notes textarea */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
              İsteğe Bağlı Not / Açıklama
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hakem veya maçla ilgili eklemek istediğiniz notlar..."
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#00e5ff] outline-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-black uppercase text-xs transition-colors"
            >
              Vazgeç
            </button>
            <button
              disabled={loading || !screenshotFile || !isScoreMatched}
              type="submit"
              className="px-8 py-3 rounded-xl bg-[#00e5ff] text-black font-black uppercase tracking-widest text-xs hover:bg-[#00c5ff] hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SKORU BİLDİR (ONAYA GÖNDER)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
