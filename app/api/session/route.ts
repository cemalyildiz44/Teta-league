import { NextResponse } from 'next/server';
import { getCachedUser, getCachedHeaderData } from '@/lib/fetchers';

// Header session data, fetched by the client Header. The root layout no longer reads cookies, so public pages
// can be cached; per-user data comes from here instead. getCachedUser() also signs BANNED users out.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const SIGNED_OUT = { user: null, userProfile: null, activeTeam: null, unreadCount: 0 };

export async function GET() {
  const user = await getCachedUser();
  if (!user) {
    return NextResponse.json(SIGNED_OUT, { headers: NO_STORE });
  }

  const { userProfile, activeTeam, unreadCount } = await getCachedHeaderData(user.id);

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email ?? null,
        user_metadata: { username: user.user_metadata?.username ?? null },
      },
      userProfile,
      activeTeam,
      unreadCount,
    },
    { headers: NO_STORE }
  );
}
