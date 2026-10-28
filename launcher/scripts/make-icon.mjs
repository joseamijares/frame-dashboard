// Writes a simple placeholder src/icon.png (512x512) with no dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';

const size = 512;
const bg = [13, 15, 18];
const fg = [242, 242, 242];

// Three horizontal bars, like a list.
function pixel(x, y) {
    const bars = [[150, 190], [236, 276], [322, 362]];
    const inBar = x >= 130 && x < 382 && bars.some(([a, b]) => y >= a && y < b);
    return inBar ? fg : bg;
}

const raw = Buffer.alloc((size * 3 + 1) * size);
for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
        const [r, g, b] = pixel(x, y);
        raw.set([r, g, b], row + 1 + x * 3);
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // RGB

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
]);

const out = resolve(import.meta.dirname, '..', 'src', 'icon.png');
writeFileSync(out, png);
console.log('Wrote', out);
