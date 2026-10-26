export function getUnitCombatBonuses({ specialProperties = [], weaponAttacks = [], deployedCount = 1 }) {
  const unitCountDamage = specialProperties.find(property => property.property === 'unitCountDamage');
  const mixedWeaponCrit = specialProperties.find(property => property.property === 'mixedWeaponCritChance');
  const carriesMelee = weaponAttacks.some(profile => profile.attackType === 'melee');
  const carriesRanged = weaponAttacks.some(profile => profile.attackType === 'ranged');
  return {
    damageMultiplier: unitCountDamage
      ? 1 + Math.max(0, Number(deployedCount) || 0) * Number(unitCountDamage.value || 0)
      : 1,
    criticalChanceBonus: mixedWeaponCrit && carriesMelee && carriesRanged
      ? Number(mixedWeaponCrit.value || 0)
      : 0,
  };
}
