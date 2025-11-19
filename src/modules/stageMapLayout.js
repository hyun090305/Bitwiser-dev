const STAGE_NODE_BLOCKS = {
  NOT: { x: 4, y: 0, w: 3, h: 3 },
  OR: { x: 4, y: 4, w: 3, h: 3 },
  AND: { x: 4, y: 8, w: 3, h: 3 },
  XOR: { x: 4, y: 12, w: 3, h: 3 },
  NAND: { x: 0, y: 16, w: 3, h: 3 },
  FixedXOR: { x: 4, y: 16, w: 3, h: 3 },
  NOR: { x: 8, y: 16, w: 3, h: 3 },
  MajorityGate: { x: 0, y: 24, w: 3, h: 3 },
  ParityChecker: { x: 0, y: 28, w: 3, h: 3 },
  Decoder2to4: { x: 0, y: 32, w: 3, h: 3 },
  Shifter3bit: { x: 0, y: 36, w: 3, h: 3 },
  FixedDecoder: { x: 0, y: 40, w: 3, h: 3 },
  MaxSelector2bit: { x: 4, y: 40, w: 3, h: 3 },
  Crossroad: { x: 4, y: 44, w: 3, h: 3 },
  MUX4to1: { x: 0, y: 48, w: 3, h: 3 },
  AbsoluteValue: { x: 0, y: 56, w: 3, h: 3 },
  HalfAdder: { x: 8, y: 24, w: 3, h: 3 },
  FullAdder: { x: 8, y: 28, w: 3, h: 3 },
  OverflowDetector: { x: 8, y: 32, w: 3, h: 3 },
  Comparator2bit: { x: 8, y: 36, w: 3, h: 3 },
  Adder2bit: { x: 8, y: 40, w: 3, h: 3 },
  TwosComplement: { x: 4, y: 48, w: 3, h: 3 },
  Subtractor2bit: { x: 4, y: 52, w: 3, h: 3 },
  Mod3Remainder: { x: 4, y: 56, w: 3, h: 3 },
  Multiplier2bit: { x: 8, y: 48, w: 3, h: 3 },
  BitWiser: { x: 4, y: 20, w: 3, h: 3 },
  BitMaster: { x: 4, y: 60, w: 3, h: 3 },
  UserCreated: { x: 0, y: 20, w: 3, h: 3 },
  Lab: { x: 8, y: 20, w: 3, h: 3 }
};

const STAGE_MAP_WIRES = [
  { id: 'w_NOT_OR', from: 'NOT', to: 'OR', path: [{ x: 5, y: 1 }, { x: 5, y: 5 }] },
  { id: 'w_OR_AND', from: 'OR', to: 'AND', path: [{ x: 5, y: 5 }, { x: 5, y: 9 }] },
  { id: 'w_AND_XOR', from: 'AND', to: 'XOR', path: [{ x: 5, y: 9 }, { x: 5, y: 13 }] },
  { id: 'w_OR_NOR', from: 'OR', to: 'NOR', path: [{ x: 5, y: 5 }, { x: 5, y: 17 }, { x: 9, y: 17 }] },
  { id: 'w_AND_NAND', from: 'AND', to: 'NAND', path: [{ x: 5, y: 9 }, { x: 5, y: 17 }, { x: 1, y: 17 }] },
  { id: 'w_XOR_FixedXOR', from: 'XOR', to: 'FixedXOR', path: [{ x: 5, y: 13 }, { x: 5, y: 17 }] },
  { id: 'w_XOR_BitWiser', from: 'XOR', to: 'BitWiser', path: [{ x: 5, y: 13 }, { x: 5, y: 21 }] },
  { id: 'w_UserCreated_BitWiser', from: 'UserCreated', to: 'BitWiser', path: [{ x: 1, y: 21 }, { x: 5, y: 21 }] },
  { id: 'w_Lab_BitWiser', from: 'Lab', to: 'BitWiser', path: [{ x: 9, y: 21 }, { x: 5, y: 21 }] },
  { id: 'w_BitWiser_Majority', from: 'BitWiser', to: 'MajorityGate', path: [{ x: 5, y: 21 }, { x: 5, y: 25 }, { x: 1, y: 25 }] },
  { id: 'w_BitWiser_HalfAdder', from: 'BitWiser', to: 'HalfAdder', path: [{ x: 5, y: 21 }, { x: 5, y: 25 }, { x: 9, y: 25 }] },
  { id: 'w_Majority_Parity', from: 'MajorityGate', to: 'ParityChecker', path: [{ x: 1, y: 25 }, { x: 1, y: 29 }] },
  { id: 'w_Parity_Decoder', from: 'ParityChecker', to: 'Decoder2to4', path: [{ x: 1, y: 29 }, { x: 1, y: 33 }] },
  { id: 'w_Parity_Shifter', from: 'ParityChecker', to: 'Shifter3bit', path: [{ x: 1, y: 29 }, { x: 1, y: 37 }] },
  { id: 'w_Decoder_FixedDecoder', from: 'Decoder2to4', to: 'FixedDecoder', path: [{ x: 1, y: 33 }, { x: 1, y: 41 }] },
  { id: 'w_Decoder_MaxSelector', from: 'Decoder2to4', to: 'MaxSelector2bit', path: [{ x: 1, y: 33 }, { x: 1, y: 41 }, { x: 5, y: 41 }] },
  { id: 'w_MaxSelector_MUX', from: 'MaxSelector2bit', to: 'MUX4to1', path: [{ x: 5, y: 41 }, { x: 5, y: 49 }, { x: 1, y: 49 }] },
  { id: 'w_MaxSelector_Cross', from: 'MaxSelector2bit', to: 'Crossroad', path: [{ x: 5, y: 41 }, { x: 5, y: 45 }] },
  { id: 'w_Shifter_Cross', from: 'Shifter3bit', to: 'Crossroad', path: [{ x: 1, y: 37 }, { x: 1, y: 45 }, { x: 5, y: 45 }] },
  { id: 'w_Cross_TwosComp', from: 'Crossroad', to: 'TwosComplement', path: [{ x: 5, y: 45 }, { x: 5, y: 49 }] },
  { id: 'w_MUX_Absolute', from: 'MUX4to1', to: 'AbsoluteValue', path: [{ x: 1, y: 49 }, { x: 1, y: 57 }] },
  { id: 'w_Absolute_BitMaster', from: 'AbsoluteValue', to: 'BitMaster', path: [{ x: 1, y: 57 }, { x: 1, y: 61 }, { x: 5, y: 61 }] },
  { id: 'w_Half_Full', from: 'HalfAdder', to: 'FullAdder', path: [{ x: 9, y: 25 }, { x: 9, y: 29 }] },
  { id: 'w_Full_Overflow', from: 'FullAdder', to: 'OverflowDetector', path: [{ x: 9, y: 29 }, { x: 9, y: 33 }] },
  { id: 'w_Overflow_Comparator', from: 'OverflowDetector', to: 'Comparator2bit', path: [{ x: 9, y: 33 }, { x: 9, y: 37 }] },
  { id: 'w_Comparator_Adder', from: 'Comparator2bit', to: 'Adder2bit', path: [{ x: 9, y: 37 }, { x: 9, y: 41 }] },
  { id: 'w_Adder_Multiplier', from: 'Adder2bit', to: 'Multiplier2bit', path: [{ x: 9, y: 41 }, { x: 9, y: 49 }] },
  { id: 'w_Adder_TwosComp', from: 'Adder2bit', to: 'TwosComplement', path: [{ x: 9, y: 41 }, { x: 9, y: 49 }, { x: 5, y: 49 }] },
  { id: 'w_TwosComp_Sub', from: 'TwosComplement', to: 'Subtractor2bit', path: [{ x: 5, y: 49 }, { x: 5, y: 53 }] },
  { id: 'w_Sub_Mod3', from: 'Subtractor2bit', to: 'Mod3Remainder', path: [{ x: 5, y: 53 }, { x: 5, y: 57 }] },
  { id: 'w_Mod3_BitMaster', from: 'Mod3Remainder', to: 'BitMaster', path: [{ x: 5, y: 57 }, { x: 5, y: 61 }] },
  { id: 'w_Multiplier_BitMaster', from: 'Multiplier2bit', to: 'BitMaster', path: [{ x: 9, y: 49 }, { x: 9, y: 61 }, { x: 5, y: 61 }] }
];

const BASE_NODES = [
  { id: 'UserCreated', label: 'User Created', type: 'mode', icon: '🧩', mode: 'userProblems' },
  { id: 'Lab', label: 'Lab', type: 'mode', icon: '🔬', mode: 'lab' },
  { id: 'BitWiser', label: 'Bit Wiser', type: 'title', icon: '🧠', autoClear: true },
  { id: 'NOT', label: 'NOT', type: 'primitive_gate', level: 1, icon: '¬' },
  { id: 'OR', label: 'OR', type: 'primitive_gate', level: 2 },
  { id: 'AND', label: 'AND', type: 'primitive_gate', level: 3 },
  { id: 'XOR', label: 'XOR', type: 'primitive_gate', level: 6 },
  { id: 'FixedXOR', label: 'Fixed XOR', type: 'primitive_gate', comingSoon: true, autoClear: true },
  { id: 'NOR', label: 'NOR', type: 'primitive_gate', level: 4 },
  { id: 'NAND', label: 'NAND', type: 'primitive_gate', level: 5 },
  { id: 'MajorityGate', label: 'Majority Gate', type: 'logic_stage', level: 7 },
  { id: 'ParityChecker', label: 'Parity Checker', type: 'logic_stage', level: 8 },
  { id: 'Decoder2to4', label: '2-to-4 Decoder', type: 'logic_stage', level: 11 },
  { id: 'FixedDecoder', label: 'Fixed Decoder', type: 'logic_stage', comingSoon: true, autoClear: true },
  { id: 'MaxSelector2bit', label: '2-bit Max Selector', type: 'logic_stage', level: 16 },
  { id: 'Shifter3bit', label: '3-bit Shifter', type: 'logic_stage', comingSoon: true, autoClear: true },
  { id: 'Crossroad', label: 'Crossroad', type: 'logic_stage', comingSoon: true, autoClear: true },
  { id: 'MUX4to1', label: '4-to-1 MUX', type: 'logic_stage', level: 12 },
  { id: 'AbsoluteValue', label: 'Absolute Value', type: 'logic_stage', comingSoon: true, autoClear: true },
  { id: 'HalfAdder', label: 'Half Adder', type: 'arith_stage', level: 9 },
  { id: 'FullAdder', label: 'Full Adder', type: 'arith_stage', level: 10 },
  { id: 'OverflowDetector', label: 'Overflow Detector', type: 'arith_stage', comingSoon: true, autoClear: true },
  { id: 'Comparator2bit', label: '2-bit Comparator', type: 'arith_stage', level: 13 },
  { id: 'Adder2bit', label: '2-bit Adder', type: 'arith_stage', level: 14 },
  { id: 'TwosComplement', label: "2's Complement", type: 'arith_stage', comingSoon: true, autoClear: true },
  { id: 'Subtractor2bit', label: '2-bit Subtractor', type: 'arith_stage', level: 15 },
  { id: 'Mod3Remainder', label: 'Mod 3 Remainder', type: 'arith_stage', level: 18 },
  { id: 'Multiplier2bit', label: '2-bit Multiplier', type: 'arith_stage', level: 17 },
  { id: 'BitMaster', label: 'Bit Master', type: 'title', icon: '🏆', autoClear: true }
].map(node => ({
  ...node,
  block: STAGE_NODE_BLOCKS[node.id] || null
}));

const edgeMap = new Map();
STAGE_MAP_WIRES.forEach(wire => {
  const key = `${wire.from}->${wire.to}`;
  if (!edgeMap.has(key)) {
    edgeMap.set(key, { from: wire.from, to: wire.to });
  }
});

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

export const STAGE_GRAPH = {
  nodes: BASE_NODES,
  edges: Array.from(edgeMap.values())
};

export const STAGE_MAP_BLUEPRINT = {
  grid: { cellSize: 1, stageBlockSize: 3 },
  nodes: BASE_NODES.map(node => ({
    id: node.id,
    label: node.label,
    type: node.type,
    block: node.block
  })),
  wires: STAGE_MAP_WIRES
};
