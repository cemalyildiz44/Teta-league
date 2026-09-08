import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NewsManager } from './NewsManager';
import { NewsArticle } from '@/types/news';

export const dynamic = 'force-dynamic';

export default async function AdminNewsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  // Check ADMIN or SUPER_ADMIN
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

  const { data: newsData } = await supabase
    .from('news')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-[1400px] mx-auto">
      <NewsManager initialNews={(newsData as NewsArticle[]) || []} />
    </div>
  );
}
