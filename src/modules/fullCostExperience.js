import * as levels from './levels.js';
import { getPlayCircuit, onCircuitModified } from './grid.js';
import { getUsername } from './storage.js';
import { ensureUsernameRegistered } from './authUI.js';
import { createCostStore } from './costRecords.js';
import { createCostLeaderboard } from './costLeaderboard.js';
import { initializeCostBoard, renderPerformance, renderCostRanking, costText, costLanguage } from './costUI.js';
import { configureOfficialCostRanking } from './rank.js';
import { stylePassedResult } from './gradingResultView.js';

export function initializeFullCostExperience({ db, getStage = levels.getCurrentLevel }) {
  const stores = new Map();
  const nickname = () => getUsername() || (costLanguage() === 'ko' ? '익명' : 'Anonymous');
  const store = () => {
    const data = levels.getLoadedStageData(); if (!data) return null;
    const owner = nickname();
    if (!stores.has(owner)) {
      let storage; try { storage = localStorage; } catch { /* session-only store */ }
      stores.set(owner, createCostStore({ storage, levels: data, owner, onFailure: error => console.warn('Cost progress storage failed', error) }));
    }
    return stores.get(owner);
  };
  const leaderboard = () => createCostLeaderboard({ db, levels: levels.getLoadedStageData(), getNickname: nickname,
    ensureNickname: async name => await ensureUsernameRegistered(name) || nickname() });
  initializeCostBoard({ getCircuit: getPlayCircuit, getStage,
    getBest: id => store()?.best(id), getThresholds: levels.getLevelStarThresholds, onModified: onCircuitModified });
  let syncedOwner = null;
  levels.configureLevelModule({ localProgressProvider: () => store()?.cleared() || [],
    remoteProgressProvider: async () => {
      const owner = nickname();
      if (!db?.ref || syncedOwner === owner) return;
      const target = store(), records = await leaderboard().loadPersonal();
      for (const record of records) target.recordClear(record.stageId, record.circuit);
      syncedOwner = owner;
    }
  });
  configureOfficialCostRanking(id => {
    const modal = document.getElementById('rankingModal'), list = document.getElementById('rankingList');
    if (!modal || !list || id === 0) return;
    modal.classList.add('active');
    renderCostRanking(list, { load: db?.ref ? () => leaderboard().load(id) : null });
    const close = document.createElement('button'); close.textContent = costLanguage() === 'ko' ? '닫기' : 'Close';
    close.type = 'button'; close.onclick = () => modal.classList.remove('active'); list.append(close);
  });
  return {
    stars: id => id === 0 ? 0 : Math.max(store()?.stars(id) || 0, levels.getClearedLevels().includes(id) ? 1 : 0),
    onPassed(id, circuit) {
      const result = store().recordClear(id, circuit);
      levels.markLevelCleared(id);
      const modal = document.getElementById('clearedModal');
      stylePassedResult(modal.querySelector('.modal-content'), id);
      const title = document.getElementById('clearedTitle');
      const name = document.createElement('span'); name.id = 'clearedStageName'; name.textContent = levels.getLevelTitle(id);
      title.replaceChildren(name, document.createTextNode(` · ${costText(id === 0 ? 'tutorial' : 'clear')}`));
      const body = document.getElementById('clearedRanking'); body.replaceChildren();
      const online = leaderboard();
      renderPerformance(body, { id, result, thresholds: levels.getLevelStarThresholds(id),
        ranking: db?.ref ? { load: () => online.load(id), submit: () => online.submit(id, result.best.circuit) } : {} });
      const actions = modal.querySelector('.modal-buttons'); actions.replaceChildren();
      const ko = costLanguage() === 'ko';
      const close = () => { modal.style.display = 'none'; levels.returnToEditScreen(); };
      const add = (label, action, id) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (id) b.id = id;
        b.onclick = async () => { b.disabled = true; try { await action(); } finally { b.disabled = false; } }; actions.append(b);
      };
      add(ko ? '다시 설계하기' : 'Back to design', close);
      add(ko ? '맵으로 돌아가기' : 'Back to map', async () => { close(); await levels.returnToLevels(); }, 'clearedMapBtn');
      modal.querySelector('.closeBtn').onclick = close;
      modal.style.display = 'flex';
    }
  };
}
