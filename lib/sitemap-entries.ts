// Pure sitemap builder: callers pass already-public rows (published news, active teams), this only shapes URLs.

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
};

const STATIC_ROUTES: Array<Omit<SitemapEntry, 'url'> & { path: string }> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/ligler', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/haberler', changeFrequency: 'daily', priority: 0.8 },
  { path: '/takimlar', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/oyuncular', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/istatistikler', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/turnuvalar', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/ekip', changeFrequency: 'monthly', priority: 0.3 },
];

const LEAGUE_TABS = ['', '/fikstur', '/istatistikler', '/kurallar'];

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildSitemapEntries(
  siteUrl: string,
  data: {
    leagues: Array<{ seasonSlug: string; leagueSlug: string; active: boolean }>;
    teams: Array<{ slug: string | null }>;
    news: Array<{ slug: string | null; published_at?: string | null; updated_at?: string | null }>;
  }
): SitemapEntry[] {
  const base = siteUrl.replace(/\/+$/, '');
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const add = (path: string, rest: Omit<SitemapEntry, 'url'>) => {
    const url = path === '/' ? base : `${base}${path}`;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, ...rest });
  };

  for (const r of STATIC_ROUTES) add(r.path, { changeFrequency: r.changeFrequency, priority: r.priority });

  for (const l of data.leagues) {
    if (!l.seasonSlug || !l.leagueSlug) continue;
    for (const tab of LEAGUE_TABS) {
      add(`/lig/${encodeURIComponent(l.seasonSlug)}/${encodeURIComponent(l.leagueSlug)}${tab}`, {
        changeFrequency: l.active ? 'daily' : 'monthly',
        priority: l.active ? (tab === '' ? 0.9 : 0.7) : 0.4,
      });
    }
  }

  for (const t of data.teams) {
    if (t.slug) add(`/takim/${encodeURIComponent(t.slug)}`, { changeFrequency: 'weekly', priority: 0.6 });
  }

  for (const n of data.news) {
    if (!n.slug) continue;
    add(`/haberler/${encodeURIComponent(n.slug)}`, {
      lastModified: toDate(n.updated_at) ?? toDate(n.published_at),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return out;
}
