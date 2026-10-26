import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom, generateMissionMap, getAdditionalSpecialTileChanceSequence, rollAdditionalSpecialTileCount, validateGeneratedMap } from '../src/systems/missionGeneration.js';
import { generateMissionWaves } from '../src/systems/waveGenerator.js';
import { getBuildingDisplaySize, getBuildingFootprint, getBuildingSprite } from '../src/utils/buildingFootprint.js';
import { clearBlockedTile } from '../src/systems/tileClearing.js';

const baseMap = { name: 'Test', theme: 'forest', width: 20, height: 12, tileSize: 64, paths: [], entryPoints: [], exitPoints: [], placementRestrictions: [] };
const enemies = { NORMAL: {}, FAST: {}, ARMORED: {}, ELITE: {}, BOSS: {} };

function shapePath(path) {
  const runs = [];
  for (let i = 1; i < path.length; i += 1) {
    const direction = `${Math.sign(path[i].x - path[i - 1].x)},${Math.sign(path[i].y - path[i - 1].y)}`;
    const previous = runs.at(-1);
    if (previous?.direction === direction) previous.length += 1;
    else runs.push({ direction, length: 1 });
  }
  return runs.map(run => `${run.direction}:${run.length}`).join('|');
}

function assertPathRules(map, difficulty) {
  const path = map.paths[0];
  const pathEdges = new Set(path.slice(1).map((point, index) => {
    const from = `${path[index].x},${path[index].y}`;
    const to = `${point.x},${point.y}`;
    return [from, to].sort().join('|');
  }));
  assert.ok(path.length >= 22 + (difficulty - 1) * 2);
  for (const point of path) {
    assert.ok(point.x >= 1 && point.y >= 1 && point.x <= map.width - 2 && point.y <= map.height - 2,
      'every path tile, including spawn and exit, stays one full tile inside the boundary');
  }
  for (let i = 1; i < path.length; i += 1) {
    assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1);
  }
  const unique = [...new Map(path.map(point => [`${point.x},${point.y}`, point])).values()];
  for (let i = 0; i < unique.length; i += 1) for (let j = i + 1; j < unique.length; j += 1) {
    if (Math.abs(unique[i].x - unique[j].x) + Math.abs(unique[i].y - unique[j].y) === 1) {
      const edge = [`${unique[i].x},${unique[i].y}`, `${unique[j].x},${unique[j].y}`].sort().join('|');
      assert.ok(pathEdges.has(edge), 'adjacent route tiles are an actual consecutive path step');
    }
  }
}

test('same seed and difficulty deterministically generate a valid mission', () => {
  assert.deepEqual(generateMissionMap(baseMap, 1234), generateMissionMap(baseMap, 1234));
  const generate = seed => generateMissionWaves({ difficulty: 'EASY', enemies, random: createSeededRandom(seed) });
  assert.deepEqual(generate(1234), generate(1234));
});

test('additional special tile chance follows p = p / 2 - 2 and stops at non-positive chance', () => {
  assert.deepEqual(getAdditionalSpecialTileChanceSequence(), [96, 46, 21, 8.5, 2.25, -0.875]);
  let rolls = 0;
  assert.equal(rollAdditionalSpecialTileCount(() => { rolls += 1; return 0; }), 5);
  assert.equal(rolls, 5, 'chance <= 0 causes no further RNG roll');
  rolls = 0;
  assert.equal(rollAdditionalSpecialTileCount(() => { rolls += 1; return [0, 0, 0, 0.09][rolls - 1]; }), 3);
  assert.equal(rolls, 4, 'the first failed probability roll stops the sequence');
});

for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
  test(`difficulty ${difficulty} dimensions, path length, terrain and placements validate`, () => {
    const map = generateMissionMap(baseMap, 100 + difficulty, { difficulty });
    const offset = difficulty - 1;
    assert.ok(map.width >= 10 + offset && map.width <= 14 + offset);
    assert.ok(map.height >= 10 + offset && map.height <= 14 + offset);
    assert.ok([23, 24, 25].includes(map.width + map.height - offset * 2));
    assert.ok(map.paths[0].length >= 22 + offset * 2);
    assertPathRules(map, difficulty);
    assert.equal(validateGeneratedMap(map, difficulty), true);
    assert.ok(map.specialTiles.length >= 1);
    assert.equal(map.terrainModifiers.filter(tile => tile.type === 'incline').length, (difficulty <= 2 ? 1 : 2) * 2);
    assert.equal(map.terrainModifiers.filter(tile => tile.type === 'decline').length, (difficulty <= 2 ? 1 : 2) * 2);
    for (const [type, speed] of [['incline', 0.5], ['decline', 2]]) {
      const points = map.terrainModifiers.filter(tile => tile.type === type && tile.speedMultiplier === speed);
      const indices = points.map(tile => map.paths[0].findIndex(point => point.x === tile.x && point.y === tile.y)).sort((a, b) => a - b);
      for (let i = 0; i < indices.length; i += 2) assert.equal(indices[i + 1], indices[i] + 1);
    }
    assert.ok(map.blockedClearableTiles.length > 0);
    assert.ok(map.clearTiles.length > 0);
  });
}

test('seeded routes use varied segment structures instead of a repeated sweep template', () => {
  const maps = Array.from({ length: 24 }, (_, index) => generateMissionMap(baseMap, 9000 + index, { difficulty: 1 }));
  const signatures = maps.map(map => shapePath(map.paths[0]));
  const turnCounts = maps.map(map => shapePath(map.paths[0]).split('|').length - 1);
  const runLengths = maps.flatMap(map => shapePath(map.paths[0]).split('|').map(run => Number(run.split(':')[1])));
  const crossed = maps.filter(map => new Set(map.paths[0].map(point => `${point.x},${point.y}`)).size < map.paths[0].length);
  assert.ok(new Set(signatures).size >= 20, 'at least 20 of 24 routes have distinct straight-section structures');
  assert.ok(new Set(turnCounts).size >= 3, 'routes vary in turn frequency');
  assert.ok(new Set(runLengths).size >= 4, 'routes vary in straight-section lengths');
  assert.ok(crossed.length > 0, 'some seeded routes include a valid crossing');
});

test('route search consistently finds valid paths across seeds and difficulty levels', () => {
  for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
    for (let seed = 0; seed < 12; seed += 1) {
      const map = generateMissionMap(baseMap, 20000 + difficulty * 100 + seed, { difficulty });
      assertPathRules(map, difficulty);
      assert.equal(validateGeneratedMap(map, difficulty), true);
    }
  }
});

test('invalid maps are rejected rather than returned', () => {
  const map = generateMissionMap(baseMap, 54321);
  assert.throws(() => generateMissionMap(baseMap, 1, { maxAttempts: 0 }), /Could not generate/);
  assert.equal(validateGeneratedMap({ ...map, paths: [[{ x: 0, y: 0 }, { x: 2, y: 2 }]] }), false);
});

const buildingMap = {
  ...baseMap,
  placementRestrictions: [
    { x: 3, y: 3, width: 2, height: 2 },
    { x: 8, y: 3, width: 2, height: 4 },
    { x: 13, y: 4, width: 3, height: 2 },
  ],
};

test('generated building footprints match sprite dimensions and are entirely unclearable and unavailable for deployment', () => {
  for (let seed = 800; seed < 812; seed += 1) {
    const map = generateMissionMap(buildingMap, seed);
    for (const building of map.buildings) {
      assert.equal(building.sprite, getBuildingSprite(building));
      assert.deepEqual(getBuildingDisplaySize(building, map.tileSize), {
        width: building.width * map.tileSize,
        height: building.height * map.tileSize,
      });
      const footprint = getBuildingFootprint(building);
      assert.equal(footprint.length, building.width * building.height);
      for (const tile of footprint) {
        assert.ok(map.placementRestrictions.some(area => tile.x >= area.x && tile.x < area.x + area.width
          && tile.y >= area.y && tile.y < area.y + area.height));
        assert.equal(map.blockedClearableTiles.some(blocked => blocked.x === tile.x && blocked.y === tile.y), false);
        assert.equal(clearBlockedTile(map, tile), false);
        assert.ok(!map.paths[0].some(point => point.x === tile.x && point.y === tile.y));
      }
    }
  }
});

test('building placement favors path-distant footprints while allowing near-path buildings', () => {
  const pathDistance = (map, building) => Math.min(...getBuildingFootprint(building).map(tile =>
    Math.min(...map.paths[0].map(point => Math.abs(point.x - tile.x) + Math.abs(point.y - tile.y)))));
  const distances = [];
  for (let seed = 1200; seed < 1300; seed += 1) {
    const map = generateMissionMap(buildingMap, seed);
    distances.push(...map.buildings.map(building => pathDistance(map, building)));
  }
  const farCount = distances.filter(distance => distance > 2).length;
  assert.ok(farCount / distances.length > 0.7, 'most building footprints stay more than two tiles from the route');
  assert.ok(distances.some(distance => distance <= 2), 'some seeds place buildings close to the route');
});

test('generated buildings never overlap path endpoints or one another', () => {
  const map = generateMissionMap(buildingMap, 2034);
  const occupied = new Set();
  const route = new Set(map.paths[0].map(point => `${point.x},${point.y}`));
  const endpoints = [...map.entryPoints, ...map.exitPoints];
  for (const building of map.buildings) for (const tile of getBuildingFootprint(building)) {
    const id = `${tile.x},${tile.y}`;
    assert.equal(route.has(id), false);
    assert.equal(endpoints.some(point => point.x === tile.x && point.y === tile.y), false);
    assert.equal(occupied.has(id), false);
    occupied.add(id);
  }
  const overlappingBuildings = structuredClone(map);
  overlappingBuildings.buildings[1] = { ...overlappingBuildings.buildings[0] };
  assert.equal(validateGeneratedMap(overlappingBuildings), false);
  const edgePath = structuredClone(map);
  edgePath.paths[0][0] = { ...edgePath.paths[0][0], x: 0 };
  edgePath.entryPoints = [{ ...edgePath.paths[0][0] }];
  assert.equal(validateGeneratedMap(edgePath), false);
});
