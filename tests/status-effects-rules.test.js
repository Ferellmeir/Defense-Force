import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDamage } from '../src/systems/DamageSystem.js';
import { applyEnemyStatusEffect, updateEnemyStatusEffects } from '../src/systems/EnemyStatusEffects.js';

function enemy({ health = 1000, maxHealth = health, armor = 0 } = {}) {
  return {
    health, maxHealth, armor, data: {}, statusEffects: [], hits: [],
    takeDamage(amount) { this.hits.push(amount); this.health -= amount; if (this.health <= 0) this.isDying = true; },
    applyStatusEffect(effect) { return applyEnemyStatusEffect(this, effect, 0); },
    isDead() { return this.health <= 0; },
  };
}

test('Bleed snapshots current health and applies armor once to its total', () => {
  const target = enemy({ health: 1000, armor: 20 });
  applyDamage(target, { damage: 10, damageType: 'Physical', specialProperties: [{ property: 'bleedChance', value: 1, healthFraction: 0.1 }] });
  const bleed = target.statusEffects.find(effect => effect.type === 'bleed');
  assert.equal(bleed.totalDamage, 79.9);
  assert.equal(bleed.tickDamage, 15.98);
  assert.equal(bleed.armorApplied, true);
});

test('Poison snapshots maximum health and refreshes without stacking', () => {
  const target = enemy({ health: 400, maxHealth: 1000, armor: 500 });
  applyDamage(target, { damage: 1, statusEffects: [{ type: 'poison' }] });
  const first = target.statusEffects[0];
  assert.equal(first.totalDamage, 50);
  target.health = 100;
  target.applyStatusEffect({ type: 'poison', totalDamage: 50, duration: 5000 });
  assert.equal(target.statusEffects.length, 1);
  assert.equal(target.statusEffects[0].tickDamage, 10);
});

test('Pallid poison doubling doubles the calculated total once and distributes it across five ticks', () => {
  const target = enemy({ maxHealth: 1000, armor: 900 });
  applyDamage(target, {
    damage: 1,
    statusEffects: [{ type: 'poison' }],
    specialProperties: [{ property: 'doublePoisonEffects' }],
  });
  const poison = target.statusEffects.find(effect => effect.type === 'poison');
  assert.equal(poison.totalDamage, 100);
  assert.equal(poison.tickDamage, 20);
  target.hits = [];
  for (const time of [1000, 2000, 3000, 4000, 5000]) updateEnemyStatusEffects(target, time);
  assert.deepEqual(target.hits, [20, 20, 20, 20, 20]);
  assert.equal(target.hits.reduce((total, tick) => total + tick, 0), 100);
});

test('Fire snapshots attack damage, stacks, and ignores armor', () => {
  const target = enemy();
  applyDamage(target, { damage: 100, damageType: 'Fire' });
  applyDamage(target, { damage: 40, damageType: 'Fire' });
  assert.deepEqual(target.statusEffects.map(effect => effect.totalDamage), [15, 6]);
  assert.equal(target.statusEffects.length, 2);
  target.armor = 300;
  target.hits = [];
  updateEnemyStatusEffects(target, 1000);
  assert.equal(target.hits.length, 2);
  assert.ok(Math.abs(target.hits[0] - 3) < 1e-9);
  assert.ok(Math.abs(target.hits[1] - 1.2) < 1e-9);
});

test('Bleed and Poison refresh expiry while preserving the original tick damage', () => {
  const target = enemy();
  applyEnemyStatusEffect(target, { type: 'bleed', totalDamage: 100, duration: 5000 }, 0);
  const bleed = target.statusEffects[0];
  bleed.nextTick = 3000;
  bleed.tickCount = 3;
  applyEnemyStatusEffect(target, { type: 'bleed', totalDamage: 900, duration: 5000 }, 2000);
  assert.equal(target.statusEffects.length, 1);
  assert.equal(bleed.tickDamage, 20);
  assert.equal(bleed.endTime, 7000);
  assert.equal(bleed.tickCount, 5);
});

test('source configured Bleed duration bonus adds two ticks without changing the snapshot percentage', () => {
  const target = enemy();
  applyDamage(target, { damage: 1, specialProperties: [
    { property: 'bleedChance', value: 1, healthFraction: 0.1, duration: 5000 },
    { property: 'bleedDurationBonus', value: 2000 },
  ] });
  assert.equal(target.statusEffects[0].duration, 7000);
  assert.equal(target.statusEffects[0].tickCount, 7);
  assert.equal(target.statusEffects[0].totalDamage, 99.9);
});

test('Exposed raises direct critical chance; Vulnerable affects attacks and not DoT', () => {
  const oldRandom = Math.random;
  Math.random = () => 0.12;
  try {
    const target = enemy();
    target.applyStatusEffect({ type: 'exposed', criticalChanceBonus: 0.15 });
    assert.equal(applyDamage(target, { damage: 100, criticalChance: 0.05, criticalModifier: 2 }).isCritical, true);
    target.statusEffects = [{ type: 'vulnerable', damageTakenMultiplier: 0.15, endTime: 5000 }];
    assert.ok(Math.abs(applyDamage(target, { damage: 100 }).amount - 115) < 1e-9);
    target.hits = [];
    target.statusEffects = [{ type: 'vulnerable', damageTakenMultiplier: 0.5, endTime: 5000 }, { type: 'fire', totalDamage: 50, duration: 5000, endTime: 5000, nextTick: 1000 }];
    updateEnemyStatusEffects(target, 1000);
    assert.equal(target.hits[0], 10);
  } finally { Math.random = oldRandom; }
});

test('Weakened amplifies status damage but not direct attacks; ticks are one second and at least one damage', () => {
  const target = enemy();
  target.applyStatusEffect({ type: 'weakened', damageTakenMultiplier: 0.25 });
  target.applyStatusEffect({ type: 'poison', totalDamage: 2, duration: 5000 });
  assert.equal(applyDamage(target, { damage: 100 }).amount, 100);
  target.hits = [];
  updateEnemyStatusEffects(target, 999);
  assert.equal(target.hits.length, 0);
  updateEnemyStatusEffects(target, 3000);
  assert.deepEqual(target.hits, [1, 1, 1]);
});

test('DoT ticks do not roll critical hits, and fractional durations round up to a tick boundary', () => {
  const target = enemy();
  applyEnemyStatusEffect(target, { type: 'fire', totalDamage: 25, duration: 1500 }, 0);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('DoT ticks must not roll critical hits'); };
  try {
    updateEnemyStatusEffects(target, 1000);
    updateEnemyStatusEffects(target, 2000);
  } finally { Math.random = originalRandom; }
  assert.deepEqual(target.hits, [5, 5]);
  assert.equal(target.statusEffects.length, 0);
});

test('duration extension adds ticks using the original snapshot and expired effects stop', () => {
  const target = enemy();
  applyEnemyStatusEffect(target, { type: 'poison', totalDamage: 50, duration: 5000 }, 0);
  const poison = target.statusEffects[0];
  [1000, 2000, 3000, 4000].forEach(time => updateEnemyStatusEffects(target, time));
  applyEnemyStatusEffect(target, { type: 'poison', totalDamage: 999, duration: 5000 }, 4000);
  assert.equal(poison.tickDamage, 10);
  assert.equal(poison.tickCount, 5);
  updateEnemyStatusEffects(target, 10000);
  assert.equal(target.hits.length, 9);
  updateEnemyStatusEffects(target, 11000);
  assert.equal(target.hits.length, 9);
});

test('dead targets stop receiving simultaneous status ticks', () => {
  const target = enemy({ health: 1 });
  applyEnemyStatusEffect(target, { type: 'fire', totalDamage: 100, duration: 5000 }, 0);
  applyEnemyStatusEffect(target, { type: 'poison', totalDamage: 100, duration: 5000 }, 0);
  updateEnemyStatusEffects(target, 1000);
  assert.equal(target.hits.length, 1);
});
