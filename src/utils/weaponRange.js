/**
 * Check range using logical world coordinates. Melee range is tile-based so
 * diagonal neighbors count as adjacent; ranged weapons retain Euclidean range.
 */
export function isWithinWeaponRange(origin, target, range, attackType, tileSize) {
  if (!origin || !target || !Number.isFinite(range) || range < 0) return false;

  if (attackType === 'melee') {
    if (!Number.isFinite(tileSize) || tileSize <= 0) return false;
    const originTileX = Math.floor(origin.x / tileSize);
    const originTileY = Math.floor(origin.y / tileSize);
    const targetTileX = Math.floor(target.x / tileSize);
    const targetTileY = Math.floor(target.y / tileSize);
    const tileDistance = Math.max(
      Math.abs(targetTileX - originTileX),
      Math.abs(targetTileY - originTileY)
    );
    return tileDistance > 0 && tileDistance * tileSize <= range;
  }

  return Math.hypot(target.x - origin.x, target.y - origin.y) <= range;
}
