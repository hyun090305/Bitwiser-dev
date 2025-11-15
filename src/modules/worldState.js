const DEFAULT_STORAGE_KEY = 'bitwiser.worldState';

function safeGetItem(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn('WorldStateManager failed to read key', key, err);
    return null;
  }
}

function safeSetItem(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null || typeof value === 'undefined') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('WorldStateManager failed to persist key', key, err);
  }
}

function normalizeNode(def) {
  if (!def || !def.id) {
    throw new Error('WorldState node definitions require an id');
  }
  const id = String(def.id);
  const requires = Array.isArray(def.requires)
    ? def.requires.map(req => String(req))
    : [];
  return {
    id,
    level: typeof def.level === 'number' ? def.level : Number.parseInt(def.level, 10),
    chapterId: def.chapterId ?? null,
    chapterIndex: typeof def.chapterIndex === 'number' ? def.chapterIndex : null,
    stageIndex: typeof def.stageIndex === 'number' ? def.stageIndex : null,
    requires,
    metadata: def.metadata ?? {}
  };
}

export function createWorldStateManager({ storageKey = DEFAULT_STORAGE_KEY } = {}) {
  let nodes = new Map();
  let dependents = new Map();
  let unlocked = new Set();
  let cleared = new Set();
  let storyFlags = new Set();
  let activeNodeId = null;
  let persistedSnapshot = null;
  const listeners = new Set();

  function notify() {
    const snapshot = getSnapshot();
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('WorldStateManager listener failed', err);
      }
    });
  }

  function save() {
    if (!storageKey) return;
    const payload = JSON.stringify({
      unlocked: Array.from(unlocked),
      cleared: Array.from(cleared),
      storyFlags: Array.from(storyFlags),
      activeNodeId
    });
    safeSetItem(storageKey, payload);
  }

  function getSnapshot() {
    return {
      nodes: Array.from(nodes.values()).map(node => ({
        ...node,
        unlocked: isNodeUnlocked(node.id),
        cleared: cleared.has(node.id),
        isActive: node.id === activeNodeId
      })),
      storyFlags: Array.from(storyFlags),
      activeNodeId
    };
  }

  function ensureDependentsEntry(id) {
    if (!dependents.has(id)) {
      dependents.set(id, new Set());
    }
    return dependents.get(id);
  }

  function unlockAvailableNodes() {
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((node, id) => {
        if (unlocked.has(id)) return;
        const requirements = node.requires || [];
        if (!requirements.length) {
          unlocked.add(id);
          changed = true;
          return;
        }
        if (requirements.every(reqId => cleared.has(reqId))) {
          unlocked.add(id);
          changed = true;
        }
      });
    }
  }

  function applyPersistedState() {
    if (!persistedSnapshot) return;
    const {
      unlocked: unlockedIds = [],
      cleared: clearedIds = [],
      storyFlags: storyFlagList = [],
      activeNodeId: savedActive
    } = persistedSnapshot;
    unlocked = new Set(unlockedIds.filter(id => nodes.has(id)));
    cleared = new Set(clearedIds.filter(id => nodes.has(id)));
    storyFlags = new Set(storyFlagList);
    activeNodeId = savedActive && nodes.has(savedActive) ? savedActive : null;
    unlockAvailableNodes();
  }

  function load() {
    if (!storageKey) return;
    const raw = safeGetItem(storageKey);
    if (!raw) return;
    try {
      persistedSnapshot = JSON.parse(raw);
    } catch (err) {
      console.warn('WorldStateManager failed to parse stored state', err);
      persistedSnapshot = null;
    }
    applyPersistedState();
    notify();
  }

  function setNodes(nodeDefinitions, { initialUnlocked = [] } = {}) {
    nodes = new Map();
    dependents = new Map();
    unlocked = new Set(initialUnlocked.map(id => String(id)));
    cleared = new Set();
    storyFlags = storyFlags.size ? new Set(storyFlags) : new Set();
    activeNodeId = activeNodeId && nodeDefinitions.some(def => String(def.id) === activeNodeId)
      ? activeNodeId
      : null;

    nodeDefinitions.forEach(def => {
      const node = normalizeNode(def);
      nodes.set(node.id, node);
      ensureDependentsEntry(node.id);
      (node.requires || []).forEach(reqId => {
        ensureDependentsEntry(reqId).add(node.id);
      });
    });

    if (persistedSnapshot) {
      const {
        unlocked: unlockedIds = [],
        cleared: clearedIds = [],
        storyFlags: storyFlagList = [],
        activeNodeId: savedActive
      } = persistedSnapshot;
      unlockedIds.forEach(id => {
        const key = String(id);
        if (nodes.has(key)) unlocked.add(key);
      });
      clearedIds.forEach(id => {
        const key = String(id);
        if (nodes.has(key)) cleared.add(key);
      });
      storyFlags = new Set(storyFlagList);
      activeNodeId = savedActive && nodes.has(savedActive) ? savedActive : null;
    }

    unlockAvailableNodes();
    save();
    notify();
  }

  function isNodeUnlocked(nodeId) {
    if (!nodeId || !nodes.has(nodeId)) return false;
    if (cleared.has(nodeId)) return true;
    if (unlocked.has(nodeId)) return true;
    const node = nodes.get(nodeId);
    const requirements = node.requires || [];
    if (!requirements.length) return true;
    return requirements.every(reqId => cleared.has(reqId));
  }

  function findNodeByLevel(level) {
    if (level == null) return null;
    const levelStr = String(level);
    for (const node of nodes.values()) {
      if (String(node.level) === levelStr) {
        return node;
      }
    }
    return null;
  }

  function setActiveNode(nodeId) {
    if (nodeId !== null && nodeId !== undefined && !nodes.has(nodeId)) {
      console.warn('Attempted to activate unknown world node', nodeId);
      return null;
    }
    activeNodeId = nodeId ?? null;
    if (activeNodeId) {
      unlocked.add(activeNodeId);
    }
    save();
    notify();
    return activeNodeId ? buildContext(activeNodeId) : null;
  }

  function markNodeCleared(nodeId) {
    if (!nodes.has(nodeId)) {
      console.warn('Attempted to clear unknown world node', nodeId);
      return false;
    }
    if (!cleared.has(nodeId)) {
      cleared.add(nodeId);
      unlocked.add(nodeId);
      unlockAvailableNodes();
      save();
      notify();
    }
    return true;
  }

  function unlockNode(nodeId) {
    if (!nodes.has(nodeId)) return false;
    unlocked.add(nodeId);
    save();
    notify();
    return true;
  }

  function buildContext(nodeId) {
    const node = typeof nodeId === 'object' && nodeId !== null && nodeId.id
      ? nodeId
      : nodes.get(nodeId);
    if (!node) return null;
    return {
      nodeId: node.id,
      level: node.level,
      chapterId: node.chapterId,
      chapterIndex: node.chapterIndex,
      stageIndex: node.stageIndex,
      requires: [...(node.requires || [])],
      unlocked: isNodeUnlocked(node.id),
      cleared: cleared.has(node.id),
      storyFlags: Array.from(storyFlags)
    };
  }

  function activateNode(nodeId) {
    if (!nodes.has(nodeId)) return null;
    unlocked.add(nodeId);
    activeNodeId = nodeId;
    save();
    notify();
    return buildContext(nodeId);
  }

  function getActiveNode() {
    if (!activeNodeId) return null;
    return nodes.get(activeNodeId) || null;
  }

  function setStoryFlag(flag) {
    if (!flag) return;
    storyFlags.add(flag);
    save();
    notify();
  }

  function clearStoryFlag(flag) {
    if (!flag) return;
    if (storyFlags.delete(flag)) {
      save();
      notify();
    }
  }

  function hasStoryFlag(flag) {
    return storyFlags.has(flag);
  }

  function isLevelUnlocked(level) {
    const node = findNodeByLevel(level);
    if (!node) return true;
    return isNodeUnlocked(node.id);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    load,
    save,
    setNodes,
    getSnapshot,
    getNodes: () => Array.from(nodes.values()).map(node => buildContext(node.id)),
    getNode: id => nodes.get(id) || null,
    findNodeByLevel,
    isNodeUnlocked,
    isLevelUnlocked,
    activateNode,
    getActiveNode,
    setActiveNode,
    markNodeCleared,
    unlockNode,
    buildContext,
    setStoryFlag,
    clearStoryFlag,
    hasStoryFlag,
    getStoryFlags: () => Array.from(storyFlags),
    subscribe
  };
}

