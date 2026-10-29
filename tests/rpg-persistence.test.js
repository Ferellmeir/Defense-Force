import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';

test('save loading restores known ownership and loadouts without mission-local progression', () => {
  const saved = {
    units: {
      KNOWN: {
        id: 'KNOWN', rank: 3, copies: 2,
        equipped: { left: 'weapon', right: null, utility: null },
        augments: [], veterancy: 8, xp: 500, experience: 500,
        selectedPaths: { damage: 3 }, pathProgress: { damage: 3 },
        pathTierSelection: { 1: { selected: ['damage'] } },
        deploymentCost: 9, investedForce: 20,
      },
      REMOVED: { id: 'REMOVED', rank: 1, copies: 1 },
    },
    inventory: [{ itemId: 'weapon', durability: null }],
    credits: 123,
    firstUnitDiscountAvailable: false,
  };
  globalThis.window = {
    GAME_SETTINGS: {
      UNITS: { KNOWN: { id: 'KNOWN', cost: 9 } },
      EQUIPMENT: { items: {}, augments: {} },
    },
    localStorage: { getItem: () => JSON.stringify(saved) },
  };

  const manager = new RPGManager({});
  assert.deepEqual(manager.state.units, {
    KNOWN: {
      id: 'KNOWN', rank: 3, copies: 2,
      stars: 3, extraCopies: 0, extraPassiveUnlocked: false,
      equipped: { left: 'weapon', right: null, utility: null },
      augments: [],
    },
  });
  assert.equal(manager.state.units.KNOWN.stars, 3);
  assert.equal(manager.state.units.KNOWN.extraCopies, 0);
  assert.equal(manager.state.credits, 123);
  assert.equal(manager.state.firstUnitDiscountAvailable, false);
  assert.deepEqual(manager.state.inventory, saved.inventory);
});

test('save loading restores separate lineup loadouts for copies of the same unit type', () => {
  const saved = {
    units: { KNOWN: { id: 'KNOWN', stars: 1, equipped: { left: 'default', right: null, utility: null }, augments: [] } },
    deploymentLineup: [
      { deploymentId: 'first', unitId: 'KNOWN', equipped: { left: 'weapon_a', right: null, utility: null }, augments: [] },
      { deploymentId: 'second', unitId: 'KNOWN', equipped: { left: 'weapon_b', right: 'weapon_b', utility: 'gear' }, augments: ['optic'] },
    ],
    inventory: [],
  };
  globalThis.window = {
    GAME_SETTINGS: {
      UNITS: { KNOWN: { id: 'KNOWN', cost: 9 } },
      EQUIPMENT: { items: {}, augments: {} },
    },
    localStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
  };

  const reopened = new RPGManager({});
  assert.deepEqual(reopened.state.deploymentLineup.slice(0, 2), saved.deploymentLineup);
  assert.notEqual(reopened.state.deploymentLineup[0].equipped, reopened.state.deploymentLineup[1].equipped);
});

test('New Game deletes persistent progress and writes the normal fresh starting state', () => {
  let stored = JSON.stringify({
    units: { KNOWN: { id: 'KNOWN', rank: 4, copies: 6, equipped: { left: 'weapon', right: null, utility: null } } },
    inventory: [{ itemId: 'weapon' }], credits: 12, influence: { faction: 9 }, firstUnitDiscountAvailable: false,
  });
  let removed = false;
  globalThis.window = {
    GAME_SETTINGS: {
      UNITS: { KNOWN: { id: 'KNOWN', cost: 9 } },
      EQUIPMENT: { items: { weapon: { id: 'weapon', type: 'weapon' } }, augments: {} },
    },
    localStorage: {
      getItem: () => stored,
      setItem: (_key, value) => { stored = value; },
      removeItem: () => { removed = true; stored = null; },
    },
  };

  const manager = new RPGManager({});
  assert.ok(manager.getOwnedUnit('KNOWN'));
  manager.startNewGame();
  assert.equal(removed, true);
  assert.deepEqual(manager.state.units, {});
  assert.deepEqual(manager.state.inventory, []);
  assert.equal(manager.state.credits, 200);
  assert.deepEqual(manager.state.influence, {});
  assert.equal(manager.state.firstUnitDiscountAvailable, true);
  assert.equal(manager.state.lastSettledMissionId, null);

  const reopened = new RPGManager({});
  assert.deepEqual(reopened.state, manager.state);
  assert.equal(reopened.getOwnedUnit('KNOWN'), undefined);
});

test('Makeshift equipment remains available without inventory after New Game', () => {
  globalThis.window = {
    GAME_SETTINGS: {
      UNITS: { KNOWN: { id: 'KNOWN', cost: 9 } },
      EQUIPMENT: {
        items: { makeshift: { id: 'makeshift', type: 'weapon', rarity: 'MAKESHIFT', hands: 2 } },
        augments: {},
      },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  const manager = new RPGManager({});
  manager.startNewGame();
  assert.deepEqual(manager.state.inventory, []);
  assert.equal(manager.getItemInstance('makeshift'), undefined);
  assert.equal(manager.getOwnedItems('weapon').some(({ definition }) => definition.id === 'makeshift'), true);
});
