import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import RPGManager from '../src/systems/RPGManager.js';
import { getDirectedPathTiles, getPathTileKeys, getProjectedPathArrowFlipX } from '../src/utils/pathTiles.js';
import EconomyManager from '../src/systems/EconomyManager.js';
import { getProjectileSpeed, PROJECTILE_SPEED_TILES_PER_SECOND } from '../src/systems/ProjectileSpeeds.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const enemies = readJson('../src/assets/config/enemies.json');
const units = readJson('../src/assets/config/units.json');
const equipment = readJson('../src/assets/config/equipment.json');

test('enemy configuration matches the five authoritative health baselines and preserves other stats', () => {
  assert.deepEqual(Object.values(enemies).map(({ force, health, tilesPerSecond, armor }) => [force, health, tilesPerSecond, armor]), [
    [2, 200, 1, 0], [4, 150, 2, 0], [10, 400, 0.75, 25], [20, 1000, 1, 20], [400, 20000, 0.75, 20],
  ]);
  assert.ok(Object.values(enemies).every(enemy => !('healthMultiplier' in enemy)));
});

test('missions start with 80 Force and reset to that configured starting amount', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { GAME_SETTINGS: { PLAYER: { force: 80, lives: 10, money: 200 } } };
  const scene = { events: { emit() {} } };
  const economy = new EconomyManager(scene);
  assert.equal(economy.getForce(), 80);
  economy.force = 0;
  economy.reset();
  assert.equal(economy.getForce(), 80);
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

test('workbook unit deployment costs and free makeshift weapon are configured', () => {
  assert.deepEqual(Object.values(units).map(unit => unit.cost), [9, 30, 25, 15, 35, 15, 28, 40, 45]);
  assert.equal(equipment.items.lead_pipe.rarity, 'MAKESHIFT');
  assert.equal(equipment.items.lead_pipe.damage, 35);
  assert.equal(equipment.items.lead_pipe.hands, 2);
});

test('workbook unit tiers and Random paths match the defined designs', () => {
  for (const unit of Object.values(units).slice(0, 5)) {
    assert.deepEqual(unit.pathTiers.map(tier => tier.paths.length), [3, 3, 2]);
  }
  assert.deepEqual(units.ASHIGARU.pathTiers.map(tier => tier.paths.length), [3, 3, 2]);
  assert.deepEqual(units.INFILTRATOR.pathTiers.map(tier => tier.paths.length), [2, 2]);
  assert.deepEqual(units.SHINOBI.pathTiers.map(tier => tier.paths.length), [3, 3, 2]);
  for (const unit of Object.values(units)) {
    const randomPaths = unit.pathTiers.flatMap(tier => tier.paths).filter(path => path.name?.startsWith('Random'));
    assert.ok(randomPaths.every(path => path.effect?.property === 'randomStatPath'));
  }
  assert.equal(units.GUTTER_THUGS.passive.value, 0.85);
  assert.equal(units.ANARCHO_SABOTEURS.passive.property, 'criticalFireDot');
  assert.equal(units.BELTER_PIRATE.passive.value, 0.15);
});

test('new state has no owned units, starts with 200 credits, and applies the first unit discount', () => {
  const manager = Object.create(RPGManager.prototype);
  manager.units = units;
  manager.equipment = equipment;
  manager.state = manager.createDefaultState();
  manager.save = () => {};

  assert.deepEqual(manager.state.units, {});
  assert.equal(manager.state.credits, 200);
  assert.equal(manager.getUnitCreditCost('GUTTER_THUGS'), 9 * 4.2 * 0.5);
  assert.equal(manager.purchaseUnit('GUTTER_THUGS'), true);
  assert.equal(manager.state.credits, 200 - (9 * 4.2 * 0.5));
  assert.equal(manager.state.units.GUTTER_THUGS.rank, 0);
  assert.equal(manager.state.units.GUTTER_THUGS.stars, 0);
  assert.equal(manager.state.units.GUTTER_THUGS.extraCopies, 0);
  assert.deepEqual(manager.state.units.GUTTER_THUGS.equipped, {
    left: 'lead_pipe', right: 'lead_pipe', utility: null,
  });
  assert.equal(manager.getMissionCreditCost(['GUTTER_THUGS']), 9 * 4.2 * 0.25);
  assert.equal(manager.chargeMissionCosts(['GUTTER_THUGS']), true);
  assert.equal(manager.state.credits, 200 - (9 * 4.2 * 0.5) - (9 * 4.2 * 0.25));
  assert.equal(manager.getUnitCreditCost('BELTER_PIRATE'), 15 * 4.2);
});

test('path tile coverage includes every tile between waypoints', () => {
  assert.deepEqual(
    [...getPathTileKeys([[{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }]])].sort(),
    ['0,2', '1,2', '2,2', '3,2', '4,2', '4,3', '4,4'],
  );
});

test('directed visual path tiles follow straight segments, turns, and the exit direction', () => {
  const path = [{ x: 0, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }];
  const tiles = getDirectedPathTiles(path);
  assert.deepEqual(tiles, [
    { x: 0, y: 2, nextX: 1, nextY: 2 },
    { x: 1, y: 2, nextX: 2, nextY: 2 },
    { x: 2, y: 2, nextX: 2, nextY: 3 },
    { x: 2, y: 3, nextX: 2, nextY: 4 },
    { x: 2, y: 4, nextX: 2, nextY: 5 },
  ]);
  assert.deepEqual(
    new Set(tiles.map(tile => `${tile.x},${tile.y}`)),
    getPathTileKeys([path]),
  );
});

test('path arrow horizontal flips select the closest available projected orientation', () => {
  assert.equal(getProjectedPathArrowFlipX(1, 0), false);
  assert.equal(getProjectedPathArrowFlipX(0, 1), true);
  assert.equal(getProjectedPathArrowFlipX(-1, 0), true);
  assert.equal(getProjectedPathArrowFlipX(0, -1), false);
});

test('each battlefield map visualizes every logical route tile and points its exit arrow outward', () => {
  for (const mapName of ['forest', 'desert', 'mountain']) {
    const map = readJson(`../public/maps/${mapName}.json`);
    const mainPath = map.paths[0];
    const directedTiles = getDirectedPathTiles(mainPath);
    assert.deepEqual(
      new Set(directedTiles.map(tile => `${tile.x},${tile.y}`)),
      getPathTileKeys([mainPath]),
      `${mapName} route coverage`,
    );
    const exitArrow = directedTiles.at(-1);
    const previousTile = directedTiles.at(-2);
    assert.deepEqual(
      [exitArrow.nextX - exitArrow.x, exitArrow.nextY - exitArrow.y],
      [previousTile.nextX - previousTile.x, previousTile.nextY - previousTile.y],
      `${mapName} exit direction`,
    );
  }
});

test('projectile speed has only the centralized fired and thrown categories', () => {
  assert.deepEqual(PROJECTILE_SPEED_TILES_PER_SECOND, { fired: 12, thrown: 4 });
  assert.equal(getProjectileSpeed('fired', 64), 768);
  assert.equal(getProjectileSpeed('thrown', 64), 256);
  assert.equal(getProjectileSpeed('other', 64), 0);
});

test('protected zone takes one damage per non-boss and 999 per boss', () => {
  const economy = Object.create(EconomyManager.prototype);
  economy.allowedEscapes = 10;
  economy.escapes = 0;
  economy.lives = 10;
  economy.updateScore = () => {};
  economy.registerEscape(1);
  assert.equal(economy.lives, 9);
  economy.registerEscape(999);
  assert.equal(economy.lives, 0);
  assert.equal(economy.escapes, 1000);
});
