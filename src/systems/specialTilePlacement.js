import { isValidSpecialTilePlacement } from './missionGeneration.js';

export function placeSpecialTileOnMap(map, position, type, economyManager) {
  if (!economyManager || economyManager.tilePurchasePoints < 1
    || !isValidSpecialTilePlacement(map, position, type)) return null;
  const placed = { x: position.x, y: position.y, type };
  map.specialTiles ||= [];
  map.specialTiles.push(placed);
  if (!economyManager.spendSpecialTilePoint()) {
    map.specialTiles.pop();
    return null;
  }
  return placed;
}
