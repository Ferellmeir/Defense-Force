import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAspectFitDisplaySize } from '../src/utils/visualSize.js';
import { writeGeneratedAsset } from '../src/utils/generatedAssetProtection.js';

const units = JSON.parse(fs.readFileSync(new URL('../src/assets/config/units.json', import.meta.url), 'utf8'));
const enemies = JSON.parse(fs.readFileSync(new URL('../src/assets/config/enemies.json', import.meta.url), 'utf8'));

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

test('asset generator refuses every protected character and enemy artwork filename', () => {
  const protectedNames = [
    'enemy_basic.png', 'enemy_fast.png', 'enemy_armored.png', 'enemy_elite.png', 'enemy_boss.png',
    'gutter_thug.png', 'anarcho_saboteur.png', 'syndicate_fixer.png', 'belter_pirate.png', 'pallid_order_blade.png',
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
