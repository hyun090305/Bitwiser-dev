const COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#577590', '#f9844a', '#43aa8b', '#4d908e'];
const GRAVITY = 0.15;
const DRAG = 0.005;
const TERMINAL_VELOCITY = 5;
const PARTICLES_PER_TICK = 6;
const DEFAULT_DURATION = 2800;

let canvas = null;
let ctx = null;
let resizeHandler = null;
let animationFrame = null;
let particles = [];
let isRunning = false;
let endTime = 0;

function setupCanvas() {
  if (canvas) {
    return canvas;
  }

  canvas = document.createElement('canvas');
  canvas.id = 'stageConfettiCanvas';
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 250ms ease';
  document.body.appendChild(canvas);

  ctx = canvas.getContext('2d');

  const resize = () => {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  resizeHandler = resize;
  window.addEventListener('resize', resizeHandler);

  return canvas;
}

function cleanupCanvas() {
  if (!canvas) {
    return;
  }

  canvas.style.opacity = '0';
  setTimeout(() => {
    if (isRunning || !canvas) return;
    canvas.style.display = 'none';
  }, 260);
}

function createParticle(width) {
  const angle = Math.random() * Math.PI - Math.PI / 2;
  const speed = Math.random() * 4 + 3;
  const size = Math.random() * 6 + 4;

  return {
    x: Math.random() * width,
    y: -20,
    size,
    tilt: Math.random() * Math.PI * 2,
    tiltSpeed: (Math.random() - 0.5) * 0.2,
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
  };
}

function drawParticle(particle) {
  if (!ctx) return;

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.fillStyle = particle.color;
  ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
  ctx.restore();
}

function updateParticles(boundsWidth, boundsHeight) {
  const now = Date.now();

  if (now < endTime) {
    for (let i = 0; i < PARTICLES_PER_TICK; i += 1) {
      particles.push(createParticle(boundsWidth));
    }
  }

  particles.forEach(particle => {
    particle.velocityY = Math.min(particle.velocityY + GRAVITY, TERMINAL_VELOCITY);
    particle.velocityX *= 1 - DRAG;
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;
    particle.rotation += particle.rotationSpeed;
    particle.tilt += particle.tiltSpeed;
    particle.x += Math.sin(particle.tilt) * 0.6;
  });

  particles = particles.filter(particle =>
    particle.y < boundsHeight + particle.size &&
    particle.x > -boundsWidth * 0.25 &&
    particle.x < boundsWidth * 1.25
  );

  if (particles.length === 0 && now >= endTime) {
    stopAnimation();
  }
}

function renderFrame() {
  if (!ctx || !canvas) return;

  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, width, height);
  updateParticles(width, height);
  particles.forEach(drawParticle);

  if (isRunning) {
    animationFrame = window.requestAnimationFrame(renderFrame);
  }
}

function stopAnimation() {
  if (!isRunning) {
    return;
  }
  isRunning = false;
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  particles = [];
  cleanupCanvas();
}

export function triggerConfetti({ duration = DEFAULT_DURATION, initialBurst = 160 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const confettiCanvas = setupCanvas();
  if (!confettiCanvas || !ctx) return;

  confettiCanvas.style.display = 'block';
  confettiCanvas.style.opacity = '1';

  const width = confettiCanvas.width / (window.devicePixelRatio || 1);
  for (let i = 0; i < initialBurst; i += 1) {
    particles.push(createParticle(width));
  }

  endTime = Date.now() + Math.max(duration, 1000);

  if (!isRunning) {
    isRunning = true;
    renderFrame();
  }
}

export function disposeConfetti() {
  stopAnimation();
  if (canvas) {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }
  canvas = null;
  ctx = null;
}

if (typeof window !== 'undefined') {
  window.triggerStageConfetti = triggerConfetti;
}

export default triggerConfetti;
