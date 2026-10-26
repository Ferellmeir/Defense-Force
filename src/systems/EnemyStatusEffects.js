const DAMAGE_OVER_TIME_TYPES = ['fire', 'acid', 'poison', 'bleed'];

export function hasActiveStun(statusEffects = []) {
  return statusEffects.some(effect => effect.type === 'stun');
}

export function updateEnemyStatusEffects(enemy, time) {
  const activeEffects = [];
  for (const effect of enemy.statusEffects) {
    if (effect.endTime <= time) continue;
    const interval = effect.interval || 500;
    if (DAMAGE_OVER_TIME_TYPES.includes(effect.type) && time >= effect.nextTick) {
      const tickDamage = effect.totalDamage !== undefined
        ? effect.totalDamage / Math.ceil(effect.duration / interval)
        : effect.value || 0;
      enemy.takeDamage(tickDamage, effect.sourceTower);
      effect.nextTick = time + interval;
    }
    activeEffects.push(effect);
  }
  enemy.statusEffects = activeEffects;
  if (!enemy.statusEffects.some(effect => effect.type === 'slow')) enemy.sprite.clearTint();
}
