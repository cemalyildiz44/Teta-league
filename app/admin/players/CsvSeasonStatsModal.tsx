'use client';

import { useState, useMemo } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ShieldAlert,
  X, Loader2, Search, UserCheck, Shield, Filter, Check, RefreshCw
} from 'lucide-react';
import {
  evaluateSeasonStatsCsv,
  DEFAULT_TARGET_CSV_SEASON,
  DEFAULT_TARGET_LEAGUE_NAME,
  ImporterProfileRef,
  ImporterTeamRef,
  ImporterLeagueTeamRef,
  ImporterExistingLegacyStatRef,
  ManualTeamResolution,
  CsvRowImportStatus
} from '@/lib/csv/season-stats-importer';
import {
  importPlayerSeasonStatsCsvAction,
  CsvImportBatchResponse
} from './actions';

export interface SeasonOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface CsvSeasonStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessRefresh: () => void;
  profiles: ImporterProfileRef[];
  teams: ImporterTeamRef[];
  seasons: SeasonOption[];
  leagueTeams: ImporterLeagueTeamRef[];
  existingLegacyStats: ImporterExistingLegacyStatRef[];
}

type PreviewTabFilter =
  | 'ALL'
  | 'READY'
  | 'NOT_IMPORTED'
  | 'NEEDS_PLAYER_MATCH'
  | 'NEEDS_TEAM_MATCH'
  | 'INVALID_STATS'
  | 'EXISTING_IN_DB'
  | 'DUPLICATE_IN_CSV'
  | 'EXCLUDED_SEASON';

export function CsvSeasonStatsModal({
  isOpen,
  onClose,
  onSuccessRefresh,
  profiles,
  teams,
  seasons,
  leagueTeams,
  existingLegacyStats
}: CsvSeasonStatsModalProps) {
  // Find default Season 5 in seasons list if available
  const defaultSeason5 = useMemo(() => {
    return (
      seasons.find(s => s.slug === 'teta-s5') ||
      seasons.find(s => /5/.test(s.name)) ||
      seasons[0] ||
      null
    );
  }, [seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(defaultSeason5?.id || '');
  const [targetSeasonName, setTargetSeasonName] = useState<string>(DEFAULT_TARGET_CSV_SEASON);
  const [defaultLeagueName, setDefaultLeagueName] = useState<string>(DEFAULT_TARGET_LEAGUE_NAME);

  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [manualPlayerOverrides, setManualPlayerOverrides] = useState<Record<string, string>>({});
  const [manualTeamOverrides, setManualTeamOverrides] = useState<Record<string, ManualTeamResolution>>({});

  const [activeFilter, setActiveFilter] = useState<PreviewTabFilter>('ALL');
  const [rowSearch, setRowSearch] = useState<string>('');
  const [playerPickerSearch, setPlayerPickerSearch] = useState<string>('');

  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<CsvImportBatchResponse | null>(null);

  const preview = useMemo(() => {
    if (!csvContent) return null;
    return evaluateSeasonStatsCsv({
      csvContent,
      targetCsvSeason: DEFAULT_TARGET_CSV_SEASON,
      targetSeasonName: targetSeasonName.trim() || DEFAULT_TARGET_CSV_SEASON,
      targetSeasonId: selectedSeasonId || null,
      defaultLeagueName: defaultLeagueName.trim() || DEFAULT_TARGET_LEAGUE_NAME,
      profiles,
      teams,
      leagueTeams,
      existingLegacyStats,
      manualPlayerOverrides,
      manualTeamOverrides
    });
  }, [
    csvContent,
    targetSeasonName,
    selectedSeasonId,
    defaultLeagueName,
    profiles,
    teams,
    leagueTeams,
    existingLegacyStats,
    manualPlayerOverrides,
    manualTeamOverrides
  ]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setManualPlayerOverrides({});
    setManualTeamOverrides({});
    setActiveFilter('ALL');

    const text = await file.text();
    setCsvContent(text);
  };

  const handleSeasonSelectChange = (newSeasonId: string) => {
    setSelectedSeasonId(newSeasonId);
    setImportResult(null);
  };

  const handleSetManualPlayer = (eaId: string, profileId: string) => {
    setImportResult(null);
    setManualPlayerOverrides(prev => {
      const next = { ...prev };
      if (!profileId) {
        delete next[eaId];
      } else {
        next[eaId] = profileId;
      }
      return next;
    });
  };

  const handleSetManualTeam = (playedTeam: string, resolution: ManualTeamResolution | null) => {
    setImportResult(null);
    setManualTeamOverrides(prev => {
      const next = { ...prev };
      if (!resolution) {
        delete next[playedTeam];
      } else {
        next[playedTeam] = resolution;
      }
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.readyPayloads.length === 0) return;
    setImporting(true);
    setImportResult(null);

    const res = await importPlayerSeasonStatsCsvAction({
      seasonId: selectedSeasonId || null,
      seasonName: targetSeasonName.trim() || DEFAULT_TARGET_CSV_SEASON,
      defaultLeagueName: defaultLeagueName.trim() || DEFAULT_TARGET_LEAGUE_NAME,
      records: preview.readyPayloads.map(p => ({
        lineNumber: p.lineNumber,
        eaId: p.eaId,
        player_id: p.player_id,
        team_id: p.team_id,
        team_name: p.team_name,
        league_name: p.league_name,
        matches_played: p.matches_played,
        goals: p.goals,
        assists: p.assists,
        rating_avg: p.rating_avg
      }))
    });

    setImporting(false);
    setImportResult(res);

    if (res.insertedCount > 0) {
      onSuccessRefresh();
    }
  };

  const filteredProfilesForPicker = (() => {
    const q = playerPickerSearch.trim().toLowerCase();
    if (!q) return profiles.slice(0, 150);
    return profiles
      .filter(
        p =>
          p.username.toLowerCase().includes(q) ||
          (p.current_ea_player_id && p.current_ea_player_id.toLowerCase().includes(q)) ||
          (p.full_name && p.full_name.toLowerCase().includes(q))
      )
      .slice(0, 150);
  })();

  const filteredRows = (() => {
    if (!preview) return [];
    return preview.rows.filter(r => {
      if (activeFilter === 'READY' && r.status !== 'READY') return false;
      if (activeFilter === 'NOT_IMPORTED' && r.status === 'READY') return false;
      if (
        activeFilter !== 'ALL' &&
        activeFilter !== 'READY' &&
        activeFilter !== 'NOT_IMPORTED' &&
        r.status !== activeFilter
      ) {
        return false;
      }

      if (rowSearch.trim()) {
        const q = rowSearch.trim().toLowerCase();
        const mEa = r.eaId.toLowerCase().includes(q);
        const mUser = r.resolvedPlayerUsername?.toLowerCase().includes(q) || false;
        const mTeam = r.playedTeam.toLowerCase().includes(q);
        const mCurTeam = r.currentTeam.toLowerCase().includes(q);
        if (!mEa && !mUser && !mTeam && !mCurTeam) return false;
      }
      return true;
    });
  })();

  const renderStatusBadge = (status: CsvRowImportStatus) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Check className="w-3 h-3" /> İçe Aktarılacak
          </span>
        );
      case 'NEEDS_PLAYER_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Oyuncu Eşleşmesi Bekliyor
          </span>
        );
      case 'NEEDS_TEAM_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-orange-500/15 text-orange-400 border border-orange-500/30">
            Takım Eşleşmesi Bekliyor
          </span>
        );
      case 'INVALID_STATS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/15 text-red-400 border border-red-500/30">
            Hatalı / Eksik İstatistik
          </span>
        );
      case 'DUPLICATE_IN_CSV':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
            CSV İçi Mükerrer
          </span>
        );
      case 'EXISTING_IN_DB':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Sitede Mevcut (Atlanacak)
          </span>
        );
      case 'EXCLUDED_SEASON':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-zinc-800 text-zinc-400 border border-white/10">
            Sezon Kapsam Dışı
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <div className="card-surface w-full max-w-6xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[94vh] flex flex-col bg-[#060d18]">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-[#0a1628] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">
                TAKIM BAZLI SEZON İSTATİSTİKLERİ CSV İÇE AKTARMA
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Her CSV satırı oyuncunun <span className="text-[#00e5ff] font-bold">Oynadığı Takım</span> bazındaki sezon istatistiği olarak ayrı kaydedilir. Güncel takım üyelikleri değiştirilmez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Step 1: Upload & Target Season Config */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#0a1628]/80 p-4 rounded-xl border border-white/5">
            <div className="lg:col-span-5">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                1. CSV Dosyası Seçin (.csv) *
              </label>
              <label className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#060d18] border border-dashed border-[#00e5ff]/40 hover:border-[#00e5ff] cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Upload className="w-4 h-4 text-[#00e5ff] shrink-0" />
                  <span className="text-xs font-bold text-white truncate">
                    {fileName || 'oyuncu_istatistikleri_takim_sezon.csv yükle...'}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-[#00e5ff]/15 text-[#00e5ff] shrink-0">
                  Dosya Seç
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-zinc-500 mt-1">
                Beklenen sütunlar: <code className="text-zinc-300">EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating</code>
              </p>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                2. Veritabanı Sezon Kaydı (ID)
              </label>
              <select
                value={selectedSeasonId}
                onChange={e => handleSeasonSelectChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
              >
                <option value="">-- Sezon Seçin --</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.slug})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">
                Yalnızca <code className="text-amber-400">{DEFAULT_TARGET_CSV_SEASON}</code> satırları alınır.
              </p>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                Kariyer Sezon Etiketi *
              </label>
              <input
                type="text"
                value={targetSeasonName}
                onChange={e => setTargetSeasonName(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2.5 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                Varsayılan Lig Adı *
              </label>
              <input
                type="text"
                value={defaultLeagueName}
                onChange={e => setDefaultLeagueName(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2.5 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>
          </div>

          {/* Import Result Feedback Banner */}
          {importResult && (
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                importResult.error
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {importResult.error ? (
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <div className="font-black text-sm">
                    {importResult.error || importResult.success}
                  </div>
                  <div className="flex flex-wrap gap-4 text-[11px] font-bold">
                    <span className="text-emerald-400">
                      Başarıyla Eklenen Kayıt: {importResult.insertedCount}
                    </span>
                    <span className="text-purple-300">
                      Mevcut Olduğu İçin Atlanan: {importResult.skippedExistingCount}
                    </span>
                    <span className="text-red-400">
                      Hatalı / Başarısız Satır: {importResult.failedCount}
                    </span>
                  </div>
                </div>
              </div>

              {importResult.rowErrors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 text-[11px] space-y-1 max-h-32 overflow-y-auto">
                  <div className="font-black uppercase text-red-400">Hatalı Satır Detayları:</div>
                  {importResult.rowErrors.map((err, idx) => (
                    <div key={idx} className="text-red-300">
                      • Satır {err.lineNumber} ({err.eaId} — {err.teamName}): {err.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Header Validation Error */}
          {preview && !preview.headerValid && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase text-red-400">CSV Başlık / Format Hatası</h4>
                <p className="text-xs mt-1">{preview.headerError}</p>
              </div>
            </div>
          )}

          {/* Preview Summary & Controls */}
          {preview && preview.headerValid && (
            <>
              {/* 10-Metric Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">Toplam CSV Satırı</div>
                  <div className="text-lg font-black text-white mt-0.5">{preview.totalCsvRows}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {preview.uniqueEaIdsAll} benzersiz EA ID
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-[#00e5ff]/20">
                  <div className="text-[10px] font-bold text-[#00e5ff] uppercase">Sezon 5 Kapsamında</div>
                  <div className="text-lg font-black text-[#00e5ff] mt-0.5">{preview.includedSeasonRows}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {preview.teamBasedRecordCount} takım bazlı kayıt ({preview.multiTeamPlayersCount} çoklu takım)
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Kapsam Dışı Satır</div>
                  <div className="text-lg font-black text-zinc-300 mt-0.5">{preview.excludedSeasonRows}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate" title={Object.entries(preview.excludedReasonsBreakdown).map(([k, v]) => `${k}: ${v}`).join(' | ')}>
                    {Object.entries(preview.excludedReasonsBreakdown).map(([k, v]) => `${k} (${v})`).join(', ') || 'Yok'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Sezon 5 Oyuncu Eşleşme</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    {preview.matchedPlayersCount} / {preview.uniqueEaIdsInScope}
                  </div>
                  <div className="text-[10px] text-amber-400 mt-0.5">
                    {preview.unmatchedPlayersCount} eşleşmeyen, {preview.ambiguousPlayersCount} belirsiz
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Doğrulama & Çakışma</div>
                  <div className="text-xs font-bold text-zinc-300 mt-1 space-y-0.5">
                    <div className={preview.unrecognizedTeamsCount > 0 ? 'text-orange-400' : 'text-zinc-500'}>
                      • Tanınmayan Takım: {preview.unrecognizedTeamsCount}
                    </div>
                    <div className={preview.invalidStatRowsCount > 0 ? 'text-red-400' : 'text-zinc-500'}>
                      • Hatalı İstatistik: {preview.invalidStatRowsCount}
                    </div>
                    <div className={preview.duplicateCsvRowsCount > 0 ? 'text-rose-400' : 'text-zinc-500'}>
                      • CSV Mükerrer: {preview.duplicateCsvRowsCount}
                    </div>
                    <div className={preview.existingDbCollisionsCount > 0 ? 'text-purple-300' : 'text-zinc-500'}>
                      • DB Çakışması: {preview.existingDbCollisionsCount}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-[10px] font-black text-emerald-400 uppercase">İçe Aktarılmaya Hazır</div>
                  <div className="text-2xl font-black text-emerald-400 mt-0.5">{preview.readyToImportCount}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {preview.skippedOrBlockedCount} satır aktarılmayacak
                  </div>
                </div>
              </div>

              {/* Manual Resolution Panel A: Unmatched or Ambiguous EA IDs */}
              {preview.unmatchedOrAmbiguousPlayerGroups.length > 0 && (
                <div className="p-4 rounded-xl bg-[#0a1628] border border-amber-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        EA ID — Oyuncu Profili Manuel Eşleştirme / Onay ({preview.unmatchedOrAmbiguousPlayerGroups.length} EA ID)
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Eşleşmeyen veya büyük/küçük harf / çoklu aday belirsizliği bulunan EA ID&apos;leri mevcut bir oyuncu profiline bağlayabilirsiniz. Bağlanan profil o EA ID&apos;nin tüm takım satırlarına uygulanır.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64 shrink-0">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={playerPickerSearch}
                        onChange={e => setPlayerPickerSearch(e.target.value)}
                        placeholder="Menüde profil ara (@kullanıcı)..."
                        className="w-full pl-8 pr-3 py-1.5 bg-[#060d18] border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5ff]"
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {preview.unmatchedOrAmbiguousPlayerGroups.map(group => (
                      <div
                        key={group.eaId}
                        className="p-2.5 rounded-lg bg-[#060d18] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-2.5"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black font-mono text-white">{group.eaId}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-zinc-300">
                              {group.rowCount} Takım Kaydı: {group.playedTeams.join(', ')}
                            </span>
                            {group.matchStatus === 'AMBIGUOUS' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                BELİRSİZ / HARF FARKI
                              </span>
                            )}
                            {group.matchStatus === 'MANUAL_LINKED' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                MANUEL BAĞLANDI: @{group.resolvedPlayerUsername}
                              </span>
                            )}
                          </div>
                          {group.ambiguityReason && (
                            <p className="text-[11px] text-amber-300/90">{group.ambiguityReason}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Quick candidate confirm buttons if AMBIGUOUS */}
                          {group.candidateProfiles.map(cand => (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => handleSetManualPlayer(group.eaId, cand.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                group.resolvedPlayerId === cand.id
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/30'
                              }`}
                            >
                              Onayla: @{cand.username} ({cand.current_ea_player_id})
                            </button>
                          ))}

                          <select
                            value={manualPlayerOverrides[group.eaId] || ''}
                            onChange={e => handleSetManualPlayer(group.eaId, e.target.value)}
                            className="px-2.5 py-1.5 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#00e5ff] max-w-[240px]"
                          >
                            <option value="">-- Mevcut Profile Bağla --</option>
                            {filteredProfilesForPicker.map(p => (
                              <option key={p.id} value={p.id}>
                                @{p.username} {p.current_ea_player_id ? `(EA: ${p.current_ea_player_id})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Resolution Panel B: Unrecognized Teams */}
              {preview.unrecognizedTeamGroups.length > 0 && (
                <div className="p-4 rounded-xl bg-[#0a1628] border border-orange-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Tanınmayan &quot;Oynadığı Takım&quot; Adları ({preview.unrecognizedTeamGroups.length} Takım)
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Sistemdeki mevcut takımlarla birebir eşleşmeyen takım adlarını bir sistem takımına bağlayabilir veya eski/tarihsel takım olarak onaylayabilirsiniz.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, ManualTeamResolution> = { ...manualTeamOverrides };
                        for (const tg of preview.unrecognizedTeamGroups) {
                          if (!next[tg.playedTeam]) {
                            next[tg.playedTeam] = { mode: 'CUSTOM', customName: tg.playedTeam };
                          }
                        }
                        setManualTeamOverrides(next);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 text-[11px] font-black uppercase tracking-wider shrink-0"
                    >
                      Tümünü Tarihsel / Özel Takım Olarak Onayla
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {preview.unrecognizedTeamGroups.map(tg => {
                      const currentOverride = manualTeamOverrides[tg.playedTeam];
                      return (
                        <div
                          key={tg.playedTeam}
                          className="p-2.5 rounded-lg bg-[#060d18] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-white">{tg.playedTeam}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-zinc-400">
                              {tg.rowCount} satır
                            </span>
                            {tg.matchStatus === 'MANUAL_CUSTOM' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                TARİHSEL TAKIM OLARAK ONAYLANDI
                              </span>
                            )}
                            {tg.matchStatus === 'MANUAL_EXISTING' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                SİSTEM TAKIMINA BAĞLANDI: {tg.resolvedTeamName}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSetManualTeam(
                                  tg.playedTeam,
                                  currentOverride?.mode === 'CUSTOM'
                                    ? null
                                    : { mode: 'CUSTOM', customName: tg.playedTeam }
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                currentOverride?.mode === 'CUSTOM'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10'
                              }`}
                            >
                              Tarihsel Takım Olarak Kaydet
                            </button>

                            <select
                              value={currentOverride?.mode === 'EXISTING' ? currentOverride.teamId : ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (!val) handleSetManualTeam(tg.playedTeam, null);
                                else handleSetManualTeam(tg.playedTeam, { mode: 'EXISTING', teamId: val });
                              }}
                              className="px-2.5 py-1 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#00e5ff]"
                            >
                              <option value="">-- Sistem Takımı Seç --</option>
                              {teams.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name} {!t.is_active ? '(Pasif)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview Table Filter Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-zinc-500 mr-1" />
                  {(
                    [
                      ['ALL', `Tümü (${preview.rows.length})`],
                      ['READY', `İçe Aktarılacak (${preview.readyToImportCount})`],
                      ['NOT_IMPORTED', `Aktarılmayacak (${preview.skippedOrBlockedCount})`],
                      ['NEEDS_PLAYER_MATCH', `Oyuncu Bekleyen (${preview.rows.filter(r => r.status === 'NEEDS_PLAYER_MATCH').length})`],
                      ['NEEDS_TEAM_MATCH', `Takım Bekleyen (${preview.rows.filter(r => r.status === 'NEEDS_TEAM_MATCH').length})`],
                      ['INVALID_STATS', `Hatalı İstatistik (${preview.invalidStatRowsCount})`],
                      ['EXISTING_IN_DB', `DB Çakışması (${preview.existingDbCollisionsCount})`],
                      ['DUPLICATE_IN_CSV', `CSV Mükerrer (${preview.duplicateCsvRowsCount})`],
                      ['EXCLUDED_SEASON', `Kapsam Dışı Sezon (${preview.excludedSeasonRows})`]
                    ] as [PreviewTabFilter, string][]
                  ).map(([tabKey, label]) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setActiveFilter(tabKey)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border ${
                        activeFilter === tabKey
                          ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40'
                          : 'bg-[#0a1628] text-zinc-400 border-white/5 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full md:w-64 shrink-0">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rowSearch}
                    onChange={e => setRowSearch(e.target.value)}
                    placeholder="EA ID, oyuncu veya takım ara..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              {/* Detailed Preview Rows Table */}
              <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0a1628]/60">
                <div className="overflow-x-auto max-h-[340px] custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#060d18] border-b border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">EA ID</th>
                        <th className="p-2.5">Eşleşen Profil</th>
                        <th className="p-2.5">Oynadığı Takım (Kayıt Takımı)</th>
                        <th className="p-2.5">CSV Sezon</th>
                        <th className="p-2.5 text-center">Maç</th>
                        <th className="p-2.5 text-center">Gol</th>
                        <th className="p-2.5 text-center">Asist</th>
                        <th className="p-2.5 text-center">Ort. Rating</th>
                        <th className="p-2.5">Durum & Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-zinc-500 font-mono">
                            Seçili filtreye uygun satır bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.slice(0, 300).map(row => (
                          <tr key={row.lineNumber} className="hover:bg-white/[0.02]">
                            <td className="p-2.5 font-mono text-zinc-500">{row.lineNumber}</td>
                            <td className="p-2.5 font-mono font-bold text-white">{row.eaId || '-'}</td>
                            <td className="p-2.5">
                              {row.resolvedPlayerUsername ? (
                                <span className="font-bold text-emerald-400">@{row.resolvedPlayerUsername}</span>
                              ) : (
                                <span className="text-zinc-500 italic">Eşleşmedi</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <div className="font-bold text-white">
                                {row.resolvedTeamName || row.playedTeam || '-'}
                              </div>
                              {row.currentTeam && row.currentTeam !== row.playedTeam && (
                                <div className="text-[10px] text-zinc-500">
                                  CSV Güncel Takım (Yoksayılır): {row.currentTeam}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-zinc-300">{row.csvSeason || '-'}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-white">
                              {row.matchesPlayed ?? '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                              {row.goals ?? '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-cyan-400">
                              {row.assists ?? '-'}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-amber-300">
                              {row.ratingAvg !== null ? row.ratingAvg.toFixed(2) : '-'}
                            </td>
                            <td className="p-2.5 space-y-1">
                              <div>{renderStatusBadge(row.status)}</div>
                              <div className="text-[11px] text-zinc-400">
                                {row.statusReasons.join(' ')}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length > 300 && (
                  <div className="p-2 text-center text-[11px] text-zinc-500 bg-[#060d18] border-t border-white/5">
                    Performans için ilk 300 satır gösteriliyor (Toplam filtrelenen: {filteredRows.length} satır). Arama kutusunu kullanarak daraltabilirsiniz.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/5 bg-[#0a1628] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-400">
            {preview && preview.headerValid ? (
              <span>
                Onaylandığında yalnızca <strong className="text-emerald-400">{preview.readyToImportCount}</strong> adet doğrulanmış takım bazlı kayıt eklenecektir. Mevcut kayıtların üzerine yazılmaz.
              </span>
            ) : (
              <span>Ön izleme ve doğrulama için bir CSV dosyası yükleyin.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs rounded-lg transition-colors"
            >
              Kapat
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || !preview || !preview.headerValid || preview.readyToImportCount === 0}
              className="px-5 py-2.5 bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#060d18] font-black text-xs rounded-lg transition-all flex items-center gap-2 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#00e5ff]/10"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  İÇE AKTARILIYOR...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  ONAYLA VE İÇE AKTAR ({preview?.readyToImportCount || 0} KAYIT)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
