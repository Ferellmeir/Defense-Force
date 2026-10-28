import { withTileChanceBonus } from './combatChance.js';
import { TILE_EFFECTS } from './tileEffects.js';
import { getCurrentMissionRestrictions, isDebuffBanned } from './missionRestrictions.js';
import { applyEnemyStatusEffect, extendEnemyStatusEffect } from './EnemyStatusEffects.js';

function isMissionDebuffBanned(attack, type) {
  return isDebuffBanned(type, getCurrentMissionRestrictions(attack.sourceTower?.scene?.registry));
}

function applyStatus(enemy, effect, now) {
  if (typeof enemy.applyStatusEffect === 'function') enemy.applyStatusEffect(effect);
  else applyEnemyStatusEffect(enemy, effect, now);
}

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
  const poisonMultiplier = properties.some(property => property.property === 'doublePoisonEffects') ? 2 : 1;
  const combineProc = name => {
    const matching = properties.filter(property => property.property === name);
    if (!matching.length) return null;
    return matching.reduce((combined, property) => ({
      ...combined,
      ...property,
      value: matching.reduce((total, item) => total + Number(item.value || 0), 0),
      damageTaken: Math.max(...matching.map(item => Number(item.damageTaken || 0))),
      damageTakenMultiplier: Math.max(...matching.map(item => Number(item.damageTakenMultiplier || 0))),
      criticalChanceBonus: Math.max(...matching.map(item => Number(item.criticalChanceBonus || 0))),
      duration: Math.max(...matching.map(item => Number(item.duration || 0))),
    }), {});
  };
  const armorIgnore = properties.find(property => property.property === 'armorIgnoreChance');
  if (armorIgnore && Math.random() < withTileChanceBonus(armorIgnore.value, attack)) {
    penetration = 1 - (1 - penetration) * (1 - Number(armorIgnore.amount || 0));
  }
  const effectiveArmor = Math.max(0, (enemy.armor || 0) * (1 - penetration));
  const now = Number(attack.sourceTower?.scene?.gameTime ?? 0);
  const marked = (enemy.statusEffects || []).find(effect => ['marked', 'vulnerable'].includes(effect.type) && (effect.endTime === undefined || effect.endTime > now));
  const markedMultiplier = marked ? 1 + Number(marked.damageTakenMultiplier || 0) : 1;
  const vulnerability = (enemy.data.vulnerabilities?.[type] || 1) * markedMultiplier;
  let damage = Math.max(0, Number(attack.damage) || 0);
  const deterministicMissingHealthBonus = properties.find(property => property.property === 'missingHealthDamage');
  const statusStackDamage = properties.find(property => property.property === 'statusStackDamage');
  if (statusStackDamage) {
    damage *= 1 + (enemy.statusEffects || []).length * Number(statusStackDamage.value || 0);
  }
  if (deterministicMissingHealthBonus && attack.primaryTarget === enemy) {
    const missingHealthPercent = Math.max(0, 1 - enemy.health / Math.max(1, enemy.maxHealth)) * 100;
    damage *= 1 + missingHealthPercent * Number(deterministicMissingHealthBonus.perMissingHealthPercent || 0);
  }
  const missingHealthBonus = attack.missingHealthDamageChance;
  if (missingHealthBonus && attack.primaryTarget === enemy
    && Math.random() < withTileChanceBonus(missingHealthBonus.value, attack)) {
    const missingHealthPercent = Math.max(0, 1 - enemy.health / Math.max(1, enemy.maxHealth)) * 100;
    damage *= 1 + missingHealthPercent * Number(missingHealthBonus.perMissingHealthPercent || 0);
  }
  const firstHit = properties.find(property => property.property === 'firstHitDamage');
  if (firstHit && attack.sourceTower && !attack.sourceTower.firstHitTargets?.has(enemy)) {
    damage *= 1 + Number(firstHit.value || 0);
    attack.sourceTower.firstHitTargets?.add(enemy);
  }
  const postArmorDamage = type === 'Energy'
    ? damage * Math.max(0, 1 - effectiveArmor / 100)
    : Math.max(0, damage - effectiveArmor);
  const vulnerableDamage = postArmorDamage * vulnerability;
  const exposed = (enemy.statusEffects || []).find(effect => effect.type === 'exposed' && (effect.endTime === undefined || effect.endTime > now));
  const criticalChance = withTileChanceBonus((Number(attack.criticalChance) || 0)
    + (Number(attack.sourceTower?.nextCritChanceBonus) || 0)
    + Number(exposed?.criticalChanceBonus ?? exposed?.damageTakenMultiplier ?? 0), attack);
  const criticalModifier = Number(attack.criticalModifier) || 1;
  const isCritical = criticalChance > 0 && Math.random() < criticalChance;
  const exposedCritBonus = properties.find(property => property.property === 'exposedCriticalDamageBonus');
  const exposedCritMultiplier = isCritical && exposedCritBonus && exposed
    ? 1 + Number(exposedCritBonus.value || 0) : 1;
  const critChain = properties.find(property => property.property === 'nextCritChance');
  if (attack.sourceTower) {
    attack.sourceTower.nextCritChanceBonus = isCritical
      ? (Number(attack.sourceTower.nextCritChanceBonus) || 0) + Number(critChain?.value || 0)
      : 0;
    const nextPenetration = properties.find(property => property.property === 'nextAttackPenetration');
    if (isCritical && nextPenetration) attack.sourceTower.nextAttackPenetrationBonus = Number(nextPenetration.value || 0);
    else if (Number(attack.sourceTower.nextAttackPenetrationBonus) > 0) attack.sourceTower.nextAttackPenetrationBonus = 0;
  }
  const singleWeaponCrit = properties.find(property => property.property === 'singleOneHandedCritBonus');
  const amount = Math.max(1, (isCritical ? vulnerableDamage * (criticalModifier + Number(singleWeaponCrit?.value || 0)) : vulnerableDamage)
    * exposedCritMultiplier);

  if (isCritical && attack.sourceTower) {
    const critBoost = properties.find(property => property.property === 'critDamageBoost');
    if (critBoost) attack.sourceTower.critDamageBoostUntil = Number(attack.sourceTower.scene?.gameTime || 0) + Number(critBoost.duration || 0);
  }

  enemy.takeDamage(amount, attack.sourceTower);
  let chanceEffectApplied = false;
  if (enemy.health > 0 && attack.sourceTower && exposed) {
    const speedBoost = properties.find(property => property.property === 'exposedHitAttackSpeedBoost');
    if (speedBoost) attack.sourceTower.exposedHitAttackSpeedUntil = Number(attack.sourceTower.scene?.gameTime || 0) + Number(speedBoost.duration || 0);
  }
  if (enemy.health > 0 && attack.attackType === 'melee' && attack.sourceTower) {
    const meleeStun = combineProc('meleeStunChance');
    const darkAlleyBonus = attack.specialTileType === 'dark_alley'
      ? TILE_EFFECTS.dark_alley.meleeStunChance : 0;
    if (!isMissionDebuffBanned(attack, 'stun') && (meleeStun || darkAlleyBonus) && Math.random() < withTileChanceBonus(Number(meleeStun?.value || 0) + darkAlleyBonus, attack)) {
      enemy.applyStatusEffect({ type: 'stun', duration: attack.specialTileType === 'dark_alley'
        ? TILE_EFFECTS.dark_alley.stunDurationMs : Number(meleeStun.duration || 0) });
      chanceEffectApplied = true;
    }
    const meleeBleed = combineProc('meleeBleedChance');
    if (!isMissionDebuffBanned(attack, 'bleed') && meleeBleed && Math.random() < withTileChanceBonus(meleeBleed.value || meleeBleed.chance, attack)) {
      const durationBonus = combineProc('bleedDurationBonus');
      applyStatus(enemy, {
        type: 'bleed',
        totalDamage: Math.max(0, Math.max(0, enemy.health) * Number(meleeBleed.healthFraction ?? 0.1) - effectiveArmor),
        armorApplied: true,
        duration: Number(meleeBleed.duration || 5000) + Number(durationBonus?.value || 0),
        interval: 1000,
        sourceTower: attack.sourceTower,
      }, now);
      chanceEffectApplied = true;
    }
  }
  const energyStun = combineProc('energyStunChance');
  if (enemy.health > 0 && type === 'Energy' && !isMissionDebuffBanned(attack, 'stun') && energyStun
    && Math.random() < withTileChanceBonus(energyStun.value, attack)) {
    enemy.applyStatusEffect({ type: 'stun', duration: Number(energyStun.duration || 0) });
    chanceEffectApplied = true;
  }
  if (enemy.health > 0 && attack.sourceTower
    && properties.some(property => property.property === 'forceBonusForSurvivingTargets')) {
    if (!enemy.forceBonusTowers) enemy.forceBonusTowers = new Set();
    enemy.forceBonusTowers.add(attack.sourceTower);
  }

  const expose = combineProc('exposeChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'exposed') && expose && Math.random() < withTileChanceBonus(expose.value, attack)) {
    applyStatus(enemy, { type: 'exposed', criticalChanceBonus: Number(expose.criticalChanceBonus ?? expose.damageTaken ?? 0), duration: Number(expose.duration || 5000) }, now);
    chanceEffectApplied = true;
  }
  const slow = combineProc('slowChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'slow') && slow && Math.random() < withTileChanceBonus(slow.value, attack)) {
    enemy.applySlowEffect(Number(slow.factor || 0.65), Number(slow.duration || 5000));
    chanceEffectApplied = true;
  }
  const bleed = combineProc('bleedChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'bleed') && bleed && Math.random() < withTileChanceBonus(bleed.value, attack)) {
    const durationBonus = combineProc('bleedDurationBonus');
    applyStatus(enemy, { type: 'bleed', totalDamage: Math.max(0, Math.max(0, enemy.health) * Number(bleed.healthFraction ?? 0.1) - effectiveArmor), armorApplied: true, duration: Number(bleed.duration || 5000) + Number(durationBonus?.value || 0), interval: 1000, sourceTower: attack.sourceTower }, now);
    chanceEffectApplied = true;
  }

  const poison = combineProc('poisonChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'poison') && poison
    && Math.random() < withTileChanceBonus(poison.value, attack)) {
    applyStatus(enemy, { type: 'poison', duration: Number(poison.duration || 5000),
      totalDamage: Number(enemy.maxHealth || 0) * Number(poison.maxHealthFraction ?? 0.05) * poisonMultiplier, sourceTower: attack.sourceTower }, now);
    chanceEffectApplied = true;
  }
  const vulnerable = combineProc('vulnerableChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'marked') && vulnerable
    && Math.random() < withTileChanceBonus(vulnerable.value, attack)) {
    applyStatus(enemy, { type: 'vulnerable', damageTakenMultiplier: Number(vulnerable.damageTaken ?? 0.15), duration: Number(vulnerable.duration || 5000) }, now);
    chanceEffectApplied = true;
  }
  const weakened = combineProc('weakenedChance');
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'weakened') && weakened
    && Math.random() < withTileChanceBonus(weakened.value, attack)) {
    applyStatus(enemy, {
      type: 'weakened',
      damageTakenMultiplier: Number(weakened.damageTakenMultiplier || 0.15),
      duration: Number(weakened.duration || 5000),
    }, now);
    chanceEffectApplied = true;
  }

  if (type === 'Acid') {
    const acidMultiplier = properties.some(property => property.property === 'doubleAcidEffects') ? 2 : 1;
    enemy.armor = Math.max(0, (enemy.armor || 0) - amount / 100 * 0.5 * acidMultiplier);
  }

  const armorReduction = properties.find(property => property.property === 'reduceArmor');
  if (armorReduction) enemy.armor = Math.max(0, (enemy.armor || 0) - Number(armorReduction.amount || 0));

  if (type === 'Fire' && enemy.health > 0 && !enemy.isDying) {
    const criticalDot = properties.some(property => property.property === 'criticalFireDot') && isCritical;
    const doubleDot = properties.find(property => property.property === 'doubleFireDotChance');
    const dotMultiplier = doubleDot && Math.random() < withTileChanceBonus(doubleDot.value, attack) ? 2 : 1;
    const fireEffect = {
      type: 'fire',
      totalDamage: amount * Number(attack.fireDotFraction ?? 0.15) * (criticalDot ? criticalModifier : 1) * dotMultiplier
        * (attack.specialTileType === 'thermal_enhancement' ? TILE_EFFECTS.thermal_enhancement.fireDamageMultiplier : 1),
      duration: 5000 * (Number(attack.statusDuration) || 1),
      interval: 1000,
      sourceTower: attack.sourceTower,
    };
    const refreshChance = properties.find(property => property.property === 'refreshStatusChance');
    if (refreshChance && Math.random() < withTileChanceBonus(refreshChance.value, attack)) {
      (enemy.statusEffects || []).filter(effect => effect.type === 'fire').forEach(effect => extendEnemyStatusEffect(effect, now + fireEffect.duration));
    }
    applyStatus(enemy, fireEffect, now);
    const fireSlow = properties.find(property => property.property === 'fireDotSlow');
    if (fireSlow) enemy.applySlowEffect(1 - Number(fireSlow.value || 0), fireEffect.duration);
    const spread = properties.find(property => property.property === 'spreadFireDotOnCrit');
    if (spread && isCritical && attack.sourceTower?.scene?.enemyManager) {
      const tileSize = attack.sourceTower.scene.mapManager?.getCurrentMap?.()?.tileSize || 0;
      const spreadRadius = Number(spread.range || 0) * tileSize;
      attack.sourceTower.scene.enemyManager.getAll().forEach(nearby => {
        if (nearby === enemy || nearby.isDead?.()) return;
        const distance = Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y);
        if (distance <= spreadRadius) applyStatus(nearby, {
          type: 'fire', totalDamage: amount * 0.15 * (criticalDot ? criticalModifier : 1),
          duration: 5000 * (Number(attack.statusDuration) || 1),
          sourceTower: attack.sourceTower,
        }, now);
      });
    }
  }
  const refreshChance = properties.find(property => property.property === 'refreshStatusChance');
  (enemy.health > 0 && !enemy.isDying ? attack.statusEffects || [] : [])
    .filter(effect => effect.type !== 'fire' && !isMissionDebuffBanned(attack, effect.type)).forEach(sourceEffect => {
    const effect = { ...sourceEffect };
    if (effect.type === 'poison') {
      effect.duration = Number(effect.duration || 5000);
      effect.interval = 1000;
      effect.totalDamage = Number(effect.totalDamage
        ?? ((Number(enemy.maxHealth) || 0) * Number(effect.maxHealthFraction ?? 0.05)));
      effect.totalDamage *= poisonMultiplier;
    }
    applyEnemyStatusEffect(enemy, effect, now);
  });
  if (enemy.health > 0 && !enemy.isDying && properties.some(property => property.property === 'triggerStatusTicksOnHit')) {
    const tickTime = now;
    for (const effect of (enemy.statusEffects || []).filter(active => ['fire', 'acid', 'poison', 'bleed'].includes(active.type))) {
      if (enemy.health <= 0 || enemy.isDying) break;
      const tickDamage = Number(effect.tickDamage ?? (effect.totalDamage !== undefined ? effect.totalDamage / 5 : effect.value || 0));
      const weakened = (enemy.statusEffects || []).find(active => active.type === 'weakened' && (active.endTime === undefined || active.endTime > tickTime));
      enemy.takeDamage(Math.max(1, tickDamage * (weakened ? 1 + Number(weakened.damageTakenMultiplier ?? 0.15) : 1)), attack.sourceTower);
      effect.nextTick = Math.max(Number(effect.nextTick || 0), tickTime + 1000);
      effect.tickCount = Math.max(0, Number(effect.tickCount ?? 1) - 1);
    }
  }
  if (chanceEffectApplied && attack.sourceTower) attack.sourceTower.activateAdjacentAllyDamageBuff?.();
  const toxinChance = withTileChanceBonus(attack.specialTileType === 'toxin_synthesizers'
    ? TILE_EFFECTS.toxin_synthesizers.poisonChance : 0, attack);
  if (enemy.health > 0 && !isMissionDebuffBanned(attack, 'poison') && toxinChance > 0 && Math.random() < toxinChance) {
    applyStatus(enemy, { type: 'poison', duration: 5000, totalDamage: Number(enemy.maxHealth || 0) * 0.05 * poisonMultiplier, sourceTower: attack.sourceTower }, now);
  }
  return { amount, isCritical, effectiveArmor };
}

