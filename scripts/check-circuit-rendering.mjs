// Runs inside the browser against real Canvas operations and pixels.
import { drawGrid, drawBlock, drawWire, getWireFlowPeriod, setupCanvas } from '../src/canvas/renderer.js';
import { createCamera } from '../src/canvas/camera.js';
import { getAvailableThemes } from '../src/themes.js';

const check = (value, message) => { if (!value) throw new Error(message); };
const close = (a, b, message) => check(Math.abs(a - b) < 1e-7, `${message}: ${a} vs ${b}`);

export function checkGridAlignment() {
  const dpr = window.devicePixelRatio;
  const ctx = setupCanvas(document.createElement('canvas'), 1000, 800);
  let points = [], strokes = [], fills = [], borders = [];
  const point = (x, y) => ctx.getTransform().transformPoint({ x, y });
  // Forward every call to Canvas; measure the paths actually stroked/filled,
  // including the device transform, rather than comparing camera helpers.
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'strokeRect']) {
    const native = ctx[method].bind(ctx);
    ctx[method] = (...args) => {
      if (method === 'beginPath') points = [];
      if (['moveTo', 'lineTo', 'quadraticCurveTo'].includes(method)) {
        for (let i = 0; i < args.length; i += 2) points.push(point(args[i], args[i + 1]));
      }
      if (method === 'stroke') strokes.push([...points]);
      if (method === 'fill') fills.push([...points]);
      if (method === 'strokeRect') {
        const [x, y, w, h] = args;
        borders.push([point(x, y), point(x + w, y + h)]);
      }
      return native(...args);
    };
  }
  const cases = [{ scale: 1, camera: null, unbounded: false }];
  for (const scale of [0.2, 0.26, 0.65, 1, 1.8]) {
    for (const unbounded of [false, true]) {
      const camera = createCamera({ panelWidth: 30, scale });
      camera.setViewport(1000, 800); camera.pan(17, 11);
      cases.push({ scale, camera, unbounded });
    }
  }
  for (const { scale, camera, unbounded } of cases) {
    strokes = []; fills = []; borders = [];
    drawGrid(ctx, 7, 9, 30, camera, { unbounded });
    const lines = strokes.flatMap(path => Array.from({ length: path.length / 2 }, (_, i) => path.slice(i * 2, i * 2 + 2)));
    const xs = [...new Set(lines.filter(([a, b]) => a.x === b.x).map(([a]) => a.x))];
    const ys = [...new Set(lines.filter(([a, b]) => a.y === b.y).map(([a]) => a.y))];
    for (const [r, c] of [[2, 3], [0, 0], [0, 8], [6, 0], [6, 8]]) {
      fills = [];
      drawBlock(ctx, { type: 'AND', pos: { r, c }, value: false }, 30, false, camera);
      const face = fills[0];
      check(face?.length > 0, 'block fill was not drawn');
      const left = Math.min(...face.map(p => p.x)), right = Math.max(...face.map(p => p.x));
      const top = Math.min(...face.map(p => p.y)), bottom = Math.max(...face.map(p => p.y));
      close(right - left, 50 * scale * dpr, 'block width changed');
      close(bottom - top, 50 * scale * dpr, 'block height changed');
      // Independently pin block positions; moving blocks to mask the grid bug fails.
      close(left, (30 + (2 + c * 52) * scale + (camera ? 17 : 0)) * dpr, 'block x changed');
      close(top, ((2 + r * 52) * scale + (camera ? 11 : 0)) * dpr, 'block y changed');
      const x0 = Math.max(...xs.filter(x => x <= left + 1e-7));
      const x1 = Math.min(...xs.filter(x => x >= right - 1e-7));
      const y0 = Math.max(...ys.filter(y => y <= top + 1e-7));
      const y1 = Math.min(...ys.filter(y => y >= bottom - 1e-7));
      close(left - x0, x1 - right, 'horizontal grid clearance');
      close(top - y0, y1 - bottom, 'vertical grid clearance');
      close(left - x0, scale * dpr, 'grid is not at gap midpoint');
      if (!unbounded && r === 0 && c === 0) {
        check(borders.length === 1, 'finite board border missing');
        close(borders[0][0].x, x0, 'border/grid left alignment');
        close(borders[0][0].y, y0, 'border/grid top alignment');
        close(borders[0][1].x - borders[0][0].x, 9 * 52 * scale * dpr, 'border width');
        close(borders[0][1].y - borders[0][0].y, 7 * 52 * scale * dpr, 'border height');
      }
    }
    // Move a boundary to 0.25px behind the palette; antialiased strokes must
    // not leak into the panel even when the finite outer border is thick.
    if (camera) { camera.reset(); camera.setScale(scale); camera.pan(-scale - 0.25, -scale - 0.25); }
    drawGrid(ctx, 7, 9, 30, camera, { unbounded, panelFill: '#ff00ff', panelShadow: null,
      background: '#000000', gridStroke: '#00ff00', borderColor: '#00ffff', borderWidth: 3 });
    const panel = ctx.getImageData(0, 0, 30 * dpr, 800 * dpr).data;
    for (let i = 0; i < panel.length; i += 4) {
      if (camera) check(panel[i] === 255 && panel[i + 1] === 0 && panel[i + 2] === 255 && panel[i + 3] === 255, 'grid/border leaks into panel');
      else check(panel[i + 3] === 0, 'no-camera border leaks past board');
    }
  }
  return `${cases.length} actual grid/block path and border/clipping checks at DPR ${dpr}`;
}

export function checkWireGaps() {
  const ctx = setupCanvas(document.createElement('canvas'), 314, 210);
  const dpr = window.devicePixelRatio;
  const routes = [
    [[1,0],[1,1],[1,2],[1,3],[1,4],[1,5]], // straight
    [[1,1],[1,2]], // adjacent blocks
    [[0,0],[0,1],[0,2],[1,2],[2,2],[2,3]], // right-angle bends
    [[1,2],[2,2],[3,2]] // branch from the junction at (1,2)
  ];
  const rgba = (pixels, x, y) => pixels.slice((Math.floor(y * dpr) * ctx.canvas.width + Math.floor(x * dpr)) * 4,
    (Math.floor(y * dpr) * ctx.canvas.width + Math.floor(x * dpr)) * 4 + 4);
  const capture = (path, phase, theme) => {
    ctx.clearRect(0, 0, 314, 210);
    drawWire(ctx, { path: path.map(([r, c]) => ({ r, c })) }, phase, 0, null, { theme });
    return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  };
  for (const theme of getAvailableThemes()) {
    const period = getWireFlowPeriod({ theme });
    for (const route of routes) {
      const first = capture(route, 0, theme);
      const loop = capture(route, period, theme);
      check(first.every((v, i) => v === loop[i]), `${theme.id}: flow period changed`);
      let previous = first, changes = 0;
      for (let phase = 0; phase < period; phase += 2) {
        const pixels = capture(route, phase, theme);
        let painted = 0, clear = 0;
        for (let i = 1; i < route.length; i++) {
          const [r0, c0] = route[i - 1], [r1, c1] = route[i];
          for (let step = 4; step < 48; step++) {
            const x = 27 + c0 * 52 + (c1 - c0) * step;
            const y = 27 + r0 * 52 + (r1 - r0) * step;
            if (rgba(pixels, x, y)[3]) painted++; else clear++;
          }
        }
        check(painted > 0 && clear > 0, `${theme.id}: route must contain both moving dashes and transparent gaps`);
        check(rgba(pixels, 70, 65)[3] === 0, `${theme.id}: wire cell fill/shadow remains`);
        changes += pixels.some((v, i) => v !== previous[i]); previous = pixels;
      }
      check(changes > 0, `${theme.id}: dashes do not move`);
    }
    const first = capture(routes[0], 0, theme), next = capture(routes[0], 4, theme);
    // A positive phase advances four units from start to end, with identical
    // dash color/coverage, not a reversed or static animation.
    for (let x = 35; x < 275; x++) {
      check(rgba(first, x, 79).every((v, i) => v === rgba(next, x + 4, 79)[i]), `${theme.id}: flow direction/phase changed`);
    }
  }
  return '5 themes: transparent dash gaps, forward phase, loop period and motion on straight/adjacent/bent/branch routes; no off-route fill';
}
