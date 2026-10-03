import { playableStages } from './stageCatalog.js';
import { createStarIcon } from './achievementStars.js';

// Presentation only: records and chapter admission are saved by the caller.
// Loading/syncing progress never calls this queue, and a reload starts empty.
export function effectiveStageStars(id, cleared = [], stageStars = {}, recordedStars = 0) {
  if (!playableStages().some(stage => stage.id === id && id !== 0)) return 0;
  return Math.max(cleared.includes(id) ? 1 : 0, stageStars[id] || 0, recordedStars || 0);
}

export function createStarRewardQueue() {
  const pending = new Map();
  return {
    add(id, before, after) {
      if (!playableStages().some(stage => stage.id === id && id !== 0)) return false;
      if (!Number.isInteger(before) || !Number.isInteger(after) || before < 0 || after > 3 || after <= before) return false;
      const indices = pending.get(id) || new Set();
      for (let i = before; i < after; i++) indices.add(i);
      pending.set(id, indices);
      return true;
    },
    take() {
      const rewards = [...pending].map(([id, indices]) => ({ id, indices: [...indices].sort() }));
      pending.clear();
      return rewards;
    }
  };
}

export const mapStarRewards = createStarRewardQueue();
const FILL_MS = 220, STAGGER_MS = 100, FLIGHT_MS = 600, REACTION_MS = 100;
const sameLayout = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Driven by the map's existing render loop, so no extra frame or delayed
// completion callback can survive navigation. All effects share one cleanup.
export function createMapStarCollection({ screen, counter, focusStage, getLayout, onComplete }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let run = null;
  function finish(completed = false) {
    if (!run) return;
    const current = run; run = null;
    current.listeners.abort();
    current.layer.remove();
    counter.endCollection();
    if (completed) onComplete();
  }
  function prepare(reward) {
    run.reward = reward;
    run.phase = 'preparing';
    run.preparedAt = performance.now();
    run.layout = null;
    run.stableFrames = 0;
    run.flights = [];
    run.lastArrivalAt = null;
    focusStage(reward.id);
  }
  return {
    get active() { return Boolean(run); },
    cancel: () => finish(),
    start(rewards) {
      if (run || !rewards.length) return false;
      const layer = document.createElement('div');
      layer.className = 'map-star-collection';
      layer.setAttribute('aria-hidden', 'true');
      document.body.append(layer);
      run = { rewards: [...rewards], layer, listeners: new AbortController() };
      counter.beginCollection(rewards.reduce((sum, reward) => sum + reward.indices.length, 0));
      const options = { signal: run.listeners.signal };
      document.addEventListener('stageMap:hidden', () => finish(), options);
      document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
      window.addEventListener('pagehide', () => finish(), options);
      window.addEventListener('resize', event => {
        // Map entry dispatches a synthetic resize while its layout settles.
        if (run?.phase === 'collecting' || event.isTrusted) finish();
        else if (run) run.stableFrames = 0;
      }, options);
      reduced.addEventListener('change', () => { if (reduced.matches) finish(true); }, options);
      prepare(run.rewards[0]);
      if (reduced.matches) finish(true);
      return true;
    },
    presentation(id, timestamp) {
      const reward = run?.rewards.find(reward => reward.id === id);
      if (!reward) return null;
      const elapsed = run.phase === 'collecting' && reward === run.reward ? timestamp - run.startedAt : -1;
      return Array.from({ length: 3 }, (_, index) => {
        const order = reward.indices.indexOf(index);
        if (order < 0) return null;
        const age = elapsed - order * STAGGER_MS;
        return { earned: age >= 0, scale: age >= 0 && age < FILL_MS ? 1 + 0.22 * Math.sin(Math.PI * age / FILL_MS) : 1 };
      });
    },
    step(timestamp) {
      if (!run) return;
      if (screen.style.display === 'none' || screen.getAttribute('aria-hidden') === 'true' || document.hidden) { finish(); return; }
      const layout = getLayout(run.reward);
      if (run.phase === 'preparing') {
        if (timestamp - run.preparedAt > 600) { finish(); return; }
        run.stableFrames = layout && sameLayout(layout, run.layout) ? run.stableFrames + 1 : 0;
        run.layout = layout;
        if (!layout || run.stableFrames < 3) return;
        run.phase = 'collecting'; run.startedAt = timestamp;
        run.flights = layout.points.map(point => {
          const icon = createStarIcon(true);
          icon.classList.add('map-collect-star');
          icon.dataset.stageId = String(run.reward.id); icon.dataset.starIndex = String(point.index);
          Object.assign(icon.style, { width: `${point.size}px`, height: `${point.size * 68 / 64}px`, visibility: 'hidden',
            transform: `translate(${point.x - point.size / 2}px, ${point.y - point.size / 2}px)` });
          run.layer.append(icon);
          return { icon, point, arrived: false };
        });
      } else if (!layout || !sameLayout(layout, run.layout)) { finish(); return; }
      const elapsed = timestamp - run.startedAt;
      let arrivedThisFrame = false;
      run.flights.forEach((flight, order) => {
        const age = elapsed - FILL_MS - order * STAGGER_MS;
        if (age < 0) return;
        if (flight.arrived) { flight.icon.remove(); return; }
        // A slow native frame can span two arrivals. Keep each +1 visible
        // for a frame instead of collapsing both into a single painted jump.
        if (age >= FLIGHT_MS && !arrivedThisFrame) {
          flight.arrived = true; counter.collectStar();
          arrivedThisFrame = true; run.lastArrivalAt = timestamp;
        }
        const t = Math.min(1, age / FLIGHT_MS), u = 1 - t;
        const start = flight.point, end = run.layout.target;
        const bend = { x: start.x + (end.x - start.x) * 0.35, y: Math.min(start.y, end.y) - Math.min(90, Math.abs(end.x - start.x) * 0.12 + 35) };
        const x = u * u * start.x + 2 * u * t * bend.x + t * t * end.x;
        const y = u * u * start.y + 2 * u * t * bend.y + t * t * end.y;
        flight.icon.style.visibility = 'visible';
        flight.icon.style.transform = `translate(${x - start.size / 2}px, ${y - start.size / 2}px) scale(${1 - 0.32 * t})`;
      });
      if (run.flights.every(flight => flight.arrived) && timestamp - run.lastArrivalAt >= REACTION_MS) {
        run.rewards.shift();
        if (run.rewards.length) prepare(run.rewards[0]);
        else finish(true);
      }
    }
  };
}
