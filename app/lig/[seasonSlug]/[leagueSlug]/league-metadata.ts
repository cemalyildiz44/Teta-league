import type { Metadata } from "next";
import { getLeagueBySlugs, slugify } from "../../utils";
import { buildLeagueSeo, buildOpenGraph, type LeagueSection } from "@/lib/seo";

type LeagueParams = Promise<{ seasonSlug: string; leagueSlug: string }>;

/** Per-league, per-tab metadata. getLeagueBySlugs is React-cached, so the page render reuses this lookup. */
export async function buildLeagueMetadata(params: LeagueParams, section: LeagueSection): Promise<Metadata> {
  const { seasonSlug, leagueSlug } = await params;
  const league = await getLeagueBySlugs(seasonSlug, leagueSlug);
  if (!league) return { title: "Lig Bulunamadı | TETA League" };

  const seo = buildLeagueSeo({
    leagueName: league.name,
    level: league.level,
    seasonName: (league.seasons as { name?: string } | undefined)?.name,
    seasonSlug,
    leagueSlug: slugify(league.name),
    section,
  });

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: buildOpenGraph(seo),
  };
}
