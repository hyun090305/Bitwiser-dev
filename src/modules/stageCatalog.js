// Stable persistence IDs. Display order and chapter membership never renumber saves.
export const CATALOG_VERSION = 5;
export const MEMORY_GATE = 30;
export const CHAPTERS = [
  ['chapter_1', 'Logic Core', '신호에 의미를 부여하다', 'Give signals meaning.', 'bit_solver'],
  ['chapter_2', 'Memory Link', '지나간 신호를 기억하다', 'Remember past signals.', 'bit_wiser'],
  ['chapter_3', 'Arithmetic Unit', '신호를 값으로 계산하다', 'Calculate values from signals.', 'bit_master'],
  ['chapter_4', 'Control Flow', '신호의 경로와 반응을 조율하다', 'Coordinate signal paths and responses.', 'control_core'],
  ['chapter_5', 'System Integration', '기억과 계산을 하나로 연결하다', 'Connect memory and calculation.', 'system_core']
].map(([id, title, ko, en, titleStyleId], i) => ({ id, title, subtitle: { ko, en }, order: i + 1, titleStyleId, requiredStars: [0, 18, 36, 50, 84][i] }));

// Candidate IDs are reserved, but have no playable definition or invented budget.
const STAGE_SLOTS = {
  "tutorial": {
    "layoutKey": "c1_tutorial",
    "gridPosition": {
      "column": 1,
      "row": 2
    }
  },
  "not": {
    "layoutKey": "c1_not",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "or": {
    "layoutKey": "c1_or",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "and": {
    "layoutKey": "c1_and",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "xor": {
    "layoutKey": "c1_xor",
    "gridPosition": {
      "column": 5,
      "row": 2
    }
  },
  "nor": {
    "layoutKey": "c1_nor",
    "gridPosition": {
      "column": 3,
      "row": 3
    }
  },
  "nand": {
    "layoutKey": "c1_nand",
    "gridPosition": {
      "column": 4,
      "row": 3
    }
  },
  "enabled_register": {
    "layoutKey": "c2_save",
    "gridPosition": {
      "column": 1,
      "row": 2
    }
  },
  "majority_gate": {
    "layoutKey": "c2_majority",
    "gridPosition": {
      "column": 4,
      "row": 1
    }
  },
  "toggle_light": {
    "layoutKey": "c2_toggle",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "selector_2to1": {
    "layoutKey": "c2_selector",
    "gridPosition": {
      "column": 1,
      "row": 1
    }
  },
  "sticky_fault": {
    "layoutKey": "c2_fault",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "staging_register": {
    "layoutKey": "c2_buffer",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "automatic_door": {
    "layoutKey": "c2_door",
    "gridPosition": {
      "column": 5,
      "row": 2
    }
  },
  "priority_gate": {
    "layoutKey": "c2_priority",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "decoder_2to4": {
    "layoutKey": "c2_decoder",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  },
  "rising_edge": {
    "layoutKey": "c2_rise",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "half_adder": {
    "layoutKey": "c3_half",
    "gridPosition": {
      "column": 1,
      "row": 2
    }
  },
  "parity_checker": {
    "layoutKey": "c3_parity",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "full_adder": {
    "layoutKey": "c3_full",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "two_bit_adder": {
    "layoutKey": "c3_adder",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "two_bit_multiplier": {
    "layoutKey": "c3_multiplier",
    "gridPosition": {
      "column": 5,
      "row": 2
    }
  },
  "two_bit_comparator": {
    "layoutKey": "c3_comparator",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  },
  "two_bit_max_selector": {
    "layoutKey": "c3_max",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "twos_complement": {
    "layoutKey": "c3_twos",
    "gridPosition": {
      "column": 4,
      "row": 3
    }
  },
  "two_bit_subtractor": {
    "layoutKey": "c3_subtractor",
    "gridPosition": {
      "column": 5,
      "row": 3
    }
  },
  "mod3_remainder": {
    "layoutKey": "c3_remainder",
    "gridPosition": {
      "column": 5,
      "row": 1
    }
  },
  "overflow_detector": {
    "layoutKey": "c3_overflow",
    "gridPosition": {
      "column": 4,
      "row": 1
    }
  },
  "mux_4to1": {
    "layoutKey": "c4_mux",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "three_bit_shifter": {
    "layoutKey": "c4_shifter",
    "gridPosition": {
      "column": 3,
      "row": 3
    }
  },
  "up_down_counter": {
    "layoutKey": "c4_counter",
    "gridPosition": {
      "column": 1,
      "row": 1
    }
  },
  "pwm": {
    "layoutKey": "c4_pwm",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  },
  "watchdog": {
    "layoutKey": "c4_watchdog",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "debouncer": {
    "layoutKey": "c4_debounce",
    "gridPosition": {
      "column": 1,
      "row": 2
    }
  },
  "round_robin": {
    "layoutKey": "c4_round",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "abba_lock": {
    "layoutKey": "c4_abba",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "fixed_xor": {
    "layoutKey": "c4_fixedxor",
    "gridPosition": {
      "column": 1,
      "row": 3
    }
  },
  "fixed_decoder_2to4": {
    "layoutKey": "c4_fixeddecoder",
    "gridPosition": {
      "column": 4,
      "row": 3
    }
  },
  "crossroad": {
    "layoutKey": "c4_cross",
    "gridPosition": {
      "column": 5,
      "row": 3
    }
  },
  "register_bank": {
    "layoutKey": "c5_register",
    "gridPosition": {
      "column": 1,
      "row": 2
    }
  },
  "undo_register": {
    "layoutKey": "c5_undo",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "mailbox": {
    "layoutKey": "c5_mail",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "stack": {
    "layoutKey": "c5_stack",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "queue": {
    "layoutKey": "c5_queue",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "serial_receiver": {
    "layoutKey": "c5_rx",
    "gridPosition": {
      "column": 1,
      "row": 3
    }
  },
  "serial_transmitter": {
    "layoutKey": "c5_tx",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "accumulator": {
    "layoutKey": "c5_accum",
    "gridPosition": {
      "column": 1,
      "row": 1
    }
  },
  "iterative_multiplier": {
    "layoutKey": "c5_iter",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  }
};

export const STAGES = [
  [0,'tutorial',1],
  [1,'not',1],
  [2,'or',1],
  [3,'and',1],
  [6,'xor',1],
  [4,'nor',1],
  [5,'nand',1],
  [25,'enabled_register',2],
  [7,'majority_gate',1],
  [26,'toggle_light',2],
  [27,'selector_2to1',2],
  [28,'sticky_fault',2],
  [29,'staging_register',2],
  [30,'automatic_door',2],
  [23,'priority_gate',2],
  [11,'decoder_2to4',2],
  [31,'rising_edge',2],
  [9,'half_adder',3],
  [8,'parity_checker',3],
  [10,'full_adder',3],
  [14,'two_bit_adder',3],
  [17,'two_bit_multiplier',3],
  [13,'two_bit_comparator',3],
  [16,'two_bit_max_selector',3],
  [24,'twos_complement',3],
  [15,'two_bit_subtractor',3],
  [18,'mod3_remainder',3],
  [47,'overflow_detector',3],
  [12,'mux_4to1',4],
  [21,'three_bit_shifter',4],
  [32,'up_down_counter',4],
  [33,'pwm',4],
  [34,'watchdog',4],
  [35,'debouncer',4],
  [36,'round_robin',4],
  [37,'abba_lock',4],
  [20,'fixed_xor',4],
  [22,'fixed_decoder_2to4',4],
  [19,'crossroad',4],
  [38,'register_bank',5],
  [39,'undo_register',5],
  [40,'mailbox',5],
  [41,'stack',5],
  [42,'queue',5],
  [43,'serial_receiver',5],
  [44,'serial_transmitter',5],
  [45,'accumulator',5],
  [46,'iterative_multiplier',5]
].map(([id, nodeId, chapter, status = 'playable', title]) => ({
  id, nodeId, chapterId: `chapter_${chapter}`,
  ...STAGE_SLOTS[nodeId], status,
  ...(id === 23 ? { budgetStatus: 'pending' } : {}), ...(title ? { title } : {})
}));

export const stageById = id => STAGES.find(stage => stage.id === id && Number.isInteger(id));
export const playableStages = () => STAGES.filter(stage => stage.status === 'playable');
export function chapterAccess(chapterId, cleared = [], access = {}) {
  const chapter = CHAPTERS.find(ch => ch.id === chapterId);
  const done = new Set(cleared);
  const totalStars = totalStageStars(cleared, access.stageStars);
  const requiredStars = chapter?.requiredStars || 0;
  const progress = { totalStars, requiredStars, remainingStars: Math.max(0, requiredStars - totalStars) };
  // Optional provider policy takes precedence even over retained clear/access.
  // Normal save writers never persist these overrides.
  const override = access.chapterOverrides?.[chapterId];
  if (chapter && (override === 'locked' || override === 'unlocked')) {
    return { ...progress, unlocked: override === 'unlocked', retained: false };
  }
  // Legacy per-stage access grants the whole chapter, never an individual gate.
  const retained = Boolean(access.unlockedChapters?.includes(chapterId)
    || STAGES.some(s => s.status === 'playable' && s.chapterId === chapterId
      && (done.has(s.id) || access.unlockedStages?.includes(s.id))));
  return { ...progress, unlocked: Boolean(chapter && (totalStars >= requiredStars || retained)), retained };
}

// Totals are derived from official stage records, never a saved display number.
export function totalStageStars(cleared = [], stageStars = {}, allowedIds = playableStages().map(s => s.id)) {
  const done = new Set(cleared);
  return playableStages().reduce((sum, { id }) => sum + (id !== 0 && allowedIds.includes(id)
    ? Math.max(done.has(id) ? 1 : 0, validStars(stageStars?.[id])) : 0), 0);
}
function validStars(value) { return Number.isInteger(value) ? Math.max(0, Math.min(3, value)) : 0; }

export function acknowledgeChapter(access, chapterId) {
  return { ...access, pendingChapters: (access.pendingChapters || []).filter(id => id !== chapterId),
    seenChapters: [...new Set([...(access.seenChapters || []), chapterId])].sort() };
}
export function canPlayStage(id, cleared = [], access = {}) {
  const stage = stageById(id);
  return Boolean(stage?.status === 'playable' && chapterAccess(stage.chapterId, cleared, access).unlocked);
}
export function chapterForStage(id) { return CHAPTERS.find(c => c.id === stageById(id)?.chapterId); }

// Only a one-time import uses version 2 prerequisites and its common chapter gate.
const LEGACY_PARENTS = {0:[],1:[0],2:[1],3:[2],4:[2],5:[3],6:[3],25:[6],7:[25],26:[25],
  27:[7],28:[26],29:[27,28],30:[29],23:[7],11:[27],31:[29],9:[30],8:[30],10:[30,9,8],
  14:[30,10],17:[30,14],13:[30],16:[30,13],24:[30,14],15:[30,24],18:[30,17],
  12:[30,11],21:[30],34:[30],35:[30,31],20:[30],22:[30,11],19:[30,20]};

export function preserveStageAccess(cleared = [], previous = {}, { legacy = (previous.catalogVersion ?? CATALOG_VERSION) < 3, allowedIds = playableStages().map(s => s.id), stageStars = {} } = {}) {
  const allowed = new Set(allowedIds);
  const allowedChapters = CHAPTERS.filter(ch => STAGES.some(s => s.chapterId === ch.id && allowed.has(s.id)));
  const chapterIds = new Set(allowedChapters.map(ch => ch.id));
  const unlockedStages = new Set((previous.unlockedStages || []).filter(id => allowed.has(id)));
  const unlockedChapters = new Set((previous.unlockedChapters || []).filter(id => chapterIds.has(id)));
  const migrating = legacy || (previous.catalogVersion ?? CATALOG_VERSION) < CATALOG_VERSION;
  if (legacy) {
    for (const [id, parents] of Object.entries(LEGACY_PARENTS)) {
      if (allowed.has(Number(id)) && parents.every(pre => cleared.includes(pre))) unlockedStages.add(Number(id));
    }
    if (cleared.includes(30) && allowed.has(34)) {
      for (const chapter of CHAPTERS.slice(2)) unlockedChapters.add(chapter.id);
    }
  }
  if (migrating) {
    // Recover OLD membership and v3/v4 gates before moving Majority to C1.
    const oldGates = [[], [6], [30], [30], [30, 14, 32]];
    for (const ch of allowedChapters) {
      if (oldGates[ch.order - 1].every(id => cleared.includes(id))) unlockedChapters.add(ch.id);
    }
    for (const id of [...cleared, ...unlockedStages]) {
      const oldChapter = id === 7 ? 'chapter_2' : stageById(id)?.chapterId;
      if (allowed.has(id) && chapterIds.has(oldChapter)) unlockedChapters.add(oldChapter);
    }
  }
  for (const id of [...cleared, ...unlockedStages]) {
    if (allowed.has(id) && stageById(id)) unlockedChapters.add(stageById(id).chapterId);
  }
  const stars = Object.fromEntries(allowedIds.filter(id => id !== 0 && stageById(id)).map(id => [id,
    Math.max(validStars(previous.stageStars?.[id]), validStars(stageStars[id]), cleared.includes(id) ? 1 : 0)]).filter(([, stars]) => stars > 0));
  const access = { stageStars: stars, unlockedStages: [...unlockedStages], unlockedChapters: [...unlockedChapters] };
  const seen = new Set((previous.seenChapters || []).filter(id => chapterIds.has(id)));
  const pending = new Set((previous.pendingChapters || []).filter(id => chapterIds.has(id) && !seen.has(id)));
  // Restoring historical access is not a new unlock celebration.
  if (migrating) for (const id of unlockedChapters) { seen.add(id); pending.delete(id); }
  for (const ch of allowedChapters) {
    if (STAGES.some(s => s.chapterId === ch.id && allowed.has(s.id)) && chapterAccess(ch.id, cleared, access).unlocked) unlockedChapters.add(ch.id);
    if (ch.order > 1 && unlockedChapters.has(ch.id) && !access.unlockedChapters.includes(ch.id) && !seen.has(ch.id)) pending.add(ch.id);
  }
  access.unlockedChapters = [...unlockedChapters];
  // Retain a compatible snapshot for old readers; chapterAccess owns admission.
  for (const id of allowed) if (canPlayStage(id, cleared, access)) unlockedStages.add(id);
  return { catalogVersion: CATALOG_VERSION, stageStars: stars, unlockedStages: [...unlockedStages].sort((a,b) => a-b),
    unlockedChapters: [...unlockedChapters].filter(id => chapterIds.has(id)).sort(), pendingChapters: [...pending].sort(), seenChapters: [...seen].sort() };
}
