import { initializeCostBoard, renderPerformance } from '../modules/costUI.js';
import { highestStars, isCurrentCostRecord } from '../modules/costRecords.js';
import { calculateCircuitCost } from '../modules/circuitCost.js';
import * as levels from '../modules/levels.js';
import { getPlayCircuit, getPlayController, onCircuitModified, adjustGridZoom, moveCircuit } from '../modules/grid.js';
import { createGradingController } from '../modules/grading.js';
import { stylePassedResult } from '../modules/gradingResultView.js';
import { createGuidedTutorial } from '../modules/guidedTutorial.js';
import { initializeStageMap } from '../modules/stageMap.js';
import { showStageMapScreen, hideStageMapScreen, showGameScreen } from '../modules/navigation.js';
import { setupKeyToggles, setupSettings, setupSystemMenuDrawer, syncGameAreaBackground } from '../modules/gameUI.js';
import { initializeBgm } from '../modules/bgm.js';
import { getAvailableThemes, getActiveThemeId, getThemeById, onThemeChange, lockTheme } from '../themes.js';
import { initializeHintUI, openHintModal } from '../modules/hints.js';
import { initializeLoadingDots, setLoadingMilestone, hideLoadingScreen } from '../modules/loadingScreen.js';
import { captureGIF } from '../modules/circuitShare.js';
import { createDemoStore } from './store.js';
import { SETTING_KEYS, makeRecord } from './records.js';
import { DEMO_END_STAGE } from './catalog.js';
import { initializeFullVersion } from './fullVersion.js';

const $ = id => document.getElementById(id);
const lang = window.currentLang === 'ko' ? 'ko' : 'en';
const words = {
  map: ['스테이지 맵', 'Stage map'], settings: ['설정', 'Settings'], fullVersion: ['정식판 살펴보기', 'Explore the full version'], ranking: ['랭킹', 'Rankings'],
  menu: ['시스템 메뉴', 'System menu'], mission: ['문제 설명', 'Mission'], hints: ['힌트', 'Hints'],
  share: ['결과 공유', 'Share result'],
  close: ['닫기', 'Close'], retry: ['계속 최적화하기', 'Keep optimizing'], backToMap: ['맵으로 돌아가기', 'Back to map'],
  practice: ['다시 연습하기', 'Practice again'],
  cleared: ['회로 복구 완료', 'Circuit restored'], improved: ['개인 최고 기록 갱신!', 'New personal best!'],
  blocks: ['블록', 'Blocks'], wires: ['도선 점유 칸', 'Wire cells'], complete: ['완료 ✓', 'Complete ✓'], locked: ['잠김 🔒', 'Locked 🔒'], optional: ['선택', 'Optional'],
  finish: ['체험판 마무리', 'Finish demo'], ending: ['MEMORY LINK · 작은 복구를 마쳤습니다', 'MEMORY LINK · A small recovery complete'],
  endingBody: ['지나간 신호를 기억하는 자동문을 복구했습니다. 아직 2D 안전 모드에 있지만, 다음 경로가 열렸습니다.\nARITHMETIC UNIT · CONTROL FLOW · SYSTEM INTEGRATION\n계산·제어·시스템의 복구는 병렬로 시작됩니다. 선택 문제와 더 높은 별에도 계속 도전할 수 있습니다.', 'The automatic door now remembers earlier signals. You are still in 2D safe mode, but the next paths are open.\nARITHMETIC UNIT · CONTROL FLOW · SYSTEM INTEGRATION\nCalculation, control and system recovery can begin in parallel. Keep exploring optional puzzles and improving your stars.'],
  exportBackup: ['진행 백업 저장','Export progress backup'], importBackup: ['진행 백업 열기','Import progress backup'],
  restoreBackup: ['이 백업으로 복원','Restore this backup'], backupReady: ['검증된 백업입니다. 현재 진행을 바꾸기 전 자동으로 복구용 백업을 내려받습니다.','Backup validated. Your current progress will be downloaded before replacement.'],
  backupInvalid: ['백업을 읽지 못했습니다. 현재 진행은 유지됩니다.','Could not read this backup. Current progress is unchanged.'],
  saved: ['이 브라우저에 자동 저장됨', 'Autosaved in this browser'], saveFailed: ['자동 저장을 사용할 수 없습니다. 플레이는 계속할 수 있지만, 새로고침하거나 페이지를 닫으면 이번 진행이 사라질 수 있습니다.', 'Autosave is unavailable. You can keep playing, but this session’s progress may be lost when you reload or close the page.'],
  saveHelp: ['진행과 회로는 이 브라우저에 자동 저장됩니다.', 'Progress and circuits are saved automatically in this browser.'],
  copy: ['텍스트 복사', 'Copy text'], downloadText: ['텍스트 다운로드', 'Download text'], gif: ['GIF 다운로드', 'Download GIF'],
  copied: ['복사했습니다.', 'Copied.'], copyFailed: ['복사 권한이 없습니다. 아래 텍스트를 직접 복사하거나 다운로드하세요.', 'Clipboard access was denied. Select the text below or download it.'],
  gifWait: ['GIF를 만드는 중입니다…', 'Creating GIF…'], gifFailed: ['GIF 생성에 실패했습니다. 텍스트 공유를 이용하거나 다시 시도하세요.', 'GIF export failed. Share text or try again.'],
  ungraded: ['미통과 편집 회로', 'Draft — not passed'], update: ['새 버전 적용하기', 'Apply update'],
  error: ['체험판을 불러오지 못했습니다. 새로고침해 다시 시도하세요.', 'Could not load the demo. Reload to try again.']
};
const text = key => words[key]?.[lang === 'ko' ? 0 : 1] || window.t(key);
let store, activeStage = null, pendingSave = null, restoring = false, busy = false, launchBusy = false, lastSavedStructure = null;
let mapController, grading, tutorial, fullVersion, pendingCelebration = null;
const dialog = $('demoDialog');
dialog.addEventListener('cancel', () => {
  if (window.isGradingResultOpen) levels.returnToEditScreen();
});
const showStatus = (message, failed = false) => {
  $('demoSaveStatus').textContent = message;
  $('demoSaveStatus').dataset.failed = String(failed);
};
const showSaved = ok => { if (ok) showStatus(text('saved')); };
function paragraph(content, parent = $('demoDialogBody')) { const p = document.createElement('p'); p.textContent = content; parent.append(p); return p; }
function button(label, action, parent = $('demoDialogActions')) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    try { await action(); } catch (error) { console.error(error); showStatus(text('error'), true); }
    finally { b.disabled = false; }
  }); parent.append(b); return b;
}
function openDialog(title) {
  dialog.classList.remove('cost-dialog');
  dialog.classList.remove('grading-result-panel', 'grading-result-panel--passed');
  dialog.querySelector('.grading-result-header')?.remove();
  $('demoDialogTitle').textContent = title;
  $('demoDialogBody').replaceChildren(); $('demoDialogActions').replaceChildren();
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  dialog.close();
  if (window.isGradingResultOpen) levels.returnToEditScreen();
}
function setBusy(value) {
  busy = value;
  $('gameScreen').inert = value;
  $('stageMapScreen').inert = value;
}
function collectSettings() {
  const settings = {};
  for (const key of SETTING_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) settings[key] = ['lang', 'bitwiserTheme'].includes(key) ? raw : raw !== 'false';
    } catch { /* store persists the session and surfaces its own storage error */ }
  }
  settings.lang = lang; settings.bitwiserTheme = getActiveThemeId();
  store.state.settings = settings;
}
function flushDraft() {
  clearTimeout(pendingSave); pendingSave = null;
  if (!store || restoring || activeStage === null || !getPlayCircuit()) return;
  // Serialization ignores engine output values and animation flows.
  const circuit = getPlayCircuit();
  const stamp = JSON.stringify({ blocks: Object.values(circuit.blocks).map(b => [b.id,b.type,b.name,b.pos,b.inputMode]), wires: Object.values(circuit.wires).map(w => [w.id,w.startBlockId,w.endBlockId,w.path,w.inputRole]) });
  if (stamp === lastSavedStructure) return;
  collectSettings();
  const ok = store.setDraft(activeStage, circuit);
  if (ok) lastSavedStructure = stamp;
  showSaved(ok);
}
async function goMap() {
  if (busy || launchBusy) return;
  tutorial?.stop?.(); flushDraft(); closeDialog();
  await levels.returnToLevels(); activeStage = null; refreshProgress();
  if (pendingCelebration !== null) {
    mapController?.celebrateLevel(pendingCelebration);
    pendingCelebration = null;
  }
}
async function launch(id) {
  if (busy || launchBusy || !store.isUnlocked(id)) return;
  launchBusy = true;
  try {
    closeDialog(); levels.returnToEditScreen();
    await levels.startLevel(id);
    hideStageMapScreen(); showGameScreen();
  } finally { launchBusy = false; }
}
function refreshProgress() {
  document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
}
function showEnding() {
  openDialog(text('ending')); paragraph(text('endingBody'));
  button(text('map'), goMap); button(text('fullVersion'), () => showFullVersion());
}
function showFullVersion(feature) {
  if (busy) return;
  flushDraft(); fullVersion(feature);
}
function showResult(id, result, budgets) {
  openDialog(`${levels.getLevelTitle(id)} · ${text('cleared')}`);
  dialog.classList.add('cost-dialog');
  stylePassedResult(dialog, id);
  renderPerformance($('demoDialogBody'), { id, result, thresholds: data.levelStarThresholds?.[id], ranking: { restricted: true }, lang });
  button(text(id === 0 ? 'practice' : 'retry'), () => { closeDialog(); levels.returnToEditScreen(); });
  button(text('backToMap'), goMap).classList.add('demo-result-map');
  if (id === DEMO_END_STAGE) button(text('finish'), showEnding);
  button(text('share'), showShare);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function showShare() {
  if (activeStage === null || busy) return;
  flushDraft();
  const circuit = getPlayCircuit();
  let stars = text('ungraded');
  try { const r = makeRecord(circuit, activeStage, data, starBudgets); stars = r.stars ? '★'.repeat(r.stars) + '☆'.repeat(3-r.stars) : text('complete'); } catch { /* share accurately labels unpassed drafts */ }
  const caption = `${levels.getLevelTitle(activeStage)} · ${lang === 'ko' ? '회로 비용' : 'Circuit cost'} ${calculateCircuitCost(circuit).totalCost} · ${stars}`;
  const shareText = `Bitwiser Web Demo\n${caption}`;
  openDialog(text('share'));
  const area = document.createElement('textarea'); area.readOnly = true; area.value = shareText; area.setAttribute('aria-label', text('share')); $('demoDialogBody').append(area);
  button(text('copy'), async () => {
    try { await navigator.clipboard.writeText(shareText); paragraph(text('copied')); }
    catch { area.focus(); area.select(); paragraph(text('copyFailed')); }
  });
  button(text('downloadText'), () => download(new Blob([shareText], { type: 'text/plain;charset=utf-8' }), 'bitwiser-result.txt'));
  button(text('gif'), async () => {
    setBusy(true); window.isScoring = true; paragraph(text('gifWait'));
    try { const blob = await captureGIF(null, { caption }); download(blob, 'bitwiser-result.gif'); }
    catch (error) { console.warn(error); paragraph(text('gifFailed')); }
    finally { window.isScoring = false; setBusy(false); }
  });
  if (navigator.share) button(text('share'), async () => {
    try { await navigator.share({ title: 'Bitwiser', text: shareText }); }
    catch (error) { if (error.name !== 'AbortError') paragraph(text('copyFailed')); }
  });
  button(text('close'), closeDialog);
}
let data, starBudgets;
async function boot() {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  lockTheme('midnight-neon');
  fullVersion = initializeFullVersion({ lang });
  initializeLoadingDots(); setLoadingMilestone(10);
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-demo-text]').forEach(el => { el.textContent = text(el.dataset.demoText); });
  const response = await Promise.all([levels.loadStageData(lang), fetch('demo-budgets.json').then(r => { if (!r.ok) throw new Error('Budgets missing'); return r.json(); })]);
  [data, starBudgets] = response;
  setLoadingMilestone(55);
  let storage; try { storage = localStorage; } catch { /* unavailable storage remains a playable session */ }
  store = createDemoStore({ storage, levels: data, budgets: starBudgets, themeIds: getAvailableThemes().map(t => t.id), onFailure: () => showStatus(text('saveFailed'), true) });
  initializeCostBoard({ getCircuit: getPlayCircuit, getStage: levels.getCurrentLevel,
    getBest: id => isCurrentCostRecord(store.state.stages[id]?.best, data, id) ? store.state.stages[id].best : null,
    getThresholds: id => data.levelStarThresholds?.[id], onModified: onCircuitModified, lang });
  collectSettings();
  initializeBgm(); setupKeyToggles(); setupSettings({ localSave: true }); setupSystemMenuDrawer();
  syncGameAreaBackground(getThemeById(getActiveThemeId()));
  onThemeChange(syncGameAreaBackground);
  $('usedWiresLabel').textContent = text('wires');
  document.querySelectorAll('[data-full-feature]').forEach(el => el.addEventListener('click', () => showFullVersion(el.dataset.fullFeature)));
  $('demoRankingHudBtn').setAttribute('aria-label', text('ranking'));
  tutorial = createGuidedTutorial({ lang, gradeButton: $('gradeButton'), getPlayCircuit });
  initializeHintUI({ progress: { get: id => store.state.hints[id] || 0, set: (id, count) => { store.state.hints[id] = count; showSaved(store.persist()); } } });
  levels.configureLevelModule({
    progressProvider: () => store.cleared(), canStartLevel: id => store.isUnlocked(id), accessProvider: () => store.state,
    copyPasteEnabled: () => store.cleared().includes(0), beforeLeave: flushDraft,
    onGridReady: (id, controller) => {
      restoring = true; activeStage = id; lastSavedStructure = null;
      try {
        const entry=store.state.stages[id],draft=entry?.draft;
        if (draft) controller.restoreCircuit(draft.circuit);
        if(entry?.legacyStageRecords?.length)showStatus(lang==='ko'?'문제가 개편되었습니다. 이전 회로는 진행 백업에 보존되어 있습니다.':'This puzzle was updated. Your previous circuits are preserved in the progress backup.');
      }
      finally { restoring = false; }
      flushDraft();
    },
    onLevelIntroComplete: () => tutorial.handleLevelStart(levels.getCurrentLevel())
  });
  grading = createGradingController({
    getTraceView: () => getPlayController()?.createTraceView(),
    getPlayCircuit, getLevelAnswer: levels.getLevelAnswer, getLevelBlockSet: levels.getLevelBlockSet, getCurrentLevel: levels.getCurrentLevel,
    t: window.t, returnToEditScreen: levels.returnToEditScreen,
    onScoringChange: value => { if (value) flushDraft(); setBusy(value); },
    onPassed: async (id, circuit) => {
      const result = store.recordClear(id, circuit); showSaved(result.saved);
      if (result.first) pendingCelebration = id;
      if (id === 0) getPlayController()?.setCopyPasteEnabled(true);
      refreshProgress();
      showResult(id, result, starBudgets);
    },
    elements: { overlay: $('gridOverlay'), gradeButton: $('gradeButton'), gradingInlineStatus: $('gradingInlineStatus') }
  });
  levels.configureLevelModule({ setIsScoring: grading.setIsScoring });
  onCircuitModified(context => {
    if (context !== 'play' || restoring || busy) return;
    clearTimeout(pendingSave); pendingSave = setTimeout(flushDraft, 400);
  });
  mapController = initializeStageMap({ getLevelTitle: levels.getLevelTitle, isLevelUnlocked: id => store.isUnlocked(id), getClearedLevels: store.cleared, getStageAccess: () => store.state, startLevel: launch, returnToEditScreen: levels.returnToEditScreen, onlineFeatures: false, onFeatureLocked: showFullVersion, getStageStars: id => highestStars(store.state.stages[id], data, id) });
  refreshProgress(); showStageMapScreen();
  $('gradeButton').addEventListener('click', () => grading.gradeCurrentSelection().catch(error => { console.error(error); showStatus(text('error'), true); }));
  $('backToLevelsBtn').addEventListener('click', goMap);
  $('showIntroBtn').addEventListener('click', () => { if (activeStage !== null) levels.showIntroModal(activeStage); });
  $('hintBtn').addEventListener('click', () => { if (activeStage !== null) openHintModal(activeStage); });
  $('demoShareBtn').addEventListener('click', showShare);
  for (const attribute of ['title', 'aria-label', 'data-tooltip']) $('demoShareBtn').setAttribute(attribute, text('share'));
  $('demoLanguageBtn').addEventListener('click', () => {
    flushDraft(); store.state.settings.lang = lang === 'ko' ? 'en' : 'ko'; store.persist(); window.setLanguage(store.state.settings.lang);
  });
  $('demoExportBackupBtn').addEventListener('click', () => {
    flushDraft(); download(new Blob([store.exportBackup()], {type:'application/json'}), 'bitwiser-progress.json');
  });
  const backupFile = $('demoBackupFile');
  $('demoImportBackupBtn').addEventListener('click', () => { if (!busy) backupFile.click(); });
  backupFile.addEventListener('change', async () => {
    try {
      const file = backupFile.files[0]; if (!file || busy) return;
      if (file.size > 1024 * 1024) throw new Error('Backup exceeds 1 MiB');
      const validated = store.parseBackup(await file.text());
      openDialog(text('importBackup')); paragraph(text('backupReady'));
      paragraph(`${text('complete')}: ${Object.values(validated.stages).filter(s => s.best).length}`);
      button(text('restoreBackup'), async () => {
        flushDraft(); download(new Blob([store.exportBackup()], {type:'application/json'}), 'bitwiser-before-restore.json');
        if (store.replace(validated)) location.reload();
      });
      button(text('close'), closeDialog);
    } catch { openDialog(text('importBackup')); paragraph(text('backupInvalid')); button(text('close'), closeDialog); }
    finally { backupFile.value = ''; }
  });
  $('settingsModal').addEventListener('change', () => { collectSettings(); showSaved(store.persist()); });
  window.addEventListener('resize', () => adjustGridZoom());
  window.addEventListener('pagehide', () => { if (!busy) flushDraft(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !busy) flushDraft(); });
  document.addEventListener('keydown', event => {
    if (window.isGradingResultOpen) return;
    if (dialog.open) { if (!['Escape', 'Tab'].includes(event.key)) event.stopImmediatePropagation(); return; }
    if (document.body.classList.contains('system-menu-open') || $('settingsModal').style.display === 'flex') {
      if (!['Escape', 'Tab'].includes(event.key)) event.stopImmediatePropagation();
      return;
    }
    if (busy || activeStage === null || event.target.closest('input,textarea,select')) return;
    const moves = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0] };
    if (moves[event.key]) { event.preventDefault(); moveCircuit(...moves[event.key]); }
  }, true);
  hideLoadingScreen({
    startLabel: 'START', startAriaLabel: 'START',
    onStart: async () => {
      try { await launch(store.isUnlocked(store.state.lastStageId) ? store.state.lastStageId : 0); }
      catch (error) { console.error(error); showStatus(text('error'), true); }
    }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker-demo.js', { scope: './', updateViaCache: 'none' }).then(reg => {
      const offerUpdate = () => {
        if (!reg.waiting || !navigator.serviceWorker.controller) return;
        const b = $('demoUpdateBtn'); b.hidden = false;
        for (const id of ['settingsBtn', 'gameSettingsBtn']) { $(id).dataset.updateReady = 'true'; $(id).title = text('update'); }
        b.onclick = () => { if (busy) return; flushDraft(); if (store.persist()) reg.waiting.postMessage('activate-update'); };
      };
      offerUpdate(); reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', offerUpdate));
      let initialController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (initialController) location.reload(); initialController = true; });
    }).catch(error => console.warn('Demo cache unavailable; network play remains available', error));
  }
}
boot().catch(error => { console.error(error); showStatus(text('error'), true); });
