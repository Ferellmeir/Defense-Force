export function prepareWeaponAttack(attackState, time, { freeAttack = false } = {}) {
  const magazine = attackState?.ammoMagazine;
  if (!magazine?.canFire(time)) return false;
  return freeAttack || magazine.consumeShot(time);
}

export function canReuseWeaponAttackState(previousState, profile) {
  if (!previousState) return false;
  const previousWeaponId = previousState.profile?.weaponId;
  const currentWeaponId = profile?.weaponId;
  // Profiles without a weapon ID are tied to their existing slot/index.
  if (!previousWeaponId && !currentWeaponId) return true;
  return previousWeaponId === currentWeaponId;
}
