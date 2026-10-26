import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import RPGManager from '../src/systems/RPGManager.js';
import { applyDamage } from '../src/systems/DamageSystem.js';
import { generateStoreStock } from '../src/systems/storeStock.js';

const equipment = JSON.parse(readFileSync(new URL('../src/assets/config/equipment.json', import.meta.url), 'utf8'));

function createManager(credits = 1000) {
  const manager = Object.create(RPGManager.prototype);
  manager.units = {};
  manager.equipment = equipment;
  manager.state = { credits, inventory: [], units: {} };
  manager.save = () => {};
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  return manager;
}

test('workbook equipment prices are used and Store purchases persist the full charge', () => {
  const manager = createManager(500);
  const costs = {
    lasor_blade: 50,
    chain_gun: 110,
    thermal_lance: 120,
    molotov_cocktail: 75,
    munition_grade_barrage_rifle: 80,
    caustic_k38_rifle: 180,
    ghost_blade: 70,
    auto_targeting_rifle: 300,
    coupler_fibers: 30,
    magwell_spacer: 32,
  };
  Object.entries(costs).forEach(([id, cost]) => assert.equal(manager.getEquipmentCreditCost(id), cost));
  assert.equal(manager.purchaseEquipment('chain_gun'), true);
  assert.equal(manager.state.credits, 390);
  assert.deepEqual(manager.state.inventory, [{ itemId: 'chain_gun', durability: null }]);
  manager.state.credits = 10;
  assert.equal(manager.purchaseEquipment('auto_targeting_rifle'), false);
  assert.equal(manager.getEquipmentCreditCost('lead_pipe'), null);
  assert.equal(manager.purchaseEquipment('lead_pipe'), false);
});

test('Store stock omits makeshift and unpriced equipment, including explicit null prices', () => {
  const stock = generateStoreStock({
    equipment: {
      items: {
        free: { id: 'free', rarity: 'COMMON', cost: null },
        missing: { id: 'missing', rarity: 'COMMON' },
        makeshift: { id: 'makeshift', rarity: 'MAKESHIFT' },
        priced: { id: 'priced', rarity: 'COMMON', cost: 10 },
      },
      augments: {},
    },
    units: {},
    state: { inventory: [] },
    random: () => 0,
  });
  assert.equal(stock.equipment.length, 6);
  assert.equal(stock.equipment.every(id => id === 'priced'), true);
});

test('purchased augments can be installed, affect combat stats, and apply explicit Force costs', () => {
  const manager = createManager();
  manager.units = { UNIT: { id: 'UNIT', cost: 10, baseStats: {
    damage: 100, damageType: 'Physical', range: 0, attackSpeed: 1000,
    projectileSpeed: 0, armorPenetration: 0, attackSpeedModifier: 0,
    criticalChance: 0, criticalModifier: 0, rangedSkill: 0, meleeSkill: 0, reloadSpeed: 0,
  } } };
  manager.state.units.UNIT = {
    id: 'UNIT', rank: 1,
    equipped: { left: 'chain_gun', right: 'chain_gun', utility: null },
    augments: [],
  };
  manager.state.inventory = [{ itemId: 'chain_gun', durability: null }, { itemId: 'coupler_fibers', durability: null }];
  manager.getPathTiers = () => [];
  assert.equal(manager.equipAugment('UNIT', 'coupler_fibers'), true);
  assert.equal(manager.getDeploymentForceCost('UNIT'), 10 + Math.max(110 / 4.2, 8) + 5);
  const stats = manager.getEffectiveStats('UNIT');
  assert.equal(stats.weaponAttacks[0].criticalChance, 0.1);
  assert.equal(manager.unequipAugment('UNIT', 'coupler_fibers'), true);
});

test('weapon-restricted augments affect only matching attacks in a mixed loadout', () => {
  const manager = createManager();
  manager.units = { UNIT: { id: 'UNIT', cost: 10, baseStats: {
    damage: 0, damageType: 'Physical', range: 0, attackSpeed: 1000,
    projectileSpeed: 0, armorPenetration: 0, attackSpeedModifier: 0,
    criticalChance: 0, criticalModifier: 0, rangedSkill: 0, meleeSkill: 0, reloadSpeed: 0,
  } } };
  manager.state.units.UNIT = {
    id: 'UNIT', rank: 1,
    equipped: { left: 'slum_gat', right: 'shiv', utility: null },
    augments: ['kinetic_rail_inserts'],
  };
  manager.state.inventory = [
    { itemId: 'slum_gat', durability: null },
    { itemId: 'shiv', durability: null },
    { itemId: 'kinetic_rail_inserts', durability: null },
  ];
  manager.getPathTiers = () => [];
  const profiles = manager.getEffectiveStats('UNIT').weaponAttacks;
  assert.equal(profiles[0].damage, 15 * 1.05);
  assert.equal(profiles[1].damage, 15);
  assert.equal(profiles[0].armorPenetration, 0.15);
  assert.equal(profiles[1].armorPenetration, 0);
});

test('acid blade and napalm thrower properties reach damage resolution', () => {
  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const makeEnemy = () => ({
      health: 500, maxHealth: 500, armor: 100, data: {}, statusEffects: [],
      takeDamage(amount) { this.health -= amount; },
      applyStatusEffect(effect) { this.statusEffects.push(effect); },
    });
    const acidEnemy = makeEnemy();
    applyDamage(acidEnemy, {
      damage: 100, damageType: 'Acid', criticalChance: 0,
      specialProperties: [{ property: 'doubleAcidEffects' }],
    });
    assert.equal(acidEnemy.armor, 99.99);

    const napalmEnemy = makeEnemy();
    applyDamage(napalmEnemy, {
      damage: 20, damageType: 'Fire', criticalChance: 0,
      specialProperties: [{ property: 'reduceArmor', amount: 5 }],
    });
    assert.equal(napalmEnemy.armor, 95);
  } finally {
    Math.random = previousRandom;
  }
});

test('poison injector and ghost blade use the defined 5% max-health poison over five seconds', () => {
  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const enemy = {
      health: 500, maxHealth: 500, armor: 0, data: {}, statusEffects: [],
      takeDamage(amount) { this.health -= amount; },
      applyStatusEffect(effect) { this.statusEffects.push(effect); },
    };
    applyDamage(enemy, {
      damage: 5, damageType: 'Physical', criticalChance: 0,
      statusEffects: [{ type: 'poison' }],
    });
    const poison = enemy.statusEffects.find(effect => effect.type === 'poison');
    assert.equal(poison.totalDamage, 25);
    assert.equal(poison.duration, 5000);
    assert.equal(poison.interval, 1000);
  } finally {
    Math.random = previousRandom;
  }
});
