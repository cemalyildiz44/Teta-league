import { NormalizedMatch } from './types';

export interface FixtureCandidate {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  home_team: { ea_club_id: number };
  away_team: { ea_club_id: number };
}

export interface MatchResult {
  status: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
  fixture_id?: string;
  home_team_id?: string;
  away_team_id?: string;
  is_reversed?: boolean;
}

// Helper: Calculate the Match Night Window (Wednesday 20:00 TRT to Thursday 02:00 TRT)
// Using pure UTC logic because TRT is UTC+3 permanently.
// Wednesday 20:00 TRT = 17:00 UTC
// Thursday 02:00 TRT = 23:00 UTC (same day in UTC!)
function getMatchNightWindow(scheduledAt: string): { start: number; end: number } {
  // Fix date string to avoid timezone parsing issues if not strictly ISO
  const d = new Date(scheduledAt);
  
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();

  // 17:00:00.000 UTC = 20:00:00.000 TRT (INCLUSIVE)
  const start = Date.UTC(year, month, date, 17, 0, 0, 0);
  
  // 23:00:00.000 UTC = 02:00:00.000 TRT (EXCLUSIVE)
  const end = Date.UTC(year, month, date, 23, 0, 0, 0);

  return { start, end };
}

export function matchFixture(
  normalized: NormalizedMatch,
  fixtures: FixtureCandidate[]
): MatchResult {
  const eaClubA = normalized.home_team.ea_club_id;
  const eaClubB = normalized.away_team.ea_club_id;
  const matchTime = new Date(normalized.played_at).getTime();

  // Find all fixtures matching these two clubs (straight or reversed)
  const matchingFixtures = fixtures.filter(f => {
    const fHomeEA = f.home_team.ea_club_id;
    const fAwayEA = f.away_team.ea_club_id;

    const straightMatch = fHomeEA === eaClubA && fAwayEA === eaClubB;
    const reversedMatch = fHomeEA === eaClubB && fAwayEA === eaClubA;

    return straightMatch || reversedMatch;
  });

  if (matchingFixtures.length === 0) {
    return { status: 'UNMATCHED' };
  }

  // Check which fixtures' Match Night Window the EA Match falls into
  const validFixtures = matchingFixtures.filter(f => {
    const window = getMatchNightWindow(f.scheduled_at);
    return matchTime >= window.start && matchTime < window.end;
  });

  if (validFixtures.length === 0) {
    return { status: 'UNMATCHED' };
  }

  // If more than one fixture matches the exact same night window for the same teams, it's ambiguous
  if (validFixtures.length > 1) {
    return { status: 'AMBIGUOUS' };
  }

  const bestMatch = validFixtures[0];
  const isReversed = bestMatch.home_team.ea_club_id === eaClubB;

  return {
    status: 'MATCHED',
    fixture_id: bestMatch.id,
    home_team_id: bestMatch.home_team_id,
    away_team_id: bestMatch.away_team_id,
    is_reversed: isReversed
  };
}
