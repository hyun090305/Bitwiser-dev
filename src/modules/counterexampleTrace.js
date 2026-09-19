import { eventSignals } from '../canvas/tracePlayback.js';

const element = (tag, className, text) => {
  const el = document.createElement(tag); el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

export function createTraceEvent(event, index) {
  const node = element('li', `trace-event trace-event--${event.type}`);
  node.dataset.eventType = event.type;
  node.dataset.eventIndex = index;
  node.append(element('div', 'trace-event__heading', `${String(index + 1).padStart(2, '0')} · ${event.type.toUpperCase()}`));
  const data = element('div', 'trace-event__data');
  if (event.type === 'tick') {
    data.append(element('strong', 'trace-event__clock', '↑'));
    node.append(data, element('span', 'trace-event__hint', 'MEMORY COMMIT'));
  } else {
    const signals = event.type === 'init' ? event.memory || [] : eventSignals(event);
    for (const signal of signals) {
      const observed = event.type === 'expect' || event.type === 'observe';
      const failed = observed && signal.passed === false;
      const bit = element('div', `trace-signal${failed ? ' trace-signal--failed' : ''}`);
      bit.append(element('span', 'trace-signal__name', signal.signal));
      const value = element('strong', 'trace-signal__value', observed ? signal.actual : signal.value);
      if (observed) value.append(element('span', 'trace-signal__verdict', failed ? '✕' : '✓'));
      bit.append(value);
      if (observed) bit.append(element('span', 'trace-signal__expected', `EXPECTED ${signal.expected}`));
      data.append(bit);
      if (failed) node.dataset.failed = 'true';
    }
    if (!signals.length) data.append(element('span', 'trace-event__hint', '∅'));
    node.append(data);
  }
  return node;
}

// One DOM node per supplied event; no sorting, coalescing, or clock assumptions.
export function createCounterexampleTrace(trace) {
  const viewport = element('div', 'counterexample-trace');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Counterexample · SET / TICK / EXPECT');
  const list = element('ol', 'counterexample-trace__events');
  const nodes = trace.map(createTraceEvent);
  list.append(...nodes); viewport.append(list);
  const controls = element('div', 'trace-navigation');
  controls.append(element('span', 'trace-navigation__count', `${trace.length} EVENTS`));
  const buttons = [-1, 1].map(direction => {
    const button = element('button', '', direction < 0 ? '←' : '→'); button.type = 'button';
    const ko = (globalThis.window?.currentLang || document.documentElement.lang) !== 'en';
    button.setAttribute('aria-label', direction < 0 ? (ko ? '이전 사건 보기' : 'Earlier events') : (ko ? '다음 사건 보기' : 'Later events'));
    button.addEventListener('click', () => { viewport.scrollLeft += direction * viewport.clientWidth * .7; });
    controls.append(button); return button;
  });
  const refresh = () => {
    buttons[0].disabled = viewport.scrollLeft <= 1;
    buttons[1].disabled = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
    controls.hidden = viewport.scrollWidth <= viewport.clientWidth + 1;
  };
  viewport.addEventListener('scroll', refresh);
  const observer = new ResizeObserver(refresh); observer.observe(viewport);
  return {
    element: viewport,
    controls,
    destroy() { observer.disconnect(); },
    focusFailure() {
      const node = nodes.find(n => n.dataset.failed === 'true');
      if (node) viewport.scrollLeft = Math.max(0, node.offsetLeft - viewport.offsetLeft - viewport.clientWidth + node.offsetWidth + 24);
      refresh();
    },
    setActive(index) {
      nodes.forEach((node, i) => {
        node.classList.toggle('is-current', i === index);
        if (i === index) node.setAttribute('aria-current', 'step');
        else node.removeAttribute('aria-current');
      });
      const node = nodes[index];
      if (node) viewport.scrollLeft = Math.max(0, node.offsetLeft - viewport.offsetLeft - viewport.clientWidth / 2 + node.offsetWidth / 2);
      refresh();
    }
  };
}
