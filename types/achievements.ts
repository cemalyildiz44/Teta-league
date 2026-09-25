export type AchievementType =
  | 'TOTW'
  | 'MATCH_POTM'
  | 'MONTH_POTM'
  | 'POTS'
  | 'KARMA_WINNER'
  | '1V1_WINNER'
  | 'NIGHT_CUP_WINNER'
  | 'BALLON_DOR'
  | 'TOTS';

export interface PlayerAchievementRecord {
  id: string;
  player_id: string;
  achievement_type: AchievementType;
  season_id?: string | null;
  match_id?: string | null;
  week_number?: number | null;
  month_number?: number | null;
  awarded_at: string;
  awarded_by?: string | null;
}
