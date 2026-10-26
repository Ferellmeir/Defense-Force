import Phaser from 'phaser';
import AmmoMagazine, { isAmmoConfigurationMissing } from '../systems/AmmoMagazine.js';
import { applyDamage } from '../systems/DamageSystem.js';
import { getUnitCombatBonuses } from '../systems/UnitCombatBonuses.js';
import { spawnProjectileHitEffect } from '../systems/ProjectileEffectBridge.js';
import { isWithinWeaponRange } from '../utils/weaponRange.js';
import { selectTarget } from '../utils/targetSelection.js';
import { getAspectFitDisplaySize } from '../utils/visualSize.js';
import { withTileChanceBonus } from '../systems/combatChance.js';
import { TILE_EFFECTS } from '../systems/tileEffects.js';

const DUAL_WIELD_ATTACK_OFFSET = 120;

export default class Tower extends Phaser.GameObjects.Container {
  constructor(scene, x, y, type, data) {
    super(scene, x, y);

    // Add to scene
    scene.add.existing(this);
    this.setDepth(20);

    // Store tower data
    this.type = type;
    this.towerData = JSON.parse(JSON.stringify(data));
    this.equipment = this.towerData.equipment || { weapons: [], utility: null };
    this.characterId = this.towerData.unitId;
    this.targetingMode = this.towerData.targetingMode || 'first';

    // Tower state: mission-only progression belongs to the deployed instance.
    this.veterancy = Math.max(0, Number(data.veterancy ?? data.level ?? 0) || 0);
    this.level = this.veterancy;
    this.experience = Number(data.experience ?? data.xp ?? 0) || 0;
    this.xp = this.experience;
    this.selectedPaths = { ...(data.selectedPaths || {}) };
    this.pathProgress = { ...(data.pathProgress || {}) };
    this.pathTierSelection = { ...(data.pathTierSelection || {}) };
    this.deploymentCost = Number(data.cost ?? this.towerData.cost ?? 0) || 0;
    this.investedForce = this.deploymentCost;
    this.placementTile = data.placementTile || null;
    this.ammoDefinition = this.towerData.ammo || { requiresAmmo: false, unlimited: true };
    this.weaponAttackStates = [];
    this.firstHitTargets = new WeakSet();
    this.markedCandidates = new WeakSet();
    this.nextCritChanceBonus = 0;
    this.waveStartListener = () => {
      const boost = this.towerData.specialProperties?.find(property => property.property === 'waveStartAttackSpeedBoost');
      if (boost) this.stimpackActiveUntil = Number(scene.gameTime || 0) + Number(boost.duration || 0);
    };
    scene.events.on('waveStarted', this.waveStartListener);
    this.updateWeaponAttackStates();
    this.visualLevel = data.visualLevel || 1;
    this.target = null;
    this.lastFireTime = this.weaponAttackStates[0]?.lastFireTime ?? -this.attackInterval;
    this.isActive = true;

    // Create tower sprite using the explicitly configured visual level
    const assetKey = String(data.asset || type).toLowerCase();
    const textureKey = `tower_${assetKey}_${this.visualLevel}`;
    this.sprite = scene.make.image({ x: 0, y: 0, key: textureKey, add: false });
    if (data.characterArt) {
      const filterMode = data.filtering === 'nearest'
        ? Phaser.Textures.FilterMode.NEAREST
        : Phaser.Textures.FilterMode.LINEAR;
      scene.textures.get(textureKey).setFilter(filterMode);
    }
    if (data.characterArt) {
      const origin = data.visualOrigin || { x: 0.5, y: 1 };
      const source = scene.textures.get(textureKey).getSourceImage();
      const displaySize = getAspectFitDisplaySize(source.width, source.height, data.visualSize);
      this.sprite.setOrigin(origin.x, origin.y);
      this.sprite.setDisplaySize(displaySize.width, displaySize.height);
    }
    this.baseSpriteScaleX = this.sprite.scaleX;
    this.baseSpriteScaleY = this.sprite.scaleY;
    const projectedPosition = scene.projectWorldPoint?.(x, y) || { x, y };
    this.projectedOffset = { x: projectedPosition.x - x, y: projectedPosition.y - y };
    this.sprite.setPosition(this.projectedOffset.x, this.projectedOffset.y);
    this.add(this.sprite);

    // Create range indicator (invisible by default)
    this.rangeIndicator = scene.add.circle(
      0,
      0,
      this.towerData.range,
      0xffffff,
      0.2
    );
    this.rangeIndicator.setPosition(this.projectedOffset.x, this.projectedOffset.y);
    this.rangeIndicator.setRotation(Math.PI / 4);
    const projectionScale = scene.battlefieldProjection?.scale || 1;
    this.rangeIndicator.setScale(projectionScale, projectionScale * 0.5);
    this.rangeIndicator.setVisible(false);
    this.add(this.rangeIndicator);

    // Set up input handling
    this.sprite.setInteractive();
    this.setupInteractive();
  }

  /**
   * Clean up all child objects and emitters when destroying the tower
   */
  destroy(fromScene) {
    this.scene.events.off('waveStarted', this.waveStartListener);
    this.attackAnimationTween?.stop();
    if (this.placementTile) {
      this.placementTile.hasTower = false;
      this.placementTile.setAlpha(0.3);
    }
    if (this.sprite && this.sprite.destroy) this.sprite.destroy();
    if (this.rangeIndicator && this.rangeIndicator.destroy)
      this.rangeIndicator.destroy();
    if (this.attackEmitter && this.attackEmitter.destroy)
      this.attackEmitter.destroy();
    if (this.upgradeEffect && this.upgradeEffect.destroy)
      this.upgradeEffect.destroy();
    super.destroy(fromScene);
    this.towerData = null;
    this.equipment = null;
    this.characterId = null;
    this.target = null;
    this.veterancy = 0;
    this.level = 1;
    this.experience = 0;
    this.xp = 0;
    this.selectedPaths = {};
    this.pathProgress = {};
    this.pathTierSelection = {};
    this.deploymentCost = 0;
    this.investedForce = 0;
    this.ammoMagazine = null;
    this.placementTile = null;
  }

  /**
   * Set up interactive events for the tower
   */
  setupInteractive() {
    this.sprite.on('pointerover', () => {
      this.showRange();
    });

    this.sprite.on('pointerout', () => {
      this.hideRange();
    });

    this.sprite.on('pointerdown', () => {
      // Show tower info via Phaser EventEmitter
      this.scene.events.emit('showTowerInfo', this);
    });
  }

  /**
   * Update method called each frame
   * @param {number} time - Current time
   * @param {number} delta - Time since last update
   * @param {Array} enemies - Array of enemy objects
   */
  update(time, delta, enemies) {
    if (!this.isActive) return;

    this.weaponAttackStates.forEach(state => {
      const boost = this.towerData.specialProperties?.find(property => property.property === 'waveStartAttackSpeedBoost');
      const speedMultiplier = boost && time < (this.stimpackActiveUntil || 0)
        ? 1 + Number(boost.value || 0) : 1;
      const critBoost = this.towerData.specialProperties?.find(property => property.property === 'critDamageBoost');
      const critSpeedMultiplier = critBoost && time < (this.critDamageBoostUntil || 0)
        ? 1 + Number(critBoost.attackSpeedPenalty || 0) : 1;
      const tileType = this.placementTile?.specialType;
      state.attackInterval = Number(state.profile.attackSpeed ?? state.profile.fireRate ?? 1000)
        / speedMultiplier / Math.max(0.01, critSpeedMultiplier) * (tileType === 'tactical_indoctrination'
          ? TILE_EFFECTS.tactical_indoctrination.attackIntervalMultiplier : 1);
      state.ammoMagazine.update(time);
      enemies.forEach(enemy => {
        if (this.isValidTarget(enemy, state.profile.range, state.profile.attackType)) this.tryMarkEnemy(enemy);
      });
      const activeTileType = this.placementTile?.specialType;
      const range = Number(state.profile.range || 0) + (activeTileType === 'snipers_nest'
        ? TILE_EFFECTS.snipers_nest.rangeBonusTiles * (this.scene.mapManager?.getCurrentMap?.()?.tileSize || 64) : 0);
      this.findTarget(enemies, range, state.profile.attackType);
      state.target = this.target;
      if (state.target && time >= state.lastFireTime + state.attackInterval) {
        this.fireAtTarget(time, state);
      }
    });
    this.target = this.weaponAttackStates[0]?.target || null;
  }

  getLevelRequirement(level) {
    return this.scene.rpgManager.getLevelRequirement(level);
  }

  refreshProgressionStats() {
    const progression = {
      veterancy: this.veterancy,
      level: this.veterancy,
      experience: this.experience,
      xp: this.experience,
      selectedPaths: this.selectedPaths,
      pathProgress: this.pathProgress,
      pathTierSelection: this.pathTierSelection,
      equipment: this.equipment,
      equipped: this.towerData.equipped,
      randomStat: this.towerData.randomStat,
    };
    const stats = this.scene.rpgManager.getEffectiveStats(this.characterId, progression);
    if (!stats) return false;
    const tileModifier = this.towerData.tileModifier;
    const visualLevel = this.towerData.visualLevel;
    this.towerData = {
      ...this.towerData,
      ...JSON.parse(JSON.stringify(stats)),
      tileModifier,
      visualLevel,
      level: this.veterancy,
      veterancy: this.veterancy,
      experience: this.experience,
      xp: this.experience,
      selectedPaths: JSON.parse(JSON.stringify(this.selectedPaths)),
      pathProgress: JSON.parse(JSON.stringify(this.pathProgress)),
      pathTierSelection: JSON.parse(JSON.stringify(this.pathTierSelection)),
    };
    this.updateWeaponAttackStates();
    this.target = null;
    return true;
  }

  addExperience(amount) {
    this.experience += Number(amount) || 0;
    this.xp = this.experience;
    this.refreshProgressionStats();
    return this.experience;
  }

  getVeterancyXpRequirement() {
    return this.scene.rpgManager.getVeterancyXpRequirement(this.veterancy);
  }

  getVeterancyForceCost() {
    return this.scene.rpgManager.getVeterancyForceCost(this.veterancy, this.deploymentCost)
      * this.scene.rpgManager.getTowerVeterancyCostMultiplier(this);
  }

  spendVeterancy(pathId) {
    return this.scene.rpgManager.purchaseVeterancy(this, pathId);
  }

  getSellForceRefund() {
    return this.investedForce * 0.7 * (1 + (Number(this.towerData.sellBonus) || 0));
  }

  /**
   * Check if a target is valid (alive and in range)
   * @param {Enemy} target - Target to check
   * @returns {boolean} True if target is valid
   */
  isValidTarget(target, range = this.towerData.range, attackType = this.attackType || this.towerData.attackType) {
    // Check if target exists and is alive
    if (!target || target.isDead()) {
      return false;
    }

    // Check if target is in range
    if (this.placementTile?.specialType === 'snipers_nest') {
      range += TILE_EFFECTS.snipers_nest.rangeBonusTiles * (this.scene.mapManager?.getCurrentMap?.()?.tileSize || 64);
    }
    return isWithinWeaponRange(
      this,
      target,
      range,
      attackType,
      this.scene.mapManager?.getCurrentMap?.()?.tileSize
    );
  }

  /**
   * Find a new target from the enemies array
   * @param {Array} enemies - Array of enemy objects
   */
  findTarget(enemies, range = this.towerData.range, attackType = this.attackType || this.towerData.attackType) {
    this.target = null;
    const candidates = [];

    for (const enemy of enemies) {
      // Skip dead enemies
      if (enemy.isDead()) continue;

      if (isWithinWeaponRange(
        this,
        enemy,
        range,
        attackType,
        this.scene.mapManager?.getCurrentMap?.()?.tileSize
      )) {
        candidates.push(enemy);
        this.tryMarkEnemy(enemy);
      }
    }

    this.target = selectTarget(candidates, this.targetingMode);
  }

  tryMarkEnemy(enemy) {
    const mark = this.towerData.specialProperties?.find(property => property.property === 'markEnemyOnEnter');
    const armorReduction = this.towerData.specialProperties?.find(property => property.property === 'armorReductionOnEnter');
    if ((!mark && !armorReduction) || this.markedCandidates.has(enemy)) return;
    this.markedCandidates.add(enemy);
    if (mark && Math.random() < withTileChanceBonus(mark.chance, this)) {
      enemy.applyStatusEffect({
        type: 'marked', damageTakenMultiplier: Number(mark.damageTaken || 0), duration: Number(mark.duration || 0),
      });
    }
    if (armorReduction && Math.random() < withTileChanceBonus(armorReduction.chance, this)) {
      enemy.armor = Math.max(0, Number(enemy.armor || 0) - Number(armorReduction.amount || 0));
    }
  }

  onEnemyKilled() {
    const critBonus = this.towerData.specialProperties?.find(property => property.property === 'killCritBonus');
    if (critBonus) this.nextCritChanceBonus = Number(critBonus.value || 0);
    const reload = this.towerData.specialProperties?.find(property => property.property === 'killReload');
    if (!reload) return;
    const now = Number(this.scene.gameTime ?? this.scene.time.now);
    this.weaponAttackStates.forEach(state => {
      const magazine = state.ammoMagazine;
      if (magazine.reloadUntil > now) {
        magazine.reloadUntil = now + (magazine.reloadUntil - now) * (1 - Number(reload.value || 0));
      }
    });
  }

  /**
   * Fire at the current target
   * @param {number} time - Current time
   */
  fireAtTarget(time, attackState = this.weaponAttackStates[0]) {
    if (!attackState || !attackState.ammoMagazine.canFire(time)) return;
    if (!attackState.ammoMagazine.consumeShot(time)) return;

    attackState.lastFireTime = time;
    if (attackState === this.weaponAttackStates[0]) this.lastFireTime = time;
    const weaponStats = attackState.profile;
    const target = attackState.target || this.target;
    const specialProperties = weaponStats.specialProperties || [];
    let damage = weaponStats.damage;
    const unitCombatBonuses = getUnitCombatBonuses({
      specialProperties,
      weaponAttacks: this.towerData.weaponAttacks || [],
      deployedCount: this.scene.towerManager?.getAll?.().length || 1,
    });
    damage *= unitCombatBonuses.damageMultiplier;
    const critBoost = specialProperties.find(property => property.property === 'critDamageBoost');
    if (critBoost && time < (this.critDamageBoostUntil || 0)) damage *= 1 + Number(critBoost.value || 0);
    const meleeDamageBonus = specialProperties.find(property => property.property === 'meleeDamageBonus');
    if (weaponStats.attackType === 'melee' && meleeDamageBonus) {
      damage *= 1 + Number(meleeDamageBonus.value || meleeDamageBonus.meleeDamageBonus || 0);
    }
    const nearbyBonus = specialProperties.find(property => property.property === 'nearbyEnemyDamage');
    if (nearbyBonus) {
      const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize || 0;
      const radius = Number(nearbyBonus.range || 0) * tileSize;
      const nearbyCount = this.scene.enemyManager.getAll().filter(enemy => enemy !== target
        && Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y) <= radius).length;
      damage *= 1 + nearbyCount * Number(nearbyBonus.value || 0);
    }
    const alternateBonus = specialProperties.find(property => property.property === 'alternateAttackBonus');
    if (alternateBonus && this.previousAttackType && this.previousAttackType !== weaponStats.attackType) {
      damage *= 1 + Number(alternateBonus.value || 0);
    }
    this.previousAttackType = weaponStats.attackType;
    const repeatCrit = specialProperties.find(property => property.property === 'repeatCritChance');
    if (repeatCrit) {
      if (this.repeatCritTarget === target) {
        this.repeatCritCount = (this.repeatCritCount || 0) + 1;
      } else {
        this.repeatCritTarget = target;
        this.repeatCritCount = 0;
      }
    }
    const repeatCritBonus = repeatCrit
      ? Math.min(Number(repeatCrit.max || 0.2), (this.repeatCritCount || 0) * Number(repeatCrit.value || 0)) : 0;
    const projectileData = {
      damage: damage * (this.towerData.tileModifier === 'damage_boost' ? 1.25 : 1),
      damageType: weaponStats.damageType || 'Physical',
      armorPenetration: (weaponStats.armorPenetration || 0) + Number(this.nextAttackPenetrationBonus || 0),
      statusEffects: weaponStats.statusEffects || [],
      attackType: weaponStats.attackType || 'ranged',
      ammo: weaponStats.ammo,
      criticalChance: weaponStats.criticalChance + unitCombatBonuses.criticalChanceBonus + repeatCritBonus,
      criticalModifier: weaponStats.criticalModifier,
      rangedSkill: weaponStats.rangedSkill,
      meleeSkill: weaponStats.meleeSkill,
      reloadSpeed: weaponStats.reloadSpeed,
      statusDuration: weaponStats.statusDuration,
      specialProperties,
      sourceTower: this,
      unitId: this.characterId,
      type: this.type,
      speed: weaponStats.projectileSpeed,
      canHitFlying: this.canTargetFlying(),
      specialTileType: this.placementTile?.specialType,
    };
    if (this.placementTile?.specialType === 'snipers_nest' && target) {
      const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize || 64;
      projectileData.damage *= 1 + Math.floor(Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) / tileSize)
        * TILE_EFFECTS.snipers_nest.damageBonusPerTile;
    }

    // Add special properties based on tower type
    if (this.type === 'aoe') {
      projectileData.aoeRadius = this.towerData.aoeRadius;
    } else if (this.type === 'slow') {
      projectileData.slowFactor = this.towerData.slowFactor;
      projectileData.slowDuration = this.towerData.slowDuration;
    }
    const areaEffect = specialProperties.find(property => property.type === 'aoe');
    if (areaEffect) {
      const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize || 0;
      projectileData.aoeRadius = weaponStats.aoeRadius || Number(areaEffect.radius || 0) * tileSize;
      projectileData.aoeDamageMultiplier = Number(weaponStats.aoeDamageMultiplier ?? areaEffect.multiplier ?? 1);
    }

    // Spawn projectile
    const projectileAsset = weaponStats.projectileAsset || 'basic';
    if (projectileData.attackType === 'melee') {
      if (this.isValidTarget(target, weaponStats.range, weaponStats.attackType)) {
        if (this.scene.effectSpawner) {
          spawnProjectileHitEffect(this.scene.effectSpawner, target.x, target.y, projectileData);
        }
        applyDamage(target, projectileData);
      }
    } else {
      this.scene.spawnProjectile(
        this,
        target,
        `projectile_${projectileAsset}`,
        projectileData
      );
    }

    // Visual feedback
    this.playAttackAnimation();
  }

  canFire(time) {
    return Boolean(this.ammoMagazine?.canFire(time));
  }

  getReloadRemaining(time = this.scene?.time?.now ?? 0) {
    return this.ammoMagazine?.getReloadRemaining(time) ?? 0;
  }

  consumeAmmo(time) {
    return Boolean(this.ammoMagazine?.consumeShot(time));
  }

  updateWeaponAttackStates() {
    const profiles = Array.isArray(this.towerData.weaponAttacks)
      ? this.towerData.weaponAttacks
      : [this.towerData];
    const previousStates = this.weaponAttackStates || [];
    this.weaponAttackStates = profiles.map((profile, index) => {
      const attackInterval = Number(profile.attackSpeed ?? profile.fireRate ?? 1000);
      const previous = previousStates[index];
      if (previous) {
        previous.profile = profile;
        previous.attackInterval = attackInterval;
        if (profile.reloadSpeed !== undefined) {
          previous.ammoMagazine.reloadDuration = Number(profile.reloadSpeed);
        }
        return previous;
      }

      const ammo = profile.ammo || { requiresAmmo: false, unlimited: true };
      const ammoWeapon = (this.towerData.equipment?.weapons || [])
        .find(weapon => weapon?.id === profile.weaponId);
      return {
        profile,
        attackInterval,
        // Keep each weapon's cadence independent while separating the first
        // attacks so dual-wield animations are visible as distinct strikes.
        lastFireTime: -attackInterval - (profiles.length > 1 && index === 1 ? DUAL_WIELD_ATTACK_OFFSET : 0),
        target: null,
        ammoMagazine: new AmmoMagazine(
          ammo,
          profile.reloadSpeed,
          ammoWeapon?.reloadSpeed !== undefined || profile.reloadSpeed !== undefined,
        ),
      };
    });
    this.attackInterval = this.weaponAttackStates[0]?.attackInterval
      ?? Number(this.towerData.attackSpeed ?? this.towerData.fireRate ?? 1000);
    this.ammoMagazine = this.weaponAttackStates[0]?.ammoMagazine
      || new AmmoMagazine(this.ammoDefinition, undefined, false);
  }

  get magazineCapacity() {
    return this.ammoMagazine?.capacity;
  }

  get ammoRemaining() {
    return this.ammoMagazine?.ammoRemaining;
  }

  get reloadUntil() {
    return this.ammoMagazine?.reloadUntil;
  }

  get ammoConfigurationMissing() {
    return isAmmoConfigurationMissing(this.ammoMagazine);
  }

  /**
   * Play attack animation and particle effect
   */
  playAttackAnimation() {
    // Pulse from the captured normal scale; repeated attacks never compound.
    this.attackAnimationTween?.stop();
    this.sprite.setScale(this.baseSpriteScaleX, this.baseSpriteScaleY);
    this.attackAnimationTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseSpriteScaleX * 1.1,
      scaleY: this.baseSpriteScaleY * 1.1,
      duration: 100,
      yoyo: true,
      onComplete: () => this.sprite?.setScale(this.baseSpriteScaleX, this.baseSpriteScaleY),
    });

    // Particle effect: muzzle flash/spark at tower center
    if (!this.attackEmitter) {
      this.attackEmitter = this.scene.add.particles(0, 0, 'explosion', {
        lifespan: 250,
        speed: { min: 60, max: 120 },
        scale: { start: 0.18, end: 0 },
        quantity: 8,
        angle: { min: 0, max: 360 },
        blendMode: 'ADD',
      });
      this.add(this.attackEmitter);
      this.attackEmitter.setPosition(this.projectedOffset.x, this.projectedOffset.y);
    }
    this.attackEmitter.explode(8, 0, 0);
  }

  /**
   * Show the tower's range indicator
   */
  showRange() {
    this.rangeIndicator.setVisible(true);
  }

  /**
   * Hide the tower's range indicator
   */
  hideRange() {
    this.rangeIndicator.setVisible(false);
  }

  /**
   * Check if this tower can target flying enemies
   * @returns {boolean} True if tower can target flying enemies
   */
  canTargetFlying() {
    return true;
  }

  cycleTargetingMode() {
    const modes = ['first', 'last', 'highestHealth', 'lowestHealth'];
    const index = modes.indexOf(this.targetingMode);
    this.targetingMode = modes[(index + 1) % modes.length];
    this.weaponAttackStates.forEach(state => { state.target = null; });
    this.target = null;
    return this.targetingMode;
  }

  /**
   * Calculate the upgrade cost for the next level
   * @returns {number} Upgrade cost
   */
  calculateUpgradeCost() {
    // Allow per-tower scaling, fallback to default
    const baseCost = this.towerData.cost;
    const upgradeScaling = this.towerData.upgradeCostScaling || 0.6; // default 60% of base per level
    return Math.floor(baseCost * upgradeScaling * this.level);
  }

  /**
   * Apply stat improvements for an upgrade
   */
  applyUpgradeEffects() {
    // Allow per-tower scaling, fallback to defaults
    const damageScale = this.towerData.upgradeDamageScale || 1.4;
    const rangeScale = this.towerData.upgradeRangeScale || 1.15;
    const fireRateScale = this.towerData.upgradeFireRateScale || 0.85;

    this.towerData.damage = Math.round(this.towerData.damage * damageScale);
    this.towerData.range = Math.round(this.towerData.range * rangeScale);
    this.towerData.fireRate = Math.round(this.towerData.fireRate * fireRateScale);

    // Update range indicator
    this.rangeIndicator.setRadius(this.towerData.range);
  }

  /**
   * Update the tower's appearance based on level
   */
  updateAppearance() {
    // Update texture without coupling it to RPG progression
    const assetKey = this.towerData.asset || this.type.toLowerCase();
    this.sprite.setTexture(`tower_${assetKey}_${this.visualLevel}`);

    // Optionally, add a visual effect for upgrades
    if (!this.upgradeEffect) {
      this.upgradeEffect = this.scene.add.particles(0, 0, 'explosion', {
        lifespan: 400,
        speed: { min: 20, max: 60 },
        scale: { start: 0.2, end: 0 },
        quantity: 6,
        blendMode: 'ADD',
      });
      this.add(this.upgradeEffect);
      this.upgradeEffect.setPosition(this.projectedOffset.x, this.projectedOffset.y);
    }
    this.upgradeEffect.explode(6, 0, 0);
  }

  /**
   * Upgrade the tower to the next level
   * @returns {boolean} True if upgrade was successful
   */
  upgrade() {
    // Use maxLevel from data or default to 3
    this.maxLevel = this.towerData.maxLevel || 3;
    if (this.level >= this.maxLevel) {
      return false; // Max level reached
    }

    const upgradeCost = this.calculateUpgradeCost();

    // Check if player has enough money
    if (this.scene.economyManager.getMoney() >= upgradeCost) {
      // Deduct cost
      this.scene.economyManager.spendMoney(upgradeCost);

      // Increase level
      this.level++;

      // Improve stats
      this.applyUpgradeEffects();

      // Update visuals
      this.updateAppearance();

      return true;
    }

    return false;
  }

  /**
   * Sell the tower
   * @returns {number} Amount of money refunded
   */
  sell() {
    if (this.isSold) return 0;
    this.isSold = true;
    this.isActive = false;
    const refundAmount = this.getSellForceRefund();
    this.scene.economyManager.addForce(refundAmount);
    this.scene.towerManager.removeTower(this);

    return refundAmount;
  }
}
