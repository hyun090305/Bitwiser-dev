import {
  getUsername,
  setUsername,
  getGoogleDisplayName,
  setGoogleDisplayName,
  setGoogleEmail,
  getGoogleNickname,
  setGoogleNickname
} from './storage.js';

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

export function restoreUsernameModalDefaults() {
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

function onInitialUsernameSubmit() {
  const name = elements.usernameInput ? elements.usernameInput.value.trim() : '';
  if (!elements.usernameError) return;
  if (!name) {
    elements.usernameError.textContent = '닉네임을 입력해주세요.';
    return;
  }
  db.ref('usernames').orderByValue().equalTo(name).once('value', snapshot => {
    if (snapshot.exists()) {
      elements.usernameError.textContent = '이미 사용 중인 닉네임입니다.';
    } else {
      const userId = db.ref('usernames').push().key;
      db.ref(`usernames/${userId}`).set(name);
      setUsername(name);
      hideUsernameModal();
      setGuestUsernameText(name);
      loadClearedLevelsFromDb().then(maybeStartTutorial);
    }
  });
}

function assignGuestNickname() {
  const attempt = () => {
    const name = `Player${Math.floor(1000 + Math.random() * 9000)}`;
    db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
      if (snap.exists()) {
        attempt();
      } else {
        const id = db.ref('usernames').push().key;
        db.ref(`usernames/${id}`).set(name);
        setUsername(name);
        setGuestUsernameText(name);
        setLoginUsernameText(name);
        loadClearedLevelsFromDb().then(maybeStartTutorial);
      }
    });
  };
  attempt();
}

function promptForGoogleNickname(oldName, uid) {
  if (elements.usernameInput) {
    const suggested = oldName || getGoogleDisplayName(uid) || '';
    elements.usernameInput.value = suggested;
  }
  if (elements.usernameError) {
    elements.usernameError.textContent = '';
  }
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

function onGoogleUsernameSubmit(oldName, uid) {
  const name = elements.usernameInput ? elements.usernameInput.value.trim() : '';
  if (!elements.usernameError) return;
  if (!name) {
    elements.usernameError.textContent = '닉네임을 입력해주세요.';
    return;
  }
  db.ref('google').orderByChild('nickname').equalTo(name).once('value', gSnap => {
    if (gSnap.exists()) {
      elements.usernameError.textContent = '이미 있는 닉네임입니다.';
      return;
    }
    db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
      if (snap.exists() && name !== oldName) {
        hideUsernameModal();
        restoreUsernameModalDefaults();
        showAccountClaimModal(name, oldName, uid);
      } else {
        if (!snap.exists()) {
          const id = db.ref('usernames').push().key;
          db.ref(`usernames/${id}`).set(name);
        }
        setUsername(name);
        setGoogleNickname(uid, name);
        db.ref(`google/${uid}`).set({ uid, nickname: name });
        hideUsernameModal();
        restoreUsernameModalDefaults();
        setGuestUsernameText(name);
        loadClearedLevelsFromDb().then(() => {
          if (oldName && oldName !== name) {
            showMergeModal(oldName, name);
          } else {
            registerUsernameIfNeeded(name);
            showOverallRanking();
          }
          maybeStartTutorial();
        });
      }
    });
  });
}

function registerUsernameIfNeeded(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    if (!snap.exists()) {
      const id = db.ref('usernames').push().key;
      db.ref(`usernames/${id}`).set(name);
    }
  });
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
  elements.mergeConfirmBtn.onclick = () => {
    elements.mergeModal.style.display = 'none';
    mergeProgress(oldName, newName).then(() => {
      loadClearedLevelsFromDb();
      showOverallRanking();
    });
  };
  elements.mergeCancelBtn.onclick = () => {
    elements.mergeModal.style.display = 'none';
    if (!state.loginFromMainScreen && firebase.auth().currentUser) {
      promptForGoogleNickname(oldName, firebase.auth().currentUser.uid);
    } else {
      registerUsernameIfNeeded(newName);
      loadClearedLevelsFromDb();
      showOverallRanking();
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
    elements.mergeConfirmBtn.onclick = () => {
      elements.mergeModal.style.display = 'none';
      setUsername(targetName);
      setGoogleNickname(uid, targetName);
      db.ref(`google/${uid}`).set({ uid, nickname: targetName });
      setGuestUsernameText(targetName);
      const after = () => {
        loadClearedLevelsFromDb().then(() => {
          showOverallRanking();
          maybeStartTutorial();
        });
      };
      if (oldName && oldName !== targetName) {
        mergeProgress(oldName, targetName).then(after);
      } else {
        registerUsernameIfNeeded(targetName);
        after();
      }
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
    registerUsernameIfNeeded(newName);
    return Promise.all(promises);
  });
}

function applyGoogleNickname(name, oldName) {
  if (oldName !== name) {
    setUsername(name);
    setGuestUsernameText(name);
    loadClearedLevelsFromDb().then(() => {
      if (oldName) {
        showMergeModal(oldName, name);
      } else {
        registerUsernameIfNeeded(name);
      }
      maybeStartTutorial();
    });
  } else {
    registerUsernameIfNeeded(name);
    loadClearedLevelsFromDb().then(maybeStartTutorial);
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
      applyGoogleNickname(dbName, oldName);
    } else if (localGoogleName) {
      db.ref(`google/${uid}`).set({ uid, nickname: localGoogleName });
      applyGoogleNickname(localGoogleName, oldName);
    } else if (oldName && !state.loginFromMainScreen) {
      setGoogleNickname(uid, oldName);
      db.ref(`google/${uid}`).set({ uid, nickname: oldName });
      setGuestUsernameText(oldName);
      loadClearedLevelsFromDb().then(() => {
        showMergeModal(oldName, oldName);
        maybeStartTutorial();
      });
    } else {
      promptForGoogleNickname(oldName, uid);
    }
  });
}

function handleAuthStateChange(buttons, user) {
  updateLoginButtonLabels(buttons, user);
  const nickname = getUsername() || '';
  setLoginUsernameText(nickname);
  if (user) {
    handleGoogleLogin(user);
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
        firebase.auth().signInWithPopup(provider).catch(err => {
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

export const __testing = {
  setConfigFunctions,
  captureElements,
  assignGuestNickname,
  promptForGoogleNickname,
  onGoogleUsernameSubmit,
  registerUsernameIfNeeded,
  removeUsername,
  showMergeModal,
  showAccountClaimModal,
  mergeProgress,
  applyGoogleNickname,
  handleGoogleLogin,
  handleAuthStateChange,
  setupLoginButtonHandlers
};
