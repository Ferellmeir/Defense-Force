import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMissionMap } from '../src/systems/missionGeneration.js';
import {
  canClearBlockedTile,
  clearBlockedTile,
  CLEAR_TILE_FORCE_COST,
} from '../src/systems/tileClearing.js';
import { createTileClearConfirmationController } from '../src/systems/tileClearConfirmation.js';
import { createTileHoverPopupController } from '../src/systems/tileHoverPopup.js';

function createEconomy(force) {
  return {
    force,
    spendCalls: [],
    spendForce(amount) {
      this.spendCalls.push(amount);
      if (this.force < amount) return false;
      this.force -= amount;
      return true;
    },
  };
}

function createMap() {
  return generateMissionMap({ width: 20, height: 12, tileSize: 64, placementRestrictions: [] }, 128);
}

test('clearing an eligible tile with sufficient Force spends exactly 70 and updates its state', () => {
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const economy = createEconomy(100);

  assert.ok(tile);
  assert.equal(CLEAR_TILE_FORCE_COST, 70);
  assert.equal(clearBlockedTile(map, tile, economy), true);
  assert.equal(economy.force, 30);
  assert.deepEqual(economy.spendCalls, [70]);
  assert.equal(map.blockedClearableTiles.some(point => point.x === tile.x && point.y === tile.y), false);
  assert.equal(map.clearTiles.some(point => point.x === tile.x && point.y === tile.y), true);
});

test('insufficient Force prevents clearing and leaves Force and tile state unchanged', () => {
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const economy = createEconomy(69);

  assert.equal(clearBlockedTile(map, tile, economy), false);
  assert.equal(economy.force, 69);
  assert.deepEqual(economy.spendCalls, [70]);
  assert.equal(map.blockedClearableTiles.some(point => point.x === tile.x && point.y === tile.y), true);
  assert.equal((map.clearTiles || []).some(point => point.x === tile.x && point.y === tile.y), false);
});

test('unclearable and otherwise prohibited tiles fail without attempting to spend Force', () => {
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const economy = createEconomy(100);
  const unclearableMap = {
    blockedClearableTiles: [{ x: 1, y: 1 }],
    placementRestrictions: [{ x: 1, y: 1, width: 1, height: 1 }],
  };
  const unclearable = { x: 1, y: 1 };

  assert.equal(canClearBlockedTile(unclearableMap, unclearable), false);
  assert.equal(clearBlockedTile(unclearableMap, unclearable, economy), false);
  assert.equal(clearBlockedTile(map, map.placementRestrictions[0], economy), false);
  assert.equal(clearBlockedTile(map, { x: -1, y: -1 }, economy), false);
  assert.equal(economy.force, 100);
  assert.deepEqual(economy.spendCalls, []);
  assert.ok(map.blockedClearableTiles.some(point => point.x === tile.x && point.y === tile.y));
});

test('a cleared tile cannot charge a second clearing cost on a later click', () => {
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const economy = createEconomy(200);

  assert.equal(clearBlockedTile(map, tile, economy), true);
  assert.equal(clearBlockedTile(map, tile, economy), false);
  assert.equal(economy.force, 130);
  assert.deepEqual(economy.spendCalls, [70]);
});

function createConfirmationFixture({ map, economy, tile, onCleared = () => {}, onInsufficientForce = () => {}, onOpen = () => {} }) {
  const events = [];
  const controller = createTileClearConfirmationController({
    canClear: (position, context) => canClearBlockedTile(context.map, position),
    clear: (position, context) => clearBlockedTile(context.map, position, economy),
    getForce: () => economy.force,
    onOpen: (position, cost) => { events.push({ type: 'open', position, cost }); onOpen(); },
    onClose: () => events.push({ type: 'close' }),
    onCleared,
    onInsufficientForce,
  });
  return { controller, events, context: { map, tile } };
}

test('the first clearable-tile click opens one confirmation and binds it to that tile', () => {
  const map = createMap();
  const tile = { ...map.blockedClearableTiles[0], isBlockedClearable: true };
  const economy = createEconomy(100);
  const fixture = createConfirmationFixture({ map, economy, tile });

  assert.equal(fixture.controller.open(tile, fixture.context), true);
  assert.equal(fixture.controller.open({ x: tile.x + 1, y: tile.y }, fixture.context), false);
  assert.deepEqual(fixture.events, [{ type: 'open', position: { x: tile.x, y: tile.y }, cost: 70 }]);
  assert.equal(economy.force, 100);
  assert.equal(fixture.controller.isOpen(), true);
});

test('confirming spends 70 once and clears only the initially selected tile', () => {
  const map = createMap();
  const tile = { ...map.blockedClearableTiles[0], isBlockedClearable: true };
  const other = map.blockedClearableTiles[1];
  const economy = createEconomy(100);
  const fixture = createConfirmationFixture({
    map, economy, tile,
    onCleared: (_position, context) => { context.tile.isBlockedClearable = false; },
  });

  fixture.controller.open(tile, fixture.context);
  assert.equal(fixture.controller.confirm(), true);
  assert.equal(fixture.controller.confirm(), false);
  assert.equal(economy.force, 30);
  assert.deepEqual(economy.spendCalls, [70]);
  assert.equal(tile.isBlockedClearable, false);
  assert.equal(map.clearTiles.some(point => point.x === tile.x && point.y === tile.y), true);
  assert.equal(map.blockedClearableTiles.some(point => point.x === other.x && point.y === other.y), true);
});

test('canceling or closing the confirmation does not spend Force or clear its selected tile', () => {
  for (const dismiss of ['cancel', 'close']) {
    const map = createMap();
    const tile = map.blockedClearableTiles[0];
    const economy = createEconomy(100);
    const fixture = createConfirmationFixture({ map, economy, tile });
    fixture.controller.open(tile, fixture.context);

    const closed = dismiss === 'cancel'
      ? fixture.controller.cancel()
      : (fixture.controller.destroy(), true);
    assert.equal(closed, true, `${dismiss} should close the confirmation`);
    assert.equal(fixture.controller.confirm(), false);
    assert.equal(economy.force, 100);
    assert.deepEqual(economy.spendCalls, []);
    assert.ok(map.blockedClearableTiles.some(point => point.x === tile.x && point.y === tile.y));
  }
});

test('confirmation checks current Force at confirm time and reports insufficient Force', () => {
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const economy = createEconomy(100);
  const feedback = [];
  const fixture = createConfirmationFixture({
    map, economy, tile,
    onInsufficientForce: cost => feedback.push(cost),
  });
  fixture.controller.open(tile, fixture.context);
  economy.force = 69;

  assert.equal(fixture.controller.confirm(), false);
  assert.equal(economy.force, 69);
  assert.deepEqual(economy.spendCalls, [70]);
  assert.deepEqual(feedback, [70]);
  assert.ok(map.blockedClearableTiles.some(point => point.x === tile.x && point.y === tile.y));
});

test('unclearable tiles never open a confirmation option', () => {
  const map = {
    blockedClearableTiles: [{ x: 1, y: 1 }],
    placementRestrictions: [{ x: 1, y: 1, width: 1, height: 1 }],
  };
  const tile = { x: 1, y: 1 };
  const economy = createEconomy(100);
  const fixture = createConfirmationFixture({ map, economy, tile });

  assert.equal(fixture.controller.open(tile, fixture.context), false);
  assert.equal(fixture.controller.isOpen(), false);
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.controller.confirm(), false);
  assert.deepEqual(economy.spendCalls, []);
});

test('after clearing, a later tile click follows deployment without opening or charging again', () => {
  const map = createMap();
  const tile = { ...map.blockedClearableTiles[0], isBlockedClearable: true };
  const economy = createEconomy(200);
  let deploymentClicks = 0;
  const fixture = createConfirmationFixture({
    map, economy, tile,
    onCleared: (_position, context) => { context.tile.isBlockedClearable = false; },
  });

  if (tile.isBlockedClearable) fixture.controller.open(tile, fixture.context);
  fixture.controller.confirm();
  if (tile.isBlockedClearable) fixture.controller.open(tile, fixture.context);
  else deploymentClicks += 1;

  assert.equal(deploymentClicks, 1);
  assert.equal(economy.force, 130);
  assert.deepEqual(economy.spendCalls, [70]);
  assert.equal(fixture.controller.isOpen(), false);
});

test('opening the clear confirmation dismisses the hover popup and blocks conflicting hover updates', () => {
  let now = 0;
  const timers = new Map();
  const events = [];
  const hover = createTileHoverPopupController({
    schedule: (delay, callback) => {
      const timer = { due: now + delay, callback };
      timers.set(timer, timer);
      return timer;
    },
    cancel: timer => timers.delete(timer),
    onShow: () => events.push('show'),
    onUpdate: () => events.push('update'),
    onHide: () => events.push('hide'),
  });
  const map = createMap();
  const tile = map.blockedClearableTiles[0];
  const fixture = createConfirmationFixture({
    map,
    economy: createEconomy(100),
    tile,
    onOpen: () => hover.leave(),
  });
  hover.hover('1,1', () => 'tile info', {});
  now = 1000;
  for (const timer of timers.values()) timer.callback();
  fixture.controller.open(tile, fixture.context);
  hover.hover('2,2', () => 'another tile', {});
  assert.deepEqual(events, ['show', 'hide']);
  assert.equal(fixture.controller.isOpen(), true);
  hover.destroy();
});
