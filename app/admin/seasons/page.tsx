
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { SeasonsManager } from './SeasonsManager';

export default async function AdminSeasonsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const { data: seasons } = await supabase.from('seasons').select('*').order('created_at', { ascending: false });

  return (
    <div className='max-w-6xl mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>SEZON YÖNETİMİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Teta League sezonlarını ve durumlarını yönetin</p>
        </div>
      </div>

      <SeasonsManager initialSeasons={seasons || []} />
    </div>
  );
}

