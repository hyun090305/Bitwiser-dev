// Runs inside the browser against real Canvas operations and pixels.
import { drawGrid, drawBlock, drawWire, getWireFlowPeriod, setupCanvas } from '../src/canvas/renderer.js';
import { createCamera } from '../src/canvas/camera.js';
import { getAvailableThemes } from '../src/themes.js';
import { evaluateCircuit, getEvaluationResult, getExecutionState, tickCircuit, resetExecution } from '../src/canvas/engine.js';

const check = (value, message) => { if (!value) throw new Error(message); };
const close = (a, b, message) => check(Math.abs(a - b) < 1e-7, `${message}: ${a} vs ${b}`);

export function createGateCircuit(type) {
  const circuit = { rows: 3, cols: 5, blocks: {}, wires: {} };
  for (const [id, blockType, r, c] of [['a', 'INPUT', 0, 0], ['g', type, 0, 2], ['o', 'OUTPUT', 0, 4]]) {
    circuit.blocks[id] = { id, type: blockType, name: blockType, pos: { r, c }, value: false };
  }
  circuit.wires.a = { id: 'a', startBlockId: 'a', endBlockId: 'g', path: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] };
  circuit.wires.o = { id: 'o', startBlockId: 'g', endBlockId: 'o', path: [{ r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }] };
  if (type !== 'NOT') {
    circuit.blocks.b = { id: 'b', type: 'INPUT', name: 'INPUT', pos: { r: 2, c: 2 }, value: false };
    circuit.wires.b = { id: 'b', startBlockId: 'b', endBlockId: 'g', path: [{ r: 2, c: 2 }, { r: 1, c: 2 }, { r: 0, c: 2 }] };
  }
  return circuit;
}

export function checkGateSignals() {
  const ctx = setupCanvas(document.createElement('canvas'), 180, 180);
  let fills, strokes, labels;
  for (const method of ['fill', 'stroke', 'fillText']) {
    const native = ctx[method].bind(ctx);
    ctx[method] = (...args) => {
      if (method === 'fill') fills.push({ color: ctx.fillStyle, shadow: [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY] });
      if (method === 'stroke') strokes.push({ color: ctx.strokeStyle, width: ctx.lineWidth });
      if (method === 'fillText') labels.push({ text: args[0], color: ctx.fillStyle });
      return native(...args);
    };
  }
  const capture = (type, value, theme, scale = 1, hovered = false) => {
    ctx.clearRect(0, 0, 180, 180);
    fills = []; strokes = []; labels = [];
    const camera = createCamera({ panelWidth: 20, scale });
    camera.setViewport(180, 180); camera.pan(12, 12);
    drawBlock(ctx, { type, name: type, pos: { r: 0, c: 0 }, value }, 20, hovered, camera, { theme });
    const p = camera.cellToScreenCell({ r: 0, c: 0 }), dpr = window.devicePixelRatio;
    const pixel = [...ctx.getImageData(Math.floor((p.x + 10 * scale) * dpr), Math.floor((p.y + 10 * scale) * dpr), 1, 1).data];
    return { fills, strokes, labels, pixel, pixels: ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data };
  };
  let styles = 0;
  for (const theme of getAvailableThemes()) for (const scale of [0.2, 0.26, 0.65, 1, 1.8]) for (const hovered of [false, true]) {
    const references = ['INPUT', 'OUTPUT', 'JUNCTION'].map(type => capture(type, true, theme, scale, hovered));
    for (const type of ['AND', 'OR', 'NOT']) {
      const on = capture(type, true, theme, scale, hovered), off = capture(type, false, theme, scale, hovered);
      check(on.pixel.join() === '242,240,223,255', `${theme.id}/${scale}/${type}: active fill pixels`);
      for (const reference of references) {
        check(JSON.stringify(on.fills[0]) === JSON.stringify(reference.fills[0]), `${type}: common fill and shadow`);
      }
      check(on.labels[0].text === type && off.labels[0].text === type, `${type}: label changed`);
      check(on.labels[0].color === references[0].labels[0].color, `${type}: active text color`);
      check(JSON.stringify(on.strokes) === JSON.stringify(off.strokes), `${type}: border changed with signal`);
      for (const value of [0, null, undefined]) {
        const unknown = capture(type, value, theme, scale, hovered);
        check(off.pixels.every((v, i) => v === unknown.pixels[i]), `${type}: zero/unevaluated value lights up`);
      }
      const numeric = capture(type, 1, theme, scale, hovered);
      check(on.pixels.every((v, i) => v === numeric.pixels[i]), `${type}: numeric output 1 differs`);
      styles++;
    }
    const xorOn = capture('XOR', true, theme, scale, hovered), xorOff = capture('XOR', false, theme, scale, hovered);
    check(xorOn.pixels.every((v, i) => v === xorOff.pixels[i]), 'XOR scope expanded');
  }
  const theme = getAvailableThemes()[0];
  for (const type of ['AND', 'OR', 'NOT']) {
    const circuit = createGateCircuit(type);
    for (const [a, b] of [[false, false], [false, true], [true, false], [true, true]]) {
      circuit.blocks.a.value = a;
      if (circuit.blocks.b) circuit.blocks.b.value = b;
      evaluateCircuit(circuit);
      const expected = type === 'AND' ? a && b : type === 'OR' ? a || b : !a;
      check(getEvaluationResult(circuit).ok && circuit.blocks.g.value === expected, `${type}: truth table ${a}/${b}`);
      const face = capture(type, circuit.blocks.g.value, theme);
      check((face.fills[0].color === '#f2f0df') === expected, `${type}: evaluated signal not rendered`);
    }
    circuit.blocks.a.value = type === 'NOT' ? false : true;
    if (circuit.blocks.b) circuit.blocks.b.value = true;
    evaluateCircuit(circuit);
    check(circuit.blocks.g.value === true, `${type}: must start lit`);
    const wire = circuit.wires.a; delete circuit.wires.a;
    evaluateCircuit(circuit);
    check(!getEvaluationResult(circuit).ok && circuit.blocks.g.value === null, `${type}: failed evaluation not cleared`);
    check(capture(type, circuit.blocks.g.value, theme).fills[0].color !== '#f2f0df', `${type}: failed evaluation remains lit`);
    circuit.wires.a = wire; evaluateCircuit(circuit);
    check(circuit.blocks.g.value === true, `${type}: reconnected signal not restored`);
  }
  const memory = createGateCircuit('NOT');
  memory.blocks.q = { id: 'q', type: 'D', pos: { r: 2, c: 0 }, value: false };
  memory.wires.a.startBlockId = 'q';
  memory.wires.a.path = [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 1, c: 2 }, { r: 0, c: 2 }];
  memory.wires.d = { id: 'd', startBlockId: 'a', endBlockId: 'q', inputRole: 'D', path: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }] };
  memory.blocks.a.value = true;
  for (let i = 0; i < 40; i++) { evaluateCircuit(memory); capture('NOT', memory.blocks.g.value, theme); }
  check(getExecutionState(memory).tick === 0 && memory.blocks.q.value === false && memory.blocks.g.value === true, 'preview advanced D/tick');
  check(tickCircuit(memory).ok && getExecutionState(memory).tick === 1 && memory.blocks.q.value === true && memory.blocks.g.value === false, 'tick signal not reflected');
  check(capture('NOT', memory.blocks.g.value, theme).fills[0].color !== '#f2f0df', 'tick display remains lit');
  resetExecution(memory, { resetInputs: true });
  check(getExecutionState(memory).tick === 0 && memory.blocks.q.value === false && memory.blocks.g.value === true, 'reset signal not reflected');
  check(capture('NOT', memory.blocks.g.value, theme).fills[0].color === '#f2f0df', 'reset display remains off');
  return `${styles} gate style cases at DPR ${window.devicePixelRatio}; real truth tables, disconnection/recovery, numeric/unknown values, preview/tick/reset and unchanged XOR`;
}

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
