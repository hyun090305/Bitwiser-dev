import { calculateCircuitCost, validateStarThresholds } from './circuitCost.js';
import { createStarIcon } from './achievementStars.js';
import { createBlueprintShare } from './blueprintShare.js';

const words = {
  current: ['현재 회로 비용', 'Current circuit cost'], best: ['개인 최고 비용', 'Personal best cost'],
  none: ['기록 없음', 'No record'], pending: ['기준 준비 중', 'Targets coming soon'],
  invalid: ['별 기준 설정 확인 필요', 'Star target configuration needs attention'],
  clear: ['클리어', 'Cleared'], tutorial: ['튜토리얼 완료', 'Tutorial complete'],
  cost: ['이번 회로 비용', 'This circuit cost'], first: ['첫 기록', 'First record'],
  improved: ['개인 최고 갱신', 'New personal best'], tied: ['개인 최고와 같은 비용', 'Matches your personal best'],
  kept: ['기존 최고 기록 유지', 'Previous best retained'], all: ['모든 별 달성', 'All stars achieved'],
  less: ['다음 별까지 비용 {n} 감소', 'Reduce cost by {n} for the next star'],
  limit: ['비용 {n} 이하', 'Cost {n} or less'], highest: ['최고 획득 별', 'Best stars earned'], stars: ['별 {n}개 / 3개', '{n} of 3 stars'],
  show: ['랭킹 보기', 'Show rankings'], hide: ['랭킹 숨기기', 'Hide rankings'], ranking: ['비용 랭킹', 'Cost leaderboard'],
  loading: ['로딩 중…', 'Loading…'], submitting: ['등록 중…', 'Submitting…'],
  registered: ['등록 완료 · 개인 최고 기록', 'Registered · personal best'], unregistered: ['미등록', 'Not registered'],
  failed: ['연결 실패 · 다시 시도해 주세요', 'Connection failed · please retry'],
  submitFailed: ['등록 실패 · 로컬 결과는 유지됩니다', 'Submission failed · local result retained'],
  unavailable: ['온라인 랭킹이 연결되지 않았습니다', 'Online leaderboard is not connected'],
  restricted: ['온라인 랭킹은 정식판에서 이용할 수 있습니다', 'Online rankings are available in the full version'],
  rank: ['순위', 'Rank'], player: ['플레이어', 'Player'], value: ['비용', 'Cost'], me: ['나', 'You'],
  refresh: ['다시 불러오기', 'Refresh'], prev: ['이전', 'Previous'], next: ['다음', 'Next'],
  saveFailed: ['로컬 저장 실패 · 현재 세션에서만 유지됩니다', 'Local save failed · available in this session only'],
  unsupported: ['이 부품의 비용 정책이 아직 없습니다', 'Cost policy is unavailable for this component']
};
export const costLanguage = () => globalThis.window?.currentLang || globalThis.document?.documentElement.lang || 'ko';
export const costText = (key, lang = costLanguage()) => words[key]?.[lang === 'ko' ? 0 : 1] || key;
const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
const button = (label, action) => { const el = node('button', label); el.type = 'button'; el.addEventListener('click', action); return el; };
const format = n => n.toLocaleString('en-US');

function starBadge(count, tr) {
  const badge = node('span', null, 'cost-star-badge');
  badge.setAttribute('role', 'img'); badge.setAttribute('aria-label', tr('stars').replace('{n}', count));
  for (let tier = 1; tier <= 3; tier++) badge.append(createStarIcon(tier <= count));
  return badge;
}

export function initializeCostBoard({ getCircuit, getStage, getBest, getThresholds, onModified, lang }) {
  const host = document.getElementById('usageSection');
  if (!host) return () => {};
  const tr = key => costText(key, lang);
  const board = node('section', null, 'cost-board'); board.id = 'circuitCostBoard';
  host.querySelector('#usageTable')?.setAttribute('hidden', ''); host.prepend(board);
  let stamp = null, contextCircuit = null;
  function update() {
    const circuit = contextCircuit || getCircuit(); if (!circuit) return;
    const id = contextCircuit ? null : getStage(); const best = id == null ? null : getBest(id);
    const target = validateStarThresholds(getThresholds(id));
    let cost;
    try { cost = calculateCircuitCost(circuit); }
    catch { board.replaceChildren(node('p', tr('unsupported'))); stamp = null; return; }
    const nextStamp = JSON.stringify([id, cost, best?.totalCost, target]);
    if (stamp === nextStamp) return; stamp = nextStamp;
    board.replaceChildren(node('span', tr('current'), 'cost-label'), node('strong', format(cost.totalCost), 'cost-total'));
    if (id != null && id !== 0) {
      board.append(node('p', `${tr('best')}  ${best ? format(best.totalCost) : tr('none')}`, 'cost-best'));
      if (target.status === 'ready') {
        for (const count of [2, 3]) {
          const goal = node('p', null, 'cost-target');
          goal.append(starBadge(count, tr), node('span', `≤ ${format(count === 2 ? target.two : target.three)}`)); board.append(goal);
        }
      } else board.append(node('p', tr(target.status === 'invalid' ? 'invalid' : 'pending'), 'cost-target'));
    }
    const rankingButton = document.getElementById('viewRankingBtn');
    if (rankingButton) rankingButton.hidden = id === 0;
  }
  onModified?.(context => { if (context === 'play') update(); });
  document.addEventListener('bitwiser:stageReady', () => { contextCircuit = null; update(); });
  document.addEventListener('bitwiser:costContext', event => { contextCircuit = event.detail?.circuit || null; update(); });
  document.addEventListener('stageMap:progressUpdated', update);
  update(); return update;
}

const performances = new WeakMap();
export function disposePerformance(parent) { performances.get(parent)?.(); performances.delete(parent); }

export function renderPerformance(parent, { id, result, thresholds, ranking, lang, title = '' }) {
  disposePerformance(parent);
  lang ||= costLanguage();
  const tr = key => costText(key, lang), { record, best = record } = result;
  const layout = node('div', null, 'cost-result');
  const own = node('section', null, 'cost-performance'); layout.append(own); parent.append(layout);
  own.append(node('p', tr(id === 0 ? 'tutorial' : 'clear'), 'cost-clear'));
  const header = node('header', null, 'blueprint-header');
  header.append(node('h3', title, 'blueprint-title'));
  const cost = node('div', null, 'blueprint-cost');
  cost.append(node('span', tr('cost'), 'cost-label'), node('strong', format(record.totalCost), 'cost-result-total')); header.append(cost);
  const view = createBlueprintShare(own, { circuit: record.circuit, title, totalCost: record.totalCost,
    stars: id === 0 ? null : record.stars, tutorial: id === 0, lang }, { header });
  let frame, observer;
  const settle = () => { view.card.dataset.phase = 'settled'; };
  view.root.addEventListener('change', settle);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  view.card.dataset.phase = id === 0 || reduced.matches ? 'settled' : 'awarding';
  if (id !== 0 && !reduced.matches) {
    frame = requestAnimationFrame(() => {
      const scale = Math.min(1.65, Math.max(1, (view.card.clientWidth - 48) / 156));
      view.card.style.setProperty('--reward-scale', scale);
      view.card.style.setProperty('--reward-x', `${Math.max(0, (view.card.clientWidth - 48 - 156 * scale) / 2)}px`);
      let width = view.card.clientWidth;
      observer = new ResizeObserver(() => { if (view.card.clientWidth !== width) { width = view.card.clientWidth; settle(); } }); observer.observe(view.card);
    });
    view.card.addEventListener('animationend', event => { if (event.animationName === 'blueprint-reward-move') settle(); });
  }
  const motionChanged = () => { if (reduced.matches) settle(); }; reduced.addEventListener('change', motionChanged);
  const leave = () => disposePerformance(parent);
  document.addEventListener('bitwiser:editCircuit', leave); document.addEventListener('bitwiser:stageReady', leave);
  performances.set(parent, () => {
    cancelAnimationFrame(frame); observer?.disconnect(); reduced.removeEventListener('change', motionChanged);
    document.removeEventListener('bitwiser:editCircuit', leave); document.removeEventListener('bitwiser:stageReady', leave); view.dispose();
  });
  if (id !== 0) {
    const target = validateStarThresholds(thresholds);
    const stars = node('div', null, 'cost-stars'); stars.setAttribute('role', 'group'); stars.setAttribute('aria-label', tr('stars').replace('{n}', record.stars));
    for (let tier = 1; tier <= 3; tier++) {
      const item = node('div');
      const icon = createStarIcon(tier <= record.stars); icon.style.setProperty('--star-delay', `${(tier - 1) * 110}ms`);
      item.append(icon);
      item.append(node('small', tier === 1 ? tr('clear') : target.status === 'ready'
        ? tr('limit').replace('{n}', format(tier === 2 ? target.two : target.three))
        : `— ${tr(target.status === 'invalid' ? 'invalid' : 'pending')}`));
      stars.append(item);
    }
    header.append(stars);
    if (result.highestStars > record.stars) {
      const historical = node('p', null, 'cost-best cost-best-stars');
      historical.append(node('span', tr('highest')), starBadge(result.highestStars, tr)); own.append(historical);
    }
    if (record.stars === 3) own.append(node('p', tr('all'), 'cost-goal'));
    else if (target.status === 'ready') own.append(node('p', tr('less').replace('{n}', format(record.totalCost - (record.stars === 1 ? target.two : target.three))), 'cost-goal'));
  }
  if (id === 0) header.append(node('p', tr('tutorial'), 'blueprint-tutorial'));
  if (id !== 0) {
    own.append(node('p', `${tr('best')}  ${format(best.totalCost)}`, 'cost-best'));
    const status = result.first ? tr('first') : result.improved ? `${tr('improved')} · ${format(result.previousCost)} → ${format(record.totalCost)}`
      : tr(record.totalCost === best.totalCost ? 'tied' : 'kept');
    own.append(node('p', status, 'cost-record-status'));
  }
  if (result.saved === false) own.append(node('p', tr('saveFailed'), 'cost-warning'));
  if (id !== 0 && ranking) {
    const aside = node('aside', null, 'cost-ranking');
    const toggle = button(tr('hide'), () => {
      aside.hidden = !aside.hidden; toggle.textContent = tr(aside.hidden ? 'show' : 'hide');
      toggle.setAttribute('aria-expanded', String(!aside.hidden)); layout.classList.toggle('ranking-hidden', aside.hidden);
    });
    toggle.className = 'cost-ranking-toggle'; toggle.setAttribute('aria-expanded', 'true');
    own.append(toggle); layout.append(aside); renderCostRanking(aside, { ...ranking, lang });
  }
  return layout;
}

export function renderCostRanking(parent, { load, submit, restricted = false, lang }) {
  const tr = key => costText(key, lang);
  parent.replaceChildren(node('h3', tr('ranking')));
  if (restricted || !load) { parent.append(node('p', tr(restricted ? 'restricted' : 'unavailable'))); return; }
  const registration = node('p', submit ? tr('submitting') : '', 'cost-registration'); registration.setAttribute('role', 'status');
  const content = node('div'); content.setAttribute('aria-live', 'polite'); parent.append(registration, content);
  let revision = 0, page = 0;
  async function refresh() {
    const run = ++revision; content.replaceChildren(node('p', tr('loading'))); content.dataset.state = 'loading';
    try {
      const { entries, own } = await load(); if (run !== revision) return;
      content.dataset.state = entries.length ? 'ready' : 'empty';
      const draw = () => {
        content.replaceChildren();
        if (!entries.length) content.append(node('p', tr('none')));
        else {
          const table = node('table', null, 'cost-ranking-table'), head = node('thead'), row = node('tr');
          for (const key of ['rank','player','value']) row.append(node('th', tr(key))); head.append(row); table.append(head);
          const body = node('tbody'), visible = entries.slice(page * 8, page * 8 + 8);
          const add = (entry, target = body) => {
            const row = node('tr', null, entry.isMe ? 'cost-ranking-me' : '');
            row.append(node('td', String(entry.rank)), node('td', `${entry.nickname}${entry.isMe ? ` · ${tr('me')}` : ''}`), node('td', format(entry.totalCost))); target.append(row);
          };
          visible.forEach(entry => add(entry));
          table.append(body); const scroller = node('div', null, 'cost-ranking-scroll'); scroller.append(table); content.append(scroller);
          if (own && !visible.some(e => e.isMe)) {
            const pinned = node('table', null, 'cost-ranking-table cost-own-rank'), pinnedBody = node('tbody');
            pinned.setAttribute('aria-label', tr('me')); add(own, pinnedBody); pinned.append(pinnedBody); content.append(pinned);
          }
          if (entries.length > 8) {
            const nav = node('div', null, 'cost-ranking-pages');
            const prev = button(tr('prev'), () => { page--; draw(); }), next = button(tr('next'), () => { page++; draw(); });
            prev.disabled = page === 0; next.disabled = (page + 1) * 8 >= entries.length; nav.append(prev, node('span', `${page+1}/${Math.ceil(entries.length/8)}`), next); content.append(nav);
          }
        }
        if (!own) content.append(node('p', tr('unregistered')));
        content.append(button(tr('refresh'), refresh));
      }; page = 0; draw();
    } catch {
      if (run !== revision) return;
      content.dataset.state = 'failed'; content.replaceChildren(node('p', tr('failed')), button(tr('refresh'), refresh));
    }
  }
  refresh();
  if (submit) Promise.resolve().then(submit).then(() => {
    registration.textContent = tr('registered'); registration.dataset.state = 'registered'; return refresh();
  }).catch(() => {
    registration.textContent = tr('submitFailed'); registration.dataset.state = 'failed';
    // A read can succeed even when a submission is denied. Keep both states.
  });
}
