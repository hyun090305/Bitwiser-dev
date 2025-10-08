const CONFETTI_MODULE_URL = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs';

let confettiModulePromise = null;

function loadConfettiModule() {
  if (!confettiModulePromise) {
    confettiModulePromise = import(CONFETTI_MODULE_URL);
  }
  return confettiModulePromise;
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

export async function launchConfetti(options = {}) {
  if (typeof window === 'undefined') return;

  const { default: confetti } = await loadConfettiModule();
  const duration = options.duration ?? 2000;
  const endTime = Date.now() + duration;
  const defaults = {
    startVelocity: 40,
    spread: 360,
    ticks: 60,
    zIndex: 9999,
    gravity: 0.9
  };

  const interval = window.setInterval(() => {
    const timeLeft = endTime - Date.now();

    if (timeLeft <= 0) {
      window.clearInterval(interval);
      return;
    }

    const particleCount = Math.round(80 * (timeLeft / duration));

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() * 0.3 }
    });

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() * 0.3 }
    });
  }, 250);
}

if (typeof window !== 'undefined') {
  window.launchBitwiserConfetti = launchConfetti;
}
