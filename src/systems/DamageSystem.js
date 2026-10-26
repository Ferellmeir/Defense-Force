import { withTileChanceBonus } from './combatChance.js';
import { TILE_EFFECTS } from './tileEffects.js';

const DAMAGE_TYPES = {
  physical: 'Physical',
  energy: 'Energy',
  acid: 'Acid',
  fire: 'Fire',
};

export function applyDamage(enemy, attack) {
  const type = DAMAGE_TYPES[String(attack.damageType || '').toLowerCase()] || 'Physical';
  // Workbook weapon penetration values are percentage fractions (for example,
  // 0.25 is displayed as 25%), matching the unit and weapon critical chances.
  let penetration = Math.min(1, Math.max(0, Number(attack.armorPenetration) || 0));
  const properties = attack.specialProperties || [];
  const armorIgnore = properties.find(property => property.property === 'armorIgnoreChance');
  if (armorIgnore && Math.random() < withTileChanceBonus(armorIgnore.value, attack)) {
    penetration = 1 - (1 - penetration) * (1 - Number(armorIgnore.amount || 0));
  }
  const effectiveArmor = Math.max(0, (enemy.armor || 0) * (1 - penetration));
  const marked = (enemy.statusEffects || []).find(effect => effect.type === 'marked' || effect.type === 'exposed');
  const markedMultiplier = marked ? 1 + Number(marked.damageTakenMultiplier || 0) : 1;
  const vulnerability = (enemy.data.vulnerabilities?.[type] || 1) * markedMultiplier;
  let damage = Math.max(0, Number(attack.damage) || 0);
  const firstHit = properties.find(property => property.property === 'firstHitDamage');
  if (firstHit && attack.sourceTower && !attack.sourceTower.firstHitTargets?.has(enemy)) {
    damage *= 1 + Number(firstHit.value || 0);
    attack.sourceTower.firstHitTargets?.add(enemy);
  }
  const postArmorDamage = type === 'Energy'
    ? damage * Math.max(0, 1 - effectiveArmor / 100)
    : Math.max(0, damage - effectiveArmor);
  const vulnerableDamage = postArmorDamage * vulnerability;
  const criticalChance = withTileChanceBonus((Number(attack.criticalChance) || 0)
    + (Number(attack.sourceTower?.nextCritChanceBonus) || 0), attack);
  const criticalModifier = Number(attack.criticalModifier) || 1;
  const isCritical = criticalChance > 0 && Math.random() < criticalChance;
  const critChain = properties.find(property => property.property === 'nextCritChance');
  if (attack.sourceTower) {
    attack.sourceTower.nextCritChanceBonus = isCritical
      ? (Number(attack.sourceTower.nextCritChanceBonus) || 0) + Number(critChain?.value || 0)
      : 0;
    const nextPenetration = properties.find(property => property.property === 'nextAttackPenetration');
    if (isCritical && nextPenetration) attack.sourceTower.nextAttackPenetrationBonus = Number(nextPenetration.value || 0);
    else if (Number(attack.sourceTower.nextAttackPenetrationBonus) > 0) attack.sourceTower.nextAttackPenetrationBonus = 0;
  }
  const amount = Math.max(1, isCritical ? vulnerableDamage * criticalModifier : vulnerableDamage);

  if (isCritical && attack.sourceTower) {
    const critBoost = properties.find(property => property.property === 'critDamageBoost');
    if (critBoost) attack.sourceTower.critDamageBoostUntil = Number(attack.sourceTower.scene?.gameTime || 0) + Number(critBoost.duration || 0);
  }

  enemy.takeDamage(amount, attack.sourceTower);
  if (enemy.health > 0 && attack.attackType === 'melee' && attack.sourceTower) {
    const meleeStun = properties.find(property => property.property === 'meleeStunChance');
    const darkAlleyBonus = attack.specialTileType === 'dark_alley'
      ? TILE_EFFECTS.dark_alley.meleeStunChance : 0;
    if ((meleeStun || darkAlleyBonus) && Math.random() < withTileChanceBonus(Number(meleeStun?.value || 0) + darkAlleyBonus, attack)) {
      enemy.applyStatusEffect({ type: 'stun', duration: attack.specialTileType === 'dark_alley'
        ? TILE_EFFECTS.dark_alley.stunDurationMs : Number(meleeStun.duration || 0) });
    }
    const meleeBleed = properties.find(property => property.property === 'meleeBleedChance');
    if (meleeBleed && Math.random() < withTileChanceBonus(meleeBleed.value || meleeBleed.chance, attack)) {
      enemy.applyStatusEffect({
        type: 'bleed',
        totalDamage: Math.max(0, enemy.health) * Number(meleeBleed.healthFraction || 0),
        duration: Number(meleeBleed.duration || 0),
        interval: 500,
        sourceTower: attack.sourceTower,
      });
    }
  }
  const energyStun = properties.find(property => property.property === 'energyStunChance');
  if (enemy.health > 0 && type === 'Energy' && energyStun
    && Math.random() < withTileChanceBonus(energyStun.value, attack)) {
    enemy.applyStatusEffect({ type: 'stun', duration: Number(energyStun.duration || 0) });
  }
  if (enemy.health > 0 && attack.sourceTower
    && properties.some(property => property.property === 'forceBonusForSurvivingTargets')) {
    if (!enemy.forceBonusTowers) enemy.forceBonusTowers = new Set();
    enemy.forceBonusTowers.add(attack.sourceTower);
  }

  const expose = properties.find(property => property.property === 'exposeChance');
  if (enemy.health > 0 && expose && Math.random() < withTileChanceBonus(expose.value, attack)) {
    enemy.applyStatusEffect({ type: 'exposed', damageTakenMultiplier: Number(expose.damageTaken || 0), duration: Number(expose.duration || 0) });
  }
  const slow = properties.find(property => property.property === 'slowChance');
  if (enemy.health > 0 && slow && Math.random() < withTileChanceBonus(slow.value, attack)) {
    enemy.applySlowEffect(Number(slow.factor || 0.65), Number(slow.duration || 5000));
  }
  const bleed = properties.find(property => property.property === 'bleedChance');
  if (enemy.health > 0 && bleed && Math.random() < withTileChanceBonus(bleed.value, attack)) {
    enemy.applyStatusEffect({ type: 'bleed', totalDamage: Math.max(0, enemy.health) * Number(bleed.healthFraction || 0.1), duration: Number(bleed.duration || 5000), interval: 500, sourceTower: attack.sourceTower });
  }

  if (type === 'Acid') {
    const acidMultiplier = properties.some(property => property.property === 'doubleAcidEffects') ? 2 : 1;
    enemy.armor = Math.max(0, (enemy.armor || 0) - amount / 100 * 0.5 * acidMultiplier);
  }

  const armorReduction = properties.find(property => property.property === 'reduceArmor');
  if (armorReduction) enemy.armor = Math.max(0, (enemy.armor || 0) - Number(armorReduction.amount || 0));

  if (type === 'Fire') {
    const criticalDot = properties.some(property => property.property === 'criticalFireDot') && isCritical;
    const doubleDot = properties.find(property => property.property === 'doubleFireDotChance');
    const dotMultiplier = doubleDot && Math.random() < withTileChanceBonus(doubleDot.value, attack) ? 2 : 1;
    const fireEffect = {
      type: 'fire',
      totalDamage: amount * 0.15 * (criticalDot ? criticalModifier : 1) * dotMultiplier
        * (attack.specialTileType === 'thermal_enhancement' ? TILE_EFFECTS.thermal_enhancement.fireDamageMultiplier : 1),
      duration: 5000 * (Number(attack.statusDuration) || 1),
      interval: 500,
      sourceTower: attack.sourceTower,
    };
    const refreshChance = properties.find(property => property.property === 'refreshStatusChance');
    if (refreshChance && Math.random() < withTileChanceBonus(refreshChance.value, attack)) {
      const existing = enemy.statusEffects?.filter(effect => effect.type === 'fire') || [];
      const now = Number(attack.sourceTower?.scene?.gameTime ?? 0);
      existing.forEach(effect => { effect.endTime = now + fireEffect.duration; });
      if (!existing.length) enemy.applyStatusEffect(fireEffect);
    } else enemy.applyStatusEffect(fireEffect);
    const fireSlow = properties.find(property => property.property === 'fireDotSlow');
    if (fireSlow) enemy.applySlowEffect(1 - Number(fireSlow.value || 0), fireEffect.duration);
    const spread = properties.find(property => property.property === 'spreadFireDotOnCrit');
    if (spread && isCritical && attack.sourceTower?.scene?.enemyManager) {
      const tileSize = attack.sourceTower.scene.mapManager?.getCurrentMap?.()?.tileSize || 0;
      const spreadRadius = Number(spread.range || 0) * tileSize;
      attack.sourceTower.scene.enemyManager.getAll().forEach(nearby => {
        if (nearby === enemy || nearby.isDead?.()) return;
        const distance = Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y);
        if (distance <= spreadRadius) nearby.applyStatusEffect({
          type: 'fire', totalDamage: amount * 0.15 * (criticalDot ? criticalModifier : 1),
          duration: 5000 * (Number(attack.statusDuration) || 1), interval: 500,
          sourceTower: attack.sourceTower,
        });
      });
    }
  }
  const refreshChance = properties.find(property => property.property === 'refreshStatusChance');
  (attack.statusEffects || []).filter(effect => effect.type !== 'fire').forEach(sourceEffect => {
    const effect = { ...sourceEffect };
    if (effect.type === 'poison') {
      effect.duration = Number(effect.duration || 5000);
      effect.interval = Number(effect.interval || 1000);
      effect.totalDamage = Number(effect.totalDamage
        ?? ((Number(enemy.maxHealth) || 0) * Number(effect.maxHealthFraction ?? 0.05)));
    }
    if (refreshChance && Math.random() < withTileChanceBonus(refreshChance.value, attack)) {
      const existing = enemy.statusEffects?.filter(active => active.type === effect.type) || [];
      const now = Number(attack.sourceTower?.scene?.gameTime ?? 0);
      existing.forEach(active => { active.endTime = now + Number(effect.duration || 0); });
      if (!existing.length) enemy.applyStatusEffect(effect);
    } else enemy.applyStatusEffect(effect);
  });
  const toxinChance = withTileChanceBonus(attack.specialTileType === 'toxin_synthesizers'
    ? TILE_EFFECTS.toxin_synthesizers.poisonChance : 0, attack);
  if (enemy.health > 0 && toxinChance > 0 && Math.random() < toxinChance) {
    enemy.applyStatusEffect({ type: 'poison', duration: 5000, interval: 1000, totalDamage: Number(enemy.maxHealth || 0) * 0.05, sourceTower: attack.sourceTower });
  }
  return { amount, isCritical, effectiveArmor };
}

