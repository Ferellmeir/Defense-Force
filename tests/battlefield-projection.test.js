import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattlefieldProjection } from '../src/utils/battlefieldProjection.js';

const projection = createBattlefieldProjection({
  mapWidth: 20,
  mapHeight: 12,
  tileSize: 64,
  viewportWidth: 1280,
  viewportHeight: 720,
});

test('projected tile centers invert to their original logical tile', () => {
  for (const tile of [
    { x: 0, y: 0 },
    { x: 19, y: 0 },
    { x: 0, y: 11 },
    { x: 19, y: 11 },
    { x: 9, y: 5 },
    { x: 5, y: 2 },
  ]) {
    const screen = projection.worldToScreen(
      (tile.x + 0.5) * 64,
      (tile.y + 0.5) * 64
    );
    assert.deepEqual(projection.screenToTile(screen.x, screen.y), tile);
  }
});

test('projected map corners fit within the battlefield viewport', () => {
  const corners = [
    projection.worldToScreen(0, 0),
    projection.worldToScreen(20 * 64, 0),
    projection.worldToScreen(0, 12 * 64),
    projection.worldToScreen(20 * 64, 12 * 64),
  ];
  for (const corner of corners) {
    assert.ok(corner.x >= 24 && corner.x <= 1280 - 24);
    assert.ok(corner.y >= 80 + 8 && corner.y <= 720 - 100 - 8);
  }
});
