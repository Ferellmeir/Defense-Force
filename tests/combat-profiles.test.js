import assert from 'node:assert/strict';
import test from 'node:test';
import RPGManager from '../src/systems/RPGManager.js';

test('each equipped one-handed weapon gets its own attack profile and timing', () => {
  // Slum Gat's values are from TD sheet Weapons row 3.
  const slumGat = {
    id: 'slum_gat', type: 'weapon', hands: 1, rarity: 'MAKESHIFT',
    attackType: 'ranged', damage: 15, damageType: 'Physical', range: 3,
    attacksPerSecond: 0.85, criticalChance: 0.05, criticalModifier: 0.5,
    armorPenetration: 0, reloadSpeed: 2,
    ammo: { requiresAmmo: true, magazineCapacity: 6 },
  };
  // Lasor pistol's values are from TD sheet Weapons row 6.
  const lasorPistol = {
    id: 'lasor_pistol', type: 'weapon', hands: 1, rarity: 'COMMON',
    attackType: 'ranged', damage: 25, damageType: 'Energy', range: 3,
    attacksPerSecond: 0.8, criticalChance: 0.05, criticalModifier: 0.5,
    armorPenetration: 0.25, reloadSpeed: 2,
    ammo: { requiresAmmo: true, magazineCapacity: 10 },
  };
  const manager = Object.create(RPGManager.prototype);
  manager.units = {
    unit: {
      id: 'unit', name: 'Test Unit', cost: 9,
      baseStats: {
        damage: 0, damageType: 'Physical', range: 0, attackSpeed: 1000,
        attackSpeedModifier: 0.05, criticalChance: 0, criticalModifier: 0,
        rangedSkill: 0, meleeSkill: 0, reloadSpeed: 0,
      },
      paths: [],
    },
  };
  manager.equipment = {
    rarities: { MAKESHIFT: {}, COMMON: {} },
    items: { slum_gat: slumGat, lasor_pistol: lasorPistol },
    augments: {},
  };
  manager.state = {
    units: {
      unit: { rank: 1, stars: 0, equipped: { left: 'slum_gat', right: 'lasor_pistol', utility: null }, augments: [] },
    },
    inventory: [{ itemId: 'slum_gat' }, { itemId: 'lasor_pistol' }],
  };
  manager.scene = {
    mapManager: { getCurrentMap: () => ({ tileSize: 64 }) },
  };

  const stats = manager.getEffectiveStats('unit');
  assert.equal(stats.weaponAttacks.length, 2);
  assert.deepEqual(stats.weaponAttacks.map(weapon => weapon.damage), [15, 25]);
  assert.deepEqual(stats.weaponAttacks.map(weapon => weapon.range), [192, 192]);
  assert.ok(Math.abs(stats.weaponAttacks[0].attackSpeed - (1000 / 0.85 / 1.05)) < 1e-10);
  assert.ok(Math.abs(stats.weaponAttacks[1].attackSpeed - (1000 / 0.8 / 1.05)) < 1e-10);
  assert.equal(stats.weaponAttacks[1].ammo.magazineCapacity, 10);
  assert.equal(stats.weaponAttacks[1].reloadSpeed, 2);
  assert.equal(stats.weaponAttacks[1].armorPenetration, 0.25);
});

test('a two-handed weapon occupying both hands creates one attack profile', () => {
  const manager = Object.create(RPGManager.prototype);
  manager.units = {
    unit: {
      id: 'unit', name: 'Test Unit', cost: 9,
      baseStats: { damage: 0, attackSpeed: 1000, range: 0 },
      paths: [],
    },
  };
  manager.equipment = {
    rarities: { MAKESHIFT: {} },
    items: {
      pipe: {
        id: 'pipe', type: 'weapon', hands: 2, rarity: 'MAKESHIFT',
        attackType: 'melee', damage: 35, range: 1, attacksPerSecond: 1,
        ammo: { requiresAmmo: false, unlimited: true },
      },
    },
    augments: {},
  };
  manager.state = {
    units: { unit: { rank: 1, equipped: { left: 'pipe', right: 'pipe', utility: null }, augments: [] } },
    inventory: [{ itemId: 'pipe' }],
  };
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  assert.equal(manager.getEffectiveStats('unit').weaponAttacks.length, 1);
});

test('unit weapon passives and path modifiers change effective deployed weapon damage', () => {
  const manager = Object.create(RPGManager.prototype);
  const weapon = {
    id: 'sidearm', type: 'weapon', hands: 1, rarity: 'COMMON',
    attackType: 'ranged', damage: 20, damageType: 'Physical', range: 2,
    attacksPerSecond: 1, specialProperties: [],
    ammo: { requiresAmmo: false, unlimited: true },
  };
  manager.units = {
    unit: {
      id: 'unit', cost: 10,
      baseStats: { damage: 0, range: 0, attackSpeed: 1000, attackSpeedModifier: 0,
        criticalChance: 0, criticalModifier: 0, rangedSkill: 0, meleeSkill: 0, reloadSpeed: 0 },
      passive: { type: 'special', property: 'oneHandedDamage', value: 0.15 },
      pathTiers: [{ tier: 1, paths: [{ id: 'damage', effect: { type: 'stat', stat: 'damage', mode: 'percent', value: 0.05 } }] }],
    },
  };
  manager.equipment = { rarities: { COMMON: {} }, items: { sidearm: weapon }, augments: {} };
  manager.state = {
    units: { unit: { rank: 1, equipped: { left: 'sidearm', right: null, utility: null }, augments: [] } },
    inventory: [{ itemId: 'sidearm' }],
  };
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  const stats = manager.getEffectiveStats('unit', { pathProgress: { damage: 1 } });
  assert.ok(Math.abs(stats.weaponAttacks[0].damage - (20 * 1.05 * 1.15)) < 1e-10);
});
