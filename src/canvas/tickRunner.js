import { tickCircuit, resetExecution } from './evaluation.js';

const runners = new WeakMap();
export function pauseCircuit(circuit) { runners.get(circuit)?.pause(); }

export function createTickRunner(circuit, {
  interval = 500, onChange = () => {}, canRun = () => true,
  schedule = setTimeout, cancel = clearTimeout
} = {}) {
  runners.get(circuit)?.destroy();
  let timer = null;
  let running = false;
  let stepping = false;
  let destroyed = false;
  let intervalMs = Math.max(100, Number(interval) || 500);
  function pause() {
    running = false;
    if (timer !== null) cancel(timer);
    timer = null;
    onChange();
  }
  function step() {
    if (destroyed || stepping || !canRun()) { pause(); return null; }
    stepping = true;
    try {
      const result = tickCircuit(circuit);
      if (!result.ok) pause();
      onChange(result);
      return result;
    } finally { stepping = false; }
  }
  function next() {
    timer = schedule(() => {
      timer = null;
      if (!running || destroyed) return;
      step();
      if (running) next();
    }, intervalMs);
  }
  const runner = {
    step, pause, isRunning: () => running,
    getInterval: () => intervalMs,
    setInterval(nextInterval) {
      intervalMs = Math.max(100, Number(nextInterval) || 1000);
      if (running) {
        if (timer !== null) cancel(timer);
        timer = null;
        next();
      }
      onChange();
    },
    play() {
      if (running || destroyed || !canRun()) return;
      running = true;
      next();
      onChange();
    },
    reset() { pause(); resetExecution(circuit); onChange(); },
    destroy() { pause(); destroyed = true; if (runners.get(circuit) === runner) runners.delete(circuit); }
  };
  runners.set(circuit, runner);
  return runner;
}
