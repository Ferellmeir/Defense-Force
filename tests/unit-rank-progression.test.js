import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';
import { getUnitRankProgress } from '../src/systems/unitRankProgress.js';

const unit = {
  id: 'UNIT', name: 'Test Unit', cost: 10,
  baseStats: {
    damage: 0, range: 0, attackSpeed: 1000, projectileSpeed: 0, armorPenetration: 0,
    attackSpeedModifier: 0.1, criticalChance: 0.1, criticalModifier: 0.2,
    rangedSkill: 0.1, meleeSkill: 0.2, reloadSpeed: 0.1,
  },
  pathTiers: [],
  passive: null,
};

function makeManager(saved = {}) {
  const manager = Object.create(RPGManager.prototype);
  manager.units = { UNIT: unit };
  manager.equipment = { items: {}, augments: {}, rarities: {} };
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  manager.state = { ...manager.createDefaultState(), ...saved, units: saved.units || {} };
  manager.saves = 0;
  manager.save = () => { manager.saves += 1; };
  return manager;
}

test('copy acquisitions progress through each increasing threshold and stop at five stars', () => {
  const manager = makeManager();
  assert.equal(manager.addUnitCopy('UNIT'), true);
  assert.deepEqual(
    [manager.getOwnedUnit('UNIT').stars, manager.getOwnedUnit('UNIT').extraCopies],
    [0, 0],
    'first copy unlocks at zero stars',
  );

  for (let required = 1; required <= 5; required += 1) {
    for (let count = 0; count < required; count += 1) manager.addUnitCopy('UNIT');
    const owned = manager.getOwnedUnit('UNIT');
    assert.equal(owned.stars, required);
    assert.equal(owned.extraCopies, 0);
    assert.equal(owned.rank, required);
  }
  manager.addUnitCopy('UNIT', 20);
  assert.equal(manager.getOwnedUnit('UNIT').stars, 5);
  assert.equal(manager.getOwnedUnit('UNIT').extraCopies, 0);
});

test('a counted acquisition can cross multiple rank thresholds and retain partial progress', () => {
  const manager = makeManager();
  manager.addUnitCopy('UNIT');
  manager.addUnitCopy('UNIT', 6);
  assert.equal(manager.getOwnedUnit('UNIT').stars, 3);
  assert.equal(manager.getOwnedUnit('UNIT').extraCopies, 0);

  manager.addUnitCopy('UNIT', 2);
  assert.equal(manager.getOwnedUnit('UNIT').stars, 3);
  assert.equal(manager.getOwnedUnit('UNIT').extraCopies, 2);
});

test('rank bonus uses fresh base stats on every calculation and scales by six percent per star', () => {
  const manager = makeManager({ units: { UNIT: { id: 'UNIT', stars: 5, rank: 5, extraCopies: 0, equipped: {}, augments: [] } } });
  const first = manager.getEffectiveStats('UNIT');
  const second = manager.getEffectiveStats('UNIT');
  for (const [stat, base] of Object.entries({
    attackSpeedModifier: 0.1, criticalChance: 0.1,
    rangedSkill: 0.1, meleeSkill: 0.2, reloadSpeed: 0.1,
  })) {
    assert.equal(first[stat], base * 1.3, `${stat} receives 6% per star`);
    assert.equal(second[stat], first[stat], `${stat} does not compound on recalculation`);
  }
  assert.equal(first.criticalModifier, 1 + (0.2 * 1.3));
  assert.equal(second.criticalModifier, first.criticalModifier);
});

test('rank-five passive is data-driven and only applied once the unit reaches five stars', () => {
  const rankUnit = {
    ...unit,
    additionalPassive: {
      name: 'Configured extra passive',
      type: 'stat',
      stat: 'attackSpeedModifier',
      value: 0.2,
    },
  };
  const manager = makeManager({ units: { UNIT: { id: 'UNIT', stars: 4, extraCopies: 0, equipped: {}, augments: [] } } });
  manager.units.UNIT = rankUnit;
  assert.equal(manager.getEffectiveStats('UNIT').extraPassive, null);
  assert.ok(Math.abs(manager.getEffectiveStats('UNIT').attackSpeedModifier - 0.124) < 1e-12);
  manager.getOwnedUnit('UNIT').stars = 5;
  const stats = manager.getEffectiveStats('UNIT');
  assert.equal(stats.extraPassive.name, 'Configured extra passive');
  assert.ok(Math.abs(stats.attackSpeedModifier - 0.33) < 1e-12);
});

test('legacy rank is migrated to stars, while ambiguous legacy copies do not become invented progress', () => {
  const saved = {
    units: { UNIT: { id: 'UNIT', rank: 3, copies: 6, extraPassiveUnlocked: true } },
  };
  let serialized = JSON.stringify(saved);
  globalThis.window = {
    GAME_SETTINGS: { UNITS: { UNIT: unit }, EQUIPMENT: { items: {}, augments: {} } },
    localStorage: { getItem: () => serialized, setItem: (_key, value) => { serialized = value; } },
  };
  const loaded = new RPGManager({}).getOwnedUnit('UNIT');
  assert.equal(loaded.stars, 3);
  assert.equal(loaded.rank, 3);
  assert.equal(loaded.extraCopies, 0);
  assert.equal(loaded.extraPassiveUnlocked, false);
  assert.equal(loaded.copies, 6, 'legacy field remains preserved but is not treated as current progress');
});

test('deployment rank display data tracks the currently selected unit and handles missing ownership', () => {
  const first = getUnitRankProgress({ stars: 2, extraCopies: 1 });
  assert.deepEqual(first, { stars: 2, extraCopies: 1, copiesRequired: 3, maxed: false });
  const nextSelection = getUnitRankProgress({ stars: 5, extraCopies: 99 });
  assert.deepEqual(nextSelection, { stars: 5, extraCopies: 0, copiesRequired: 6, maxed: true });
  assert.equal(getUnitRankProgress(null), null);
});
