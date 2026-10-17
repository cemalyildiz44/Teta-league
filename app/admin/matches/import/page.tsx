import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { MatchImportManager } from './MatchImportManager';

export default async function AdminMatchImportPage() {
  const supabase = createClient(await cookies());

  const [{ data: seasons }, { data: leagues }, { data: history }] = await Promise.all([
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id').order('level'),
    supabase
      .from('match_import_history')
      .select('id, created_at, league_id, week_number, export_id, file_name, result, summary, error_message')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-8">
        <Link href="/admin/matches" className="text-xs text-zinc-400 hover:text-[#00e5ff]">← Maç onay ve inceleme merkezi</Link>
        <h1 className="text-2xl font-black text-white tracking-widest mt-2">HAFTALIK MAÇ SONUÇLARI AKTARIMI</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Yerel haftalık araçtan gelen <code>teta.weekly-matches</code> dosyasını önizleyin; onayladığınızda maçlar <strong>inceleme bekliyor</strong> (PENDING_REVIEW)
          olarak eklenir. Maçlar otomatik onaylanmaz; onay mevcut maç inceleme ekranından yapılır.
        </p>
      </div>
      <MatchImportManager seasons={seasons || []} leagues={leagues || []} history={history || []} />
    </div>
  );
}
