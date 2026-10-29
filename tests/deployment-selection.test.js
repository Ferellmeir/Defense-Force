import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDeploymentSelection,
  handleDeploymentItemPointerDown,
} from '../src/systems/deploymentSelection.js';
import { getDeploymentEquipmentRows } from '../src/systems/deploymentEquipmentPanel.js';

test('selecting different inventory items moves the highlight to exactly the clicked item', () => {
  const selection = createDeploymentSelection();
  const unit = { id: 'UNIT_A', kind: 'unit' };
  const weapon = { id: 'weapon_a', kind: 'equipment' };
  const augment = { id: 'augment_a', kind: 'equipment' };

  selection.select(unit);
  assert.deepEqual([unit, weapon, augment].filter(item => selection.isSelected(item)), [unit]);
  selection.select(weapon);
  assert.deepEqual([unit, weapon, augment].filter(item => selection.isSelected(item)), [weapon]);
  selection.select(augment);
  assert.deepEqual([unit, weapon, augment].filter(item => selection.isSelected(item)), [augment]);
});

test('selection resolves recreated inventory records after filters and inventory rerenders', () => {
  const selection = createDeploymentSelection();
  selection.select({ id: 'rifle', kind: 'equipment', name: 'Old render' });

  const afterFilter = { id: 'rifle', kind: 'equipment', name: 'Current render' };
  assert.equal(selection.resolve([afterFilter]), afterFilter);
  assert.equal(selection.isSelected(afterFilter), true);
  const afterInventoryUpdate = { id: 'rifle', kind: 'equipment', name: 'Updated item' };
  assert.equal(selection.resolve([afterInventoryUpdate]), afterInventoryUpdate);
});

test('identical equipment copies keep distinct selection highlights', () => {
  const selection = createDeploymentSelection();
  const firstCopy = { id: 'rifle', kind: 'equipment', selectionId: 'instance:1' };
  const secondCopy = { id: 'rifle', kind: 'equipment', selectionId: 'instance:2' };

  selection.select(secondCopy);
  assert.equal(selection.isSelected(firstCopy), false);
  assert.equal(selection.isSelected(secondCopy), true);
});

test('inventory click stops propagation, selects the item, and only assigns clicked units', () => {
  const selection = createDeploymentSelection();
  let parentActionCalls = 0;
  let assignedUnit = null;
  const clickEvent = { stopPropagation() { parentActionCalls += 1; } };
  const selectItem = item => selection.select(item);
  const assignUnit = id => { assignedUnit = id; };

  handleDeploymentItemPointerDown({ id: 'UNIT_B', kind: 'unit' }, clickEvent, { selectItem, assignUnit });
  assert.equal(selection.key, 'unit:UNIT_B');
  assert.equal(assignedUnit, 'UNIT_B');
  assert.equal(parentActionCalls, 1);

  handleDeploymentItemPointerDown({ id: 'gear_a', kind: 'equipment' }, clickEvent, { selectItem, assignUnit });
  assert.equal(selection.key, 'equipment:gear_a');
  assert.equal(assignedUnit, 'UNIT_B');
  assert.equal(parentActionCalls, 2);
});

test('equipment panel rows follow the currently selected deployment and show each slot separately', () => {
  const units = {
    UNIT_A: { equipped: { right: 'pistol', left: null, utility: 'scanner' }, augments: ['optic'] },
    UNIT_B: { equipped: { right: null, left: 'blade', utility: null }, augments: [] },
  };
  const items = {
    pistol: { id: 'pistol', name: 'Pistol' },
    scanner: { id: 'scanner', name: 'Scanner' },
    optic: { id: 'optic', name: 'Optic' },
    blade: { id: 'blade', name: 'Blade' },
  };
  const rpg = {
    getOwnedUnit: id => units[id],
    getItemDefinition: id => items[id],
  };

  const first = getDeploymentEquipmentRows({ unitId: 'UNIT_A', ...units.UNIT_A }, rpg);
  assert.deepEqual(first.map(row => [row.slot, row.item?.name || null]), [
    ['right', 'Pistol'], ['left', null], ['utility', 'Scanner'], ['augment', 'Optic'],
  ]);
  const second = getDeploymentEquipmentRows({ unitId: 'UNIT_B', ...units.UNIT_B }, rpg);
  assert.deepEqual(second.map(row => [row.slot, row.item?.name || null]), [
    ['right', null], ['left', 'Blade'], ['utility', null], ['augment', null],
  ]);
  assert.deepEqual(getDeploymentEquipmentRows(null, rpg), []);
});

test('equipment panel reflects equip and removal immediately from the selected deployment loadout', () => {
  const deployment = { unitId: 'UNIT', equipped: { right: null, left: null, utility: null }, augments: [] };
  const rpg = {
    getOwnedUnit: () => owned,
    getItemDefinition: id => ({ id, name: id.toUpperCase() }),
  };
  assert.equal(getDeploymentEquipmentRows(deployment, rpg)[0].item, null);
  deployment.equipped.right = 'pistol';
  assert.equal(getDeploymentEquipmentRows(deployment, rpg)[0].item.name, 'PISTOL');
  deployment.equipped.right = null;
  assert.equal(getDeploymentEquipmentRows(deployment, rpg)[0].item, null);
});
