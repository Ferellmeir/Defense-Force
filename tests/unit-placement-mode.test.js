import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUnitForPlacement } from '../src/systems/unitPlacementMode.js';

test('selecting a unit exits special-tile mode before placement', () => {
  let specialTileMode = true;
  const registry = { selected: null, set(key, value) { if (key === 'selectedUnit') this.selected = value; } };
  const gameScene = { setSpecialTilePlacementMode(enabled) { specialTileMode = enabled; } };
  selectUnitForPlacement('deployment-2', registry, gameScene);
  assert.equal(specialTileMode, false);
  assert.equal(registry.selected, 'deployment-2');
});
