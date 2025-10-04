import {
  getHintProgress,
  setHintProgress,
  getHintCooldown,
  setHintCooldown
} from './storage.js';
import { getLevelHints } from './levels.js';

let currentHintStage = null;
let currentHintProgress = 0;
let hintTimerInterval = null;

function checkHintCooldown(cb) {
  const localUntil = getHintCooldown();
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintLocks/${user.uid}`).once('value').then(snap => {
      cb(Math.max(localUntil, snap.val() || 0));
    });
  } else {
    cb(localUntil);
  }
}

function loadHintProgress(stage, cb) {
  const local = getHintProgress(stage);
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintProgress/${user.uid}/stage${stage}`).once('value').then(snap => {
      const remote = snap.val() || 0;
      const val = Math.max(local, remote);
      if (val !== local) setHintProgress(stage, val);
      cb(val);
    });
  } else {
    cb(local);
  }
}

function saveHintProgress(stage, count) {
  setHintProgress(stage, count);
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintProgress/${user.uid}/stage${stage}`).set(count);
  }
}

function startHintTimer(until) {
  clearInterval(hintTimerInterval);
  const timerEl = document.getElementById('nextHintTimer');
  if (!timerEl) return;

  function update() {
    const diff = until - Date.now();
    if (diff <= 0) {
      timerEl.textContent = t('hintReady');
    } else {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      timerEl.textContent = t('hintCountdown').replace('{time}', timeStr);
    }
  }

  update();
  hintTimerInterval = setInterval(update, 1000);
}

function renderHintButtons(hints, progress, cooldownUntil) {
  const container = document.getElementById('hintButtons');
  if (!container) return;
  container.innerHTML = '';
  const now = Date.now();
  const hasAvailable = progress < hints.length && now >= cooldownUntil;
  hints.forEach((hint, i) => {
    const btn = document.createElement('button');
    btn.appendChild(document.createTextNode(`${t('hintLabel')} ${i + 1} (${hint.type})`));
    btn.appendChild(document.createElement('br'));
    const lockIcon = document.createElement('span');
    lockIcon.className = 'lock-icon';
    lockIcon.textContent = i < progress ? '🔓' : '🔒';
    btn.appendChild(lockIcon);
    btn.onclick = () => showHint(i);
    if (i < progress) {
      btn.classList.add('open');
    } else if (i === progress) {
      if (now < cooldownUntil) {
        btn.disabled = true;
      } else {
        btn.classList.add('available');
      }
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
  const adBtn = document.getElementById('adHintBtn');
  if (adBtn) adBtn.style.display = hasAvailable ? 'none' : 'inline-block';
}

function showHint(index) {
  const hints = getLevelHints()[`stage${currentHintStage}`]?.hints || [];
  if (!hints[index]) return;
  const hint = hints[index];
  const messageEl = document.getElementById('hintMessage');
  const messageModal = document.getElementById('hintMessageModal');
  if (messageEl) messageEl.textContent = `[${hint.type}] ${hint.content}`;
  if (messageModal) messageModal.style.display = 'flex';

  if (index >= currentHintProgress) {
    currentHintProgress = index + 1;
    saveHintProgress(currentHintStage, currentHintProgress);
    const until = Date.now() + 60 * 60 * 1000;
    setHintCooldown(until);
    const user = firebase.auth().currentUser;
    if (user) db.ref(`hintLocks/${user.uid}`).set(until);
  }

  checkHintCooldown(until => {
    renderHintButtons(hints, currentHintProgress, until);
    startHintTimer(until);
  });
}

export function openHintModal(stage) {
  const hints = getLevelHints()[`stage${stage}`]?.hints;
  if (!hints) {
    alert(t('noHints'));
    return;
  }
  currentHintStage = stage;
  const modal = document.getElementById('hintModal');
  if (modal) modal.style.display = 'flex';
  const adBtn = document.getElementById('adHintBtn');
  if (adBtn) adBtn.onclick = () => alert('준비중인 기능입니다.');
  loadHintProgress(stage, progress => {
    currentHintProgress = progress;
    checkHintCooldown(until => {
      renderHintButtons(hints, progress, until);
      startHintTimer(until);
    });
  });
}

export function initializeHintUI() {
  const closeHintBtn = document.getElementById('closeHintBtn');
  const closeHintMsgBtn = document.getElementById('closeHintMessageBtn');
  if (closeHintBtn) {
    closeHintBtn.addEventListener('click', () => {
      const modal = document.getElementById('hintModal');
      if (modal) modal.style.display = 'none';
      clearInterval(hintTimerInterval);
    });
  }
  if (closeHintMsgBtn) {
    closeHintMsgBtn.addEventListener('click', () => {
      const modal = document.getElementById('hintMessageModal');
      if (modal) modal.style.display = 'none';
    });
  }
}
