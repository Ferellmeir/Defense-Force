const DIAGONAL = Math.SQRT1_2;

/**
 * Build a centered, reversible oblique projection for the battlefield.
 * Input/output positions are screen pixels; game positions remain logical pixels.
 */
export function createBattlefieldProjection({
  mapWidth,
  mapHeight,
  tileSize,
  viewportWidth,
  viewportHeight,
  topInset = 80,
  bottomInset = 100,
  horizontalInset = 24,
  verticalInset = 8,
  fit = 0.98,
}) {
  const logicalWidth = mapWidth * tileSize;
  const logicalHeight = mapHeight * tileSize;
  const logicalCenterX = logicalWidth / 2;
  const logicalCenterY = logicalHeight / 2;
  const projectedWidth = (logicalWidth + logicalHeight) * DIAGONAL;
  const projectedHeight = projectedWidth / 2;
  const availableHeight = Math.max(1, viewportHeight - topInset - bottomInset);
  const scale = Math.min(
    (viewportWidth - horizontalInset * 2) / projectedWidth,
    (availableHeight - verticalInset * 2) / projectedHeight
  ) * fit;
  const originX = viewportWidth / 2;
  const originY = topInset + availableHeight / 2;

  function worldToScreen(x, y) {
    const dx = x - logicalCenterX;
    const dy = y - logicalCenterY;
    return {
      x: originX + (dx - dy) * DIAGONAL * scale,
      y: originY + (dx + dy) * DIAGONAL * scale * 0.5,
    };
  }

  function screenToWorld(x, y) {
    const projectedX = (x - originX) / (DIAGONAL * scale);
    const projectedY = (y - originY) / (DIAGONAL * scale * 0.5);
    const dx = (projectedX + projectedY) / 2;
    const dy = (projectedY - projectedX) / 2;
    return {
      x: logicalCenterX + dx,
      y: logicalCenterY + dy,
    };
  }

  function screenToTile(x, y) {
    const world = screenToWorld(x, y);
    const tileX = Math.floor(world.x / tileSize);
    const tileY = Math.floor(world.y / tileSize);
    if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) return null;
    return { x: tileX, y: tileY };
  }

  function worldToLayer(x, y) {
    const dx = x - logicalCenterX;
    const dy = y - logicalCenterY;
    return {
      x: (dx - dy) * DIAGONAL,
      y: (dx + dy) * DIAGONAL,
    };
  }

  return {
    scale,
    originX,
    originY,
    logicalCenterX,
    logicalCenterY,
    worldToScreen,
    screenToWorld,
    screenToTile,
    worldToLayer,
  };
}
