import { snapshotCircuit } from './circuitData.js';
import { drawStarRow } from '../modules/achievementStars.js';

// Export coordinates deliberately do not depend on CELL, camera, DPR or signals.
export const BLUEPRINT = Object.freeze({ pitch: 80, block: 60, margin: 80, ruler: 24,
  colors: ['#2563EB', '#15803D', '#B91C1C', '#C2410C', '#9333EA', '#0E7490'] });
const font = '"Noto Sans KR", Arial, sans-serif';
const compare = (a, b) => a.pos.r - b.pos.r || a.pos.c - b.pos.c || String(a.id).localeCompare(String(b.id), 'en');
const fills = { INPUT: '#F0FDF4', OUTPUT: '#FFFBEB', D: '#DBEAFE' };
const prefixes = { AND: 'A', OR: 'O', NOT: 'N', D: 'D', JUNCTION: 'J' };

export function blueprintLayout(circuit, scale = 1) {
  const snapshot = snapshotCircuit(circuit), blocks = Object.values(snapshot.blocks).sort(compare);
  if (!blocks.length) throw new Error('empty');
  const aliases = {}, counts = {}, colors = {}, sources = new Set(Object.values(snapshot.wires).map(w => w.startBlockId));
  blocks.forEach(b => {
    const alias = `${prefixes[b.type] || b.type}${counts[b.type] = (counts[b.type] || 0) + 1}`;
    const defaultName = b.name === b.type || (b.type === 'JUNCTION' && b.name === 'JUNC');
    aliases[b.id] = ['INPUT', 'OUTPUT'].includes(b.type) ? b.name || b.type : b.name && !defaultName ? b.name : alias;
    if (sources.has(b.id)) colors[b.id] = BLUEPRINT.colors[Object.keys(colors).length % BLUEPRINT.colors.length];
  });
  const points = [...blocks.map(b => b.pos), ...Object.values(snapshot.wires).flatMap(w => w.path)];
  if (points.some(p => !Number.isInteger(p.r) || !Number.isInteger(p.c))) throw new Error('Invalid coordinates');
  const minR = Math.min(...points.map(p => p.r)), maxR = Math.max(...points.map(p => p.r));
  const minC = Math.min(...points.map(p => p.c)), maxC = Math.max(...points.map(p => p.c));
  const pitch = 80 * scale, block = 60 * scale;
  const width = (maxC - minC + 3) * pitch + 24, height = (maxR - minR + 3) * pitch + 24;
  return { snapshot, blocks, aliases, colors, minR, maxR, minC, maxC, width, height, pitch, block,
    point: p => ({ x: 24 + (1.5 + p.c - minC) * pitch, y: 24 + (1.5 + p.r - minR) * pitch }) };
}

function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const char of String(text)) {
    if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}
function rect(ctx, x, y, width, height, radius = 5) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill(); ctx.stroke();
}
function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

export function drawBlueprint(ctx, layout) {
  const { snapshot, blocks, point, width, height, pitch, block } = layout, halfBlock = block / 2;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 24; x <= width; x += pitch) { ctx.moveTo(x, 24); ctx.lineTo(x, height); }
  for (let y = 24; y <= height; y += pitch) { ctx.moveTo(24, y); ctx.lineTo(width, y); }
  ctx.stroke(); ctx.fillStyle = '#64748B'; ctx.font = `11px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let c = Math.max(0, layout.minC - 1); c <= Math.min(snapshot.cols - 1, layout.maxC + 1); c++) ctx.fillText(String(c), point({ r: 0, c }).x, 12);
  for (let r = Math.max(0, layout.minR - 1); r <= Math.min(snapshot.rows - 1, layout.maxR + 1); r++) ctx.fillText(String(r), 12, point({ r, c: 0 }).y);
  const ports = [], occupied = blocks.map(b => { const p = point(b.pos); return { x: p.x - halfBlock - 2, y: p.y - halfBlock - 2, w: block + 4, h: block + 4 }; });
  for (const wire of Object.values(snapshot.wires)) {
    if (wire.path.length < 2) continue;
    const path = wire.path.map(point), first = path[0], second = path[1], last = path.at(-1), before = path.at(-2);
    const startDir = { x: Math.sign(second.x - first.x), y: Math.sign(second.y - first.y) };
    const dir = { x: Math.sign(last.x - before.x), y: Math.sign(last.y - before.y) };
    // Clip only the endpoints. Every authored bend (including self-feedback) stays put.
    path[0] = { x: first.x + startDir.x * halfBlock, y: first.y + startDir.y * halfBlock };
    const tip = path[path.length - 1] = { x: last.x - dir.x * halfBlock, y: last.y - dir.y * halfBlock };
    const color = layout.colors[wire.startBlockId] || BLUEPRINT.colors[0];
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath(); path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    const available = Math.abs(tip.x - path.at(-2).x) + Math.abs(tip.y - path.at(-2).y);
    const length = Math.min(10, available / 2), half = Math.min(4, length * .4);
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - dir.x * length - dir.y * half, tip.y - dir.y * length + dir.x * half);
    ctx.lineTo(tip.x - dir.x * length + dir.y * half, tip.y - dir.y * length - dir.x * half); ctx.closePath(); ctx.fill();
    if (snapshot.blocks[wire.endBlockId]?.type === 'D') ports.push({ tip, dir, label: ['D','EN'].includes(wire.inputRole) ? wire.inputRole : '?' });
  }
  for (const b of blocks) {
    const p = point(b.pos); ctx.fillStyle = fills[b.type] || '#F8FAFC'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5;
    rect(ctx, p.x - halfBlock, p.y - halfBlock, block, block);
    if (b.type === 'INPUT' && b.inputMode === 'button') { ctx.lineWidth = 1; rect(ctx, p.x - halfBlock + 4, p.y - halfBlock + 4, block - 8, block - 8, 3); }
    let size = 15, lines;
    do { ctx.font = `700 ${size}px ${font}`; lines = wrap(ctx, layout.aliases[b.id], block - 10); if (lines.length <= 2 || size === 12) break; size--; } while (true);
    // Reject unrepresentable labels instead of silently truncating a design's names.
    if (lines.length > 3) throw new Error('Label exceeds readable blueprint size');
    ctx.fillStyle = '#0F172A'; ctx.textAlign = 'center';
    const top = p.y - 10 - (lines.length - 1) * size / 2;
    lines.forEach((line, i) => ctx.fillText(line, p.x, top + i * size));
    ctx.font = `12px ${font}`;
    ctx.fillText(b.type === 'JUNCTION' ? 'JUNC' : b.type === 'INPUT' && b.inputMode === 'button' ? 'BUTTON' : b.type, p.x, p.y + 19);
  }
  for (const { tip, dir, label } of ports) {
    ctx.font = `500 11px ${font}`;
    const w = ctx.measureText(label).width + 6, h = 15;
    let box;
    for (const shift of [-13, 13, -24, 24]) {
      const x = tip.x - dir.x * (w / 2 + 4) + (dir.y ? shift : 0);
      const y = tip.y - dir.y * (h / 2 + 4) + (dir.x ? shift : 0);
      const candidate = { x: x - w / 2, y: y - h / 2, w, h };
      if (!occupied.some(b => intersects(candidate, b))) { box = candidate; break; }
    }
    box ||= { x: tip.x + dir.x * (w / 2 + 2) + (dir.y ? halfBlock - w / 2 - 2 : 0) - w / 2,
      y: tip.y + dir.y * (h / 2 + 2) + (dir.x ? halfBlock - h / 2 - 2 : 0) - h / 2, w, h };
    occupied.push(box); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = '#0F172A'; ctx.fillText(label, box.x + w / 2, box.y + h / 2);
  }
}

// Returns the final card and its exact blueprint region for the on-screen preview.
export async function createBlueprintPng({ circuit, title, totalCost, stars = null, tutorial = false, includeCircuit = true, lang = 'ko' }) {
  let layout = includeCircuit ? blueprintLayout(circuit) : null;
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  await document.fonts?.ready;
  if (layout) {
    // Exceptionally long real names need more paper, not flattened or tiny text.
    ctx.font = `700 12px ${font}`;
    const scale = Math.max(1, ...Object.values(layout.aliases).map(name => (ctx.measureText(name).width / 2 + 10) / 60));
    if (scale > 1) layout = blueprintLayout(layout.snapshot, scale);
  }
  const width = Math.max(600, Math.ceil(layout?.width || 0));
  ctx.font = `700 24px ${font}`;
  const lines = wrap(ctx, title, width - 250), header = Math.max(144, 48 + lines.length * 32 + 52);
  const height = header + (layout?.height || 0) + 42;
  // Fail explicitly before allocating an oversized canvas (never deliver a clipped PNG).
  if (width * 2 > 16384 || height * 2 > 16384 || width * height * 4 > 64000000) throw new Error('Blueprint exceeds PNG size limit');
  canvas.width = width * 2; canvas.height = height * 2; ctx.scale(2, 2);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0F172A'; ctx.font = `700 24px ${font}`; ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, 24, 24 + i * 32));
  if (stars !== null) drawStarRow(ctx, 24 + 76, header - 35, stars, { size: 46, gap: 5 });
  else if (tutorial) { ctx.font = `14px ${font}`; ctx.fillText(lang === 'ko' ? '튜토리얼 완료' : 'Tutorial complete', 24, header - 42); }
  ctx.textAlign = 'right'; ctx.font = `12px ${font}`; ctx.fillStyle = '#64748B';
  ctx.fillText(lang === 'ko' ? '이번 회로 비용' : 'This circuit cost', width - 24, 28);
  ctx.font = `700 36px ${font}`; ctx.fillStyle = '#0F172A'; ctx.fillText(totalCost == null ? '—' : totalCost.toLocaleString('en-US'), width - 24, 52);
  if (layout) {
    ctx.save(); ctx.translate((width - layout.width) / 2, header); drawBlueprint(ctx, layout); ctx.restore();
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, header); ctx.lineTo(width, header); ctx.stroke();
  }
  ctx.textAlign = 'left'; ctx.font = `11px ${font}`; ctx.fillStyle = '#64748B'; ctx.fillText('BITWISER', 24, height - 26);
  const preview = layout ? document.createElement('canvas') : null;
  if (preview) { preview.width = width * 2; preview.height = layout.height * 2; preview.getContext('2d').drawImage(canvas, 0, header * 2, width * 2, layout.height * 2, 0, 0, width * 2, layout.height * 2); }
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
  return { blob, preview, width: canvas.width, height: canvas.height };
}
