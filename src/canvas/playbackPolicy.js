// User intent survives temporary editing, grading and visibility suspensions.
// Starting/resuming only schedules a tick; it never advances the circuit here.
export function createPlaybackPolicy(runner, { enabled, canRun, isEditing = () => false }) {
  let ready = false, userPaused = false;
  const available = () => ready && enabled && canRun() && !isEditing();
  function sync() {
    if (available() && !userPaused) runner.play();
    else if (runner.isRunning()) runner.pause();
  }
  return {
    canRun: available,
    sync,
    setReady() { ready = true; },
    beginEdit() { runner.pause(); },
    toggle() { userPaused = runner.isRunning(); sync(); },
    isUserPaused: () => userPaused
  };
}
