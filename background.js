(() => {
  const canvas = document.getElementById('backgroundCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const STORAGE_KEY = 'backgroundAnimationEnabled';
  const baseCellSize = 50;
  const baseColor = '#FFFDF0';
  const gridColor = '#f0f0e8';
  const flowColors = ['#FFF7B0', '#FFE7A0', '#FFD8A8'];

  let width, height, cellWidth, cellHeight, cols, rows;
  let animationFrameId = null;

  function readStoredPreference() {
    if (typeof localStorage === 'undefined') return true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;
      return raw !== 'false';
    } catch (err) {
      console.warn('Failed to read background animation preference', err);
      return true;
    }
  }

  let animationEnabled = readStoredPreference();

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    cols = Math.max(1, Math.floor(width / baseCellSize));
    rows = Math.max(1, Math.floor(height / baseCellSize));
    cellWidth = width / cols;
    cellHeight = height / rows;
    canvas.width = width;
    canvas.height = height;
    if (animationEnabled) {
      resetFlows();
      scheduleAnimation();
    } else {
      drawStaticBackground();
    }
  }
  window.addEventListener('resize', resize);

  function drawStaticBackground() {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);
  }

  function drawAnimatedBackgroundBase() {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGridLines() {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= cols; i++) {
      const x = i * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = j * cellHeight;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
  }

  function randomColor() {
    return flowColors[Math.floor(Math.random() * flowColors.length)];
  }

  function createFlow() {
    const start = {};
    let dirPair;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      start.x = 0;
      start.y = Math.floor(Math.random() * rows) * cellHeight;
      const v =
        start.y === 0
          ? 1
          : start.y === height - cellHeight
            ? -1
            : Math.random() < 0.5
              ? 1
              : -1;
      dirPair = [{ x: 1, y: 0 }, { x: 0, y: v }];
    } else if (side === 1) {
      start.x = width - cellWidth;
      start.y = Math.floor(Math.random() * rows) * cellHeight;
      const v =
        start.y === 0
          ? 1
          : start.y === height - cellHeight
            ? -1
            : Math.random() < 0.5
              ? 1
              : -1;
      dirPair = [{ x: -1, y: 0 }, { x: 0, y: v }];
    } else if (side === 2) {
      start.y = 0;
      start.x = Math.floor(Math.random() * cols) * cellWidth;
      const h =
        start.x === 0
          ? 1
          : start.x === width - cellWidth
            ? -1
            : Math.random() < 0.5
              ? 1
              : -1;
      dirPair = [{ x: 0, y: 1 }, { x: h, y: 0 }];
    } else {
      start.y = height - cellHeight;
      start.x = Math.floor(Math.random() * cols) * cellWidth;
      const h =
        start.x === 0
          ? 1
          : start.x === width - cellWidth
            ? -1
            : Math.random() < 0.5
              ? 1
              : -1;
      dirPair = [{ x: 0, y: -1 }, { x: h, y: 0 }];
    }
    return {
      dirPair,
      currentDir: 0,
      path: [{ x: start.x, y: start.y, alpha: 1 }],
      lastStep: 0,
      active: true,
      color: randomColor()
    };
  }

  const flows = [];

  function resetFlows() {
    flows.length = 0;
    for (let i = 0; i < 3; i++) {
      flows.push(createFlow());
    }
  }

  function scheduleAnimation() {
    if (!animationEnabled) return;
    if (animationFrameId != null) return;
    animationFrameId = window.requestAnimationFrame(update);
  }

  function update(time) {
    animationFrameId = null;
    if (!animationEnabled) return;
    drawAnimatedBackgroundBase();
    flows.forEach(flow => {
      if (flow.active && time - flow.lastStep > 120) {
        flow.lastStep = time;
        if (Math.random() < 0.2) {
          flow.currentDir = 1 - flow.currentDir;
        }
        const last = flow.path[flow.path.length - 1];
        const dir = flow.dirPair[flow.currentDir];
        const next = {
          x: last.x + dir.x * cellWidth,
          y: last.y + dir.y * cellHeight,
          alpha: 1
        };
        if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) {
          flow.active = false;
        } else {
          flow.path.push(next);
        }
      }
      flow.path.forEach(p => {
        p.alpha -= 0.01;
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.fillStyle = flow.color;
        ctx.fillRect(p.x, p.y, cellWidth, cellHeight);
      });
      flow.path = flow.path.filter(p => p.alpha > 0);
    });
    ctx.globalAlpha = 1;
    drawGridLines();
    for (let i = flows.length - 1; i >= 0; i--) {
      if (!flows[i].active && flows[i].path.length === 0) {
        flows.splice(i, 1);
      }
    }
    while (flows.length < 3) {
      flows.push(createFlow());
    }
    scheduleAnimation();
  }

  function setAnimationEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === animationEnabled) {
      if (next) {
        scheduleAnimation();
      } else {
        drawStaticBackground();
      }
      return;
    }
    animationEnabled = next;
    if (document.body) {
      document.body.classList.toggle('background-animation-off', !animationEnabled);
    }
    if (!animationEnabled) {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      flows.length = 0;
      drawStaticBackground();
    } else {
      resetFlows();
      scheduleAnimation();
    }
  }

  window.addEventListener('bitwiser:backgroundAnimationToggle', event => {
    const detail = event?.detail;
    const enabled = detail ? detail.enabled !== false : true;
    setAnimationEnabled(enabled);
  });

  if (document.body) {
    document.body.classList.toggle('background-animation-off', !animationEnabled);
  }

  resize();
  if (animationEnabled) {
    resetFlows();
    scheduleAnimation();
  } else {
    drawStaticBackground();
  }
})();
