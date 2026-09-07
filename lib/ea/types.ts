export interface EAMatchPayload {
  matchId: string;
  timestamp: number;
  clubs: Record<string, EAClub>;
  players: Record<string, Record<string, EAPlayer>>;
}

export interface EAClub {
  goals: string;
  details: {
    name: string;
    clubId: number;
  };
}

export interface EAPlayer {
  playername: string;
  pos: string;
  goals: string;
  assists: string;
  rating: string;
  shots: string;
  passesmade: string;
  passattempts: string;
  tacklesmade: string;
  tackleattempts: string;
  saves: string;
  goalsconceded: string;
  cleansheetsgk: string;
  cleansheetsdef: string;
  redcards: string;
  mom: string;
}

export interface NormalizedPlayerStat {
  ea_player_id: string;
  ea_player_name: string;
  position: string;
  goals: number;
  assists: number;
  rating: number;
  shots: number;
  passes_made: number;
  pass_attempts: number;
  tackles_made: number;
  tackle_attempts: number;
  saves: number;
  goals_conceded: number;
  cleansheets_gk: number;
  cleansheets_def: number;
  red_cards: number;
  is_mom: boolean;
}

export interface NormalizedTeam {
  ea_club_id: number;
  ea_club_name: string;
  score: number;
  players: NormalizedPlayerStat[];
}

export interface NormalizedMatch {
  ea_match_id: string;
  played_at: string;
  home_team: NormalizedTeam;
  away_team: NormalizedTeam;
  raw_data: EAMatchPayload;
}
