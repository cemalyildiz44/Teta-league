import { createHash } from 'node:crypto';

/**
 * `teta.fixtures` v1 export — pure, read-only builder.
 * Takes rows already read from the database and produces the export document
 * plus an explicit list of integrity issues (nothing is skipped silently).
 */

export const FIXTURE_EXPORT_SCHEMA = 'teta.fixtures';
export const FIXTURE_EXPORT_SCHEMA_VERSION = 1;
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000; // Europe/Istanbul is permanently UTC+3

export interface SeasonRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}
export interface LeagueRow {
  id: string;
  season_id: string;
  name: string;
  level: number;
  status: string;
}
export interface TeamRow {
  id: string;
  name: string;
  slug: string;
  ea_club_id: number | string | null;
  ea_club_name: string | null;
  is_active: boolean;
}
export interface LeagueTeamRow {
  league_id: string;
  season_id: string;
  team_id: string;
  is_active: boolean;
}
export interface FixtureRow {
  id: string;
  season_id: string;
  league_id: string;
  week_number: number;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
}
export interface MatchRow {
  id: string;
  fixture_id: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  ea_match_id: string | null;
}

export type FixtureExportIssueCode =
  | 'MISSING_EA_CLUB_ID'
  | 'INVALID_EA_CLUB_ID'
  | 'DUPLICATE_EA_CLUB_ID'
  | 'TEAM_NOT_FOUND'
  | 'TEAM_NOT_IN_LEAGUE'
  | 'TEAM_INACTIVE_IN_LEAGUE'
  | 'FIXTURE_LEAGUE_NOT_FOUND'
  | 'FIXTURE_SEASON_MISMATCH'
  | 'FIXTURE_SAME_TEAM'
  | 'FIXTURE_INVALID_WEEK'
  | 'FIXTURE_INVALID_DATE'
  | 'FIXTURE_DUPLICATE_PAIRING'
  | 'TEAM_PLAYS_TWICE_IN_WEEK'
  | 'FIXTURE_OUTSIDE_SEASON_DATES'
  | 'MULTIPLE_MATCHES_FOR_FIXTURE'
  | 'LEAGUE_WITHOUT_FIXTURES';

export interface FixtureExportIssue {
  code: FixtureExportIssueCode;
  severity: 'error' | 'warning';
  message: string;
  seasonId?: string;
  leagueId?: string;
  teamId?: string;
  fixtureId?: string;
  weekNumber?: number;
}

export interface BuildFixtureExportInput {
  season: SeasonRow;
  leagues: LeagueRow[];
  teams: TeamRow[];
  leagueTeams: LeagueTeamRow[];
  fixtures: FixtureRow[];
  matches: MatchRow[];
  generatedAt?: Date;
}

function parseEaClubId(raw: number | string | null): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

function toTurkeyDate(iso: string): string {
  return new Date(new Date(iso).getTime() + TURKEY_OFFSET_MS).toISOString().slice(0, 10);
}

function validDate(iso: string): boolean {
  return typeof iso === 'string' && !isNaN(new Date(iso).getTime());
}

export function buildFixtureExport(input: BuildFixtureExportInput) {
  const { season, leagues, teams, leagueTeams, fixtures, matches } = input;
  const issues: FixtureExportIssue[] = [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const leagueById = new Map(leagues.map((l) => [l.id, l]));
  const membership = new Map(leagueTeams.map((lt) => [`${lt.league_id}:${lt.team_id}`, lt]));
  const matchesByFixture = new Map<string, MatchRow[]>();
  for (const m of matches) {
    if (!m.fixture_id) continue;
    const list = matchesByFixture.get(m.fixture_id) ?? [];
    list.push(m);
    matchesByFixture.set(m.fixture_id, list);
  }

  // --- Team / EA club ID checks (only teams that participate in the exported leagues) ---
  const exportedTeamIds = new Set<string>();
  for (const lt of leagueTeams) if (leagueById.has(lt.league_id)) exportedTeamIds.add(lt.team_id);
  for (const f of fixtures) {
    exportedTeamIds.add(f.home_team_id);
    exportedTeamIds.add(f.away_team_id);
  }

  const eaOwners = new Map<number, string[]>();
  for (const teamId of [...exportedTeamIds].sort()) {
    const team = teamById.get(teamId);
    if (!team) {
      issues.push({ code: 'TEAM_NOT_FOUND', severity: 'error', teamId, message: `Takım bulunamadı: ${teamId}` });
      continue;
    }
    const ea = parseEaClubId(team.ea_club_id);
    if (ea === null) {
      issues.push({ code: 'MISSING_EA_CLUB_ID', severity: 'error', teamId, message: `${team.name} takımının EA kulüp ID'si yok.` });
    } else if (Number.isNaN(ea)) {
      issues.push({ code: 'INVALID_EA_CLUB_ID', severity: 'error', teamId, message: `${team.name} takımının EA kulüp ID'si geçersiz: ${String(team.ea_club_id)}` });
    } else {
      eaOwners.set(ea, [...(eaOwners.get(ea) ?? []), teamId]);
    }
  }
  for (const [ea, owners] of eaOwners) {
    if (owners.length > 1) {
      for (const teamId of owners) {
        issues.push({ code: 'DUPLICATE_EA_CLUB_ID', severity: 'error', teamId, message: `EA kulüp ID'si ${ea} birden fazla takımda kullanılıyor.` });
      }
    }
  }

  // --- Fixture checks ---
  const seenPairings = new Map<string, string>();
  const weekTeamCounts = new Map<string, number>();
  const sortedFixtures = [...fixtures].sort(
    (a, b) =>
      a.league_id.localeCompare(b.league_id) ||
      a.week_number - b.week_number ||
      String(a.scheduled_at).localeCompare(String(b.scheduled_at)) ||
      a.id.localeCompare(b.id)
  );
  const seasonStart = season.start_date;
  const seasonEnd = season.end_date;

  for (const f of sortedFixtures) {
    const base = { fixtureId: f.id, leagueId: f.league_id, weekNumber: f.week_number };
    if (!leagueById.has(f.league_id)) {
      issues.push({ ...base, code: 'FIXTURE_LEAGUE_NOT_FOUND', severity: 'error', message: `Fikstürün ligi dışa aktarılan liglerde yok.` });
    }
    if (f.season_id !== season.id || (leagueById.get(f.league_id) && leagueById.get(f.league_id)!.season_id !== f.season_id)) {
      issues.push({ ...base, code: 'FIXTURE_SEASON_MISMATCH', severity: 'error', message: `Fikstür sezon/lig eşleşmesi tutarsız.` });
    }
    if (f.home_team_id === f.away_team_id) {
      issues.push({ ...base, code: 'FIXTURE_SAME_TEAM', severity: 'error', message: `Ev sahibi ve deplasman aynı takım.` });
    }
    if (!Number.isInteger(f.week_number) || f.week_number < 1) {
      issues.push({ ...base, code: 'FIXTURE_INVALID_WEEK', severity: 'error', message: `Geçersiz hafta numarası: ${f.week_number}` });
    }
    const dateOk = validDate(f.scheduled_at);
    if (!dateOk) {
      issues.push({ ...base, code: 'FIXTURE_INVALID_DATE', severity: 'error', message: `Geçersiz maç tarihi: ${f.scheduled_at}` });
    } else {
      const d = toTurkeyDate(f.scheduled_at);
      if ((seasonStart && d < seasonStart) || (seasonEnd && d > seasonEnd)) {
        issues.push({ ...base, code: 'FIXTURE_OUTSIDE_SEASON_DATES', severity: 'warning', message: `Maç tarihi (${d}) sezon tarih aralığı dışında.` });
      }
    }
    for (const teamId of [f.home_team_id, f.away_team_id]) {
      const lt = membership.get(`${f.league_id}:${teamId}`);
      if (!lt) {
        issues.push({ ...base, teamId, code: 'TEAM_NOT_IN_LEAGUE', severity: 'error', message: `Takım (${teamId}) bu ligin kadrosunda değil.` });
      } else if (!lt.is_active) {
        issues.push({ ...base, teamId, code: 'TEAM_INACTIVE_IN_LEAGUE', severity: 'warning', message: `Takım (${teamId}) ligde pasif.` });
      }
      const key = `${f.league_id}:${f.week_number}:${teamId}`;
      weekTeamCounts.set(key, (weekTeamCounts.get(key) ?? 0) + 1);
    }
    const pairKey = `${f.league_id}:${f.week_number}:${f.home_team_id}:${f.away_team_id}`;
    if (seenPairings.has(pairKey)) {
      issues.push({ ...base, code: 'FIXTURE_DUPLICATE_PAIRING', severity: 'error', message: `Aynı hafta içinde aynı eşleşme tekrar ediyor (ilk kayıt: ${seenPairings.get(pairKey)}).` });
    } else {
      seenPairings.set(pairKey, f.id);
    }
    if ((matchesByFixture.get(f.id)?.length ?? 0) > 1) {
      issues.push({ ...base, code: 'MULTIPLE_MATCHES_FOR_FIXTURE', severity: 'error', message: `Fikstüre birden fazla maç bağlı.` });
    }
  }
  for (const [key, count] of weekTeamCounts) {
    if (count > 1) {
      const [leagueId, week, teamId] = key.split(':');
      issues.push({ code: 'TEAM_PLAYS_TWICE_IN_WEEK', severity: 'warning', leagueId, weekNumber: Number(week), teamId, message: `Takım aynı hafta ${count} maç oynuyor.` });
    }
  }

  // --- Document ---
  const teamDoc = (id: string) => {
    const t = teamById.get(id);
    const ea = t ? parseEaClubId(t.ea_club_id) : null;
    return {
      id,
      name: t?.name ?? null,
      slug: t?.slug ?? null,
      eaClubId: ea === null || Number.isNaN(ea) ? null : ea,
      eaClubName: t?.ea_club_name ?? null,
    };
  };

  const leagueDocs = [...leagues]
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
    .map((league) => {
      const lf = sortedFixtures.filter((f) => f.league_id === league.id);
      if (lf.length === 0) {
        issues.push({ code: 'LEAGUE_WITHOUT_FIXTURES', severity: 'warning', leagueId: league.id, message: `${league.name} ligi için fikstür yok.` });
      }
      const weekNumbers = [...new Set(lf.map((f) => f.week_number))].sort((a, b) => a - b);
      return {
        id: league.id,
        name: league.name,
        level: league.level,
        status: league.status,
        teams: leagueTeams
          .filter((lt) => lt.league_id === league.id)
          .map((lt) => ({ ...teamDoc(lt.team_id), active: lt.is_active }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        weeks: weekNumbers.map((weekNumber) => {
          const wf = lf.filter((f) => f.week_number === weekNumber);
          const times = wf.map((f) => f.scheduled_at).filter(validDate).map((s) => new Date(s).getTime());
          const from = times.length ? new Date(Math.min(...times)).toISOString() : null;
          const to = times.length ? new Date(Math.max(...times)).toISOString() : null;
          return {
            weekNumber,
            window: {
              from,
              to,
              fromDate: from ? toTurkeyDate(from) : null,
              toDate: to ? toTurkeyDate(to) : null,
              timezone: 'Europe/Istanbul',
            },
            fixtures: wf.map((f) => {
              const m = matchesByFixture.get(f.id)?.[0] ?? null;
              return {
                id: f.id,
                weekNumber: f.week_number,
                scheduledAt: validDate(f.scheduled_at) ? new Date(f.scheduled_at).toISOString() : null,
                status: f.status,
                homeTeam: teamDoc(f.home_team_id),
                awayTeam: teamDoc(f.away_team_id),
                match: m
                  ? { id: m.id, status: m.status, homeScore: m.home_score, awayScore: m.away_score, eaMatchId: m.ea_match_id }
                  : null,
              };
            }),
          };
        }),
      };
    });

  const sortedIssues = [...issues].sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) ||
      a.code.localeCompare(b.code) ||
      JSON.stringify(a).localeCompare(JSON.stringify(b))
  );

  const data = {
    season: {
      id: season.id,
      name: season.name,
      slug: season.slug,
      status: season.status,
      startDate: season.start_date,
      endDate: season.end_date,
    },
    leagues: leagueDocs,
  };

  // exportId is a content hash: identical data always yields the same ID.
  const exportId =
    'tfx_' +
    createHash('sha256')
      .update(JSON.stringify({ v: FIXTURE_EXPORT_SCHEMA_VERSION, data }))
      .digest('hex')
      .slice(0, 32);

  const errorCount = sortedIssues.filter((i) => i.severity === 'error').length;
  return {
    schema: FIXTURE_EXPORT_SCHEMA,
    schemaVersion: FIXTURE_EXPORT_SCHEMA_VERSION,
    exportId,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    ...data,
    summary: {
      leagueCount: leagueDocs.length,
      fixtureCount: sortedFixtures.length,
      errorCount,
      warningCount: sortedIssues.length - errorCount,
      importable: errorCount === 0,
    },
    issues: sortedIssues,
  };
}

export type FixtureExportDocument = ReturnType<typeof buildFixtureExport>;
