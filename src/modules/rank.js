import { getUsername } from './storage.js';

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
  return db.ref('rankings').once('value').then(snap => {
    const data = {};
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        const name = v.nickname || '익명';
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
    entries.sort((a, b) => {
      if (a.cleared !== b.cleared) return b.cleared - a.cleared;
      if (a.blocks !== b.blocks) return a.blocks - b.blocks;
      if (a.wires !== b.wires) return a.wires - b.wires;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
    const idx = entries.findIndex(entry => entry.nickname === nickname);
    if (idx === -1) return { rank: '-', cleared: 0 };
    return { rank: idx + 1, cleared: entries[idx].cleared };
  });
}

export function showOverallRanking() {
  const listEl = document.getElementById('overallRankingList');
  if (!listEl) return Promise.resolve();
  listEl.innerHTML = '로딩 중…';

  return db.ref('rankings').once('value').then(snap => {
    const data = {};
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const entry = recSnap.val();
        const name = entry.nickname || '익명';
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

    entries.sort((a, b) => {
      if (a.cleared !== b.cleared) return b.cleared - a.cleared;
      if (a.blocks !== b.blocks) return a.blocks - b.blocks;
      if (a.wires !== b.wires) return a.wires - b.wires;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    let html = `<table>
  <thead><tr>
    <th>${t('thRank')}</th><th>${t('thNickname')}</th><th>${t('thStage')}</th><th>${t('thBlocks')}</th><th>${t('thWires')}</th>
  </tr></thead><tbody>`;

    entries.forEach((entry, index) => {
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

export function saveRanking(levelId, blockCounts, usedWires, hintsUsed) {
  const nickname = getUsername() || '익명';
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
  const nickname = getUsername() || '익명';
  const entry = {
    nickname,
    blockCounts,
    usedWires,
    hintsUsed,
    timestamp: new Date().toISOString()
  };
  const rankingRef = db.ref(`problems/${problemKey}/ranking`);

  const sumBlocks = record => Object.values(record.blockCounts || {}).reduce((sum, count) => sum + count, 0);
  const isBetter = (a, b) => {
    const aBlocks = sumBlocks(a);
    const bBlocks = sumBlocks(b);
    if (aBlocks !== bBlocks) return aBlocks < bBlocks;
    if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
    const aHints = a.hintsUsed ?? 0;
    const bHints = b.hintsUsed ?? 0;
    if (aHints !== bHints) return aHints < bHints;
    return new Date(a.timestamp) < new Date(b.timestamp);
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
}

export function showProblemRanking(problemKey) {
  const listEl = document.getElementById('rankingList');
  const modal = document.getElementById('rankingModal');
  if (!listEl || !modal) return;

  listEl.innerHTML = '로딩 중…';
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
        listEl.innerHTML = `
        <p>랭킹이 없습니다.</p>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>`;
        document.getElementById('refreshRankingBtn')?.addEventListener('click', () => showProblemRanking(problemKey));
        document.getElementById('closeRankingBtn')?.addEventListener('click', () => modal.classList.remove('active'));
        modal.classList.add('active');
        return;
      }

      const sumBlocks = record => Object.values(record.blockCounts || {}).reduce((sum, count) => sum + count, 0);
      const isBetter = (a, b) => {
        const aBlocks = sumBlocks(a);
        const bBlocks = sumBlocks(b);
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
        const aBlocks = sumBlocks(a);
        const bBlocks = sumBlocks(b);
        if (aBlocks !== bBlocks) return aBlocks - bBlocks;
        if (a.usedWires !== b.usedWires) return a.usedWires - b.usedWires;
        const aHints = a.hintsUsed ?? 0;
        const bHints = b.hintsUsed ?? 0;
        if (aHints !== bHints) return aHints - bHints;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      const headerCols = [
        `<th>${t('thRank')}</th>`,
        `<th>${t('thNickname')}</th>`,
        ...allowedTypes.map(type => `<th>${type}</th>`),
        `<th>${t('thWires')}</th>`,
        `<th>${t('thHintUsed')}</th>`,
        `<th>${t('thTime')}</th>`
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

      listEl.innerHTML = `
        <div class="rankingTableWrapper">
          <table>
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>`;

      document.getElementById('refreshRankingBtn')?.addEventListener('click', () => showProblemRanking(problemKey));
      document.getElementById('closeRankingBtn')?.addEventListener('click', () => modal.classList.remove('active'));
      modal.classList.add('active');
    });
}
