export type TournamentType = '1V1' | 'KARMA' | 'NIGHT_CUP';

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ARCHIVED';

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Tournament {
  id: string;
  season_id: string;
  name: string;
  type: TournamentType;
  description?: string | null;
  image_url?: string | null;
  banner_url?: string | null;
  rules?: string | null;
  details?: string | null;
  prize?: string | null;
  teams_per_group?: number | null;
  advancing_teams_per_group?: number | null;
  status?: TournamentStatus | string;
  discord_url?: string | null;
  max_teams?: number | null;
  registration_start?: string | null;
  registration_end?: string | null;
  tournament_date?: string | null;
  is_registration_open?: boolean;
  created_at: string;
  seasons?: {
    id: string;
    name: string;
  } | null;
}

export interface TournamentApplicationPlayer {
  id: string;
  application_id: string;
  profile_id: string;
  created_at?: string;
  profiles?: {
    id?: string;
    username: string;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface TournamentApplication {
  id: string;
  tournament_id: string;
  applicant_id: string;
  team_name: string;
  logo_url?: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  profiles?: {
    id?: string;
    username: string;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  tournament_application_players?: TournamentApplicationPlayer[];
}

export interface TournamentWinner {
  id: string;
  tournament_id: string;
  profile_id?: string | null;
  team_id?: string | null;
  application_id?: string | null;
  placement: number;
  created_at: string;
  profiles?: {
    username: string;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  teams?: {
    name: string;
    logo_url?: string | null;
  } | null;
  tournament_applications?: {
    team_name: string;
    logo_url?: string | null;
  } | null;
}

// ==============================================================================
// PHASE 2 TYPES: GROUPS, GROUP TEAMS, MATCHES, STANDINGS
// ==============================================================================

export interface TournamentGroup {
  id: string;
  tournament_id: string;
  name: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
  tournament_group_teams?: TournamentGroupTeam[];
}

export interface TournamentGroupTeam {
  id: string;
  tournament_id: string;
  group_id: string;
  application_id: string;
  seed?: number | null;
  created_at?: string;
  tournament_applications?: TournamentApplication | null;
}

export type TournamentMatchStage =
  | 'GROUP'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL';

export type TournamentMatchStatus =
  | 'SCHEDULED'
  | 'PLAYING'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  group_id?: string | null;
  home_application_id: string;
  away_application_id: string;
  stage: TournamentMatchStage;
  round_number: number;
  match_order: number;
  home_score: number | null;
  away_score: number | null;
  penalty_home_score?: number | null;
  penalty_away_score?: number | null;
  winner_application_id?: string | null;
  next_match_id?: string | null;
  bracket_slot?: string | null;
  is_bye?: boolean;
  status: TournamentMatchStatus;
  scheduled_at: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  screenshot_url?: string | null;
  created_at?: string;
  updated_at?: string;
  home?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
    applicant_id?: string;
  } | null;
  away?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
    applicant_id?: string;
  } | null;
  home_team?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
    applicant_id?: string;
  } | null;
  away_team?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
    applicant_id?: string;
  } | null;
  winner?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
    applicant_id?: string;
  } | null;
  tournament_groups?: {
    id: string;
    name: string;
  } | null;
  tournament_match_goals?: any[];
}

export interface TournamentStandingRow {
  application_id: string;
  team_name: string;
  logo_url?: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

// ==============================================================================
// PHASE 3 TYPES: MATCH SUBMISSIONS, GOALSCORERS & PROOFS
// ==============================================================================

export type TournamentMatchSubmissionStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface TournamentMatchGoal {
  id: string;
  submission_id?: string;
  match_id: string;
  tournament_id: string;
  team_application_id: string;
  player_id?: string | null;
  player_name?: string | null;
  goals: number;
  is_own_goal: boolean;
  created_at?: string;
  profiles?: {
    id: string;
    username: string;
    avatar_url?: string | null;
  } | null;
}

export interface TournamentMatchSubmission {
  id: string;
  tournament_id: string;
  match_id: string;
  submitted_by: string;
  submitted_team_application_id: string;
  home_score: number;
  away_score: number;
  screenshot_url: string;
  notes?: string | null;
  status: TournamentMatchSubmissionStatus;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  submitted_by_profile?: {
    id: string;
    username: string;
    avatar_url?: string | null;
  } | null;
  team?: {
    id: string;
    team_name: string;
    logo_url?: string | null;
  } | null;
  match?: TournamentMatch | null;
  goals?: TournamentMatchGoal[];
}
