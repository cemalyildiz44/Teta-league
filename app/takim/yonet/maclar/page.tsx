import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function CaptainMatchesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Check Captain Context
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id, teams(name)')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  if (!role || !role.team_id) redirect('/profil');
  const teamId = role.team_id;

  const { data: activeSeason } = await supabase.from('seasons').select('id, name').eq('status', 'ACTIVE').single();
  if (!activeSeason) return <div className="text-center p-8 text-white">Aktif sezon yok.</div>;

  // Fetch Fixtures for this team in active season
  // Using explicit FKs if needed, or JS mapping.
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*, matches(id, home_score, away_score, status, submitted_by)')
    .eq('season_id', activeSeason.id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: false });

  // Fetch teams for mapping
  const { data: teams } = await supabase.from('teams').select('id, name, logo_url');
  const teamMap = new Map((teams || []).map(t => [t.id, t]));

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-1">MAÇ YÖNETİMİ</h1>
            <p className="text-sm font-bold text-gray-400">
              {(role.teams as any)?.name} • {activeSeason.name}
            </p>
          </div>
          <Link href="/takim/yonet" className="px-6 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-black rounded-lg tracking-widest hover:bg-white/10 transition-all">
            GERİ DÖN
          </Link>
        </div>

        <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-[#00e5ff]">
              <tr>
                <th className="px-4 py-3">Hafta</th>
                <th className="px-4 py-3">Rakip</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Durum / Skor</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {fixtures?.map((f) => {
                const isHome = f.home_team_id === teamId;
                const opponentId = isHome ? f.away_team_id : f.home_team_id;
                const opponent = teamMap.get(opponentId) as any;
                const match = f.matches && f.matches.length > 0 ? f.matches[0] : null;
                
                return (
                  <tr key={f.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-bold text-white">Hafta {f.week_number}</td>
                    <td className="px-4 py-3 flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-500 bg-[#0a1628] px-1.5 py-0.5 rounded">{isHome ? 'EV' : 'DEP'}</span>
                      <span className="font-bold text-white">{opponent?.name}</span>
                    </td>
                    <td className="px-4 py-3">{new Date(f.scheduled_at).toLocaleString('tr-TR')}</td>
                    <td className="px-4 py-3">
                      {match ? (
                        <div className="flex items-center gap-3">
                          <span className="font-black text-white bg-[#0a1628] border border-white/10 px-2 py-1 rounded">
                            {match.home_score} - {match.away_score}
                          </span>
                          <span className={`px-2 py-1 rounded text-[10px] font-black ${
                            match.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' :
                            match.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' :
                            'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {match.status}
                          </span>
                        </div>
                      ) : (
                        <span className={`px-2 py-1 rounded text-[10px] font-black ${
                          f.status === 'SCHEDULED' ? 'bg-[#00e5ff]/10 text-[#00e5ff]' : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {f.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {match ? (
                        <Link href={`/takim/yonet/maclar/${match.id}`} className="text-[#00e5ff] font-bold text-xs hover:underline">
                          İncele / İstatistik Gir &rarr;
                        </Link>
                      ) : f.status === 'SCHEDULED' ? (
                        <Link href={`/takim/yonet/maclar/yeni?fixture=${f.id}`} className="px-3 py-1.5 bg-[#00e5ff] text-black font-black text-[10px] rounded hover:bg-[#00b8d4] transition-colors">
                          SONUÇ GİR
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-500">İşlem Yok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!fixtures || fixtures.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Fikstür bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
