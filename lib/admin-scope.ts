/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client rows are untyped here */

/**
 * Explicit lookups that replace PostgREST embeds the migration schema cannot resolve.
 *
 * The migrations define no direct foreign keys from `matches`/`fixtures` to `seasons`/`leagues`, nor from
 * `fixtures` or `team_memberships` to `teams` (they use composite keys through `league_teams`). Embeds such as
 * `seasons(slug)`, `leagues(name)`, `home_team:home_team_id(...)` or `teams:team_id(...)` therefore fail with PGRST200
 * on a schema built from the migrations. Reading the rows with separate, explicit queries works on any schema.
 */

/** Season slug and league name used to build revalidate paths. Missing rows or read errors give `undefined` (like a null embed). */
export async function getScopeNames(
  supabase: any,
  scope: { season_id?: string | null; league_id?: string | null }
): Promise<{ seasonSlug?: string; leagueName?: string }> {
  const [s, l] = await Promise.all([
    scope.season_id ? supabase.from('seasons').select('slug').eq('id', scope.season_id).maybeSingle() : Promise.resolve({ data: null }),
    scope.league_id ? supabase.from('leagues').select('name').eq('id', scope.league_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { seasonSlug: s.data?.slug ?? undefined, leagueName: l.data?.name ?? undefined };
}

/** Adds `teams: { id, name } | null` to rows that carry a `team_id`, using one extra query (same shape as the old embed). */
export async function attachTeamNames<T extends { team_id?: string | null }>(supabase: any, rows: T[]): Promise<(T & { teams: { id: string; name: string } | null })[]> {
  const ids = [...new Set(rows.map((r) => r.team_id).filter((x): x is string => !!x))];
  const byId = new Map<string, { id: string; name: string }>();
  if (ids.length > 0) {
    const { data } = await supabase.from('teams').select('id, name').in('id', ids);
    for (const t of data ?? []) byId.set(t.id, t);
  }
  return rows.map((r) => ({ ...r, teams: (r.team_id && byId.get(r.team_id)) || null }));
}
