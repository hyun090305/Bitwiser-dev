// Stable persistence IDs. Display order and chapter membership never renumber saves.
export const CATALOG_VERSION = 3;
export const MEMORY_GATE = 30;
export const CHAPTERS = [
  ['chapter_1', 'Logic Core', '신호에 의미를 부여하다', 'Give signals meaning.', 'bit_solver'],
  ['chapter_2', 'Memory Link', '지나간 순간을 기억하다', 'Remember what came before.', 'bit_wiser'],
  ['chapter_3', 'Arithmetic Unit', '비트로 계산하다', 'Calculate with bits.', 'bit_master'],
  ['chapter_4', 'Control Flow', '다음 행동을 결정하다', 'Decide what happens next.', 'control_core'],
  ['chapter_5', 'System Integration', '흩어진 기능을 하나로 연결하다', 'Bring the pieces together.', 'system_core']
].map(([id, title, ko, en, titleStyleId], i) => ({ id, title, subtitle: { ko, en }, order: i + 1, titleStyleId, prerequisites: [[], [6], [30], [30], [30, 14, 32]][i] }));

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
      "column": 2,
      "row": 2
    }
  },
  "selector_2to1": {
    "layoutKey": "c2_selector",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "toggle_light": {
    "layoutKey": "c2_toggle",
    "gridPosition": {
      "column": 1,
      "row": 3
    }
  },
  "sticky_fault": {
    "layoutKey": "c2_fault",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "staging_register": {
    "layoutKey": "c2_buffer",
    "gridPosition": {
      "column": 3,
      "row": 3
    }
  },
  "automatic_door": {
    "layoutKey": "c2_door",
    "gridPosition": {
      "column": 4,
      "row": 3
    }
  },
  "priority_gate": {
    "layoutKey": "c2_priority",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  },
  "decoder_2to4": {
    "layoutKey": "c2_decoder",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "rising_edge": {
    "layoutKey": "c2_rise",
    "gridPosition": {
      "column": 5,
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
  "mod3_remainder": {
    "layoutKey": "c3_remainder",
    "gridPosition": {
      "column": 5,
      "row": 3
    }
  },
  "overflow_detector": {
    "layoutKey": "c3_overflow",
    "gridPosition": {
      "column": 3,
      "row": 1
    }
  },
  "twos_complement": {
    "layoutKey": "c3_twos",
    "gridPosition": {
      "column": 4,
      "row": 1
    }
  },
  "two_bit_subtractor": {
    "layoutKey": "c3_subtractor",
    "gridPosition": {
      "column": 5,
      "row": 1
    }
  },
  "two_bit_comparator": {
    "layoutKey": "c3_comparator",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "two_bit_max_selector": {
    "layoutKey": "c3_max",
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
      "column": 2,
      "row": 3
    }
  },
  "mux_4to1": {
    "layoutKey": "c4_mux",
    "gridPosition": {
      "column": 3,
      "row": 2
    }
  },
  "three_bit_shifter": {
    "layoutKey": "c4_shifter",
    "gridPosition": {
      "column": 3,
      "row": 3
    }
  },
  "fixed_xor": {
    "layoutKey": "c4_fixedxor",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "crossroad": {
    "layoutKey": "c4_cross",
    "gridPosition": {
      "column": 5,
      "row": 2
    }
  },
  "fixed_decoder_2to4": {
    "layoutKey": "c4_fixeddecoder",
    "gridPosition": {
      "column": 4,
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
      "column": 3,
      "row": 2
    }
  },
  "serial_receiver": {
    "layoutKey": "c5_rx",
    "gridPosition": {
      "column": 1,
      "row": 1
    }
  },
  "serial_transmitter": {
    "layoutKey": "c5_tx",
    "gridPosition": {
      "column": 3,
      "row": 3
    }
  },
  "mailbox": {
    "layoutKey": "c5_mail",
    "gridPosition": {
      "column": 2,
      "row": 2
    }
  },
  "stack": {
    "layoutKey": "c5_stack",
    "gridPosition": {
      "column": 2,
      "row": 1
    }
  },
  "queue": {
    "layoutKey": "c5_queue",
    "gridPosition": {
      "column": 2,
      "row": 3
    }
  },
  "accumulator": {
    "layoutKey": "c5_accum",
    "gridPosition": {
      "column": 4,
      "row": 2
    }
  },
  "iterative_multiplier": {
    "layoutKey": "c5_iter",
    "gridPosition": {
      "column": 5,
      "row": 2
    }
  }
};

export const STAGES = [
  [0,'tutorial',1,[]],
  [1,'not',1,[0]],
  [2,'or',1,[1]],
  [3,'and',1,[2]],
  [6,'xor',1,[3]],
  [4,'nor',1,[2],true],
  [5,'nand',1,[3],true],
  [25,'enabled_register',2,[]],
  [7,'majority_gate',2,[25]],
  [26,'toggle_light',2,[25]],
  [27,'selector_2to1',2,[7]],
  [28,'sticky_fault',2,[26]],
  [29,'staging_register',2,[27, 28]],
  [30,'automatic_door',2,[29]],
  [23,'priority_gate',2,[7],true],
  [11,'decoder_2to4',2,[27],true],
  [31,'rising_edge',2,[30],true],
  [9,'half_adder',3,[]],
  [8,'parity_checker',3,[9]],
  [10,'full_adder',3,[8]],
  [14,'two_bit_adder',3,[10]],
  [17,'two_bit_multiplier',3,[14]],
  [13,'two_bit_comparator',3,[8]],
  [16,'two_bit_max_selector',3,[13]],
  [24,'twos_complement',3,[14]],
  [15,'two_bit_subtractor',3,[24]],
  [18,'mod3_remainder',3,[17]],
  [null,'overflow_detector',3,[10],false,'candidate',"Overflow Detector"],
  [12,'mux_4to1',4,[36]],
  [21,'three_bit_shifter',4,[12]],
  [32,'up_down_counter',4,[35]],
  [33,'pwm',4,[32]],
  [34,'watchdog',4,[33]],
  [35,'debouncer',4,[]],
  [36,'round_robin',4,[35]],
  [37,'abba_lock',4,[36]],
  [20,'fixed_xor',4,[12]],
  [22,'fixed_decoder_2to4',4,[20]],
  [19,'crossroad',4,[20]],
  [38,'register_bank',5,[]],
  [39,'undo_register',5,[40]],
  [40,'mailbox',5,[38]],
  [41,'stack',5,[40]],
  [42,'queue',5,[40]],
  [43,'serial_receiver',5,[38]],
  [44,'serial_transmitter',5,[39]],
  [45,'accumulator',5,[39]],
  [46,'iterative_multiplier',5,[45]]
].map(([id, nodeId, chapter, prerequisites, optional = false, status = 'playable', title]) => ({
  id, nodeId, chapterId: `chapter_${chapter}`, prerequisites,
  ...STAGE_SLOTS[nodeId], optional, status,
  ...(id === 23 ? { budgetStatus: 'pending' } : {}), ...(title ? { title } : {})
}));

export const stageById = id => STAGES.find(stage => stage.id === id && Number.isInteger(id));
export const playableStages = () => STAGES.filter(stage => stage.status === 'playable');
export function chapterAccess(chapterId, cleared = [], access = {}) {
  const chapter = CHAPTERS.find(ch => ch.id === chapterId);
  const done = new Set(cleared);
  const missing = (chapter?.prerequisites || []).filter(id => !done.has(id));
  const retained = Boolean(access.unlockedChapters?.includes(chapterId)
    || STAGES.some(s => s.chapterId === chapterId && done.has(s.id)));
  return { unlocked: Boolean(chapter && (!missing.length || retained)), missing, retained };
}
export function canPlayStage(id, cleared = [], access = {}) {
  const stage = stageById(id);
  const done = new Set(cleared);
  return Boolean(stage?.status === 'playable' && (done.has(id) || access.unlockedStages?.includes(id)
    || (chapterAccess(stage.chapterId, cleared, access).unlocked && stage.prerequisites.every(pre => done.has(pre)))));
}
export function chapterForStage(id) { return CHAPTERS.find(c => c.id === stageById(id)?.chapterId); }
export function nextAvailableStage(id, cleared = [], access = {}) {
  const current = stageById(id);
  const eligible = playableStages().filter(s => s.chapterId === current?.chapterId && !s.optional && !cleared.includes(s.id) && canPlayStage(s.id, cleared, access));
  return eligible[0]?.id ?? null;
}

// Only a one-time import uses version 2 prerequisites and its common chapter gate.
const LEGACY_PARENTS = {0:[],1:[0],2:[1],3:[2],4:[2],5:[3],6:[3],25:[6],7:[25],26:[25],
  27:[7],28:[26],29:[27,28],30:[29],23:[7],11:[27],31:[29],9:[30],8:[30],10:[30,9,8],
  14:[30,10],17:[30,14],13:[30],16:[30,13],24:[30,14],15:[30,24],18:[30,17],
  12:[30,11],21:[30],34:[30],35:[30,31],20:[30],22:[30,11],19:[30,20]};

export function preserveStageAccess(cleared = [], previous = {}, { legacy = false, allowedIds = playableStages().map(s => s.id) } = {}) {
  const allowed = new Set(allowedIds);
  const unlockedStages = new Set((previous.unlockedStages || []).filter(id => allowed.has(id)));
  const unlockedChapters = new Set((previous.unlockedChapters || []).filter(id => CHAPTERS.some(ch => ch.id === id)));
  if (legacy) {
    for (const [id, parents] of Object.entries(LEGACY_PARENTS)) {
      if (allowed.has(Number(id)) && parents.every(pre => cleared.includes(pre))) unlockedStages.add(Number(id));
    }
    if (cleared.includes(30) && allowed.has(34)) {
      for (const chapter of CHAPTERS.slice(2)) unlockedChapters.add(chapter.id);
    }
  }
  for (const id of [...cleared, ...unlockedStages]) {
    if (allowed.has(id) && stageById(id)) unlockedChapters.add(stageById(id).chapterId);
  }
  const access = { unlockedStages: [...unlockedStages], unlockedChapters: [...unlockedChapters] };
  for (const ch of CHAPTERS) {
    if (STAGES.some(s => s.chapterId === ch.id && allowed.has(s.id)) && chapterAccess(ch.id, cleared, access).unlocked) unlockedChapters.add(ch.id);
  }
  for (const id of allowed) if (canPlayStage(id, cleared, access)) unlockedStages.add(id);
  return { catalogVersion: CATALOG_VERSION, unlockedStages: [...unlockedStages].sort((a,b) => a-b), unlockedChapters: [...unlockedChapters].sort() };
}
