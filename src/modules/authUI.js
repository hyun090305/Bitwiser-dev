import {
  getUsername,
  setUsername,
  getGoogleDisplayName,
  setGoogleDisplayName,
  setGoogleEmail,
  getGoogleNickname,
  setGoogleNickname
} from './storage.js';

const state = {
  loginFromMainScreen: false,
  translate: key => key,
  onLoadClearedLevels: () => Promise.resolve(),
  onMaybeStartTutorial: () => {},
  onFetchOverallStats: () => Promise.resolve(null),
  onFetchProgressSummary: () => Promise.resolve(null),
  onShowOverallRanking: () => {},
  elements: {},
  defaults: {},
  googleButtons: []
};

function resolveElement(identifier, fallbackSelector) {
  if (!identifier && !fallbackSelector) return null;
  if (typeof HTMLElement !== 'undefined' && identifier instanceof HTMLElement) return identifier;
  if (typeof identifier === 'string') {
    return document.getElementById(identifier);
  }
  if (typeof fallbackSelector === 'string') {
    return document.querySelector(fallbackSelector);
  }
  return null;
}

function cacheElements(ids = {}) {
  const elements = {
    usernameModal: resolveElement(ids.usernameModalId, '#usernameModal'),
    usernameModalHeading: ids.usernameModalHeadingSelector
      ? document.querySelector(ids.usernameModalHeadingSelector)
      : document.querySelector('#usernameModal h2'),
    modalGoogleLoginBtn: resolveElement(ids.modalGoogleLoginBtnId, '#modalGoogleLoginBtn'),
    mainGoogleLoginBtn: resolveElement(ids.mainGoogleLoginBtnId, '#googleLoginBtn'),
    usernameSubmitBtn: resolveElement(ids.usernameSubmitBtnId, '#usernameSubmit'),
    usernameInput: resolveElement(ids.usernameInputId, '#usernameInput'),
    usernameError: resolveElement(ids.usernameErrorId, '#usernameError'),
    loginInfo: resolveElement(ids.loginInfoId, '#loginInfo'),
    loginUsername: resolveElement(ids.loginUsernameId, '#loginUsername'),
    guestUsername: resolveElement(ids.guestUsernameId, '#guestUsername'),
    rankSection: resolveElement(ids.rankSectionId, '#rankSection'),
    overallRank: resolveElement(ids.overallRankId, '#overallRank'),
    clearedCount: resolveElement(ids.clearedCountId, '#clearedCount'),
    loginGuestPrompt: resolveElement(ids.loginGuestPromptId, '#loginGuestPrompt'),
    mergeModal: resolveElement(ids.mergeModalId, '#mergeModal'),
    mergeDetails: resolveElement(ids.mergeDetailsId, '#mergeDetails'),
    mergeConfirmBtn: resolveElement(ids.mergeConfirmBtnId, '#mergeConfirmBtn'),
    mergeCancelBtn: resolveElement(ids.mergeCancelBtnId, '#mergeCancelBtn')
  };

  elements.googleButtons = [elements.mainGoogleLoginBtn, elements.modalGoogleLoginBtn].filter(Boolean);

  const defaults = {
    modalGoogleLoginDisplay: elements.modalGoogleLoginBtn ? elements.modalGoogleLoginBtn.style.display : '',
    usernameSubmitText: elements.usernameSubmitBtn ? elements.usernameSubmitBtn.textContent : '',
    usernameModalHeading: elements.usernameModalHeading ? elements.usernameModalHeading.textContent : '',
    loginInfoHtml: elements.loginInfo ? elements.loginInfo.innerHTML : ''
  };

  state.elements = elements;
  state.defaults = defaults;
  state.googleButtons = elements.googleButtons;
}

function setUsernameSubmitHandler(handler) {
  if (state.elements.usernameSubmitBtn) {
    state.elements.usernameSubmitBtn.onclick = handler;
  }
}

function updateLoginButtonsText(isLoggedIn) {
  const text = state.translate(isLoggedIn ? 'logoutBtn' : 'googleLoginBtn');
  state.googleButtons.forEach(btn => {
    btn.textContent = text;
  });
}

function updateLoginUsername(name) {
  if (state.elements.loginUsername) {
    state.elements.loginUsername.textContent = name;
  }
}

function hideUsernameModal() {
  if (state.elements.usernameModal) {
    state.elements.usernameModal.style.display = 'none';
  }
}

function showUsernameModal() {
  if (state.elements.usernameModal) {
    state.elements.usernameModal.style.display = 'flex';
  }
}

function updateRankStats(stats) {
  if (!stats) return;
  if (state.elements.overallRank && typeof stats.rank !== 'undefined') {
    state.elements.overallRank.textContent = `#${stats.rank}`;
  }
  if (state.elements.clearedCount && typeof stats.cleared !== 'undefined') {
    state.elements.clearedCount.textContent = stats.cleared;
  }
}

function updateUiForSignedIn() {
  if (state.elements.rankSection) {
    state.elements.rankSection.style.display = 'block';
  }
  if (state.elements.loginGuestPrompt) {
    state.elements.loginGuestPrompt.style.display = 'none';
  }
}

function updateUiForSignedOut() {
  if (state.elements.rankSection) {
    state.elements.rankSection.style.display = 'none';
  }
  if (state.elements.loginGuestPrompt) {
    state.elements.loginGuestPrompt.style.display = 'block';
  }
}

function restoreUsernameModalDefaults() {
  if (state.elements.modalGoogleLoginBtn) {
    state.elements.modalGoogleLoginBtn.style.display = state.defaults.modalGoogleLoginDisplay;
  }
  if (state.elements.usernameSubmitBtn) {
    state.elements.usernameSubmitBtn.textContent = state.defaults.usernameSubmitText;
  }
  if (state.elements.usernameModalHeading) {
    state.elements.usernameModalHeading.textContent = state.defaults.usernameModalHeading;
  }
  if (state.elements.loginInfo) {
    state.elements.loginInfo.innerHTML = state.defaults.loginInfoHtml;
  }
  setUsernameSubmitHandler(onInitialUsernameSubmit);
}

function clearUsernameErrors() {
  if (state.elements.usernameError) {
    state.elements.usernameError.textContent = '';
  }
}

function registerUsernameIfNeeded(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    if (!snap.exists()) {
      const id = db.ref('usernames').push().key;
      db.ref(`usernames/${id}`).set(name);
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
        if (state.elements.guestUsername) {
          state.elements.guestUsername.textContent = name;
        }
        updateLoginUsername(name);
        state.onLoadClearedLevels().then(state.onMaybeStartTutorial).catch(console.error);
      }
    });
  };
  attempt();
}

function promptForUsername() {
  if (!state.elements.usernameInput) return;
  state.elements.usernameInput.value = '';
  clearUsernameErrors();
  setUsernameSubmitHandler(onInitialUsernameSubmit);
  showUsernameModal();
}

function onInitialUsernameSubmit() {
  if (!state.elements.usernameInput) return;
  const name = state.elements.usernameInput.value.trim();
  if (!name) {
    if (state.elements.usernameError) {
      state.elements.usernameError.textContent = '닉네임을 입력해주세요.';
    }
    return;
  }
  db.ref('usernames').orderByValue().equalTo(name).once('value', snapshot => {
    if (snapshot.exists()) {
      if (state.elements.usernameError) {
        state.elements.usernameError.textContent = '이미 사용 중인 닉네임입니다.';
      }
    } else {
      const userId = db.ref('usernames').push().key;
      db.ref(`usernames/${userId}`).set(name);
      setUsername(name);
      hideUsernameModal();
      if (state.elements.guestUsername) {
        state.elements.guestUsername.textContent = name;
      }
      updateLoginUsername(name);
      state.onLoadClearedLevels().then(state.onMaybeStartTutorial).catch(console.error);
    }
  });
}

function promptForGoogleNickname(oldName, uid) {
  if (!state.elements.usernameInput) return;
  const suggested = oldName || getGoogleDisplayName(uid) || '';
  state.elements.usernameInput.value = suggested;
  clearUsernameErrors();
  if (state.elements.modalGoogleLoginBtn) {
    state.elements.modalGoogleLoginBtn.style.display = 'none';
  }
  if (state.elements.usernameSubmitBtn) {
    state.elements.usernameSubmitBtn.textContent = '닉네임 등록';
  }
  if (state.elements.usernameModalHeading) {
    state.elements.usernameModalHeading.textContent = 'Google 닉네임 등록';
  }
  if (state.elements.loginInfo) {
    state.elements.loginInfo.innerHTML = state.translate('loginInfoGoogle');
  }
  setUsernameSubmitHandler(() => onGoogleUsernameSubmit(oldName, uid));
  showUsernameModal();
}

function onGoogleUsernameSubmit(oldName, uid) {
  if (!state.elements.usernameInput) return;
  const name = state.elements.usernameInput.value.trim();
  if (!name) {
    if (state.elements.usernameError) {
      state.elements.usernameError.textContent = '닉네임을 입력해주세요.';
    }
    return;
  }
  db.ref('google').orderByChild('nickname').equalTo(name).once('value', gSnap => {
    if (gSnap.exists()) {
      if (state.elements.usernameError) {
        state.elements.usernameError.textContent = '이미 있는 닉네임입니다.';
      }
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
        if (state.elements.guestUsername) {
          state.elements.guestUsername.textContent = name;
        }
        updateLoginUsername(name);
        state.onLoadClearedLevels().then(() => {
          if (oldName && oldName !== name) {
            showMergeModal(oldName, name);
          } else {
            registerUsernameIfNeeded(name);
            state.onShowOverallRanking();
          }
          state.onMaybeStartTutorial();
        }).catch(console.error);
      }
    });
  });
}

function applyGoogleNickname(name, oldName) {
  if (oldName !== name) {
    setUsername(name);
    if (state.elements.guestUsername) {
      state.elements.guestUsername.textContent = name;
    }
    updateLoginUsername(name);
    state.onLoadClearedLevels().then(() => {
      if (oldName) {
        showMergeModal(oldName, name);
      } else {
        registerUsernameIfNeeded(name);
      }
      state.onMaybeStartTutorial();
    }).catch(console.error);
  } else {
    registerUsernameIfNeeded(name);
    state.onLoadClearedLevels().then(state.onMaybeStartTutorial).catch(console.error);
  }
}

function removeUsername(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    snap.forEach(ch => ch.ref.remove());
  });
}

function isRecordBetter(a, b) {
  if (!b) return true;
  const sumBlocks = entry => Object.values(entry.blockCounts || {}).reduce((sum, value) => sum + value, 0);
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
        const value = recSnap.val();
        if (value.nickname === oldName || value.nickname === newName) {
          if (isRecordBetter(value, best)) best = { ...value };
          removeKeys.push(recSnap.key);
        }
      });
      removeKeys.forEach(key => promises.push(levelSnap.ref.child(key).remove()));
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

function showMergeModal(oldName, newName) {
  if (!state.elements.mergeModal || !state.elements.mergeDetails || !state.elements.mergeConfirmBtn || !state.elements.mergeCancelBtn) {
    return;
  }
  state.elements.mergeDetails.innerHTML = '<p>현재 로컬 진행 상황을 Google 계정과 병합하시겠습니까?</p>';
  state.elements.mergeConfirmBtn.textContent = '네';
  state.elements.mergeCancelBtn.textContent = '제 계정이 아닙니다';
  state.elements.mergeCancelBtn.style.display = state.loginFromMainScreen ? 'none' : '';
  state.elements.mergeModal.style.display = 'flex';
  state.elements.mergeConfirmBtn.onclick = () => {
    state.elements.mergeModal.style.display = 'none';
    mergeProgress(oldName, newName).then(() => {
      state.onLoadClearedLevels()
        .then(() => { state.onShowOverallRanking(); })
        .catch(console.error);
    });
  };
  state.elements.mergeCancelBtn.onclick = () => {
    state.elements.mergeModal.style.display = 'none';
    if (!state.loginFromMainScreen && firebase.auth().currentUser) {
      promptForGoogleNickname(oldName, firebase.auth().currentUser.uid);
    } else {
      registerUsernameIfNeeded(newName);
      state.onLoadClearedLevels().then(() => {
        state.onShowOverallRanking();
      }).catch(console.error);
    }
  };
}

function showAccountClaimModal(targetName, oldName, uid) {
  state.onFetchProgressSummary(targetName).then(prog => {
    if (!state.elements.mergeModal || !state.elements.mergeDetails || !state.elements.mergeConfirmBtn || !state.elements.mergeCancelBtn) {
      return;
    }
    state.elements.mergeDetails.innerHTML = `
      <p><b>${targetName}</b> 닉네임의 진행 상황</p>
      <ul>
        <li>클리어 레벨 수: ${prog?.cleared ?? 0}</li>
        <li>사용 블록 수: ${prog?.blocks ?? 0}</li>
        <li>사용 도선 수: ${prog?.wires ?? 0}</li>
      </ul>
      <p>이 계정과 진행 상황을 합치겠습니까?</p>
    `;
    state.elements.mergeConfirmBtn.textContent = '네';
    state.elements.mergeCancelBtn.textContent = '제 계정이 아닙니다';
    state.elements.mergeCancelBtn.style.display = state.loginFromMainScreen ? 'none' : '';
    state.elements.mergeModal.style.display = 'flex';
    state.elements.mergeConfirmBtn.onclick = () => {
      state.elements.mergeModal.style.display = 'none';
      setUsername(targetName);
      setGoogleNickname(uid, targetName);
      db.ref(`google/${uid}`).set({ uid, nickname: targetName });
      if (state.elements.guestUsername) {
        state.elements.guestUsername.textContent = targetName;
      }
      updateLoginUsername(targetName);
      const after = () => {
        state.onLoadClearedLevels().then(() => {
          state.onShowOverallRanking();
          state.onMaybeStartTutorial();
        }).catch(console.error);
      };
      if (oldName && oldName !== targetName) {
        mergeProgress(oldName, targetName).then(after);
      } else {
        registerUsernameIfNeeded(targetName);
        after();
      }
    };
    state.elements.mergeCancelBtn.onclick = () => {
      state.elements.mergeModal.style.display = 'none';
      if (!state.loginFromMainScreen) {
        promptForGoogleNickname(oldName, uid);
      }
    };
  }).catch(console.error);
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
      if (state.elements.guestUsername) {
        state.elements.guestUsername.textContent = oldName;
      }
      updateLoginUsername(oldName);
      state.onLoadClearedLevels().then(() => {
        showMergeModal(oldName, oldName);
        state.onMaybeStartTutorial();
      }).catch(console.error);
    } else {
      promptForGoogleNickname(oldName, uid);
    }
  });
}

function handleAuthStateChanged(user) {
  updateLoginButtonsText(!!user);
  const nickname = getUsername() || '';
  updateLoginUsername(nickname);
  if (user) {
    handleGoogleLogin(user);
    hideUsernameModal();
    updateUiForSignedIn();
    state.onFetchOverallStats(nickname).then(updateRankStats).catch(console.error);
  } else {
    restoreUsernameModalDefaults();
    updateUiForSignedOut();
    if (!getUsername()) {
      assignGuestNickname();
    }
  }
}

function attachLoginButtonHandlers() {
  state.googleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.loginFromMainScreen = btn === state.elements.mainGoogleLoginBtn;
      const user = firebase.auth().currentUser;
      if (user) {
        firebase.auth().signOut();
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(err => {
          alert(state.translate('loginFailed').replace('{code}', err.code).replace('{message}', err.message));
          console.error(err);
        });
      }
    });
  });
}

export function initializeAuthUI(options = {}) {
  const {
    ids = {},
    translate = key => key,
    fetchOverallStats = () => Promise.resolve(null),
    fetchProgressSummary = () => Promise.resolve({}),
    loadClearedLevelsFromDb = () => Promise.resolve(),
    maybeStartTutorial = () => {},
    showOverallRanking = () => {}
  } = options;

  state.translate = translate;
  state.onFetchOverallStats = fetchOverallStats;
  state.onFetchProgressSummary = fetchProgressSummary;
  state.onLoadClearedLevels = loadClearedLevelsFromDb;
  state.onMaybeStartTutorial = maybeStartTutorial;
  state.onShowOverallRanking = showOverallRanking;

  cacheElements(ids);
  restoreUsernameModalDefaults();
  attachLoginButtonHandlers();

  return new Promise(resolve => {
    let resolved = false;
    firebase.auth().onAuthStateChanged(user => {
      handleAuthStateChanged(user);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
  });
}

export function __testOnly__getState() {
  return state;
}
