import assert from 'node:assert/strict';
import test from 'node:test';
import WaveManager from '../src/systems/WaveManager.js';

class FakeTimer {
  constructor(clock, delay, callback) {
    this.clock = clock;
    this.delay = delay;
    this.deadline = clock.now + delay;
    this.callback = callback;
    this.removed = false;
  }

  remove() {
    this.removed = true;
  }

  fire() {
    if (this.removed) return;
    this.removed = true;
    this.callback();
  }
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.timers = [];
  }

  addEvent(config) {
    const timer = new FakeTimer(this, config.delay, () => config.callback.call(config.callbackScope));
    timer.repeat = config.repeat;
    this.timers.push(timer);
    return timer;
  }

  delayedCall(delay, callback, args = [], scope = null) {
    const timer = new FakeTimer(this, delay, () => callback.apply(scope, args));
    this.timers.push(timer);
    return timer;
  }

  advance(milliseconds) {
    this.now += milliseconds;
    this.timers
      .filter(timer => !timer.removed && timer.deadline <= this.now)
      .forEach(timer => timer.fire());
  }
}

function createFixture(waveCount = 2, enemyCount = 1, difficulty = 'EASY') {
  globalThis.window = {
    GAME_SETTINGS: {
      DIFFICULTY: { EASY: {}, NORMAL: {}, HARD: {}, EXPERT: {}, INSANE: {} },
      ENEMIES: { NORMAL: { force: 1, health: 100 } },
      MISSION_WAVES: {
        status: 'CONFIGURED',
        waveCount,
        waves: Array.from({ length: waveCount }, () => ({
          count: enemyCount,
          interval: 100,
          enemies: ['NORMAL'],
        })),
      },
    },
  };

  const clock = new FakeClock();
  const emitted = [];
  const scene = {
    isGameOver: false,
    gameTime: 0,
    registry: { get: () => difficulty },
    time: clock,
    events: {
      emit: (name, ...args) => emitted.push({ name, args }),
    },
    enemies: [],
    enemyManager: { getAll: () => scene.enemies },
    spawned: [],
    spawnEnemy: (type, x, y, data) => {
      scene.spawned.push({ type, data });
      scene.enemies.push({});
    },
    economyManager: {
      force: 12,
      forceAwards: 0,
      getForce() { return this.force; },
      addForce(amount) {
        this.force += amount;
        this.forceAwards++;
      },
    },
  };
  const manager = new WaveManager(scene);
  return { manager, scene, clock, emitted };
}

function completeCurrentWave(fixture) {
  fixture.scene.enemies = [];
  assert.equal(fixture.manager.checkWaveCompletion(), true);
}

test('the last enemy spawn schedules the next wave for exactly 30 seconds later', () => {
  const fixture = createFixture();
  assert.equal(fixture.manager.startNextWave(), true);

  const automaticStart = fixture.manager.nextWaveTimer;
  assert.equal(automaticStart.delay, 30000);
  assert.equal(fixture.scene.enemies.length, 1);
  fixture.clock.advance(29999);
  fixture.manager.update(0, 0);
  assert.equal(fixture.manager.currentWave, 1);
  fixture.clock.advance(1);
  assert.equal(fixture.manager.currentWave, 2);
  assert.equal(fixture.scene.enemies.length, 2);
  assert.equal(fixture.emitted.filter(event => event.name === 'waveStarted').length, 2);
  assert.ok(fixture.emitted.some(event => event.name === 'waveCountdown'));
  assert.ok(fixture.emitted.some(event => event.name === 'waveStarted' && event.args[1].source === 'automatic'));
});

test('manual early start cancels the auto timer and emits early-start metadata', () => {
  const fixture = createFixture();
  fixture.manager.startNextWave();
  const automaticStart = fixture.manager.nextWaveTimer;

  assert.equal(fixture.manager.startNextWave(), true);
  assert.equal(automaticStart.removed, true);
  assert.equal(fixture.manager.nextWaveTimer, null);
  assert.equal(fixture.manager.currentWave, 2);
  assert.equal(fixture.scene.enemies.length, 2);
  const earlyEvent = fixture.emitted.find(event => event.name === 'earlyWaveStarted');
  assert.equal(earlyEvent.args[1].earlyStart, true);
  assert.equal(earlyEvent.args[1].forceBonus, 60);
  assert.equal(fixture.scene.economyManager.force, 72);
  assert.equal(fixture.scene.economyManager.forceAwards, 1);

  fixture.clock.advance(30000);
  assert.equal(fixture.manager.currentWave, 2);
});

test('manual starts can advance during spawning and each wave keeps its own schedule', () => {
  const fixture = createFixture(2, 2);
  assert.equal(fixture.manager.startNextWave(), true);
  const wave1Timer = fixture.manager.activeWaves.get(1).spawnTimer;
  assert.equal(fixture.manager.activeWaves.get(1).spawnIndex, 1);
  assert.equal(fixture.manager.startNextWave(), true);
  assert.equal(fixture.manager.currentWave, 2);
  assert.equal(fixture.emitted.filter(event => event.name === 'waveStarted').length, 2);
  const wave2Timer = fixture.manager.activeWaves.get(2).spawnTimer;
  assert.notEqual(wave1Timer, wave2Timer);
  wave1Timer.fire();
  assert.equal(fixture.manager.activeWaves.get(1).spawnIndex, 2);
  assert.equal(fixture.manager.activeWaves.get(2).spawnIndex, 1);
  wave2Timer.fire();
  assert.equal(fixture.manager.activeWaves.get(2).spawnIndex, 2);
  assert.equal(fixture.scene.spawned.length, 4);
});

test('Wave 3 can start while Waves 1 and 2 are both still spawning', () => {
  const fixture = createFixture(3, 3);
  fixture.manager.startNextWave();
  const wave1Timer = fixture.manager.activeWaves.get(1).spawnTimer;
  fixture.manager.startNextWave();
  const wave2Timer = fixture.manager.activeWaves.get(2).spawnTimer;
  fixture.manager.startNextWave();
  const wave3Timer = fixture.manager.activeWaves.get(3).spawnTimer;
  wave1Timer.fire();
  wave2Timer.fire();
  assert.equal(fixture.manager.activeWaves.get(1).spawnIndex, 2);
  assert.equal(fixture.manager.activeWaves.get(2).spawnIndex, 2);
  assert.equal(fixture.manager.activeWaves.get(3).spawnIndex, 1);
  wave3Timer.fire();
  assert.equal(fixture.manager.activeWaves.get(3).spawnIndex, 2);
});

test('rapid requests advance only once per request and cannot restart a wave', () => {
  const fixture = createFixture(3, 3);
  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.equal(fixture.manager.startNextWave('manual'), false);
  assert.deepEqual(fixture.emitted.filter(event => event.name === 'waveStarted').map(event => event.args[0]), [1, 2, 3]);
  assert.equal(fixture.manager.activeWaves.size, 3);
});

test('reset and cleanup remove pending wave timers', () => {
  const resetFixture = createFixture();
  resetFixture.manager.startNextWave();
  completeCurrentWave(resetFixture);
  const pendingAutoStart = resetFixture.manager.nextWaveTimer;
  resetFixture.manager.reset();
  assert.equal(pendingAutoStart.removed, true);
  assert.equal(resetFixture.manager.nextWaveTimer, null);
  assert.equal(resetFixture.manager.currentWave, 0);
  resetFixture.clock.advance(30000);
  assert.equal(resetFixture.manager.currentWave, 0);

  const cleanupFixture = createFixture(2, 2);
  cleanupFixture.manager.startNextWave();
  const pendingSpawn = cleanupFixture.manager.activeWaves.get(1).spawnTimer;
  pendingSpawn.fire();
  const cleanupAutoStart = cleanupFixture.manager.nextWaveTimer;
  const pendingCompletionCheck = cleanupFixture.manager.activeWaves.get(1).completionTimer;
  cleanupFixture.manager.cleanup();
  assert.equal(pendingSpawn.removed, true);
  assert.equal(cleanupAutoStart.removed, true);
  assert.equal(pendingCompletionCheck.removed, true);
  assert.equal(cleanupFixture.manager.isCleanedUp, true);
  assert.equal(cleanupFixture.manager.startNextWave(), false);
});

test('countdown and early-start Force bonus use accelerated mission time', () => {
  const fixture = createFixture();
  fixture.manager.startNextWave();
  fixture.scene.gameTime = 12000;
  fixture.manager.update();
  const countdown = fixture.emitted.filter(event => event.name === 'waveCountdown').at(-1);
  assert.equal(countdown.args[0], 18);
  assert.equal(fixture.manager.startNextWave('manual'), true);
  const earlyStart = fixture.emitted.find(event => event.name === 'earlyWaveStarted');
  assert.equal(earlyStart.args[1].earlyStartByMs, 18000);
  assert.equal(earlyStart.args[1].forceBonus, 36);
});

test('the inter-wave timer starts only after the final spawn and the final wave has no successor timer', () => {
  const fixture = createFixture(2, 2);
  fixture.manager.startNextWave();
  assert.equal(fixture.manager.spawnIndex, 1);
  assert.equal(fixture.manager.nextWaveTimer, null);

  fixture.manager.spawnEnemy();
  assert.equal(fixture.manager.nextWaveTimer.delay, 30000);
  assert.equal(fixture.scene.spawned.length, 2);
  assert.equal(fixture.scene.spawned[0].data.health, 100);

  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.equal(fixture.manager.nextWaveTimer, null);
  assert.equal(fixture.scene.spawned.length, 3);
  fixture.manager.spawnEnemy();
  assert.equal(fixture.scene.spawned.length, 4);
  fixture.scene.enemies = [];
  assert.equal(fixture.manager.checkWaveCompletion(), true);
  assert.deepEqual(
    fixture.emitted.filter(event => event.name === 'waveCompleted').map(event => event.args[0]),
    [2],
  );
});

test('mission end prevents further spawning and wave completion rewards emit once', () => {
  const fixture = createFixture(2, 2);
  fixture.manager.startNextWave();
  fixture.manager.activeWaves.get(1).spawnTimer.fire();
  fixture.scene.enemies = [];
  assert.equal(fixture.manager.checkWaveCompletion(), true);
  assert.equal(fixture.manager.checkWaveCompletion(), false);
  assert.equal(fixture.emitted.filter(event => event.name === 'waveCompleted').length, 1);

  const spawnedCount = fixture.scene.spawned.length;
  fixture.scene.isGameOver = true;
  assert.equal(fixture.manager.spawnEnemy(), false);
  assert.equal(fixture.scene.spawned.length, spawnedCount);
  assert.equal(fixture.manager.startNextWave(), false);
});

test('invalid wave starts leave Force and wave state unchanged', () => {
  const emptyFixture = createFixture(0);
  assert.equal(emptyFixture.manager.startNextWave(), false);
  assert.equal(emptyFixture.manager.currentWave, 0);
  assert.equal(emptyFixture.scene.economyManager.force, 12);

  const activeFixture = createFixture(2, 2);
  activeFixture.manager.startNextWave();
  assert.equal(activeFixture.manager.startNextWave(), true);
  assert.equal(activeFixture.manager.currentWave, 2);
  assert.equal(activeFixture.manager.activeWaves.get(1).spawnIndex, 1);
  assert.equal(activeFixture.scene.economyManager.force, 12);
  assert.equal(activeFixture.scene.economyManager.forceAwards, 0);

  const scheduledFixture = createFixture();
  scheduledFixture.manager.startNextWave();
  const automaticTimer = scheduledFixture.manager.nextWaveTimer;
  assert.equal(scheduledFixture.manager.startNextWave('automatic'), false);
  assert.equal(scheduledFixture.manager.currentWave, 1);
  assert.equal(scheduledFixture.manager.nextWaveTimer, automaticTimer);
  assert.equal(scheduledFixture.scene.economyManager.force, 12);
});

test('the fifth wave raises Force/XP and HP baselines by 1.15 for that wave and later waves', () => {
  const fixture = createFixture(6, 1);
  for (let wave = 1; wave <= 5; wave += 1) {
    assert.equal(fixture.manager.startNextWave('manual'), true);
  }
  assert.deepEqual(fixture.scene.spawned.map(enemy => enemy.data.force), [1, 1, 1, 1, 1.15]);
  assert.ok(Math.abs(fixture.scene.spawned[4].data.health - 115) < 1e-10);
  assert.equal(fixture.manager.forceXpBaselineMultiplier, 1.15);
  assert.equal(fixture.manager.enemyHealthBaselineMultiplier, 1.15);
  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.deepEqual(fixture.scene.spawned.map(enemy => enemy.data.force), [1, 1, 1, 1, 1.15, 1.15]);
  assert.ok(fixture.scene.spawned.slice(4).every(enemy => Math.abs(enemy.data.health - 115) < 1e-10));
  assert.equal(fixture.manager.forceXpBaselineMultiplier, 1.15);
  assert.equal(fixture.manager.enemyHealthBaselineMultiplier, 1.15);
  assert.equal(fixture.manager.startNextWave('manual'), false);
  assert.equal(fixture.manager.forceXpBaselineMultiplier, 1.15);
  assert.equal(fixture.manager.enemyHealthBaselineMultiplier, 1.15);
});

test('difficulty HP scaling remains separate from fifth-wave baseline scaling', () => {
  const fixture = createFixture(6, 1, 'HARD');
  assert.equal(fixture.manager.startNextWave(), true);
  assert.equal(fixture.scene.spawned[0].data.health, 140);
  for (let wave = 2; wave <= 5; wave += 1) fixture.manager.startNextWave('manual');
  assert.ok(Math.abs(fixture.scene.spawned[4].data.health - 161) < 1e-10);
});

test('each fifth-wave boundary compounds both mission baselines by 1.15', () => {
  const fixture = createFixture(11, 1);
  for (let wave = 1; wave <= 10; wave += 1) assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.ok(Math.abs(fixture.manager.forceXpBaselineMultiplier - (1.15 ** 2)) < 1e-12);
  assert.ok(Math.abs(fixture.manager.enemyHealthBaselineMultiplier - (1.15 ** 2)) < 1e-12);
});

test('overlapping pre-fifth-wave spawns keep their original wave scaling', () => {
  const fixture = createFixture(5, 2);
  for (let wave = 1; wave <= 4; wave += 1) fixture.manager.startNextWave('manual');
  const wave4Timer = fixture.manager.activeWaves.get(4).spawnTimer;
  fixture.manager.startNextWave('manual');
  wave4Timer.fire();
  const wave4Spawns = fixture.scene.spawned.filter(enemy => enemy.data.force === 1);
  assert.equal(wave4Spawns.length, 5);
  assert.equal(fixture.scene.spawned.filter(enemy => enemy.data.force === 1.15).length, 1);
});

test('Armored keeps 15 armor through Wave 4 and its configured armor from Wave 5', () => {
  const fixture = createFixture(5, 1);
  globalThis.window.GAME_SETTINGS.ENEMIES.ARMORED = { health: 200, force: 5, armor: 25 };
  fixture.manager.waveList = Array.from({ length: 5 }, () => ({
    count: 1,
    enemies: ['ARMORED'],
    groups: [{ type: 'ARMORED', count: 1 }],
  }));
  fixture.manager.totalWaves = 5;
  for (let wave = 1; wave <= 5; wave += 1) fixture.manager.startNextWave('manual');
  assert.deepEqual(fixture.scene.spawned.map(enemy => enemy.data.armor), [15, 15, 15, 15, 25]);
});

test('manual start does not require the countdown after a completed wave', () => {
  const fixture = createFixture(2);
  fixture.manager.startNextWave();
  completeCurrentWave(fixture);
  const countdown = fixture.manager.nextWaveTimer;
  countdown.remove();
  fixture.manager.nextWaveTimer = null;

  assert.equal(fixture.manager.startNextWave('manual'), true);
  assert.equal(fixture.manager.currentWave, 2);
  assert.equal(fixture.scene.spawned.length, 2);
});

test('missing mission wave data is explicit and does not create a playable placeholder wave', () => {
  globalThis.window.GAME_SETTINGS.MISSION_WAVES = {
    missionType: 'SECURE_REGION',
    status: 'UNCONFIGURED',
    waveCount: null,
    waves: null,
    missingData: ['wave count', 'compositions', 'counts'],
  };
  const fixture = createFixture();
  fixture.manager.waveConfiguration = globalThis.window.GAME_SETTINGS.MISSION_WAVES;
  fixture.manager.waveList = [];
  fixture.manager.totalWaves = 0;

  assert.equal(fixture.manager.getTotalWaves(), 0);
  assert.equal(fixture.manager.startNextWave(), false);
  assert.equal(fixture.manager.currentWave, 0);
  assert.equal(fixture.scene.spawned.length, 0);
  assert.equal(fixture.scene.economyManager.force, 12);
});
