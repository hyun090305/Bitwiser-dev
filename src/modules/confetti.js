const CONFETTI_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd', '#ff9ff3'];
const GRAVITY = 0.12; // acceleration per frame at 60fps
const DRAG = 0.01;
const TERMINAL_VELOCITY = 12;
const PARTICLE_COUNT = 180;
const EMISSION_SPAN_MS = 1200;
const EFFECT_DURATION_MS = 3200;

let canvas = null;
let context = null;
let particles = [];
let animationFrameId = null;
let resizeHandler = null;
let startTimestamp = 0;

function getPixelRatio() {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

function createCanvas() {
  if (typeof document === 'undefined') return null;
  if (canvas) return canvas;

  canvas = document.createElement('canvas');
  canvas.id = 'confettiCanvas';
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 180ms ease-out';

  context = canvas.getContext('2d');

  document.body.appendChild(canvas);
  requestAnimationFrame(() => {
    if (canvas) {
      canvas.style.opacity = '1';
    }
  });

  const resize = () => {
    if (!canvas) return;
    const ratio = getPixelRatio();
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    if (context) {
      context.scale(1, 1);
    }
  };

  resize();
  resizeHandler = resize;
  window.addEventListener('resize', resizeHandler);

  return canvas;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function createParticle(width, height) {
  const angle = Math.random() * Math.PI * 2;
  const speed = randomRange(4, 9);

  return {
    x: randomRange(0, width),
    y: randomRange(-height * 0.4, 0),
    size: randomRange(6, 12),
    rotation: randomRange(0, 360),
    rotationSpeed: randomRange(-8, 8),
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed + 2,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    tilt: randomRange(0.5, 1.2)
  };
}

function drawParticle(ctx, particle) {
  const ratio = getPixelRatio();
  const size = particle.size * ratio;
  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate((particle.rotation * Math.PI) / 180);
  ctx.fillStyle = particle.color;
  ctx.fillRect(-size / 2, -size / 2, size, size * particle.tilt);
  ctx.restore();
}

function updateParticles(deltaFactor) {
  const width = canvas.width;
  const height = canvas.height;
  const remove = [];

  particles.forEach((particle, index) => {
    particle.velocityY = Math.min(
      particle.velocityY + GRAVITY * deltaFactor,
      TERMINAL_VELOCITY
    );
    particle.velocityX *= 1 - DRAG * deltaFactor;
    particle.x += particle.velocityX * deltaFactor;
    particle.y += particle.velocityY * deltaFactor;
    particle.rotation += particle.rotationSpeed * deltaFactor;

    if (particle.y - particle.size * getPixelRatio() > height) {
      remove.push(index);
    }
  });

  for (let i = remove.length - 1; i >= 0; i -= 1) {
    particles.splice(remove[i], 1);
  }

  const elapsed = performance.now() - startTimestamp;
  if (elapsed < EMISSION_SPAN_MS) {
    const additional = Math.floor(Math.random() * 10);
    for (let i = 0; i < additional; i += 1) {
      particles.push(createParticle(width, height));
    }
  }
}

function cleanup() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (resizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', resizeHandler);
  }
  resizeHandler = null;
  particles = [];

  if (canvas) {
    canvas.style.opacity = '0';
    setTimeout(() => {
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      canvas = null;
      context = null;
    }, 220);
  }
}

function renderFrame(timestamp) {
  if (!context || !canvas) return;
  if (!startTimestamp) startTimestamp = timestamp;

  const last = renderFrame.lastTimestamp || timestamp;
  const delta = Math.max(16, timestamp - last);
  const deltaFactor = delta / 16.6667;
  renderFrame.lastTimestamp = timestamp;

  context.clearRect(0, 0, canvas.width, canvas.height);
  updateParticles(deltaFactor);
  particles.forEach(particle => drawParticle(context, particle));

  const elapsed = timestamp - startTimestamp;
  if (elapsed > EFFECT_DURATION_MS && particles.length === 0) {
    cleanup();
    renderFrame.lastTimestamp = null;
    startTimestamp = 0;
    return;
  }

  animationFrameId = requestAnimationFrame(renderFrame);
}

export function triggerConfetti() {
  if (typeof window === 'undefined') return;
  createCanvas();
  if (!canvas || !context) return;

  startTimestamp = 0;
  particles = [];
  renderFrame.lastTimestamp = null;

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    particles.push(createParticle(canvas.width, canvas.height));
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = requestAnimationFrame(renderFrame);
}

export function isConfettiActive() {
  return Boolean(animationFrameId);
}

