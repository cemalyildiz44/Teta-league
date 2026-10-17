import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { FixtureTransferManager } from './FixtureTransferManager';

export default async function AdminFixtureTransferPage() {
  const supabase = createClient(await cookies());

  const [{ data: seasons }, { data: leagues }, { data: history }] = await Promise.all([
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id').order('level'),
    supabase
      .from('fixture_import_history')
      .select('id, created_at, season_id, league_id, week_number, export_id, checksum, file_name, result, summary, error_message')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-8">
        <Link href="/admin/fixtures" className="text-xs text-zinc-400 hover:text-[#00e5ff]">← Fikstür yönetimi</Link>
        <h1 className="text-2xl font-black text-white tracking-widest mt-2">HAFTALIK FİKSTÜR AKTARIMI</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Sezon, lig ve hafta bazında JSON dışa aktarın; dosyaları önizleyip onayladıktan sonra içe aktarın.
        </p>
      </div>
      <FixtureTransferManager seasons={seasons || []} leagues={leagues || []} history={history || []} />
    </div>
  );
}
