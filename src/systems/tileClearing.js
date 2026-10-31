import { getBuildingFootprint } from '../utils/buildingFootprint.js';

const key = ({ x, y }) => `${x},${y}`;
export const CLEAR_TILE_FORCE_COST = 70;

export function isUnclearableTile(map, position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  if ((map?.buildingTiles || []).some(tile => tile.x === position.x && tile.y === position.y)
    || (map?.buildings || []).some(building => getBuildingFootprint(building)
      .some(tile => tile.x === position.x && tile.y === position.y))) return true;
  return (map?.placementRestrictions || []).some(area => position.x >= area.x
    && position.x < area.x + area.width && position.y >= area.y && position.y < area.y + area.height);
}

export function canClearBlockedTile(map, position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const target = key(position);
  const blockedIndex = (map?.blockedClearableTiles || []).findIndex(tile => key(tile) === target);
  if (blockedIndex < 0) return false;
  if ((map.paths || []).some(path => path.some(point => key(point) === target))) return false;
  if (isUnclearableTile(map, position) || (map.specialTiles || []).some(tile => key(tile) === target)) return false;
  return true;
}

export function clearBlockedTile(map, position, economyManager) {
  if (!canClearBlockedTile(map, position)) return false;
  if (!economyManager?.spendForce(CLEAR_TILE_FORCE_COST)) return false;
  const target = key(position);
  const blockedIndex = map.blockedClearableTiles.findIndex(tile => key(tile) === target);
  const [tile] = map.blockedClearableTiles.splice(blockedIndex, 1);
  map.clearTiles ||= [];
  map.clearTiles.push(tile);
  return true;
}
