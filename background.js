(() => {
  const canvas = document.getElementById('backgroundCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const cellSize = 50;
  const baseColor = '#FFFFFB';
  const gridColor = '#f0f0e8';
  const flowColors = ['#FFF7B0', '#FFE7A0', '#FFD8A8'];

  let width, height;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawGrid() {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);
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
    const dirs = [
      [ {x:1,y:0}, {x:0,y:1} ],  // right/down
      [ {x:1,y:0}, {x:0,y:-1} ], // right/up
      [ {x:-1,y:0}, {x:0,y:1} ], // left/down
      [ {x:-1,y:0}, {x:0,y:-1} ] // left/up
    ];
    const dirPair = dirs[Math.floor(Math.random() * dirs.length)];
    const start = {
      x: Math.floor(Math.random() * (width / cellSize)) * cellSize,
      y: Math.floor(Math.random() * (height / cellSize)) * cellSize
    };
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
    drawGrid();
    flows.forEach(flow => {
      if (!flow.fading && time - flow.lastStep > 120) {
        flow.lastStep = time;
        const last = flow.path[flow.path.length - 1];
        const dir = flow.dirPair[Math.random() < 0.5 ? 0 : 1];
        const next = {x: last.x + dir.x * cellSize, y: last.y + dir.y * cellSize};
        flow.path.push(next);
        if (next.x < 0 || next.x > width || next.y < 0 || next.y > height) {
          flow.fading = true;
        }
      }
      if (flow.fading) {
        flow.alpha -= 0.01;
      }
      ctx.globalAlpha = Math.max(flow.alpha, 0);
      ctx.strokeStyle = flow.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(flow.path[0].x + 0.5, flow.path[0].y + 0.5);
      for (let i = 1; i < flow.path.length; i++) {
        ctx.lineTo(flow.path[i].x + 0.5, flow.path[i].y + 0.5);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    flows = flows.filter(f => f.alpha > 0);
    if (flows.length < 3) {
      flows.push(createFlow());
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
})();
