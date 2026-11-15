// A synthetic 256 px map picture, made here so the browser runs need no network and no image file in git.
// Synthetic: never a picture of any real place.
import { deflateSync } from "node:zlib";

const size = 256;
const square = 32;

/** RGB. A checkerboard, so a turned or zoomed globe shows a different picture in the same spot. */
export const tileColours = { light: [94, 140, 84], dark: [52, 92, 120] } as const;

let cached: Buffer | null = null;

/** One PNG, the same bytes for every z, x and y. */
export function syntheticTile(): Buffer {
  cached ??= encodePng(size, size, (x, y) => (Math.floor(x / square) + Math.floor(y / square)) % 2 === 0 ? tileColours.light : tileColours.dark);
  return cached;
}

function encodePng(width: number, height: number, colourAt: (x: number, y: number) => readonly number[]): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    rows[start] = 0;
    for (let x = 0; x < width; x++) rows.set(colourAt(x, y), start + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
