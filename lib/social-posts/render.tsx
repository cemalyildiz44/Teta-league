/* eslint-disable @next/next/no-img-element -- Satori (ImageResponse) only understands plain <img> */
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PostTheme, StandingsPostRow, TotwPostPlayer } from './data';

// 1080×1350 Instagram posts drawn over the Canva backgrounds in assets/social. Everything that does not
// change week to week (titles, rank numbers, zone icons, silhouettes) is part of the background; only the
// week label, team rows and player cards are drawn here. Coordinates were measured on the original designs.

export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;
export const MAX_WEEK_LABEL = 60;

// Downloads are drawn at 2× (2160×2700) so text stays sharp after Instagram rescales; the layout keeps
// 1080×1350 coordinates and is scaled as a whole
function scaled(scale: number, post: React.ReactElement) {
  return (
    <div style={{ width: POST_WIDTH * scale, height: POST_HEIGHT * scale, display: 'flex', position: 'relative' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: POST_WIDTH, height: POST_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {post}
      </div>
    </div>
  );
}

const assetDir = join(process.cwd(), 'assets', 'social');
const asDataUrl = async (file: string, mime: string) =>
  `data:${mime};base64,${(await readFile(join(assetDir, file))).toString('base64')}`;

const [montserratRegular, montserratBold] = await Promise.all([
  readFile(join(assetDir, 'fonts', 'Montserrat-Regular.ttf')),
  readFile(join(assetDir, 'fonts', 'Montserrat-Bold.ttf')),
]);
const fonts = [
  { name: 'Montserrat', data: montserratRegular, weight: 400 as const, style: 'normal' as const },
  { name: 'Montserrat', data: montserratBold, weight: 700 as const, style: 'normal' as const },
];

const backgrounds: Record<string, Promise<string>> = {};
function background(theme: PostTheme, kind: 'standings' | 'totw') {
  const file = `${theme}-${kind}.png`;
  return (backgrounds[file] ??= asDataUrl(file, 'image/png'));
}

// Rough Montserrat Bold advance per character (em); enough to shrink long names so they stay in their box
function fitFontSize(text: string, base: number, maxWidth: number, emPerChar: number) {
  return Math.min(base, Math.floor(maxWidth / (Math.max(text.length, 1) * emPerChar)));
}

const upper = (text: string) => text.toLocaleUpperCase('tr');

// Shorter team names used on the posts, as written in the Canva design; other teams keep their full name
const POST_TEAM_NAMES: Record<string, string> = {
  'ANATOLIAN LIONS': 'ANATOLIAN LIONS',
  'ABRAKADABRA ESPORTS': 'ABRAKADABRA ESP',
  'ECL ESPORTS': 'ECL ESPORTS',
  'FC BIGBANG': 'FC BIGBANG',
  'TURAN E-SPOR KULÜBÜ': 'TURAN ESK',
  '96 BOYS': '96 BOYS',
  'TURK LEGENDS': 'TURK LEGENDS',
  'SONS UNITED': 'SONS UTD',
  'LIDERPOOL FC': 'LIDERPOOL FC',
  'BEYKOZ ESPOR': 'BEYKOZ ESP',
  'FROSTGARD FC': 'FROSTGARD FC',
  'ANADOLU ESPOR': 'ANADOLU ESP',
  'PARADOX UNITED': 'PARADOX UTD',
  'ATMACA ESPOR': 'ATMACA ESP',
  'HARCHESTER UNITED': 'HARCHESTER UTD',
};
const postTeamName = (name: string) => POST_TEAM_NAMES[upper(name)] ?? upper(name);

// Per-row vertical centers of the team name and the number columns, measured on each background
const STANDINGS_LAYOUT: Record<
  PostTheme,
  { teamX: number; teamMaxWidth: number; teamSize: number; columns: [number, number, number]; teamY: number[]; numberY: number[] }
> = {
  superlig: {
    teamX: 329,
    teamMaxWidth: 272,
    teamSize: 25,
    columns: [628, 715, 797],
    teamY: [339, 409, 475, 553, 631, 709, 777, 851, 925, 993, 1064, 1133],
    numberY: [341.5, 412.5, 480.5, 555.5, 636.5, 710.5, 781.5, 855.5, 925.5, 997.5, 1069.5, 1137.5],
  },
  ecl: {
    teamX: 298,
    teamMaxWidth: 262,
    teamSize: 27,
    columns: [596, 683, 765],
    teamY: [332, 402, 468, 546, 624, 702, 770, 844, 918, 986, 1057, 1126],
    numberY: [332.5, 402.5, 470.5, 545.5, 626.5, 701.5, 771.5, 846.5, 916.5, 988.5, 1060.5, 1128.5],
  },
};

export const STANDINGS_ROWS = 12;

export async function renderStandingsPost(theme: PostTheme, week: number, rows: StandingsPostRow[], scale = 1) {
  const layout = STANDINGS_LAYOUT[theme];
  const bg = await background(theme, 'standings');
  const LINE = 40;
  // One size for every row, small enough for the longest name
  const teamFontSize = Math.min(
    layout.teamSize,
    ...rows.slice(0, STANDINGS_ROWS).map((row) => fitFontSize(postTeamName(row.teamName), layout.teamSize, layout.teamMaxWidth, 0.69))
  );

  return new ImageResponse(
    scaled(
      scale,
      <div style={{ width: POST_WIDTH, height: POST_HEIGHT, display: 'flex', position: 'relative', fontFamily: 'Montserrat' }}>
        <img alt="" src={bg} width={POST_WIDTH} height={POST_HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }} />
        <div
          style={{ position: 'absolute', left: 618, top: 77 - LINE / 2, height: LINE, display: 'flex', alignItems: 'center', fontSize: 42, fontWeight: 700, color: 'white' }}
        >
          {`${week}.Hafta`}
        </div>
        {rows.slice(0, STANDINGS_ROWS).map((row, i) => {
          const name = postTeamName(row.teamName);
          const values = [row.played, row.goalDifference, row.points];
          return (
            <div key={i} style={{ display: 'flex', position: 'absolute', left: 0, top: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  left: layout.teamX,
                  top: layout.teamY[i] - LINE / 2,
                  height: LINE,
                  width: layout.teamMaxWidth + 20,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: teamFontSize,
                  fontWeight: 700,
                  color: 'white',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </div>
              {values.map((value, c) => (
                <div
                  key={c}
                  style={{
                    position: 'absolute',
                    left: layout.columns[c] - 50,
                    top: layout.numberY[i] - LINE / 2,
                    width: 100,
                    height: LINE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 31,
                    fontWeight: 400,
                    color: 'white',
                  }}
                >
                  {String(value)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    ),
    { width: POST_WIDTH * scale, height: POST_HEIGHT * scale, fonts }
  );
}

// Card top-left corners on the TOTW backgrounds, in 3-5-2 slot order (lib/totw.ts FORMATIONS['3-5-2'])
const TOTW_CARDS: [number, number][] = [
  [342, 386], // LST
  [594, 386], // RST
  [471, 590], // CAM
  [54, 590], // LM
  [279, 718], // LCDM
  [663, 718], // RCDM
  [888, 590], // RM
  [94, 903], // LCB
  [471, 897], // CB
  [888, 903], // RCB
  [471, 1127], // GK
];
const CARD_WIDTH = 138;
const TEAM_COLOR: Record<PostTheme, string> = { superlig: '#5a8fff', ecl: '#ff3a3a' };

export async function renderTotwPost(theme: PostTheme, week: number, players: TotwPostPlayer[], scale = 1) {
  const [bg, label] = await Promise.all([
    background(theme, 'totw'),
    asDataUrl(join('week-labels', `${theme}-${week}.png`), 'image/png'),
  ]);
  // Same team label size on every card, small enough for the longest name
  const teamFontSize = Math.min(12, ...players.map((p) => fitFontSize(postTeamName(p.teamName), 12, CARD_WIDTH - 8, 0.64)));

  return new ImageResponse(
    scaled(
      scale,
      <div style={{ width: POST_WIDTH, height: POST_HEIGHT, display: 'flex', position: 'relative', fontFamily: 'Montserrat' }}>
        <img alt="" src={bg} width={POST_WIDTH} height={POST_HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }} />
        {/* Week heading pre-rendered in TAN St. Canard (scripts/generate-week-labels.mjs) */}
        <img alt="" src={label} width={210} height={40} style={{ position: 'absolute', left: 713, top: 98 }} />
        {players.map((player) => {
          const card = TOTW_CARDS[player.slotIndex];
          if (!card) return null;
          const [left, top] = card;
          const team = postTeamName(player.teamName);
          return (
            <div key={player.slotIndex} style={{ display: 'flex', position: 'absolute', left: 0, top: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  left,
                  top: top + 140,
                  width: CARD_WIDTH,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: fitFontSize(player.playerName, 15, CARD_WIDTH - 10, 0.6),
                  fontWeight: 700,
                  color: 'white',
                  whiteSpace: 'nowrap',
                }}
              >
                {player.playerName}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left,
                  top: top + 166,
                  width: CARD_WIDTH,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: teamFontSize,
                  letterSpacing: -0.5,
                  fontWeight: 700,
                  color: TEAM_COLOR[theme],
                  whiteSpace: 'nowrap',
                }}
              >
                {team}
              </div>
            </div>
          );
        })}
      </div>
    ),
    { width: POST_WIDTH * scale, height: POST_HEIGHT * scale, fonts }
  );
}
