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