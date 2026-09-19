// Shared geometry keeps canvas rewards and the result screen visually consistent.
const POINTS = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + i * Math.PI / 5;
  const radius = i % 2 ? 13.5 : 28;
  return [32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius];
});
const PATH = `M${POINTS.map(p => p.join(',')).join('L')}Z`;
const FACETS = POINTS.map((p, i) => [p, POINTS[(i + 1) % 10], [32, 31]]);
const GOLD_STOPS = [['0', '#e2d09a'], ['1', '#cfb575']];
const GOLD_EDGE = '#c5ac70';
let nextIconId = 0;

export function createStarIcon(earned) {
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const icon = make('svg', { viewBox: '0 0 64 68', class: `achievement-star ${earned ? 'earned' : 'unearned'}`, 'aria-hidden': 'true', focusable: 'false' });
  const id = `reward-gold-${++nextIconId}`;
  if (earned) {
    const defs = make('defs', {}), gradient = make('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
    for (const [offset, color] of GOLD_STOPS) {
      gradient.append(make('stop', { offset, 'stop-color': color }));
    }
    defs.append(gradient); icon.append(defs);
  }
  icon.append(make('path', { d: PATH, fill: earned ? `url(#${id})` : '#1c2b3e', stroke: earned ? GOLD_EDGE : '#42556b', 'stroke-width': '1.6', 'stroke-linejoin': 'round' }));
  if (earned) FACETS.forEach((points, i) => {
    icon.append(make('polygon', { points: points.map(p => p.join(',')).join(' '), fill: i % 2 ? '#9c5414' : '#fffbe1', opacity: i % 2 ? '0.025' : '0.08' }));
  });
  return icon;
}

function trace(ctx, points) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
}

export function drawStarRow(ctx, x, y, earned, { size = 30, gap = 4, total = 3 } = {}) {
  const width = total * size + (total - 1) * gap;
  for (let i = 0; i < total; i++) {
    const active = i < earned;
    ctx.save();
    ctx.translate(x - width / 2 + i * (size + gap), y - size / 2);
    ctx.scale(size / 64, size / 64);
    ctx.lineJoin = 'round';
    const gold = ctx.createLinearGradient(0, 4, 0, 60);
    for (const [offset, color] of GOLD_STOPS) gold.addColorStop(Number(offset), color);
    trace(ctx, POINTS); ctx.fillStyle = active ? gold : '#1c2b3e';
    ctx.strokeStyle = active ? GOLD_EDGE : '#42556b'; ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
    if (active) FACETS.forEach((points, index) => {
      trace(ctx, points); ctx.fillStyle = index % 2 ? 'rgba(156,84,20,0.025)' : 'rgba(255,251,225,0.08)'; ctx.fill();
    });
    ctx.restore();
  }
}
