const USERNAME_KEY = 'username';
const HINT_COOLDOWN_KEY = 'hintCooldownUntil';
const AUTO_SAVE_KEY = 'autoSaveCircuit';

function safeGetItem(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn('Failed to read localStorage key', key, err);
    return null;
  }
}

function safeSetItem(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null || typeof value === 'undefined') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('Failed to write localStorage key', key, err);
  }
}

export function getUsername() {
  return safeGetItem(USERNAME_KEY);
}

export function setUsername(name) {
  safeSetItem(USERNAME_KEY, name);
}

export function getHintProgress(stage) {
  const raw = safeGetItem(`hintsUsed_${stage}`);
  const parsed = parseInt(raw || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setHintProgress(stage, count) {
  safeSetItem(`hintsUsed_${stage}`, String(Math.max(0, Number(count) || 0)));
}

export function getHintCooldown() {
  const raw = safeGetItem(HINT_COOLDOWN_KEY);
  const parsed = parseInt(raw || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setHintCooldown(timestamp) {
  if (typeof timestamp === 'number' && !Number.isFinite(timestamp)) {
    console.warn('Ignoring non-finite hint cooldown timestamp', timestamp);
    return;
  }
  safeSetItem(HINT_COOLDOWN_KEY, timestamp != null ? String(timestamp) : null);
}

export function getAutoSaveSetting() {
  const raw = safeGetItem(AUTO_SAVE_KEY);
  return raw !== 'false';
}

export function setAutoSaveSetting(enabled) {
  safeSetItem(AUTO_SAVE_KEY, String(Boolean(enabled)));
}

function googleKey(prefix, uid) {
  if (!uid) return null;
  return `${prefix}_${uid}`;
}

export function getGoogleDisplayName(uid) {
  const key = googleKey('googleDisplayName', uid);
  return key ? safeGetItem(key) : null;
}

export function setGoogleDisplayName(uid, value) {
  const key = googleKey('googleDisplayName', uid);
  if (key) safeSetItem(key, value);
}

export function getGoogleEmail(uid) {
  const key = googleKey('googleEmail', uid);
  return key ? safeGetItem(key) : null;
}

export function setGoogleEmail(uid, value) {
  const key = googleKey('googleEmail', uid);
  if (key) safeSetItem(key, value);
}

export function getGoogleNickname(uid) {
  const key = googleKey('googleNickname', uid);
  return key ? safeGetItem(key) : null;
}

export function setGoogleNickname(uid, value) {
  const key = googleKey('googleNickname', uid);
  if (key) safeSetItem(key, value);
}
