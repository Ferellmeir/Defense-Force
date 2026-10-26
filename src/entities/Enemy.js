import Phaser from 'phaser';
import { awardEnemyKillRewards } from '../systems/enemyRewards.js';
import { hasActiveStun, updateEnemyStatusEffects } from '../systems/EnemyStatusEffects.js';
import { getEnemyEffectPosition } from '../utils/combatCoordinates.js';
import { getAspectFitDisplaySize } from '../utils/visualSize.js';

export default class Enemy extends Phaser.GameObjects.Container {
  /**
   * Override the destroy method to handle the data property correctly
   * @param {boolean} fromScene - Whether this Game Object is being destroyed by the Scene
   */
  destroy(fromScene) {
    // Set data to null to prevent Phaser from trying to destroy it
    this.data = null;

    // Call parent destroy method
    super.destroy(fromScene);
  }

  constructor(scene, x, y, type, data, path) {
    super(scene, x, y);

    // Add to scene
    scene.add.existing(this);

    // Store enemy data
    this.type = type;
    this.data = { ...data }; // Clone data to avoid modifying original
    this.path = path;

    // Enemy state
    this.health = this.data.health;
    this.maxHealth = this.data.health;
    this.armor = this.data.armor || 0;
    this.statusEffects = [];
    this.currentPathIndex = 0;
    this.t = 0; // Position along current path segment (0-1)
    this.reachedEnd = false;
    this.isDying = false;
    this.rewardsAwarded = false;
    this.lastDamageSource = null;
    this.slowEffects = []; // Array of active slow effects
    this.xpAwarded = false;

    // Create enemy sprite
    this.sprite = scene.add.image(0, 0, `enemy_${this.data.asset || type}`);
    const source = scene.textures.get(`enemy_${this.data.asset || type}`).getSourceImage();
    const visualSize = getAspectFitDisplaySize(source.width, source.height, this.data.visualSize);
    this.sprite.setDisplaySize(visualSize.width, visualSize.height);
    const filterMode = this.data.filtering === 'nearest'
      ? Phaser.Textures.FilterMode.NEAREST
      : Phaser.Textures.FilterMode.LINEAR;
    scene.textures.get(`enemy_${this.data.asset || type}`).setFilter(filterMode);
    const visualOrigin = this.data.visualOrigin || { x: 0.5, y: 1 };
    this.sprite.setOrigin(visualOrigin.x, visualOrigin.y);
    this.healthBarOffsetY = visualSize
      ? -(visualSize.height * visualOrigin.y) - 8
      : -20;
    this.add(this.sprite);

    // Create health bar
    this.createHealthBar();

    // Set up physics body
    scene.physics.world.enable(this);
    this.body.setCircle(16); // Adjust size as needed
    this.updateProjectedVisuals();
  }

  /**
   * Get difficulty multipliers from the scene registry
   * @param {Phaser.Scene} scene - The scene
   * @returns {Object} Difficulty multipliers
   */
  getDifficultyMultipliers(scene) {
    // Get selected difficulty from registry (default to EASY if not set)
    const difficultyKey = scene.registry.get('selectedDifficulty') || 'EASY';
    return window.GAME_SETTINGS.DIFFICULTY[difficultyKey];
  }

  /**
   * Apply difficulty multipliers to enemy stats
   */
  applyDifficultyMultipliers() {
    // Mission difficulty has no enemy stat multiplier in the current rules.
  }

  /**
   * Create a health bar for the enemy
   */
  createHealthBar() {
    // Health bar background
    this.healthBarBg = this.scene.add.rectangle(0, this.healthBarOffsetY, 32, 5, 0x000000);
    this.healthBarBg.setOrigin(0.5, 0.5);
    this.add(this.healthBarBg);

    // Health bar fill
    this.healthBar = this.scene.add.rectangle(0, this.healthBarOffsetY, 32, 5, 0x00ff00);
    this.healthBar.setOrigin(0.5, 0.5);
    this.add(this.healthBar);
  }

  /**
   * Update method called each frame
   * @param {number} time - Current time
   * @param {number} delta - Time since last update
   */
  update(time, delta) {
    if (this.isDying || this.reachedEnd) return;

    this.updateStatusEffects(time);

    // Move along path
    this.moveAlongPath(delta);

    // Update health bar
    this.updateHealthBar();
  }

  /**
   * Move the enemy along the path
   * @param {number} delta - Time since last update
   */
  moveAlongPath(delta) {
    // Calculate speed (accounting for slow effects)
    const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize || 0;
    let speed = (Number(this.data.tilesPerSecond) || 0) * tileSize;
    const terrain = this.path[this.currentPathIndex]?.terrain;
    if (terrain?.speedMultiplier) speed *= terrain.speedMultiplier;

    // Apply slow effects
    for (const slowEffect of this.statusEffects.filter(effect => effect.type === 'slow')) {
      speed *= slowEffect.value;
    }
    if (hasActiveStun(this.statusEffects)) return;

    // Convert speed from pixels per second to pixels per frame
    const pixelsToMove = (speed * delta) / 1000;

    // Calculate path segment length
    const currentPoint = this.path[this.currentPathIndex];
    const nextPoint = this.path[this.currentPathIndex + 1];

    if (!nextPoint) {
      // Reached the end of the path
      this.reachedEnd = true;
      return;
    }

    const segmentLength = Phaser.Math.Distance.Between(
      currentPoint.x,
      currentPoint.y,
      nextPoint.x,
      nextPoint.y
    );

    // Calculate how far along the segment to move
    const distanceToMove = pixelsToMove / segmentLength;
    this.t += distanceToMove;

    // Check if we've reached the next point
    if (this.t >= 1) {
      // Move to next path segment
      this.currentPathIndex++;
      this.t = this.t - 1; // Carry over any remaining movement

      // Check if we've reached the end of the path
      if (this.currentPathIndex >= this.path.length - 1) {
        this.reachedEnd = true;
        return;
      }
    }

    // Update position
    const currentPoint2 = this.path[this.currentPathIndex];
    const nextPoint2 = this.path[this.currentPathIndex + 1];

    this.x = Phaser.Math.Linear(currentPoint2.x, nextPoint2.x, this.t);
    this.y = Phaser.Math.Linear(currentPoint2.y, nextPoint2.y, this.t);

    this.updateProjectedVisuals();
  }

  updateProjectedVisuals() {
    const point = this.scene.projectWorldPoint?.(this.x, this.y) || { x: this.x, y: this.y };
    const offsetX = point.x - this.x;
    const offsetY = point.y - this.y;
    this.sprite?.setPosition(offsetX, offsetY);
    this.sprite?.setRotation(0);
    this.healthBarBg?.setPosition(offsetX, offsetY + this.healthBarOffsetY);
    this.healthBar?.setPosition(offsetX, offsetY + this.healthBarOffsetY);

    for (const child of [this.teleportFlash, this.healAura, this.shieldCircle, this.hitEmitter]) {
      if (!child) continue;
      child.setPosition?.(offsetX, offsetY);
      if (child !== this.hitEmitter && this.scene.battlefieldProjection) {
        child.setRotation?.(Math.PI / 4);
        child.setScale?.(
          this.scene.battlefieldProjection.scale,
          this.scene.battlefieldProjection.scale * 0.5
        );
      }
    }
  }

  /**
   * Update the health bar to reflect current health
   */
  updateHealthBar() {
    const healthPercent = this.health / this.maxHealth;
    this.healthBar.width = 32 * healthPercent;

    // Update color based on health percentage
    if (healthPercent > 0.6) {
      this.healthBar.fillColor = 0x00ff00; // Green
    } else if (healthPercent > 0.3) {
      this.healthBar.fillColor = 0xffff00; // Yellow
    } else {
      this.healthBar.fillColor = 0xff0000; // Red
    }
  }

  /**
   * Apply damage to the enemy
   * @param {number} amount - Amount of damage to apply
   */
  takeDamage(amount, sourceTower) {
    // Reduce health
    this.health -= amount;
    if (amount > 0 && sourceTower) this.lastDamageSource = sourceTower;

    // Particle effect: hit spark at enemy position
    if (!this.hitEmitter) {
      this.hitEmitter = this.scene.add.particles(0, 0, 'explosion', {
        lifespan: 180,
        speed: { min: 40, max: 90 },
        scale: { start: 0.13, end: 0 },
        quantity: 6,
        angle: { min: 0, max: 360 },
        tint: [0xffff00, 0xff8800, 0xffffff],
        blendMode: 'ADD',
      });
      this.add(this.hitEmitter);
    }
    this.hitEmitter.explode(6, 0, 0);

    // Check if dead
    if (this.health <= 0) {
      this.die(sourceTower);
    } else {
      // Visual feedback for taking damage
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0.5,
        duration: 100,
        yoyo: true,
      });
    }
  }

  /**
   * Kill the enemy
   */
  die(sourceTower = this.lastDamageSource) {
    if (this.isDying) return;

    this.isDying = true;
    this.lastDamageSource = sourceTower;

    // Store a reference to the scene and economyManager
    const scene = this.scene;
    const economyManager = this.scene.economyManager;

    const forceReward = awardEnemyKillRewards(this, scene);
    if (forceReward !== null) {
      scene.events.emit('updateUI', {
        money: economyManager.getMoney(),
        score: economyManager.getScore(),
        lives: economyManager.getLives(),
      });
    }

    // Enhanced visual effect: particle explosion on death
    if (scene.add && scene.textures.exists('explosion')) {
      const deathPoint = getEnemyEffectPosition(scene, this);
      const explosion = scene.add.particles(deathPoint.x, deathPoint.y, 'explosion', {
        lifespan: 800,
        speed: { min: 50, max: 120 },
        scale: { start: 0.5, end: 0 },
        quantity: 18,
        blendMode: 'ADD',
      });
      // Remove particles after effect
      scene.time.delayedCall(900, () => {
        if (explosion) explosion.destroy();
      });
    }

    // Play death animation
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 1.5,
      duration: 300,
      onComplete: () => {
        if (scene.enemyManager) scene.enemyManager.removeEnemy(this);
      },
    });
  }

  /**
   * Apply a slowing effect to the enemy
   * @param {number} factor - Slow factor (0-1, lower is slower)
   * @param {number} duration - Duration of slow effect in ms
   */
  applySlowEffect(factor, duration) {
    this.applyStatusEffect({ type: 'slow', value: factor, duration });
  }

  applyStatusEffect(effect) {
    const gameTime = Number(this.scene.gameTime ?? this.scene.time.now);
    this.statusEffects.push({
      ...effect,
      endTime: gameTime + effect.duration,
      nextTick: gameTime,
    });
    if (effect.type === 'slow') this.sprite.setTint(0x00ffff);
  }

  /**
   * Update and remove expired slow effects
   * @param {number} time - Current time
   */
  updateSlowEffects(time) {
    this.updateStatusEffects(time);
  }

  updateStatusEffects(time) {
    updateEnemyStatusEffects(this, time);
  }

  /**
   * Check if the enemy has reached the end of the path
   * @returns {boolean} True if enemy has reached the end
   */
  hasReachedEnd() {
    return this.reachedEnd;
  }

  /**
   * Check if the enemy is dead
   * @returns {boolean} True if enemy is dead
   */
  isDead() {
    return this.health <= 0;
  }

  /**
   * Get the current position along the path (0-1)
   * @returns {number} Position along path
   */
  getPathProgress() {
    // Calculate total path length
    let totalLength = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      totalLength += Phaser.Math.Distance.Between(
        this.path[i].x,
        this.path[i].y,
        this.path[i + 1].x,
        this.path[i + 1].y
      );
    }

    // Calculate current progress
    let currentProgress = 0;

    // Add completed segments
    for (let i = 0; i < this.currentPathIndex; i++) {
      currentProgress += Phaser.Math.Distance.Between(
        this.path[i].x,
        this.path[i].y,
        this.path[i + 1].x,
        this.path[i + 1].y
      );
    }

    // Add current segment progress
    if (!this.path[this.currentPathIndex + 1]) return 1;
    const currentSegmentLength = Phaser.Math.Distance.Between(
      this.path[this.currentPathIndex].x,
      this.path[this.currentPathIndex].y,
      this.path[this.currentPathIndex + 1].x,
      this.path[this.currentPathIndex + 1].y
    );
    currentProgress += currentSegmentLength * this.t;

    return currentProgress / totalLength;
  }
}
