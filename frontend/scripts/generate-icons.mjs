import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BG = [20, 98, 74];      // verde de etiqueta de preco
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, path) {
  const raw = [];
  // Tres barras horizontais: uma prateleira vista de frente.
  const bars = [[0.28, 0.36], [0.46, 0.54], [0.64, 0.72]];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filtro "none" por linha
    const yr = y / size;
    const onBar = bars.some(([a, b]) => yr >= a && yr < b);
    for (let x = 0; x < size; x++) {
      const xr = x / size;
      const inside = xr > 0.2 && xr < 0.8;
      const [r, g, b] = onBar && inside ? FG : BG;
      raw.push(r, g, b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 2;   // truecolor RGB
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, out);
  console.log('wrote', path, out.length, 'bytes');
}

mkdirSync('public', { recursive: true });
png(192, 'public/icon-192.png');
png(512, 'public/icon-512.png');
