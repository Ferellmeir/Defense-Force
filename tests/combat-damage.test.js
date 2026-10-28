import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDamage } from '../src/systems/DamageSystem.js';
import { withTileChanceBonus } from '../src/systems/combatChance.js';

function target(armor) {
  return {
    armor,
    health: 1000,
    maxHealth: 1000,
    data: {},
    hits: [],
    effects: [],
    takeDamage(amount) { this.hits.push(amount); },
    applyStatusEffect(effect) { this.effects.push(effect); },
  };
}

test('physical damage subtracts armor after applying workbook percentage penetration', () => {
  const enemy = target(20);
  const result = applyDamage(enemy, { damage: 100, damageType: 'Physical', armorPenetration: 0.25 });
  assert.equal(result.effectiveArmor, 15);
  assert.equal(result.amount, 85);
  assert.equal(enemy.hits[0], 85);
});

test('energy damage reduces damage by effective armor percent', () => {
  const enemy = target(20);
  const result = applyDamage(enemy, { damage: 100, damageType: 'energy', armorPenetration: 0.25 });
  assert.equal(result.effectiveArmor, 15);
  assert.equal(result.amount, 85);
});

test('every hit deals at least one damage after armor mitigation', () => {
  const enemy = target(200);
  const result = applyDamage(enemy, { damage: 10, damageType: 'physical' });
  assert.equal(result.amount, 1);
  assert.equal(enemy.hits[0], 1);
});

test('critical multiplier applies after armor mitigation', () => {
  const enemy = target(10);
  const result = applyDamage(enemy, {
    damage: 20,
    damageType: 'physical',
    criticalChance: 1,
    criticalModifier: 1.5,
  });
  assert.equal(result.isCritical, true);
  assert.equal(result.amount, 15);
});

test('acid reduces armor by 0.5 per 100 damage dealt', () => {
  const enemy = target(20);
  applyDamage(enemy, { damage: 120, damageType: 'acid' });
  assert.equal(enemy.hits[0], 100);
  assert.equal(enemy.armor, 19.5);
});

test('fire applies 15 percent damage over five seconds as a separate damage effect', () => {
  const enemy = target(10);
  applyDamage(enemy, { damage: 100, damageType: 'Fire' });
  assert.equal(enemy.hits[0], 90);
  assert.equal(enemy.effects.length, 1);
  assert.equal(enemy.effects[0].totalDamage, 13.5);
  assert.equal(enemy.effects[0].duration, 5000);
  assert.equal(enemy.effects[0].interval, 1000);
});

test('first-hit path bonus is applied once per target', () => {
  const enemy = target(0);
  const tower = { firstHitTargets: new WeakSet() };
  const attack = {
    damage: 100,
    damageType: 'Physical',
    sourceTower: tower,
    specialProperties: [{ property: 'firstHitDamage', value: 0.15 }],
  };
  assert.ok(Math.abs(applyDamage(enemy, attack).amount - 115) < 1e-10);
  assert.equal(applyDamage(enemy, attack).amount, 100);
});

test('Anarcho passive applies the critical modifier to fire damage over time', () => {
  const enemy = target(0);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    applyDamage(enemy, {
      damage: 100,
      damageType: 'Fire',
      criticalChance: 1,
      criticalModifier: 2,
      specialProperties: [{ property: 'criticalFireDot' }],
    });
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(enemy.effects[0].totalDamage, 60);
});

test('Adaptability adds five percentage points to applicable combat chances', () => {
  assert.equal(withTileChanceBonus(0.25, { specialTileType: 'adaptability_network' }), 0.3);
  assert.equal(withTileChanceBonus(0.25, { specialTileType: 'none' }), 0.25);
  const originalRandom = Math.random;
  Math.random = () => 0.52;
  try {
    const enemy = target(20);
    applyDamage(enemy, {
      damage: 20,
      damageType: 'Physical',
      specialTileType: 'adaptability_network',
      specialProperties: [{ property: 'armorIgnoreChance', value: 0.5, amount: 1 }],
    });
    assert.equal(enemy.armor, 20);
    assert.equal(enemy.hits[0], 20, 'the 55% armor ignore chance succeeds at a 52% roll');
  } finally { Math.random = originalRandom; }
});

test('Dark Alley adds one melee stun roll with a 500 ms stun and never stuns from ranged attacks', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.09;
  try {
    const meleeEnemy = target(0);
    applyDamage(meleeEnemy, {
      damage: 1, attackType: 'melee', specialTileType: 'dark_alley',
      specialProperties: [{ property: 'meleeStunChance', value: 0.2, duration: 1200 }],
      sourceTower: {},
    });
    assert.deepEqual(meleeEnemy.effects.filter(effect => effect.type === 'stun').map(effect => effect.duration), [500]);
    const rangedEnemy = target(0);
    applyDamage(rangedEnemy, { damage: 1, attackType: 'ranged', specialTileType: 'dark_alley', sourceTower: {} });
    assert.equal(rangedEnemy.effects.some(effect => effect.type === 'stun'), false);
  } finally { Math.random = originalRandom; }
});

test('Adaptability adds five points to a unit melee proc chance', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.23;
  try {
    const enemy = target(0);
    applyDamage(enemy, {
      damage: 1, attackType: 'melee', specialTileType: 'adaptability_network', sourceTower: {},
      specialProperties: [{ property: 'meleeStunChance', value: 0.2, duration: 400 }],
    });
    assert.equal(enemy.effects.some(effect => effect.type === 'stun'), true, '25% chance succeeds at 23%');
  } finally { Math.random = originalRandom; }
});
