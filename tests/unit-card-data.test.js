import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActiveUnitCombatEffects,
  getUnitCardCombatProfiles,
  getUnitCardEquipment,
  getUnitCardUpgradeColumns,
} from '../src/systems/unitCardData.js';
import { getEffectiveAttackInterval, getEffectiveAttackRange } from '../src/systems/towerCombatReadout.js';

function makeTower() {
  const tower = {};
  tower.towerData = {
    specialProperties: [{ property: 'waveStartAttackSpeedBoost', value: 0.2, duration: 5000 }],
    weaponAttacks: [{ attackType: 'ranged' }],
    equipped: { left: 'rifle', right: null },
    augments: ['optic'],
  };
  tower.weaponAttackStates = [{
    profile: {
      weaponId: 'rifle', damage: 120, damageType: 'Energy', attackType: 'ranged',
      attackSpeed: 1000, range: 256, criticalChance: 0.1, criticalModifier: 1.5,
      armorPenetration: 0.25, reloadSpeed: 2500, aoeRadius: 40,
      statusEffects: [{ type: 'slow' }],
    },
    ammoMagazine: { ammoRemaining: 3, capacity: 5 },
  }];
  tower.equipment = {
    weapons: [{ id: 'rifle', name: 'Rifle', type: 'weapon', hands: 2 }],
    utility: { id: 'gear', name: 'Gear', type: 'utility' },
  };
  tower.stimpackActiveUntil = 4000;
  tower.critDamageBoostUntil = 0;
  tower.exposedHitAttackSpeedUntil = 0;
  tower.allyDamageBuffUntil = 3500;
  tower.allyDamageBuffValue = 0.05;
  tower.placementTile = { specialType: 'snipers_nest' };
  tower.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  tower.getEffectiveAttackInterval = (state, time) => getEffectiveAttackInterval(tower, state, time);
  tower.getEffectiveAttackRange = state => getEffectiveAttackRange(tower, state);
  return tower;
}

test('unit-card combat rows reuse active weapon profile, tile range and temporary attack cadence', () => {
  const tower = makeTower();
  tower.stimpackActiveUntil = 4000;

  const [profile] = getUnitCardCombatProfiles(tower, 1000, 1);
  assert.equal(profile.name, 'Rifle');
  assert.equal(profile.damage, 120);
  assert.equal(profile.range, 320);
  assert.equal(profile.interval, 1000 / 1.2);
  assert.equal(profile.criticalChance, 0.1);
  assert.equal(profile.armorPenetration, 0.25);
  assert.equal(profile.reload, 2500);
  assert.equal(profile.ammoRemaining, 3);
  assert.deepEqual(profile.statusEffects, ['slow']);
});

test('unit-card temporary effect rows disappear at expiry and equipment stays instance-specific', () => {
  const tower = makeTower();
  const manager = { getItemDefinition: id => ({ id, name: id.toUpperCase(), type: 'augment' }) };
  assert.deepEqual(getActiveUnitCombatEffects(tower, 1000).map(effect => effect.label), [
    'Attack speed +20%', 'Adjacent ally damage +5%', 'Sniper nest: extra range and distance damage',
  ]);
  assert.deepEqual(getActiveUnitCombatEffects(tower, 4000).map(effect => effect.label), [
    'Sniper nest: extra range and distance damage',
  ]);
  assert.deepEqual(getUnitCardEquipment(tower, manager).map(row => [row.slot, row.item?.id || null]), [
    ['Left hand', 'rifle'], ['Right hand', null], ['Utility', 'gear'], ['Augment', 'optic'],
  ]);
});

test('unit-card upgrade columns preserve distinct tier states and available choices', () => {
  const tiers = getUnitCardUpgradeColumns([
    { tier: 3, unlocked: false, paths: [{ id: 'third' }] },
    { tier: 1, unlocked: true, paths: [{ id: 'first', available: true }] },
    { tier: 2, unlocked: false, paths: [{ id: 'second' }] },
  ]);
  assert.deepEqual(tiers.map(tier => tier.tier), [1, 2, 3]);
  assert.equal(tiers[0].paths[0].available, true);
  assert.equal(tiers[2].unlocked, false);
});
