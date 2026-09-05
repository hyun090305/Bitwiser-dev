import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255
  ];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t)
  ];
}

function blend(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const index = (y * width + x) * 4;
  const srcAlpha = color[3] / 255;
  if (srcAlpha <= 0) return;
  const dstAlpha = buffer[index + 3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  if (outAlpha <= 0) return;
  buffer[index] = Math.round((color[0] * srcAlpha + buffer[index] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  buffer[index + 1] = Math.round((color[1] * srcAlpha + buffer[index + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  buffer[index + 2] = Math.round((color[2] * srcAlpha + buffer[index + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  buffer[index + 3] = Math.round(outAlpha * 255);
}

function roundedRectContains(px, py, x, y, w, h, r) {
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(buffer, size, x, y, w, h, r, colorAt) {
  const minX = Math.max(0, Math.floor(x));
  const maxX = Math.min(size - 1, Math.ceil(x + w));
  const minY = Math.max(0, Math.floor(y));
  const maxY = Math.min(size - 1, Math.ceil(y + h));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if (roundedRectContains(px + 0.5, py + 0.5, x, y, w, h, r)) {
        blend(buffer, size, px, py, colorAt(px, py));
      }
    }
  }
}

function strokeRoundedRect(buffer, size, x, y, w, h, r, lineWidth, color) {
  const minX = Math.max(0, Math.floor(x));
  const maxX = Math.min(size - 1, Math.ceil(x + w));
  const minY = Math.max(0, Math.floor(y));
  const maxY = Math.min(size - 1, Math.ceil(y + h));
  const ix = x + lineWidth;
  const iy = y + lineWidth;
  const iw = w - lineWidth * 2;
  const ih = h - lineWidth * 2;
  const innerRadius = Math.max(0, r - lineWidth);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const outer = roundedRectContains(px + 0.5, py + 0.5, x, y, w, h, r);
      const inner = roundedRectContains(px + 0.5, py + 0.5, ix, iy, iw, ih, innerRadius);
      if (outer && !inner) blend(buffer, size, px, py, color);
    }
  }
}

function glowRoundedRect(buffer, size, x, y, w, h, r, color, layers) {
  const iconScale = size / 1024;
  for (let i = layers; i >= 1; i -= 1) {
    const t = i / layers;
    const spread = i * 3 * iconScale;
    const alpha = Math.round(color[3] * 0.035 * t);
    fillRoundedRect(
      buffer,
      size,
      x - spread,
      y - spread,
      w + spread * 2,
      h + spread * 2,
      r + spread,
      () => [color[0], color[1], color[2], alpha]
    );
  }
}

function drawLine(buffer, size, x1, y1, x2, y2, width, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - width));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + width));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - width));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + width));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy || 1;
  const radius = width / 2;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const tx = ((px + 0.5 - x1) * dx + (py + 0.5 - y1) * dy) / lengthSq;
      const t = Math.max(0, Math.min(1, tx));
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (dist <= radius + 1) {
        const edge = clamp(radius + 1 - dist, 0, 1);
        blend(buffer, size, px, py, [color[0], color[1], color[2], Math.round(color[3] * edge)]);
      }
    }
  }
}

function drawIcon(size) {
  const buffer = new Uint8ClampedArray(size * size * 4);

  const scale = size / 1024;
  const blockSize = 900 * scale;
  const blockX = (size - blockSize) / 2;
  const blockY = (size - blockSize) / 2;
  const blockRadius = 96 * scale;
  const neonTop = parseHex('#29586e');
  const neonBottom = parseHex('#2b6680');

  glowRoundedRect(buffer, size, blockX, blockY, blockSize, blockSize, blockRadius, [56, 189, 248, 255], 11);
  fillRoundedRect(buffer, size, blockX, blockY, blockSize, blockSize, blockRadius, (px, py) => {
      const t = clamp((py - blockY) / blockSize, 0, 1);
      const mixed = mix(neonTop, neonBottom, t);
      mixed[3] = 238;
      return mixed;
  });
  strokeRoundedRect(buffer, size, blockX, blockY, blockSize, blockSize, blockRadius, 9 * scale, [94, 234, 212, 235]);

  return buffer;
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const writtenTargets = [];

for (const size of [1024, 512, 192]) {
  const png = encodePng(size, drawIcon(size));
  const target = resolve(root, 'assets', size === 1024 ? 'icon-1024.png' : `icon-${size}.png`);
  writeFileSync(target, png);
  writtenTargets.push(target);
  console.log(`Wrote ${target}`);
}

const overlayScript = resolve(root, 'scripts', 'overlay-icon-label.ps1');
const overlayResult = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', overlayScript, ...writtenTargets],
  { encoding: 'utf8' }
);

if (overlayResult.status !== 0) {
  throw new Error(`Failed to overlay icon label: ${overlayResult.stderr || overlayResult.stdout}`);
}

function createIco(entries) {
  const headerSize = 6;
  const directorySize = 16 * entries.length;
  let imageOffset = headerSize + directorySize;
  const directoryEntries = [];
  const images = [];

  for (const entry of entries) {
    const data = readFileSync(entry.path);
    const directory = Buffer.alloc(16);
    directory[0] = entry.size >= 256 ? 0 : entry.size;
    directory[1] = entry.size >= 256 ? 0 : entry.size;
    directory[2] = 0;
    directory[3] = 0;
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(data.length, 8);
    directory.writeUInt32LE(imageOffset, 12);
    directoryEntries.push(directory);
    images.push(data);
    imageOffset += data.length;
  }

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  return Buffer.concat([header, ...directoryEntries, ...images]);
}

const icoSizes = [256, 128, 64, 48, 32, 16];
const icoEntries = icoSizes.map(size => {
  const target = resolve(root, 'assets', `.icon-${size}.tmp.png`);
  writeFileSync(target, encodePng(size, drawIcon(size)));
  return { size, path: target };
});

const icoOverlayResult = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', overlayScript, ...icoEntries.map(entry => entry.path)],
  { encoding: 'utf8' }
);

if (icoOverlayResult.status !== 0) {
  throw new Error(`Failed to overlay icon label for ICO: ${icoOverlayResult.stderr || icoOverlayResult.stdout}`);
}

const icoTarget = resolve(root, 'assets', 'icon.ico');
writeFileSync(icoTarget, createIco(icoEntries));
for (const entry of icoEntries) {
  unlinkSync(entry.path);
}
console.log(`Wrote ${icoTarget}`);
