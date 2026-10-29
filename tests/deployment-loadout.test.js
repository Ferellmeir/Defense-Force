import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';
import TowerManager from '../src/systems/TowerManager.js';

function createRpgFixture() {
  const manager = Object.create(RPGManager.prototype);
  manager.units = { UNIT: { id: 'UNIT', cost: 10 } };
  manager.equipment = {
    items: {
      sidearm: { id: 'sidearm', type: 'weapon', hands: 1 },
      pistol: { id: 'pistol', type: 'weapon', hands: 1 },
      rifle: { id: 'rifle', type: 'weapon', hands: 2 },
      gear: { id: 'gear', type: 'utility' },
      makeshift: { id: 'makeshift', type: 'weapon', rarity: 'MAKESHIFT', hands: 2 },
    },
    augments: { sample: { id: 'sample', cost: 100 } },
  };
  manager.state = {
    units: {
      UNIT: {
        id: 'UNIT',
        rank: 1,
        copies: 1,
        equipped: { left: 'sidearm', right: null, utility: 'gear' },
        augments: [],
      },
    },
    inventory: [
      { itemId: 'sidearm' },
      { itemId: 'rifle' },
      { itemId: 'gear' },
    ],
  };
  manager.saveCount = 0;
  manager.save = () => { manager.saveCount += 1; };
  manager.scene = { registry: { set() {} } };
  return manager;
}

function createDeploymentFixture(force = 10) {
  const rpgManager = createRpgFixture();
  const persistentBefore = JSON.parse(JSON.stringify(rpgManager.state));
  let forceSpendCalls = 0;
  let towerCreateCalls = 0;
  const messages = [];
  const group = {
    children: [],
    add(tower) { this.children.push(tower); },
    remove(tower) { this.children = this.children.filter(item => item !== tower); },
    getChildren() { return this.children; },
    clear() { this.children = []; },
  };
  const scene = {
    add: { group: () => group },
    rpgManager,
    events: { emit: (event, message) => { if (event === 'showMessage') messages.push(message); } },
    registry: { get: key => key === 'missionRoster' ? ['UNIT'] : null },
    mapManager: { getCurrentMap: () => ({ tileSize: 64 }) },
    pathTileKeys: new Set(),
    economyManager: {
      force,
      getForce() { return this.force; },
      spendForce(amount) {
        forceSpendCalls += 1;
        if (this.force < amount) return false;
        this.force -= amount;
        return true;
      },
    },
  };
  rpgManager.createDeploymentProgression = (unitId, source = {}) => ({
    veterancy: 1,
    experience: 0,
    xp: 0,
    selectedPaths: {},
    pathProgress: {},
    pathTierSelection: {},
    ...source,
  });
  rpgManager.getEffectiveStats = (unitId, progression) => ({
    unitId,
    veterancy: progression.veterancy,
    experience: progression.experience,
    equipment: { weapons: [], utility: null },
  });
  const manager = new TowerManager(scene);
  manager.createTower = (unitId, tile, towerData, deploymentCost) => {
    towerCreateCalls += 1;
    return {
      unitId,
      tile,
      towerData,
      deploymentCost,
      destroyed: false,
      destroy() { this.destroyed = true; },
    };
  };
  const makeTile = () => ({
    x: 64,
    y: 64,
    gridPosition: { x: 1, y: 1 },
    hasTower: false,
    setAlpha() {},
  });
  return {
    manager,
    scene,
    rpgManager,
    persistentBefore,
    makeTile,
    getForceSpendCalls: () => forceSpendCalls,
    getTowerCreateCalls: () => towerCreateCalls,
    messages,
    group,
  };
}

test('equip is atomic and a two-handed weapon occupies both hand slots', () => {
  const manager = createRpgFixture();
  const owned = manager.getOwnedUnit('UNIT');
  assert.equal(manager.equip('UNIT', 'rifle', 'left'), true);
  assert.deepEqual(owned.equipped, { left: 'rifle', right: 'rifle', utility: 'gear' });

  const beforeInvalidEquip = JSON.parse(JSON.stringify(owned.equipped));
  const savesBeforeInvalidEquip = manager.saveCount;
  assert.equal(manager.equip('UNIT', 'sidearm', 'utility'), false);
  assert.equal(manager.equip('UNIT', 'sidearm', 'invalid'), false);
  assert.deepEqual(owned.equipped, beforeInvalidEquip);
  assert.equal(manager.saveCount, savesBeforeInvalidEquip);
});

test('automatic one-handed assignment uses right first and the left hand for a second equip', () => {
  const manager = createRpgFixture();
  const owned = manager.getOwnedUnit('UNIT');
  owned.equipped = { left: null, right: null, utility: null };
  manager.equipment.items.pistol.hands = 1;
  manager.state.inventory.push({ itemId: 'pistol' });

  assert.equal(manager.equip('UNIT', 'pistol', 'auto'), true);
  assert.deepEqual(owned.equipped, { left: null, right: 'pistol', utility: null });
  assert.equal(manager.equip('UNIT', 'pistol', 'auto'), true);
  assert.deepEqual(owned.equipped, { left: 'pistol', right: 'pistol', utility: null });
});

test('automatic first one-handed weapon uses left when the right hand is already occupied', () => {
  const manager = createRpgFixture();
  const owned = manager.getOwnedUnit('UNIT');
  owned.equipped = { left: null, right: 'sidearm', utility: null };
  manager.equipment.items.pistol.hands = 1;
  manager.state.inventory.push({ itemId: 'pistol' });

  assert.equal(manager.equip('UNIT', 'pistol', 'auto'), true);
  assert.deepEqual(owned.equipped, { left: 'pistol', right: 'sidearm', utility: null });
});

test('automatic one-handed melee weapon replaces a mirrored two-handed starter weapon', () => {
  const manager = createRpgFixture();
  manager.equipment.items.blade = { id: 'blade', type: 'weapon', hands: 1, attackType: 'melee' };
  manager.state.inventory.push({ itemId: 'blade' });
  const owned = manager.getOwnedUnit('UNIT');
  owned.equipped = { left: 'rifle', right: 'rifle', utility: 'gear' };

  assert.equal(manager.equip('UNIT', 'blade', 'auto'), true);
  assert.deepEqual(owned.equipped, { left: null, right: 'blade', utility: 'gear' });
  assert.equal(manager.saveCount, 1);
});

test('invalid or unowned melee equipment is rejected without changing the loadout', () => {
  const manager = createRpgFixture();
  manager.equipment.items.invalid_blade = { id: 'invalid_blade', type: 'weapon', hands: 0, attackType: 'melee' };
  manager.equipment.items.unowned_blade = { id: 'unowned_blade', type: 'weapon', hands: 1, attackType: 'melee' };
  const before = structuredClone(manager.getOwnedUnit('UNIT').equipped);

  assert.equal(manager.equip('UNIT', 'invalid_blade', 'left'), false);
  assert.equal(manager.equip('UNIT', 'unowned_blade', 'left'), false);
  assert.deepEqual(manager.getOwnedUnit('UNIT').equipped, before);
  assert.equal(manager.saveCount, 0);
});

test('weapon restrictions and two-handed slot behavior still apply to melee equipment', () => {
  const manager = createRpgFixture();
  manager.units.UNIT.weaponRestrictions = ['heavy'];
  manager.equipment.items.blade = { id: 'blade', type: 'weapon', hands: 1, attackType: 'melee' };
  manager.equipment.items.yari = { id: 'yari', type: 'weapon', hands: 2, attackType: 'melee' };
  manager.state.inventory.push({ itemId: 'blade' }, { itemId: 'yari' });
  const owned = manager.getOwnedUnit('UNIT');

  assert.equal(manager.equip('UNIT', 'blade', 'left'), false);
  assert.equal(manager.equip('UNIT', 'yari', 'auto'), true);
  assert.deepEqual(owned.equipped, { left: 'yari', right: 'yari', utility: 'gear' });
  assert.equal(manager.equip('UNIT', 'blade', 'left'), false);
});

test('explicit hand selection takes priority over automatic placement', () => {
  const manager = createRpgFixture();
  manager.equipment.items.pistol.hands = 1;
  manager.state.inventory.push({ itemId: 'pistol' });
  const owned = manager.getOwnedUnit('UNIT');

  assert.equal(manager.equip('UNIT', 'pistol', 'right'), true);
  assert.deepEqual(owned.equipped, { left: 'sidearm', right: 'pistol', utility: 'gear' });
  assert.equal(manager.equip('UNIT', 'pistol', 'left'), true);
  assert.deepEqual(owned.equipped, { left: 'pistol', right: 'pistol', utility: 'gear' });
});

test('automatic one-handed assignment never replaces unrelated items when both hands are occupied', () => {
  const manager = createRpgFixture();
  manager.equipment.items.pistol.hands = 1;
  manager.state.inventory.push({ itemId: 'pistol' });
  const owned = manager.getOwnedUnit('UNIT');
  owned.equipped.right = 'pistol';
  const before = JSON.parse(JSON.stringify(owned.equipped));

  assert.equal(manager.equip('UNIT', 'pistol', 'auto'), false);
  assert.deepEqual(owned.equipped, before);
});

test('automatic hand placement continues to reject weapon-incompatible units', () => {
  const manager = createRpgFixture();
  manager.units.UNIT.weaponRestrictions = ['firearms'];
  manager.equipment.items.pistol.attackType = 'melee';
  manager.state.inventory.push({ itemId: 'pistol' });
  const before = JSON.parse(JSON.stringify(manager.getOwnedUnit('UNIT').equipped));

  assert.equal(manager.equip('UNIT', 'pistol', 'auto'), false);
  assert.deepEqual(manager.getOwnedUnit('UNIT').equipped, before);
});

test('mission roster selection is mission-only and rejects unknown or unowned units', () => {
  const manager = createRpgFixture();
  const roster = [];
  manager.scene.registry.set = (key, value) => {
    if (key === 'missionRoster') roster.splice(0, roster.length, ...value);
  };
  const persistentBefore = JSON.parse(JSON.stringify(manager.state));
  assert.equal(manager.setMissionRoster(['UNIT', 'UNIT']), true);
  assert.deepEqual(roster, ['UNIT']);
  assert.deepEqual(manager.state, persistentBefore);
  assert.equal(manager.setMissionRoster(['MISSING']), false);
  assert.equal(manager.setMissionRoster([]), false);
  assert.deepEqual(roster, ['UNIT']);
  assert.deepEqual(manager.state, persistentBefore);
});

test('insufficient Force leaves the tile, deployment state, and roster unchanged', () => {
  const fixture = createDeploymentFixture(9.99);
  const tile = fixture.makeTile();
  assert.equal(fixture.manager.deployUnit('UNIT', tile), false);
  assert.equal(fixture.scene.economyManager.force, 9.99);
  assert.equal(fixture.getForceSpendCalls(), 0);
  assert.equal(fixture.getTowerCreateCalls(), 0);
  assert.equal(tile.hasTower, false);
  assert.equal(fixture.group.children.length, 0);
  assert.deepEqual(fixture.rpgManager.state, fixture.persistentBefore);
  assert.deepEqual(fixture.messages, ['Not enough Force. 15 Force required.']);
});

test('deployment validation reports the exact tile or mission restriction that rejected placement', () => {
  const fixture = createDeploymentFixture(50);
  const tile = fixture.makeTile();
  fixture.scene.pathTileKeys.add('1,1');
  assert.equal(fixture.manager.getDeploymentFailure('UNIT', tile), 'Units cannot be placed on enemy paths.');
  fixture.scene.pathTileKeys.clear();
  fixture.scene.mapManager.getCurrentMap = () => ({ placementRestrictions: [{ x: 1, y: 1, width: 1, height: 1 }] });
  assert.equal(fixture.manager.getDeploymentFailure('UNIT', tile), 'Units cannot be placed on reserved terrain.');
  fixture.scene.mapManager.getCurrentMap = () => ({ tileSize: 64, placementRestrictions: [] });
  fixture.rpgManager.units.UNIT.faction = 'Sewer Rats';
  fixture.scene.registry.get = key => key === 'missionRoster' ? ['UNIT'] : key === 'selectedMission'
    ? { restrictions: [{ kind: 'faction', faction: 'Sewer Rats', label: 'Sewer Rats are restricted' }] } : null;
  assert.equal(fixture.manager.getDeploymentFailure('UNIT', tile), 'Sewer Rats are restricted');
});

test('successful deployments deduct the configured Force cost once per deployment', () => {
  const fixture = createDeploymentFixture(30);
  const firstTile = fixture.makeTile();
  const secondTile = fixture.makeTile();
  assert.equal(fixture.manager.deployUnit('UNIT', firstTile), true);
  assert.equal(fixture.manager.deployUnit('UNIT', secondTile), true);
  assert.equal(fixture.scene.economyManager.force, 0);
  assert.equal(fixture.group.children[0].deploymentCost, 15);
  assert.equal(fixture.getForceSpendCalls(), 2);
  assert.equal(fixture.group.children.length, 2);
  assert.equal(firstTile.hasTower, true);
  assert.equal(secondTile.hasTower, true);
  assert.deepEqual(fixture.rpgManager.state, fixture.persistentBefore);
});

test('duplicate unit deployments preserve separate loadouts through tower creation', () => {
  const fixture = createDeploymentFixture(50);
  const first = { deploymentId: 'first', unitId: 'UNIT', equipped: { left: 'sidearm', right: null, utility: null }, equipment: { weapons: [fixture.rpgManager.getItemDefinition('sidearm'), null], utility: null }, augments: [] };
  const second = { deploymentId: 'second', unitId: 'UNIT', equipped: { left: 'rifle', right: 'rifle', utility: 'gear' }, equipment: { weapons: [fixture.rpgManager.getItemDefinition('rifle'), fixture.rpgManager.getItemDefinition('rifle')], utility: fixture.rpgManager.getItemDefinition('gear') }, augments: [] };
  fixture.scene.registry.get = key => key === 'missionRoster' ? [first, second] : key === 'selectedUnit' ? 'first' : null;
  let received;
  fixture.rpgManager.getEffectiveStats = (id, progression) => { received = progression; return { unitId: id, equipment: progression.equipment }; };
  const one = fixture.manager.deployUnit('UNIT', fixture.makeTile());
  assert.equal(one, true);
  assert.deepEqual(received.equipped, first.equipped);
  assert.equal(received.equipment.weapons[0].id, 'sidearm');
  fixture.scene.registry.get = key => key === 'missionRoster' ? [first, second] : key === 'selectedUnit' ? 'second' : null;
  const two = fixture.manager.deployUnit('UNIT', fixture.makeTile());
  assert.equal(two, true);
  assert.deepEqual(received.equipped, second.equipped);
  assert.equal(received.equipment.utility.id, 'gear');
  assert.deepEqual(fixture.rpgManager.state, fixture.persistentBefore);
});

test('same-type lineup instances keep independent loadouts when equipped and saved', () => {
  const manager = createRpgFixture();
  const first = { deploymentId: 'first', unitId: 'UNIT', equipped: { left: 'sidearm', right: null, utility: null }, augments: [] };
  const second = { deploymentId: 'second', unitId: 'UNIT', equipped: { left: 'rifle', right: 'rifle', utility: 'gear' }, augments: [] };
  manager.equipment.items.sidearm.hands = 1;
  manager.equipment.items.rifle.hands = 2;
  assert.equal(manager.setDeploymentLineup([first, second]), true);

  const savedFirst = manager.state.deploymentLineup[0];
  const savedSecond = manager.state.deploymentLineup[1];
  assert.notEqual(savedFirst.equipped, savedSecond.equipped);
  assert.equal(manager.equip('UNIT', 'sidearm', 'right', savedFirst), true);
  assert.equal(manager.unequip('UNIT', 'utility', savedFirst), true);
  assert.deepEqual(savedSecond.equipped, { left: 'rifle', right: 'rifle', utility: 'gear' });
  assert.deepEqual(savedSecond.augments, []);

  manager.setDeploymentLineup([savedFirst, savedSecond]);
  assert.deepEqual(manager.state.deploymentLineup.slice(0, 2).map(entry => entry.equipped), [
    { left: 'sidearm', right: 'sidearm', utility: null },
    { left: 'rifle', right: 'rifle', utility: 'gear' },
  ]);
});

test('a rejected Force spend creates no deployed or tile state', () => {
  const fixture = createDeploymentFixture(15);
  fixture.scene.economyManager.spendForce = () => false;
  const tile = fixture.makeTile();
  assert.equal(fixture.manager.deployUnit('UNIT', tile), false);
  assert.equal(fixture.getTowerCreateCalls(), 1);
  assert.equal(fixture.group.children.length, 0);
  assert.equal(tile.hasTower, false);
  assert.deepEqual(fixture.rpgManager.state, fixture.persistentBefore);
});

function assertDeploymentCost(manager, expected) {
  const actual = manager.getDeploymentForceCost('UNIT');
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${expected}, got ${actual}`);
}

test('deployment Force cost preserves the base unit cost with no equipment', () => {
  const manager = createRpgFixture();
  manager.getOwnedUnit('UNIT').equipped = { left: null, right: null, utility: null };
  const persistentBefore = JSON.parse(JSON.stringify(manager.state));
  assertDeploymentCost(manager, 10);
  assert.deepEqual(manager.state, persistentBefore);
});

test('one-handed weapons add at least 4 Force and scale above the minimum', () => {
  const manager = createRpgFixture();
  const owned = manager.getOwnedUnit('UNIT');
  manager.equipment.items.sidearm.cost = 10;
  owned.equipped = { left: 'sidearm', right: null, utility: null };
  assertDeploymentCost(manager, 14);

  manager.equipment.items.sidearm.cost = 40;
  assertDeploymentCost(manager, 10 + (40 / 4.2));
});

test('two-handed weapons add at least 8 Force and count once across both slots', () => {
  const manager = createRpgFixture();
  const owned = manager.getOwnedUnit('UNIT');
  manager.equipment.items.rifle.cost = 10;
  owned.equipped = { left: 'rifle', right: 'rifle', utility: null };
  assertDeploymentCost(manager, 18);

  manager.equipment.items.rifle.cost = 40;
  assertDeploymentCost(manager, 10 + (40 / 4.2));
});

test('two separate one-handed weapons each add their own Force increase', () => {
  const manager = createRpgFixture();
  manager.equipment.items.sidearm.cost = 10;
  manager.equipment.items.pistol.cost = 40;
  manager.getOwnedUnit('UNIT').equipped = {
    left: 'sidearm', right: 'pistol', utility: null,
  };
  assertDeploymentCost(manager, 10 + 4 + (40 / 4.2));
});

test('utility equipment adds at least 1 Force and scales above the minimum', () => {
  const manager = createRpgFixture();
  manager.getOwnedUnit('UNIT').equipped = { left: null, right: null, utility: 'gear' };
  manager.equipment.items.gear.cost = 4;
  assertDeploymentCost(manager, 11);

  manager.equipment.items.gear.cost = 16.8;
  assertDeploymentCost(manager, 12);
});

test('augments without an explicit Force modifier add nothing', () => {
  const manager = createRpgFixture();
  manager.getOwnedUnit('UNIT').equipped = { left: null, right: null, utility: null };
  manager.getOwnedUnit('UNIT').augments = ['sample'];
  assertDeploymentCost(manager, 10);
});

test('free makeshift weapons still use the applicable minimum increase', () => {
  const manager = createRpgFixture();
  manager.getOwnedUnit('UNIT').equipped = {
    left: 'makeshift', right: 'makeshift', utility: null,
  };
  assertDeploymentCost(manager, 18);
});

test('deployment Force cost combines unit, weapon, utility, and no-default augment premium', () => {
  const manager = createRpgFixture();
  manager.equipment.items.sidearm.cost = 40;
  manager.equipment.items.gear.cost = 16.8;
  manager.getOwnedUnit('UNIT').equipped = {
    left: 'sidearm', right: null, utility: 'gear',
  };
  manager.getOwnedUnit('UNIT').augments = ['sample'];
  assertDeploymentCost(manager, 10 + (40 / 4.2) + 2);
});

test('equipment purchases spend credits once and add equipment to persistent inventory', () => {
  const manager = createRpgFixture();
  manager.state.credits = 50;
  manager.equipment.items.sidearm.cost = 30;
  assert.equal(manager.purchaseEquipment('sidearm'), false); // Already owned.
  manager.equipment.items.new_item = { id: 'new_item', name: 'New item', type: 'weapon', hands: 1, cost: 30 };
  assert.equal(manager.purchaseEquipment('new_item'), true);
  assert.equal(manager.state.credits, 20);
  assert.equal(manager.getItemInstance('new_item').itemId, 'new_item');
  assert.equal(manager.purchaseEquipment('new_item'), false);
});

test('equipment purchases reject insufficient credits and unpriced equipment', () => {
  const manager = createRpgFixture();
  manager.state.credits = 5;
  manager.equipment.items.costly = { id: 'costly', type: 'weapon', hands: 2, cost: 20 };
  manager.equipment.items.unpriced = { id: 'unpriced', type: 'weapon', hands: 1 };
  assert.equal(manager.purchaseEquipment('costly'), false);
  assert.equal(manager.purchaseEquipment('unpriced'), false);
  assert.equal(manager.state.credits, 5);
  assert.equal(manager.getItemInstance('costly'), undefined);
});

test('mission roster selection and deselection leaves persistent ownership untouched', () => {
  const manager = createRpgFixture();
  const roster = [];
  manager.scene.registry.set = (key, value) => { if (key === 'missionRoster') roster.splice(0, roster.length, ...value); };
  const before = JSON.parse(JSON.stringify(manager.state));
  assert.equal(manager.setMissionRoster(['UNIT']), true);
  assert.deepEqual(roster, ['UNIT']);
  assert.equal(manager.setMissionRoster([]), false);
  assert.deepEqual(manager.state, before);
});

test('equip rejects equipment that is defined but not owned', () => {
  const manager = createRpgFixture();
  manager.equipment.items.unowned = { id: 'unowned', type: 'weapon', hands: 1 };
  const before = JSON.parse(JSON.stringify(manager.getOwnedUnit('UNIT').equipped));
  assert.equal(manager.equip('UNIT', 'unowned', 'left'), false);
  assert.deepEqual(manager.getOwnedUnit('UNIT').equipped, before);
});

test('Makeshift equipment is equipable and permanently available without inventory ownership', () => {
  const manager = createRpgFixture();
  assert.equal(manager.getItemInstance('makeshift'), undefined);
  assert.equal(manager.getOwnedItems('weapon').some(({ definition }) => definition.id === 'makeshift'), true);
  assert.equal(manager.getEquipmentCreditCost('makeshift'), null);
  assert.equal(manager.purchaseEquipment('makeshift'), false);
  assert.equal(manager.equip('UNIT', 'makeshift', 'left'), true);
  assert.deepEqual(manager.getOwnedUnit('UNIT').equipped, { left: 'makeshift', right: 'makeshift', utility: 'gear' });
  assert.equal(manager.getItemInstance('makeshift'), undefined);
  assert.equal(manager.state.inventory.some(item => item.itemId === 'makeshift'), false);
});

test('recruiting a unit keeps its makeshift starter loadout out of persistent inventory', () => {
  const manager = createRpgFixture();
  delete manager.state.units.UNIT;
  assert.equal(manager.addUnitCopy('UNIT'), true);
  assert.deepEqual(manager.getOwnedUnit('UNIT').equipped, { left: 'makeshift', right: 'makeshift', utility: null });
  assert.equal(manager.state.inventory.some(item => item.itemId === 'makeshift'), false);
});

test('purchased equipment and loadout persist when RPG screens are reopened', () => {
  const manager = createRpgFixture();
  manager.state.credits = 100;
  manager.equipment.items.purchase = { id: 'purchase', type: 'weapon', hands: 1, cost: 25 };
  let persisted;
  manager.save = () => { persisted = JSON.parse(JSON.stringify(manager.state)); };
  assert.equal(manager.purchaseEquipment('purchase'), true);
  assert.equal(manager.equip('UNIT', 'purchase', 'right'), true);
  const reopened = createRpgFixture();
  reopened.equipment.items.purchase = manager.equipment.items.purchase;
  reopened.state = persisted;
  assert.equal(reopened.getItemInstance('purchase').itemId, 'purchase');
  assert.equal(reopened.getOwnedUnit('UNIT').equipped.right, 'purchase');
  assert.equal(reopened.state.credits, 75);
});

test('deployment authority rejects path tiles even when called outside the scene click handler', () => {
  const fixture = createDeploymentFixture(20);
  fixture.scene.pathTileKeys.add('1,1');
  const tile = fixture.makeTile();
  assert.equal(fixture.manager.deployUnit('UNIT', tile), false);
  assert.equal(fixture.getForceSpendCalls(), 0);
  assert.equal(fixture.getTowerCreateCalls(), 0);
  assert.equal(tile.hasTower, false);
});

test('deployment authority rejects tiles inside an unclearable building footprint', () => {
  const fixture = createDeploymentFixture(30);
  fixture.scene.mapManager.getCurrentMap = () => ({
    tileSize: 64,
    placementRestrictions: [{ x: 1, y: 1, width: 2, height: 3 }],
  });
  for (let x = 1; x < 3; x += 1) for (let y = 1; y < 4; y += 1) {
    const tile = fixture.makeTile();
    tile.gridPosition = { x, y };
    assert.equal(fixture.manager.deployUnit('UNIT', tile), false);
    assert.equal(tile.hasTower, false);
  }
  assert.equal(fixture.getForceSpendCalls(), 0);
  assert.equal(fixture.getTowerCreateCalls(), 0);
});
