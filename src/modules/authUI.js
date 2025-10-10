import {
  getUsername,
  setUsername,
  setGoogleDisplayName,
  setGoogleEmail,
  getGoogleNickname,
  setGoogleNickname,
  getUsernameReservationKey,
  setUsernameReservationKey
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

function generateGuestNickname() {
  return `Player${Math.floor(1000 + Math.random() * 9000)}`;
}

function assignGuestNickname() {
  return new Promise(resolve => {
    const name = generateGuestNickname();
    setUsername(name);
    setGuestUsernameText(name);
    setLoginUsernameText(name);
    loadClearedLevelsFromDb().then(maybeStartTutorial);
    resolve(name);
  });
}

export async function ensureUsernameRegistered(preferredName) {
  const updateLocalName = newName => {
    setUsername(newName);
    setGuestUsernameText(newName);
    setLoginUsernameText(newName);
  };

  let candidate = preferredName || getUsername();
  if (!candidate) {
    candidate = generateGuestNickname();
    updateLocalName(candidate);
  }

  const existingKey = getUsernameReservationKey();
  if (existingKey) {
    try {
      const existingSnap = await db.ref(`usernames/${existingKey}`).once('value');
      if (existingSnap.exists()) {
        const registeredName = existingSnap.val();
        if (!preferredName || registeredName === candidate) {
          if (candidate !== registeredName) {
            candidate = registeredName;
            updateLocalName(candidate);
          }
          return candidate;
        }
        await db.ref(`usernames/${existingKey}`).remove();
      }
    } catch (err) {
      console.warn('Failed to validate existing username reservation', err);
    }
    setUsernameReservationKey(null);
  }

  while (true) {
    try {
      const snapshot = await db
        .ref('usernames')
        .orderByValue()
        .equalTo(candidate)
        .once('value');
      if (!snapshot.exists()) {
        const id = db.ref('usernames').push().key;
        await db.ref(`usernames/${id}`).set(candidate);
        setUsernameReservationKey(id);
        updateLocalName(candidate);
        return candidate;
      }
    } catch (err) {
      console.error('Failed to check nickname availability', err);
      throw err;
    }

    candidate = generateGuestNickname();
    updateLocalName(candidate);
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

  const refreshProgress = async () => {
    await loadClearedLevelsFromDb();
    showOverallRanking();
  };

  elements.mergeConfirmBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    const currentUser = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
    const uid = currentUser ? currentUser.uid : null;
    let finalName = newName;
    try {
      finalName = await ensureUsernameRegistered(newName);
    } catch (err) {
      console.error('Failed to reserve nickname during merge confirmation', err);
    }
    setUsername(finalName);
    setGuestUsernameText(finalName);
    setLoginUsernameText(finalName);
    if (uid) {
      setGoogleNickname(uid, finalName);
      db.ref(`google/${uid}`).set({ uid, nickname: finalName });
    }
    if (oldName && oldName !== finalName) {
      await mergeProgress(oldName, finalName);
    }
    await refreshProgress();
    maybeStartTutorial();
  };

  elements.mergeCancelBtn.onclick = async () => {
    elements.mergeModal.style.display = 'none';
    await refreshProgress();
    if (state.loginFromMainScreen) {
      return;
    }
    try {
      const name = await assignGuestNickname();
      let finalName = name;
      try {
        finalName = await ensureUsernameRegistered(name);
      } catch (err) {
        console.error('Failed to reserve nickname after cancelling merge', err);
      }
      const currentUser = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
      const uid = currentUser ? currentUser.uid : null;
      if (uid) {
        setGoogleNickname(uid, finalName);
        db.ref(`google/${uid}`).set({ uid, nickname: finalName });
      }
    } catch (err) {
      console.error('Failed to assign guest nickname after cancelling merge', err);
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
    elements.mergeConfirmBtn.onclick = async () => {
      elements.mergeModal.style.display = 'none';
      let finalName = targetName;
      try {
        finalName = await ensureUsernameRegistered(targetName);
      } catch (err) {
        console.error('Failed to reserve nickname while claiming account', err);
      }
      setUsername(finalName);
      setGuestUsernameText(finalName);
      setLoginUsernameText(finalName);
      if (uid) {
        setGoogleNickname(uid, finalName);
        db.ref(`google/${uid}`).set({ uid, nickname: finalName });
      }
      const refresh = async () => {
        await loadClearedLevelsFromDb();
        showOverallRanking();
        maybeStartTutorial();
      };
      if (oldName && oldName !== finalName) {
        await mergeProgress(oldName, finalName);
      }
      await refresh();
    };
    elements.mergeCancelBtn.onclick = async () => {
      elements.mergeModal.style.display = 'none';
      if (state.loginFromMainScreen) {
        return;
      }
      try {
        const name = await assignGuestNickname();
        let finalName = name;
        try {
          finalName = await ensureUsernameRegistered(name);
        } catch (err) {
          console.error('Failed to reserve nickname after cancelling account claim', err);
        }
        if (uid) {
          setGoogleNickname(uid, finalName);
          db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        }
      } catch (err) {
        console.error('Failed to assign guest nickname after cancelling account claim', err);
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
  const snap = await db.ref('rankings').once('value');
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
  promises.push(
    ensureUsernameRegistered(newName).catch(err => {
      console.error('Failed to ensure nickname during merge progress', err);
    })
  );
  await Promise.all(promises);
}

async function applyGoogleNickname(name, oldName) {
  if (oldName !== name) {
    setUsername(name);
    setGuestUsernameText(name);
    setLoginUsernameText(name);
    await loadClearedLevelsFromDb();
    if (oldName) {
      showMergeModal(oldName, name);
    } else {
      try {
        await ensureUsernameRegistered(name);
      } catch (err) {
        console.error('Failed to reserve nickname after Google login', err);
      }
    }
    maybeStartTutorial();
  } else {
    try {
      await ensureUsernameRegistered(name);
    } catch (err) {
      console.error('Failed to ensure nickname for Google login', err);
    }
    await loadClearedLevelsFromDb();
    maybeStartTutorial();
  }
}

function handleGoogleLogin(user) {
  const uid = user.uid;
  if (user.displayName) {
    setGoogleDisplayName(uid, user.displayName);
  }
  if (user.email) {
    setGoogleEmail(uid, user.email);
  }
  const oldName = getUsername();
  db.ref(`google/${uid}`).once('value').then(snap => {
    const dbName = snap.exists() ? snap.val().nickname : null;
    const localGoogleName = getGoogleNickname(uid);
    if (dbName) {
      setGoogleNickname(uid, dbName);
      applyGoogleNickname(dbName, oldName).catch(err => {
        console.error('Failed to apply Google nickname from database', err);
      });
    } else if (localGoogleName) {
      db.ref(`google/${uid}`).set({ uid, nickname: localGoogleName });
      applyGoogleNickname(localGoogleName, oldName).catch(err => {
        console.error('Failed to apply stored Google nickname', err);
      });
    } else if (oldName && !state.loginFromMainScreen) {
      setGoogleNickname(uid, oldName);
      db.ref(`google/${uid}`).set({ uid, nickname: oldName });
      setGuestUsernameText(oldName);
      loadClearedLevelsFromDb().then(() => {
        showMergeModal(oldName, oldName);
        maybeStartTutorial();
      });
    } else {
      assignGuestNickname()
        .then(async name => {
          let finalName = name;
          try {
            finalName = await ensureUsernameRegistered(name);
          } catch (err) {
            console.error('Failed to reserve nickname for new Google guest', err);
          }
          setGoogleNickname(uid, finalName);
          db.ref(`google/${uid}`).set({ uid, nickname: finalName });
        })
        .catch(err => {
          console.error('Failed to assign guest nickname for Google login', err);
        });
    }
  });
}

function handleAuthStateChange(buttons, user) {
  updateLoginButtonLabels(buttons, user);
  const nickname = getUsername() || '';
  setLoginUsernameText(nickname);
  if (user) {
    handleGoogleLogin(user);
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
