import assert from 'node:assert/strict';
import { buildLeagueSeo, buildOpenGraph, leagueTier, HOME_TITLE, HOME_DESCRIPTION } from '../lib/seo.ts';
import { buildSitemapEntries } from '../lib/sitemap-entries.ts';

// Home: target title, description length in Google's snippet range.
assert.equal(HOME_TITLE, 'TETA League | Türkiye EA FC Pro Clubs Ligi');
assert.ok(HOME_DESCRIPTION.length >= 70 && HOME_DESCRIPTION.length <= 170, `desc length ${HOME_DESCRIPTION.length}`);

// League tiers: by level, then by name.
assert.equal(leagueTier({ name: 'Süper Lig', level: 1 }), 1);
assert.equal(leagueTier({ name: 'SÜPER LİG', level: null }), 1);
assert.equal(leagueTier({ name: 'ECL 1. Lig', level: 2 }), 2);
assert.equal(leagueTier({ name: 'ecl 1. lig' }), 2);
assert.equal(leagueTier({ name: 'Kupa', level: 3 }), null);

// Süper Lig and ECL 1. Lig get distinct titles/descriptions per tab, with canonical paths matching the routes.
const base = { seasonName: 'Sezon 6', seasonSlug: 'sezon-6' };
const sl = buildLeagueSeo({ ...base, leagueName: 'Süper Lig', level: 1, leagueSlug: 'super-lig', section: 'standings' });
const ecl = buildLeagueSeo({ ...base, leagueName: 'ECL 1. Lig', level: 2, leagueSlug: 'ecl-1-lig', section: 'standings' });
assert.equal(sl.title, 'Süper Lig Puan Durumu – Sezon 6 | TETA League');
// A "|" inside the season name must not create a second title separator.
const piped = buildLeagueSeo({ ...base, seasonName: 'TETA SEASON 6 | FC27', leagueName: 'SÜPERLİG', level: 1, leagueSlug: 'superlig', section: 'standings' });
assert.equal(piped.title, 'SÜPERLİG Puan Durumu – TETA SEASON 6 · FC27 | TETA League');
assert.equal(piped.title.split('|').length, 2);
assert.ok(!piped.description.includes('|'));
assert.equal(sl.path, '/lig/sezon-6/super-lig');
assert.match(sl.description, /en üst seviye EA FC Pro Clubs ligi/);
assert.equal(ecl.path, '/lig/sezon-6/ecl-1-lig');
assert.match(ecl.description, /ikinci seviye EA FC Pro Clubs ligi/);
assert.notEqual(sl.title, ecl.title);
assert.notEqual(sl.description, ecl.description);

const tabs = ['standings', 'fixtures', 'stats', 'rules'].map((section) => buildLeagueSeo({ ...base, leagueName: 'Süper Lig', level: 1, leagueSlug: 'super-lig', section }));
assert.deepEqual(tabs.map((t) => t.path), ['/lig/sezon-6/super-lig', '/lig/sezon-6/super-lig/fikstur', '/lig/sezon-6/super-lig/istatistikler', '/lig/sezon-6/super-lig/kurallar']);
assert.equal(new Set(tabs.map((t) => t.title)).size, 4, 'each tab has its own title');
assert.equal(new Set(tabs.map((t) => t.description)).size, 4, 'each tab has its own description');
for (const t of tabs) assert.ok(t.description.length <= 170, `${t.path} desc too long: ${t.description.length}`);

// Missing season name still produces a sentence, never "undefined".
const noSeason = buildLeagueSeo({ leagueName: 'Süper Lig', level: 1, seasonName: null, seasonSlug: 's', leagueSlug: 'super-lig', section: 'fixtures' });
assert.ok(!/undefined|null/.test(noSeason.title + noSeason.description));

// Open Graph: always carries site name/locale and falls back to the logo.
const og = buildOpenGraph({ title: 'T', description: 'D', path: '/x' });
assert.equal(og.siteName, 'TETA League');
assert.equal(og.locale, 'tr_TR');
assert.equal(og.url, '/x');
assert.equal(og.images[0].url, '/logo.jpg');
assert.deepEqual(buildOpenGraph({ title: 'T', description: 'D', path: '/x', images: ['https://cdn/x.png'] }).images, ['https://cdn/x.png']);

// Sitemap: absolute URLs, no duplicates, rows without slugs skipped, league tabs listed.
const entries = buildSitemapEntries('https://www.tetaleague.com/', {
  leagues: [
    { seasonSlug: 'sezon-6', leagueSlug: 'super-lig', active: true },
    { seasonSlug: 'sezon-6', leagueSlug: 'super-lig', active: true },
    { seasonSlug: 'sezon-5', leagueSlug: 'ecl-1-lig', active: false },
    { seasonSlug: '', leagueSlug: 'x', active: true },
  ],
  teams: [{ slug: 'takim-a' }, { slug: null }],
  news: [{ slug: 'haber-1', published_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z' }, { slug: 'haber-2', published_at: 'bad' }, { slug: null }],
});
const urls = entries.map((e) => e.url);
assert.equal(urls[0], 'https://www.tetaleague.com');
assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs');
assert.ok(urls.every((u) => u.startsWith('https://www.tetaleague.com')));
for (const p of ['/ligler', '/haberler', '/lig/sezon-6/super-lig', '/lig/sezon-6/super-lig/fikstur', '/lig/sezon-5/ecl-1-lig/kurallar', '/takim/takim-a', '/haberler/haber-1', '/haberler/haber-2']) {
  assert.ok(urls.includes(`https://www.tetaleague.com${p}`), `missing ${p}`);
}
assert.ok(!urls.some((u) => u.includes('/lig//')), 'empty season slug skipped');
assert.ok(!urls.some((u) => /admin|profil|bildirimler|\/api\//.test(u)), 'no private routes');
const h1 = entries.find((e) => e.url.endsWith('/haberler/haber-1'));
assert.equal(h1.lastModified.toISOString(), '2026-10-02T10:00:00.000Z');
assert.equal(entries.find((e) => e.url.endsWith('/haberler/haber-2')).lastModified, undefined, 'invalid date dropped');
assert.equal(entries.find((e) => e.url.endsWith('/lig/sezon-5/ecl-1-lig')).changeFrequency, 'monthly');

// Canonical origin: apex production domain maps to www; auth's getSiteUrl() stays unchanged.
const { getCanonicalSiteUrl, getSiteUrl, CANONICAL_SITE_URL } = await import('../lib/site-url.ts');
const envKeys = ['NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL', 'NEXT_PUBLIC_VERCEL_ENV', 'NODE_ENV'];
const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
const setEnv = (vars) => {
  for (const k of envKeys) delete process.env[k];
  Object.assign(process.env, vars);
};
try {
  assert.equal(CANONICAL_SITE_URL, 'https://www.tetaleague.com');
  setEnv({ NEXT_PUBLIC_SITE_URL: 'https://tetaleague.com/' });
  assert.equal(getCanonicalSiteUrl(), 'https://www.tetaleague.com');
  assert.equal(getSiteUrl(), 'https://tetaleague.com', 'auth base URL is not changed');
  setEnv({ NEXT_PUBLIC_SITE_URL: 'https://www.tetaleague.com' });
  assert.equal(getCanonicalSiteUrl(), 'https://www.tetaleague.com');
  setEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'tetaleague.com' });
  assert.equal(getCanonicalSiteUrl(), 'https://www.tetaleague.com');
  setEnv({ NODE_ENV: 'production' });
  assert.equal(getCanonicalSiteUrl(), 'https://www.tetaleague.com', 'production fallback');
  setEnv({});
  assert.equal(getCanonicalSiteUrl(), 'http://localhost:3000', 'local dev untouched');
  setEnv({ NEXT_PUBLIC_SITE_URL: 'https://staging.example.test' });
  assert.equal(getCanonicalSiteUrl(), 'https://staging.example.test', 'other hosts untouched');
} finally {
  setEnv(Object.fromEntries(Object.entries(savedEnv).filter(([, v]) => v !== undefined)));
}

console.log('test-seo-metadata: OK');
