import assert from 'node:assert/strict';
import test from 'node:test';
import AmmoMagazine from '../src/systems/AmmoMagazine.js';
import { canReuseWeaponAttackState, prepareWeaponAttack } from '../src/systems/weaponAttackState.js';

function makeAttackState(weaponId, capacity = 1, reloadDuration = 500) {
  return {
    profile: { weaponId },
    ammoMagazine: new AmmoMagazine({ requiresAmmo: true, magazineCapacity: capacity }, reloadDuration, true),
  };
}

test('a weapon fires normally before the final shot starts its reload', () => {
  const state = makeAttackState('gun', 2);
  assert.equal(prepareWeaponAttack(state, 100), true);
  assert.equal(state.ammoMagazine.ammoRemaining, 1);
  assert.equal(state.ammoMagazine.reloadUntil, 0);
});

test('starting a reload blocks both ordinary and free attacks immediately without consuming shots', () => {
  const state = makeAttackState('gun');
  assert.equal(prepareWeaponAttack(state, 100), true);
  assert.equal(state.ammoMagazine.ammoRemaining, 0);
  assert.equal(state.ammoMagazine.reloadUntil, 600);

  assert.equal(prepareWeaponAttack(state, 100), false);
  assert.equal(prepareWeaponAttack(state, 200, { freeAttack: true }), false);
  assert.equal(state.ammoMagazine.ammoRemaining, 0);
  assert.equal(state.ammoMagazine.reloadUntil, 600);
});

test('free attacks remain available outside reload and retain their existing no-ammo-cost behavior', () => {
  const state = makeAttackState('gun', 2);
  assert.equal(prepareWeaponAttack(state, 100, { freeAttack: true }), true);
  assert.equal(state.ammoMagazine.ammoRemaining, 2);
  assert.equal(state.ammoMagazine.reloadUntil, 0);
});

test('the final shot cannot trigger a same-tick bonus attack after reloading starts', () => {
  const state = makeAttackState('gun');
  const firstShotFired = prepareWeaponAttack(state, 100);
  const bonusShotFired = firstShotFired && prepareWeaponAttack(state, 100, { freeAttack: true });
  assert.equal(firstShotFired, true);
  assert.equal(bonusShotFired, false);
  assert.equal(state.ammoMagazine.reloadUntil, 600);
});

test('a second weapon remains usable while the first reloads, with independent completion times', () => {
  const first = makeAttackState('short-magazine', 1, 500);
  const second = makeAttackState('long-magazine', 2, 1200);
  assert.equal(prepareWeaponAttack(first, 100), true);
  assert.equal(prepareWeaponAttack(second, 200), true);
  assert.equal(first.ammoMagazine.reloadUntil, 600);
  assert.equal(second.ammoMagazine.ammoRemaining, 1);

  assert.equal(prepareWeaponAttack(second, 300), true);
  assert.equal(second.ammoMagazine.reloadUntil, 1500);
  first.ammoMagazine.update(600);
  second.ammoMagazine.update(1499);
  assert.equal(first.ammoMagazine.ammoRemaining, 1);
  assert.equal(second.ammoMagazine.ammoRemaining, 0);
  second.ammoMagazine.update(1500);
  assert.equal(second.ammoMagazine.ammoRemaining, 2);
});

test('a weapon swap does not inherit the former weapon magazine or reload state', () => {
  const oldState = makeAttackState('old-weapon', 1);
  oldState.ammoMagazine.consumeShot(0);
  assert.equal(canReuseWeaponAttackState(oldState, { weaponId: 'new-weapon' }), false);
  assert.equal(canReuseWeaponAttackState(oldState, { weaponId: 'old-weapon' }), true);
  assert.equal(canReuseWeaponAttackState({ profile: {}, ammoMagazine: oldState.ammoMagazine }, {}), true);

  const replacement = makeAttackState('new-weapon', 4);
  assert.notEqual(replacement.ammoMagazine, oldState.ammoMagazine);
  assert.equal(replacement.ammoMagazine.ammoRemaining, 4);
  assert.equal(replacement.ammoMagazine.reloadUntil, 0);
});

test('repeated updates do not reset reload deadlines, and the weapon waits through the interval', () => {
  const state = makeAttackState('gun', 1, 500);
  prepareWeaponAttack(state, 100);
  state.ammoMagazine.update(200);
  state.ammoMagazine.update(599);
  assert.equal(state.ammoMagazine.reloadUntil, 600);
  assert.equal(state.ammoMagazine.ammoRemaining, 0);
  assert.equal(prepareWeaponAttack(state, 599, { freeAttack: true }), false);
  state.ammoMagazine.update(600);
  assert.equal(state.ammoMagazine.ammoRemaining, 1);
  assert.equal(state.ammoMagazine.reloadUntil, 0);
  assert.equal(prepareWeaponAttack(state, 600), true);
});
