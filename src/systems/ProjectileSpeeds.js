// Workbook categories are expressed in tiles per second. Convert to the map's
// pixel coordinates where the weapon profile is constructed.
export const PROJECTILE_SPEED_TILES_PER_SECOND = Object.freeze({
  fired: 12,
  thrown: 4,
});

export function getProjectileSpeed(category, tileSize) {
  const speed = PROJECTILE_SPEED_TILES_PER_SECOND[category];
  return Number.isFinite(speed) && Number.isFinite(tileSize) ? speed * tileSize : 0;
}
