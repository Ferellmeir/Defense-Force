export function isAmmoConfigurationMissing(magazine) {
  return Boolean(magazine?.requiresAmmo && !magazine.isConfigured);
}

export default class AmmoMagazine {
  constructor(ammoDefinition = {}, reloadDuration, hasReloadDuration = false) {
    this.requiresAmmo = ammoDefinition.requiresAmmo === true;
    const capacity = Number(ammoDefinition.magazineCapacity ?? ammoDefinition.capacity);
    this.capacity = Number.isInteger(capacity) && capacity > 0 ? capacity : 0;
    this.reloadDuration = Number(reloadDuration);
    this.isConfigured = !this.requiresAmmo || (
      this.capacity > 0
      && hasReloadDuration
      && Number.isFinite(this.reloadDuration)
      && this.reloadDuration > 0
    );
    this.ammoRemaining = this.requiresAmmo
      ? (this.isConfigured ? this.capacity : 0)
      : Infinity;
    this.reloadUntil = 0;
  }

  canFire(time) {
    if (!this.requiresAmmo) return true;
    if (!this.isConfigured || this.ammoRemaining <= 0) return false;
    return !this.reloadUntil || time >= this.reloadUntil;
  }

  consumeShot(time) {
    if (!this.canFire(time)) return false;
    if (!this.requiresAmmo) return true;

    this.ammoRemaining -= 1;
    if (this.ammoRemaining === 0) this.reloadUntil = time + this.reloadDuration;
    return true;
  }

  update(time) {
    if (this.requiresAmmo && this.isConfigured && this.reloadUntil && time >= this.reloadUntil) {
      this.ammoRemaining = this.capacity;
      this.reloadUntil = 0;
    }
  }

  getReloadRemaining(time) {
    return Math.max(0, this.reloadUntil - time);
  }
}
