'use client';

import { useState, useMemo, useTransition } from 'react';
import { issuePenaltyAction, revokePenaltyAction, getEscalationPreview } from './actions';
import TeamLogo from '@/components/TeamLogo';

interface Penalty {
  id: string;
  team_id: string;
  league_id: string;
  season_id: string;
  penalty_type: string;
  points_deducted: number;
  violation_order: number;
  reason: string;
  match_id: string | null;
  target_user_id: string | null;
  issued_by: string;
  issued_at: string;
  is_revoked: boolean;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

interface Team { id: string; name: string; slug: string; logo_url: string | null; }
interface League { id: string; name: string; season_id: string; }
interface Season { id: string; name: string; slug: string; status: string; }
interface Profile { id: string; username: string; avatar_url: string | null; }
interface LeagueTeam { team_id: string; league_id: string; season_id: string; is_active: boolean; }
interface Match { id: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number; status: string; played_at: string; }

interface Props {
  penalties: Penalty[];
  teams: Team[];
  leagues: League[];
  seasons: Season[];
  profiles: Profile[];
  leagueTeams: LeagueTeam[];
  matches: Match[];
}

export default function PenaltiesManager({ penalties, teams, leagues, seasons, profiles, leagueTeams, matches }: Props) {
  // Maps for O(1) lookups
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const leagueMap = useMemo(() => new Map(leagues.map(l => [l.id, l])), [leagues]);
  const seasonMap = useMemo(() => new Map(seasons.map(s => [s.id, s])), [seasons]);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const matchMap = useMemo(() => new Map(matches.map(m => [m.id, m])), [matches]);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'revoked'>('all');
  const [filterSeasonId, setFilterSeasonId] = useState('');

  // New penalty form state
  const [showForm, setShowForm] = useState(false);
  const [formSeasonId, setFormSeasonId] = useState('');
  const [formLeagueId, setFormLeagueId] = useState('');
  const [formTeamId, setFormTeamId] = useState('');
  const [formMatchId, setFormMatchId] = useState('');
  const [formTargetUserId, setFormTargetUserId] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Escalation preview
  const [escalationPreview, setEscalationPreview] = useState<{
    activeCount: number;
    next: { penalty_type: string; points_deducted: number; violation_order: number };
  } | null>(null);

  // Revoke modal state
  const [revokeTarget, setRevokeTarget] = useState<Penalty | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeMessage, setRevokeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Leagues filtered by selected season
  const filteredLeagues = useMemo(() => {
    if (!formSeasonId) return [];
    return leagues.filter(l => l.season_id === formSeasonId);
  }, [formSeasonId, leagues]);

  // Teams filtered by selected league+season (from league_teams)
  const filteredTeams = useMemo(() => {
    if (!formLeagueId || !formSeasonId) return [];
    const teamIds = new Set(
      leagueTeams
        .filter(lt => lt.league_id === formLeagueId && lt.season_id === formSeasonId && lt.is_active)
        .map(lt => lt.team_id)
    );
    return teams.filter(t => teamIds.has(t.id));
  }, [formLeagueId, formSeasonId, leagueTeams, teams]);

  // Matches filtered by selected team
  const filteredMatches = useMemo(() => {
    if (!formTeamId) return [];
    return matches.filter(m => m.home_team_id === formTeamId || m.away_team_id === formTeamId);
  }, [formTeamId, matches]);

  // Filtered penalties
  const filteredPenalties = useMemo(() => {
    let result = [...penalties];
    if (filterStatus === 'active') result = result.filter(p => !p.is_revoked);
    if (filterStatus === 'revoked') result = result.filter(p => p.is_revoked);
    if (filterSeasonId) result = result.filter(p => p.season_id === filterSeasonId);
    return result;
  }, [penalties, filterStatus, filterSeasonId]);

  // Load escalation preview when team+season selected
  async function loadPreview(teamId: string, seasonId: string) {
    if (!teamId || !seasonId) {
      setEscalationPreview(null);
      return;
    }
    const result = await getEscalationPreview(teamId, seasonId);
    if ('error' in result) {
      setEscalationPreview(null);
    } else {
      setEscalationPreview(result as any);
    }
  }

  // Handle team selection change
  function handleTeamChange(newTeamId: string) {
    setFormTeamId(newTeamId);
    setFormMatchId('');
    setFormTargetUserId('');
    if (newTeamId && formSeasonId) {
      loadPreview(newTeamId, formSeasonId);
    } else {
      setEscalationPreview(null);
    }
  }

  // Issue penalty
  function handleIssue() {
    const fd = new FormData();
    fd.set('team_id', formTeamId);
    fd.set('league_id', formLeagueId);
    fd.set('season_id', formSeasonId);
    if (formMatchId) fd.set('match_id', formMatchId);
    if (formTargetUserId) fd.set('target_user_id', formTargetUserId);
    fd.set('reason', formReason);

    startTransition(async () => {
      const res = await issuePenaltyAction(fd);
      if ('error' in res) {
        setFormMessage({ type: 'error', text: res.error! });
      } else {
        setFormMessage({ type: 'success', text: res.success! });
        setFormReason('');
        setFormMatchId('');
        setFormTargetUserId('');
        setEscalationPreview(null);
        // Reload preview after success
        if (formTeamId && formSeasonId) {
          loadPreview(formTeamId, formSeasonId);
        }
      }
    });
  }

  // Revoke penalty
  function handleRevoke() {
    if (!revokeTarget) return;
    const fd = new FormData();
    fd.set('penalty_id', revokeTarget.id);
    fd.set('revocation_reason', revokeReason);

    startTransition(async () => {
      const res = await revokePenaltyAction(fd);
      if ('error' in res) {
        setRevokeMessage({ type: 'error', text: res.error! });
      } else {
        setRevokeMessage({ type: 'success', text: res.success! });
        setTimeout(() => {
          setRevokeTarget(null);
          setRevokeReason('');
          setRevokeMessage(null);
        }, 1500);
      }
    });
  }

  const penaltyTypeLabels: Record<string, string> = {
    WARNING: 'UYARI',
    POINTS_DEDUCTION: 'PUAN CEZASI',
    EXPULSION: 'İHRAÇ',
  };

  const penaltyTypeColors: Record<string, string> = {
    WARNING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    POINTS_DEDUCTION: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    EXPULSION: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="space-y-8">
      {/* ─── NEW PENALTY FORM ──────────────────────── */}
      <div className="card-surface rounded-2xl border border-white/5 overflow-hidden">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full p-6 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-black text-[#00e5ff] tracking-widest uppercase">
            + Yeni Ceza Ver
          </span>
          <span className="text-gray-500 text-xs">{showForm ? '▲' : '▼'}</span>
        </button>

        {showForm && (
          <div className="p-6 pt-0 space-y-4 border-t border-white/5">
            {/* Season */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">Sezon</label>
                <select
                  value={formSeasonId}
                  onChange={(e) => {
                    setFormSeasonId(e.target.value);
                    setFormLeagueId('');
                    setFormTeamId('');
                    setEscalationPreview(null);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none"
                >
                  <option value="">Sezon Seç</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.status === 'ACTIVE' ? '(Aktif)' : ''}</option>
                  ))}
                </select>
              </div>

              {/* League */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">Lig</label>
                <select
                  value={formLeagueId}
                  onChange={(e) => {
                    setFormLeagueId(e.target.value);
                    setFormTeamId('');
                    setEscalationPreview(null);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none"
                  disabled={!formSeasonId}
                >
                  <option value="">Lig Seç</option>
                  {filteredLeagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Team */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">Takım</label>
                <select
                  value={formTeamId}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none"
                  disabled={!formLeagueId}
                >
                  <option value="">Takım Seç</option>
                  {filteredTeams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Escalation Preview */}
            {escalationPreview && (
              <div className={`p-4 rounded-xl border ${penaltyTypeColors[escalationPreview.next.penalty_type] || 'border-white/10'}`}>
                <div className="text-xs font-bold tracking-widest uppercase mb-1">
                  Otomatik Basamak Hesaplaması
                </div>
                <div className="text-sm font-bold text-white">
                  Bu takımın <span className="text-[#00e5ff]">{escalationPreview.activeCount}</span> aktif ihlali var →{' '}
                  <span className="font-black">
                    {escalationPreview.next.violation_order}. ihlal:{' '}
                    {penaltyTypeLabels[escalationPreview.next.penalty_type]}
                    {escalationPreview.next.points_deducted > 0 && ` (${escalationPreview.next.points_deducted} puan)`}
                  </span>
                </div>
              </div>
            )}

            {/* Match & Captain (optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">
                  İlgili Maç <span className="text-gray-600">(opsiyonel)</span>
                </label>
                <select
                  value={formMatchId}
                  onChange={(e) => setFormMatchId(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none"
                  disabled={!formTeamId}
                >
                  <option value="">Maç Seç (Opsiyonel)</option>
                  {filteredMatches.map(m => {
                    const home = teamMap.get(m.home_team_id);
                    const away = teamMap.get(m.away_team_id);
                    return (
                      <option key={m.id} value={m.id}>
                        {home?.name || '?'} {m.home_score}-{m.away_score} {away?.name || '?'} ({m.status})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">
                  Hedef Kaptan <span className="text-gray-600">(opsiyonel)</span>
                </label>
                <input
                  type="text"
                  value={formTargetUserId}
                  onChange={(e) => setFormTargetUserId(e.target.value)}
                  placeholder="Kaptan UUID (opsiyonel)"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">Gerekçe</label>
              <textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ceza gerekçesini yazın (min 5, max 1000 karakter)..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none resize-none"
              />
              <div className="text-right text-[10px] text-gray-600 mt-0.5">{formReason.length}/1000</div>
            </div>

            {/* Submit */}
            {formMessage && (
              <div className={`p-3 rounded-lg text-sm font-bold ${formMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                {formMessage.text}
              </div>
            )}
            <button
              onClick={handleIssue}
              disabled={isPending || !formTeamId || !formLeagueId || !formSeasonId || formReason.length < 5}
              className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-black tracking-widest rounded-xl hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? 'İşleniyor...' : 'CEZA VER'}
            </button>
          </div>
        )}
      </div>

      {/* ─── FILTERS ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-black/40 rounded-lg border border-white/5 p-1">
          {(['all', 'active', 'revoked'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-widest transition-all ${
                filterStatus === status
                  ? 'bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {status === 'all' ? 'TÜMÜ' : status === 'active' ? 'AKTİF' : 'İPTAL'}
            </button>
          ))}
        </div>

        <select
          value={filterSeasonId}
          onChange={(e) => setFilterSeasonId(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-gray-300 focus:border-[#00e5ff]/50 outline-none"
        >
          <option value="">Tüm Sezonlar</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 font-bold ml-auto">
          {filteredPenalties.length} ceza
        </span>
      </div>

      {/* ─── PENALTY LIST ─────────────────────────── */}
      <div className="space-y-3">
        {filteredPenalties.length === 0 ? (
          <div className="card-surface rounded-2xl border border-white/5 p-12 text-center text-gray-500 font-bold tracking-widest text-sm">
            Ceza kaydı bulunamadı.
          </div>
        ) : (
          filteredPenalties.map(p => {
            const team = teamMap.get(p.team_id);
            const league = leagueMap.get(p.league_id);
            const season = seasonMap.get(p.season_id);
            const issuer = profileMap.get(p.issued_by);
            const target = p.target_user_id ? profileMap.get(p.target_user_id) : null;
            const revoker = p.revoked_by ? profileMap.get(p.revoked_by) : null;
            const match = p.match_id ? matchMap.get(p.match_id) : null;

            return (
              <div
                key={p.id}
                className={`card-surface rounded-2xl border overflow-hidden transition-all ${
                  p.is_revoked ? 'border-white/5 opacity-60' : 'border-white/5'
                }`}
              >
                <div className="p-5 flex flex-col md:flex-row gap-4">
                  {/* Left: Type badge + Violation # */}
                  <div className="flex items-start gap-3 md:w-48 shrink-0">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest border ${penaltyTypeColors[p.penalty_type] || 'border-white/10 text-gray-400'}`}>
                      {penaltyTypeLabels[p.penalty_type] || p.penalty_type}
                    </span>
                    <span className="text-xs font-bold text-gray-500">#{p.violation_order}</span>
                    {p.is_revoked && (
                      <span className="px-2 py-0.5 bg-gray-500/10 text-gray-500 border border-gray-500/30 rounded text-[10px] font-black tracking-widest">
                        İPTAL
                      </span>
                    )}
                  </div>

                  {/* Center: Details */}
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TeamLogo src={team?.logo_url} name={team?.name} size="xs" />
                      <span className="text-sm font-bold text-white">{team?.name || 'Bilinmeyen'}</span>
                      <span className="text-[10px] text-gray-500">•</span>
                      <span className="text-xs text-gray-400">{league?.name}</span>
                      <span className="text-[10px] text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{season?.name}</span>
                    </div>

                    <p className="text-sm text-gray-300">{p.reason}</p>

                    <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 font-medium">
                      {p.points_deducted > 0 && (
                        <span className="text-orange-400">-{p.points_deducted} puan</span>
                      )}
                      {target && <span>Kaptan: @{target.username}</span>}
                      {match && (
                        <span>
                          Maç: {teamMap.get(match.home_team_id)?.name} {match.home_score}-{match.away_score} {teamMap.get(match.away_team_id)?.name}
                        </span>
                      )}
                      <span>Veren: @{issuer?.username || '?'}</span>
                      <span>{new Date(p.issued_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {p.is_revoked && (
                      <div className="mt-1 p-2 bg-gray-500/5 rounded-lg border border-gray-500/10">
                        <div className="text-[10px] text-gray-500">
                          İptal Eden: @{revoker?.username || '?'} — {p.revoked_at ? new Date(p.revoked_at).toLocaleDateString('tr-TR') : ''}
                        </div>
                        {p.revocation_reason && (
                          <div className="text-xs text-gray-400 mt-0.5">{p.revocation_reason}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-start md:w-32 shrink-0 justify-end">
                    {!p.is_revoked && (
                      <button
                        onClick={() => { setRevokeTarget(p); setRevokeReason(''); setRevokeMessage(null); }}
                        className="px-3 py-1.5 bg-gray-500/10 border border-gray-500/20 text-gray-400 text-[10px] font-black tracking-widest rounded-lg hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all"
                      >
                        İPTAL ET
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── REVOKE MODAL ─────────────────────────── */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-8 max-w-lg w-full space-y-6 shadow-2xl">
            <h3 className="text-lg font-black text-white tracking-widest">CEZA İPTAL ET</h3>

            <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest border ${penaltyTypeColors[revokeTarget.penalty_type]}`}>
                  {penaltyTypeLabels[revokeTarget.penalty_type]}
                </span>
                <span className="text-xs text-gray-500">İhlal #{revokeTarget.violation_order}</span>
              </div>
              <div className="text-sm text-white font-bold">{teamMap.get(revokeTarget.team_id)?.name}</div>
              <div className="text-xs text-gray-400">{revokeTarget.reason}</div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-1">İptal Gerekçesi</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="İptal gerekçesini yazın (min 5 karakter)..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00e5ff]/50 outline-none resize-none"
              />
            </div>

            {revokeMessage && (
              <div className={`p-3 rounded-lg text-sm font-bold ${revokeMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                {revokeMessage.text}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRevokeTarget(null); setRevokeMessage(null); }}
                className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending || revokeReason.length < 5}
                className="px-5 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-black tracking-widest rounded-xl hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'İşleniyor...' : 'CEZAYI İPTAL ET'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
