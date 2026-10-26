export function getPathTileKeys(paths = []) {
  const keys = new Set();
  paths.forEach(path => {
    for (let index = 0; index < path.length; index += 1) {
      const start = path[index];
      keys.add(`${start.x},${start.y}`);
      const end = path[index + 1];
      if (!end) continue;

      // Map paths are tile-aligned; include every tile crossed by each segment.
      const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      for (let step = 1; step <= steps; step += 1) {
        const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
        const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
        keys.add(`${x},${y}`);
      }
    }
  });
  return keys;
}

/** Return each traversed tile in order, paired with the next tile on the path. */
export function getDirectedPathTiles(path = []) {
  const tiles = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    for (let step = 0; step < steps; step += 1) {
      const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
      const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
      const nextX = Math.round(start.x + ((end.x - start.x) * (step + 1)) / steps);
      const nextY = Math.round(start.y + ((end.y - start.y) * (step + 1)) / steps);
      tiles.push({ x, y, nextX, nextY });
    }
  }
  const final = path[path.length - 1];
  const previous = tiles[tiles.length - 1];
  if (final && previous) {
    const dx = final.x - previous.x;
    const dy = final.y - previous.y;
    tiles.push({ x: final.x, y: final.y, nextX: final.x + dx, nextY: final.y + dy });
  }
  return tiles;
}

/** Choose the closer of the two available upward arrows using a horizontal flip. */
export function getProjectedPathArrowFlipX(dx, dy) {
  const projectedX = dx - dy;
  // The supplied art points up-right; its horizontal flip points up-left.
  // For downward routes either arrow is a temporary closest-image fallback.
  return projectedX < 0;
}
