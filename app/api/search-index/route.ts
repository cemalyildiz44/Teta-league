import { createPublicClient } from '@/utils/supabase/public';
import { getCachedPlayerRankings } from '@/app/oyuncular/rankings';

// Public search index (players and teams) for the site search. Cached for 5 minutes, so opening the search
// never runs a query per visitor or per keystroke; the browser keeps the list and filters it locally.
export const revalidate = 300;

export interface SearchIndex {
  players: { u: string; a: string | null; t: string | null; p: string | null }[];
  teams: { n: string; s: string; l: string | null }[];
}

export async function GET() {
  const supabase = createPublicClient();
  const [rankings, { data: teams }] = await Promise.all([
    getCachedPlayerRankings(),
    supabase.from('teams').select('name, slug, logo_url').eq('is_active', true).order('name'),
  ]);

  const body: SearchIndex = {
    players: rankings
      .filter((player) => player.username)
      .map((player) => ({
        u: player.username,
        a: player.avatarUrl ?? null,
        t: player.teamName ?? null,
        p: player.position ?? null,
      })),
    teams: (teams || []).map((team) => ({ n: team.name, s: team.slug, l: team.logo_url ?? null })),
  };

  return Response.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
