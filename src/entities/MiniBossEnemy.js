import Enemy from './Enemy.js';
import {
  activateSwarmer,
  cleanupMiniBossAbilities,
  MINI_BOSS_ABILITIES,
  updateArmorAura,
  updateGrafting,
} from '../systems/miniBossAbilities.js';

export default class MiniBossEnemy extends Enemy {
  constructor(scene, x, y, type, data, path) {
    super(scene, x, y, type, data, path);
    this.ability = MINI_BOSS_ABILITIES[String(type).toUpperCase()];
    this.nextAbilityAt = Number(scene.gameTime) + (String(type).toUpperCase() === 'ARMORER' ? 0 : this.ability.interval);
    this.armorAuraTargets = new Set();
    this.graftActivations = [];
  }

  update(time, delta) {
    super.update(time, delta);
    if (this.isDying || this.reachedEnd) return;
    const now = Number(this.scene.gameTime) || 0;
    const kind = String(this.type).toUpperCase();
    if (kind === 'SWARMER' && now >= this.nextAbilityAt) {
      activateSwarmer(this, now);
      this.nextAbilityAt += this.ability.interval;
      if (this.nextAbilityAt <= now) this.nextAbilityAt = now + this.ability.interval;
    } else if (kind === 'ARMORER') {
      updateArmorAura(this);
    } else if (kind === 'GRAFTER') {
      updateGrafting(this, now);
    }
  }

  die(sourceTower = this.lastDamageSource) {
    this.cleanupAbilities();
    super.die(sourceTower);
  }

  destroy(fromScene) {
    this.cleanupAbilities();
    super.destroy(fromScene);
  }

  cleanupAbilities() {
    cleanupMiniBossAbilities(this);
  }
}
