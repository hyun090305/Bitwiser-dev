import {
  getUsername,
  setUsername,
  getUsernameReservationKey,
  setUsernameReservationKey,
  getGoogleDisplayName,
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
  modalGoogleLoginBtn: null,
  usernameModal: null,
  usernameInput: null,
  usernameError: null,
  usernameSubmitBtn: null,
  usernameModalHeading: null,
  loginInfo: null,
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

const defaults = {
  modalGoogleLoginDisplay: '',
  usernameSubmitText: '',
  usernameModalHeading: '',
  loginInfoHtml: ''
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
  elements.modalGoogleLoginBtn = getElement(ids.modalGoogleLoginBtnId);
  elements.usernameModal = getElement(ids.usernameModalId);
  elements.usernameInput = getElement(ids.usernameInputId);
  elements.usernameError = getElement(ids.usernameErrorId);
  elements.usernameSubmitBtn = getElement(ids.usernameSubmitId);
  elements.loginInfo = getElement(ids.loginInfoId);
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
  if (ids.usernameModalHeadingSelector && typeof document !== 'undefined') {
    elements.usernameModalHeading = document.querySelector(ids.usernameModalHeadingSelector);
  } else {
    elements.usernameModalHeading = null;
  }

  defaults.modalGoogleLoginDisplay = elements.modalGoogleLoginBtn ? elements.modalGoogleLoginBtn.style.display : '';
  defaults.usernameSubmitText = elements.usernameSubmitBtn ? elements.usernameSubmitBtn.textContent : '';
  defaults.usernameModalHeading = elements.usernameModalHeading ? elements.usernameModalHeading.textContent : '';
  defaults.loginInfoHtml = elements.loginInfo ? elements.loginInfo.innerHTML : '';

  if (elements.usernameSubmitBtn) {
    elements.usernameSubmitBtn.onclick = onInitialUsernameSubmit;
  }
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

function showUsernameModal() {
  if (elements.usernameModal) {
    elements.usernameModal.style.display = 'flex';
  }
}

function hideUsernameModal() {
  if (elements.usernameModal) {
    elements.usernameModal.style.display = 'none';
  }
}

function restoreUsernameModalDefaults() {
  if (elements.modalGoogleLoginBtn) {
    elements.modalGoogleLoginBtn.style.display = defaults.modalGoogleLoginDisplay;
  }
  if (elements.usernameSubmitBtn) {
    elements.usernameSubmitBtn.textContent = defaults.usernameSubmitText;
    elements.usernameSubmitBtn.onclick = onInitialUsernameSubmit;
  }
  if (elements.usernameModalHeading) {
    elements.usernameModalHeading.textContent = defaults.usernameModalHeading;
  }
  if (elements.loginInfo) {
    elements.loginInfo.innerHTML = defaults.loginInfoHtml;
  }
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

function setUsernameInputValue(value) {
  if (elements.usernameInput) {
    elements.usernameInput.value = value;
  }
}

function setUsernameError(message) {
  if (elements.usernameError) {
    elements.usernameError.textContent = message || '';
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

async function onInitialUsernameSubmit() {
  if (!elements.usernameInput || !elements.usernameSubmitBtn) {
    return;
  }
  const name = elements.usernameInput.value.trim();
  if (!name) {
    setUsernameError('닉네임을 입력해주세요.');
    return;
  }

  try {
    const usernamesRef = db && typeof db.ref === 'function' ? db.ref('usernames') : null;
    if (usernamesRef && typeof usernamesRef.orderByValue === 'function') {
      const snapshot = await usernamesRef.orderByValue().equalTo(name).once('value');
      if (snapshot.exists()) {
        setUsernameError('이미 사용 중인 닉네임입니다.');
        return;
      }
    }

    setUsernameError('');
    setLocalNickname(name);
    hideUsernameModal();
    await ensureUsernameRegistered(name);
    await loadClearedLevelsFromDb();
    maybeStartTutorial();
  } catch (err) {
    console.error('Failed to register guest nickname', err);
    setUsernameError('닉네임 등록 중 오류가 발생했습니다.');
  }
}

function promptForGoogleNickname(oldName, uid) {
  const suggested = oldName || getGoogleDisplayName(uid) || '';
  setUsernameInputValue(suggested);
  setUsernameError('');
  if (elements.modalGoogleLoginBtn) {
    elements.modalGoogleLoginBtn.style.display = 'none';
  }
  if (elements.usernameSubmitBtn) {
    elements.usernameSubmitBtn.textContent = '닉네임 등록';
    elements.usernameSubmitBtn.onclick = () => onGoogleUsernameSubmit(oldName, uid);
  }
  if (elements.usernameModalHeading) {
    elements.usernameModalHeading.textContent = 'Google 닉네임 등록';
  }
  if (elements.loginInfo) {
    elements.loginInfo.innerHTML = translate('loginInfoGoogle');
  }
  showUsernameModal();
}

async function onGoogleUsernameSubmit(oldName, uid) {
  if (!elements.usernameInput) {
    return;
  }
  const name = elements.usernameInput.value.trim();
  if (!name) {
    setUsernameError('닉네임을 입력해주세요.');
    return;
  }

  try {
    const googleRef = db && typeof db.ref === 'function' ? db.ref('google') : null;
    if (googleRef && typeof googleRef.orderByChild === 'function') {
      const googleSnap = await googleRef.orderByChild('nickname').equalTo(name).once('value');
      if (googleSnap.exists()) {
        setUsernameError('이미 있는 닉네임입니다.');
        return;
      }
    }

    const usernamesRef = db && typeof db.ref === 'function' ? db.ref('usernames') : null;
    let existingKey = null;
    let nameTaken = false;
    if (usernamesRef && typeof usernamesRef.orderByValue === 'function') {
      const snapshot = await usernamesRef.orderByValue().equalTo(name).once('value');
      if (snapshot.exists()) {
        nameTaken = true;
        snapshot.forEach(child => {
          if (!existingKey) {
            existingKey = child.key;
          }
          return true;
        });
      }
    }

    if (nameTaken && name !== oldName) {
      hideUsernameModal();
      restoreUsernameModalDefaults();
      showAccountClaimModal(name, oldName, uid);
      return;
    }

    if (nameTaken && existingKey) {
      setUsernameReservationKey(existingKey);
    }

    setUsernameError('');
    setLocalNickname(name);
    setGoogleNickname(uid, name);
    if (db && typeof db.ref === 'function') {
      await db.ref(`google/${uid}`).set({ uid, nickname: name });
    }

    hideUsernameModal();
    restoreUsernameModalDefaults();

    let finalName = name;
    if (oldName && oldName !== name) {
      finalName = await mergeProgress(oldName, name);
      if (finalName && finalName !== name) {
        setLocalNickname(finalName);
        setGoogleNickname(uid, finalName);
        if (db && typeof db.ref === 'function') {
          await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        }
      }
    } else {
      finalName = await ensureUsernameRegistered(name, { reuseExisting: true });
      if (finalName !== name) {
        setLocalNickname(finalName);
        setGoogleNickname(uid, finalName);
        if (db && typeof db.ref === 'function') {
          await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        }
      }
    }

    await loadClearedLevelsFromDb();
    showOverallRanking();
    maybeStartTutorial();
  } catch (err) {
    console.error('Failed to submit Google nickname', err);
    setUsernameError('닉네임 등록 중 오류가 발생했습니다.');
  }
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
    const currentUser = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
    if (!state.loginFromMainScreen && currentUser) {
      promptForGoogleNickname(oldName, currentUser.uid);
      return;
    }
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
        promptForGoogleNickname(oldName, uid);
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
  const finalName = await ensureUsernameRegistered(newName, { reuseExisting: true });
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

  promptForGoogleNickname(oldName, uid);
}

function handleAuthStateChange(buttons, user) {
  updateLoginButtonLabels(buttons, user);
  const nickname = getUsername() || '';
  setLoginUsernameText(nickname);
  if (user) {
    handleGoogleLogin(user).catch(err => {
      console.error('Failed to handle Google login', err);
    });
    hideUsernameModal();
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
    restoreUsernameModalDefaults();
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

  const buttons = [elements.googleLoginBtn, elements.modalGoogleLoginBtn].filter(Boolean);
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

export { ensureUsernameRegistered, restoreUsernameModalDefaults };

export const __testing = {
  setConfigFunctions,
  captureElements,
  assignGuestNickname,
  onInitialUsernameSubmit,
  promptForGoogleNickname,
  onGoogleUsernameSubmit,
  restoreUsernameModalDefaults,
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
