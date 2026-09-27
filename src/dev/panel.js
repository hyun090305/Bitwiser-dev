import { CHAPTERS, playableStages, chapterAccess } from '../modules/stageCatalog.js';
import { getLevelTitle } from '../modules/levels.js';

export function mountProgressPanel(store) {
  const en = window.currentLang === 'en';
  const text = (ko, english) => en ? english : ko;
  const el = (tag, content, id) => {
    const node = document.createElement(tag);
    if (content) node.textContent = content;
    if (id) node.id = id;
    return node;
  };
  const button = (label, action, id) => {
    const b = el('button', label, id); b.type = 'button'; b.addEventListener('click', action); return b;
  };
  const select = (id, choices) => {
    const node = el('select', '', id);
    for (const [value, label] of choices) node.add(new Option(label, value));
    return node;
  };
  const label = (caption, control) => {
    const row = el('label', caption); row.htmlFor = control.id; row.append(control); return row;
  };
  const panel = el('dialog', '', 'devProgressPanel');
  panel.setAttribute('aria-labelledby', 'devProgressTitle');
  const toggle = button('DEV', () => panel.open ? panel.close() : panel.showModal(), 'devProgressToggle');
  toggle.title = text('진행 상태 조작 · Ctrl+Shift+D', 'Progress controls · Ctrl+Shift+D');
  toggle.setAttribute('aria-haspopup', 'dialog');
  const header = el('div'); header.className = 'dev-panel-header';
  header.append(el('h2', text('DEV · 진행 상태', 'DEV · Progress'), 'devProgressTitle'),
    button(text('닫기', 'Close'), () => panel.close(), 'devProgressClose'));
  panel.append(header, el('p', text('별도 테스트 기록 · 계정/랭킹 연결 없음', 'Separate test progress · accounts/rankings offline')));
  const fields = el('fieldset'); fields.append(el('legend', text('Chapter 접근 상태', 'Chapter access')));
  const chapterSelects = new Map();
  for (const ch of CHAPTERS) {
    const control = select(`dev-${ch.id}`, [['default', text('기본 규칙', 'Default rules')], ['locked', text('강제 잠금', 'Force locked')], ['unlocked', text('강제 해금', 'Force unlocked')]]);
    const status = el('span'); status.className = 'dev-chapter-status';
    const row = label(`Ch.${ch.order} · ${ch.title}`, control); row.append(status);
    control.addEventListener('change', () => store.setChapter(ch.id, control.value));
    chapterSelects.set(ch.id, { control, status }); fields.append(row);
  }
  const accessButtons = el('div'); accessButtons.className = 'dev-panel-actions';
  accessButtons.append(button(text('전체 해금', 'Unlock all'), () => store.unlockAll(), 'devUnlockAll'),
    button(text('기본 규칙으로', 'Use default rules'), () => store.defaultAccess(), 'devDefaultAccess'));
  fields.append(accessButtons);
  const stageFields = el('fieldset'); stageFields.append(el('legend', text('스테이지 진행', 'Stage progress')));
  const stageSelect = select('devStage', playableStages().map(s => [s.id, `Ch.${s.chapterId.slice(-1)} · ${s.id} · ${getLevelTitle(s.id)}`]));
  const stageState = select('devStageState', []);
  const refreshStage = () => {
    const id = Number(stageSelect.value), entry = store.snapshot().stages[id];
    stageState.replaceChildren(new Option(text('미클리어', 'Not cleared'), 'uncleared'));
    if (id === 0) stageState.add(new Option(text('클리어 (튜토리얼: 별 없음)', 'Cleared (tutorial: no stars)'), '1'));
    else for (const stars of [1, 2, 3]) stageState.add(new Option(`${text('클리어', 'Cleared')} · ${'★'.repeat(stars)}`, String(stars)));
    stageState.value = entry?.cleared ? String(id === 0 ? 1 : entry.stars) : 'uncleared';
  };
  stageSelect.addEventListener('change', refreshStage);
  stageState.addEventListener('change', () => store.setStage(Number(stageSelect.value), stageState.value === 'uncleared' ? null : Number(stageState.value)));
  stageFields.append(label(text('문제', 'Stage'), stageSelect), label(text('클리어 / 별', 'Clear / stars'), stageState));
  const presetFields = el('fieldset'); presetFields.append(el('legend', text('진행 상태 프리셋', 'Progress presets')));
  const preset = select('devPreset', [
    ['fresh', text('처음 시작', 'Fresh start')],
    ['before-ch2', text('Ch.2 해금 직전 · XOR(6)만 남김', 'Before Ch.2 · clear XOR (6) next')],
    ['before-ch34', text('Ch.3·4 해금 직전 · 자동문(30)만 남김', 'Before Ch.3/4 · clear Automatic Door (30) next')],
    ['complete', text('전체 클리어 · 별 3개', 'All cleared · 3 stars')]
  ]);
  presetFields.append(label(text('프리셋', 'Preset'), preset), button(text('프리셋 적용', 'Apply preset'), () => store.applyPreset(preset.value), 'devApplyPreset'));
  const note = el('p', text('프리셋은 진행·별·강제 설정을 교체합니다. 기본 규칙은 획득한 접근권을 유지하므로 다시 잠그려면 강제 잠금을 사용하세요.',
    'Presets replace progress, stars and overrides. Default rules retain earned access; use Force locked to lock a chapter again.'));
  const status = el('p', '', 'devProgressStatus'); status.setAttribute('role', 'status');
  panel.append(fields, stageFields, presetFields, note,
    button(text('테스트 초기화 · 실행 시 상태로 복원', 'Reset test · restore launch state'), () => store.reset(), 'devReset'), status);
  document.body.append(toggle, panel);
  const refresh = () => {
    const access = store.access(), done = store.cleared();
    for (const [id, { control, status }] of chapterSelects) {
      control.value = access.chapterOverrides[id] || 'default';
      status.textContent = chapterAccess(id, done, access).unlocked ? text('열림', 'Open') : text('잠김', 'Locked');
    }
    refreshStage();
    status.textContent = store.saved
      ? text(`클리어 ${done.length}/${playableStages().length} · 변경 사항 자동 저장`, `${done.length}/${playableStages().length} cleared · changes saved automatically`)
      : text('저장 실패: 현재 실행에서만 유지됩니다.', 'Save failed: changes last only for this session.');
    status.dataset.saved = String(store.saved);
  };
  store.subscribe(refresh); refresh();
  panel.addEventListener('close', () => toggle.focus());
  // Capture before the circuit/map listeners, while preserving native select,
  // Tab navigation and the dialog's Escape behavior.
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault(); event.stopImmediatePropagation(); toggle.click();
    } else if (panel.open) event.stopPropagation();
  }, true);
}
