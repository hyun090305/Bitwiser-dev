// English player titles, instructions and hints.
export const memory20Copy = {
  "C4-01": [
    "Storage Switch",
    "Store DATA in VALUE when LOAD is on. Otherwise keep the saved value, even if DATA changes. VALUE starts at 0.",
    "Connect DATA to D and LOAD to EN."
  ],
  "C4-02": [
    "Rising Edge Detector",
    "Turn on RISE for the tick when SIGNAL changes from 0 to 1. Holding SIGNAL on must not trigger it again. Treat SIGNAL before the first tick as 0.",
    "Store the previous SIGNAL and the detected edge in separate D blocks. Compute the edge using the old previous value."
  ],
  "C4-03": [
    "Fault Indicator",
    "FAULT turns ALARM on and keeps it on. ACK clears it, but FAULT wins if both arrive together. With no request, hold the value. ALARM starts off.",
    "Store FAULT with EN=FAULT OR ACK."
  ],
  "C4-04": [
    "Bouncing Button",
    "Change CLEAN only when RAW has stayed the same for three ticks, on the third tick. Ignore shorter glitches in either direction. CLEAN and the previous samples start at 0.",
    "Remember two previous RAW samples and CLEAN. Set on three ones, clear on three zeros, otherwise hold."
  ],
  "C4-05": [
    "Automatic Door",
    "OPEN keeps DOOR on for three ticks, including the request tick. Another request restarts the timer. OPEN 1→0→0→0 should produce DOOR 1→1→1→0. The door starts closed.",
    "Remember three OPEN samples with D blocks and combine them using two binary OR gates."
  ],
  "C4-06": [
    "Up/Down Counter",
    "Count from 0 to 3 using BIT1·BIT0. INC alone adds one; DEC alone subtracts one. Wrap between 3 and 0. Both on or both off leave the count unchanged. Start at 0; RESET overrides both requests and clears the count.",
    "Determine when each bit toggles. Use NOT(Q) as DATA and a bit-specific EN; RESET must clear both bits."
  ],
  "C4-07": [
    "Four Brightness Levels",
    "Use DUTY1·DUTY0 to select brightness 0–3. A phase starts at 0 and advances through 1→2→3→0 each tick. Turn PWM on when the phase is below DUTY, giving 0%, 25%, 50% or 75% brightness. RESET returns the phase to 0; the same lighting rule still applies.",
    "Use two state bits for four phases. A Gray-code cycle can simplify the next-state logic; compare its phase with DUTY."
  ],
  "C4-08": [
    "Fair Access",
    "Grant A_OK or B_OK to the side requesting access. If both request, choose the opposite of the last winner; the first tie goes to A. Single grants also update the turn. With no request, turn both outputs off and remember the turn.",
    "Remember the last winner with EN=request present, and register whether this tick had any request."
  ],
  "C4-09": [
    "ABBA Lock",
    "SIGNAL means A when 1 and B when 0. Accept a letter only when SUBMIT is on. Turn UNLOCKED on when the latest four submitted letters are ABBA, including within AABBA. Waiting preserves the letters; once unlocked, stay unlocked. Start with no letters.",
    "Shift submitted letters using SUBMIT as EN. Detect the previous A,B,B and the new A; retain the unlocked state."
  ],
  "C4-10": [
    "Watchdog",
    "Turn TIMEOUT on after three consecutive ticks without KICK and keep it on. KICK immediately clears TIMEOUT and restarts the wait. TIMEOUT starts off.",
    "Remember one, two and three-or-more silent ticks with D blocks. KICK clears the chain."
  ],
  "C5-01": [
    "Accumulator",
    "When ADD is on, add D1·D0 to Q1·Q0. Wrap the two-bit sum after 3. Otherwise hold the sum. Start at 0; RESET overrides ADD and clears the sum.",
    "Derive the toggle condition for each bit, including carry. Use enabled memories and give RESET priority."
  ],
  "C5-02": [
    "Addressed Storage",
    "Build two two-bit storage slots, both starting at 00. WRITE saves D1·D0 to the slot selected by ADDR. Q1·Q0 always reads the selected slot: changing ADDR changes the readout immediately, and a write tick shows the new value.",
    "Give each word its own write enable, then select the addressed word for reading."
  ],
  "C5-03": [
    "Undo Once",
    "SAVE stores D1·D0 and keeps the previous value for one UNDO. Undoing clears UNDO_AVAILABLE until the next SAVE. Even saving the same value enables undo. SAVE wins when both are requested. Current and previous values start at 00, with undo unavailable.",
    "Keep current and backup words plus an availability bit. SAVE must copy the old current value into the backup."
  ],
  "C5-04": [
    "Prepare and Commit",
    "WRITE prepares D1·D0 without changing Q1·Q0. COMMIT publishes the prepared value. Together, they publish the old prepared value while preparing the new one. Committing does not erase it. Both values start at 00; RESET overrides all requests and clears both.",
    "Use separate staging and published registers. Give them WRITE and COMMIT enables, with RESET clearing all four memories."
  ],
  "C5-05": [
    "Serial Receiver",
    "Accept one DATA bit whenever RECEIVE is on, highest bit first. On the fourth bit, update Q3·Q2·Q1·Q0 together and pulse DONE for that tick. Otherwise hold Q and clear DONE. Waiting preserves progress; each four bits forms a new word. Q starts at 0000.",
    "Keep received bits and a four-step progress state. Publish all four bits together and register DONE for exactly the completion tick."
  ],
  "C5-06": [
    "Serial Transmitter",
    "While idle, START captures D3·D2·D1·D0. Send D3 immediately, then D2, D1 and D0 on the next three ticks. Ignore input changes and START through the last bit; a new word can start on the following tick.\nVALID is on for each bit; BUSY is on while more bits remain. The last bit has VALID=1, BUSY=0. Idle holds SERIAL and clears both flags. RESET overrides START, cancels transmission and clears all outputs. All outputs start at 0.",
    "Store the captured word and transmission progress. Register SERIAL and VALID, and derive BUSY from the remaining work."
  ],
  "C5-07": [
    "Last In, First Out",
    "PUSH stores DATA in a stack of up to two bits. POP retrieves the newest bit into DATA_OUT and pulses VALID. Otherwise hold DATA_OUT and clear VALID.\nTogether, pop first, then push. If empty, only push; if full without a pop, ignore the push. EMPTY and FULL show the resulting state. Start empty with DATA_OUT and VALID at 0.",
    "Track two data slots and occupancy. Preserve the last popped value independently of the current top, and register POP success."
  ],
  "C5-08": [
    "First In, First Out",
    "PUSH stores DATA in a queue of up to two bits. POP retrieves the oldest bit into DATA_OUT and pulses VALID. Otherwise hold DATA_OUT and clear VALID.\nTogether, pop first, then push. If empty, only push; if full without a pop, ignore the push. EMPTY and FULL show the resulting state. Start empty with DATA_OUT and VALID at 0.",
    "Track the head, tail and occupancy. A POP exposes the oldest item and shifts any remaining item toward the head. Keep the last popped value separately."
  ],
  "C5-09": [
    "Mailbox",
    "SEND puts DATA into a one-bit mailbox; TAKE retrieves it into DATA_OUT. Pulse ACCEPTED for a successful send and VALID for a successful take.\nTogether, take first, then send. If empty, only send; if full without a take, reject the send. Hold DATA_OUT unless a take succeeds. FULL shows the resulting state. Start empty with all outputs at 0.",
    "Keep payload, occupancy and last delivered data separately. Process a successful TAKE before deciding whether SEND can be accepted."
  ],
  "C5-10": [
    "Divide Over Time",
    "Divide A (0–7) by B (1–3) to produce quotient Q and remainder R. Inputs stay fixed during each calculation; bit 0 is the lowest bit.\nTurn on COMPLETE when ready. Q and R must be correct at the first completion on ticks 1–10. Earlier values do not matter; missing the deadline fails. Each calculation starts with all memory at 0.",
    "You can count units while accumulating quotient and remainder, then assert COMPLETE. The example solution finishes in A+1 ticks, but ANY correct first completion within 10 ticks is accepted."
  ]
};
