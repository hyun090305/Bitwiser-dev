import { hintDisplayText } from '../signalPresentation.js';
import { getHintProgress, setHintProgress, getHintCooldown, setHintCooldown } from './storage.js';
import { getLevelHints, getCurrentLevel } from './levels.js';
import { chapterForStage } from './stageCatalog.js';

let localProgress = null, currentHintStage = null, currentHintProgress = 0, selectedHint = null;
let hintTimerInterval = null, revision = 0;
const hintsFor = stage => {
  const hints = getLevelHints()[`stage${stage}`]?.hints;
  return Array.isArray(hints) ? hints.filter(h => h && typeof h.content === 'string' && h.content.trim()) : [];
};
const immediateHints = stage => Boolean(localProgress || chapterForStage(Number(stage))?.order === 1);
const database = () => typeof db === 'undefined' ? null : db;
const user = () => typeof firebase === 'undefined' || !firebase.auth ? null : firebase.auth().currentUser;
const localCount = stage => localProgress ? localProgress.get(stage) : getHintProgress(stage);

function cooldown(stage, callback) {
  if (immediateHints(stage)) { callback(0); return; }
  const local = getHintCooldown(), account = user();
  if (account && database()?.ref) database().ref(`hintLocks/${account.uid}`).once('value')
    .then(snap => callback(Math.max(local, snap.val() || 0))).catch(() => callback(local));
  else callback(local);
}

function saveProgress(stage, count) {
  if (localProgress) { localProgress.set(stage, count); return; }
  setHintProgress(stage, count);
  const account = user();
  if (account && database()?.ref) Promise.resolve(database().ref(`hintProgress/${account.uid}/stage${stage}`).set(count)).catch(() => {});
}

function renderButtons(until) {
  const hints = hintsFor(currentHintStage), container = document.getElementById('hintButtons');
  if (!container) return;
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : null;
  container.replaceChildren();
  hints.forEach((hint, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.id = `hint-step-${index}`;
    button.textContent = `${t('hintLabel')} ${index + 1} · ${hint.type}`;
    button.disabled = index > currentHintProgress || (index === currentHintProgress && Date.now() < until);
    button.className = index < currentHintProgress ? 'open' : button.disabled ? '' : 'available';
    button.setAttribute('aria-controls', 'hintMessage'); button.setAttribute('aria-expanded', String(selectedHint === index));
    button.addEventListener('click', () => showHint(index)); container.append(button);
  });
  const waiting = !immediateHints(currentHintStage) && currentHintProgress < hints.length && Date.now() < until;
  const timer = document.getElementById('hintTimerContainer'); if (timer) timer.hidden = !waiting;
  const ad = document.getElementById('adHintBtn'); if (ad) ad.hidden = !waiting;
  if (focusedId) document.getElementById(focusedId)?.focus();
}

function startTimer(until) {
  clearInterval(hintTimerInterval); hintTimerInterval = null;
  const timer = document.getElementById('nextHintTimer');
  if (immediateHints(currentHintStage) || until <= Date.now() || !timer) { if (timer) timer.textContent = ''; return; }
  const run = revision;
  const update = () => {
    if (run !== revision) return;
    const diff = Math.max(0, until - Date.now());
    const time = [Math.floor(diff / 3600000), Math.floor(diff % 3600000 / 60000), Math.floor(diff % 60000 / 1000)].map(n => String(n).padStart(2, '0')).join(':');
    timer.textContent = diff ? t('hintCountdown').replace('{time}', time) : t('hintReady');
    if (!diff) { clearInterval(hintTimerInterval); hintTimerInterval = null; renderButtons(0); }
  };
  update(); hintTimerInterval = setInterval(update, 1000);
}

function refresh(until, run = revision) {
  if (run !== revision || currentHintStage === null) return;
  renderButtons(until); startTimer(until);
}

function showHint(index) {
  const stage = currentHintStage, run = revision, hints = hintsFor(stage);
  if (!hints[index] || index > currentHintProgress) return;
  const hint = hints[index], message = document.getElementById('hintMessage');
  selectedHint = selectedHint === index ? null : index;
  if (message) {
    message.hidden = selectedHint === null;
    message.textContent = selectedHint === null ? '' : hintDisplayText(hint.content, stage);
    message.setAttribute('aria-labelledby', `hint-step-${index}`);
  }
  if (index >= currentHintProgress) {
    currentHintProgress = index + 1; saveProgress(stage, currentHintProgress);
    if (!immediateHints(stage)) {
      const until = Date.now() + 3600000; setHintCooldown(until);
      const account = user();
      if (account && database()?.ref) Promise.resolve(database().ref(`hintLocks/${account.uid}`).set(until)).catch(() => {});
    }
  }
  cooldown(stage, until => {
    refresh(until, run);
    if (run === revision) document.getElementById(`hint-step-${index}`)?.focus();
  });
}

function closeHintModal(restoreFocus = false) {
  revision++; clearInterval(hintTimerInterval); hintTimerInterval = null; currentHintStage = null; selectedHint = null;
  const modal = document.getElementById('hintModal'); if (modal) modal.style.display = 'none';
  const message = document.getElementById('hintMessage'); if (message) { message.hidden = true; message.textContent = ''; }
  const buttons = document.getElementById('hintButtons'); buttons?.replaceChildren();
  const timer = document.getElementById('nextHintTimer'); if (timer) timer.textContent = '';
  if (restoreFocus) document.getElementById('hintBtn')?.focus();
}

export function openHintModal(stage) {
  closeHintModal(); if (!hintsFor(stage).length) return;
  currentHintStage = Number(stage); currentHintProgress = Number(localCount(stage)) || 0;
  const run = revision, modal = document.getElementById('hintModal'); if (modal) modal.style.display = 'flex';
  cooldown(stage, until => refresh(until, run));
  (document.querySelector('#hintButtons button:not(:disabled)') || document.getElementById('closeHintBtn'))?.focus();
  // Show locally known steps immediately; remote progress must not block Chapter 1.
  const account = localProgress ? null : user();
  if (account && database()?.ref) database().ref(`hintProgress/${account.uid}/stage${stage}`).once('value').then(snap => {
    if (run !== revision) return;
    currentHintProgress = Math.max(currentHintProgress, Number(snap.val()) || 0);
    setHintProgress(stage, currentHintProgress); cooldown(stage, until => refresh(until, run));
  }).catch(() => {});
}

export function initializeHintUI({ progress = null } = {}) {
  localProgress = progress;
  document.getElementById('closeHintBtn')?.addEventListener('click', () => closeHintModal(true));
  document.getElementById('hintModal')?.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); closeHintModal(true); } });
  document.getElementById('adHintBtn')?.addEventListener('click', () => alert(t('featureComingSoon')));
  const stageChanged = () => {
    closeHintModal(); const button = document.getElementById('hintBtn');
    if (button) button.hidden = !hintsFor(getCurrentLevel()).length;
  };
  document.addEventListener('bitwiser:stageReady', stageChanged); stageChanged();
}
