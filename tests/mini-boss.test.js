import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { applySwarmSpeedBuff, activateSwarmer, cleanupMiniBossAbilities, MINI_BOSS_ABILITIES, updateArmorAura, updateGrafting } from '../src/systems/miniBossAbilities.js';
import {
  addMiniBossToWave,
  getEnemyEquivalentCount,
  MINI_BOSS_FIRST_WAVE,
  resolveMiniBossWave,
} from '../src/systems/miniBossWaves.js';

const definitions = JSON.parse(fs.readFileSync(new URL('../src/assets/config/enemies.json', import.meta.url), 'utf8'));
const wave = waveNumber => ({ waveNumber, groups: [{ type: 'NORMAL', count: 10 }], enemies: Array(10).fill('NORMAL'), spawnQueue: Array(10).fill('NORMAL'), count: 10, enemyEquivalentCount: 10 });

test('mini-boss probability starts on wave 10, rises by 3 points on misses, and resets after one random selection', () => {
  let calls = 0;
  const beforeEligible = resolveMiniBossWave(wave(9), { chance: 20, random: () => { calls++; return 0; } });
  assert.equal(beforeEligible.chance, 20);
  assert.equal(beforeEligible.miniBossType, null);
  assert.equal(calls, 0);
  const missed = resolveMiniBossWave(wave(10), { chance: 20, random: () => 0.25 });
  assert.equal(missed.chance, 23);
  assert.equal(missed.miniBossType, null);
  const spawned = resolveMiniBossWave(wave(11), { chance: 23, random: () => 0, typeRandom: () => 0.5 });
  assert.equal(spawned.miniBossType, 'ARMORER');
  assert.equal(spawned.chance, 20);
  assert.equal(spawned.waveData.spawnQueue.filter(type => definitions[type]?.miniBoss).length, 1);
});

test('mini-boss is inserted in the middle and counts as five equivalents but one physical spawn', () => {
  const inserted = addMiniBossToWave(wave(MINI_BOSS_FIRST_WAVE), 'GRAFTER');
  assert.equal(inserted.count, 11);
  assert.equal(inserted.spawnQueue[5], 'GRAFTER');
  assert.equal(inserted.spawnQueue[0], 'NORMAL');
  assert.equal(inserted.spawnQueue.at(-1), 'NORMAL');
  assert.equal(inserted.enemyEquivalentCount, 15);
  assert.equal(getEnemyEquivalentCount([{ type: 'GRAFTER', count: 1 }], definitions), 5);
});

function makeAbilityEnemy(type, x, y, others = []) {
  const enemy = {};
  enemy.type = type;
  enemy.x = x;
  enemy.y = y;
  enemy.scene = { gameTime: 0, mapManager: { getCurrentMap: () => ({ tileSize: 10 }) }, enemyManager: { getAll: () => [enemy, ...others] } };
  enemy.isDying = false;
  enemy.reachedEnd = false;
  enemy.ability = MINI_BOSS_ABILITIES[type];
  return enemy;
}

test('Swarmer snapshots targets in range, doubles already modified speed, and expires after five seconds', () => {
  assert.deepEqual(MINI_BOSS_ABILITIES.SWARMER, { interval: 12000, radius: 5, duration: 5000 });
  const swarmer = makeAbilityEnemy('SWARMER', 0, 0);
  swarmer.ability.duration = 5000;
  const target = { x: 40, y: 0, isDying: false, reachedEnd: false, scene: swarmer.scene };
  swarmer.scene.enemyManager.getAll = () => [swarmer, target];
  activateSwarmer(swarmer, 1000);
  assert.equal(target.swarmSpeedBuffs.get(swarmer), 6000);
  assert.equal(applySwarmSpeedBuff(12, target.swarmSpeedBuffs, 5999, swarmer.scene), 24);
  assert.equal(applySwarmSpeedBuff(12, target.swarmSpeedBuffs, 6000, swarmer.scene), 12);
  const entrant = { x: 1, y: 1 };
  assert.equal(entrant.swarmSpeedBuffs, undefined);
});

test('Armorer aura adds one separate armor modifier and removes it after leaving range or source cleanup', () => {
  assert.deepEqual(MINI_BOSS_ABILITIES.ARMORER, { radius: 4, armor: 10 });
  const target = { armorModifiers: new Map(), baseArmor: 20 };
  Object.defineProperty(target, 'armor', {
    get() { return this.baseArmor + [...this.armorModifiers.values()].reduce((sum, value) => sum + value, 0); },
    set(value) { this.baseArmor = value; },
  });
  target.setArmorModifier = (source, amount) => {
    if (amount === null) target.armorModifiers.delete(source);
    else target.armorModifiers.set(source, amount);
  };
  target.x = 20;
  target.y = 0;
  target.isDying = false;
  target.reachedEnd = false;
  const armorer = makeAbilityEnemy('ARMORER', 0, 0, [target]);
  target.scene = armorer.scene;
  armorer.armorAuraTargets = new Set();
  updateArmorAura(armorer);
  assert.equal(target.armor, 30);
  updateArmorAura(armorer);
  assert.equal(target.armor, 30);
  target.x = 50;
  updateArmorAura(armorer);
  assert.equal(target.armor, 20);
  target.x = 20;
  updateArmorAura(armorer);
  assert.equal(target.armor, 30);
  cleanupMiniBossAbilities(armorer);
  assert.equal(target.armor, 20);
});

test('Grafter heals at most 500 per target over three seconds and takes matching direct damage', () => {
  assert.deepEqual(MINI_BOSS_ABILITIES.GRAFTER, { interval: 3000, radius: 4, maxHeal: 500, duration: 3000 });
  const grafter = makeAbilityEnemy('GRAFTER', 0, 0);
  grafter.nextAbilityAt = 3000;
  grafter.graftActivations = [];
  grafter.health = 2000;
  grafter.maxHealth = 2000;
  grafter.isDying = false;
  grafter.takeDamage = amount => { grafter.damage = (grafter.damage || 0) + amount; grafter.health -= amount; };
  const target = { x: 30, y: 0, health: 100, maxHealth: 2000, isDying: false, reachedEnd: false, scene: grafter.scene, updateHealthBar() {} };
  grafter.scene.enemyManager.getAll = () => [grafter, target];
  updateGrafting(grafter, 3000);
  assert.equal(grafter.graftActivations[0].total, 500);
  for (const now of [4000, 5000, 6000]) updateGrafting(grafter, now);
  assert.ok(Math.abs(target.health - 600) < 1e-9);
  assert.ok(Math.abs(grafter.damage - 500) < 1e-9);
  assert.ok(Math.abs(grafter.health - 1500) < 1e-9);
  assert.equal(grafter.graftActivations.length, 1);
  assert.equal(grafter.graftActivations[0].total, 500);
  assert.equal(grafter.graftActivations[0].nextTickAt, 7000);
});
