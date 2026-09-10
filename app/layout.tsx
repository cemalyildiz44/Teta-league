import type { Metadata } from "next";
import { Exo_2 } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

import { getCachedUser, getTeamById } from "@/lib/fetchers";

const exo2 = Exo_2({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "TETA League",
  description: "TETA League - EA FC Pro Clubs rekabetinin yeni adresi. Ligler, takımlar, istatistikler ve daha fazlası.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();

  let userProfile = null;
  let activeTeam = null;
  let unreadCount = 0;

  if (user) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [
      { data: profile },
      { data: membership },
      { count }
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', user.id)
        .single(),
      supabase
        .from('team_memberships')
        .select('team_id')
        .eq('player_id', user.id)
        .is('left_at', null)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
    ]);

    if (profile) {
      userProfile = profile;
      unreadCount = count || 0;

      if (membership?.team_id) {
        const teamData = await getTeamById(membership.team_id);
        if (teamData) {
          activeTeam = teamData;
        }
      }
    }
  }

  return (
    <html
      lang="tr"
      className={`${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Header user={user} userProfile={userProfile} activeTeam={activeTeam} unreadCount={unreadCount} />
        <main className="flex-1">{children}</main>
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
