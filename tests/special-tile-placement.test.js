import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMissionMap, isValidSpecialTilePlacement, SPECIAL_TILE_TYPES } from '../src/systems/missionGeneration.js';
import { placeSpecialTileOnMap } from '../src/systems/specialTilePlacement.js';
import { advanceDynamicMissionMap, getNextDynamicMapIndex } from '../src/systems/missionFlow.js';
import EconomyManager from '../src/systems/EconomyManager.js';
import { createMissionBoard } from '../src/systems/missionBoard.js';
import { createSeededRandom } from '../src/systems/missionGeneration.js';

const baseMap = { name: 'Placement test', theme: 'forest', width: 20, height: 12, tileSize: 64, paths: [], entryPoints: [], exitPoints: [], placementRestrictions: [] };

test("supported special-tile types use the map path-distance placement rules", () => {
  assert.deepEqual(SPECIAL_TILE_TYPES, [
    'thermal_enhancement', 'snipers_nest', 'toxin_synthesizers',
    'tactical_indoctrination', 'adaptability_network', 'dark_alley',
  ]);
  const map = generateMissionMap(baseMap, 6201, { difficulty: 1 });
  const route = map.paths[0];
  const eligible = map.clearTiles.find(tile => Math.min(...route.map(path => Math.abs(path.x - tile.x) + Math.abs(path.y - tile.y))) <= 3);
  assert.ok(eligible);
  const distance = Math.min(...route.map(path => Math.abs(path.x - eligible.x) + Math.abs(path.y - eligible.y)));
  assert.equal(isValidSpecialTilePlacement(map, eligible, 'thermal_enhancement'), true);
  assert.equal(isValidSpecialTilePlacement(map, eligible, 'dark_alley'), distance === 1);
  assert.equal(isValidSpecialTilePlacement(map, route[0], 'thermal_enhancement'), false);
  assert.equal(isValidSpecialTilePlacement(map, { x: -1, y: 2 }, 'thermal_enhancement'), false);
  assert.equal(isValidSpecialTilePlacement(map, eligible, 'unsupported_type'), false);
});

test('special-tile placement spends one point only when placement succeeds', () => {
  const map = generateMissionMap(baseMap, 6202, { difficulty: 1 });
  const route = map.paths[0];
  const eligible = map.clearTiles.find(tile => {
    const distance = Math.min(...route.map(path => Math.abs(path.x - tile.x) + Math.abs(path.y - tile.y)));
    return distance >= 1 && distance <= 3;
  });
  const points = { tilePurchasePoints: 2, spendSpecialTilePoint() { this.tilePurchasePoints -= 1; return true; } };
  const placed = placeSpecialTileOnMap(map, eligible, 'thermal_enhancement', points);
  assert.deepEqual(placed, { ...eligible, type: 'thermal_enhancement' });
  assert.equal(points.tilePurchasePoints, 1);
  assert.equal(map.specialTiles.some(tile => tile.x === eligible.x && tile.y === eligible.y), true);
  assert.equal(placeSpecialTileOnMap(map, eligible, 'snipers_nest', points), null);
  assert.equal(points.tilePurchasePoints, 1);
  assert.equal(placeSpecialTileOnMap(map, route[0], 'snipers_nest', points), null);
  assert.equal(points.tilePurchasePoints, 1);
  const failingSpend = { tilePurchasePoints: 1, spendSpecialTilePoint() { return false; } };
  const other = map.clearTiles.find(tile => !map.specialTiles.some(special => special.x === tile.x && special.y === tile.y));
  assert.equal(placeSpecialTileOnMap(map, other, 'snipers_nest', failingSpend), null);
  assert.equal(map.specialTiles.some(tile => tile.x === other.x && tile.y === other.y), false);
});

test('mission point allowance is five normally, nine times difficulty for Barricade, and persists across map restarts', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { GAME_SETTINGS: { PLAYER: { force: 80, lives: 10, allowedEscapes: 10, money: 200 } } };
  const values = new Map();
  const makeScene = mission => ({
    registry: { get: key => key === 'selectedMission' ? mission : values.get(key), set: (key, value) => values.set(key, value) },
    events: { emit() {} },
  });
  const normal = new EconomyManager(makeScene({ missionType: 'SECURE_REGION', difficulty: 'NORMAL' }));
  assert.equal(normal.tilePurchasePoints, 5);
  assert.equal(normal.spendSpecialTilePoint(), true);
  assert.equal(normal.tilePurchasePoints, 4);
  assert.equal(values.get('missionSpecialTilePoints'), 4);
  values.delete('missionSpecialTilePoints');
  const barricade = new EconomyManager(makeScene({ missionType: 'BARRICADE', difficulty: 'HARD' }));
  assert.equal(barricade.tilePurchasePoints, 27);
  values.set('missionSpecialTilePoints', 3);
  const resumed = new EconomyManager(makeScene({ missionType: 'DYNAMIC_ENGAGEMENT', difficulty: 'HARD' }));
  assert.equal(resumed.tilePurchasePoints, 3);
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

test('dynamic map advancement reattaches its UI and stops at the final map', () => {
  const mission = { missionType: 'DYNAMIC_ENGAGEMENT', mapKeys: ['forest', 'desert', 'mountain'], mapSeeds: [11, 22, 33], restrictionsByMap: [[], [{ id: 'one' }], [{ id: 'two' }]] };
  assert.equal(getNextDynamicMapIndex(mission, 0), 1);
  assert.equal(getNextDynamicMapIndex(mission, 1), 2);
  assert.equal(getNextDynamicMapIndex(mission, 2), null);
  assert.equal(getNextDynamicMapIndex({ missionType: 'SECURE_REGION', mapKeys: ['forest'] }, 0), null);
  const values = new Map([['missionMapIndex', 0]]);
  const registry = { set: (key, value) => values.set(key, value) };
  const calls = [];
  const next = advanceDynamicMissionMap({
    mission, mapIndex: 0, registry,
    stopUIScene: () => calls.push('stop-ui'),
    restartGameScene: () => calls.push('restart-game'),
  });
  assert.equal(next, 1);
  assert.equal(values.get('missionMapIndex'), 1);
  assert.equal(values.get('selectedMap'), 'desert');
  assert.equal(values.get('missionSeed'), 22);
  assert.deepEqual(values.get('missionRestriction'), [{ id: 'one' }]);
  assert.deepEqual(calls, ['stop-ui', 'restart-game']);
  assert.equal(advanceDynamicMissionMap({ mission, mapIndex: 2, registry, stopUIScene: () => calls.push('bad'), restartGameScene: () => calls.push('bad') }), false);
  assert.deepEqual(calls, ['stop-ui', 'restart-game']);
});

test('mission offers do not generate planned future alien or ammo cost-cap restrictions', () => {
  const board = createMissionBoard({
    turnNumber: 1,
    random: createSeededRandom(8012),
    units: { alien: { isAlien: true } },
    equipment: { items: { alienItem: { alienTechnology: true } }, augments: {} },
  });
  const restrictions = board.flatMap(mission => [
    ...(mission.restrictions || []),
    ...(mission.restrictionsByMap || []).flat(),
  ]);
  assert.equal(restrictions.some(restriction => restriction.kind === 'alien' || restriction.kind === 'costCap'), false);
});
