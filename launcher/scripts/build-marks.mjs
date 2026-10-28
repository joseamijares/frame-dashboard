// Writes pre-coloured copies of the brand marks to src/img/tiles/<brand>.svg, using the `fg`
// colour from src/js/brands.js. Plain <img> tiles are much cheaper on the TV than CSS masks.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const src = resolve(import.meta.dirname, '..', 'src');
const sandbox = { window: {} };
vm.runInNewContext(await readFile(resolve(src, 'js/brands.js'), 'utf8'), sandbox);

await mkdir(resolve(src, 'img/tiles'), { recursive: true });
for (const brand of sandbox.window.BRANDS) {
    if (!brand.mark) continue;
    const svg = await readFile(resolve(src, 'img/marks', brand.mark + '.svg'), 'utf8');
    const coloured = svg
        .replace(/<title>.*?<\/title>/, '')
        .replace(/\sfill="[^"]*"/g, '')
        .replace(/<svg\b/, `<svg fill="${brand.fg}"`);
    await writeFile(resolve(src, 'img/tiles', brand.key + '.svg'), coloured);
}
console.log('Wrote coloured marks to src/img/tiles/');
