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
  let chapterId = null, playing = null, timer = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ko = () => window.currentLang !== 'en';
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
    total.textContent = `★ ${totalStageStars(cleared, access.stageStars)}`;
    total.setAttribute('aria-label', `${ko() ? '누적 별' : 'Total stars'}: ${total.textContent}`);
    if (!chapter) { overlay.hidden = true; return; }
    const status = chapterAccess(id, cleared, access);
    const restricted = !fullVersion && chapter.order > 2;
    const pending = !restricted && status.unlocked && access.pendingChapters?.includes(id);
    skip.textContent = ko() ? '건너뛰기' : 'Skip';
    const loading = document.getElementById('loadingScreen');
    const ready = !loading || getComputedStyle(loading).display === 'none';
    if (pending && !playing && ready && screen.getAttribute('aria-hidden') !== 'true' && screen.style.display !== 'none') {
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
    get playing() { return Boolean(playing); },
    // Follow the canvas camera but cover only the map panel, never its title/nav.
    position(rect) {
      if (!rect) return;
      Object.assign(overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    }
  };
}
