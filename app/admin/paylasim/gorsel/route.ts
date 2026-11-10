import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getCachedUser } from '@/lib/fetchers';
import { getPostLeague, getStandingsPostRows, getTotwPostPlayers, themeForLeague } from '@/lib/social-posts/data';
import { MAX_WEEK_LABEL, renderStandingsPost, renderTotwPost } from '@/lib/social-posts/render';

// GET /admin/paylasim/gorsel?tur=puan|totw&lig=<leagueId>&hafta=<n>[&totw=<totwWeekId>]
// Returns the weekly Instagram post as a PNG; add &indir=1 to download it as a 2160×2700 file.
export async function GET(request: Request) {
  const user = await getCachedUser();
  if (!user) return new Response('Yetkisiz', { status: 401 });

  const supabase = createClient(await cookies());
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();
  if (!role) return new Response('Yetkisiz', { status: 403 });

  const params = new URL(request.url).searchParams;
  const type = params.get('tur');
  const week = Number(params.get('hafta'));
  const league = await getPostLeague(supabase, params.get('lig') || '');
  if (!league || (type !== 'puan' && type !== 'totw')) return new Response('Geçersiz istek', { status: 400 });
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK_LABEL) {
    return new Response(`Hafta 1 ile ${MAX_WEEK_LABEL} arasında olmalı`, { status: 400 });
  }

  const theme = themeForLeague(league);
  const download = Boolean(params.get('indir'));
  const scale = download ? 2 : 1;
  let image: Response;
  if (type === 'puan') {
    image = await renderStandingsPost(theme, week, await getStandingsPostRows(supabase, league, week), scale);
  } else {
    const players = await getTotwPostPlayers(supabase, league, params.get('totw') || '');
    if (!players) return new Response('Kilitli TOTW haftası bulunamadı', { status: 404 });
    image = await renderTotwPost(theme, week, players, scale);
  }

  const headers = new Headers(image.headers);
  headers.set('Cache-Control', 'private, no-store');
  if (download) {
    const name = `${theme}-${type === 'puan' ? 'puan-durumu' : 'haftanin-takimi'}-${week}-hafta.png`;
    headers.set('Content-Disposition', `attachment; filename="${name}"`);
  }
  return new Response(image.body, { status: image.status, headers });
}
