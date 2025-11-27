import { getUsername } from './storage.js';
import { ensureUsernameRegistered } from './authUI.js';

const fallbackTranslate = key => key;

function resolveTranslator(translate) {
  if (typeof translate === 'function') return translate;
  if (typeof t === 'function') return t;
  return fallbackTranslate;
}

function translateText(tr, key, fallback) {
  const value = tr(key);
  return typeof value === 'string' && value !== key ? value : fallback;
}

const getBlockCountSum = entry =>
  Object.values(entry.blockCounts || {}).reduce((total, count) => total + count, 0);

function sortRankingEntries(entries, mode = 'stage') {
  if (!Array.isArray(entries)) return [];
  const cloned = [...entries];
  if (mode === 'overall') {
    cloned.sort((a, b) => {
      if (a.cleared !== b.cleared) return b.cleared - a.cleared;
      if (a.blocks !== b.blocks) return a.blocks - b.blocks;
      if (a.wires !== b.wires) return a.wires - b.wires;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
    return cloned;
  }

  cloned.sort((a, b) => {
    const aBlocks = getBlockCountSum(a);
    const bBlocks = getBlockCountSum(b);
    if (aBlocks !== bBlocks) return aBlocks - bBlocks;
    if ((a.usedWires ?? 0) !== (b.usedWires ?? 0)) {
      return (a.usedWires ?? 0) - (b.usedWires ?? 0);
    }
    const aHints = a.hintsUsed ?? 0;
    const bHints = b.hintsUsed ?? 0;
    if (aHints !== bHints) return aHints - bHints;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  return cloned;
}

export function fetchProgressSummary(nickname) {
  return db.ref('rankings').once('value').then(snap => {
    let cleared = 0;
    let blocks = 0;
    let wires = 0;
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        if (v.nickname === nickname) {
          cleared += 1;
          blocks += Object.values(v.blockCounts || {}).reduce((sum, count) => sum + count, 0);
          wires += v.usedWires || 0;
          return true;
        }
        return undefined;
      });
    });
    return { cleared, blocks, wires };
  });
}

export function fetchOverallStats(nickname) {
  const tr = resolveTranslator();
  return db.ref('rankings').once('value').then(snap => {
    const data = {};
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        const name = v.nickname || translateText(tr, 'anonymousUser', '익명');
        if (!data[name]) {
          data[name] = {
            stages: new Set(),
            blocks: 0,
            wires: 0,
            lastTimestamp: v.timestamp
          };
        }
        data[name].stages.add(levelSnap.key);
        data[name].blocks += Object.values(v.blockCounts || {}).reduce((sum, count) => sum + count, 0);
        data[name].wires += v.usedWires || 0;
        if (new Date(v.timestamp) > new Date(data[name].lastTimestamp)) {
          data[name].lastTimestamp = v.timestamp;
        }
      });
    });
    const entries = Object.entries(data).map(([nicknameKey, v]) => ({
      nickname: nicknameKey,
      cleared: v.stages.size,
      blocks: v.blocks,
      wires: v.wires,
      timestamp: v.lastTimestamp
    }));
    const sortedEntries = sortRankingEntries(entries, 'overall');
    const idx = sortedEntries.findIndex(entry => entry.nickname === nickname);
    if (idx === -1) return { rank: '-', cleared: 0 };
    return { rank: idx + 1, cleared: sortedEntries[idx].cleared };
  });
}

export function showOverallRanking(options = {}) {
  const { listSelector = '#overallRankingList', translate } = options;
  const listEl = document.querySelector(listSelector);
  if (!listEl) return Promise.resolve();
  const tr = resolveTranslator(translate);
  listEl.innerHTML = translateText(tr, 'rankingLoading', '로딩 중…');

  return db.ref('rankings').once('value').then(snap => {
    const data = {};
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const entry = recSnap.val();
        const name = entry.nickname || translateText(tr, 'anonymousUser', '익명');
        if (!data[name]) {
          data[name] = {
            stages: new Set(),
            blocks: 0,
            wires: 0,
            lastTimestamp: entry.timestamp
          };
        }
        data[name].stages.add(levelSnap.key);
        const sumBlocks = Object.values(entry.blockCounts || {}).reduce((sum, count) => sum + count, 0);
        data[name].blocks += sumBlocks;
        data[name].wires += entry.usedWires || 0;
        if (new Date(entry.timestamp) > new Date(data[name].lastTimestamp)) {
          data[name].lastTimestamp = entry.timestamp;
        }
      });
    });

    const entries = Object.entries(data).map(([nickname, value]) => ({
      nickname,
      cleared: value.stages.size,
      blocks: value.blocks,
      wires: value.wires,
      timestamp: value.lastTimestamp
    }));

    const sortedEntries = sortRankingEntries(entries, 'overall');

    let html = `<table>
  <thead><tr>
    <th>${tr('thRank')}</th><th>${tr('thNickname')}</th><th>${tr('thStage')}</th><th>${tr('thBlocks')}</th><th>${tr('thWires')}</th>
  </tr></thead><tbody>`;

    sortedEntries.forEach((entry, index) => {
      let displayName = entry.nickname;
      if (displayName.length > 20) {
        displayName = `${displayName.slice(0, 20)}...`;
      }
      html += `<tr>
    <td>${index + 1}</td>
    <td>${displayName}</td>
    <td>${entry.cleared}</td>
    <td>${entry.blocks}</td>
    <td>${entry.wires}</td>
  </tr>`;
    });

    html += '</tbody></table>';
    listEl.innerHTML = html;
  });
}

export async function saveRanking(levelId, blockCounts, usedWires, hintsUsed) {
  const tr = resolveTranslator();
  const anonymousLabel = translateText(tr, 'anonymousUser', '익명');
  let nickname = getUsername() || anonymousLabel;
  try {
    const ensuredName = await ensureUsernameRegistered(nickname);
    nickname = ensuredName || getUsername() || nickname;
  } catch (err) {
    console.warn('Failed to ensure nickname registration before saving ranking', err);
    nickname = getUsername() || nickname;
  }

  const entry = {
    nickname,
    blockCounts,
    usedWires,
    hintsUsed,
    timestamp: new Date().toISOString()
  };
  db.ref(`rankings/${levelId}`).push(entry);
}

export function saveProblemRanking(problemKey, blockCounts, usedWires, hintsUsed) {
  const tr = resolveTranslator();
  const anonymousLabel = translateText(tr, 'anonymousUser', '익명');
  let nickname = getUsername() || anonymousLabel;
  const rankingRef = db.ref(`problems/${problemKey}/ranking`);

  const isBetter = (a, b) => {
    const aBlocks = getBlockCountSum(a);
    const bBlocks = getBlockCountSum(b);
    if (aBlocks !== bBlocks) return aBlocks < bBlocks;
    if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
    const aHints = a.hintsUsed ?? 0;
    const bHints = b.hintsUsed ?? 0;
    if (aHints !== bHints) return aHints < bHints;
    return new Date(a.timestamp) < new Date(b.timestamp);
  };

  const reservationPromise = ensureUsernameRegistered(nickname)
    .then(ensuredName => {
      nickname = ensuredName || getUsername() || nickname;
    })
    .catch(err => {
      console.warn('Failed to ensure nickname registration before saving problem ranking', err);
      nickname = getUsername() || nickname;
    });

  return reservationPromise.finally(() => {
    const entry = {
      nickname,
      blockCounts,
      usedWires,
      hintsUsed,
      timestamp: new Date().toISOString()
    };

    rankingRef
      .orderByChild('nickname')
      .equalTo(nickname)
      .once('value', snapshot => {
        if (!snapshot.exists()) {
          rankingRef.push(entry);
          return;
        }

        let bestKey = null;
        let bestVal = null;
        const dupKeys = [];

        snapshot.forEach(child => {
          const val = child.val();
          const key = child.key;
          if (!bestVal || isBetter(val, bestVal)) {
            if (bestKey) dupKeys.push(bestKey);
            bestKey = key;
            bestVal = val;
          } else {
            dupKeys.push(key);
          }
          return undefined;
        });

        if (bestVal && isBetter(entry, bestVal)) {
          rankingRef.child(bestKey).set(entry);
        }
        dupKeys.forEach(k => rankingRef.child(k).remove());
      });
  });
}

export function showRanking(levelId, options = {}) {
  const {
    listSelector = '#rankingList',
    modalSelector = '#rankingModal',
    refreshButtonSelector = '#refreshRankingBtn',
    closeButtonSelector = '#closeRankingBtn',
    translate,
    getLevelBlockSet
  } = options;

  const listEl = document.querySelector(listSelector);
  const modal = document.querySelector(modalSelector);
  if (!listEl || !modal) return;

  const tr = resolveTranslator(translate);

  listEl.innerHTML = translateText(tr, 'rankingLoading', '로딩 중…');

  const blockSet = typeof getLevelBlockSet === 'function' ? getLevelBlockSet(levelId) : [];
  let allowedTypes = Array.from(new Set((blockSet || []).map(b => b.type))).filter(Boolean);

  db.ref(`rankings/${levelId}`)
    .orderByChild('timestamp')
    .once('value', snap => {
      const entries = [];
      snap.forEach(ch => {
        entries.push(ch.val());
        return undefined;
      });

      if (entries.length === 0) {
        const noRankingText = translateText(tr, 'noRanking', '랭킹이 없습니다.');
        const refreshLabel = translateText(tr, 'refreshRankingBtn', '🔄 새로고침');
        const closeLabel = translateText(tr, 'closeRankingBtn', '닫기');
        listEl.innerHTML = `
        <p>${noRankingText}</p>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">${refreshLabel}</button>
          <button id="closeRankingBtn">${closeLabel}</button>
        </div>
      `;

        const refreshBtn = modal.querySelector(refreshButtonSelector);
        refreshBtn?.addEventListener('click', () => showRanking(levelId, options));
        const closeBtn = modal.querySelector(closeButtonSelector);
        closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
        modal.classList.add('active');
        return;
      }

      if (!allowedTypes.length) {
        allowedTypes = Array.from(
          new Set(
            entries.flatMap(entry => Object.keys(entry.blockCounts || {}))
          )
        );
      }

      const sortedEntries = sortRankingEntries(entries, 'stage');

      const headerCols = [
        `<th>${tr('thRank')}</th>`,
        `<th>${tr('thNickname')}</th>`,
        ...allowedTypes.map(type => `<th>${type}</th>`),
        `<th>${tr('thWires')}</th>`,
        `<th>${tr('thHintUsed')}</th>`,
        `<th>${tr('thTime')}</th>`
      ].join('');

      const bodyRows = sortedEntries
        .map((entry, index) => {
          const counts = allowedTypes
            .map(type => entry.blockCounts?.[type] ?? 0)
            .map(count => `<td>${count}</td>`)
            .join('');
          const timeStr = new Date(entry.timestamp).toLocaleString();
          const nickname = entry.nickname;
          const displayNickname = nickname.length > 20 ? `${nickname.slice(0, 20)}...` : nickname;
          return `
  <tr>
    <td>${index + 1}</td>
    <td>${displayNickname}</td>
    ${counts}
    <td>${entry.usedWires}</td>
    <td>${entry.hintsUsed ?? 0}</td>
    <td>${timeStr}</td>
  </tr>`;
        })
        .join('');

      const refreshLabel = translateText(tr, 'refreshRankingBtn', '🔄 새로고침');
      const closeLabel = translateText(tr, 'closeRankingBtn', '닫기');
      listEl.innerHTML = `
        <div class="rankingTableWrapper">
          <table>
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">${refreshLabel}</button>
          <button id="closeRankingBtn">${closeLabel}</button>
        </div>
      `;

      const refreshBtn = modal.querySelector(refreshButtonSelector);
      refreshBtn?.addEventListener('click', () => showRanking(levelId, options));
      const closeBtn = modal.querySelector(closeButtonSelector);
      closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    });

  modal.classList.add('active');
}

export function showProblemRanking(problemKey, options = {}) {
  const {
    listSelector = '#rankingList',
    modalSelector = '#rankingModal',
    translate
  } = options;

  const listEl = document.querySelector(listSelector);
  const modal = document.querySelector(modalSelector);
  if (!listEl || !modal) return;

  const tr = resolveTranslator(translate);

  listEl.innerHTML = translateText(tr, 'rankingLoading', '로딩 중…');
  const allowedTypes = ['INPUT', 'OUTPUT', 'AND', 'OR', 'NOT', 'JUNCTION'];

  db.ref(`problems/${problemKey}/ranking`)
    .orderByChild('timestamp')
    .once('value', snap => {
      const entries = [];
      snap.forEach(ch => {
        entries.push(ch.val());
        return undefined;
      });

      if (entries.length === 0) {
        const noRankingText = translateText(tr, 'noRanking', '랭킹이 없습니다.');
        const refreshLabel = translateText(tr, 'refreshRankingBtn', '🔄 새로고침');
        const closeLabel = translateText(tr, 'closeRankingBtn', '닫기');
        listEl.innerHTML = `
        <p>${noRankingText}</p>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">${refreshLabel}</button>
          <button id="closeRankingBtn">${closeLabel}</button>
        </div>`;
        modal.querySelector('#refreshRankingBtn')?.addEventListener('click', () => showProblemRanking(problemKey, options));
        modal.querySelector('#closeRankingBtn')?.addEventListener('click', () => modal.classList.remove('active'));
        modal.classList.add('active');
        return;
      }

      const isBetter = (a, b) => {
        const aBlocks = getBlockCountSum(a);
        const bBlocks = getBlockCountSum(b);
        if (aBlocks !== bBlocks) return aBlocks < bBlocks;
        if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
        const aHints = a.hintsUsed ?? 0;
        const bHints = b.hintsUsed ?? 0;
        if (aHints !== bHints) return aHints < bHints;
        return new Date(a.timestamp) < new Date(b.timestamp);
      };

      const bestByNickname = {};
      entries.forEach(record => {
        const current = bestByNickname[record.nickname];
        if (!current || isBetter(record, current)) {
          bestByNickname[record.nickname] = record;
        }
      });

      const uniqueEntries = Object.values(bestByNickname);
      uniqueEntries.sort((a, b) => {
        const aBlocks = getBlockCountSum(a);
        const bBlocks = getBlockCountSum(b);
        if (aBlocks !== bBlocks) return aBlocks - bBlocks;
        if (a.usedWires !== b.usedWires) return a.usedWires - b.usedWires;
        const aHints = a.hintsUsed ?? 0;
        const bHints = b.hintsUsed ?? 0;
        if (aHints !== bHints) return aHints - bHints;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      const headerCols = [
        `<th>${tr('thRank')}</th>`,
        `<th>${tr('thNickname')}</th>`,
        ...allowedTypes.map(type => `<th>${type}</th>`),
        `<th>${tr('thWires')}</th>`,
        `<th>${tr('thHintUsed')}</th>`,
        `<th>${tr('thTime')}</th>`
      ].join('');

      const bodyRows = uniqueEntries
        .map((entry, index) => {
          const counts = allowedTypes
            .map(type => entry.blockCounts?.[type] ?? 0)
            .map(count => `<td>${count}</td>`)
            .join('');
          const timeStr = new Date(entry.timestamp).toLocaleString();
          const nickname = entry.nickname;
          const displayNickname = nickname.length > 20 ? `${nickname.slice(0, 20)}...` : nickname;
          return `
  <tr>
    <td>${index + 1}</td>
    <td>${displayNickname}</td>
    ${counts}
    <td>${entry.usedWires}</td>
    <td>${entry.hintsUsed ?? 0}</td>
    <td>${timeStr}</td>
  </tr>`;
        })
        .join('');

      const refreshLabel = translateText(tr, 'refreshRankingBtn', '🔄 새로고침');
      const closeLabel = translateText(tr, 'closeRankingBtn', '닫기');
      listEl.innerHTML = `
        <div class="rankingTableWrapper">
          <table>
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">${refreshLabel}</button>
          <button id="closeRankingBtn">${closeLabel}</button>
        </div>`;

      modal.querySelector('#refreshRankingBtn')?.addEventListener('click', () => showProblemRanking(problemKey, options));
      modal.querySelector('#closeRankingBtn')?.addEventListener('click', () => modal.classList.remove('active'));
      modal.classList.add('active');
    });
}

export async function showClearedModal(level, options = {}) {
  const {
    modalSelector = '#clearedModal',
    stageTitleSelector = '#clearedStageName',
    rankingSelector = '#clearedRanking',
    prevButtonSelector = '#prevStageBtn',
    nextButtonSelector = '#nextStageBtn',
    closeButtonSelector = '.closeBtn',
    translate,
    loadClearedLevelsFromDb,
    getLevelTitles,
    isLevelUnlocked,
    startLevel,
    returnToEditScreen
  } = options;

  if (typeof loadClearedLevelsFromDb === 'function') {
    await loadClearedLevelsFromDb();
  }

  const modal = document.querySelector(modalSelector);
  if (!modal) return;

  const tr = resolveTranslator(translate);
  const titles = typeof getLevelTitles === 'function' ? getLevelTitles() : null;
  const resolvedStageTitle = titles?.[level] ?? translateText(tr, 'stageUntitled', 'Untitled stage');
  const stageTitleEl = document.querySelector(stageTitleSelector);
  if (stageTitleEl) stageTitleEl.textContent = resolvedStageTitle;

  const container = document.querySelector(rankingSelector);
  if (!container) return;

  const currentNickname = getUsername() || localStorage.getItem('nickname') || '';

  const prevBtn = document.querySelector(prevButtonSelector);
  const nextBtn = document.querySelector(nextButtonSelector);

  if (titles && typeof isLevelUnlocked === 'function') {
    if (prevBtn) prevBtn.disabled = !(titles[level - 1] && isLevelUnlocked(level - 1));
    if (nextBtn) nextBtn.disabled = !(titles[level + 1] && isLevelUnlocked(level + 1));
  }

  db.ref(`rankings/${level}`)
    .orderByChild('timestamp')
    .once('value')
    .then(snapshot => {
      if (!snapshot.exists()) {
        const noRankingText = translateText(tr, 'noRanking', '랭킹이 없습니다.');
        container.innerHTML = `
          <p>${noRankingText}</p>
        `;
      } else {
        const entries = [];
        snapshot.forEach(child => {
          entries.push(child.val());
          return undefined;
        });

        const sortedEntries = sortRankingEntries(entries, 'stage');

        let html = `
          <table class="rankingTable">
            <tr><th>${tr('thRank')}</th><th>${tr('thNickname')}</th><th>${tr('thHintUsed')}</th><th>${tr('thTime')}</th></tr>
        `;
        sortedEntries.forEach((entry, index) => {
          const timeStr = new Date(entry.timestamp).toLocaleString();
          const cls = entry.nickname === currentNickname ? 'highlight' : '';
          html += `
            <tr class="${cls}">
              <td>${index + 1}</td>
              <td>${entry.nickname}</td>
              <td>${entry.hintsUsed ?? 0}</td>
              <td>${timeStr}</td>
            </tr>
          `;
        });
        html += `</table>`;
        container.innerHTML = html;
      }

      if (prevBtn) {
        prevBtn.onclick = () => {
          modal.style.display = 'none';
          if (typeof returnToEditScreen === 'function') returnToEditScreen();
          if (typeof startLevel === 'function') startLevel(level - 1);
        };
      }
      if (nextBtn) {
        nextBtn.onclick = () => {
          modal.style.display = 'none';
          if (typeof returnToEditScreen === 'function') returnToEditScreen();
          if (typeof startLevel === 'function') startLevel(level + 1);
        };
      }
      const closeBtn = modal.querySelector(closeButtonSelector);
      if (closeBtn) {
        closeBtn.onclick = () => {
          modal.style.display = 'none';
        };
      }

      modal.style.display = 'flex';
    })
    .catch(err => console.error('랭킹 로드 실패:', err));
}

export function initializeRankingUI(options = {}) {
  const {
    viewRankingButtonSelector = '#viewRankingBtn',
    rankingListSelector = '#rankingList',
    rankingModalSelector = '#rankingModal',
    translate,
    getCurrentLevel,
    getActiveCustomProblemKey,
    getLevelBlockSet,
    alert: alertFn
  } = options;

  const button = document.querySelector(viewRankingButtonSelector);
  if (!button) return;

  const tr = resolveTranslator(translate);

  button.addEventListener('click', () => {
    const level = typeof getCurrentLevel === 'function' ? getCurrentLevel() : null;
    const customProblemKey =
      typeof getActiveCustomProblemKey === 'function' ? getActiveCustomProblemKey() : null;

    if (level != null) {
      showRanking(level, {
        listSelector: rankingListSelector,
        modalSelector: rankingModalSelector,
        translate: tr,
        getLevelBlockSet
      });
      return;
    }

    if (customProblemKey) {
      showProblemRanking(customProblemKey, {
        listSelector: rankingListSelector,
        modalSelector: rankingModalSelector,
        translate: tr
      });
      return;
    }

    const handler = alertFn ?? (typeof alert === 'function' ? alert : console.warn);
    handler(translateText(tr, 'rankingSelectLevelFirst', '먼저 레벨을 선택해주세요.'));
  });
}
