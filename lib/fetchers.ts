import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

/**
 * Request-level memoized server-side data fetchers.
 * Uses React.cache() to deduplicate queries within a single render request.
 * Does NOT persist across different requests or users.
 */

export const getCachedUser = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

export const getActiveSeason = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name, slug, status, roster_min, roster_max')
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (activeSeason) return activeSeason;

  const { data: latestSeason } = await supabase
    .from('seasons')
    .select('id, name, slug, status, roster_min, roster_max')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestSeason || null;
});

export const getAllTeams = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url, is_active');

  return teams || [];
});

export const getTeamBySlug = cache(async (slug: string) => {
  if (!slug) return null;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  return team;
});

export const getTeamById = cache(async (id: string) => {
  if (!id) return null;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url, is_active')
    .eq('id', id)
    .maybeSingle();

  return team;
});

export const getMatchById = cache(async (matchId: string) => {
  if (!matchId) return null;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: match } = await supabase
    .from('matches')
    .select('*, fixtures(week_number)')
    .eq('id', matchId)
    .maybeSingle();

  return match;
});

export const getProfileByUsername = cache(async (username: string) => {
  if (!username) return null;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', username)
    .maybeSingle();

  return profile;
});
