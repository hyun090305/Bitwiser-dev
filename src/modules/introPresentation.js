import { formatBlockLabels } from '../blockLabel.js';

// Presentation only: palette/FSM port order is also part of saved cost rules.
// Numbered terminals are not necessarily bit positions (e.g. decoder outputs).
const SIGNAL_ORDER = {
  9: { output: ['OUT2', 'OUT1'] },
  10: { output: ['OUT2', 'OUT1'] },
  23: { input: ['IN1', 'IN2', 'IN3', 'IN4'] },
  32: { output: ['BIT1', 'BIT0'] },
  33: { input: ['LEVEL1', 'LEVEL0'] },
  34: { input: ['TIME1', 'TIME0', 'START'] },
  38: { input: ['D1', 'D0', 'ADDR', 'WRITE'], output: ['Q1', 'Q0'] },
  39: { input: ['D1', 'D0', 'SAVE', 'UNDO'], output: ['Q1', 'Q0', 'UNDO_AVAILABLE'] },
  43: { output: ['Q3', 'Q2', 'Q1', 'Q0', 'DONE'] },
  44: { input: ['D3', 'D2', 'D1', 'D0', 'START', 'RESET'] },
  45: { input: ['D1', 'D0', 'ADD', 'RESET'], output: ['Q1', 'Q0'] },
  46: { input: ['A2', 'A1', 'A0', 'B1', 'B0'], output: ['Q2', 'Q1', 'Q0', 'R1', 'R0', 'COMPLETE'] }
};

export function formatIntroText(text, blockSet = []) {
  const ports = new Set(blockSet.filter(block => block.type === 'INPUT' || block.type === 'OUTPUT').map(block => block.name));
  // Match complete IO names, including Korean particles and abbreviated lists
  // such as OUT1·2·3. Values, ticks, ranges and unrelated identifiers stay plain.
  return String(text || '').replace(/\b([A-Za-z]+)(\d+(?:·\d+)*)\b/g, (name, prefix, suffix) => {
    const digits = suffix.split('·');
    if (!digits.every(number => ports.has(prefix + number))) return name;
    return prefix + digits.map(number => formatBlockLabels(prefix + number).slice(prefix.length)).join('·');
  });
}

export function parseLogicRows(level, dataTable = [], blockSet = []) {
  if (!Array.isArray(dataTable) || !dataTable.length) return [];
  // Stage 15's legacy example keys are S1/S0; the actual result ports are R1/R0.
  const displayKey = key => Number(level) === 15 ? ({ S1: 'R1', S0: 'R0' }[key] || key) : key;
  const rawKeys = new Map(Object.keys(dataTable[0]).map(key => [displayKey(key), key]));
  const rowKeys = [...rawKeys.keys()];
  if (!rowKeys.length) return [];
  const resolveKeys = (type, side, fallback) => {
    const keys = blockSet.filter(block => block.type === type && rawKeys.has(block.name)).map(block => block.name);
    const resolved = keys.length ? keys : fallback;
    const preferred = SIGNAL_ORDER[level]?.[side] || [];
    return [...preferred.filter(key => resolved.includes(key)), ...resolved.filter(key => !preferred.includes(key))];
  };
  const inputKeys = resolveKeys('INPUT', 'input', rowKeys.slice(0, -1));
  const outputKeys = resolveKeys('OUTPUT', 'output', rowKeys.slice(-1));
  const signals = (row, keys) => keys.map(label => ({
    key: rawKeys.get(label),
    label,
    value: `${row[rawKeys.get(label)] ?? ''}`.trim()
  }));
  return dataTable.map((row, index) => ({
    id: `case-${index}`,
    tick: row.tick,
    observation: row.observation,
    inputSignals: signals(row, inputKeys),
    outputSignals: signals(row, outputKeys)
  }));
}
