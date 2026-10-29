export function isBattlefieldPointerWithinViewport(pointer, viewport) {
  return Boolean(viewport)
    && pointer.x >= viewport.x && pointer.x < viewport.x + viewport.width
    && pointer.y >= viewport.y && pointer.y < viewport.y + viewport.height;
}

export function getPlacementTileAtPointer(pointer, camera, projection, placementTiles = []) {
  const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
  const cell = projection.screenToTile(worldPoint.x, worldPoint.y);
  return cell && placementTiles.find(tile => tile.gridPosition.x === cell.x && tile.gridPosition.y === cell.y) || null;
}
