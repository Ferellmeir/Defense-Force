import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import RPGManager from '../src/systems/RPGManager.js';
import { getDeploymentUpgradeOverview } from '../src/systems/deploymentUpgradeOverview.js';

const units = JSON.parse(readFileSync(new URL('../src/assets/config/units.json', import.meta.url), 'utf8'));
const manager = Object.create(RPGManager.prototype);
manager.units = units;

test('overview follows the selected unit and includes every path from every tier', () => {
  const thug = getDeploymentUpgradeOverview(manager, 'GUTTER_THUGS');
  const blade = getDeploymentUpgradeOverview(manager, 'PALLID_ORDER_BLADE');

  assert.deepEqual(thug.map(tier => tier.paths.map(path => path.id)), manager.getPathTiers('GUTTER_THUGS').map(tier => tier.paths.map(path => path.id)));
  assert.equal(thug.length, 3);
  assert.equal(thug[1].paths.some(path => path.id === 'random_path'), true);
  assert.equal(blade.length, 3);
  assert.deepEqual(blade.map(tier => tier.paths.map(path => path.id)), manager.getPathTiers('PALLID_ORDER_BLADE').map(tier => tier.paths.map(path => path.id)));
  assert.deepEqual(blade.flatMap(tier => tier.paths).map(path => path.id), [
    'damage', 'single_weapon_crit', 'first_hit', 'random_path', 'armor_ignore', 'status_duration',
    'missing_health_damage', 'status_stack_damage',
  ]);
  assert.notDeepEqual(thug.map(tier => tier.paths.map(path => path.id)), blade.map(tier => tier.paths.map(path => path.id)));
});

test('explicitly unimplemented paths remain labeled without invented details', () => {
  const previousUnits = manager.units;
  manager.units = { ...units, TEST_UNIMPLEMENTED: { id: 'TEST_UNIMPLEMENTED', pathTiers: [
    { tier: 1, paths: [{ id: 'unknown', unimplemented: true }] },
  ] } };
  const overview = getDeploymentUpgradeOverview(manager, 'TEST_UNIMPLEMENTED');
  manager.units = previousUnits;
  assert.equal(overview[0].paths[0].name, 'Unimplemented path');
  assert.equal(overview[0].paths[0].status, 'Unimplemented');
  assert.equal(overview[0].paths[0].effect, 'Unimplemented');
});

test('progression statuses and stored random roll are displayed without changing progression', () => {
  const progression = {
    pathProgress: { damage: 1 },
    pathTierSelection: { 1: { selected: ['damage'] } },
    randomStat: { stat: 'criticalChance', value: 0.05 },
  };
  const before = structuredClone(progression);
  const overview = getDeploymentUpgradeOverview(manager, 'GUTTER_THUGS', progression);

  assert.match(overview[0].paths.find(path => path.id === 'damage').status, /Acquired · 1\/3 · available now/);
  assert.match(overview[1].paths.find(path => path.id === 'random_path').name, /Critical Chance \+5%/);
  assert.match(overview[1].paths.find(path => path.id === 'random_path').status, /Locked/);
  assert.deepEqual(progression, before);
});

test('Gutter Thug T3 displays its complete source-defined Weakened bonus', () => {
  const overview = getDeploymentUpgradeOverview(manager, 'GUTTER_THUGS', { pathProgress: { armor_ignore: 3 } });
  const path = overview[2].paths.find(item => item.id === 'armor_ignore');
  assert.match(path.effect, /25% chance to apply Weakened/);
  assert.match(path.effect, /\+15% status-effect damage for 5 seconds/);
});
