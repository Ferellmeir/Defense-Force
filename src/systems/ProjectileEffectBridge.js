const VISUAL_TYPES = new Set(['physical', 'energy', 'fire', 'acid', 'melee', 'ranged', 'aoe', 'slow']);

export function getProjectileEffectType(projectileData = {}) {
  const damageType = String(projectileData.damageType || '').toLowerCase();
  if (VISUAL_TYPES.has(damageType)) return damageType;
  const attackType = String(projectileData.attackType || '').toLowerCase();
  if (VISUAL_TYPES.has(attackType)) return attackType;
  const towerType = String(projectileData.type || '').toLowerCase();
  if (VISUAL_TYPES.has(towerType)) return towerType;
  return 'basic';
}

export function spawnProjectileHitEffect(effectSpawner, x, y, projectileData) {
  effectSpawner.createHitEffect(x, y, getProjectileEffectType(projectileData));
}

export function spawnProjectileExplosionEffect(effectSpawner, x, y, radius, projectileData) {
  effectSpawner.createExplosionEffect(x, y, radius, getProjectileEffectType(projectileData));
}
