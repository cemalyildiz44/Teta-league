import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SubmitMatchForm } from './SubmitMatchForm';

export default async function NewMatchPage({ searchParams }: { searchParams: Promise<{ fixture: string }> }) {
  const resolvedParams = await searchParams;
  const fixtureId = resolvedParams.fixture;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Verify Captain
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  if (!role || !role.team_id) redirect('/profil');

  if (!fixtureId) return <div className="p-8 text-white">Fikstür ID gerekli.</div>;

  const { data: fixture } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, scheduled_at, status')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return <div className="p-8 text-white">Fikstür bulunamadı.</div>;

  if (fixture.home_team_id !== role.team_id && fixture.away_team_id !== role.team_id) {
    return <div className="p-8 text-red-500">Bu maçı raporlama yetkiniz yok.</div>;
  }
  
  if (fixture.status !== 'SCHEDULED') {
    return <div className="p-8 text-yellow-500">Sadece SCHEDULED durumundaki maçlara sonuç girebilirsiniz.</div>;
  }

  const { data: homeTeam } = await supabase.from('teams').select('name').eq('id', fixture.home_team_id).single();
  const { data: awayTeam } = await supabase.from('teams').select('name').eq('id', fixture.away_team_id).single();

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-3xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-1">MAÇ SONUCU GİR</h1>
            <p className="text-sm font-bold text-gray-400">Rakiple oynadığınız maçın skorunu girin.</p>
          </div>
          <Link href="/takim/yonet/maclar" className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black rounded tracking-widest hover:bg-white/10 transition-all">
            İPTAL
          </Link>
        </div>

        <SubmitMatchForm fixture={fixture} homeTeam={homeTeam} awayTeam={awayTeam} />
      </div>
    </main>
  );
}
