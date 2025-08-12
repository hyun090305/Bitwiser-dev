(() => {
  const canvas = document.getElementById('backgroundCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const cellSize = 50;
  const baseColor = '#FFFDF0';
  const gridColor = '#f0f0e8';
  const flowColors = ['#FFF7B0', '#FFE7A0', '#FFD8A8'];

  let width, height;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawBackground() {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGridLines() {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += cellSize) {
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
    const side = Math.floor(Math.random() * 4); // 0: left, 1: right, 2: top, 3: bottom
    if (side === 0) {
      start.x = 0;
      start.y = Math.floor(Math.random() * (height / cellSize)) * cellSize;
      const v = start.y === 0 ? 1 : (start.y === height - cellSize ? -1 : (Math.random() < 0.5 ? 1 : -1));
      dirPair = [{x:1,y:0}, {x:0,y:v}];
    } else if (side === 1) {
      start.x = width - cellSize;
      start.y = Math.floor(Math.random() * (height / cellSize)) * cellSize;
      const v = start.y === 0 ? 1 : (start.y === height - cellSize ? -1 : (Math.random() < 0.5 ? 1 : -1));
      dirPair = [{x:-1,y:0}, {x:0,y:v}];
    } else if (side === 2) {
      start.y = 0;
      start.x = Math.floor(Math.random() * (width / cellSize)) * cellSize;
      const h = start.x === 0 ? 1 : (start.x === width - cellSize ? -1 : (Math.random() < 0.5 ? 1 : -1));
      dirPair = [{x:0,y:1}, {x:h,y:0}];
    } else {
      start.y = height - cellSize;
      start.x = Math.floor(Math.random() * (width / cellSize)) * cellSize;
      const h = start.x === 0 ? 1 : (start.x === width - cellSize ? -1 : (Math.random() < 0.5 ? 1 : -1));
      dirPair = [{x:0,y:-1}, {x:h,y:0}];
    }
    return {
      dirPair,
      path: [start],
      lastStep: 0,
      fading: false,
      alpha: 1,
      color: randomColor()
    };
  }

  let flows = [createFlow()];

  function update(time) {
    drawBackground();
    flows.forEach(flow => {
      if (!flow.fading && time - flow.lastStep > 120) {
        flow.lastStep = time;
        const last = flow.path[flow.path.length - 1];
        const dir = flow.dirPair[Math.random() < 0.5 ? 0 : 1];
        const next = {x: last.x + dir.x * cellSize, y: last.y + dir.y * cellSize};
        if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) {
          flow.fading = true;
        } else {
          flow.path.push(next);
        }
      }
      if (flow.fading) {
        flow.alpha -= 0.01;
      }
      ctx.globalAlpha = Math.max(flow.alpha, 0);
      ctx.fillStyle = flow.color;
      flow.path.forEach(p => ctx.fillRect(p.x, p.y, cellSize, cellSize));
    });
    ctx.globalAlpha = 1;
    drawGridLines();
    flows = flows.filter(f => f.alpha > 0);
    if (flows.length < 3) {
      flows.push(createFlow());
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
})();
