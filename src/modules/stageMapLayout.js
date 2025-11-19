const BASE_STAGE_SPAN = 3;

export const STAGE_TYPE_META = {
  primitive_gate: {
    labelKey: 'stageTypePrimitive',
    className: 'stage-node--primitive',
    icon: '🔹'
  },
  logic_stage: {
    labelKey: 'stageTypeLogic',
    className: 'stage-node--logic',
    icon: '🧩'
  },
  arith_stage: {
    labelKey: 'stageTypeArithmetic',
    className: 'stage-node--arithmetic',
    icon: '➗'
  },
  mode: {
    labelKey: 'stageTypeMode',
    className: 'stage-node--mode',
    icon: '🚪'
  },
  title: {
    labelKey: 'stageTypeTitle',
    className: 'stage-node--title',
    icon: '🏅'
  }
};

function stage(id, options) {
  return {
    id,
    type: 'primitive_gate',
    label: id,
    gridPosition: { r: 0, c: 0 },
    ...options
  };
}

const STAGE_NODES = [
  stage('UserCreated', {
    label: 'User Created',
    type: 'mode',
    gridPosition: { r: 0, c: 12 },
    icon: '🧩',
    mode: 'userProblems'
  }),
  stage('Lab', {
    label: 'Lab',
    type: 'mode',
    gridPosition: { r: 0, c: 18 },
    icon: '🔬',
    mode: 'lab'
  }),
  stage('BitWiser', {
    label: 'Bit Wiser',
    type: 'title',
    icon: '🧠',
    gridPosition: { r: 12, c: 18 },
    autoClear: true
  }),

  stage('NOT', { label: 'NOT', level: 1, gridPosition: { r: 6, c: 0 } }),
  stage('OR', { label: 'OR', level: 2, gridPosition: { r: 6, c: 6 } }),
  stage('AND', { label: 'AND', level: 3, gridPosition: { r: 6, c: 12 } }),
  stage('XOR', { label: 'XOR', level: 6, gridPosition: { r: 6, c: 18 } }),
  stage('FixedXOR', {
    label: 'Fixed XOR',
    gridPosition: { r: 6, c: 24 },
    comingSoon: true,
    autoClear: true
  }),
  stage('NOR', { label: 'NOR', level: 4, gridPosition: { r: 12, c: 6 } }),
  stage('NAND', { label: 'NAND', level: 5, gridPosition: { r: 12, c: 12 } }),

  stage('MajorityGate', {
    label: 'Majority Gate',
    type: 'logic_stage',
    level: 7,
    gridPosition: { r: 12, c: 24 }
  }),
  stage('ParityChecker', {
    label: 'Parity Checker',
    type: 'logic_stage',
    level: 8,
    gridPosition: { r: 12, c: 30 }
  }),
  stage('Decoder2to4', {
    label: '2-to-4 Decoder',
    type: 'logic_stage',
    level: 11,
    gridPosition: { r: 12, c: 36 }
  }),
  stage('FixedDecoder', {
    label: 'Fixed Decoder',
    type: 'logic_stage',
    gridPosition: { r: 18, c: 36 },
    comingSoon: true,
    autoClear: true
  }),
  stage('MaxSelector2bit', {
    label: '2-bit Max Selector',
    type: 'logic_stage',
    level: 16,
    gridPosition: { r: 12, c: 42 }
  }),
  stage('Shifter3bit', {
    label: '3-bit Shifter',
    type: 'logic_stage',
    gridPosition: { r: 18, c: 30 },
    comingSoon: true,
    autoClear: true
  }),
  stage('Crossroad', {
    label: 'Crossroad',
    type: 'logic_stage',
    gridPosition: { r: 18, c: 42 },
    comingSoon: true,
    autoClear: true
  }),
  stage('MUX4to1', {
    label: '4-to-1 MUX',
    type: 'logic_stage',
    level: 12,
    gridPosition: { r: 12, c: 48 }
  }),
  stage('AbsoluteValue', {
    label: 'Absolute Value',
    type: 'logic_stage',
    gridPosition: { r: 12, c: 54 },
    comingSoon: true,
    autoClear: true
  }),

  stage('HalfAdder', {
    label: 'Half Adder',
    type: 'arith_stage',
    level: 9,
    gridPosition: { r: 18, c: 18 }
  }),
  stage('FullAdder', {
    label: 'Full Adder',
    type: 'arith_stage',
    level: 10,
    gridPosition: { r: 24, c: 18 }
  }),
  stage('OverflowDetector', {
    label: 'Overflow Detector',
    type: 'arith_stage',
    gridPosition: { r: 30, c: 18 },
    comingSoon: true,
    autoClear: true
  }),
  stage('Comparator2bit', {
    label: '2-bit Comparator',
    type: 'arith_stage',
    level: 13,
    gridPosition: { r: 30, c: 30 }
  }),
  stage('Adder2bit', {
    label: '2-bit Adder',
    type: 'arith_stage',
    level: 14,
    gridPosition: { r: 36, c: 30 }
  }),
  stage('TwosComplement', {
    label: "2's Complement",
    type: 'arith_stage',
    gridPosition: { r: 36, c: 42 },
    comingSoon: true,
    autoClear: true
  }),
  stage('Subtractor2bit', {
    label: '2-bit Subtractor',
    type: 'arith_stage',
    level: 15,
    gridPosition: { r: 42, c: 42 }
  }),
  stage('Multiplier2bit', {
    label: '2-bit Multiplier',
    type: 'arith_stage',
    level: 17,
    gridPosition: { r: 36, c: 54 }
  }),
  stage('Mod3Remainder', {
    label: 'Mod 3 Remainder',
    type: 'arith_stage',
    level: 18,
    gridPosition: { r: 48, c: 42 }
  }),

  stage('BitMaster', {
    label: 'Bit Master',
    type: 'title',
    icon: '🏆',
    gridPosition: { r: 36, c: 60 },
    autoClear: true
  })
];

const STAGE_CONNECTIONS = [
  { from: 'NOT', to: 'OR', startAnchor: 'E', endAnchor: 'W' },
  { from: 'OR', to: 'AND', startAnchor: 'E', endAnchor: 'W' },
  { from: 'AND', to: 'XOR', startAnchor: 'E', endAnchor: 'W' },
  { from: 'OR', to: 'NOR', startAnchor: 'S', endAnchor: 'N' },
  { from: 'AND', to: 'NAND', startAnchor: 'S', endAnchor: 'N' },
  { from: 'XOR', to: 'FixedXOR', startAnchor: 'E', endAnchor: 'W' },
  { from: 'XOR', to: 'BitWiser', startAnchor: 'S', endAnchor: 'N' },
  {
    from: 'UserCreated',
    to: 'BitWiser',
    startAnchor: 'S',
    endAnchor: 'W',
    path: [
      { r: 8, c: 13 },
      { r: 8, c: 17 }
    ]
  },
  {
    from: 'Lab',
    to: 'BitWiser',
    startAnchor: 'S',
    endAnchor: 'E',
    path: [
      { r: 8, c: 19 },
      { r: 8, c: 21 }
    ]
  },
  { from: 'BitWiser', to: 'MajorityGate', startAnchor: 'E', endAnchor: 'W' },
  { from: 'BitWiser', to: 'HalfAdder', startAnchor: 'S', endAnchor: 'N' },
  { from: 'MajorityGate', to: 'ParityChecker', startAnchor: 'E', endAnchor: 'W' },
  { from: 'ParityChecker', to: 'Decoder2to4', startAnchor: 'E', endAnchor: 'W' },
  { from: 'ParityChecker', to: 'Shifter3bit', startAnchor: 'S', endAnchor: 'N' },
  { from: 'Decoder2to4', to: 'FixedDecoder', startAnchor: 'S', endAnchor: 'N' },
  { from: 'Decoder2to4', to: 'MaxSelector2bit', startAnchor: 'E', endAnchor: 'W' },
  { from: 'MaxSelector2bit', to: 'MUX4to1', startAnchor: 'E', endAnchor: 'W' },
  { from: 'MaxSelector2bit', to: 'Crossroad', startAnchor: 'S', endAnchor: 'N' },
  { from: 'Shifter3bit', to: 'Crossroad', startAnchor: 'E', endAnchor: 'W' },
  { from: 'Crossroad', to: 'TwosComplement', startAnchor: 'S', endAnchor: 'N' },
  { from: 'MUX4to1', to: 'AbsoluteValue', startAnchor: 'E', endAnchor: 'W' },
  {
    from: 'AbsoluteValue',
    to: 'BitMaster',
    startAnchor: 'S',
    endAnchor: 'N',
    path: [
      { r: 28, c: 55 },
      { r: 28, c: 61 }
    ]
  },
  { from: 'HalfAdder', to: 'FullAdder', startAnchor: 'S', endAnchor: 'N' },
  { from: 'FullAdder', to: 'OverflowDetector', startAnchor: 'S', endAnchor: 'N' },
  { from: 'OverflowDetector', to: 'Comparator2bit', startAnchor: 'E', endAnchor: 'W' },
  { from: 'Comparator2bit', to: 'Adder2bit', startAnchor: 'S', endAnchor: 'N' },
  {
    from: 'Adder2bit',
    to: 'Multiplier2bit',
    startAnchor: 'E',
    endAnchor: 'W',
    path: [
      { r: 40, c: 33 },
      { r: 40, c: 53 }
    ]
  },
  { from: 'Adder2bit', to: 'TwosComplement', startAnchor: 'E', endAnchor: 'W' },
  { from: 'TwosComplement', to: 'Subtractor2bit', startAnchor: 'S', endAnchor: 'N' },
  { from: 'Subtractor2bit', to: 'Mod3Remainder', startAnchor: 'S', endAnchor: 'N' },
  {
    from: 'Mod3Remainder',
    to: 'BitMaster',
    startAnchor: 'E',
    endAnchor: 'S',
    path: [
      { r: 39, c: 45 },
      { r: 39, c: 61 }
    ]
  },
  { from: 'Multiplier2bit', to: 'BitMaster', startAnchor: 'E', endAnchor: 'W' }
];

export const STAGE_GRAPH = {
  cellSpan: BASE_STAGE_SPAN,
  nodes: STAGE_NODES,
  connections: STAGE_CONNECTIONS,
  edges: STAGE_CONNECTIONS
};
