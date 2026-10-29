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
  // A path may cross itself. Keep one visual tile per map cell, but overwrite
  // its direction on every visit so the last crossing is authoritative.
  const finalDirectionByTile = new Map();
  let lastTraversedTile = null;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    for (let step = 0; step < steps; step += 1) {
      const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
      const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
      const nextX = Math.round(start.x + ((end.x - start.x) * (step + 1)) / steps);
      const nextY = Math.round(start.y + ((end.y - start.y) * (step + 1)) / steps);
      const tile = { x, y, nextX, nextY };
      finalDirectionByTile.delete(`${x},${y}`);
      finalDirectionByTile.set(`${x},${y}`, tile);
      lastTraversedTile = tile;
    }
  }
  const final = path[path.length - 1];
  if (final && lastTraversedTile) {
    const dx = final.x - lastTraversedTile.x;
    const dy = final.y - lastTraversedTile.y;
    // Enemies stop at the final waypoint. Its arrow follows the direction
    // they traveled into the exit tile; no outgoing segment is invented.
    finalDirectionByTile.delete(`${final.x},${final.y}`);
    finalDirectionByTile.set(`${final.x},${final.y}`, {
      x: final.x,
      y: final.y,
      nextX: final.x + dx,
      nextY: final.y + dy,
    });
  }
  return [...finalDirectionByTile.values()];
}

/** Rotate the up-right arrow art to match the route in the map's oblique grid. */
export function getProjectedPathArrowRotation(dx, dy) {
  const projectedAngle = Math.atan2(dx + dy, dx - dy);
  // The arrow in both path-tile assets points up-right (-PI / 4).
  return projectedAngle + Math.PI / 4;
}
