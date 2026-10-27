import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import RPGManager from '../src/systems/RPGManager.js';
import { applyDamage } from '../src/systems/DamageSystem.js';
import { getUnitCombatBonuses } from '../src/systems/UnitCombatBonuses.js';
import { hasActiveStun, updateEnemyStatusEffects } from '../src/systems/EnemyStatusEffects.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const units = readJson('../src/assets/config/units.json');
const equipment = readJson('../src/assets/config/equipment.json');

function managerFor(unitId, left, right = null) {
  const manager = Object.create(RPGManager.prototype);
  manager.units = units;
  manager.equipment = equipment;
  manager.state = {
    units: { [unitId]: { id: unitId, rank: 1, stars: 0, extraCopies: 0, equipped: { left, right, utility: null }, augments: [] } },
    inventory: [left, right].filter(Boolean).map(itemId => ({ itemId })),
  };
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  return manager;
}

test('random path uses five equal slots, doubles rank values, affects profiles, and stays deployment local', () => {
  const originalRandom = Math.random;
  const expected = [
      ['criticalChance', 0.05, 'Critical Chance +5%'],
      ['criticalModifier', 0.2, 'Critical Damage +20%'],
      ['attackSpeedModifier', 0.1, 'Attack Speed +10%'],
      ['range', 0.4, 'Range +0.4 tiles'],
      ['reloadSpeed', 1 / 1.1, 'Reload Speed +10%'],
  ];
  try {
    const manager = managerFor('GUTTER_THUGS', 'slum_gat');
    expected.forEach(([stat, value, displayName], index) => {
      Math.random = () => (index + 0.01) / expected.length;
      const progression = manager.createDeploymentProgression('GUTTER_THUGS');
      progression.pathProgress = { random_path: 1 };
      progression.selectedPaths = { random_path: 1 };
      const one = manager.getEffectiveStats('GUTTER_THUGS', progression);
      assert.deepEqual(one.randomStat, { stat, value, ...(stat === 'reloadSpeed' ? { mode: 'multiplier' } : {}) });
      const path = manager.getPathChoiceState('GUTTER_THUGS', progression)
        .flatMap(tier => tier.paths).find(candidate => candidate.id === 'random_path');
      assert.equal(path.name, displayName);
      const profile = one.weaponAttacks[0];
      if (stat === 'criticalChance') assert.equal(profile.criticalChance, 0.1);
      if (stat === 'criticalModifier') assert.equal(profile.criticalModifier, 1.7);
      if (stat === 'attackSpeedModifier') assert.ok(profile.attackSpeed < 1000 / 0.85 / 0.95);
      if (stat === 'range') assert.equal(profile.range, 3 * 64 + 0.4 * 64);
      if (stat === 'reloadSpeed') assert.equal(profile.reloadSpeed, 2 / 0.95 / 1.1);
      const other = manager.getEffectiveStats('GUTTER_THUGS', progression);
      assert.deepEqual(other.randomStat, one.randomStat);
      const independent = manager.getEffectiveStats('GUTTER_THUGS', { pathProgress: { random_path: 1 }, randomStat: null });
      assert.equal(independent.randomStat, null);
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('each deployment gets its own stored roll, activated by its path, without changing owned data', () => {
  const manager = managerFor('GUTTER_THUGS', 'slum_gat');
  const before = structuredClone(manager.state);
  const originalRandom = Math.random;
  let randomIndex = 0;
  const outcomes = [0.01, 0.41];
  try {
    Math.random = () => outcomes[randomIndex++];
    const firstDeployment = manager.createDeploymentProgression('GUTTER_THUGS');
    const secondDeployment = manager.createDeploymentProgression('GUTTER_THUGS');
    assert.deepEqual(firstDeployment.randomStat, { stat: 'criticalChance', value: 0.05 });
    assert.deepEqual(secondDeployment.randomStat, { stat: 'attackSpeedModifier', value: 0.1 });
    const withoutPath = manager.getEffectiveStats('GUTTER_THUGS', firstDeployment);
    assert.equal(withoutPath.weaponAttacks[0].criticalChance, 0.05);
    firstDeployment.pathProgress.random_path = 1;
    firstDeployment.selectedPaths.random_path = 1;
    const randomPath = manager.getPathChoiceState('GUTTER_THUGS', firstDeployment)
      .flatMap(tier => tier.paths).find(path => path.id === 'random_path');
    assert.equal(randomPath.name, 'Critical Chance +5%');
    assert.match(randomPath.description, /Critical Chance \+5%/);
    const first = manager.getEffectiveStats('GUTTER_THUGS', firstDeployment);
    assert.equal(first.weaponAttacks[0].criticalChance, 0.1);
    const refreshed = manager.getEffectiveStats('GUTTER_THUGS', firstDeployment);
    assert.deepEqual(refreshed.randomStat, first.randomStat);
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(manager.state, before);
});

test('Gutter Thug stun and Belter Pirate bleed attach only on successful melee proc', () => {
  const originalRandom = Math.random;
  const applied = [];
  const enemy = {
    health: 90,
    armor: 0,
    data: { vulnerabilities: {} },
    statusEffects: [],
    takeDamage(amount) { this.health -= amount; },
    applyStatusEffect(effect) { applied.push(effect); this.statusEffects.push(effect); },
  };
  try {
    Math.random = () => 0;
    applyDamage(enemy, { damage: 1, attackType: 'melee', sourceTower: {}, specialProperties: [
      { property: 'meleeStunChance', value: 0.05, duration: 500 },
      { property: 'meleeStunChance', value: 0.05, duration: 500 },
      { property: 'meleeBleedChance', value: 0.1, healthFraction: 0.1, duration: 5000 },
      { property: 'meleeBleedChance', value: 0.1, healthFraction: 0.1, duration: 5000 },
    ] });
    assert.deepEqual(applied.map(effect => effect.type), ['stun', 'bleed']);
    assert.equal(applied[0].duration, 500);
    assert.equal(hasActiveStun(applied), true);
    assert.equal(applied[1].totalDamage, 8.9);
    assert.equal(applied[1].duration, 5000);
    assert.equal(applied[1].interval, 500);
  } finally {
    Math.random = originalRandom;
  }
});

test('stun expires at 0.5 seconds and bleed resolves its full damage over 5 seconds', () => {
  const enemy = {
    health: 100,
    statusEffects: [
      { type: 'stun', duration: 500, endTime: 500, nextTick: 0 },
      { type: 'bleed', totalDamage: 10, duration: 5000, interval: 500, endTime: 5000, nextTick: 0 },
    ],
    sprite: { clearTint() {} },
    takeDamage(amount) { this.health -= amount; },
  };
  assert.equal(hasActiveStun(enemy.statusEffects), true);
  updateEnemyStatusEffects(enemy, 0);
  updateEnemyStatusEffects(enemy, 499);
  assert.equal(hasActiveStun(enemy.statusEffects), true);
  for (let time = 500; time < 5000; time += 500) updateEnemyStatusEffects(enemy, time);
  assert.equal(hasActiveStun(enemy.statusEffects), false);
  updateEnemyStatusEffects(enemy, 5000);
  assert.equal(enemy.health, 90);
  assert.deepEqual(enemy.statusEffects, []);
});

test('melee path properties reach both one-handed and two-handed live weapon profiles', () => {
  for (const [unitId, pathId, weaponId, property] of [
    ['GUTTER_THUGS', 'melee_stun', 'lead_pipe', 'meleeStunChance'],
    ['GUTTER_THUGS', 'melee_stun', 'shiv', 'meleeStunChance'],
    ['BELTER_PIRATE', 'bleed_melee', 'lead_pipe', 'meleeBleedChance'],
    ['BELTER_PIRATE', 'bleed_melee', 'shiv', 'meleeBleedChance'],
  ]) {
    const manager = managerFor(unitId, weaponId);
    const profile = manager.getEffectiveStats(unitId, { pathProgress: { [pathId]: 1 } }).weaponAttacks[0];
    assert.equal(profile.attackType, 'melee');
    assert.ok(profile.specialProperties.some(effect => effect.property === property));
  }
});

test('melee-only effects do not proc from ranged hits', () => {
  const originalRandom = Math.random;
  const applied = [];
  const enemy = { health: 100, armor: 0, data: { vulnerabilities: {} }, statusEffects: [],
    takeDamage(amount) { this.health -= amount; }, applyStatusEffect(effect) { applied.push(effect); } };
  try {
    Math.random = () => 0;
    applyDamage(enemy, { damage: 1, attackType: 'ranged', sourceTower: {}, specialProperties: [
      { property: 'meleeStunChance', value: 1, duration: 500 },
      { property: 'meleeBleedChance', value: 1, healthFraction: 0.1, duration: 5000 },
    ] });
    assert.deepEqual(applied, []);
  } finally {
    Math.random = originalRandom;
  }
});

test('mixed weapon crit and unit count damage bonuses apply once', () => {
  const specialProperties = [
      { property: 'mixedWeaponCritChance', value: 0.05 },
      { property: 'mixedWeaponCritChance', value: 0.05 },
      { property: 'unitCountDamage', value: 0.0075 },
      { property: 'unitCountDamage', value: 0.0075 },
  ];
  const bonuses = getUnitCombatBonuses({
    specialProperties,
    weaponAttacks: [{ attackType: 'ranged' }, { attackType: 'melee' }],
    deployedCount: 3,
  });
  assert.equal(10 * bonuses.damageMultiplier, 10 * (1 + 3 * 0.0075));
  assert.equal(0.05 + bonuses.criticalChanceBonus, 0.1);
});
