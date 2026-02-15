import { CELL, GAP } from '../canvas/model.js';

export const GRID_UNIT = CELL + GAP;

export const STAGE_NODE_LEVEL_MAP = {
  bit_solver: null,
  tutorial: 0,
  not: 1,
  nand: 5,
  nor: 4,
  or: 2,
  and: 3,
  fixed_xor: 20,
  xor: 6,
  crossroad: 19,
  bit_wiser: null,
  story: null,
  lab: null,
  user_created_stages: null,
  three_bit_shifter: 21,
  parity_checker: 8,
  decoder_2to4: 11,
  fixed_decoder_2to4: 22,
  enable_gate_left_bottom: null,
  majority_gate: 7,
  enable_gate_center: null,
  mux_4to1: 12,
  two_bit_max_selector: 16,
  priority_gate: 23,
  bit_master: null,
  half_adder: 9,
  full_adder: 10,
  overflow_detector: null,
  mod3_remainder: 18,
  two_bit_comparator: 13,
  two_bit_subtractor: 15,
  two_bit_multiplier: 17,
  two_bit_adder: 14,
  twos_complement: 24
};

export const STAGE_TYPE_META = {
  stage: {
    color: '#38bdf8',
    accent: '#0ea5e9'
  },
  rank: {
    color: '#f59e0b',
    accent: '#f97316'
  },
  feature: {
    color: '#F6F6F6',
    accent: '#E5E7EB'
  },
  mode: {
    color: '#22c55e',
    accent: '#16a34a'
  }
};

export function gridToWorldPoint({ x, y }) {
  return {
    x: GAP + x * GRID_UNIT,
    y: GAP + y * GRID_UNIT
  };
}

export function gridSizeToWorldSize({ w, h }) {
  return {
    width: w * GRID_UNIT - GAP,
    height: h * GRID_UNIT - GAP
  };
}
