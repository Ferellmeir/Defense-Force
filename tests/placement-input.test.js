import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlacementTileAtPointer, isBattlefieldPointerWithinViewport } from '../src/systems/placementInput.js';

test('pointer conversion uses the camera-transformed battlefield point and returns its tile', () => {
  const target = { gridPosition: { x: 7, y: 9 } };
  const camera = {
    getWorldPoint(x, y) {
      return { x: 120 + (x - 640) / 2, y: 80 + (y - 350) / 2 };
    },
  };
  const projection = {
    screenToTile(x, y) { return x === 120 && y === 205 ? { x: 7, y: 9 } : null; },
  };
  assert.equal(getPlacementTileAtPointer({ x: 640, y: 600 }, camera, projection, [target]), target);
  assert.equal(getPlacementTileAtPointer({ x: 640, y: 500 }, camera, projection, [target]), null);
});

test('battlefield pointer area excludes the UI-bar edge and accepts the final battlefield pixel', () => {
  const viewport = { x: 0, y: 80, width: 1280, height: 540 };
  assert.equal(isBattlefieldPointerWithinViewport({ x: 640, y: 619 }, viewport), true);
  assert.equal(isBattlefieldPointerWithinViewport({ x: 640, y: 620 }, viewport), false);
  assert.equal(isBattlefieldPointerWithinViewport({ x: 1280, y: 300 }, viewport), false);
});
