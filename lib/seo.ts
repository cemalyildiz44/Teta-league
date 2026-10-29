// Pure SEO helpers (no Next/Supabase imports) so titles/descriptions stay unit-testable.

export const SITE_NAME = 'TETA League';
export const HOME_TITLE = 'TETA League | Türkiye EA FC Pro Clubs Ligi';
export const HOME_DESCRIPTION =
  "TETA League, Türkiye'nin EA FC Pro Clubs ligi. Süper Lig ve ECL 1. Lig puan durumları, fikstür, maç sonuçları, takım kadroları, oyuncu istatistikleri ve lig haberleri.";
export const DEFAULT_OG_IMAGE = { url: '/logo.jpg', width: 819, height: 1024, alt: 'TETA League' };

/** Shared Open Graph block: a page-level openGraph replaces the parent's, so every page passes the full set. */
export function buildOpenGraph(input: { title: string; description: string; path: string; images?: string[] }) {
  return {
    title: input.title,
    description: input.description,
    url: input.path,
    siteName: SITE_NAME,
    locale: 'tr_TR',
    type: 'website' as const,
    images: input.images && input.images.length > 0 ? input.images : [DEFAULT_OG_IMAGE],
  };
}

export type LeagueSection = 'standings' | 'fixtures' | 'stats' | 'rules';

const SECTION_PATH: Record<LeagueSection, string> = { standings: '', fixtures: '/fikstur', stats: '/istatistikler', rules: '/kurallar' };
const SECTION_LABEL: Record<LeagueSection, string> = {
  standings: 'Puan Durumu',
  fixtures: 'Fikstür ve Maç Sonuçları',
  stats: 'Oyuncu İstatistikleri',
  rules: 'Lig Kuralları',
};

export function leagueTier(league: { name: string; level?: number | null }): 1 | 2 | null {
  const name = league.name.toLocaleLowerCase('tr-TR');
  if (league.level === 1 || name.includes('süper') || name.includes('super')) return 1;
  if (league.level === 2 || name.includes('ecl')) return 2;
  return null;
}

export function buildLeagueSeo(input: {
  leagueName: string;
  level?: number | null;
  seasonName?: string | null;
  seasonSlug: string;
  leagueSlug: string;
  section: LeagueSection;
}) {
  const tier = leagueTier({ name: input.leagueName, level: input.level });
  // Season names may contain "|" (e.g. "TETA SEASON 6 | FC27"), which would read as a second title separator.
  const seasonName = input.seasonName?.replace(/\s*\|\s*/g, ' · ').trim() || null;
  const path = `/lig/${input.seasonSlug}/${input.leagueSlug}${SECTION_PATH[input.section]}`;
  const title = `${input.leagueName} ${SECTION_LABEL[input.section]}${seasonName ? ` – ${seasonName}` : ''} | ${SITE_NAME}`;

  const intro =
    tier === 1
      ? `${input.leagueName}, TETA League'in en üst seviye EA FC Pro Clubs ligi.`
      : tier === 2
        ? `${input.leagueName}, TETA League'in ikinci seviye EA FC Pro Clubs ligi.`
        : `${input.leagueName}, TETA League bünyesindeki EA FC Pro Clubs ligi.`;
  const detail: Record<LeagueSection, string> = {
    standings: `${seasonName ?? 'Güncel sezon'} puan durumu, takımlar, galibiyet-beraberlik-mağlubiyet ve averaj tablosu.`,
    fixtures: `${seasonName ?? 'Güncel sezon'} haftalık fikstürü, maç tarihleri ve sonuçları.`,
    stats: `${seasonName ?? 'Güncel sezon'} gol, asist, reyting ve gol yemeden kapatılan maç istatistikleri.`,
    rules: `${seasonName ?? 'Güncel sezon'} lig kuralları ve yarışma formatı.`,
  };

  return { title, description: `${intro} ${detail[input.section]}`, path };
}
