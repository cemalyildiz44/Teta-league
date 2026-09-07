import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';

export default async function LegacyLeagueRedirect({ params }: { params: Promise<{ seasonSlug: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.seasonSlug;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    notFound();
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: league } = await supabase
    .from('leagues')
    .select('name, seasons(slug)')
    .eq('id', id)
    .maybeSingle();

  if (!league || !league.seasons) {
    notFound();
  }

  const slugify = (text: string) => text.toLowerCase().replace(/\s+/g, '-');
  const seasonSlug = (league.seasons as any).slug;
  const leagueSlug = slugify(league.name);

  redirect(`/lig/${seasonSlug}/${leagueSlug}`);
}