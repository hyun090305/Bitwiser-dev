import { compileCircuit } from '../canvas/evaluation.js';
import { getReferenceFSM } from './referenceFSM.js';
import { DIVIDER_INPUTS, DIVIDER_OUTPUTS, verifyDivider } from './dividerGrading.js';

export const GRADING_VERSION = 4;

const DEFAULTS = Object.freeze({ maxStates: 250000, maxTransitions: 4000000, maxMilliseconds: 10000, chunkSize: 2048, denseLimit: 2 ** 20 });
const diagnostic = (code, message) => ({ ok: false, status: 'invalid', diagnostics: [{ code, message }] });
const incomplete = (reason, states = 0, transitions = 0) => ({ ok: false, status: 'incomplete', reason, states, transitions });
const isBit = x => x === 0 || x === 1 || x === false || x === true;
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const namesValid = names => Array.isArray(names) && names.every(n => typeof n === 'string' && n.length > 0) && new Set(names).size === names.length;
const sameNames = (a, b) => a.length === b.length && a.every(n => b.includes(n));
const bitsObject = (names, mask) => Object.fromEntries(names.map((name, i) => [name, (mask >>> i) & 1]));
const remap = (mask, from, to) => to.reduce((result, name, i) => result | (((mask >>> from.indexOf(name)) & 1) << i), 0);

function prepareReference(answers, limits) {
  if (answers?.mode === 'sequential') {
    if (answers.referenceId === 'memory20:C5-10') return {ok:true,sequential:true,divider:true,ref:{inputs:DIVIDER_INPUTS,outputs:DIVIDER_OUTPUTS}};
    // Inline references are trusted JS callers/tests. JSON only identifies a
    // built-in spec; no source code from saved problems is evaluated.
    const ref = answers.referenceId ? getReferenceFSM(answers.referenceId) : answers.reference;
    if (!ref) return diagnostic('REFERENCE_REQUIRED', '순차 문제의 정답 FSM이 필요합니다.');
    if (ref.observeAt != null && !['before_tick', 'after_tick'].includes(ref.observeAt)) {
      return diagnostic('INVALID_OBSERVATION', '지원하지 않는 출력 관측 시점입니다.');
    }
    if (!namesValid(ref.inputs) || !namesValid(ref.outputs) || !ref.outputs.length ||
        !Number.isSafeInteger(ref.stateCount) || ref.stateCount < 1 ||
        !Number.isInteger(ref.initialState) || ref.initialState < 0 || ref.initialState >= ref.stateCount || typeof ref.evaluate !== 'function') {
      return diagnostic('INVALID_REFERENCE', '정답 FSM의 포트 또는 상태 정의가 올바르지 않습니다.');
    }
    const probe = ref.readProbe;
    if ((ref.releaseButtons != null && (!namesValid(ref.releaseButtons) || !ref.releaseButtons.length ||
        ref.releaseButtons.some(name => !ref.inputs.includes(name)) || ref.observeAt !== 'after_tick')) ||
        (probe != null && (!record(probe) || !namesValid(probe.vary) || !probe.vary.length ||
        probe.vary.some(name => !ref.inputs.includes(name)) || !record(probe.fixed) ||
        Object.entries(probe.fixed).some(([name, value]) => !ref.inputs.includes(name) || probe.vary.includes(name) || !isBit(value)) ||
        typeof probe.observe !== 'function' || ref.observeAt !== 'after_tick'))) {
      return diagnostic('INVALID_OBSERVATION', '추가 출력 관측 정의가 올바르지 않습니다.');
    }
    if (ref.inputs.length > 16 || ref.outputs.length > 30 || ref.stateCount * 2 ** ref.inputs.length > limits.maxTransitions ||
        (probe && 2 ** (ref.inputs.length + probe.vary.length) > limits.maxTransitions)) {
      return incomplete('REFERENCE_LIMIT');
    }
    return { ok: true, sequential: true, ref };
  }
  if (!Array.isArray(answers) || !answers.length || !record(answers[0]?.inputs) || !record(answers[0]?.expected)) {
    return diagnostic('INVALID_TESTS', '완전한 진리표가 필요합니다.');
  }
  const inputs = Object.keys(answers[0].inputs), outputs = Object.keys(answers[0].expected);
  if (!namesValid(inputs) || !namesValid(outputs) || !outputs.length) return diagnostic('INVALID_PORTS', '정답 포트 이름이 올바르지 않습니다.');
  if (inputs.length > 16 || outputs.length > 30) return incomplete('PORT_LIMIT');
  const count = 2 ** inputs.length, table = new Uint32Array(count), seen = new Uint8Array(count);
  for (const row of answers) {
    if (!record(row?.inputs) || !record(row?.expected) || !sameNames(Object.keys(row.inputs), inputs) || !sameNames(Object.keys(row.expected), outputs) ||
        !Object.values(row.inputs).every(isBit) || !Object.values(row.expected).every(isBit)) {
      return diagnostic('INVALID_TEST_ROW', '진리표의 모든 행은 동일한 포트와 0/1 값을 가져야 합니다.');
    }
    const input = inputs.reduce((n, name, i) => n | (Number(row.inputs[name]) << i), 0);
    if (seen[input]) return diagnostic('DUPLICATE_TEST_INPUT', '진리표에 중복된 입력이 있습니다.');
    seen[input] = 1;
    table[input] = outputs.reduce((n, name, i) => n | (Number(row.expected[name]) << i), 0);
  }
  if (answers.length !== count) return diagnostic('INCOMPLETE_TRUTH_TABLE', '진리표에 모든 입력 조합이 있어야 합니다.');
  return { ok: true, sequential: false, ref: { inputs, outputs, stateCount: 1, initialState: 0,
    evaluate: (_state, input) => ({ outputs: table[input], nextState: 0 }) } };
}

// Shared bounded search for synchronous record validation and asynchronous UI
// grading. Only chunk boundaries allocate progress objects / yield to the UI.
function* verify(definition, answers, options) {
  const limits = { ...DEFAULTS };
  for (const key of Object.keys(limits)) if (Number.isSafeInteger(options[key]) && options[key] > 0) limits[key] = options[key];
  const started = performance.now();
  const timedOut = () => performance.now() - started >= limits.maxMilliseconds;
  const reference = prepareReference(answers, limits);
  if (!reference.ok) return reference;
  const compilation = compileCircuit(definition);
  if (!compilation.ok) return { ...compilation, status: 'invalid' };
  const { compiled } = compilation;
  const { ref, sequential } = reference;
  if (!namesValid(compiled.inputNames) || !namesValid(compiled.outputNames) ||
      !sameNames(compiled.inputNames, ref.inputs) || !sameNames(compiled.outputNames, ref.outputs) ||
      (options.ports && (!sameNames(options.ports.inputs, ref.inputs) || !sameNames(options.ports.outputs, ref.outputs)))) {
    return diagnostic('PORT_MISMATCH', 'INPUT/OUTPUT 이름은 문제와 정확히 일치해야 하며 중복될 수 없습니다.');
  }
  if (!sequential && compiled.memoryIds.length) return diagnostic('MEMORY_NOT_ALLOWED', '조합논리 문제에서는 D를 사용할 수 없습니다.');
  if (compiled.memoryIds.length > 30) return incomplete('MEMORY_LIMIT');
  if (answers.referenceId?.startsWith('memory20:')) {
    // Final memory puzzles use binary gates, never implicit free constants.
    const incoming = new Map();
    for (const w of Object.values(definition.wires)) incoming.set(w.endBlockId, (incoming.get(w.endBlockId) || 0) + 1);
    for (const block of Object.values(definition.blocks)) {
      const arity = {INPUT:0, OUTPUT:1, JUNCTION:1, NOT:1, AND:2, OR:2}[block.type];
      if (arity != null && (incoming.get(block.id) || 0) !== arity) return diagnostic('INVALID_PRIMITIVE_ARITY', `${block.type} ${block.name || block.id}: 입력은 ${arity}개여야 합니다.`);
    }
  }
  if (reference.divider) return yield* verifyDivider(compiled,{maxTransitions:limits.maxTransitions,timedOut});
  const inputCount = 2 ** ref.inputs.length;
  const inputMasks = Uint32Array.from({ length: inputCount }, (_, x) => remap(x, ref.inputs, compiled.inputNames));
  const expected = new Uint32Array(ref.stateCount * inputCount), nextReference = new Uint32Array(expected.length);
  const releaseMask = (ref.releaseButtons || []).reduce((mask, name) => mask | (1 << ref.inputs.indexOf(name)), 0);
  const probe = ref.readProbe;
  const readExpected = probe ? new Uint32Array(expected.length) : null;
  const probeInputs = probe ? Array.from({ length: inputCount }, (_, input) =>
    Array.from({ length: 2 ** probe.vary.length }, (_, choice) => {
      let mask = input;
      for (const [name, value] of [...Object.entries(probe.fixed), ...probe.vary.map((name, i) => [name, (choice >>> i) & 1])]) {
        const bit = 1 << ref.inputs.indexOf(name);
        mask = (mask & ~bit) | (Number(value) ? bit : 0);
      }
      return mask;
    })) : null;
  for (let state = 0; state < ref.stateCount; state++) for (let input = 0; input < inputCount; input++) {
    const value = ref.evaluate(state, input), i = state * inputCount + input;
    if (!value || !Number.isInteger(value.outputs) || value.outputs < 0 || value.outputs >= 2 ** ref.outputs.length ||
        !Number.isInteger(value.nextState) || value.nextState < 0 || value.nextState >= ref.stateCount) {
      return diagnostic('INVALID_REFERENCE_RESULT', '정답 FSM이 잘못된 출력 또는 다음 상태를 반환했습니다.');
    }
    expected[i] = remap(value.outputs, ref.outputs, compiled.outputNames); nextReference[i] = value.nextState;
    if (probe) {
      const output = probe.observe(state, input);
      if (!Number.isInteger(output) || output < 0 || output >= 2 ** ref.outputs.length) {
        return diagnostic('INVALID_REFERENCE_RESULT', '읽기 관측이 잘못된 출력을 반환했습니다.');
      }
      readExpected[i] = remap(output, ref.outputs, compiled.outputNames);
    }
    if ((i + 1) % limits.chunkSize === 0) {
      if (timedOut()) return incomplete('TIME_LIMIT');
      yield { phase: 'reference', states: 0, transitions: 0 };
    }
  }
  const stateStride = 2 ** compiled.memoryIds.length;
  const productSize = stateStride * ref.stateCount;
  if (!Number.isSafeInteger(productSize)) return incomplete('STATE_ENCODING_LIMIT');
  const dense = productSize <= Math.min(limits.denseLimit, 2 ** 24) ? new Uint8Array(productSize) : null;
  const sparse = dense ? null : new Set();
  const seen = key => dense ? dense[key] !== 0 : sparse.has(key);
  const mark = key => { if (dense) dense[key] = 1; else sparse.add(key); };
  // Arithmetic encoding avoids signed 32-bit shifts for the product state.
  const queue = [ref.initialState * stateStride], parent = [-1], parentInput = [0], parentOutput = [0];
  mark(queue[0]);
  const evaluator = compiled.createEvaluator();
  // Existing FSMs observe settled current outputs BEFORE committing memory.
  // A new spec may explicitly opt into after_tick; the view never decides this.
  const afterTick = sequential && ref.observeAt === 'after_tick';
  const setEvent = input => ({ type: 'set', inputs: ref.inputs.map((signal, i) => ({
    signal, blockId: compiled.inputIds[compiled.inputNames.indexOf(signal)], value: (input >>> i) & 1
  })) });
  const observation = sequential ? (afterTick ? 'after_tick' : 'before_tick') : undefined;
  const expectEvent = (actual, expected, phase = observation) => ({ type: 'expect', ...(phase ? { observation: phase } : {}), outputs: compiled.outputNames.map((signal, i) => ({
    signal, blockId: compiled.outputIds[i], actual: (actual >>> i) & 1, expected: (expected >>> i) & 1,
    passed: ((actual >>> i) & 1) === ((expected >>> i) & 1)
  })) });
  function appendStep(trace, input, actual, expected, commit) {
    trace.push(setEvent(input));
    if (afterTick) trace.push({ type: 'tick' });
    trace.push(expectEvent(actual, expected));
    if (!afterTick && commit) trace.push({ type: 'tick' });
  }
  function appendRelease(trace, input, actual, expected) {
    trace.push(setEvent(input & ~releaseMask), expectEvent(actual, expected, 'after_release'));
  }
  function appendReads(trace, refState, sampled, failedInput, failedActual) {
    for (const input of probeInputs[sampled]) {
      const expected = readExpected[refState * inputCount + input];
      trace.push(setEvent(input), expectEvent(input === failedInput ? failedActual : expected, expected, 'address_read'));
      if (input === failedInput) break;
    }
  }
  function parentTrace(head) {
    const nodes = [];
    for (let node = head; parent[node] !== -1; node = parent[node]) nodes.push(node);
    nodes.reverse();
    const trace = sequential ? [{ type: 'init', memory: compiled.memoryIds.map((blockId, i) => ({
      blockId, signal: `D${i + 1}`, value: 0
    })) }] : [];
    // Only the visited parent edges belong to this witness. Retain their
    // successful observations too, at the same boundary used by the search.
    for (const node of nodes) {
      appendStep(trace, parentInput[node], parentOutput[node], parentOutput[node], true);
      if (releaseMask) appendRelease(trace, parentInput[node], parentOutput[node], parentOutput[node]);
      if (probe) appendReads(trace, Math.floor(queue[node] / stateStride), parentInput[node]);
    }
    return trace;
  }
  let transitions = 0, checks = 0;
  // maxTransitions remains the work budget, including every additional output
  // comparison. transitions counts actual ticks; checks includes timeless reads.
  function* reserveCheck(phase) {
    if (checks >= limits.maxTransitions) return { ...incomplete('TRANSITION_LIMIT', queue.length, transitions), checks };
    if (checks % limits.chunkSize === 0) {
      if (timedOut()) return { ...incomplete('TIME_LIMIT', queue.length, transitions), checks };
      yield { phase, states: queue.length, transitions, checks };
      // Async progress callbacks and the event-loop turn count toward the same
      // deadline. Do not report an output failure after the budget has expired.
      if (timedOut()) return { ...incomplete('TIME_LIMIT', queue.length, transitions), checks };
    }
    checks++;
    return null;
  }
  function failure(head, sampled, input, actual, wanted, phase) {
    const trace = parentTrace(head), path = [];
    for (let node = head; parent[node] !== -1; node = parent[node]) path.push(parentInput[node]);
    path.reverse();
    if (phase === observation) appendStep(trace, input, actual, wanted, false);
    else if (sampled != null) {
      const i = Math.floor(queue[head] / stateStride) * inputCount + sampled;
      appendStep(trace, sampled, expected[i], expected[i], true);
      if (releaseMask) appendRelease(trace, sampled, phase === 'after_release' ? actual : expected[i], expected[i]);
      if (phase === 'address_read') appendReads(trace, nextReference[i], sampled, input, actual);
      path.push(sampled);
    } else trace.push(setEvent(input), expectEvent(actual, wanted, phase));
    return { ok: false, status: 'fail', reason: 'output_mismatch', ...(phase ? { observation: phase } : {}), sequential,
      states: queue.length, transitions, checks,
      inputs: bitsObject(ref.inputs, input), expected: bitsObject(compiled.outputNames, wanted),
      actual: bitsObject(compiled.outputNames, actual), trace,
      ...(sampled != null ? { sampledInputs: bitsObject(ref.inputs, sampled) } : {}),
      counterexample: { ticks: path.map(x => bitsObject(ref.inputs, x)), observe: bitsObject(ref.inputs, input) } };
  }
  // Initial reads cover both addresses and every retained data-switch setting.
  // All probes share the same zero-memory state; no tentative nextState escapes.
  if (probe) for (const input of new Set(probeInputs.flat())) {
    const limit = yield* reserveCheck('address_read'); if (limit) return limit;
    const actual = evaluator.evaluate(0, inputMasks[input]).outputs;
    const wanted = readExpected[ref.initialState * inputCount + input];
    if (actual !== wanted) return failure(0, null, input, actual, wanted, 'address_read');
  }
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head], userState = key % stateStride, refState = Math.floor(key / stateStride);
    for (let input = 0; input < inputCount; input++) {
      const limit = yield* reserveCheck('search'); if (limit) return limit;
      const actual = evaluator.evaluate(userState, inputMasks[input]);
      // Evaluator results are borrowed. Preserve the committed state before
      // any settled output/release/read evaluation reuses that result object.
      const nextState = actual.nextState;
      const observed = afterTick ? evaluator.evaluate(nextState, inputMasks[input]).outputs : actual.outputs;
      const i = refState * inputCount + input;
      transitions++;
      if (observed !== expected[i]) {
        return failure(head, null, input, observed, expected[i], observation);
      }
      if (releaseMask) {
        const limit = yield* reserveCheck('after_release'); if (limit) return limit;
        const released = input & ~releaseMask;
        const output = evaluator.evaluate(nextState, inputMasks[released]).outputs;
        if (output !== expected[i]) return failure(head, input, released, output, expected[i], 'after_release');
      }
      if (probe) for (const readInput of probeInputs[input]) {
        const limit = yield* reserveCheck('address_read'); if (limit) return limit;
        const output = evaluator.evaluate(nextState, inputMasks[readInput]).outputs;
        const wanted = readExpected[nextReference[i] * inputCount + readInput];
        if (output !== wanted) return failure(head, input, readInput, output, wanted, 'address_read');
      }
      const next = nextState + nextReference[i] * stateStride;
      if (!seen(next)) {
        if (queue.length >= limits.maxStates) return incomplete('STATE_LIMIT', queue.length, transitions);
        mark(next); queue.push(next); parent.push(head); parentInput.push(input); parentOutput.push(observed);
      }
    }
  }
  if (timedOut()) return incomplete('TIME_LIMIT', queue.length, transitions);
  return { ok: true, status: 'pass', sequential, states: queue.length, transitions, checks, completed: transitions, total: transitions };
}

export function gradeCircuitSync(definition, answers, options = {}) {
  try {
    const search = verify(definition, answers, options);
    let step; do { step = search.next(); } while (!step.done);
    return step.value;
  } catch (error) { return diagnostic('EVALUATION_ERROR', error.message); }
}

export async function gradeCircuit(definition, answers, { signal, onProgress = () => {}, ...options } = {}) {
  const search = verify(definition, answers, options);
  try {
    while (true) {
      if (signal?.aborted) return { ok: false, status: 'cancelled', cancelled: true };
      let step;
      try { step = search.next(); } catch (error) { return diagnostic('EVALUATION_ERROR', error.message); }
      if (step.done) return step.value;
      await onProgress(step.value);
      // A task boundary lets input/paint/cancel events run during large searches.
      // There is no animation delay per case.
      if (!signal?.aborted) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally { search.return(); }
}
