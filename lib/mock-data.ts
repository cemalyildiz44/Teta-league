// Mock data for Pro Clubs League homepage
// This file contains all static/mock data used on the homepage.
// Replace with real Supabase queries when backend integration begins.

export interface Team {
  id: string;
  name: string;
  shortName: string;
}

export interface UpcomingMatch {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  time: string;
  league: string;
  week: number;
  isLive?: boolean;
  liveMinute?: number;
  homeScore?: number;
  awayScore?: number;
}

export interface RecentMatch {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  date: string;
  league: string;
  status: 'APPROVED' | 'PENDING_REVIEW';
}

export interface StandingsRow {
  rank: number;
  team: Team;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDiff: number;
  points: number;
}

export interface TopScorer {
  rank: number;
  playerName: string;
  team: Team;
  goals: number;
}

export interface TopAssister {
  rank: number;
  playerName: string;
  team: Team;
  assists: number;
}

export interface CleanSheetPlayer {
  rank: number;
  playerName: string;
  team: Team;
  cleanSheets: number;
}

export interface Transfer {
  id: string;
  playerName: string;
  fromTeam: Team | null;
  toTeam: Team;
  date: string;
}

export interface MVP {
  playerName: string;
  team: Team;
  goals: number;
  assists: number;
  rating: number;
  matchesPlayed: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: string;
}


// --- Teams ---
export const teams: Team[] = [
  { id: '1', name: 'Galactic FC', shortName: 'GAL' },
  { id: '2', name: 'Shadow Wolves', shortName: 'SHW' },
  { id: '3', name: 'Iron Legion', shortName: 'IRL' },
  { id: '4', name: 'Phoenix Rising', shortName: 'PHX' },
  { id: '5', name: 'Arctic Storm', shortName: 'ARC' },
  { id: '6', name: 'Thunder Strikers', shortName: 'THS' },
  { id: '7', name: 'Crimson Blades', shortName: 'CRB' },
  { id: '8', name: 'Neon Vipers', shortName: 'NEV' },
];

// --- Upcoming / Live Matches ---
export const upcomingMatches: UpcomingMatch[] = [
  {
    id: '1',
    homeTeam: teams[0],
    awayTeam: teams[1],
    date: '24 Ağu 2026',
    time: '21:00',
    league: 'Süper Lig',
    week: 5,
    isLive: true,
    liveMinute: 67,
    homeScore: 2,
    awayScore: 1,
  },
  {
    id: '2',
    homeTeam: teams[2],
    awayTeam: teams[3],
    date: '24 Ağu 2026',
    time: '22:00',
    league: 'Süper Lig',
    week: 5,
  },
  {
    id: '3',
    homeTeam: teams[4],
    awayTeam: teams[5],
    date: '25 Ağu 2026',
    time: '21:00',
    league: '1. Lig',
    week: 5,
  },
  {
    id: '4',
    homeTeam: teams[6],
    awayTeam: teams[7],
    date: '25 Ağu 2026',
    time: '22:30',
    league: '1. Lig',
    week: 5,
  },
];

// --- Recent Matches ---
export const recentMatches: RecentMatch[] = [
  {
    id: '1',
    homeTeam: teams[0],
    awayTeam: teams[3],
    homeScore: 3,
    awayScore: 1,
    date: '20 Ağu 2026',
    league: 'Süper Lig',
    status: 'APPROVED',
  },
  {
    id: '2',
    homeTeam: teams[1],
    awayTeam: teams[2],
    homeScore: 2,
    awayScore: 2,
    date: '20 Ağu 2026',
    league: 'Süper Lig',
    status: 'APPROVED',
  },
  {
    id: '3',
    homeTeam: teams[5],
    awayTeam: teams[4],
    homeScore: 0,
    awayScore: 1,
    date: '19 Ağu 2026',
    league: '1. Lig',
    status: 'APPROVED',
  },
  {
    id: '4',
    homeTeam: teams[7],
    awayTeam: teams[6],
    homeScore: 4,
    awayScore: 2,
    date: '19 Ağu 2026',
    league: '1. Lig',
    status: 'APPROVED',
  },
];

// --- Standings ---
export const standings: StandingsRow[] = [
  { rank: 1, team: teams[0], played: 4, wins: 3, draws: 1, losses: 0, goalDiff: 8, points: 10 },
  { rank: 2, team: teams[7], played: 4, wins: 3, draws: 0, losses: 1, goalDiff: 5, points: 9 },
  { rank: 3, team: teams[1], played: 4, wins: 2, draws: 1, losses: 1, goalDiff: 3, points: 7 },
  { rank: 4, team: teams[2], played: 4, wins: 2, draws: 1, losses: 1, goalDiff: 2, points: 7 },
  { rank: 5, team: teams[4], played: 4, wins: 2, draws: 0, losses: 2, goalDiff: 1, points: 6 },
  { rank: 6, team: teams[3], played: 4, wins: 1, draws: 1, losses: 2, goalDiff: -2, points: 4 },
  { rank: 7, team: teams[5], played: 4, wins: 1, draws: 0, losses: 3, goalDiff: -6, points: 3 },
  { rank: 8, team: teams[6], played: 4, wins: 0, draws: 0, losses: 4, goalDiff: -11, points: 0 },
];

// --- Top Scorers ---
// --- Transfers ---
export const recentTransfers: Transfer[] = [
  { id: '1', playerName: 'Serkan Polat', fromTeam: teams[3], toTeam: teams[0], date: '2 saat önce' },
  { id: '2', playerName: 'Hakan Yılmaz', fromTeam: teams[5], toTeam: teams[7], date: '5 saat önce' },
  { id: '3', playerName: 'Tolga Arslan', fromTeam: null, toTeam: teams[2], date: '1 gün önce' },
  { id: '4', playerName: 'Can Durmuş', fromTeam: teams[6], toTeam: teams[4], date: '2 gün önce' },
];

// --- MVP ---
export const mvp: MVP = {
  playerName: 'Kaan Yıldız',
  team: teams[0],
  goals: 7,
  assists: 3,
  rating: 8.4,
  matchesPlayed: 4,
};

// --- News ---
export const newsItems: NewsItem[] = [
  {
    id: '1',
    title: 'Sezon 3 Transfer Dönemi Başladı',
    summary: 'Takımlar kadrolarını güçlendirmek için harekete geçti. Transfer penceresi 25 Ağustos\'a kadar açık olacak.',
    date: '21 Ağu 2026',
    category: 'Transfer',
  },
  {
    id: '2',
    title: 'Galactic FC Liderliğini Sürdürüyor',
    summary: 'Süper Lig\'de 4 maçta 10 puan toplayan Galactic FC, rakiplerine fark atıyor.',
    date: '20 Ağu 2026',
    category: 'Lig',
  },
  {
    id: '3',
    title: 'Haftanın En İyi Golü Oylaması',
    summary: '4. haftada atılan en güzel golleri oylayın. Sonuçlar Cuma günü açıklanacak.',
    date: '19 Ağu 2026',
    category: 'Etkinlik',
  },
  {
    id: '4',
    title: '1. Lig Şampiyonluk Yarışı Kızışıyor',
    summary: 'Arctic Storm\'un son dakika golü ile kazandığı maç, 1. Lig\'deki dengeleri değiştirdi.',
    date: '19 Ağu 2026',
    category: 'Lig',
  },
];


// --- Navigation ---
export const navLinks = [
  { label: 'LİGLER', href: '/ligler' },
  { label: 'TURNUVALAR', href: '/turnuvalar' },
  { label: 'TAKIMLAR', href: '/takimlar' },
  { label: 'OYUNCULAR', href: '/oyuncular' },
  { label: 'İSTATİSTİKLER', href: '/istatistikler' },
  { label: 'SOSYAL', href: '/sosyal' },
];

export const navRightLinks = [
  { label: 'MAĞAZA', href: '/magaza' },
  { label: 'OYUNCUM', href: '/profil' },
];

export const footerLinks = {
  platform: [
    { label: 'Ligler', href: '/ligler' },
    { label: 'Takımlar', href: '/takimlar' },
    { label: 'Oyuncular', href: '/oyuncular' },
    { label: 'Sosyal', href: '/sosyal' },
  ],
  about: [
    { label: 'Hakkımızda', href: '/hakkimizda' },
    { label: 'İletişim', href: '/iletisim' },
  ],
  legal: [
    { label: 'Gizlilik', href: '/gizlilik' },
    { label: 'Kullanım Şartları', href: '/kullanim-sartlari' },
    { label: 'Çerez Politikası', href: '/cerez-politikasi' },
  ],
};
