import { EAMatchPayload, NormalizedMatch, NormalizedTeam, NormalizedPlayerStat } from './types';

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

export function normalizeMatch(payload: EAMatchPayload, targetClubId: number): NormalizedMatch | null {
  const clubIds = Object.keys(payload.clubs);
  if (clubIds.length !== 2) return null;

  // By convention, we can just assign the first key as Home and the second as Away.
  // Wait, in EA, the club we query is often just one of them.
  // We will let the Fixture Matcher decide who is home and away based on the database.
  // But for the normalized structure, we'll arbitrarily assign home/away here and fix it later in the matcher.
  
  const homeClubIdStr = clubIds[0];
  const awayClubIdStr = clubIds[1];
  
  const homeData = payload.clubs[homeClubIdStr];
  const awayData = payload.clubs[awayClubIdStr];
  
  const homePlayers = payload.players[homeClubIdStr] || {};
  const awayPlayers = payload.players[awayClubIdStr] || {};

  const parsePlayers = (playersRecord: Record<string, any>): NormalizedPlayerStat[] => {
    return Object.entries(playersRecord).map(([ea_player_id, p]) => ({
      ea_player_id,
      ea_player_name: p.playername || 'Unknown',
      position: p.pos || 'Unknown',
      goals: parseNumber(p.goals),
      assists: parseNumber(p.assists),
      rating: parseFloat(p.rating) || 0,
      shots: parseNumber(p.shots),
      passes_made: parseNumber(p.passesmade),
      pass_attempts: parseNumber(p.passattempts),
      tackles_made: parseNumber(p.tacklesmade),
      tackle_attempts: parseNumber(p.tackleattempts),
      saves: parseNumber(p.saves),
      goals_conceded: parseNumber(p.goalsconceded),
      cleansheets_gk: parseNumber(p.cleansheetsgk),
      cleansheets_def: parseNumber(p.cleansheetsdef),
      red_cards: parseNumber(p.redcards),
      is_mom: parseNumber(p.mom) > 0
    }));
  };

  const homeTeam: NormalizedTeam = {
    ea_club_id: Number(homeClubIdStr),
    ea_club_name: homeData.details.name || 'Unknown',
    score: parseNumber(homeData.goals),
    players: parsePlayers(homePlayers)
  };

  const awayTeam: NormalizedTeam = {
    ea_club_id: Number(awayClubIdStr),
    ea_club_name: awayData.details.name || 'Unknown',
    score: parseNumber(awayData.goals),
    players: parsePlayers(awayPlayers)
  };

  return {
    ea_match_id: payload.matchId,
    played_at: new Date(payload.timestamp * 1000).toISOString(),
    home_team: homeTeam,
    away_team: awayTeam,
    raw_data: payload
  };
}
