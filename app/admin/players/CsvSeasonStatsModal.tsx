'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  ShieldAlert,
  X,
  Loader2,
  Search,
  UserCheck,
  Shield,
  Filter,
  Check,
  RefreshCw,
  ChevronDown,
  RotateCcw,
  Archive
} from 'lucide-react';
import {
  evaluateSeasonStatsCsv,
  foldCase,
  DEFAULT_TARGET_CSV_SEASON,
  DEFAULT_TARGET_LEAGUE_NAME,
  ImporterProfileRef,
  ImporterTeamRef,
  ImporterLeagueTeamRef,
  ImporterExistingLegacyStatRef,
  ManualTeamResolution,
  CsvRowImportStatus,
  PersistentTeamMapping,
  evaluateRememberedTeamMappings,
  filterPendingPlayerGroups
} from '@/lib/csv/season-stats-importer';
import {
  importPlayerSeasonStatsCsvAction,
  getPersistentCsvTeamMappingsAction,
  savePersistentCsvTeamMappingsAction,
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
  | 'NEEDS_PLAYER_MATCH'
  | 'NEEDS_TEAM_MATCH'
  | 'INVALID_STATS'
  | 'SKIPPED';

type SkippedSubFilter =
  | 'ALL_SKIPPED'
  | 'EXISTING_IN_DB'
  | 'DUPLICATE_IN_CSV'
  | 'EXCLUDED_SEASON';

interface PlayerProfileComboboxProps {
  eaId: string;
  profiles: ImporterProfileRef[];
  candidateProfiles: ImporterProfileRef[];
  selectedProfileId: string | null;
  usedByOtherEaIdMap: Map<string, string>;
  onSelect: (profileId: string) => void;
}

function PlayerProfileCombobox({
  eaId,
  profiles,
  candidateProfiles,
  selectedProfileId,
  usedByOtherEaIdMap,
  onSelect
}: PlayerProfileComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProfile = useMemo(
    () => (selectedProfileId ? profiles.find(p => p.id === selectedProfileId) || null : null),
    [profiles, selectedProfileId]
  );

  const candidateIds = useMemo(
    () => new Set(candidateProfiles.map(c => c.id)),
    [candidateProfiles]
  );

  const filteredProfiles = useMemo(() => {
    const q = foldCase(query);
    const matched = !q
      ? profiles
      : profiles.filter(p => {
          const u = foldCase(p.username || '');
          const ea = p.current_ea_player_id ? foldCase(p.current_ea_player_id) : '';
          const full = p.full_name ? foldCase(p.full_name) : '';
          return u.includes(q) || ea.includes(q) || full.includes(q);
        });

    const sorted = [...matched].sort((a, b) => {
      const aCand = candidateIds.has(a.id) ? 1 : 0;
      const bCand = candidateIds.has(b.id) ? 1 : 0;
      if (aCand !== bCand) return bCand - aCand;

      if (q) {
        const aEa = a.current_ea_player_id ? foldCase(a.current_ea_player_id) : '';
        const bEa = b.current_ea_player_id ? foldCase(b.current_ea_player_id) : '';
        const aUser = foldCase(a.username || '');
        const bUser = foldCase(b.username || '');

        const aExact = aEa === q || aUser === q ? 1 : 0;
        const bExact = bEa === q || bUser === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        const aStarts = aEa.startsWith(q) || aUser.startsWith(q) ? 1 : 0;
        const bStarts = bEa.startsWith(q) || bUser.startsWith(q) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
      }

      return a.username.localeCompare(b.username, 'tr');
    });

    return {
      totalMatched: sorted.length,
      items: sorted.slice(0, 60)
    };
  }, [profiles, query, candidateIds]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlightedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleChoose = (profileId: string) => {
    onSelect(profileId);
    setIsOpen(false);
    setIsEditing(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = filteredProfiles.items;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (items.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % items.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (items.length > 0) {
        setHighlightedIndex(prev => (prev - 1 + items.length) % items.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && items[highlightedIndex]) {
        handleChoose(items[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsEditing(false);
    }
  };

  if (selectedProfile && !isEditing) {
    const duplicateOtherEa = usedByOtherEaIdMap.get(selectedProfile.id);
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
            duplicateOtherEa
              ? 'bg-red-500/15 border-red-500/40 text-red-200'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="font-black text-white">@{selectedProfile.username}</span>
            {selectedProfile.full_name && (
              <span className="text-zinc-300 ml-1.5">({selectedProfile.full_name})</span>
            )}
            <span className="text-[10px] font-mono text-zinc-300 ml-2">
              EA ID: {selectedProfile.current_ea_player_id || 'Tanımsız'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-zinc-200 transition-colors"
        >
          Değiştir
        </button>
        <button
          type="button"
          onClick={() => onSelect('')}
          title="Eşleştirmeyi kaldır"
          className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-zinc-400 hover:text-red-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-80">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-label={`${eaId} için oyuncu profili ara`}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="EA ID, @kullanıcı veya profil adı yazın..."
          className="w-full pl-8 pr-8 py-1.5 bg-[#0a1628] border border-white/15 focus:border-[#00e5ff] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>

      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute right-0 left-0 mt-1 z-30 max-h-60 overflow-y-auto rounded-xl bg-[#071120] border border-[#00e5ff]/30 shadow-2xl divide-y divide-white/5 custom-scrollbar"
        >
          {filteredProfiles.items.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-400">
              &ldquo;{query}&rdquo; ile eşleşen oyuncu profili bulunamadı.
            </div>
          ) : (
            <>
              {filteredProfiles.items.map((prof, idx) => {
                const isCandidate = candidateIds.has(prof.id);
                const otherEa = usedByOtherEaIdMap.get(prof.id);
                const isInactive = prof.status && prof.status !== 'ACTIVE';
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={prof.id}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    data-idx={idx}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleChoose(prof.id)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      isHighlighted ? 'bg-[#00e5ff]/15 text-white' : 'hover:bg-white/5 text-zinc-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-white truncate">
                          @{prof.username}
                        </span>
                        {prof.full_name && (
                          <span className="text-[11px] text-zinc-400 truncate">
                            ({prof.full_name})
                          </span>
                        )}
                        {isCandidate && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Benzer Aday
                          </span>
                        )}
                        {isInactive && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                            {prof.status}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                        Mevcut EA ID:{' '}
                        <span className="text-cyan-300 font-bold">
                          {prof.current_ea_player_id || 'Tanımsız'}
                        </span>
                        {otherEa && (
                          <span className="text-red-400 ml-2 font-sans font-bold">
                            • &ldquo;{otherEa}&rdquo; için seçili
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-[#00e5ff] shrink-0">Seç</span>
                  </button>
                );
              })}
              {filteredProfiles.totalMatched > filteredProfiles.items.length && (
                <div className="px-3 py-1.5 text-[10px] text-center text-zinc-400 bg-[#050a14]">
                  {filteredProfiles.totalMatched} sonuçtan ilk {filteredProfiles.items.length} tanesi gösteriliyor. Aramayı daraltabilirsiniz.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface SystemTeamComboboxProps {
  playedTeam: string;
  teams: ImporterTeamRef[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
}

function SystemTeamCombobox({
  playedTeam,
  teams,
  selectedTeamId,
  onSelectTeam
}: SystemTeamComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedTeam = useMemo(
    () => (selectedTeamId ? teams.find(t => t.id === selectedTeamId) || null : null),
    [teams, selectedTeamId]
  );

  const filteredTeams = useMemo(() => {
    const q = foldCase(query);
    if (!q) return teams;
    return teams.filter(t => foldCase(t.name).includes(q));
  }, [teams, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleChoose = (teamId: string) => {
    onSelectTeam(teamId);
    setIsOpen(false);
    setIsEditing(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (filteredTeams.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % filteredTeams.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (filteredTeams.length > 0) {
        setHighlightedIndex(prev => (prev - 1 + filteredTeams.length) % filteredTeams.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && filteredTeams[highlightedIndex]) {
        handleChoose(filteredTeams[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsEditing(false);
    }
  };

  if (selectedTeam && !isEditing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-200">
          <Check className="w-3.5 h-3.5 text-cyan-400" />
          Sistem Takımı: <strong className="text-white">{selectedTeam.name}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-zinc-200"
        >
          Değiştir
        </button>
        <button
          type="button"
          onClick={() => onSelectTeam(null)}
          title="Sistem takımı seçimini kaldır"
          className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-zinc-400 hover:text-red-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-64">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-label={`${playedTeam} için sistem takımı ara`}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Sistem takımı ara..."
          className="w-full pl-8 pr-7 py-1.5 bg-[#0a1628] border border-white/15 focus:border-[#00e5ff] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none"
        />
        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 left-0 mt-1 z-30 max-h-52 overflow-y-auto rounded-xl bg-[#071120] border border-[#00e5ff]/30 shadow-2xl divide-y divide-white/5 custom-scrollbar"
        >
          {filteredTeams.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-400">
              &ldquo;{query}&rdquo; ile eşleşen sistem takımı bulunamadı.
            </div>
          ) : (
            filteredTeams.map((team, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleChoose(team.id)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                    isHighlighted ? 'bg-[#00e5ff]/15 text-white' : 'hover:bg-white/5 text-zinc-200'
                  }`}
                >
                  <span className="font-bold truncate">{team.name}</span>
                  <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                    {team.is_active === false ? 'Pasif' : 'Sistem Takımı'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const SAVED_TEAM_MAPPINGS_STORAGE_KEY = 'teta_csv_saved_team_mappings_v1';

function loadSavedTeamMappingsFromStorage(): PersistentTeamMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_TEAM_MAPPINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveTeamMappingsToStorage(mappings: PersistentTeamMapping[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_TEAM_MAPPINGS_STORAGE_KEY, JSON.stringify(mappings));
  } catch (err) {
    console.error('Failed to save team mappings to localStorage', err);
  }
}

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
  const [savedTeamMappings, setSavedTeamMappings] = useState<PersistentTeamMapping[]>([]);

  const [activeFilter, setActiveFilter] = useState<PreviewTabFilter>('ALL');
  const [skippedSubFilter, setSkippedSubFilter] = useState<SkippedSubFilter>('ALL_SKIPPED');
  const [rowSearch, setRowSearch] = useState<string>('');
  const [pendingPlayerSearch, setPendingPlayerSearch] = useState<string>('');
  const [showAllPendingPlayers, setShowAllPendingPlayers] = useState<boolean>(false);
  const [showAllPendingTeams, setShowAllPendingTeams] = useState<boolean>(false);

  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<CsvImportBatchResponse | null>(null);

  // Load saved team mappings on mount (localStorage + server DB)
  useEffect(() => {
    const localMappings = loadSavedTeamMappingsFromStorage();
    if (localMappings.length > 0) {
      setSavedTeamMappings(localMappings);
    }

    getPersistentCsvTeamMappingsAction().then(res => {
      if (res.mappings && res.mappings.length > 0) {
        setSavedTeamMappings(prev => {
          const map = new Map<string, PersistentTeamMapping>();
          for (const m of prev) map.set(foldCase(m.sourceTeamName), m);
          for (const m of res.mappings) map.set(foldCase(m.sourceTeamName), m);
          const merged = Array.from(map.values());
          saveTeamMappingsToStorage(merged);
          return merged;
        });
      }
    });
  }, []);

  const rememberedTeamEvaluations = useMemo(
    () => evaluateRememberedTeamMappings(savedTeamMappings, teams),
    [savedTeamMappings, teams]
  );

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
    setPendingPlayerSearch('');
    setActiveFilter('ALL');
    setSkippedSubFilter('ALL_SKIPPED');

    const text = await file.text();
    setCsvContent(text);

    // Auto-apply only VALID, non-conflicting remembered team mappings
    if (savedTeamMappings.length > 0) {
      const evaluations = evaluateRememberedTeamMappings(savedTeamMappings, teams);
      const initialOverrides: Record<string, ManualTeamResolution> = {};
      for (const [sourceTeam, ev] of evaluations.entries()) {
        if (ev.status === 'VALID' && ev.resolvedResolution) {
          initialOverrides[sourceTeam] = ev.resolvedResolution;
        }
      }
      setManualTeamOverrides(initialOverrides);
    } else {
      setManualTeamOverrides({});
    }
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

    if (resolution) {
      const targetName =
        resolution.mode === 'EXISTING'
          ? teams.find(t => t.id === resolution.teamId)?.name || playedTeam
          : resolution.customName || playedTeam;

      const newMapping: PersistentTeamMapping = {
        sourceTeamName: playedTeam,
        mode: resolution.mode,
        targetTeamId: resolution.mode === 'EXISTING' ? resolution.teamId : null,
        targetTeamName: targetName,
        updatedAt: new Date().toISOString()
      };

      setSavedTeamMappings(prev => {
        const filtered = prev.filter(m => foldCase(m.sourceTeamName) !== foldCase(playedTeam));
        const updated = [...filtered, newMapping];
        saveTeamMappingsToStorage(updated);
        savePersistentCsvTeamMappingsAction([newMapping]).catch(() => {});
        return updated;
      });
    }
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

  // Breakdown counts for summary cards and filters
  const needsPlayerMatchRowsCount = preview
    ? preview.rows.filter(r => r.status === 'NEEDS_PLAYER_MATCH').length
    : 0;
  const needsTeamMatchRowsCount = preview
    ? preview.rows.filter(r => r.status === 'NEEDS_TEAM_MATCH').length
    : 0;
  const skippedRowsCount = preview
    ? preview.excludedSeasonRows + preview.existingDbCollisionsCount + preview.duplicateCsvRowsCount
    : 0;
  const errorAndActionRowsCount = preview
    ? preview.invalidStatRowsCount + needsPlayerMatchRowsCount + needsTeamMatchRowsCount
    : 0;

  // Separate pending vs completed manual resolutions
  const pendingPlayerGroups = preview
    ? preview.unmatchedOrAmbiguousPlayerGroups.filter(g => g.matchStatus !== 'MANUAL_LINKED')
    : [];
  const completedPlayerGroups = preview
    ? preview.unmatchedOrAmbiguousPlayerGroups.filter(g => g.matchStatus === 'MANUAL_LINKED')
    : [];

  const filteredPendingPlayerGroups = useMemo(() => {
    return filterPendingPlayerGroups(pendingPlayerGroups, pendingPlayerSearch);
  }, [pendingPlayerGroups, pendingPlayerSearch]);

  const pendingTeamGroups = preview
    ? preview.unrecognizedTeamGroups.filter(g => g.matchStatus === 'UNRECOGNIZED')
    : [];
  const completedTeamGroups = preview
    ? preview.unrecognizedTeamGroups.filter(g => g.matchStatus !== 'UNRECOGNIZED')
    : [];

  const validRememberedTeamCount = useMemo(() => {
    return pendingTeamGroups.filter(tg => {
      const rem = rememberedTeamEvaluations.get(tg.playedTeam);
      return rem && rem.status === 'VALID' && rem.resolvedResolution !== null;
    }).length;
  }, [pendingTeamGroups, rememberedTeamEvaluations]);

  const filteredRows = (() => {
    if (!preview) return [];
    return preview.rows.filter(r => {
      if (activeFilter === 'READY' && r.status !== 'READY') return false;
      if (activeFilter === 'NEEDS_PLAYER_MATCH' && r.status !== 'NEEDS_PLAYER_MATCH') return false;
      if (activeFilter === 'NEEDS_TEAM_MATCH' && r.status !== 'NEEDS_TEAM_MATCH') return false;
      if (activeFilter === 'INVALID_STATS' && r.status !== 'INVALID_STATS') return false;
      if (activeFilter === 'SKIPPED') {
        const isSkippedStatus =
          r.status === 'EXISTING_IN_DB' ||
          r.status === 'DUPLICATE_IN_CSV' ||
          r.status === 'EXCLUDED_SEASON';
        if (!isSkippedStatus) return false;
        if (skippedSubFilter !== 'ALL_SKIPPED' && r.status !== skippedSubFilter) return false;
      }

      if (rowSearch.trim()) {
        const q = foldCase(rowSearch);
        const mEa = foldCase(r.eaId).includes(q);
        const mUser = r.resolvedPlayerUsername ? foldCase(r.resolvedPlayerUsername).includes(q) : false;
        const mTeam = foldCase(r.playedTeam).includes(q);
        const mResolvedTeam = r.resolvedTeamName ? foldCase(r.resolvedTeamName).includes(q) : false;
        if (!mEa && !mUser && !mTeam && !mResolvedTeam) return false;
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
            Oyuncu Eşleştirmesi Gerekli
          </span>
        );
      case 'NEEDS_TEAM_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-orange-500/15 text-orange-400 border border-orange-500/30">
            Takım Eşleştirmesi Gerekli
          </span>
        );
      case 'INVALID_STATS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/15 text-red-400 border border-red-500/30">
            Hatalı İstatistik
          </span>
        );
      case 'DUPLICATE_IN_CSV':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-500/15 text-rose-300 border border-rose-500/30">
            Atlanacak (CSV Mükerrer)
          </span>
        );
      case 'EXISTING_IN_DB':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Atlanacak (Sitede Mevcut)
          </span>
        );
      case 'EXCLUDED_SEASON':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-zinc-800 text-zinc-400 border border-white/10">
            Atlanacak (Sezon Dışı)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md">
      <div className="card-surface w-full max-w-6xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[94vh] flex flex-col bg-[#060d18]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a1628] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider truncate">
                Sezon İstatistikleri CSV İçe Aktarma
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                İstatistikler <span className="text-[#00e5ff] font-bold">Oynadığı Takım</span> bazında kaydedilir; güncel takım üyelikleri ve transferler değiştirilmez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* File Upload & Target Season Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-[#0a1628]/80 p-3.5 rounded-xl border border-white/5">
            <div className="lg:col-span-5">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                CSV Dosyası (.csv) *
              </label>
              <label className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#060d18] border border-dashed border-[#00e5ff]/40 hover:border-[#00e5ff] cursor-pointer transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Upload className="w-4 h-4 text-[#00e5ff] shrink-0" />
                  <span className="text-xs font-bold text-white truncate">
                    {fileName || 'oyuncu_istatistikleri_takim_sezon.csv seçin...'}
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
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Sezon Eşleşmesi
              </label>
              <select
                value={selectedSeasonId}
                onChange={e => handleSeasonSelectChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
              >
                <option value="">-- Sezon Seçin --</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Sezon Etiketi *
              </label>
              <input
                type="text"
                value={targetSeasonName}
                onChange={e => setTargetSeasonName(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Varsayılan Lig *
              </label>
              <input
                type="text"
                value={defaultLeagueName}
                onChange={e => setDefaultLeagueName(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2 bg-[#060d18] border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]"
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
                      Eklenen Kayıt: {importResult.insertedCount}
                    </span>
                    <span className="text-purple-300">
                      Mevcut Olduğu İçin Atlanan: {importResult.skippedExistingCount}
                    </span>
                    <span className="text-red-400">
                      Hatalı Satır: {importResult.failedCount}
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

          {/* Main Preview Content */}
          {preview && preview.headerValid && (
            <>
              {/* A. Üst Özet (5 Kart) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Toplam CSV Satırı</div>
                  <div className="text-xl font-black text-white mt-0.5">{preview.totalCsvRows}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {preview.uniqueEaIdsAll} benzersiz EA ID
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-[#00e5ff]/25">
                  <div className="text-[10px] font-bold text-[#00e5ff] uppercase">Sezon Kapsamındaki Satır</div>
                  <div className="text-xl font-black text-[#00e5ff] mt-0.5">{preview.includedSeasonRows}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {preview.uniqueEaIdsInScope} oyuncu • {preview.multiTeamPlayersCount} çoklu takım
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-[10px] font-black text-emerald-400 uppercase">İçe Aktarmaya Hazır Kayıt</div>
                  <div className="text-xl font-black text-emerald-400 mt-0.5">{preview.readyToImportCount}</div>
                  <div className="text-[11px] text-emerald-300/80 mt-0.5">
                    {preview.matchedPlayersCount} / {preview.uniqueEaIdsInScope} oyuncu eşleşti
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5">
                  <div className="text-[10px] font-bold text-zinc-300 uppercase">Atlanacak Kayıt</div>
                  <div className="text-xl font-black text-zinc-200 mt-0.5">{skippedRowsCount}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {preview.existingDbCollisionsCount} mevcut • {preview.duplicateCsvRowsCount} mükerrer • {preview.excludedSeasonRows} sezon dışı
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0a1628] border border-white/5 col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-bold text-amber-400 uppercase">Hatalı / Eşleşme Bekleyen</div>
                  <div className="text-xl font-black text-amber-300 mt-0.5">{errorAndActionRowsCount}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {preview.invalidStatRowsCount} hatalı istatistik • {needsPlayerMatchRowsCount + needsTeamMatchRowsCount} eşleşme bekliyor
                  </div>
                </div>
              </div>

              {/* B. Eşleştirme İşlemleri */}
              {(preview.unmatchedOrAmbiguousPlayerGroups.length > 0 ||
                preview.unrecognizedTeamGroups.length > 0) && (
                <div className="space-y-4">
                  {/* B1. EA ID -> Oyuncu Profili Manuel Eşleştirme */}
                  {preview.unmatchedOrAmbiguousPlayerGroups.length > 0 && (
                    <div className="p-4 rounded-xl bg-[#0a1628] border border-amber-500/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                            <UserCheck className="w-4 h-4" />
                            Oyuncu Profili Eşleştirmesi Gereken EA ID&apos;ler (
                            {pendingPlayerGroups.length} Bekleyen
                            {completedPlayerGroups.length > 0
                              ? `, ${completedPlayerGroups.length} Tamamlandı`
                              : ''}
                            )
                          </h4>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            EA ID, kullanıcı adı veya profil adı yazarak oyuncuyu arayın ve seçin. Seçilen profil o EA ID&apos;nin tüm takım satırlarına uygulanır.
                          </p>
                        </div>
                        {Object.keys(manualPlayerOverrides).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setManualPlayerOverrides({})}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-bold border border-white/10 shrink-0 self-start sm:self-auto"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Oyuncu Seçimlerini Sıfırla
                          </button>
                        )}
                      </div>

                      {/* Search Filter for Pending EA IDs */}
                      {pendingPlayerGroups.length > 0 && (
                        <div className="bg-[#060d18] p-2.5 rounded-xl border border-white/5 space-y-1.5">
                          <div className="relative flex items-center">
                            <Search className="w-4 h-4 text-[#00e5ff] absolute left-3 pointer-events-none" />
                            <input
                              type="text"
                              value={pendingPlayerSearch}
                              onChange={e => setPendingPlayerSearch(e.target.value)}
                              placeholder="Bekleyen EA ID veya Takım Adı Filtrele (örn: dorukzinboi, kadddoo, Gegi Esport)..."
                              className="w-full pl-9 pr-9 py-2 bg-[#0a1628] border border-white/10 rounded-lg text-xs font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5ff] transition-colors"
                            />
                            {pendingPlayerSearch && (
                              <button
                                type="button"
                                onClick={() => setPendingPlayerSearch('')}
                                className="absolute right-2.5 p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 transition-colors"
                                title="Aramayı Temizle"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {pendingPlayerSearch.trim() && (
                            <div className="flex items-center justify-between text-[11px] px-1 text-zinc-400">
                              <span>
                                Filtrelenen:{' '}
                                <span className="font-bold text-[#00e5ff]">{filteredPendingPlayerGroups.length}</span>{' '}
                                / {pendingPlayerGroups.length} bekleyen EA ID
                              </span>
                              {filteredPendingPlayerGroups.length === 0 ? (
                                <span className="text-amber-400 font-bold">Sonuç bulunamadı</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingPlayerSearch('')}
                                  className="text-zinc-400 hover:text-white underline text-[10px]"
                                >
                                  Filtreyi Temizle
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Player Matches First */}
                      {pendingPlayerGroups.length > 0 && (
                        <div className="space-y-2">
                          {pendingPlayerSearch.trim() && filteredPendingPlayerGroups.length === 0 ? (
                            <div className="p-6 rounded-xl bg-[#060d18] border border-white/5 text-center space-y-2">
                              <Search className="w-6 h-6 text-zinc-500 mx-auto" />
                              <div className="text-xs font-bold text-white">Sonuç Bulunamadı</div>
                              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                                &ldquo;<span className="text-amber-400 font-semibold">{pendingPlayerSearch}</span>&rdquo; ile eşleşen bekleyen EA ID veya takım kaydı bulunamadı.
                              </p>
                              <button
                                type="button"
                                onClick={() => setPendingPlayerSearch('')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-200 border border-white/10 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Aramayı Temizle ({pendingPlayerGroups.length} Bekleyen Kaydı Göster)
                              </button>
                            </div>
                          ) : (
                            <>
                              {(pendingPlayerSearch.trim()
                                ? (showAllPendingPlayers ? filteredPendingPlayerGroups : filteredPendingPlayerGroups.slice(0, 20))
                                : (showAllPendingPlayers ? pendingPlayerGroups : pendingPlayerGroups.slice(0, 10))
                              ).map(group => {
                                const usedByOtherEaIdMap = new Map<string, string>();
                                for (const [otherEa, profId] of Object.entries(manualPlayerOverrides)) {
                                  if (otherEa !== group.eaId && profId) {
                                    usedByOtherEaIdMap.set(profId, otherEa);
                                  }
                                }

                                return (
                                  <div
                                    key={group.eaId}
                                    className="p-3 rounded-xl bg-[#060d18] border border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                                  >
                                    <div className="space-y-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-black font-mono text-white">
                                          {group.eaId}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-zinc-300">
                                          {group.rowCount} kayıt ({group.playedTeams.join(', ')})
                                        </span>
                                        {group.matchStatus === 'AMBIGUOUS' ? (
                                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            Belirsiz / Harf Farkı Onayı Gerekli
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                                            Eşleşen Profil Bulunamadı
                                          </span>
                                        )}
                                      </div>
                                      {group.ambiguityReason && (
                                        <p className="text-[11px] text-amber-300/90">{group.ambiguityReason}</p>
                                      )}
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                                      {/* Quick one-click candidate confirmation if AMBIGUOUS */}
                                      {group.candidateProfiles.map(cand => (
                                        <button
                                          key={cand.id}
                                          type="button"
                                          onClick={() => handleSetManualPlayer(group.eaId, cand.id)}
                                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 transition-colors shrink-0"
                                        >
                                          Hızlı Onayla: @{cand.username} ({cand.current_ea_player_id})
                                        </button>
                                      ))}

                                      <PlayerProfileCombobox
                                        eaId={group.eaId}
                                        profiles={profiles}
                                        candidateProfiles={group.candidateProfiles}
                                        selectedProfileId={manualPlayerOverrides[group.eaId] || null}
                                        usedByOtherEaIdMap={usedByOtherEaIdMap}
                                        onSelect={profId => handleSetManualPlayer(group.eaId, profId)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}

                              {((pendingPlayerSearch.trim() ? filteredPendingPlayerGroups.length : pendingPlayerGroups.length) >
                                (pendingPlayerSearch.trim() ? 20 : 10)) && (
                                <div className="pt-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setShowAllPendingPlayers(prev => !prev)}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-300 transition-colors"
                                  >
                                    {showAllPendingPlayers
                                      ? 'Daha Az Göster'
                                      : `Tüm ${pendingPlayerSearch.trim() ? 'Filtrelenen' : 'Bekleyen'} EA ID'leri Göster (${
                                          pendingPlayerSearch.trim()
                                            ? filteredPendingPlayerGroups.length
                                            : pendingPlayerGroups.length
                                        })`}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Completed Player Matches (Compact View) */}
                      {completedPlayerGroups.length > 0 && (
                        <div className="pt-2 border-t border-white/5 space-y-1.5">
                          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                            Tamamlanan Oyuncu Eşleştirmeleri ({completedPlayerGroups.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {completedPlayerGroups.map(group => (
                              <div
                                key={group.eaId}
                                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs"
                              >
                                <span className="font-mono font-bold text-white">{group.eaId}</span>
                                <span className="text-zinc-400">→</span>
                                <span className="font-black text-emerald-300">
                                  @{group.resolvedPlayerUsername}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSetManualPlayer(group.eaId, '')}
                                  title="Eşleştirmeyi değiştir veya kaldır"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-500/20 text-[10px] font-bold text-zinc-300 hover:text-red-300 ml-1 transition-colors"
                                >
                                  Değiştir
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* B2. Tanınmayan "Oynadığı Takım" Eşleştirme */}
                  {preview.unrecognizedTeamGroups.length > 0 && (
                    <div className="p-4 rounded-xl bg-[#0a1628] border border-orange-500/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Oynadığı Takım Eşleştirmesi (
                            {pendingTeamGroups.length} Bekleyen
                            {completedTeamGroups.length > 0
                              ? `, ${completedTeamGroups.length} Tamamlandı`
                              : ''}
                            )
                          </h4>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Sistemde bulunmayan takım adlarını mevcut bir sistem takımına bağlayabilir veya doğrudan tarihsel/özel takım adı olarak kaydedebilirsiniz. Eşleştirmeler sonraki yüklemeler için otomatik hatırlanır.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                          {validRememberedTeamCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, ManualTeamResolution> = {
                                  ...manualTeamOverrides
                                };
                                for (const tg of pendingTeamGroups) {
                                  const rem = rememberedTeamEvaluations.get(tg.playedTeam);
                                  if (rem && rem.status === 'VALID' && rem.resolvedResolution) {
                                    next[tg.playedTeam] = rem.resolvedResolution;
                                  }
                                }
                                setManualTeamOverrides(next);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#00e5ff]/15 hover:bg-[#00e5ff]/25 text-[#00e5ff] border border-[#00e5ff]/30 text-[11px] font-black uppercase tracking-wider transition-colors"
                            >
                              💾 Hatırlanan Eşleştirmeleri Uygula ({validRememberedTeamCount} Takım)
                            </button>
                          )}

                          {pendingTeamGroups.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, ManualTeamResolution> = {
                                  ...manualTeamOverrides
                                };
                                const newMappings: PersistentTeamMapping[] = [];
                                for (const tg of pendingTeamGroups) {
                                  next[tg.playedTeam] = {
                                    mode: 'CUSTOM',
                                    customName: tg.playedTeam
                                  };
                                  newMappings.push({
                                    sourceTeamName: tg.playedTeam,
                                    mode: 'CUSTOM',
                                    targetTeamId: null,
                                    targetTeamName: tg.playedTeam,
                                    updatedAt: new Date().toISOString()
                                  });
                                }
                                setManualTeamOverrides(next);

                                setSavedTeamMappings(prev => {
                                  const map = new Map<string, PersistentTeamMapping>();
                                  for (const m of prev) map.set(foldCase(m.sourceTeamName), m);
                                  for (const m of newMappings) map.set(foldCase(m.sourceTeamName), m);
                                  const merged = Array.from(map.values());
                                  saveTeamMappingsToStorage(merged);
                                  savePersistentCsvTeamMappingsAction(newMappings).catch(() => {});
                                  return merged;
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 text-[11px] font-black uppercase tracking-wider transition-colors"
                            >
                              Bekleyenlerin Tümünü Tarihsel Takım Olarak Kaydet
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Pending Team Groups First */}
                      {pendingTeamGroups.length > 0 && (
                        <div className="space-y-2">
                          {(showAllPendingTeams
                            ? pendingTeamGroups
                            : pendingTeamGroups.slice(0, 10)
                          ).map(tg => {
                            const currentOverride = manualTeamOverrides[tg.playedTeam];
                            const remembered = rememberedTeamEvaluations.get(tg.playedTeam);

                            return (
                              <div
                                key={tg.playedTeam}
                                className="p-3 rounded-xl bg-[#060d18] border border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                              >
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black text-white">
                                      {tg.playedTeam}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-zinc-400">
                                      {tg.rowCount} oyuncu kaydı
                                    </span>
                                    {remembered?.status === 'VALID' && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
                                        💾 Önceki Yüklemeden Hatırlandı
                                      </span>
                                    )}
                                  </div>
                                  {remembered && remembered.status !== 'VALID' && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                      <span>⚠️ {remembered.conflictReason}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
                                  {/* Quick Apply Remembered Mapping */}
                                  {remembered?.status === 'VALID' && remembered.resolvedResolution && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetManualTeam(tg.playedTeam, remembered.resolvedResolution)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 text-xs font-bold transition-colors shrink-0"
                                    >
                                      Hatırlananı Uygula: {remembered.mapping.mode === 'EXISTING' ? (teams.find(t => t.id === remembered.mapping.targetTeamId)?.name || 'Sistem Takımı') : (remembered.mapping.targetCustomName || tg.playedTeam)}
                                    </button>
                                  )}

                                  {/* Option 1: Searchable System Team Combobox */}
                                  <SystemTeamCombobox
                                    playedTeam={tg.playedTeam}
                                    teams={teams}
                                    selectedTeamId={
                                      currentOverride?.mode === 'EXISTING'
                                        ? currentOverride.teamId
                                        : null
                                    }
                                    onSelectTeam={teamId => {
                                      if (!teamId) handleSetManualTeam(tg.playedTeam, null);
                                      else
                                        handleSetManualTeam(tg.playedTeam, {
                                          mode: 'EXISTING',
                                          teamId
                                        });
                                    }}
                                  />

                                  <span className="text-[10px] font-bold text-zinc-500 uppercase text-center">
                                    veya
                                  </span>

                                  {/* Option 2: Save as Historical / Custom Team */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSetManualTeam(tg.playedTeam, {
                                        mode: 'CUSTOM',
                                        customName: tg.playedTeam
                                      })
                                    }
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/15 text-zinc-200 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 text-xs font-bold transition-colors shrink-0"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                    Tarihsel / Özel Takım Olarak Kaydet
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {pendingTeamGroups.length > 10 && (
                            <div className="pt-1 text-center">
                              <button
                                type="button"
                                onClick={() => setShowAllPendingTeams(prev => !prev)}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-300 transition-colors"
                              >
                                {showAllPendingTeams
                                  ? 'Daha Az Göster (İlk 10)'
                                  : `Tüm Bekleyen Takımları Göster (${pendingTeamGroups.length})`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Completed Team Matches (Compact View) */}
                      {completedTeamGroups.length > 0 && (
                        <div className="pt-2 border-t border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                              Tamamlanan Takım Eşleştirmeleri ({completedTeamGroups.length})
                            </span>
                            <div className="flex items-center gap-3">
                              {savedTeamMappings.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSavedTeamMappings([]);
                                    saveTeamMappingsToStorage([]);
                                  }}
                                  title="Tarayıcıda kayıtlı takım eşleştirmelerini temizler"
                                  className="text-[10px] font-bold text-zinc-400 hover:text-amber-400 underline"
                                >
                                  Kayıtlı Eşleştirmeleri Temizle ({savedTeamMappings.length})
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setManualTeamOverrides({})}
                                className="text-[10px] font-bold text-zinc-400 hover:text-white underline"
                              >
                                Tüm Takım Seçimlerini Sıfırla
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {completedTeamGroups.map(tg => (
                              <div
                                key={tg.playedTeam}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs"
                              >
                                <span className="font-bold text-white">{tg.playedTeam}</span>
                                <span className="text-zinc-400">→</span>
                                {tg.matchStatus === 'MANUAL_EXISTING' ? (
                                  <span className="font-black text-cyan-300">
                                    Sistem: {tg.resolvedTeamName}
                                  </span>
                                ) : (
                                  <span className="font-bold text-emerald-300">
                                    Tarihsel Takım
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleSetManualTeam(tg.playedTeam, null)}
                                  title="Seçimi değiştir veya kaldır"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-500/20 text-[10px] font-bold text-zinc-300 hover:text-red-300 ml-1 transition-colors"
                                >
                                  Değiştir
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* D. Filtreler ve Tablo İçi Arama */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-zinc-500 mr-1" />
                    {(
                      [
                        ['ALL', `Tümü (${preview.rows.length})`],
                        ['READY', `İçe aktarılacak (${preview.readyToImportCount})`],
                        [
                          'NEEDS_PLAYER_MATCH',
                          `Oyuncu eşleştirmesi gerekli (${needsPlayerMatchRowsCount})`
                        ],
                        [
                          'NEEDS_TEAM_MATCH',
                          `Takım eşleştirmesi gerekli (${needsTeamMatchRowsCount})`
                        ],
                        ['INVALID_STATS', `Hatalı (${preview.invalidStatRowsCount})`],
                        ['SKIPPED', `Atlanacak (${skippedRowsCount})`]
                      ] as [PreviewTabFilter, string][]
                    ).map(([tabKey, label]) => (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() => setActiveFilter(tabKey)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
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
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={rowSearch}
                      onChange={e => setRowSearch(e.target.value)}
                      placeholder="Tabloda EA ID, oyuncu, takım ara..."
                      className="w-full pl-8 pr-7 py-1.5 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5ff]"
                    />
                    {rowSearch && (
                      <button
                        type="button"
                        onClick={() => setRowSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Secondary sub-filters when "Atlanacak" is selected so granular filters are preserved */}
                {activeFilter === 'SKIPPED' && (
                  <div className="flex items-center gap-1.5 flex-wrap pl-5">
                    <span className="text-[11px] text-zinc-400 mr-1">Atlanma nedeni:</span>
                    {(
                      [
                        ['ALL_SKIPPED', `Tümü (${skippedRowsCount})`],
                        ['EXISTING_IN_DB', `Sitede Mevcut (${preview.existingDbCollisionsCount})`],
                        ['DUPLICATE_IN_CSV', `CSV İçi Mükerrer (${preview.duplicateCsvRowsCount})`],
                        ['EXCLUDED_SEASON', `Sezon Kapsam Dışı (${preview.excludedSeasonRows})`]
                      ] as [SkippedSubFilter, string][]
                    ).map(([subKey, subLabel]) => (
                      <button
                        key={subKey}
                        type="button"
                        onClick={() => setSkippedSubFilter(subKey)}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                          skippedSubFilter === subKey
                            ? 'bg-white/15 text-white border-white/30'
                            : 'bg-[#060d18] text-zinc-400 border-white/5 hover:text-white'
                        }`}
                      >
                        {subLabel}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* C. Kayıt Tablosu */}
              <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0a1628]/60">
                <div className="overflow-x-auto max-h-[340px] custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#060d18] border-b border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5 w-12">#</th>
                        <th className="p-2.5">EA ID</th>
                        <th className="p-2.5">Eşleşen Oyuncu</th>
                        <th className="p-2.5">Oynadığı Takım</th>
                        <th className="p-2.5 text-center">Maç</th>
                        <th className="p-2.5 text-center">Gol</th>
                        <th className="p-2.5 text-center">Asist</th>
                        <th className="p-2.5 text-center">Rating</th>
                        <th className="p-2.5">Durum ve Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-zinc-500">
                            Seçili filtreye uygun kayıt bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.slice(0, 300).map(row => (
                          <tr key={row.lineNumber} className="hover:bg-white/[0.02]">
                            <td className="p-2.5 font-mono text-zinc-500">{row.lineNumber}</td>
                            <td className="p-2.5 font-mono font-bold text-white">
                              {row.eaId || '-'}
                            </td>
                            <td className="p-2.5">
                              {row.resolvedPlayerUsername ? (
                                <span className="font-bold text-emerald-400">
                                  @{row.resolvedPlayerUsername}
                                </span>
                              ) : (
                                <span className="text-zinc-500 italic">Eşleşmedi</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <div className="font-bold text-white">
                                {row.resolvedTeamName || row.playedTeam || '-'}
                              </div>
                              {row.teamMatchStatus === 'MANUAL_CUSTOM' && (
                                <div className="text-[10px] text-zinc-400">Tarihsel / Özel Takım</div>
                              )}
                            </td>
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
                              {row.statusReasons.length > 0 && (
                                <div className="text-[11px] text-zinc-400">
                                  {row.statusReasons.join(' ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length > 300 && (
                  <div className="p-2 text-center text-[11px] text-zinc-400 bg-[#060d18] border-t border-white/5">
                    Performans için ilk 300 satır gösteriliyor (Toplam filtrelenen: {filteredRows.length} satır). Tablo içi arama kutusunu kullanarak daraltabilirsiniz.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* E. Alt Sabit Çubuk */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-white/10 bg-[#0a1628] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-300">
            {preview && preview.headerValid ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  İçe aktarılacak kayıt:{' '}
                  <strong className="text-emerald-400 font-black">
                    {preview.readyToImportCount}
                  </strong>
                </span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400">
                  Atlanacak: <strong>{skippedRowsCount}</strong>
                </span>
                {errorAndActionRowsCount > 0 && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-amber-300">
                      Hatalı / Bekleyen: <strong>{errorAndActionRowsCount}</strong>
                    </span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-zinc-400">
                Ön izleme ve doğrulama için bir CSV dosyası seçin.
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 font-bold text-xs rounded-lg transition-colors"
            >
              İptal / Kapat
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={
                importing ||
                !preview ||
                !preview.headerValid ||
                preview.readyToImportCount === 0
              }
              className="px-5 py-2 bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#060d18] font-black text-xs rounded-lg transition-all flex items-center gap-2 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#00e5ff]/10"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  İçe Aktarılıyor...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  İçe Aktar ({preview?.readyToImportCount || 0} Kayıt)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
