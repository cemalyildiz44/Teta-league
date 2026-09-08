import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export function slugify(text: string) {
  if (!text) return 'lig';
  const trMap: { [key: string]: string } = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
  };
  return text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, match => trMap[match])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export async function getLeagueBySlugs(seasonSlug: string, leagueSlug: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: season } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("slug", seasonSlug)
    .maybeSingle();

  if (!season) return null;

  const { data: leagues } = await supabase
    .from("leagues")
    .select("*")
    .eq("season_id", season.id);

  const league = (leagues || []).find(l => slugify(l.name) === leagueSlug);

  if (league) {
    league.seasons = season;
  }
  return league;
}

export interface TeamStatsComparable {
  points: number;
  goals_for: number;
  goals_against: number;
  wins: number;
}

/**
 * Common tiebreaker comparator for team standings:
 * 1. Points (descending)
 * 2. Goal Difference (descending)
 * 3. Goals Scored (descending)
 * 4. Wins (descending)
 */
export function compareTeamStats(a: TeamStatsComparable, b: TeamStatsComparable): number {
  // 1. Puan
  if (b.points !== a.points) return b.points - a.points;

  // 2. Averaj
  const gdA = (a.goals_for || 0) - (a.goals_against || 0);
  const gdB = (b.goals_for || 0) - (b.goals_against || 0);
  if (gdB !== gdA) return gdB - gdA;

  // 3. Atılan Gol
  if (b.goals_for !== a.goals_for) return (b.goals_for || 0) - (a.goals_for || 0);

  // 4. Galibiyet
  if (b.wins !== a.wins) return (b.wins || 0) - (a.wins || 0);

  return 0;
}