import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAspectFitDisplaySize } from '../src/utils/visualSize.js';
import { writeGeneratedAsset } from '../src/utils/generatedAssetProtection.js';

const units = JSON.parse(fs.readFileSync(new URL('../src/assets/config/units.json', import.meta.url), 'utf8'));
const enemies = JSON.parse(fs.readFileSync(new URL('../src/assets/config/enemies.json', import.meta.url), 'utf8'));
const infiltratorAsset = fs.readFileSync(new URL('../public/assets/Infiltrator.png', import.meta.url));

test('Infiltrator uses its supplied artwork with a protected filename', () => {
  assert.equal(units.INFILTRATOR.asset, 'Infiltrator');
  assert.equal(units.INFILTRATOR.characterArt, true);
  assert.deepEqual([...infiltratorAsset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.throws(() => writeGeneratedAsset('Infiltrator.png', Buffer.from('test'), () => {}), /protected artwork/);
});

test('different source resolutions with the same aspect ratio receive the same configured size', () => {
  const visualSize = { width: 64, height: 64 };
  assert.deepEqual(getAspectFitDisplaySize(1024, 1024, visualSize), { width: 64, height: 64 });
  assert.deepEqual(getAspectFitDisplaySize(1254, 1254, visualSize), { width: 64, height: 64 });
});

test('runtime size fitting preserves source aspect ratio inside its configured bounds', () => {
  assert.deepEqual(getAspectFitDisplaySize(1024, 512, { width: 64, height: 64 }), { width: 64, height: 32 });
  assert.deepEqual(getAspectFitDisplaySize(512, 1024, { width: 64, height: 64 }), { width: 32, height: 64 });
});

test('player and enemy visual sizes are independent configuration values', () => {
  const playerSize = units.GUTTER_THUGS.visualSize;
  const enemySize = enemies.NORMAL.visualSize;
  assert.deepEqual(getAspectFitDisplaySize(1024, 1024, playerSize), { width: 64, height: 64 });
  assert.deepEqual(getAspectFitDisplaySize(1024, 1024, enemySize), { width: 64, height: 64 });
  assert.deepEqual(enemies.ELITE.visualSize, { width: 96, height: 96 });
  assert.deepEqual(enemies.BOSS.visualSize, { width: 128, height: 128 });
  for (const definition of Object.values(units)) {
    assert.deepEqual(definition.visualSize, { width: 64, height: 64 });
    assert.equal(definition.filtering, 'linear');
    assert.ok(definition.visualOrigin.x >= 0 && definition.visualOrigin.x <= 1);
  }
});

test('enemy definitions keep distinct Elite and Boss assets, sizes, anchors, and linear filtering', () => {
  assert.equal(enemies.ELITE.asset, 'elite');
  assert.equal(enemies.BOSS.asset, 'boss');
  for (const definition of Object.values(enemies)) {
    assert.ok(definition.visualOrigin.y > 0 && definition.visualOrigin.y <= 1);
    assert.equal(definition.filtering, 'linear');
  }
});

test('mini-boss assets and stat definitions match the supplied mini-boss specifications', () => {
  const expected = {
    SWARMER: { asset: 'swarmer', health: 1200, tilesPerSecond: 1, armor: 25 },
    ARMORER: { asset: 'armorer', health: 1500, tilesPerSecond: 0.75, armor: 75 },
    GRAFTER: { asset: 'grafter', health: 2000, tilesPerSecond: 1, armor: 25 },
  };
  for (const [type, stats] of Object.entries(expected)) {
    assert.deepEqual({
      asset: enemies[type].asset,
      health: enemies[type].health,
      tilesPerSecond: enemies[type].tilesPerSecond,
      armor: enemies[type].armor,
    }, stats);
    assert.equal(enemies[type].miniBoss, true);
    assert.equal(enemies[type].force, 30);
    assert.equal(enemies[type].countsAs, 5);
    assert.deepEqual(enemies[type].visualSize, enemies.ELITE.visualSize);
    const asset = fs.readFileSync(new URL(`../public/assets/enemy_${stats.asset}.png`, import.meta.url));
    assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test('asset generator refuses every protected character and enemy artwork filename', () => {
  const protectedNames = [
    'enemy_basic.png', 'enemy_fast.png', 'enemy_armored.png', 'enemy_elite.png', 'enemy_boss.png',
    'enemy_swarmer.png', 'enemy_armorer.png', 'enemy_grafter.png',
    'gutter_thug.png', 'anarcho_saboteur.png', 'syndicate_fixer.png', 'belter_pirate.png', 'pallid_order_blade.png', 'Infiltrator.png',
  ];
  for (const filename of protectedNames) {
    let wroteFile = false;
    assert.throws(() => writeGeneratedAsset(filename, Buffer.from('test'), () => { wroteFile = true; }), /protected artwork/);
    assert.equal(wroteFile, false);
  }

  let output;
  writeGeneratedAsset('generated_enemy_basic.png', Buffer.from('test'), (filename) => { output = filename; });
  assert.equal(output, 'generated_enemy_basic.png');
});
