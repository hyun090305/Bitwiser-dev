import { COST_RULES } from './circuitCost.js';
import { makeCostRecord, isCurrentCostRecord, stageRules } from './costRecords.js';

async function digest(text) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function bounded(promise, timeout = 12000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Leaderboard connection timed out')), timeout); })]).finally(() => clearTimeout(timer));
}
export function rankCostEntries(records, nickname) {
  const best = new Map();
  for (const record of records) {
    if (!best.has(record.nickname) || record.totalCost < best.get(record.nickname).totalCost) best.set(record.nickname, record);
  }
  const ordered = [...best.values()].sort((a, b) => a.totalCost - b.totalCost);
  let rank = 0;
  const entries = ordered.map((entry, index) => {
    if (index === 0 || entry.totalCost !== ordered[index-1].totalCost) rank = index + 1;
    return { ...entry, rank, isMe: entry.nickname === nickname };
  });
  return { entries, own: entries.find(e => e.isMe) || null };
}

// The existing deployment is client-validated Firebase, with no server/Steam
// verifier in this repository. Validate the actual placement on submission AND
// reads; never admit an uploaded numeric score without its passing circuit.
export function createCostLeaderboard({ db, levels, getNickname, ensureNickname }) {
  const path = async id => {
    if (!Number.isInteger(id) || id === 0 || !levels.levelAnswers[id]) throw new Error('Not a ranked stage');
    if (!db?.ref) throw new Error('Leaderboard unavailable');
    return `costRankings/${COST_RULES.version}/${id}/${await digest(stageRules(levels, id))}`;
  };
  return {
    async loadPersonal() {
      if (!db?.ref) throw new Error('Leaderboard unavailable');
      const snapshot = await bounded(db.ref(`costRankings/${COST_RULES.version}`).once('value'), 4000);
      const candidates = [];
      snapshot.forEach(stage => {
        const id = Number(stage.key);
        if (id === 0 || !Number.isInteger(id) || !levels.levelAnswers[id]) return;
        stage.forEach(version => version.forEach(child => {
          const entry = child.val();
          if (entry?.nickname === getNickname() && isCurrentCostRecord(entry, levels, id)) candidates.push(entry);
        }));
      });
      const verified = [];
      for (const entry of candidates) {
        try { verified.push(makeCostRecord(entry.circuit, entry.stageId, levels)); } catch { /* keep invalid records out of progress */ }
      }
      return verified;
    },
    async submit(id, circuit) {
      const record = makeCostRecord(circuit, id, levels);
      await path(id);
      const nickname = await bounded(Promise.resolve().then(() => ensureNickname(getNickname())));
      if (!nickname) throw new Error('Nickname registration required');
      const ref = db.ref(`${await path(id)}/${await digest(nickname)}`);
      const entry = { ...record, nickname, timestamp: new Date().toISOString() };
      // A transaction makes KeepBest safe when multiple clients finish together.
      await bounded(ref.transaction(old => {
        if (isCurrentCostRecord(old, levels, id)) {
          try { if (makeCostRecord(old.circuit, id, levels).totalCost <= record.totalCost) return; } catch { /* replace unverifiable entry */ }
        }
        return entry;
      }, undefined, false));
      return entry;
    },
    async load(id) {
      const snapshot = await bounded(db.ref(await path(id)).once('value'));
      const raw = []; snapshot.forEach(child => { raw.push(child.val()); });
      const records = [];
      for (const entry of raw) {
        if (!isCurrentCostRecord(entry, levels, id) || typeof entry.nickname !== 'string') continue;
        try {
          const checked = makeCostRecord(entry.circuit, id, levels);
          records.push({ ...checked, nickname: entry.nickname });
        } catch { /* forged/stale/failed circuits do not enter this leaderboard */ }
      }
      return rankCostEntries(records, getNickname());
    }
  };
}
