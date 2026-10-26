import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';
import { clearMissionLocalState, transitionToMap } from '../src/systems/missionFlow.js';

const units = {
  UNIT: { id: 'UNIT', faction: 'Sewer Rats', cost: 9 },
  OTHER: { id: 'OTHER', faction: 'Sewer Rats', cost: 10 },
};
const equipment = {
  items: {
    lead_pipe: { id: 'lead_pipe', rarity: 'MAKESHIFT' },
    common_gun: { id: 'common_gun', rarity: 'COMMON' },
  },
  augments: {},
};

function createState() {
  return {
    units: {
      UNIT: {
        id: 'UNIT', rank: 1, copies: 1,
        equipped: { left: 'lead_pipe', right: 'lead_pipe', utility: null },
        augments: [],
      },
    },
    inventory: [{ itemId: 'lead_pipe', durability: null }],
    credits: 40,
    influence: {},
    firstUnitDiscountAvailable: false,
    lastSettledMissionId: null,
  };
}

function createManager(storage) {
  globalThis.window = {
    GAME_SETTINGS: { UNITS: units, EQUIPMENT: equipment },
    localStorage: storage,
  };
  return new RPGManager({});
}

test('victory settles defined credits, faction influence, and successful loot rolls', () => {
  const state = createState();
  Object.assign(state.units.UNIT, { stars: 0, extraCopies: 0, extraPassiveUnlocked: false });
  const manager = Object.assign(Object.create(RPGManager.prototype), {
    state, units, equipment, save() {},
  });
  const result = manager.settleMission({
    missionId: 'victory-1', victory: true, difficulty: 'EASY', unitIds: ['UNIT'], missionFaction: 'Sewer Rats',
    random: (() => { const rolls = [0, 0, 0, 0, 0]; return () => rolls.shift() ?? 0.99; })(),
  });

  assert.equal(result.credits, 100);
  assert.equal(result.influence, 14);
  assert.equal(result.faction, 'Sewer Rats');
  assert.deepEqual(result.equipmentGained, ['common_gun']);
  assert.deepEqual(result.unitsGained, ['UNIT']);
  assert.equal(state.credits, 140);
  assert.equal(state.influence['Sewer Rats'], 14);
  assert.equal(state.units.UNIT.stars, 1);
  assert.equal(state.units.UNIT.extraCopies, 0);
  assert.equal(state.inventory.some(item => item.itemId === 'common_gun'), true);
});

test('settlement is applied once and saved ownership survives map return reload', () => {
  let stored = JSON.stringify({ ...createState(), units: {
    UNIT: { ...createState().units.UNIT, rank: 3, copies: 6 },
  } });
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const manager = createManager(storage);
  const input = { missionId: 'repeat-safe-2', victory: true, difficulty: 'NORMAL', unitIds: ['UNIT'], missionFaction: 'Sewer Rats', random: () => 0.99 };
  manager.settleMission(input);
  const once = JSON.parse(stored);
  assert.equal(once.credits, 190);
  assert.equal(once.influence['Sewer Rats'], 20);
  assert.deepEqual(once.units.UNIT.equipped, { left: 'lead_pipe', right: 'lead_pipe', utility: null });
  assert.equal(manager.settleMission(input), null);
  assert.equal(JSON.parse(stored).credits, 190);

  const returnedToMapManager = createManager(storage);
  assert.equal(returnedToMapManager.state.credits, 190);
  assert.equal(returnedToMapManager.state.units.UNIT.rank, 3);
  assert.equal(returnedToMapManager.state.units.UNIT.copies, 6);
  assert.deepEqual(returnedToMapManager.state.units.UNIT.equipped, { left: 'lead_pipe', right: 'lead_pipe', utility: null });
});

test('victory does not guess a faction when the mission has no faction assignment', () => {
  const state = createState();
  const result = RPGManager.prototype.settleMission.call({ state, units, equipment, save() {} }, {
    missionId: 'no-faction-2b', victory: true, difficulty: 'EASY', unitIds: ['UNIT'], random: () => 0.99,
  });
  assert.equal(result.credits, 100);
  assert.equal(result.influence, 0);
  assert.equal(result.faction, null);
  assert.deepEqual(state.influence, {});
});

test('defeat awards no persistent rewards but applies the defined equipment break roll', () => {
  const state = createState();
  state.units.UNIT.equipped = { left: 'common_gun', right: null, utility: null };
  state.inventory.push({ itemId: 'common_gun', durability: null });
  const result = RPGManager.prototype.settleMission.call({ state, units, equipment, save() {} }, {
    missionId: 'defeat-3', victory: false, difficulty: 'INSANE', unitIds: ['UNIT'], random: () => 0,
  });

  assert.equal(result.credits, 0);
  assert.equal(result.influence, 0);
  assert.deepEqual(result.equipmentGained, []);
  assert.deepEqual(result.unitsGained, []);
  assert.deepEqual(result.equipmentLost, ['common_gun']);
  assert.equal(state.credits, 40);
  assert.deepEqual(state.influence, {});
  assert.equal(state.inventory.some(item => item.itemId === 'common_gun'), false);
});

test('mission completion clears mission-local systems and map return is idempotent', () => {
  const cleared = [];
  const registryState = {
    missionRunId: 'cleanup-4', missionSeed: 123, missionFaction: 'Sewer Rats',
    missionRoster: ['UNIT'], selectedUnit: 'UNIT',
  };
  const flow = {
    waveManager: { cleanup: () => cleared.push('wave') },
    towerManager: { clear: () => cleared.push('towers') },
    enemyManager: { clear: () => cleared.push('enemies') },
    projectileManager: { clear: () => cleared.push('projectiles') },
    economyManager: { clearMissionForce: () => cleared.push('force') },
    registry: { set: (key, value) => { registryState[key] = value; } },
  };
  clearMissionLocalState(flow);
  assert.deepEqual(cleared, ['wave', 'towers', 'enemies', 'projectiles', 'force']);
  assert.deepEqual(registryState.missionRoster, []);
  assert.equal(registryState.selectedUnit, null);
  assert.equal(registryState.missionRunId, null);
  assert.equal(registryState.missionSeed, null);
  assert.equal(registryState.missionFaction, null);
  let returning = false;
  let started = 0;
  let stopped = 0;
  let audioStopped = 0;
  const returnToMap = () => transitionToMap({
    isGameOver: true,
    isReturning: returning,
    setReturning: () => { returning = true; },
    stopAudio: () => { audioStopped += 1; },
    stopUIScene: () => { stopped += 1; },
    startMap: () => { started += 1; },
  });
  assert.equal(returnToMap(), true);
  assert.equal(returnToMap(), false);
  assert.equal(started, 1);
  assert.equal(stopped, 1);
  assert.equal(audioStopped, 1);
});
