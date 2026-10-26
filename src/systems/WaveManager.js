const AUTO_WAVE_DELAY_MS = 30000;
import { generateMissionWaves } from './waveGenerator.js';
import { createSeededRandom } from './missionGeneration.js';

export default class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.currentWave = 0;
    this.waveInProgress = false;
    this.activeWaves = new Map();
    this.enemiesRemaining = 0;
    this.spawnTimer = null;
    this.completionTimer = null;
    this.nextWaveTimer = null;
    this.nextWaveDeadline = null;
    this.lastCountdownSeconds = null;
    this.spawnIndex = 0;
    this.waveData = null;
    this.isCleanedUp = false;
    this.autoStartAuthorized = false;
    this.earlyWaveForceBonus = null;
    this.forceXpBaselineMultiplier = 1;
    this.enemyHealthBaselineMultiplier = 1;

    // Get difficulty settings
    this.difficultyKey = scene.registry.get('selectedDifficulty') || 'EASY';
    this.difficultySettings =
      window.GAME_SETTINGS.DIFFICULTY[this.difficultyKey];

    this.waveConfiguration = window.GAME_SETTINGS.MISSION_WAVES;
    const generated = generateMissionWaves({
      difficulty: this.difficultyKey,
      enemies: window.GAME_SETTINGS.ENEMIES,
      random: createSeededRandom(scene.missionSeed ?? scene.registry.get('missionSeed') ?? 0),
    });
    this.waveList = this.waveConfiguration?.status === 'CONFIGURED'
      && Array.isArray(this.waveConfiguration.waves)
      ? this.waveConfiguration.waves.map((wave, index) => ({
        ...wave,
        groups: (wave.groups || wave.enemies?.map(type => ({ type, count: wave.count })) || []),
        waveNumber: index + 1,
      }))
      : generated.waves;
    this.totalWaves = this.waveList.length;
    const difficultyIndex = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'INSANE'].indexOf(this.difficultyKey);
    this.difficultyHpMultiplier = difficultyIndex < 0 ? 1 : 1 + 0.2 * difficultyIndex;

    console.log(
      `WaveManager initialized with difficulty: ${this.difficultyKey}`
    );
    console.log(`Total waves: ${this.totalWaves}`);
  }

  /**
   * Get the number of extra waves to add based on difficulty
   * @param {string} difficultyKey - The difficulty key
   * @returns {number} Number of extra waves
   */
  getExtraWavesForDifficulty(difficultyKey) {
    return window.GAME_SETTINGS.DIFFICULTY[difficultyKey].waveCountAdjustment;
  }

  /**
   * Get wave data for the specified wave number, accounting for difficulty
   * @param {number} waveNumber - The wave number (1-based)
   * @returns {Object} Wave data
   */
  getWaveData(waveNumber) {
    const wave = this.waveList[waveNumber - 1];
    if (!wave) return null;
    const groups = wave.groups.filter(group => window.GAME_SETTINGS.ENEMIES[group.type]);
    return {
      ...wave,
      interval: 1000,
      groups,
      enemies: groups.map(group => group.type),
      spawnQueue: groups.flatMap(group => Array(group.count).fill(group.type)),
      count: groups.reduce((total, group) => total + group.count, 0),
    };
  }

  getMissionTime() {
    return Number(this.scene.gameTime ?? this.scene.time.now);
  }

  /**
   * Start the next wave of enemies
   */
  startNextWave(source = 'manual') {
    if (this.isCleanedUp || this.scene.isGameOver
      || (source === 'automatic' && !this.autoStartAuthorized)) return false;

    if (this.currentWave >= this.totalWaves) return false;

    const nextWaveNumber = this.currentWave + 1;
    const nextWaveData = this.getWaveData(nextWaveNumber);
    if (!nextWaveData?.count || nextWaveData.spawnQueue.length === 0) {
      this.scene.events.emit('showMessage', 'This wave has no configured enemy composition.', 2500);
      return false;
    }

    const earlyStart = source === 'manual' && Boolean(this.nextWaveTimer);
    const earlyStartByMs = earlyStart
      ? Math.max(0, this.nextWaveDeadline - this.getMissionTime())
      : 0;
    this.cancelNextWaveTimer();
    // Once a wave is started, any pending automatic start now targets the
    // following wave. Per-wave spawn and completion timers remain untouched.

    // Apply each fifth-wave increase to that fifth wave and all later waves.
    if (nextWaveNumber % 5 === 0) {
      this.forceXpBaselineMultiplier *= 1.15;
      this.enemyHealthBaselineMultiplier *= 1.15;
    }

    // Increment wave counter
    this.currentWave = nextWaveNumber;

    // Get wave data with difficulty scaling
    this.waveData = nextWaveData;
    console.log('Wave data:', this.waveData);

    // Set up wave
    this.waveInProgress = true;
    this.enemiesRemaining = this.waveData.count;
    this.spawnIndex = 0;
    const state = {
      waveNumber: nextWaveNumber,
      waveData: nextWaveData,
      spawnIndex: 0,
      spawnTimer: null,
      completionTimer: null,
      forceMultiplier: this.forceXpBaselineMultiplier,
      healthMultiplier: this.enemyHealthBaselineMultiplier,
    };
    this.activeWaves.set(nextWaveNumber, state);

    // Emit wave started event
    const startDetails = {
      source,
      earlyStart,
      earlyStartByMs,
      forceBonus: null,
    };
    if (earlyStart) {
      this.earlyWaveForceBonus = (earlyStartByMs / 1000) * this.currentWave;
      startDetails.forceBonus = this.earlyWaveForceBonus;
      this.scene.economyManager.addForce(this.earlyWaveForceBonus);
      this.scene.events.emit('earlyWaveStarted', this.currentWave, startDetails);
    }
    this.scene.events.emit('waveStarted', this.currentWave, startDetails);

    // Start spawning enemies
    this.startSpawning(state);
    return true;
  }

  /**
   * Start spawning enemies for the current wave
   */
  startSpawning(state = this.activeWaves.get(this.currentWave)) {
    if (!state) return;
    // Set up spawn timer
    state.spawnTimer = this.scene.time.addEvent({
      delay: state.waveData.interval,
      callback: () => this.spawnEnemy(state.waveNumber),
      repeat: state.waveData.count - 1,
    });

    // Spawn first enemy immediately
    this.spawnEnemy(state.waveNumber);
  }

  /**
   * Spawn a single enemy
   */
  spawnEnemy(waveNumber = this.currentWave) {
    const state = this.activeWaves.get(waveNumber);
    if (this.isCleanedUp || this.scene.isGameOver || !state) return false;
    // Get enemy type to spawn
    const enemyType = state.waveData.spawnQueue[state.spawnIndex];

    const definition = { ...window.GAME_SETTINGS.ENEMIES[enemyType] };
    if (enemyType === 'ARMORED' && waveNumber < 5) definition.armor = 15;
    this.scene.spawnEnemy(enemyType, undefined, undefined, {
      ...definition,
      health: definition.health * state.healthMultiplier * this.difficultyHpMultiplier,
      force: Math.max(1, Number(definition.force) || 1) * state.forceMultiplier,
    });

    // Increment spawn index
    state.spawnIndex++;
    if (waveNumber === this.currentWave) this.spawnIndex = state.spawnIndex;

    // Check if all enemies have been spawned
    if (state.spawnIndex >= state.waveData.count) {
      this.clearTimerObject(state, 'spawnTimer');
      this.scene.events.emit('waveReadyForNext', waveNumber);
      if (this.currentWave < this.totalWaves && !this.nextWaveTimer) this.scheduleNextWave();
      this.checkWaveCompletion(waveNumber);
    }
    return true;
  }

  /**
   * Check if the current wave is complete
   */
  checkWaveCompletion(waveNumber = this.currentWave) {
    const state = this.activeWaves.get(waveNumber);
    if (!state) return false;

    // If there are no enemies left, the wave is complete
    if (
      this.scene.enemyManager.getAll().length === 0 &&
      state.spawnIndex >= state.waveData.count
    ) {
      this.activeWaves.delete(waveNumber);
      this.waveInProgress = this.activeWaves.size > 0;
      this.clearTimerObject(state, 'completionTimer');
      this.scene.events.emit('waveCompleted', waveNumber);
      return true;
    } else {
      if (!state.completionTimer) {
        state.completionTimer = this.scene.time.delayedCall(1000, () => {
          state.completionTimer = null;
          this.checkWaveCompletion(waveNumber);
        });
      }
      return false;
    }
  }

  /**
   * Update method called each frame
   */
  update() {
    if (this.nextWaveTimer) {
      const seconds = Math.max(0, Math.ceil((this.nextWaveDeadline - this.getMissionTime()) / 1000));
      if (seconds !== this.lastCountdownSeconds) {
        this.lastCountdownSeconds = seconds;
        this.scene.events.emit('waveCountdown', seconds);
      }
    }
  }

  scheduleNextWave() {
    if (this.isCleanedUp || this.nextWaveTimer || this.currentWave >= this.totalWaves) return false;
    this.nextWaveDeadline = this.getMissionTime() + AUTO_WAVE_DELAY_MS;
    this.lastCountdownSeconds = null;
    this.nextWaveTimer = this.scene.time.delayedCall(AUTO_WAVE_DELAY_MS, () => {
      if (!this.nextWaveTimer || this.isCleanedUp) return;
      this.nextWaveTimer = null;
      this.nextWaveDeadline = null;
      this.lastCountdownSeconds = null;
      this.scene.events.emit('waveCountdown', null);
      this.autoStartAuthorized = true;
      try {
        this.startNextWave('automatic');
      } finally {
        this.autoStartAuthorized = false;
      }
    });
    this.update(0, 0);
    return true;
  }

  cancelNextWaveTimer() {
    const hadTimer = Boolean(this.nextWaveTimer);
    this.clearTimer('nextWaveTimer');
    this.nextWaveDeadline = null;
    this.lastCountdownSeconds = null;
    if (hadTimer) this.scene.events.emit('waveCountdown', null);
    return hadTimer;
  }

  clearTimer(timerName) {
    const timer = this[timerName];
    if (timer) timer.remove();
    this[timerName] = null;
  }

  clearTimerObject(state, timerName) {
    if (state[timerName]) state[timerName].remove();
    state[timerName] = null;
  }

  reset() {
    this.cancelNextWaveTimer();
    for (const state of this.activeWaves.values()) {
      this.clearTimerObject(state, 'spawnTimer');
      this.clearTimerObject(state, 'completionTimer');
    }
    this.activeWaves.clear();
    this.clearTimer('spawnTimer');
    this.clearTimer('completionTimer');
    this.currentWave = 0;
    this.waveInProgress = false;
    this.enemiesRemaining = 0;
    this.spawnIndex = 0;
    this.waveData = null;
    this.autoStartAuthorized = false;
    this.forceXpBaselineMultiplier = 1;
    this.enemyHealthBaselineMultiplier = 1;
    this.isCleanedUp = false;
  }

  cleanup() {
    this.cancelNextWaveTimer();
    for (const state of this.activeWaves.values()) {
      this.clearTimerObject(state, 'spawnTimer');
      this.clearTimerObject(state, 'completionTimer');
    }
    this.activeWaves.clear();
    this.clearTimer('spawnTimer');
    this.clearTimer('completionTimer');
    this.waveInProgress = false;
    this.enemiesRemaining = 0;
    this.spawnIndex = 0;
    this.waveData = null;
    this.autoStartAuthorized = false;
    this.isCleanedUp = true;
  }

  /**
   * Check if a wave is currently in progress
   * @returns {boolean} True if a wave is in progress
   */
  isWaveInProgress() {
    return this.waveInProgress;
  }

  /**
   * Get the current wave number
   * @returns {number} Current wave number
   */
  getCurrentWave() {
    return this.currentWave;
  }

  /**
   * Get the total number of waves
   * @returns {number} Total number of waves
   */
  getTotalWaves() {
    return this.totalWaves;
  }

  /**
   * Get the number of enemies remaining to be spawned
   * @returns {number} Number of enemies remaining
   */
  getEnemiesRemaining() {
    return this.waveData.count - this.spawnIndex;
  }

  /**
   * Skip to the next wave (for debugging)
   */
  skipToNextWave() {
    // Clear any existing enemies
    for (const enemy of this.scene.enemies) {
      enemy.destroy();
    }
    this.scene.enemies = [];

    // Clear any existing timer
    this.clearTimer('spawnTimer');
    this.clearTimer('completionTimer');
    this.cancelNextWaveTimer();

    // Reset wave state
    this.waveInProgress = false;

    // Start next wave
    this.startNextWave();
  }
}
console.log('Debugging wave manager');
