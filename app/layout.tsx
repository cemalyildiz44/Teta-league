import type { Metadata } from "next";
import { Exo_2 } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

const exo2 = Exo_2({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Teta League",
  description: "Teta League - EA FC Pro Clubs rekabetinin yeni adresi. Ligler, takımlar, istatistikler ve daha fazlası.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let userProfile = null;
  let activeTeam = null;
  let unreadCount = 0;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', user.id)
      .single();
    
    userProfile = profile;

    if (profile) {
      const { data: membership } = await supabase
        .from('team_memberships')
        .select('team_id, teams ( id, name, logo_url )')
        .eq('player_id', profile.id)
        .is('left_at', null)
        .limit(1)
        .single();
        
      if (membership && membership.teams) {
        activeTeam = Array.isArray(membership.teams) ? membership.teams[0] : membership.teams;
      }

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      unreadCount = count || 0;
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
