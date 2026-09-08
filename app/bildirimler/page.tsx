import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NotificationsClient from './NotificationsClient';

export const metadata = {
  title: "Bildirimler | TETA League"
};

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris');
  }

  // Fetch all notifications for the user
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // If there are any team invitations (TRANSFER_OFFER), let's fetch the related transfer details 
  // so we can show Accept/Reject buttons directly in the notifications page.
  const transferIds = notifications?.filter(n => n.type === 'TRANSFER_OFFER').map(n => n.reference_id) || [];
  
  let transfersData: any[] = [];
  if (transferIds.length > 0) {
    const { data: tr } = await supabase
      .from('transfers')
      .select('id, status, to_team_id, teams!transfers_to_team_id_fkey(name)')
      .in('id', transferIds);
    transfersData = tr || [];
  }

  const enrichedNotifications = notifications?.map(n => {
    if (n.type === 'TRANSFER_OFFER') {
      const transfer = transfersData.find(t => t.id === n.reference_id);
      return { ...n, transfer };
    }
    return n;
  }) || [];

  return (
    <main className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[800px] mx-auto px-4 lg:px-6">
        <h1 className="text-[28px] md:text-[32px] font-[900] text-white tracking-widest uppercase mb-8">BİLDİRİMLER</h1>
        <NotificationsClient notifications={enrichedNotifications} />
      </div>
    </main>
  );
}
