import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';

const paths = [
  { id: 'damage', effect: { type: 'stat', stat: 'damage', mode: 'percent', value: 0.05 } },
  { id: 'range', effect: { type: 'stat', stat: 'range', value: 64 } },
  { id: 'reload', effect: { type: 'stat', stat: 'reloadSpeed', mode: 'multiplier', value: 0.9 } },
];

function createFixture(force = 20, experience = 10) {
  const manager = Object.create(RPGManager.prototype);
  manager.units = {
    unit: {
      pathTiers: [{ tier: 1, paths }],
      baseStats: { damage: 10, range: 100, reloadSpeed: 1, attackSpeed: 1000 },
    },
  };
  manager.equipment = { rarities: {}, items: {}, augments: {} };
  manager.state = { units: { unit: { rank: 1, equipped: { left: null, right: null, utility: null }, augments: [] } }, inventory: [] };
  manager.scene = {
    mapManager: { getCurrentMap: () => ({ tileSize: 64 }) },
    economyManager: {
      force,
      getForce() {
        return this.force;
      },
      spendForce(amount) {
        if (this.force < amount) return false;
        this.force -= amount;
        return true;
      },
    },
  };
  const tower = {
    characterId: 'unit',
    veterancy: 0,
    level: 0,
    experience,
    deploymentCost: 20,
    investedForce: 20,
    selectedPaths: {},
    pathProgress: {},
    pathTierSelection: {},
    refreshProgressionStats() {},
  };
  return { manager, tower, economy: manager.scene.economyManager };
}

test('uses the 10 XP first threshold and Force cost scaling without rounding', () => {
  const { manager } = createFixture();
  assert.equal(manager.getVeterancyXpRequirement(0), 10);
  assert.equal(manager.getVeterancyXpRequirement(1), 10 * 1.6);
  assert.equal(manager.getVeterancyXpRequirement(2), 10 * 1.6 ** 2);
  assert.equal(manager.getVeterancyForceCost(0, 21), 10.5);
  assert.equal(manager.getVeterancyForceCost(1, 21), 10.5 * 1.6);
});

test('keeps an XP unlocked upgrade available without spending when Force is insufficient', () => {
  const { manager, tower, economy } = createFixture(9.99, 10);
  assert.equal(manager.getPathChoiceState(tower.characterId, tower)[0].paths[0].available, true);
  assert.equal(manager.canPurchaseVeterancy(tower, 'damage'), false);
  assert.equal(manager.purchaseVeterancy(tower, 'damage'), false);
  assert.equal(tower.veterancy, 0);
  assert.equal(economy.force, 9.99);
  assert.equal(tower.pathProgress.damage, undefined);
  economy.force = 10;
  assert.equal(manager.canPurchaseVeterancy(tower, 'damage'), true);
});

test('does not mutate progression when Force spending is rejected', () => {
  const { manager, tower, economy } = createFixture(20);
  economy.spendForce = () => false;
  assert.equal(manager.purchaseVeterancy(tower, 'damage'), false);
  assert.equal(tower.veterancy, 0);
  assert.equal(economy.force, 20);
  assert.equal(tower.pathProgress.damage, undefined);
});

test('XP unlocks purchase without applying an upgrade until explicitly purchased', () => {
  const { manager, tower, economy } = createFixture(20, 10);
  assert.equal(manager.canPurchaseVeterancy(tower, 'damage'), true);
  assert.equal(tower.veterancy, 0);
  assert.equal(tower.pathProgress.damage, undefined);
  assert.equal(economy.force, 20);

  assert.equal(manager.purchaseVeterancy(tower, 'damage'), true);
  assert.equal(tower.veterancy, 1);
  assert.equal(economy.force, 10);
  assert.equal(tower.experience, 10);
  assert.equal(tower.pathProgress.damage, 1);
  assert.equal(tower.investedForce, 30);
});

test('does not increase veterancy before the 10 XP threshold', () => {
  const { manager, tower, economy } = createFixture(20, 9.99);
  assert.equal(manager.purchaseVeterancy(tower, 'damage'), false);
  assert.equal(tower.veterancy, 0);
  assert.equal(economy.force, 20);
  assert.equal(tower.experience, 9.99);
});

test('a path cannot be advanced beyond three levels or consume Force after completion', () => {
  const { manager, tower, economy } = createFixture(100, 100);
  tower.pathProgress.damage = 3;
  tower.selectedPaths.damage = 3;
  const before = { ...tower.pathProgress };
  assert.equal(manager.purchaseVeterancy(tower, 'damage'), false);
  assert.deepEqual(tower.pathProgress, before);
  assert.equal(tower.veterancy, 0);
  assert.equal(economy.force, 100);
});

test('deployed progression is fresh per deployment and path effects enter effective combat stats', () => {
  const { manager, tower } = createFixture(100, 25);
  const persistentBefore = structuredClone(manager.state);
  assert.deepEqual(manager.createDeploymentProgression('unit'), {
    veterancy: 0, xp: 0, experience: 0, selectedPaths: {}, pathProgress: {}, pathTierSelection: {},
  });
  assert.equal(manager.purchaseVeterancy(tower, 'damage'), true);
  const stats = manager.getEffectiveStats('unit', tower);
  assert.ok(Math.abs(stats.damage - (10 * 1.05 * 1.15)) < 1e-10);
  assert.deepEqual(manager.state, persistentBefore);
  const nextDeployment = manager.createDeploymentProgression('unit');
  assert.equal(nextDeployment.veterancy, 0);
  assert.deepEqual(nextDeployment.pathProgress, {});
});
