
import { fmt } from '../utils/formatNumber.js';

export default class EconomyManager {
  constructor(scene) {
    this.scene = scene;

    // Player resources
    const mission = scene.registry?.get?.('selectedMission');
    const missionParameters = mission?.parameters || {};
    this.allowedEscapes = Number(missionParameters.protectedZoneToughness) || window.GAME_SETTINGS.PLAYER.allowedEscapes || 10;
    this.lives = this.allowedEscapes;
    this.escapes = 0;
    this.money = scene.rpgManager?.state?.credits ?? window.GAME_SETTINGS.PLAYER.money;
    this.force = Number(window.GAME_SETTINGS.PLAYER.force || 0) * (Number(missionParameters.startingForceMultiplier) || 1);
    const persistedTilePoints = scene.registry?.get?.('missionSpecialTilePoints');
    const difficultyLevel = Math.max(1, ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'INSANE'].indexOf(mission?.difficulty) + 1);
    const initialTilePoints = mission?.missionType === 'BARRICADE' ? 9 * difficultyLevel : 5;
    this.tilePurchasePoints = Number.isInteger(persistedTilePoints) && persistedTilePoints >= 0
      ? persistedTilePoints : initialTilePoints;
    if (!Number.isInteger(persistedTilePoints) || persistedTilePoints < 0) {
      scene.registry?.set?.('missionSpecialTilePoints', this.tilePurchasePoints);
    }
    this.score = 0;

    // Track stats for scoring
    this.enemiesKilled = 0;
    this.towersBuilt = 0;
    this.wavesCompleted = 0;
  }

  /**
   * Get the player's current lives
   * @returns {number} Current lives
   */
  getLives() {
    return this.lives;
  }

  /**
   * Get the player's current money
   * @returns {number} Current money
   */
  getMoney() {
    return this.money;
  }

  spendSpecialTilePoint() {
    if (!Number.isInteger(this.tilePurchasePoints) || this.tilePurchasePoints < 1) return false;
    this.tilePurchasePoints -= 1;
    this.scene.registry?.set?.('missionSpecialTilePoints', this.tilePurchasePoints);
    this.scene.events?.emit?.('specialTilePointsChanged', this.tilePurchasePoints);
    return true;
  }

  getForce() {
    return this.force;
  }

  spendForce(amount) {
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost < 0 || this.force < cost) return false;
    this.force -= cost;
    this.scene.events.emit('updateUI', { force: this.force });
    return true;
  }

  addForce(amount) {
    const reward = Number(amount);
    if (!Number.isFinite(reward) || reward <= 0) return this.force;
    this.force += reward;
    this.scene.events.emit('updateUI', { force: this.force });
    return this.force;
  }

  clearMissionForce() {
    this.force = 0;
    this.scene.events.emit('updateUI', { force: this.force });
  }

  getEscapes() {
    return this.escapes;
  }

  registerEscape(toughnessDamage = 1) {
    this.escapes += Math.max(0, Number(toughnessDamage) || 0);
    this.lives = Math.max(0, this.allowedEscapes - this.escapes);
    this.updateScore();
  }

  /**
   * Get the player's current score
   * @returns {number} Current score
   */
  getScore() {
    return this.score;
  }

  /**
   * Add money to the player's balance
   * @param {number} amount - Amount to add
   */
  addMoney(amount) {
    this.money += amount;
    this.persistCredits();
    this.updateScore();
  }

  /**
   * Spend money from the player's balance
   * @param {number} amount - Amount to spend
   * @returns {boolean} True if the player had enough money
   */
  spendMoney(amount) {
    if (Number.isFinite(amount) && amount >= 0 && this.money >= amount) {
      this.money -= amount;
      this.persistCredits();
      this.towersBuilt++;
      this.updateScore();
      return true;
    }
    return false;
  }

  /**
   * Take damage (reduce lives)
   * @param {number} amount - Amount of damage to take
   */
  takeDamage(amount) {
    this.lives -= amount;
    if (this.lives < 0) {
      this.lives = 0;
    }
    this.updateScore();
  }

  /**
   * Add to the enemy kill count
   * @param {number} count - Number of enemies killed
   */
  addEnemyKill(count = 1) {
    this.enemiesKilled += count;
    this.updateScore();
  }

  /**
   * Add to the waves completed count
   */
  addWaveCompleted() {
    this.wavesCompleted++;

    this.updateScore();
  }

  persistCredits() {
    const state = this.scene.rpgManager?.state;
    if (!state) return;
    state.credits = this.money;
    this.scene.rpgManager.save();
  }

  /**
   * Update the player's score based on various factors
   */
  updateScore() {
    // Calculate score based on various factors
    this.score =
      this.enemiesKilled * 10 + // Points per enemy killed
      this.towersBuilt * 5 + // Points per tower built
      this.wavesCompleted * 100 + // Points per wave completed
      this.money / 10 + // Small bonus for unspent money
      this.lives * 20; // Bonus for remaining lives

    // Round to integer
    this.score = Math.floor(this.score);
  }

  /**
   * Award bonus money to the player
   * @param {number} amount - Amount of bonus money
   * @param {string} reason - Reason for the bonus (for display)
   */
  awardBonus(amount, reason) {
    this.addMoney(amount);

    // Emit event for UI to show bonus message
    this.scene.events.emit('showMessage', `Bonus: +${fmt(amount, 'floor')} gold\n${reason}`);
  }

  /**
   * Get the player's stats for display or saving
   * @returns {Object} Player stats
   */
  getStats() {
    return {
      lives: this.lives,
      money: this.money,
      score: this.score,
      enemiesKilled: this.enemiesKilled,
      towersBuilt: this.towersBuilt,
      wavesCompleted: this.wavesCompleted,
    };
  }

  /**
   * Reset the economy to starting values
   * Used when restarting the game
   */
  reset() {
    this.lives = window.GAME_SETTINGS.PLAYER.lives;
    this.escapes = 0;
    this.money = this.scene.rpgManager?.state?.credits ?? window.GAME_SETTINGS.PLAYER.money;
    this.force = Number(window.GAME_SETTINGS.PLAYER.force || 0);
    this.score = 0;
    this.enemiesKilled = 0;
    this.towersBuilt = 0;
    this.wavesCompleted = 0;
  }
}
