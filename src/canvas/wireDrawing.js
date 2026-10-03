// Visit every crossed grid cell between two pointer samples, excluding the
// starting cell. Coordinates are in cell units, including their fractional part.
// At a corner, visit the column neighbor first to keep the path orthogonal.
export function* wireSegmentCells(from, to) {
  let c = Math.floor(from.x), r = Math.floor(from.y);
  const endC = Math.floor(to.x), endR = Math.floor(to.y);
  const dx = to.x - from.x, dy = to.y - from.y;
  const dc = Math.sign(dx), dr = Math.sign(dy);
  const stepX = dx ? 1 / Math.abs(dx) : Infinity;
  const stepY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = dx ? (c + (dc > 0 ? 1 : 0) - from.x) / dx : Infinity;
  let nextY = dy ? (r + (dr > 0 ? 1 : 0) - from.y) / dy : Infinity;
  while (c !== endC || r !== endR) {
    if (c !== endC && (r === endR || nextX <= nextY)) {
      c += dc;
      nextX += stepX;
    } else {
      r += dr;
      nextY += stepY;
    }
    yield { r, c };
  }
}
