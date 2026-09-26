"""Run with Python 3.10+; uses the standard library only."""
import hashlib
import itertools
import json
from collections import deque
from pathlib import Path
from reference import INITIAL, bits, step, judge_divider
from verification_runtime import Circuit, exact_embedding_check

ROOT = Path(__file__).resolve().parent

def load(path):
    return json.loads((ROOT / path).read_text())

def verify_stream(entry, net):
    sim = Circuit(net)
    names = [n['id'] for n in sim.memories]
    initial = (tuple(0 for _ in names), INITIAL[entry['slot']])
    queue = deque([initial]); seen = {initial}; records = []
    alphabet = [dict(zip(entry['inputs'], a)) for a in itertools.product((0, 1), repeat=len(entry['inputs']))]
    while queue:
        memories, ref = queue.popleft()
        for u in alphabet:
            sim.state = dict(zip(names, memories))
            actual = sim.tick(u)
            ref_next, expected = step(entry['slot'], ref, u)
            assert actual == expected, (entry['slot'], memories, ref, u, actual, expected)
            next_memories = tuple(sim.state[k] for k in names)
            records.append([list(memories), [u[k] for k in entry['inputs']], list(next_memories), [actual[k] for k in entry['outputs']]])
            new = (next_memories, ref_next)
            if new not in seen:
                seen.add(new); queue.append(new)
                assert len(seen) < 100000, 'Unexpected state explosion'
    result = {'kind': 'all_reachable_product_states', 'status': 'PASS_EXHAUSTIVE',
              'states': len(seen), 'input_combinations': len(alphabet), 'transitions': len(records)}
    cases = dict(slot=entry['slot'], inputs=entry['inputs'], outputs=entry['outputs'], memories=names, transitions=records)
    return result, cases

def verify_divider(entry, net):
    rows = []; transitions = []
    sim = Circuit(net); names = [n['id'] for n in sim.memories]
    for a, b in itertools.product(range(8), range(1, 4)):
        sim.reset(); trace = []
        def tick(u):
            before = [sim.state[k] for k in names]
            out = sim.tick(u)
            transitions.append([before, [u[k] for k in entry['inputs']], [sim.state[k] for k in names], [out[k] for k in entry['outputs']]])
            trace.append(dict(tick=len(trace) + 1, inputs=u, outputs=out))
            return out
        judged = judge_divider(tick, a, b)
        assert judged['pass'], (a, b, judged)
        rows.append(dict(A=a, B=b, **judged, trace=trace))
    result = dict(kind='all_24_fixed_inputs_special_judge', status='PASS_EXHAUSTIVE', cases=24,
                  ticks_checked=sum(r['tick'] for r in rows), max_first_complete_tick=max(r['tick'] for r in rows),
                  judge_deadline=10, results=rows)
    cases = dict(slot=entry['slot'], inputs=entry['inputs'], outputs=entry['outputs'], memories=names, transitions=transitions)
    return result, cases

def judge_boundary_tests():
    checks = []
    # Deliberately distinct from the answer circuit: all admissible finish times.
    for finish in range(1, 12):
        counter = [0]
        def source(u):
            counter[0] += 1
            return {**bits(2, 'Q', 3), **bits(1, 'R', 2), 'COMPLETE': int(counter[0] >= finish)}
        result = judge_divider(source, 7, 3)
        assert result['pass'] == (finish <= 10), (finish, result)
        checks.append(dict(test=f'correct_at_{finish}', passed=True))
    counter = [0]
    def wrong_first(u):
        counter[0] += 1
        return {**bits(1 if counter[0] == 1 else 2, 'Q', 3), **bits(1, 'R', 2), 'COMPLETE': 1}
    result = judge_divider(wrong_first, 7, 3)
    assert result['reason'] == 'wrong_first_complete' and counter[0] == 1
    checks.append(dict(test='wrong_first_complete_cannot_be_repaired_later', passed=True))
    result = judge_divider(lambda u: {**bits(2, 'Q', 3), **bits(1, 'R', 2), 'COMPLETE': 0}, 7, 3)
    assert result['reason'] == 'timeout'
    checks.append(dict(test='correct_numbers_without_complete_fail', passed=True))
    try:
        judge_divider(lambda u: {}, 7, 0)
    except ValueError:
        checks.append(dict(test='zero_divisor_is_not_in_domain', passed=True))
    else:
        raise AssertionError('B=0 must not become a hidden test case')
    return checks

def main():
    catalog = load('catalog.json'); rows = []; cases = []
    assert len(catalog) == 20
    assert len({e['slot'] for e in catalog}) == 20
    for entry in catalog:
        net = load(entry['circuit']); cert = load(entry['certificate'])
        assert net['id'] == entry['slot']
        assert [n['id'] for n in net['nodes'] if n['type'] == 'INPUT'] == entry['inputs']
        assert [n['name'] for n in net['nodes'] if n['type'] == 'OUTPUT'] == entry['outputs']
        assert len(net['nodes']) == entry['blocks']
        assert cert['planar'] is True
        drawing = exact_embedding_check(net, cert)
        result, js_cases = verify_divider(entry, net) if entry['slot'] == 'C5-10' else verify_stream(entry, net)
        # Hash Git's LF representation so Windows checkouts do not churn unrelated reports.
        rows.append(dict(slot=entry['slot'], circuit_sha256=hashlib.sha256((ROOT / entry['circuit']).read_bytes().replace(b'\r\n', b'\n')).hexdigest(),
                         planar_drawing=drawing, **result))
        cases.append(js_cases)
        print(entry['slot'], result['status'], result.get('transitions', result.get('ticks_checked')), flush=True)
    summary = dict(all_pass=True, stage_count=20, planar_count=20,
                   stream_transitions=sum(r.get('transitions', 0) for r in rows), divider_cases=24,
                   divider_ticks=rows[-1]['ticks_checked'], judge_boundary_tests=judge_boundary_tests(), stages=rows)
    (ROOT / 'verification_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    (ROOT / 'tests' / 'exhaustive_transitions.json').write_text(json.dumps(cases, separators=(',', ':')))
    print(json.dumps({k: v for k, v in summary.items() if k not in ('stages', 'judge_boundary_tests')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
