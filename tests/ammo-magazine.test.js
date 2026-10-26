import assert from 'node:assert/strict';
import test from 'node:test';
import AmmoMagazine, { isAmmoConfigurationMissing } from '../src/systems/AmmoMagazine.js';

const ammoDefinition = {
  requiresAmmo: true,
  magazineCapacity: 3,
  consumesPerAttack: 2,
};

test('each attack consumes exactly one magazine shot', () => {
  const magazine = new AmmoMagazine(ammoDefinition, 500, true);
  assert.equal(magazine.ammoRemaining, 3);
  assert.equal(magazine.consumeShot(100), true);
  assert.equal(magazine.ammoRemaining, 2);
  assert.equal(magazine.consumeShot(200), true);
  assert.equal(magazine.ammoRemaining, 1);
});

test('an empty magazine starts reloading and cannot fire until its reload duration ends', () => {
  const magazine = new AmmoMagazine(ammoDefinition, 500, true);
  magazine.consumeShot(100);
  magazine.consumeShot(200);
  assert.equal(magazine.consumeShot(300), true);
  assert.equal(magazine.ammoRemaining, 0);
  assert.equal(magazine.reloadUntil, 800);
  assert.equal(magazine.canFire(799), false);
  assert.equal(magazine.getReloadRemaining(799), 1);
  magazine.update(799);
  assert.equal(magazine.ammoRemaining, 0);
  magazine.update(800);
  assert.equal(magazine.ammoRemaining, 3);
  assert.equal(magazine.reloadUntil, 0);
  assert.equal(magazine.canFire(800), true);
});

test('separate deployments start with independent full magazines and reload timers', () => {
  const firstDeployment = new AmmoMagazine(ammoDefinition, 500, true);
  const secondDeployment = new AmmoMagazine(ammoDefinition, 500, true);
  firstDeployment.consumeShot(0);
  firstDeployment.consumeShot(1);
  firstDeployment.consumeShot(2);
  assert.equal(firstDeployment.ammoRemaining, 0);
  assert.equal(firstDeployment.reloadUntil, 502);
  assert.equal(secondDeployment.ammoRemaining, 3);
  assert.equal(secondDeployment.reloadUntil, 0);
});

test('weapons without ammunition remain unlimited and unaffected by reload state', () => {
  const magazine = new AmmoMagazine({ requiresAmmo: false, unlimited: true }, undefined, false);
  assert.equal(magazine.isConfigured, true);
  assert.equal(magazine.ammoRemaining, Infinity);
  assert.equal(magazine.canFire(0), true);
  assert.equal(magazine.consumeShot(0), true);
  assert.equal(magazine.ammoRemaining, Infinity);
  assert.equal(magazine.reloadUntil, 0);
});

test('ammunition weapons with missing capacity or reload speed are explicitly unconfigured', () => {
  const noCapacity = new AmmoMagazine({ requiresAmmo: true }, 500, true);
  const noReloadSpeed = new AmmoMagazine({ requiresAmmo: true, magazineCapacity: 3 }, NaN, false);
  assert.equal(noCapacity.isConfigured, false);
  assert.equal(noCapacity.canFire(0), false);
  assert.equal(noReloadSpeed.isConfigured, false);
  assert.equal(noReloadSpeed.canFire(0), false);
});

test('cleared ammo state is not reported as a missing weapon configuration', () => {
  assert.equal(isAmmoConfigurationMissing(null), false);
  assert.equal(isAmmoConfigurationMissing(undefined), false);
  assert.equal(isAmmoConfigurationMissing(new AmmoMagazine({ requiresAmmo: true, magazineCapacity: 5 }, 500, true)), false);
  assert.equal(isAmmoConfigurationMissing(new AmmoMagazine({ requiresAmmo: true }, NaN, false)), true);
  assert.equal(isAmmoConfigurationMissing(new AmmoMagazine({ requiresAmmo: false }, NaN, false)), false);
});
