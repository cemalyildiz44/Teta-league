import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // ADMIN/SUPER_ADMIN kontrolü
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRole) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-[#060d18] pt-16 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#0a1628] border-r border-white/5 flex flex-col md:min-h-[calc(100vh-64px)]">
        <div className="p-6">
          <h2 className="text-[#00e5ff] text-xs font-black tracking-widest uppercase mb-1">PCL YÖNETİM</h2>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">{adminRole.role}</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <Link href="/admin" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Genel Bakış
          </Link>
          <Link href="/admin/seasons" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Sezonlar
          </Link>
          <Link href="/admin/matches" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Maç Onayları
          </Link>
          <Link href="/admin/matches/ea-import" className="block px-4 py-3 rounded-lg text-sm font-black text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors">
            EA İçe Aktar
          </Link>
          <Link href="/admin/leagues" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Ligler
          </Link>
          <Link href="/admin/teams" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Takımlar
          </Link>

          <Link href="/admin/fixtures" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
            Fikstürler
          </Link>
          <div className="pt-4 mt-4 border-t border-white/5">
            <h3 className="px-4 text-[10px] font-black tracking-widest text-zinc-500 mb-2 uppercase">İçerik Yönetimi</h3>
            <Link href="/admin/tournaments" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
              Turnuvalar
            </Link>
            <Link href="/admin/social" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-[#00e5ff] hover:bg-[#00e5ff]/10 transition-colors">
              Sosyal Moderasyon
            </Link>
            <Link href="/admin/achievements" className="block px-4 py-3 rounded-lg text-sm font-bold text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
              Başarı Yönetimi
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-x-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
