import { CHAPTERS, chapterAccess, totalStageStars } from './stageCatalog.js';

// Admission is already persisted before this view runs. Only finishing/skipping
// the presentation acknowledges it; closing the app leaves it pending.
export function createChapterUnlockUI({ surface, screen, getAccess, getCleared, acknowledge, fullVersion = true }) {
  const el = (tag, className) => { const node = document.createElement(tag); node.className = className; return node; };
  const overlay = el('div', 'chapter-lock-overlay'); overlay.hidden = true;
  const panel = el('div', 'chapter-lock-panel'); panel.setAttribute('role', 'status');
  const icon = el('span', 'chapter-lock-icon'); icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 48 48"><path class="chapter-lock-shackle" d="M14 22V14a10 10 0 0 1 20 0v8"/><rect x="9" y="22" width="30" height="23" rx="5"/><path d="M24 30v7"/></svg>';
  const title = el('strong', 'chapter-lock-title'), requirement = el('p', 'chapter-lock-requirement');
  const skip = el('button', 'chapter-unlock-skip'); skip.type = 'button';
  panel.append(icon, title, requirement, skip); overlay.append(panel); surface.append(overlay);
  const total = el('span', 'chapter-total-stars'); total.id = 'chapterTotalStars'; screen.append(total);
  const totalIcon = el('span', 'chapter-total-star-icon'), totalValue = el('span', 'chapter-total-star-value');
  totalIcon.textContent = '★'; totalIcon.setAttribute('aria-hidden', 'true');
  total.append(totalIcon, document.createTextNode(' '), totalValue);
  total.setAttribute('role', 'status'); total.setAttribute('aria-live', 'polite'); total.setAttribute('aria-atomic', 'true');
  let chapterId = null, playing = null, timer = null;
  let collecting = false, displayedTotal = 0, reactions = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ko = () => window.currentLang !== 'en';
  const actualTotal = () => totalStageStars(getCleared(), getAccess().stageStars);
  function showTotal(value) {
    displayedTotal = value;
    if (totalValue.textContent !== String(value)) totalValue.textContent = String(value);
    const label = `${ko() ? '누적 별' : 'Total stars'}: ★ ${value}`;
    if (total.getAttribute('aria-label') !== label) total.setAttribute('aria-label', label);
  }
  function clearReactions() { reactions.forEach(animation => animation.cancel()); reactions = []; }
  const finish = () => {
    if (!playing) return;
    const id = playing; playing = null; clearTimeout(timer); acknowledge?.(id);
    overlay.classList.remove('is-unlocking'); overlay.hidden = true;
  };
  skip.addEventListener('click', finish);
  reduced.addEventListener('change', () => { if (playing && reduced.matches) { clearTimeout(timer); timer = setTimeout(finish, 100); } });
  function update(id) {
    if (id !== chapterId) finish();
    chapterId = id;
    const chapter = CHAPTERS.find(ch => ch.id === id), access = getAccess(), cleared = getCleared();
    showTotal(collecting ? displayedTotal : totalStageStars(cleared, access.stageStars));
    if (!chapter) { overlay.hidden = true; return; }
    const status = chapterAccess(id, cleared, access);
    const restricted = !fullVersion && chapter.order > 2;
    const pending = !restricted && status.unlocked && access.pendingChapters?.includes(id);
    skip.textContent = ko() ? '건너뛰기' : 'Skip';
    const loading = document.getElementById('loadingScreen');
    const ready = !loading || getComputedStyle(loading).display === 'none';
    if (pending && !collecting && !playing && ready && screen.getAttribute('aria-hidden') !== 'true' && screen.style.display !== 'none') {
      playing = id;
      overlay.classList.remove('is-unlocking');
      overlay.hidden = false; void overlay.offsetWidth; overlay.classList.add('is-unlocking');
      timer = setTimeout(finish, reduced.matches ? 100 : 900);
    }
    title.textContent = restricted ? (ko() ? '정식판 전용' : 'Full version only')
      : playing ? (ko() ? '챕터 해금' : 'Chapter unlocked') : (ko() ? '챕터 잠김' : 'Chapter locked');
    requirement.hidden = restricted;
    requirement.textContent = restricted ? '' : `★ ${status.totalStars}/${status.requiredStars}`;
    skip.hidden = !playing;
    if (!playing) overlay.hidden = status.unlocked && !restricted;
    overlay.dataset.chapterId = id;
  }
  return {
    update,
    beginCollection(count) {
      collecting = true;
      const final = actualTotal(), initial = Math.max(0, final - count);
      // Some native fallback fonts lack tabular digits. Reserve the widest
      // value in this collection so changing 0→1 cannot move the target icon.
      let width = 0;
      for (let value = initial; value <= final; value++) {
        totalValue.textContent = String(value);
        width = Math.max(width, totalValue.getBoundingClientRect().width);
      }
      totalValue.style.minWidth = `${width}px`;
      showTotal(initial);
    },
    collectStar() {
      if (!collecting) return;
      showTotal(displayedTotal + 1);
      clearReactions();
      reactions = [
        totalValue.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 100 }),
        totalIcon.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.7)', textShadow: '0 0 5px #f7d782' }, { filter: 'brightness(1)' }], { duration: 100 })
      ];
    },
    endCollection() { collecting = false; clearReactions(); totalValue.style.minWidth = ''; showTotal(actualTotal()); update(chapterId); },
    collectionTarget() {
      const rect = totalIcon.getBoundingClientRect();
      return rect.width && rect.height ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    },
    get playing() { return Boolean(playing); },
    // Follow the canvas camera but cover only the map panel, never its title/nav.
    position(rect) {
      if (!rect) return;
      Object.assign(overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    }
  };
}
