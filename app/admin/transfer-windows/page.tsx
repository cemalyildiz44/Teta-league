import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { TransferWindowsManager } from './TransferWindowsManager';

export const metadata = {
  title: 'Transfer Pencereleri | PCL Yönetim',
  description: 'TETA League transfer ve tescil pencerelerini yönetin'
};

export default async function AdminTransferWindowsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: windows }, { data: seasons }] = await Promise.all([
    supabase
      .from('transfer_windows')
      .select('*, seasons(id, name, slug)')
      .order('created_at', { ascending: false }),
    supabase
      .from('seasons')
      .select('id, name, slug, status')
      .order('created_at', { ascending: false })
  ]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">TRANSFER PENCERELERİ</h1>
          <p className="text-sm text-zinc-400 mt-1">Resmi transfer ve tescil dönemlerini yönetin, açın veya kapatın</p>
        </div>
      </div>

      <TransferWindowsManager 
        initialWindows={(windows as any) || []} 
        seasons={seasons || []} 
      />
    </div>
  );
}
