import {
  getUsername,
  setUsername,
  getUsernameReservationKey,
  setUsernameReservationKey,
  setGoogleDisplayName,
  setGoogleEmail,
  getGoogleNickname,
  setGoogleNickname
} from './storage.js';
import {
  configureGoogleProviderForDrive,
  hasStoredDriveRefreshToken,
  persistDriveTokensFromFirebaseResult
} from './auth.js';

let translate = key => key;
let loadClearedLevelsFromDb = () => Promise.resolve();
let maybeStartTutorial = () => {};
let showOverallRanking = () => {};
let fetchOverallStats = () => Promise.resolve({ rank: '-', cleared: 0 });
let fetchProgressSummary = () => Promise.resolve({ cleared: 0, blocks: 0, wires: 0 });

const state = {
  loginFromMainScreen: false
};

const elements = {
  googleLoginBtn: null,
  guestUsername: null,
  loginUsername: null,
  rankSection: null,
  overallRank: null,
  clearedCount: null,
  loginGuestPrompt: null,
  mergeModal: null,
  mergeDetails: null,
  mergeConfirmBtn: null,
  mergeCancelBtn: null
};

function getElement(id) {
  if (!id || typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function setConfigFunctions(options = {}) {
  if (typeof options.translate === 'function') {
    translate = options.translate;
  }
  if (typeof options.loadClearedLevelsFromDb === 'function') {
    loadClearedLevelsFromDb = options.loadClearedLevelsFromDb;
  }
  if (typeof options.maybeStartTutorial === 'function') {
    maybeStartTutorial = options.maybeStartTutorial;
  }
  if (typeof options.showOverallRanking === 'function') {
    showOverallRanking = options.showOverallRanking;
  }
  if (typeof options.fetchOverallStats === 'function') {
    fetchOverallStats = options.fetchOverallStats;
  }
  if (typeof options.fetchProgressSummary === 'function') {
    fetchProgressSummary = options.fetchProgressSummary;
  }
}

function captureElements(ids = {}) {
  elements.googleLoginBtn = getElement(ids.googleLoginBtnId);
  elements.guestUsername = getElement(ids.guestUsernameId);
  elements.loginUsername = getElement(ids.loginUsernameId);
  elements.rankSection = getElement(ids.rankSectionId);
  elements.overallRank = getElement(ids.overallRankId);
  elements.clearedCount = getElement(ids.clearedCountId);
  elements.loginGuestPrompt = getElement(ids.loginGuestPromptId);
  elements.mergeModal = getElement(ids.mergeModalId);
  elements.mergeDetails = getElement(ids.mergeDetailsId);
  elements.mergeConfirmBtn = getElement(ids.mergeConfirmBtnId);
  elements.mergeCancelBtn = getElement(ids.mergeCancelBtnId);
}

function updateLoginButtonLabels(buttons, user) {
  const label = user ? translate('logoutBtn') : translate('googleLoginBtn');
  buttons.forEach(btn => {
    if (btn) btn.textContent = label;
  });
}

function setGuestUsernameText(value) {
  if (elements.guestUsername) {
    elements.guestUsername.textContent = value;
  }
}

function setLoginUsernameText(value) {
  if (elements.loginUsername) {
    elements.loginUsername.textContent = value;
  }
}

function setLocalNickname(name) {
  setUsername(name);
  setGuestUsernameText(name);
  setLoginUsernameText(name);
}

function generateRandomNickname() {
  return `Player${Math.floor(1000 + Math.random() * 9000)}`;
}

function showRankSection() {
  if (elements.rankSection) {
    elements.rankSection.style.display = 'block';
  }
}

function hideRankSection() {
  if (elements.rankSection) {
    elements.rankSection.style.display = 'none';
  }
}

function showGuestPrompt() {
  if (elements.loginGuestPrompt) {
    elements.loginGuestPrompt.style.display = 'block';
  }
}

function hideGuestPrompt() {
  if (elements.loginGuestPrompt) {
    elements.loginGuestPrompt.style.display = 'none';
  }
}

function assignGuestNickname() {
  setUsernameReservationKey(null);
  const usernamesRef = db && typeof db.ref === 'function' ? db.ref('usernames') : null;

  const applyName = name => {
    setLocalNickname(name);
    loadClearedLevelsFromDb().then(maybeStartTutorial);
    return name;
  };

  if (!usernamesRef || typeof usernamesRef.orderByValue !== 'function') {
    const fallbackName = generateRandomNickname();
    applyName(fallbackName);
    return Promise.resolve(fallbackName);
  }

  return new Promise(resolve => {
    const attempt = () => {
      const candidate = generateRandomNickname();
      usernamesRef
        .orderByValue()
        .equalTo(candidate)
        .once('value', snap => {
          if (snap.exists()) {
            attempt();
          } else {
            resolve(applyName(candidate));
          }
        });
    };
    attempt();
  });
}

async function ensureUsernameRegistered(name, options = {}) {
  const { reuseExisting = false } = options;
  let targetName = name || getUsername();
  if (!targetName) {
    targetName = await assignGuestNickname();
  }

  const usernamesRef = db && typeof db.ref === 'function' ? db.ref('usernames') : null;
  if (!usernamesRef || typeof usernamesRef.orderByValue !== 'function') {
    return targetName;
  }

  const reservationKey = getUsernameReservationKey();
  if (reservationKey) {
    try {
      const reservationSnap = await usernamesRef.child(reservationKey).once('value');
      if (reservationSnap.exists() && reservationSnap.val() === targetName) {
        return targetName;
      }
      await usernamesRef.child(reservationKey).remove();
    } catch (err) {
      console.warn('Failed to validate previous username reservation', err);
    }
    setUsernameReservationKey(null);
  }

  // Attempt to reserve the desired nickname, retrying with a new guest nickname on conflicts.
  // The loop is expected to terminate quickly because nicknames are randomly generated.
  while (true) {
    const snapshot = await usernamesRef.orderByValue().equalTo(targetName).once('value');
    if (!snapshot.exists()) {
      const newKey = usernamesRef.push().key;
      await usernamesRef.child(newKey).set(targetName);
      setUsernameReservationKey(newKey);
      return targetName;
    }

    if (reuseExisting) {
      let existingKey = null;
      snapshot.forEach(child => {
        if (!existingKey) {
          existingKey = child.key;
        }
        return true;
      });
      if (existingKey) {
        setUsernameReservationKey(existingKey);
      }
      return targetName;
    }

    // Conflict detected; generate a new nickname and try again.
    // assignGuestNickname updates local storage/UI side effects for the new name.
    targetName = await assignGuestNickname();
  }
}

function removeUsername(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    snap.forEach(ch => ch.ref.remove());
  });
}

function showMergeModal(oldName, newName) {
  if (!elements.mergeModal || !elements.mergeDetails || !elements.mergeConfirmBtn || !elements.mergeCancelBtn) {
    return;
  }
  elements.mergeDetails.innerHTML = '<p>현재 로컬 진행 상황을 Google 계정과 병합하시겠습니까?</p>';
  elements.mergeConfirmBtn.textContent = '네';
  elements.mergeCancelBtn.textContent = '제 계정이 아닙니다';
  elements.mergeCancelBtn.style.display = state.loginFromMainScreen ? 'none' : '';
  elements.mergeModal.style.display = 'flex';
  elements.mergeConfirmBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    try {
      const finalName = await mergeProgress(oldName, newName);
      if (finalName && finalName !== newName) {
        setLocalNickname(finalName);
      }
    } finally {
      await loadClearedLevelsFromDb();
      showOverallRanking();
    }
  };
  elements.mergeCancelBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    try {
      await ensureUsernameRegistered(newName);
    } catch (err) {
      console.warn('Failed to ensure nickname during merge cancel', err);
    }
    await loadClearedLevelsFromDb();
    showOverallRanking();
  };
}

function showAccountClaimModal(targetName, oldName, uid) {
  fetchProgressSummary(targetName).then(prog => {
    if (!elements.mergeModal || !elements.mergeDetails || !elements.mergeConfirmBtn || !elements.mergeCancelBtn) {
      return;
    }
    elements.mergeDetails.innerHTML = `
      <p><b>${targetName}</b> 닉네임의 진행 상황</p>
      <ul>
        <li>클리어 레벨 수: ${prog.cleared}</li>
        <li>사용 블록 수: ${prog.blocks}</li>
        <li>사용 도선 수: ${prog.wires}</li>
      </ul>
      <p>이 계정과 진행 상황을 합치겠습니까?</p>
    `;
    elements.mergeConfirmBtn.textContent = '네';
    elements.mergeCancelBtn.textContent = '제 계정이 아닙니다';
    elements.mergeCancelBtn.style.display = state.loginFromMainScreen ? 'none' : '';
    elements.mergeModal.style.display = 'flex';
    elements.mergeConfirmBtn.onclick = async () => {
      elements.mergeModal.style.display = 'none';
      setLocalNickname(targetName);
      setGoogleNickname(uid, targetName);
      await db.ref(`google/${uid}`).set({ uid, nickname: targetName });

      const finalize = async () => {
        await loadClearedLevelsFromDb();
        showOverallRanking();
        maybeStartTutorial();
      };

      if (oldName && oldName !== targetName) {
        const mergedName = await mergeProgress(oldName, targetName);
        if (mergedName && mergedName !== targetName) {
          setLocalNickname(mergedName);
          setGoogleNickname(uid, mergedName);
          await db.ref(`google/${uid}`).set({ uid, nickname: mergedName });
        }
        await finalize();
        return;
      }

      try {
        const finalName = await ensureUsernameRegistered(targetName, { reuseExisting: true });
        if (finalName !== targetName) {
          setLocalNickname(finalName);
          setGoogleNickname(uid, finalName);
          await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        }
      } catch (err) {
        console.warn('Failed to ensure nickname during account claim', err);
      }
      await finalize();
    };
    elements.mergeCancelBtn.onclick = () => {
      elements.mergeModal.style.display = 'none';
      if (!state.loginFromMainScreen) {
        assignGuestNickname().then(name => {
          setGoogleNickname(uid, name);
          db.ref(`google/${uid}`).set({ uid, nickname: name });
        });
      }
    };
  });
}

function isRecordBetter(a, b) {
  if (!b) return true;
  const sumBlocks = e => Object.values(e.blockCounts || {}).reduce((s, x) => s + x, 0);
  const aBlocks = sumBlocks(a);
  const bBlocks = sumBlocks(b);
  if (aBlocks !== bBlocks) return aBlocks < bBlocks;
  if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
  return new Date(a.timestamp) < new Date(b.timestamp);
}

async function mergeProgress(oldName, newName) {
  const finalName = await ensureUsernameRegistered(newName);
  const snap = await db.ref('rankings').once('value');
  const promises = [];

  snap.forEach(levelSnap => {
    let best = null;
    const removeKeys = [];
    levelSnap.forEach(recSnap => {
      const v = recSnap.val();
      if (v.nickname === oldName || v.nickname === finalName) {
        if (isRecordBetter(v, best)) best = { ...v };
        removeKeys.push(recSnap.key);
      }
    });
    removeKeys.forEach(k => promises.push(levelSnap.ref.child(k).remove()));
    if (best) {
      best.nickname = finalName;
      promises.push(levelSnap.ref.push(best));
    }
  });

  removeUsername(oldName);
  await Promise.all(promises);
  return finalName;
}

async function applyGoogleNickname(name, oldName) {
  if (oldName !== name) {
    setLocalNickname(name);
    await loadClearedLevelsFromDb();
    if (oldName) {
      showMergeModal(oldName, name);
      maybeStartTutorial();
      return name;
    }
    const finalName = await ensureUsernameRegistered(name);
    if (finalName !== name) {
      setLocalNickname(finalName);
    }
    maybeStartTutorial();
    return finalName;
  }

  const finalName = await ensureUsernameRegistered(name, { reuseExisting: true });
  if (finalName !== name) {
    setLocalNickname(finalName);
  }
  await loadClearedLevelsFromDb();
  maybeStartTutorial();
  return finalName;
}

async function handleGoogleLogin(user) {
  const uid = user.uid;
  if (user.displayName) {
    setGoogleDisplayName(uid, user.displayName);
  }
  if (user.email) {
    setGoogleEmail(uid, user.email);
  }
  const oldName = getUsername();
  const snap = await db.ref(`google/${uid}`).once('value');
  const dbName = snap.exists() ? snap.val().nickname : null;
  const localGoogleName = getGoogleNickname(uid);

  if (dbName) {
    setGoogleNickname(uid, dbName);
    const finalName = await applyGoogleNickname(dbName, oldName);
    if (finalName !== dbName) {
      setGoogleNickname(uid, finalName);
      await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
    }
    return;
  }

  if (localGoogleName) {
    const finalName = await applyGoogleNickname(localGoogleName, oldName);
    setGoogleNickname(uid, finalName);
    await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
    return;
  }

  if (oldName && !state.loginFromMainScreen) {
    setGoogleNickname(uid, oldName);
    await db.ref(`google/${uid}`).set({ uid, nickname: oldName });
    setGuestUsernameText(oldName);
    await loadClearedLevelsFromDb();
    showMergeModal(oldName, oldName);
    maybeStartTutorial();
    return;
  }

  const name = await assignGuestNickname();
  setGoogleNickname(uid, name);
  await db.ref(`google/${uid}`).set({ uid, nickname: name });
}

function handleAuthStateChange(buttons, user) {
  updateLoginButtonLabels(buttons, user);
  const nickname = getUsername() || '';
  setLoginUsernameText(nickname);
  if (user) {
    handleGoogleLogin(user).catch(err => {
      console.error('Failed to handle Google login', err);
    });
    showRankSection();
    hideGuestPrompt();
    fetchOverallStats(nickname).then(res => {
      if (elements.overallRank) {
        elements.overallRank.textContent = `#${res.rank}`;
      }
      if (elements.clearedCount) {
        elements.clearedCount.textContent = res.cleared;
      }
    });
  } else {
    hideRankSection();
    showGuestPrompt();
    if (!getUsername()) {
      assignGuestNickname();
    }
  }
}

function setupLoginButtonHandlers(buttons, ids = {}) {
  buttons.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.loginFromMainScreen = ids.googleLoginBtnId && btn.id === ids.googleLoginBtnId;
      if (!state.loginFromMainScreen && btn === elements.googleLoginBtn) {
        state.loginFromMainScreen = true;
      }
      const user = firebase.auth().currentUser;
      if (user) {
        firebase.auth().signOut();
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        const needsConsent = !hasStoredDriveRefreshToken();
        configureGoogleProviderForDrive(provider, { forceConsent: needsConsent });
        firebase
          .auth()
          .signInWithPopup(provider)
          .then(result => {
            try {
              if (!persistDriveTokensFromFirebaseResult(result) && needsConsent) {
                console.warn('Drive tokens were not returned by Google sign-in; offline access may require manual consent.');
              }
            } catch (err) {
              console.warn('Failed to persist Drive tokens from Google sign-in result', err);
            }
          })
          .catch(err => {
            alert(translate('loginFailed').replace('{code}', err.code).replace('{message}', err.message));
            console.error(err);
          });
      }
    });
  });
}

export function initializeAuthUI(options = {}) {
  setConfigFunctions(options);
  captureElements(options.ids || {});

  const buttons = [elements.googleLoginBtn].filter(Boolean);
  if (!buttons.length || typeof firebase === 'undefined' || !firebase.auth) {
    return Promise.resolve();
  }

  setupLoginButtonHandlers(buttons, options.ids || {});

  return new Promise(resolve => {
    let done = false;
    firebase.auth().onAuthStateChanged(user => {
      handleAuthStateChange(buttons, user);
      if (!done) {
        done = true;
        resolve();
      }
    });
  });
}

export { ensureUsernameRegistered };

export const __testing = {
  setConfigFunctions,
  captureElements,
  assignGuestNickname,
  ensureUsernameRegistered,
  removeUsername,
  showMergeModal,
  showAccountClaimModal,
  mergeProgress,
  applyGoogleNickname,
  handleGoogleLogin,
  handleAuthStateChange,
  setupLoginButtonHandlers
};
