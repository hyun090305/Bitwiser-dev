const CARDS = {
  lab: { caption: 'TEST BENCH', ko: '실험실', en: 'Lab' },
  user_created_stages: { caption: 'EXTERNAL BLUEPRINTS', ko: '유저 제작 문제', en: 'User-Created Puzzles' }
};

export const EXTRAS_SIGNAL_DURATION = 850;
export const isExtrasCard = node => Boolean(CARDS[node?.id]);
export function extrasCardText(node, language = 'en') {
  const info = CARDS[node.id];
  return { caption: info.caption, title: info[language === 'ko' ? 'ko' : 'en'] };
}

// Code-drawn line art shares the canvas camera and the stage cards' corner radius.
export function drawExtrasCard(ctx, camera, node, status, { active, pressed, signalProgress, language }) {
  const scale = camera.getScale(), pos = camera.worldToScreen(node.rect.x, node.rect.y);
  const width = node.rect.w * scale, height = node.rect.h * scale;
  const locked = status.locked && !node.previewFeature;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pos.x, pos.y, width, height, Math.min(12 * scale, width / 4, height / 4));
  ctx.fillStyle = pressed ? '#172c40' : '#112033';
  ctx.fill();
  ctx.strokeStyle = active || pressed ? '#8ee9e8' : locked ? '#405566' : '#3c8190';
  ctx.lineWidth = Math.max((active || pressed ? 2.4 : 1.2) * scale, 1);
  if (active || pressed) {
    ctx.shadowColor = 'rgba(103, 232, 249, 0.22)';
    ctx.shadowBlur = 10 * scale;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.translate(pos.x, pos.y);
  ctx.scale(width / 320, height / 280);
  const { caption, title } = extrasCardText(node, language);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "600 13px 'Noto Sans KR', system-ui, sans-serif";
  ctx.fillStyle = locked ? '#81929f' : '#8cb5c4';
  ctx.fillText(caption, 160, 33);
  ctx.font = `700 ${language === 'ko' ? 28 : 24}px 'Noto Sans KR', system-ui, sans-serif`;
  ctx.fillStyle = locked ? '#98a8b6' : '#e3eef5';
  ctx.fillText(title, 160, 231, 284);

  const line = (points, color = '#6397ab', lineWidth = 1.5) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
  };
  const box = (x, y, w, h, color = '#6397ab') => {
    ctx.beginPath();ctx.roundRect(x, y, w, h, 3);
    ctx.fillStyle = '#112033';ctx.fill();ctx.strokeStyle = color;ctx.lineWidth = 1.5;ctx.stroke();
  };
  ctx.save();
  if (locked) ctx.globalAlpha *= 0.55;
  let trace;
  if (node.id === 'lab') {
    for (let x = 80; x <= 240; x += 20) line([[x, 73], [x, 173]], '#294354', 0.8);
    for (let y = 73; y <= 173; y += 20) line([[80, y], [240, y]], '#294354', 0.8);
    trace = [[110, 103], [160, 103], [160, 153], [210, 153]];
    line(trace);
    box(98, 91, 24, 24); box(148, 91, 24, 24); box(198, 141, 24, 24);
    line([[104, 103], [116, 103]], '#9fc4d0');
    line([[155, 98], [165, 103], [155, 108], [155, 98]], '#9fc4d0');
    ctx.beginPath();ctx.arc(210, 153, 4, 0, Math.PI * 2);ctx.stroke();
  } else {
    box(95, 65, 108, 94, '#355669');
    box(106, 77, 108, 94, '#477488');
    box(117, 89, 108, 94);
    line([[130, 104], [158, 104]], '#426477');
    trace = [[138, 129], [170, 129], [170, 160], [207, 160]];
    line(trace);
    box(131, 122, 14, 14);box(163, 122, 14, 14);box(200, 153, 14, 14);
  }
  // A single signal traverses the circuit on hover/focus, then disappears.
  if (signalProgress != null && signalProgress >= 0 && signalProgress < 1) {
    const lengths = trace.slice(1).map((p, i) => Math.hypot(p[0] - trace[i][0], p[1] - trace[i][1]));
    let distance = signalProgress * lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i]) {
        const ratio = distance / lengths[i], a = trace[i], b = trace[i + 1];
        ctx.beginPath();ctx.arc(a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = '#b8fff2';ctx.shadowColor = '#67e8f9';ctx.shadowBlur = 9;ctx.fill();
        break;
      }
      distance -= lengths[i];
    }
  }
  ctx.restore();
  if (status.locked) {
    ctx.strokeStyle = '#8ba5b5';ctx.lineWidth = 1.3;
    ctx.beginPath();ctx.roundRect(289, 19, 12, 10, 2);ctx.stroke();
    ctx.beginPath();ctx.arc(295, 19, 4, Math.PI, 0);ctx.stroke();
  }
  ctx.restore();
}
