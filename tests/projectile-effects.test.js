import assert from 'node:assert/strict';
import test from 'node:test';
import EffectSpawner from '../src/systems/EffectSpawner.js';
import {
  getProjectileEffectType,
  spawnProjectileExplosionEffect,
  spawnProjectileHitEffect,
} from '../src/systems/ProjectileEffectBridge.js';

test('projectile damage type reaches hit and death explosion effect boundaries', () => {
  const calls = [];
  const effectSpawner = {
    createHitEffect(...args) { calls.push(['hit', ...args]); },
    createExplosionEffect(...args) { calls.push(['explosion', ...args]); },
  };
  const projectileData = { type: 'gutter_thugs', attackType: 'ranged', damageType: 'Fire' };
  spawnProjectileHitEffect(effectSpawner, 12, 34, projectileData);
  spawnProjectileExplosionEffect(effectSpawner, 12, 34, 32, projectileData);
  assert.deepEqual(calls, [
    ['hit', 12, 34, 'fire'],
    ['explosion', 12, 34, 32, 'fire'],
  ]);
});

test('effect type falls back from damage type to attack type, then legacy tower type', () => {
  assert.equal(getProjectileEffectType({ damageType: 'Energy' }), 'energy');
  assert.equal(getProjectileEffectType({ attackType: 'melee' }), 'melee');
  assert.equal(getProjectileEffectType({ type: 'slow' }), 'slow');
  assert.equal(getProjectileEffectType({ damageType: 'other', type: 'unit-id' }), 'basic');
});

test('damage types tint hit and explosion particles distinctly with legacy colors retained', () => {
  const configs = [];
  const scene = {
    add: { particles(_x, _y, _texture, config) {
      configs.push(config);
      return { explode() {}, destroy() {} };
    } },
    time: { delayedCall() {} },
  };
  const effects = new EffectSpawner(scene);
  ['physical', 'energy', 'fire', 'acid'].forEach(type => effects.createHitEffect(0, 0, type));
  ['physical', 'energy', 'fire', 'acid'].forEach(type => effects.createExplosionEffect(0, 0, 32, type));
  assert.deepEqual(configs.slice(0, 4).map(config => config.tint), [0xffff00, 0x55ddff, 0xff4422, 0x88ff33]);
  assert.deepEqual(configs.slice(4).map(config => config.tint), [undefined, 0x55ddff, 0xff4422, 0x88ff33]);
  effects.createHitEffect(0, 0, 'aoe');
  effects.createHitEffect(0, 0, 'slow');
  effects.createHitEffect(0, 0, 'unconfigured');
  assert.deepEqual(configs.slice(-3).map(config => config.tint), [0xff6600, 0x00ffff, 0xffff00]);
});
