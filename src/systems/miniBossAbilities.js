export const MINI_BOSS_ABILITIES = {
  SWARMER: { interval: 12000, radius: 5, duration: 5000 },
  ARMORER: { radius: 4, armor: 10 },
  GRAFTER: { interval: 3000, radius: 4, maxHeal: 500, duration: 3000 },
};

export function applySwarmSpeedBuff(speed, buffs, now) {
  if (!buffs) return speed;
  for (const [source, expiresAt] of buffs) {
    if (expiresAt <= now) buffs.delete(source);
  }
  return buffs.size > 0 ? speed * 2 : speed;
}

export function getNearbyEnemies(owner, radiusInTiles) {
  const tileSize = Number(owner.scene.mapManager?.getCurrentMap?.()?.tileSize) || 0;
  const radius = radiusInTiles * tileSize;
  return owner.scene.enemyManager.getAll().filter(enemy => enemy !== owner
    && !enemy.isDying && !enemy.reachedEnd
    && Math.hypot(enemy.x - owner.x, enemy.y - owner.y) <= radius);
}

export function activateSwarmer(owner, now) {
  for (const enemy of getNearbyEnemies(owner, owner.ability.radius)) {
    enemy.swarmSpeedBuffs ||= new Map();
    enemy.swarmSpeedBuffs.set(owner, now + owner.ability.duration);
  }
}

export function updateArmorAura(owner) {
  const current = new Set(getNearbyEnemies(owner, owner.ability.radius));
  for (const enemy of owner.armorAuraTargets) {
    if (!current.has(enemy) || enemy.isDying || enemy.scene !== owner.scene) {
      enemy.setArmorModifier?.(owner, null);
      owner.armorAuraTargets.delete(enemy);
    }
  }
  for (const enemy of current) {
    enemy.setArmorModifier?.(owner, owner.ability.armor);
    owner.armorAuraTargets.add(enemy);
  }
}

export function updateGrafting(owner, now) {
  for (const activation of owner.graftActivations) {
    if (now < activation.nextTickAt) continue;
    const target = activation.target;
    const installment = activation.tickIndex === 2
      ? activation.total - activation.applied
      : activation.total / 3;
    const actual = !target.isDying && !target.reachedEnd && target.scene === owner.scene
      ? Math.max(0, Math.min(installment, target.maxHealth - target.health)) : 0;
    if (actual > 0) {
      target.health += actual;
      target.updateHealthBar?.();
      activation.applied += actual;
      owner.takeDamage(actual, null);
    }
    activation.tickIndex += 1;
    activation.nextTickAt += 1000;
    if (owner.isDying) return;
  }
  owner.graftActivations = owner.graftActivations.filter(activation => activation.tickIndex < 3);
  if (now >= owner.nextAbilityAt) {
    for (const target of getNearbyEnemies(owner, owner.ability.radius)) {
      const missing = Math.max(0, target.maxHealth - target.health);
      const total = Math.min(owner.ability.maxHeal, missing);
      if (total > 0) owner.graftActivations.push({ target, total, applied: 0, tickIndex: 0, nextTickAt: now + 1000 });
    }
    owner.nextAbilityAt += owner.ability.interval;
    if (owner.nextAbilityAt <= now) owner.nextAbilityAt = now + owner.ability.interval;
  }
}

export function cleanupMiniBossAbilities(owner) {
  for (const enemy of owner.armorAuraTargets || []) enemy.setArmorModifier?.(owner, null);
  owner.armorAuraTargets?.clear();
  owner.graftActivations = [];
}
