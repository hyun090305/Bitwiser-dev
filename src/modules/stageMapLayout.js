const BASE_OFFSET_X = 120;
const BASE_OFFSET_Y = 120;

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

function nodePosition(x, y) {
  return [BASE_OFFSET_X + x, BASE_OFFSET_Y + y];
}

export const STAGE_GRAPH = {
  nodes: [
    { id: 'UserCreated', label: 'User Created', type: 'mode', position: nodePosition(280, 0), icon: '🧩', mode: 'userProblems' },
    { id: 'Lab', label: 'Lab', type: 'mode', position: nodePosition(420, 0), icon: '🔬', mode: 'lab' },
    { id: 'BitWiser', label: 'Bit Wiser', type: 'title', position: nodePosition(600, 0), icon: '🧠', autoClear: true },

    { id: 'NOT', label: 'NOT', type: 'primitive_gate', level: 1, position: nodePosition(0, 200), icon: '¬' },
    { id: 'OR', label: 'OR', type: 'primitive_gate', level: 2, position: nodePosition(160, 200) },
    { id: 'AND', label: 'AND', type: 'primitive_gate', level: 3, position: nodePosition(320, 200) },
    { id: 'XOR', label: 'XOR', type: 'primitive_gate', level: 6, position: nodePosition(480, 200) },
    { id: 'FixedXOR', label: 'Fixed XOR', type: 'primitive_gate', position: nodePosition(640, 200), comingSoon: true, autoClear: true },
    { id: 'NOR', label: 'NOR', type: 'primitive_gate', level: 4, position: nodePosition(160, 360) },
    { id: 'NAND', label: 'NAND', type: 'primitive_gate', level: 5, position: nodePosition(320, 360) },

    { id: 'MajorityGate', label: 'Majority Gate', type: 'logic_stage', level: 7, position: nodePosition(600, 360) },
    { id: 'ParityChecker', label: 'Parity Checker', type: 'logic_stage', level: 8, position: nodePosition(760, 360) },
    { id: 'Decoder2to4', label: '2-to-4 Decoder', type: 'logic_stage', level: 11, position: nodePosition(920, 360) },
    { id: 'FixedDecoder', label: 'Fixed Decoder', type: 'logic_stage', position: nodePosition(920, 520), comingSoon: true, autoClear: true },
    { id: 'MaxSelector2bit', label: '2-bit Max Selector', type: 'logic_stage', level: 16, position: nodePosition(1080, 360) },
    { id: 'Shifter3bit', label: '3-bit Shifter', type: 'logic_stage', position: nodePosition(760, 520), comingSoon: true, autoClear: true },
    { id: 'Crossroad', label: 'Crossroad', type: 'logic_stage', position: nodePosition(1080, 520), comingSoon: true, autoClear: true },
    { id: 'MUX4to1', label: '4-to-1 MUX', type: 'logic_stage', level: 12, position: nodePosition(1240, 360) },
    { id: 'AbsoluteValue', label: 'Absolute Value', type: 'logic_stage', position: nodePosition(1400, 360), comingSoon: true, autoClear: true },

    { id: 'HalfAdder', label: 'Half Adder', type: 'arith_stage', level: 9, position: nodePosition(600, 520) },
    { id: 'FullAdder', label: 'Full Adder', type: 'arith_stage', level: 10, position: nodePosition(600, 680) },
    { id: 'OverflowDetector', label: 'Overflow Detector', type: 'arith_stage', position: nodePosition(760, 680), comingSoon: true, autoClear: true },
    { id: 'Comparator2bit', label: '2-bit Comparator', type: 'arith_stage', level: 13, position: nodePosition(920, 680) },
    { id: 'Adder2bit', label: '2-bit Adder', type: 'arith_stage', level: 14, position: nodePosition(1080, 680) },
    { id: 'TwosComplement', label: "2's Complement", type: 'arith_stage', position: nodePosition(1240, 680), comingSoon: true, autoClear: true },
    { id: 'Subtractor2bit', label: '2-bit Subtractor', type: 'arith_stage', level: 15, position: nodePosition(1400, 680) },
    { id: 'Multiplier2bit', label: '2-bit Multiplier', type: 'arith_stage', level: 17, position: nodePosition(1240, 520) },
    { id: 'Mod3Remainder', label: 'Mod 3 Remainder', type: 'arith_stage', level: 18, position: nodePosition(1560, 680) },

    { id: 'BitMaster', label: 'Bit Master', type: 'title', position: nodePosition(1560, 520), icon: '🏆', autoClear: true }
  ],
  edges: [
    { from: 'NOT', to: 'OR' },
    { from: 'OR', to: 'AND' },
    { from: 'AND', to: 'XOR' },
    { from: 'OR', to: 'NOR' },
    { from: 'AND', to: 'NAND' },
    { from: 'XOR', to: 'FixedXOR' },
    { from: 'XOR', to: 'BitWiser' },

    { from: 'UserCreated', to: 'BitWiser' },
    { from: 'Lab', to: 'BitWiser' },

    { from: 'BitWiser', to: 'MajorityGate' },
    { from: 'BitWiser', to: 'HalfAdder' },

    { from: 'MajorityGate', to: 'ParityChecker' },
    { from: 'ParityChecker', to: 'Decoder2to4' },
    { from: 'ParityChecker', to: 'Shifter3bit' },

    { from: 'Decoder2to4', to: 'FixedDecoder' },
    { from: 'Decoder2to4', to: 'MaxSelector2bit' },
    { from: 'MaxSelector2bit', to: 'MUX4to1' },
    { from: 'MaxSelector2bit', to: 'Crossroad' },

    { from: 'Shifter3bit', to: 'Crossroad' },
    { from: 'Crossroad', to: 'TwosComplement' },

    { from: 'MUX4to1', to: 'AbsoluteValue' },
    { from: 'AbsoluteValue', to: 'BitMaster' },

    { from: 'HalfAdder', to: 'FullAdder' },
    { from: 'FullAdder', to: 'OverflowDetector' },
    { from: 'OverflowDetector', to: 'Comparator2bit' },

    { from: 'Comparator2bit', to: 'Adder2bit' },
    { from: 'Adder2bit', to: 'Multiplier2bit' },
    { from: 'Adder2bit', to: 'TwosComplement' },

    { from: 'TwosComplement', to: 'Subtractor2bit' },
    { from: 'Subtractor2bit', to: 'Mod3Remainder' },

    { from: 'Mod3Remainder', to: 'BitMaster' },
    { from: 'Multiplier2bit', to: 'BitMaster' }
  ]
};
