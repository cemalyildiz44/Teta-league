import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { EAImportManager } from './EAImportManager';

export default async function EAImportPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: seasons }, { data: leagues }, { data: fixtureWeeks }] = await Promise.all([
    supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id, level').order('level'),
    supabase.from('fixtures').select('league_id, week_number').limit(5000),
  ]);

  // distinct weeks per league, for the week selector
  const weeksByLeague: Record<string, number[]> = {};
  for (const f of fixtureWeeks || []) {
    const list = (weeksByLeague[f.league_id] ??= []);
    if (!list.includes(f.week_number)) list.push(f.week_number);
  }
  for (const k of Object.keys(weeksByLeague)) weeksByLeague[k].sort((a, b) => a - b);

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='mb-8'>
        <h1 className='text-2xl font-black text-white tracking-widest uppercase mb-1'>EA MAÇ İÇE AKTARMA (JSON)</h1>
        <p className='text-sm text-zinc-400'>
          Yerel haftalık araçtan gelen <code>teta.weekly-matches</code> dosyasını yükleyin; maçları tek tek <strong>onaya gönderin</strong>.
          Gönderilen maçlar <strong>PENDING_REVIEW</strong> olarak Maç Onay ve İnceleme Merkezi&apos;ne düşer; oyuncu eşleştirme, istatistik/skor düzenleme, onay ve reddetme orada yapılır.
        </p>
      </div>
      <EAImportManager seasons={seasons || []} leagues={leagues || []} weeksByLeague={weeksByLeague} />
    </div>
  );
}
