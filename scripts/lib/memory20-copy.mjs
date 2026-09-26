// English player titles, instructions and hints.
export const memory20Copy = {
  "C4-01": [
    "Storage Switch",
    "Store DATA in VALUE when LOAD is on. Otherwise keep the saved value, even if DATA changes. VALUE starts at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic LOAD button release completes the tick; switches keep their values.",
    "Connect DATA to D and LOAD to EN."
  ],
  "C4-02": [
    "Rising Edge Detector",
    "Turn on RISE for the tick when SIGNAL changes from 0 to 1. Holding SIGNAL on must not trigger it again. Treat SIGNAL before the first tick as 0. RISE starts at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick.",
    "Store the previous SIGNAL and the detected edge in separate D blocks. Compute the edge using the old previous value."
  ],
  "C4-03": [
    "Fault Indicator",
    "FAULT turns ALARM on and keeps it on. ACK clears it, but FAULT wins if both arrive together. With no request, hold the value. ALARM starts off. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic ACK button release completes the tick; switches keep their values.",
    "Store FAULT with EN=FAULT OR ACK."
  ],
  "C4-04": [
    "Bouncing Button",
    "Change CLEAN only when RAW has stayed the same for three ticks, on the third tick. Ignore shorter glitches in either direction. CLEAN and the previous samples start at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick.",
    "Remember two previous RAW samples and CLEAN. Set on three ones, clear on three zeros, otherwise hold."
  ],
  "C4-05": [
    "Automatic Door",
    "OPEN keeps DOOR on for three ticks, including the request tick. Another request restarts the timer. OPEN 1→0→0→0 should produce DOOR 1→1→1→0. The door starts closed. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic OPEN button release completes the tick; switches keep their values.",
    "Remember three OPEN samples with D blocks and combine them using two binary OR gates."
  ],
  "C4-06": [
    "Up/Down Counter",
    "Count from 0 to 3 using BIT1·BIT0. On a tick with only INC pressed, add one; with only DEC pressed, subtract one. Both pressed or neither pressed keeps the value. Increasing 3 wraps to 0; decreasing 0 wraps to 3. Start at 0. Changing inputs or automatically releasing buttons does not change the count.",
    "Determine when each bit toggles. D enables can simplify holding the value."
  ],
  "C4-07": [
    "Light Timing",
    "Select 0–3 with LEVEL1·LEVEL0. LIGHT repeats a four-slot pattern, lighting the selected number of slots at the beginning of each cycle. The initial screen (tick 0) is the first slot; completing the first tick moves to the second slot. Each tick moves to the next slot, returning to the first after the fourth. Changing the setting immediately affects the current slot without restarting the cycle. Slots keep advancing even when 0 is selected. The examples below show LIGHT across the first → second → third → fourth slots.",
    "Remember the four-slot cycle with two bits. Consider an order that changes only one bit at a time."
  ],
  "C4-08": [
    "Fair Access",
    "Grant A_OK or B_OK to the side requesting access. If both request, choose the opposite of the last winner; the first tie goes to A. Single grants also update the turn. With no request, turn both outputs off and remember the turn. A_OK and B_OK start at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick.",
    "Remember the last winner with EN=request present, and register whether this tick had any request."
  ],
  "C4-09": [
    "ABBA Lock",
    "SIGNAL means A when 1 and B when 0. Accept a letter only when SUBMIT is on. Turn UNLOCKED on when the latest four submitted letters are ABBA, including within AABBA. Waiting preserves the letters; once unlocked, stay unlocked. Start with no letters. UNLOCKED starts at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic SUBMIT button release completes the tick; switches keep their values.",
    "Shift submitted letters using SUBMIT as EN. Detect the previous A,B,B and the new A; retain the unlocked state."
  ],
  "C4-10": [
    "Delay Timer",
    "Select a delay of 0–3 ticks with TIME1·TIME0. The tick that samples START schedules the timer; DONE turns on for one tick after the selected number of further ticks. Later changes to TIME do not affect the running timer. START cancels any previous timer and schedules a new one with the current setting. A delay of 0 completes on that same actual tick. Initially no timer is scheduled. After completion, wait for a new START.\nA new START also takes priority on a previous timer’s due tick. START on consecutive ticks reschedules each time; repeatedly scheduling 0 may keep DONE at 1. Changing inputs or automatically releasing START does not change the output. DONE remains until the next actual tick.",
    "Remember the captured setting and the remaining time. Keep completion visible until the next tick, and discard the old timer whenever START arrives."
  ],
  "C5-01": [
    "Accumulator",
    "When ADD is on, add D1·D0 to Q1·Q0. Wrap the two-bit sum after 3. Otherwise hold the sum. Start at 0; RESET overrides ADD and clears the sum. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic ADD·RESET button release completes the tick; switches keep their values.",
    "Derive the toggle condition for each bit, including carry. Use enabled memories and give RESET priority."
  ],
  "C5-02": [
    "Addressed Storage",
    "Build two two-bit storage slots, both starting at 00. WRITE saves D1·D0 to the slot selected by ADDR. Q1·Q0 always reads the selected slot: with WRITE either on or off, changing ADDR to 0 or 1 changes the readout immediately without a tick, and a write tick shows the new value. Changing DATA or WRITE before a tick does not write memory. Automatic WRITE release completes the tick; ADDR and DATA switches keep their values.",
    "Give each word its own write enable, then select the addressed word for reading."
  ],
  "C5-03": [
    "Undo Once",
    "SAVE stores D1·D0 and keeps the previous value for one UNDO. Undoing clears UNDO_AVAILABLE until the next SAVE. Even saving the same value enables undo. SAVE wins when both are requested. Current and previous values start at 00, with undo unavailable. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic SAVE·UNDO button release completes the tick; switches keep their values.",
    "Keep current and backup words plus an availability bit. SAVE must copy the old current value into the backup."
  ],
  "C5-04": [
    "Response Check",
    "Check responses from both paths A and B. Remember the first response for as long as it takes the other to arrive. Set GO to 1 on the tick when both have arrived, then clear both records. Repeated responses from one path count only once. Simultaneous responses also count, and new responses can be received from the very next tick. If A and B arrive together every tick, GO stays 1 on those consecutive ticks. Otherwise, GO is 0 on ticks without a complete pair. Initially there are no records and GO is 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic A·B button release completes the tick; switches keep their values.",
    "Remember which paths have responded. Make sure responses used for one check cannot be reused for the next."
  ],
  "C5-05": [
    "Serial Receiver",
    "Accept one DATA bit whenever RECEIVE is on, highest bit first. On the fourth bit, update Q3·Q2·Q1·Q0 together and pulse DONE for that tick. Otherwise hold Q and clear DONE. Waiting preserves progress; each four bits forms a new word. Q starts at 0000. DONE starts at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic RECEIVE button release completes the tick; switches keep their values.",
    "Keep received bits and a four-step progress state. Publish all four bits together and register DONE for exactly the completion tick."
  ],
  "C5-06": [
    "Serial Transmitter",
    "While idle, START captures D3·D2·D1·D0. Send D3 immediately, then D2, D1 and D0 on the next three ticks. Ignore input changes and START through the last bit; a new word can start on the following tick.\nVALID is on for each bit; BUSY is on while more bits remain. The last bit has VALID=1, BUSY=0. Idle holds SERIAL and clears both flags. RESET overrides START, cancels transmission and clears all outputs. All outputs start at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick.",
    "Store the captured word and transmission progress. Register SERIAL and VALID, and derive BUSY from the remaining work."
  ],
  "C5-07": [
    "Last In, First Out",
    "PUSH stores DATA in a stack of up to two bits. POP retrieves the newest bit into DATA_OUT and pulses VALID. Otherwise hold DATA_OUT and clear VALID.\nTogether, pop first, then push. If empty, only push; if full without a pop, ignore the push. EMPTY and FULL show the resulting state. Start empty with DATA_OUT and VALID at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic PUSH·POP button release completes the tick; switches keep their values.",
    "Track two data slots and occupancy. Preserve the last popped value independently of the current top, and register POP success."
  ],
  "C5-08": [
    "First In, First Out",
    "PUSH stores DATA in a queue of up to two bits. POP retrieves the oldest bit into DATA_OUT and pulses VALID. Otherwise hold DATA_OUT and clear VALID.\nTogether, pop first, then push. If empty, only push; if full without a pop, ignore the push. EMPTY and FULL show the resulting state. Start empty with DATA_OUT and VALID at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic PUSH·POP button release completes the tick; switches keep their values.",
    "Track the head, tail and occupancy. A POP exposes the oldest item and shifts any remaining item toward the head. Keep the last popped value separately."
  ],
  "C5-09": [
    "Mailbox",
    "SEND puts DATA into a one-bit mailbox; TAKE retrieves it into DATA_OUT. Pulse ACCEPTED for a successful send and VALID for a successful take.\nTogether, take first, then send. If empty, only send; if full without a take, reject the send. Hold DATA_OUT unless a take succeeds. FULL shows the resulting state. Start empty with all outputs at 0. From the initial state onward, changing inputs alone leaves all outputs unchanged. Pulses also remain until the next actual tick. Automatic SEND·TAKE button release completes the tick; switches keep their values.",
    "Keep payload, occupancy and last delivered data separately. Process a successful TAKE before deciding whether SEND can be accepted."
  ],
  "C5-10": [
    "Divide Over Time",
    "Divide A (0–7) by B (1–3) to produce quotient Q and remainder R. Inputs stay fixed during each calculation; bit 0 is the lowest bit.\nTurn on COMPLETE when ready. Q and R must be correct at the first completion on ticks 1–10. Earlier values do not matter; missing the deadline fails. Each calculation starts with all memory at 0.",
    "You can count units while accumulating quotient and remainder, then assert COMPLETE. The example solution finishes in A+1 ticks, but ANY correct first completion within 10 ticks is accepted."
  ]
};
