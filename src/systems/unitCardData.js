import { getUnitCombatBonuses } from './UnitCombatBonuses.js';

export function getUnitCardCombatProfiles(tower, time = 0, deployedCount = 1) {
  const bonuses = getUnitCombatBonuses({
    specialProperties: tower.towerData.specialProperties || [],
    weaponAttacks: tower.towerData.weaponAttacks || [],
    deployedCount,
  });
  return (tower.weaponAttackStates || []).map((state, index) => {
    const profile = state.profile;
    const weapon = tower.equipment?.weapons?.find(item => item?.id === profile.weaponId);
    const magazine = state.ammoMagazine;
    return {
      name: weapon?.name || (String(profile.weaponId || '').startsWith('inherent-') ? 'Inherent attack' : `Attack ${index + 1}`),
      damageType: profile.damageType || 'Physical',
      attackType: profile.attackType || 'attack',
      damage: Number(profile.damage) || 0,
      interval: tower.getEffectiveAttackInterval(state, time),
      range: tower.getEffectiveAttackRange(state),
      criticalChance: Number(profile.criticalChance || 0) + bonuses.criticalChanceBonus,
      criticalModifier: Number(profile.criticalModifier) || 1,
      armorPenetration: Number(profile.armorPenetration) || 0,
      reload: Number.isFinite(Number(profile.reloadSpeed)) ? Number(profile.reloadSpeed) : null,
      ammoRemaining: Number.isFinite(magazine?.ammoRemaining) ? magazine.ammoRemaining : null,
      ammoCapacity: Number.isFinite(magazine?.capacity) ? magazine.capacity : null,
      unlimitedAmmo: magazine?.capacity === Infinity,
      aoeRadius: Number(profile.aoeRadius) || 0,
      statusEffects: (profile.statusEffects || []).map(effect => effect.type).filter(Boolean),
    };
  });
}

export function getActiveUnitCombatEffects(tower, time = 0) {
  const effects = [];
  const properties = tower.towerData.specialProperties || [];
  const activeProperty = (name, until) => properties.find(item => item.property === name) && Number(until || 0) > time;
  const remaining = until => Math.max(0, (Number(until) - time) / 1000);
  const stimpack = properties.find(item => item.property === 'waveStartAttackSpeedBoost');
  if (stimpack && activeProperty('waveStartAttackSpeedBoost', tower.stimpackActiveUntil)) {
    effects.push({ label: `Attack speed +${Number(stimpack.value || 0) * 100}%`, remaining: remaining(tower.stimpackActiveUntil) });
  }
  const critBoost = properties.find(item => item.property === 'critDamageBoost');
  if (critBoost && activeProperty('critDamageBoost', tower.critDamageBoostUntil)) {
    effects.push({ label: `Critical damage +${Number(critBoost.value || 0) * 100}%`, remaining: remaining(tower.critDamageBoostUntil) });
  }
  const exposed = properties.find(item => item.property === 'exposedHitAttackSpeedBoost');
  if (exposed && activeProperty('exposedHitAttackSpeedBoost', tower.exposedHitAttackSpeedUntil)) {
    effects.push({ label: `Attack speed +${Number(exposed.value || 0) * 100}%`, remaining: remaining(tower.exposedHitAttackSpeedUntil) });
  }
  if (Number(tower.allyDamageBuffUntil || 0) > time) {
    effects.push({ label: `Adjacent ally damage +${Number(tower.allyDamageBuffValue || 0) * 100}%`, remaining: remaining(tower.allyDamageBuffUntil) });
  }
  const tile = tower.placementTile?.specialType;
  if (tile === 'damage_boost') effects.push({ label: 'Damage boost tile: +25% damage' });
  if (tile === 'tactical_indoctrination') effects.push({ label: 'Tactical tile: faster attacks' });
  if (tile === 'snipers_nest') effects.push({ label: 'Sniper nest: extra range and distance damage' });
  return effects;
}

export function getUnitCardEquipment(tower, manager) {
  const equipped = tower.towerData.equipped || {};
  const weapons = tower.equipment?.weapons || [];
  return [
    { slot: 'Left hand', item: weapons.find(item => item?.id === equipped.left) || null },
    { slot: 'Right hand', item: weapons.find(item => item?.id === equipped.right) || null },
    { slot: 'Utility', item: tower.equipment?.utility || null },
    ...(tower.towerData.augments || []).map(id => ({ slot: 'Augment', item: manager.getItemDefinition(id) })).filter(row => row.item),
  ];
}

export function getUnitCardUpgradeColumns(pathTiers = []) {
  return [...pathTiers].sort((first, second) => Number(first.tier) - Number(second.tier));
}
