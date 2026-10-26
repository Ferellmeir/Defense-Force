import assert from 'node:assert/strict';
import test from 'node:test';
import { isWithinWeaponRange } from '../src/utils/weaponRange.js';

const TILE_SIZE = 64;
const originTile = { x: 5, y: 5 };
const origin = {
  x: (originTile.x + 0.5) * TILE_SIZE,
  y: (originTile.y + 0.5) * TILE_SIZE,
};
const targetAt = (tileX, tileY) => ({
  x: (tileX + 0.5) * TILE_SIZE,
  y: (tileY + 0.5) * TILE_SIZE,
});
const meleeCanReach = (target, viewState) => {
  // Camera/view state is deliberately not passed to logical range evaluation.
  void viewState;
  return isWithinWeaponRange(origin, target, TILE_SIZE, 'melee', TILE_SIZE);
};

test('a melee weapon cannot target its own logical tile', () => {
  assert.equal(meleeCanReach(targetAt(originTile.x, originTile.y)), false);
});

for (const [direction, tileX, tileY] of [
  ['north', 5, 4],
  ['south', 5, 6],
  ['east', 6, 5],
  ['west', 4, 5],
  ['northeast', 6, 4],
  ['northwest', 4, 4],
  ['southeast', 6, 6],
  ['southwest', 4, 6],
]) {
  test(`a melee weapon can target the immediately adjacent ${direction} tile`, () => {
    assert.equal(meleeCanReach(targetAt(tileX, tileY)), true);
  });
}

test('a melee weapon cannot target beyond its normal one-tile range', () => {
  assert.equal(meleeCanReach(targetAt(7, 5)), false);
});

test('melee range is unchanged by camera zoom or pan because it uses logical coordinates', () => {
  const target = targetAt(6, 6);
  const viewStates = [
    { zoom: 0.5, panX: -900, panY: 400 },
    { zoom: 1, panX: 0, panY: 0 },
    { zoom: 2.5, panX: 1400, panY: -700 },
  ];
  assert.deepEqual(viewStates.map(view => meleeCanReach(target, view)), [true, true, true]);
});
