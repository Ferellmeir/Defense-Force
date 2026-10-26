import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampBattlefieldScroll,
  clampBattlefieldZoom,
  MAX_BATTLEFIELD_ZOOM,
  MIN_BATTLEFIELD_ZOOM,
  zoomScrollAtPointer,
} from '../src/utils/battlefieldCamera.js';

test('battlefield zoom is bounded between the configured limits', () => {
  assert.equal(clampBattlefieldZoom(0.1), MIN_BATTLEFIELD_ZOOM);
  assert.equal(clampBattlefieldZoom(1.25), 1.25);
  assert.equal(clampBattlefieldZoom(3), MAX_BATTLEFIELD_ZOOM);
});

test('cursor anchored zoom keeps the same world point under the pointer', () => {
  const initialScroll = 100;
  const pointer = 420;
  const viewportStart = 80;
  const zoom = 1;
  const nextZoom = 1.5;
  const nextScroll = zoomScrollAtPointer({
    scroll: initialScroll,
    pointer,
    viewportStart,
    viewportSize: 680,
    zoom,
    nextZoom,
  });
  const viewportSize = 680;
  const pointerOffset = pointer - viewportStart - viewportSize / 2;
  assert.equal(
    initialScroll + viewportSize / 2 + pointerOffset / zoom,
    nextScroll + viewportSize / 2 + pointerOffset / nextZoom
  );
});

test('pan is clamped to the map edge in camera-center coordinates', () => {
  assert.equal(clampBattlefieldScroll({
    scroll: 200,
    zoom: 2,
    viewportSize: 100,
    mapStart: 10,
    mapEnd: 180,
  }), 105);
  assert.equal(clampBattlefieldScroll({
    scroll: -200,
    zoom: 2,
    viewportSize: 100,
    mapStart: 10,
    mapEnd: 180,
  }), -15);
  assert.equal(clampBattlefieldScroll({
    scroll: 200,
    zoom: 0.5,
    viewportSize: 100,
    mapStart: 10,
    mapEnd: 80,
  }), -5);
});
