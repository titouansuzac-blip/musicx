// Génère des icônes PWA pixel-art (PNG) sans dépendance externe.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const PAL = [
  [255, 90, 54], [139, 92, 246], [47, 107, 255], [255, 196, 46],
];

function makeIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cells = 8;
  const cell = size / cells;
  const pad = maskable ? size * 0.12 : size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // fond noir
      let r = 13, g = 13, b = 13;
      // damier de quart de couleurs (clin d'œil au mark)
      const inside = x > pad && x < size - pad && y > pad && y < size - pad;
      if (inside) {
        const cx = Math.floor((x - pad) / ((size - 2 * pad) / cells));
        const cy = Math.floor((y - pad) / ((size - 2 * pad) / cells));
        // motif "p." pixel simple : barres + point
        const lit = (cx + cy) % 3 === 0 || cy === cells - 2 && cx === cells - 2;
        if (lit) {
          const c = PAL[(cx + cy) % PAL.length];
          [r, g, b] = c;
        }
      }
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const out = [
  ["assets/icons/icon-192.png", 192, false],
  ["assets/icons/icon-512.png", 512, false],
  ["assets/icons/icon-maskable.png", 512, true],
];

for (const [path, size, maskable] of out) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, makeIcon(size, maskable));
  console.log("écrit", path);
}
