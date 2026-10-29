import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { buildSitemapEntries } from "@/lib/sitemap-entries";
import { slugify } from "@/app/lig/utils";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Anonymous client: the sitemap only ever lists rows visible to the public (RLS applies).
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

  const [seasonsRes, teamsRes, newsRes] = await Promise.all([
    supabase.from("seasons").select("slug, status, leagues(name)"),
    supabase.from("teams").select("slug").eq("is_active", true),
    supabase.from("news").select("slug, published_at, updated_at").eq("is_published", true),
  ]);

  // A failed read only drops that group; the static routes are always listed.
  const leagues = (seasonsRes.data ?? []).flatMap((s) =>
    ((s.leagues as { name: string }[] | null) ?? []).map((l) => ({
      seasonSlug: s.slug as string,
      leagueSlug: slugify(l.name),
      active: s.status === "ACTIVE" || s.status === "UPCOMING",
    }))
  );

  return buildSitemapEntries(getCanonicalSiteUrl(), {
    leagues,
    teams: teamsRes.data ?? [],
    news: newsRes.data ?? [],
  });
}
