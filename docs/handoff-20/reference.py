"""Stage specifications as independent integer/list reference machines.

Every return value is (next_reference_state, post_tick_outputs).
No circuit nodes, Boolean netlist logic or implementation encodings are used.
"""

def bits(value, prefix, width):
    return {f"{prefix}{i}": (value >> i) & 1 for i in range(width)}

def number(inputs, prefix, width):
    return sum(inputs[f"{prefix}{i}"] << i for i in range(width))

INITIAL = {
    "C4-01": 0, "C4-02": 0, "C4-03": 0,
    "C4-04": (0, 0, 0), "C4-05": (0, 0, 0),
    "C4-06": 0, "C4-07": 0, "C4-08": 0,
    "C4-09": ((), 0), "C4-10": 0,
    "C5-01": 0, "C5-02": (0, 0), "C5-03": (0, 0, 0),
    "C5-04": (0, 0), "C5-05": ((), 0), "C5-06": ((), 0),
    "C5-07": ((), 0), "C5-08": ((), 0), "C5-09": (-1, 0),
}

def step(stage, state, u):
    if stage == "C4-01":
        q = u["DATA"] if u["LOAD"] else state
        return q, {"VALUE": q}
    if stage == "C4-02":
        return u["SIGNAL"], {"RISE": int(not state and u["SIGNAL"])}
    if stage == "C4-03":
        q = 1 if u["FAULT"] else (0 if u["ACK"] else state)
        return q, {"ALARM": q}
    if stage == "C4-04":
        previous, older, clean = state
        raw = u["RAW"]
        if raw == previous == older:
            clean = raw
        return (raw, previous, clean), {"CLEAN": clean}
    if stage == "C4-05":
        history = (u["OPEN"], state[0], state[1])
        return history, {"DOOR": int(any(history))}
    if stage == "C4-06":
        q = 0 if u["RESET"] else (state + u["INC"] - u["DEC"]) % 4
        return q, bits(q, "BIT", 2)
    if stage == "C4-07":
        phase = 0 if u["RESET"] else (state + 1) % 4
        return phase, {"PWM": int(phase < number(u, "DUTY", 2))}
    if stage == "C4-08":
        a, b = u["REQ_A"], u["REQ_B"]
        if not (a or b):
            return state, {"A_OK": 0, "B_OK": 0}
        a_wins = int((not state) if a and b else a)
        return a_wins, {"A_OK": a_wins, "B_OK": 1 - a_wins}
    if stage == "C4-09":
        history, opened = state
        if u["SUBMIT"]:
            current = history + (u["SIGNAL"],)
            opened = int(opened or current == (1, 0, 0, 1))
            history = current[-3:]
        return (history, opened), {"UNLOCKED": opened}
    if stage == "C4-10":
        silence = 0 if u["KICK"] else min(state + 1, 3)
        return silence, {"TIMEOUT": int(silence == 3)}
    if stage == "C5-01":
        q = 0 if u["RESET"] else (state + (number(u, "D", 2) if u["ADD"] else 0)) % 4
        return q, bits(q, "Q", 2)
    if stage == "C5-02":
        words = list(state)
        if u["WRITE"]:
            words[u["ADDR"]] = number(u, "D", 2)
        return tuple(words), bits(words[u["ADDR"]], "Q", 2)
    if stage == "C5-03":
        value, backup, available = state
        if u["SAVE"]:
            value, backup, available = number(u, "D", 2), value, 1
        elif u["UNDO"] and available:
            value, available = backup, 0
        return (value, backup, available), {**bits(value, "Q", 2), "UNDO_AVAILABLE": available}
    if stage == "C5-04":
        staging, live = state
        if u["RESET"]:
            staging, live = 0, 0
        else:
            if u["COMMIT"]:
                live = staging
            if u["WRITE"]:
                staging = number(u, "D", 2)
        return (staging, live), bits(live, "Q", 2)
    if stage == "C5-05":
        pending, word = state
        done = 0
        if u["RECEIVE"]:
            pending = pending + (u["DATA"],)
            if len(pending) == 4:
                word = sum(bit << (3 - i) for i, bit in enumerate(pending))
                pending, done = (), 1
        return (pending, word), {**bits(word, "Q", 4), "DONE": done}
    if stage == "C5-06":
        pending, serial = state
        valid = 0
        if u["RESET"]:
            pending, serial = (), 0
        elif pending:
            serial, pending, valid = pending[0], pending[1:], 1
        elif u["START"]:
            serial = u["D3"]
            pending = (u["D2"], u["D1"], u["D0"])
            valid = 1
        return (pending, serial), {"SERIAL": serial, "VALID": valid, "BUSY": int(bool(pending))}
    if stage in ("C5-07", "C5-08"):
        entries, last = state
        entries = list(entries)
        valid = 0
        if u["POP"] and entries:
            last = entries.pop(-1 if stage == "C5-07" else 0)
            valid = 1
        if u["PUSH"] and len(entries) < 2:
            entries.append(u["DATA"])
        return (tuple(entries), last), {
            "DATA_OUT": last, "VALID": valid,
            "EMPTY": int(len(entries) == 0), "FULL": int(len(entries) == 2),
        }
    if stage == "C5-09":
        payload, last = state
        valid = accepted = 0
        if u["TAKE"] and payload != -1:
            last, payload, valid = payload, -1, 1
        if u["SEND"] and payload == -1:
            payload, accepted = u["DATA"], 1
        return (payload, last), {
            "FULL": int(payload != -1), "DATA_OUT": last,
            "VALID": valid, "ACCEPTED": accepted,
        }
    raise ValueError("Unknown reference stage: " + stage)


def judge_divider(tick, a, b, deadline=10):
    """tick(inputs) must update all memory, then return settled output values.

    This is a special judge, NOT the timing of the supplied answer circuit.
    Correct first completion on any tick 1..10 passes. Never samples tick 0.
    """
    if not (0 <= a <= 7 and 1 <= b <= 3):
        raise ValueError("Domain is A=0..7, B=1..3")
    inputs = {**bits(a, "A", 3), **bits(b, "B", 2)}
    for t in range(1, deadline + 1):
        out = tick(dict(inputs))
        if out["COMPLETE"]:
            q = number(out, "Q", 3)
            r = number(out, "R", 2)
            return {"pass": (q, r) == divmod(a, b), "tick": t,
                    "reason": "correct" if (q, r) == divmod(a, b) else "wrong_first_complete",
                    "Q": q, "R": r}
    return {"pass": False, "tick": deadline, "reason": "timeout"}
