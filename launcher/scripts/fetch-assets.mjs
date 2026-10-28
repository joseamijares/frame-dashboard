// Downloads brand marks and the UI font into src/. Run once; the results are kept in the repo.
// Marks are used as CSS masks, so only their shape matters (colour comes from js/brands.js).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const SI = 'https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/';
const CBI = 'https://raw.githubusercontent.com/elax46/custom-brand-icons/a53cabf49bf439023a8f33585af30d783bffe51b/icon-svg/';

const marks = {
    netflix: SI + 'netflix.svg',
    youtube: SI + 'youtube.svg',
    primevideo: SI + 'primevideo.svg',
    appletv: SI + 'appletv.svg',
    spotify: SI + 'spotify.svg',
    plex: SI + 'plex.svg',
    twitch: SI + 'twitch.svg',
    max: SI + 'max.svg',
    crunchyroll: SI + 'crunchyroll.svg',
    dazn: SI + 'dazn.svg',
    movistar: SI + 'movistar.svg',
    playstation: SI + 'playstation.svg',
    nintendoswitch: SI + 'nintendoswitch.svg',
    disneyplus: CBI + 'disney-plus.svg',
    xbox: CBI + 'xbox.svg'
};

// All SIL Open Font License; each family ships with its own notice. Geist and Instrument Serif
// are copied from the dashboard (public/fonts); their notices are fetched here too.
const FS = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/';
const fonts = {
    'manrope.woff2': FS + 'manrope@5.1.0/files/manrope-latin-wght-normal.woff2',
    'inter.woff2': FS + 'inter@5.1.0/files/inter-latin-wght-normal.woff2',
    'outfit.woff2': FS + 'outfit@5.1.0/files/outfit-latin-wght-normal.woff2',
    'dm-sans.woff2': FS + 'dm-sans@5.1.0/files/dm-sans-latin-wght-normal.woff2',
    'OFL-manrope.txt': FS + 'manrope@5.1.0/LICENSE',
    'OFL-inter.txt': FS + 'inter@5.1.0/LICENSE',
    'OFL-outfit.txt': FS + 'outfit@5.1.0/LICENSE',
    'OFL-dm-sans.txt': FS + 'dm-sans@5.1.0/LICENSE',
    'OFL-geist.txt': 'https://raw.githubusercontent.com/vercel/geist-font/b5d164a0c066c2c9bfcd5ab65dd8244551f0ac06/OFL.txt',
    'OFL-instrument-serif.txt': 'https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.1.0/LICENSE'
};

const src = resolve(here, '..', 'src');

async function get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

await mkdir(resolve(src, 'img/marks'), { recursive: true });
await mkdir(resolve(src, 'fonts'), { recursive: true });

const lines = ['# Brand marks', '', 'Trademarks belong to their owners; used here only to identify apps and devices.', ''];
for (const [name, url] of Object.entries(marks)) {
    await writeFile(resolve(src, 'img/marks', name + '.svg'), await get(url));
    lines.push(`- ${name}.svg: ${url} (${url.startsWith(SI) ? 'Simple Icons, CC0' : 'Custom Brand Icons, MIT'})`);
    console.log('mark', name);
}
await writeFile(resolve(src, 'img/marks/SOURCES.md'), lines.join('\n') + '\n');
// Custom Brand Icons is MIT: its notice travels with the marks.
await writeFile(resolve(src, 'img/marks/LICENSE-custom-brand-icons.txt'), await get(CBI.replace('icon-svg/', 'LICENSE')));

for (const [name, url] of Object.entries(fonts)) {
    await writeFile(resolve(src, 'fonts', name), await get(url));
    console.log('font', name);
}
