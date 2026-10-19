import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { hasSupabaseAuthCookie } from '@/lib/auth-cookies';
import { verifyVerifiedUserHeaders, HEADER_AUTH_ERROR } from '@/lib/auth-server';

/**
 * Request-level memoized server-side data fetchers.
 * Uses React.cache() to deduplicate queries within a single render request.
 * Does NOT persist across different requests or users.
 */

export const getCachedUserProfile = cache(async (userId: string) => {
  if (!userId) return null;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, status')
    .eq('id', userId)
    .maybeSingle();

  return profile;
});

export const getCachedUser = cache(async () => {
  const cookieStore = await cookies();

  // 1. If no active Supabase SSR session cookie is present, visitor is unauthenticated.
  // Immediately return null without touching Supabase Auth API (0 network calls).
  if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
    return null;
  }

  // 2. Check if identity was already validated and securely signed by proxy.ts
  try {
    const headerList = await headers();
    const verifiedUser = verifyVerifiedUserHeaders(headerList);
    if (verifiedUser) {
      const profile = await getCachedUserProfile(verifiedUser.id);
      if (profile?.status === 'BANNED') {
        const supabase = createClient(cookieStore);
        await supabase.auth.signOut();
        return null;
      }
      return verifiedUser;
    }

    // Check if proxy encountered an Auth rate limit (HTTP 429)
    if (headerList.get(HEADER_AUTH_ERROR) === 'rate_limit') {
      console.warn('[getCachedUser] Proxy reported Supabase Auth rate limit, skipping redundant Auth call.');
      return null;
    }
  } catch {
    // headers() might throw in non-request contexts; gracefully continue to fallback
  }

  // 3. Fallback: If proxy did not set verified headers (e.g. isolated test or direct invocation),
  // execute standard Supabase SSR getUser()
  const supabase = createClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error && (error.status === 429 || error.message?.toLowerCase().includes('rate limit'))) {
      console.warn('[getCachedUser] Supabase Auth rate limit reached on fallback.');
    }
    return null;
  }

  const profile = await getCachedUserProfile(user.id);

  if (profile?.status === 'BANNED') {
    await supabase.auth.signOut();
    return null;
  }

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

export const getActiveLeagues = cache(async (seasonId: string) => {
  if (!seasonId) return [];
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, level, status, season_id')
    .eq('season_id', seasonId)
    .order('level', { ascending: true });

  return leagues || [];
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

export interface HeaderData {
  userProfile: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
  activeTeam: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    is_active: boolean;
  } | null;
  unreadCount: number;
}

export const getCachedHeaderData = cache(async (userId: string): Promise<HeaderData> => {
  if (!userId) {
    return {
      userProfile: null,
      activeTeam: null,
      unreadCount: 0,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    profile,
    { data: membership },
    { count }
  ] = await Promise.all([
    getCachedUserProfile(userId),
    supabase
      .from('team_memberships')
      .select('team_id')
      .eq('player_id', userId)
      .is('left_at', null)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  ]);

  let activeTeam = null;
  if (profile) {
    if (membership?.team_id) {
      const teamData = await getTeamById(membership.team_id);
      if (teamData) {
        activeTeam = teamData;
      }
    }
  }

  return {
    userProfile: profile
      ? { id: profile.id, username: profile.username, avatar_url: profile.avatar_url }
      : null,
    activeTeam,
    unreadCount: profile ? (count || 0) : 0,
  };
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
