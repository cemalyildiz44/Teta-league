// Renders the "N.HAFTA" headings of the weekly TOTW post in TAN St. Canard as transparent PNGs.
// The font is commercial and stays out of the (public) repository; only the rendered labels are committed.
// Usage: node scripts/generate-week-labels.mjs "<path to TAN St. Canard Regular.otf>" [maxWeek]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js';

// Rendered at 2x; the post template draws them at half size (210 × 40)
const LABEL_WIDTH = 420;
const LABEL_HEIGHT = 80;
const COLORS = { superlig: '#5470ff', ecl: '#ff4545' };

const [fontPath, maxArg] = process.argv.slice(2);
if (!fontPath) {
  console.error('Font path required');
  process.exit(1);
}
const font = await readFile(fontPath);
const maxWeek = Number(maxArg) || 60;
const outDir = join(process.cwd(), 'assets', 'social', 'week-labels');
await mkdir(outDir, { recursive: true });

for (const [theme, color] of Object.entries(COLORS)) {
  for (let week = 1; week <= maxWeek; week++) {
    const image = new ImageResponse(
      h(
        'div',
        { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } },
        h('div', { style: { fontFamily: 'Canard', fontSize: 60, color, lineHeight: 1 } }, `${week}.HAFTA`)
      ),
      { width: LABEL_WIDTH, height: LABEL_HEIGHT, fonts: [{ name: 'Canard', data: font, weight: 400, style: 'normal' }] }
    );
    await writeFile(join(outDir, `${theme}-${week}.png`), Buffer.from(await image.arrayBuffer()));
  }
}
console.log(`Wrote ${maxWeek * 2} labels to ${outDir}`);
