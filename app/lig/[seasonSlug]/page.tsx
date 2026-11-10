import { createPublicClient } from '@/utils/supabase/public';
import { redirect, notFound } from 'next/navigation';

export const revalidate = 60;

// Render each path on its first visit and cache it (ISR); without this the route renders on every request.
export async function generateStaticParams() {
  return [];
}

export default async function LegacyLeagueRedirect({ params }: { params: Promise<{ seasonSlug: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.seasonSlug;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    notFound();
  }

  const supabase = createPublicClient();

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