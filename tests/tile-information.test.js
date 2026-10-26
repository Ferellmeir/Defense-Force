import assert from 'node:assert/strict';
import test from 'node:test';
import { getTileInformation, getSpecialTileEffect } from '../src/systems/tileInformation.js';
import { createTileHoverPopupController } from '../src/systems/tileHoverPopup.js';
import { TILE_EFFECTS } from '../src/systems/tileEffects.js';

function createScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    schedule(delay, callback) {
      const timer = { id: nextId++, due: now + delay, callback, cancelled: false };
      timers.set(timer.id, timer);
      return timer;
    },
    cancel(timer) { timer.cancelled = true; timers.delete(timer.id); },
    advance(duration) {
      now += duration;
      [...timers.values()].filter(timer => !timer.cancelled && timer.due <= now)
        .sort((a, b) => a.due - b.due).forEach(timer => {
          timers.delete(timer.id);
          timer.callback();
        });
    },
    pendingCount: () => timers.size,
  };
}

function createPopupFixture() {
  const scheduler = createScheduler();
  const events = [];
  const controller = createTileHoverPopupController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (info, anchor) => events.push({ type: 'show', info, anchor }),
    onUpdate: (info, anchor) => events.push({ type: 'update', info, anchor }),
    onHide: () => events.push({ type: 'hide' }),
  });
  return { scheduler, events, controller };
}

test('tile popup appears after one continuous second and same-tile movement does not restart the timer', () => {
  const fixture = createPopupFixture();
  fixture.controller.hover('2,3', () => 'first tile', { x: 1 });
  fixture.scheduler.advance(500);
  fixture.controller.hover('2,3', () => 'updated tile', { x: 2 });
  assert.equal(fixture.scheduler.pendingCount(), 1);
  fixture.scheduler.advance(499);
  assert.equal(fixture.events.length, 0);
  fixture.scheduler.advance(1);
  assert.deepEqual(fixture.events, [{ type: 'show', info: 'updated tile', anchor: { x: 2 } }]);
});

test('changing tiles before the delay cancels the previous popup and starts a new delay', () => {
  const fixture = createPopupFixture();
  fixture.controller.hover('1,1', () => 'old', {});
  fixture.scheduler.advance(700);
  fixture.controller.hover('1,2', () => 'new', {});
  fixture.scheduler.advance(999);
  assert.equal(fixture.events.length, 0);
  fixture.scheduler.advance(1);
  assert.deepEqual(fixture.events.map(event => event.info), ['new']);
});

test('leaving the map cancels a pending popup and hides an already visible popup', () => {
  const fixture = createPopupFixture();
  fixture.controller.hover('1,1', () => 'tile', {});
  fixture.scheduler.advance(500);
  fixture.controller.leave();
  fixture.scheduler.advance(1000);
  assert.deepEqual(fixture.events, []);

  fixture.controller.hover('1,1', () => 'tile', {});
  fixture.scheduler.advance(1000);
  fixture.controller.leave();
  assert.deepEqual(fixture.events.map(event => event.type), ['show', 'hide']);
  assert.equal(fixture.scheduler.pendingCount(), 0);
});

test('once open, the popup updates immediately on tile changes and does not queue another timer', () => {
  const fixture = createPopupFixture();
  fixture.controller.hover('1,1', () => 'first', {});
  fixture.scheduler.advance(1000);
  fixture.controller.hover('1,2', () => 'second', {});
  assert.deepEqual(fixture.events.map(event => event.type), ['show', 'update']);
  assert.equal(fixture.events.at(-1).info, 'second');
  assert.equal(fixture.scheduler.pendingCount(), 0);
});

test('tile information reflects path, elevation, clearability, buildings, specials, and deployment rules', () => {
  const map = {
    width: 8,
    height: 8,
    paths: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 1 }]],
    terrainModifiers: [{ x: 2, y: 1, type: 'incline', speedMultiplier: 0.5 }],
    buildings: [{ x: 4, y: 4, width: 2, height: 3, sprite: 'scenery_building_2x4' }],
    placementRestrictions: [{ x: 4, y: 4, width: 2, height: 3 }, { x: 0, y: 0, width: 1, height: 1 }],
    blockedClearableTiles: [{ x: 3, y: 3 }],
    specialTiles: [{ x: 3, y: 2, type: 'snipers_nest' }],
  };
  const path = getTileInformation(map, { x: 2, y: 1 });
  assert.match(path.type, /Enemy path/);
  assert.ok(path.lines.some(line => line.includes('visited 2 times')));
  assert.ok(path.lines.some(line => line.includes('Uphill') && line.includes('×0.5')));

  const building = getTileInformation(map, { x: 5, y: 6 });
  assert.match(building.type, /2 × 3 footprint/);
  assert.ok(building.lines.some(line => line.includes('Not clearable')));
  assert.ok(building.lines.some(line => line.includes('Not available inside')));

  const clearable = getTileInformation(map, { x: 3, y: 3 });
  assert.equal(clearable.type, 'Clearable obstacle');
  assert.ok(clearable.lines.some(line => line.includes('70 Force')));
  assert.ok(clearable.lines.some(line => line.includes('Clear this obstacle')));

  const unclearable = getTileInformation(map, { x: 0, y: 0 });
  assert.equal(unclearable.type, 'Unclearable obstacle');
  assert.ok(unclearable.lines.some(line => line.includes('Not clearable')));
  assert.equal(unclearable.lines.some(line => line.includes('70 Force')), false);

  const special = getTileInformation(map, { x: 3, y: 2 });
  assert.match(special.type, /Snipers Nest/);
  assert.ok(special.lines.some(line => line.includes('1 tile') && line.includes('5% per tile')));
  assert.ok(special.lines.some(line => line.includes('Deployment: Available')));

  const ground = getTileInformation(map, { x: 7, y: 7 });
  assert.equal(ground.type, 'Deployable ground');
  assert.ok(ground.lines.includes('Effects: No special effects.'));
  assert.ok(ground.lines.some(line => line.includes('roster unit and enough Force')));
  assert.ok(getTileInformation(map, { x: 7, y: 7 }, { occupiedUnitName: 'Gutter Thugs' })
    .lines.some(line => line.includes('Occupied by Gutter Thugs')));
});

test('special-tile descriptions use the same values as their gameplay constants', () => {
  assert.match(getSpecialTileEffect('thermal_enhancement'), new RegExp(`${(TILE_EFFECTS.thermal_enhancement.fireDamageMultiplier - 1) * 100}%`));
  assert.match(getSpecialTileEffect('adaptability_network'), new RegExp(`${TILE_EFFECTS.adaptability_network.chanceBonus * 100} percentage points`));
  assert.match(getSpecialTileEffect('dark_alley'), new RegExp(`${TILE_EFFECTS.dark_alley.stunDurationMs / 1000} seconds`));
});
