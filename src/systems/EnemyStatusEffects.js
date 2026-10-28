const DAMAGE_OVER_TIME_TYPES = new Set(['fire', 'acid', 'poison', 'bleed']);
const REFRESH_TYPES = new Set(['bleed', 'poison', 'exposed', 'vulnerable', 'marked', 'weakened']);

export function hasActiveStun(statusEffects = []) {
  return statusEffects.some(effect => effect.type === 'stun');
}

export function extendEnemyStatusEffect(effect, endTime) {
  const oldEndTime = Number(effect.endTime) || 0;
  const extendedEndTime = Math.max(oldEndTime, Number(endTime) || 0);
  const extraTicks = DAMAGE_OVER_TIME_TYPES.has(effect.type)
    ? Math.max(0, Math.ceil((extendedEndTime - oldEndTime) / 1000)) : 0;
  effect.endTime = extendedEndTime;
  if (extraTicks) effect.tickCount = Math.max(0, Number(effect.tickCount) || 0) + extraTicks;
  return effect;
}

export function applyEnemyStatusEffect(enemy, source, now = Number(enemy.scene?.gameTime ?? 0)) {
  const effect = { ...source };
  if (effect.type === 'marked') effect.damageTakenMultiplier ??= 0.15;
  if (effect.type === 'vulnerable') effect.damageTakenMultiplier ??= 0.15;
  if (effect.type === 'weakened') effect.damageTakenMultiplier ??= 0.15;
  if (effect.type === 'exposed') {
    effect.criticalChanceBonus ??= effect.damageTakenMultiplier ?? 0;
    effect.duration = Number(effect.duration) > 0 ? Number(effect.duration) : 5000;
  }
  if (effect.type === 'vulnerable' || effect.type === 'marked' || effect.type === 'weakened') {
    effect.duration = Number(effect.duration) > 0 ? Number(effect.duration) : 5000;
  }
  if (DAMAGE_OVER_TIME_TYPES.has(effect.type)) {
    effect.duration = Number(effect.duration) > 0 ? Number(effect.duration) : 5000;
    effect.duration = Math.ceil(effect.duration / 1000) * 1000;
    effect.interval = 1000;
    effect.totalDamage ??= Number(effect.value || 0) * 5;
    if (effect.type === 'bleed' && !effect.armorApplied) {
      effect.totalDamage = Math.max(0, Number(effect.totalDamage) - Number(enemy.armor || 0));
      effect.armorApplied = true;
    }
    effect.tickDamage = Number(effect.totalDamage) / 5;
    effect.tickCount = Math.max(1, Math.ceil(effect.duration / 1000));
    effect.nextTick = now + 1000;
    effect.endTime = now + effect.duration;
  } else {
    effect.endTime = now + Math.max(0, Number(effect.duration) || 0);
  }

  const existing = (enemy.statusEffects || []).filter(active => active.type === effect.type);
  if (REFRESH_TYPES.has(effect.type)) {
    if (existing.length) {
      const current = existing[0];
      const oldEndTime = Number(current.endTime) || now;
      current.endTime = now + effect.duration;
      current.duration = effect.duration;
      if (DAMAGE_OVER_TIME_TYPES.has(effect.type)) {
        const extraTicks = Math.max(0, Math.ceil((current.endTime - oldEndTime) / 1000));
        current.tickCount = Math.max(0, Number(current.tickCount) || 0) + extraTicks;
        current.endTime = Math.max(current.endTime, Number(current.nextTick) + Math.max(0, current.tickCount - 1) * 1000);
        current.tickDamage ??= Number(current.totalDamage || 0) / 5;
        // Refreshing never recalculates a snapshot; keep the original tick value.
        current.totalDamage = current.tickDamage * 5;
      }
      return current;
    }
  }
  enemy.statusEffects ??= [];
  enemy.statusEffects.push(effect);
  return effect;
}

export function updateEnemyStatusEffects(enemy, time) {
  const activeEffects = [];
  for (const effect of enemy.statusEffects || []) {
    if (DAMAGE_OVER_TIME_TYPES.has(effect.type)) {
      effect.interval = 1000;
      effect.tickDamage ??= Number(effect.totalDamage !== undefined
        ? effect.totalDamage / 5 : Number(effect.value || 0));
      effect.tickCount ??= Math.max(1, Math.ceil(Number(effect.duration || 5000) / 1000));
      effect.nextTick ??= Number(effect.endTime || time) - Number(effect.duration || 5000) + 1000;
      while (effect.tickCount > 0 && effect.nextTick <= time && effect.nextTick <= effect.endTime) {
        if (enemy.isDying || enemy.isDead?.()) break;
        const weakened = (enemy.statusEffects || []).find(active => active.type === 'weakened' && active.endTime > effect.nextTick);
        const multiplier = weakened ? 1 + Math.max(0, Number(weakened.damageTakenMultiplier ?? weakened.damageMultiplier ?? 0.15)) : 1;
        const damage = Math.max(1, effect.tickDamage * multiplier);
        enemy.takeDamage(damage, effect.sourceTower);
        effect.tickCount -= 1;
        effect.nextTick += 1000;
      }
      if (enemy.isDying || enemy.isDead?.()) continue;
      if (effect.tickCount <= 0 || effect.endTime < time && effect.nextTick > effect.endTime) continue;
    } else if (effect.endTime <= time) continue;
    activeEffects.push(effect);
  }
  enemy.statusEffects = activeEffects;
  if (!enemy.statusEffects.some(effect => effect.type === 'slow')) enemy.sprite?.clearTint?.();
}
