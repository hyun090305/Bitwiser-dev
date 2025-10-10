import {
  getUsername,
  setUsername,
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

function generateRandomGuestNickname() {
  return `Player${Math.floor(1000 + Math.random() * 9000)}`;
}

function assignGuestNickname() {
  const name = generateRandomGuestNickname();
  setUsername(name);
  setGuestUsernameText(name);
  setLoginUsernameText(name);
  loadClearedLevelsFromDb().then(maybeStartTutorial);
  return Promise.resolve(name);
}

async function ensureUsernameRegistered(name, { onRename, allowExisting = false } = {}) {
  let nickname = name || getUsername();
  if (!nickname) {
    nickname = generateRandomGuestNickname();
    setUsername(nickname);
    setGuestUsernameText(nickname);
    setLoginUsernameText(nickname);
  }

  const applyNickname = newName => {
    setUsername(newName);
    setGuestUsernameText(newName);
    setLoginUsernameText(newName);
    if (typeof onRename === 'function') {
      onRename(newName);
    }
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const snapshot = await db
      .ref('usernames')
      .orderByValue()
      .equalTo(nickname)
      .once('value');

    if (!snapshot.exists()) {
      const id = db.ref('usernames').push().key;
      await db.ref(`usernames/${id}`).set(nickname);
      return nickname;
    }

    if (allowExisting) {
      return nickname;
    }

    nickname = generateRandomGuestNickname();
    applyNickname(nickname);
  }

  throw new Error('Failed to register a unique nickname after multiple attempts.');
}

function removeUsername(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    snap.forEach(ch => ch.ref.remove());
  });
}

function showMergeModal(oldName, newName, options = {}) {
  if (!elements.mergeModal || !elements.mergeDetails || !elements.mergeConfirmBtn || !elements.mergeCancelBtn) {
    return;
  }
  const { uid } = options;
  elements.mergeDetails.innerHTML = '<p>현재 로컬 진행 상황을 Google 계정과 병합하시겠습니까?</p>';
  elements.mergeConfirmBtn.textContent = '네';
  elements.mergeCancelBtn.textContent = '제 계정이 아닙니다';
  elements.mergeCancelBtn.style.display = state.loginFromMainScreen ? 'none' : '';
  elements.mergeModal.style.display = 'flex';
  elements.mergeConfirmBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    try {
      const finalName = await ensureUsernameRegistered(newName, {
        onRename: updated => {
          if (uid) setGoogleNickname(uid, updated);
        },
        allowExisting: true
      });
      if (uid) {
        await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
      }
      if (oldName && oldName !== finalName) {
        await mergeProgress(oldName, finalName);
      }
      await loadClearedLevelsFromDb();
      showOverallRanking();
    } catch (err) {
      console.error('Failed to merge progress with Google account', err);
    }
  };
  elements.mergeCancelBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    try {
      const finalName = await ensureUsernameRegistered(newName, {
        onRename: updated => {
          if (uid) setGoogleNickname(uid, updated);
        },
        allowExisting: true
      });
      if (uid) {
        await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
      }
      await loadClearedLevelsFromDb();
      showOverallRanking();
    } catch (err) {
      console.error('Failed to finalise nickname after cancelling merge', err);
    }
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
    const applyAfterMerge = async finalName => {
      await loadClearedLevelsFromDb();
      showOverallRanking();
      maybeStartTutorial();
    };

    elements.mergeConfirmBtn.onclick = async () => {
      elements.mergeModal.style.display = 'none';
      try {
        setUsername(targetName);
        setGuestUsernameText(targetName);
        setLoginUsernameText(targetName);
        const finalName = await ensureUsernameRegistered(targetName, {
          onRename: updated => setGoogleNickname(uid, updated),
          allowExisting: true
        });
        setGoogleNickname(uid, finalName);
        await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        if (oldName && oldName !== finalName) {
          await mergeProgress(oldName, finalName);
        }
        await applyAfterMerge(finalName);
      } catch (err) {
        console.error('Failed to merge account progress', err);
      }
    };

    elements.mergeCancelBtn.onclick = async () => {
      elements.mergeModal.style.display = 'none';
      if (!state.loginFromMainScreen) {
        try {
          const name = await assignGuestNickname();
          const finalName = await ensureUsernameRegistered(name, {
            onRename: updated => setGoogleNickname(uid, updated)
          });
          setGoogleNickname(uid, finalName);
          await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        } catch (err) {
          console.error('Failed to assign guest nickname on merge cancel', err);
        }
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

function mergeProgress(oldName, newName) {
  return db.ref('rankings').once('value').then(snap => {
    const promises = [];
    snap.forEach(levelSnap => {
      let best = null;
      const removeKeys = [];
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        if (v.nickname === oldName || v.nickname === newName) {
          if (isRecordBetter(v, best)) best = { ...v };
          removeKeys.push(recSnap.key);
        }
      });
      removeKeys.forEach(k => promises.push(levelSnap.ref.child(k).remove()));
      if (best) {
        best.nickname = newName;
        promises.push(levelSnap.ref.push(best));
      }
    });
    removeUsername(oldName);
    return Promise.all(promises);
  });
}

async function applyGoogleNickname(name, oldName, options = {}) {
  const { uid } = options;
  if (oldName !== name) {
    setUsername(name);
    setGuestUsernameText(name);
    setLoginUsernameText(name);
  }

  const finalName = await ensureUsernameRegistered(name, {
    onRename: updated => {
      if (uid) setGoogleNickname(uid, updated);
    }
  });

  if (uid && finalName !== name) {
    await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
  }

  await loadClearedLevelsFromDb();
  if (oldName && oldName !== finalName) {
    showMergeModal(oldName, finalName, { uid });
  }
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
    await applyGoogleNickname(dbName, oldName, { uid });
    return;
  }

  if (localGoogleName) {
    const finalName = await applyGoogleNickname(localGoogleName, oldName, { uid });
    setGoogleNickname(uid, finalName);
    await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
    return;
  }

  if (oldName && !state.loginFromMainScreen) {
    try {
      const finalName = await ensureUsernameRegistered(oldName, {
        onRename: updated => setGoogleNickname(uid, updated)
      });
      setGoogleNickname(uid, finalName);
      await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
      setGuestUsernameText(finalName);
      setLoginUsernameText(finalName);
      await loadClearedLevelsFromDb();
      showMergeModal(oldName, finalName, { uid });
      maybeStartTutorial();
    } catch (err) {
      console.error('Failed to ensure nickname during Google login merge', err);
    }
    return;
  }

  try {
    const name = await assignGuestNickname();
    const finalName = await ensureUsernameRegistered(name, {
      onRename: updated => setGoogleNickname(uid, updated)
    });
    setGoogleNickname(uid, finalName);
    await db.ref(`google/${uid}`).set({ uid, nickname: finalName });
  } catch (err) {
    console.error('Failed to assign guest nickname during Google login', err);
  }
}

function handleAuthStateChange(buttons, user) {
  updateLoginButtonLabels(buttons, user);
  const nickname = getUsername() || '';
  setLoginUsernameText(nickname);
  if (user) {
    handleGoogleLogin(user).catch(err => {
      console.error('Google login handling failed', err);
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

export { assignGuestNickname, ensureUsernameRegistered };
