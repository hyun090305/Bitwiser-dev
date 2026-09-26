import { createBlueprintPng } from '../canvas/blueprintExport.js';
import { snapshotCircuit } from '../canvas/circuitData.js';
import { createCircuitGif } from '../canvas/gifExport.js';
import { calculateCircuitCost } from './circuitCost.js';

const words = {
  copy: ['이미지 복사', 'Copy image'], save: ['이미지 저장', 'Save image'], share: ['공유하기', 'Share'],
  include: ['회로 포함', 'Include circuit'], zoom: ['설계도 확대', 'Enlarge blueprint'], close: ['닫기', 'Close'],
  preparing: ['이미지 준비 중…', 'Preparing image…'], ready: ['PNG 준비 완료', 'PNG ready'],
  failed: ['이미지를 만들지 못했습니다. 크기와 이름을 확인하고 다시 시도해 주세요.', 'Could not create the image. Check its size and labels, then retry.'],
  retry: ['다시 시도', 'Retry'], empty: ['내보낼 회로가 없습니다', 'There is no circuit to export'],
  copied: ['이미지를 복사했습니다.', 'Image copied.'], saved: ['이미지 저장을 시작했습니다.', 'Image download started.'],
  denied: ['이미지를 복사할 수 없습니다. 이미지 저장을 이용해 주세요.', 'Could not copy the image. Use Save image instead.'],
  shareFailed: ['공유하지 못했습니다. 이미지 저장을 이용해 주세요.', 'Could not share. Use Save image instead.'],
  cost: ['이번 회로 비용', 'This circuit cost'], export: ['회로 내보내기', 'Export circuit'],
  gif: ['GIF 저장', 'Save GIF'], gifFailed: ['GIF를 만들지 못했습니다. 다시 시도해 주세요.', 'Could not create the GIF. Please retry.']
};
export const blueprintText = (key, lang = 'ko') => words[key]?.[lang === 'ko' ? 0 : 1] || key;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (label, action, cls) => { const b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
function shieldDialogKeys(dialog) {
  // Native dialog defaults still handle Tab/Enter/Space/Escape and scrolling.
  // Editor shortcuts are document listeners and must not consume those keys.
  // Let keyup reach their cleanup handlers for keys held before opening.
  const shield = event => { if (dialog.open) event.stopPropagation(); };
  window.addEventListener('keydown', shield, true);
  return () => window.removeEventListener('keydown', shield, true);
}

export function createBlueprintShare(parent, options, { header, generate = createBlueprintPng, manual = false } = {}) {
  const lang = options.lang || window.currentLang || 'ko', tr = key => blueprintText(key, lang);
  // Own all input data before the first async boundary. Never read the editor again.
  const input = { ...options, lang, circuit: snapshotCircuit(options.circuit) };
  const gifCircuit = manual ? snapshotCircuit(options.circuit) : null;
  if (gifCircuit) for (const [id, block] of Object.entries(options.circuit.blocks)) gifCircuit.blocks[id].value = block.value;
  const root = el('section', null, 'blueprint-share'); parent.append(root);
  const card = el('div', null, 'blueprint-card'); root.append(card);
  if (!header) {
    header = el('header', null, 'blueprint-header');
    header.append(el('h3', input.title, 'blueprint-title'));
    const cost = el('div', null, 'blueprint-cost'); cost.append(el('span', tr('cost'), 'cost-label'), el('strong', input.totalCost == null ? '—' : input.totalCost.toLocaleString('en-US'), 'cost-result-total')); header.append(cost);
  }
  card.append(header);
  const preview = button(tr('zoom'), () => enlarge(), 'blueprint-preview'); preview.setAttribute('aria-label', tr('zoom')); preview.disabled = true;
  card.append(preview, el('footer', 'BITWISER', 'blueprint-brand'));
  const actions = el('div', null, 'blueprint-actions'), status = el('p', '', 'blueprint-status'); status.setAttribute('role', 'status');
  const copy = button(tr('copy'), async () => {
    const run = revision, current = blob; if (!current) return;
    try {
      if (!navigator.clipboard?.write || !globalThis.ClipboardItem) throw new Error('Unsupported clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': current })]);
      if (alive && run === revision) status.textContent = tr('copied');
    } catch { if (alive && run === revision) { status.textContent = tr('denied'); save.focus(); } }
  }, 'blueprint-copy');
  const save = button(tr('save'), () => { if (blob) { download(blob, 'bitwiser.png'); status.textContent = tr('saved'); } }, 'blueprint-save');
  const share = button(tr('share'), async () => {
    const run = revision, current = blob; if (!current) return;
    try { await navigator.share({ files: [new File([current], 'bitwiser.png', { type: 'image/png' })], title: input.title }); }
    catch (error) { if (error.name !== 'AbortError' && alive && run === revision) status.textContent = tr('shareFailed'); }
  }, 'blueprint-native-share'); share.hidden = true;
  const label = el('label', null, 'blueprint-include'), include = el('input'); include.type = 'checkbox'; include.checked = true;
  label.append(include, document.createTextNode(tr('include')));
  const retry = button(tr('retry'), () => prepare(), 'blueprint-retry'); retry.hidden = true;
  actions.append(copy, save, share); if (!manual) actions.append(label); actions.append(retry); root.append(actions, status);
  let revision = 0, alive = true, blob = null, zoom = null, releaseZoomKeys;
  const urls = new Map();
  function download(data, name) {
    const url = URL.createObjectURL(data), a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 30000); urls.set(url, timer);
  }
  function closeZoom() { if (!zoom) return; const dialog = zoom; zoom = null; releaseZoomKeys?.(); dialog.close(); dialog.remove(); if (alive && preview.isConnected) preview.focus(); }
  function enlarge() {
    const canvas = preview.querySelector('canvas'); if (!canvas) return;
    zoom = el('dialog', null, 'blueprint-zoom'); zoom.setAttribute('aria-label', tr('zoom'));
    const close = button(tr('close'), closeZoom), scroller = el('div', null, 'blueprint-zoom-scroll'), large = el('canvas');
    large.width = canvas.width; large.height = canvas.height; large.getContext('2d').drawImage(canvas, 0, 0); large.style.width = `${canvas.width / 2}px`;
    scroller.append(large); zoom.append(close, scroller); zoom.addEventListener('cancel', e => { e.preventDefault(); closeZoom(); }); document.body.append(zoom); releaseZoomKeys = shieldDialogKeys(zoom); zoom.showModal(); close.focus();
  }
  async function prepare() {
    const run = ++revision, showCircuit = include.checked; blob = null;
    closeZoom(); copy.disabled = save.disabled = share.disabled = preview.disabled = true; share.hidden = true; retry.hidden = true;
    preview.replaceChildren(); preview.hidden = !showCircuit; card.classList.toggle('without-circuit', !showCircuit);
    status.textContent = tr('preparing'); root.dataset.state = 'preparing';
    if (!Object.keys(input.circuit.blocks).length && manual) { status.textContent = tr('empty'); root.dataset.state = 'empty'; return; }
    try {
      const result = await generate({ ...input, includeCircuit: showCircuit });
      if (!alive || run !== revision) return;
      blob = result.blob;
      if (result.preview) { preview.replaceChildren(result.preview); preview.disabled = false; }
      copy.disabled = save.disabled = false; status.textContent = tr('ready'); root.dataset.state = 'ready';
      try { share.hidden = !navigator.share || !navigator.canShare?.({ files: [new File([blob], 'bitwiser.png', { type: 'image/png' })] }); } catch { share.hidden = true; }
      share.disabled = share.hidden;
    } catch {
      if (!alive || run !== revision) return;
      status.textContent = tr('failed'); root.dataset.state = 'failed'; retry.hidden = false;
      if (showCircuit) preview.textContent = tr('failed');
    }
  }
  include.addEventListener('change', prepare);
  if (manual) {
    const gif = button(tr('gif'), async () => {
      gif.disabled = true; status.textContent = tr('preparing');
      try { const result = await createCircuitGif(gifCircuit, { caption: input.title }); if (alive) { download(result, 'circuit.gif'); status.textContent = tr('saved'); } }
      catch { if (alive) status.textContent = tr('gifFailed'); }
      finally { if (alive) gif.disabled = false; }
    }, 'blueprint-gif'); gif.disabled = !Object.keys(input.circuit.blocks).length; actions.append(gif);
  }
  prepare();
  return { root, card, header, dispose() {
    alive = false; revision++; blob = null; closeZoom();
    card.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    preview.replaceChildren(); root.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
    for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear();
  } };
}

let activeExport;
export function openBlueprintExport(circuit, title, lang = window.currentLang || 'ko') {
  activeExport?.();
  const tr = key => blueprintText(key, lang), dialog = el('dialog', null, 'blueprint-export');
  const heading = el('h2', tr('export')); dialog.setAttribute('aria-label', tr('export')); dialog.append(heading);
  let totalCost = null; try { totalCost = calculateCircuitCost(circuit).totalCost; } catch { /* Unknown parts still have a drawable placement. */ }
  const view = createBlueprintShare(dialog, { circuit, title, totalCost, lang }, { manual: true });
  const origin = document.activeElement;
  const releaseKeys = shieldDialogKeys(dialog);
  const close = () => {
    releaseKeys();
    document.removeEventListener('bitwiser:editCircuit', close); document.removeEventListener('bitwiser:stageReady', close);
    view.dispose(); dialog.close(); dialog.remove(); activeExport = null; if (origin?.isConnected) origin.focus();
  };
  activeExport = close;
  document.addEventListener('bitwiser:editCircuit', close); document.addEventListener('bitwiser:stageReady', close);
  dialog.append(button(tr('close'), close)); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal();
  return close;
}
