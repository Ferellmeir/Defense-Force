import assert from 'node:assert/strict';
import test from 'node:test';
import { getMissionHudLayout, shouldShowBarricadeTileControls } from '../src/systems/missionHudLayout.js';

test('mission HUD status and action groups fit without overlap across supported view widths', () => {
  for (const width of [960, 1280, 1600, 1920]) {
    const layout = getMissionHudLayout(width);
    const scale = width / 1280;
    const statusEnd = layout.status[3] + 115 * scale;
    const pauseEnd = layout.pause + 74 * scale;
    const speedEnd = layout.speedStart + 3 * layout.speedStep + 38 * scale;
    assert.ok(statusEnd < layout.pause, `${width}px status group fits before controls`);
    assert.ok(pauseEnd < layout.speedStart, `${width}px pause fits before speed controls`);
    assert.ok(speedEnd < layout.menu, `${width}px speed controls fit before Home`);
    assert.ok(layout.menu + 50 * scale < layout.mute, `${width}px Home fits before Mute`);
    assert.ok(layout.mute + 50 * scale <= width, `${width}px Mute stays on screen`);
  }
});

test('Barricade controls are shown only while authoritative remaining points are positive', () => {
  assert.equal(shouldShowBarricadeTileControls('BARRICADE', 9), true);
  assert.equal(shouldShowBarricadeTileControls('BARRICADE', 1), true);
  assert.equal(shouldShowBarricadeTileControls('BARRICADE', 0), false);
  assert.equal(shouldShowBarricadeTileControls('SECURE_REGION', 5), false);
  assert.equal(shouldShowBarricadeTileControls('GAUNTLET', 5), false);
});
