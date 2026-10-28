import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import RPGManager from '../src/systems/RPGManager.js';
import { applyDamage } from '../src/systems/DamageSystem.js';
import { getDualWieldDamageMultiplier } from '../src/systems/UnitCombatBonuses.js';
import { generateFactionStoreStock } from '../src/systems/storeStock.js';
import { activateAdjacentAllyDamageBuff } from '../src/systems/unitAllyEffects.js';
import { applyEnemyStatusEffect } from '../src/systems/EnemyStatusEffects.js';

const units = JSON.parse(fs.readFileSync(new URL('../src/assets/config/units.json', import.meta.url), 'utf8'));
const equipment = JSON.parse(fs.readFileSync(new URL('../src/assets/config/equipment.json', import.meta.url), 'utf8'));
const infiltratorPng = fs.readFileSync(new URL('../public/assets/Infiltrator.png', import.meta.url));

function managerFor(unitId, equipped = { left: 'slum_gat', right: null, utility: null }) {
  const manager = Object.create(RPGManager.prototype);
  manager.units = units;
  manager.equipment = equipment;
  manager.state = { units: { [unitId]: { id: unitId, stars: 0, equipped, augments: [] } }, inventory: [] };
  manager.scene = { mapManager: { getCurrentMap: () => ({ tileSize: 64 }) } };
  return manager;
}

function enemy() {
  return {
    health: 100, maxHealth: 100, armor: 0, statusEffects: [], data: { vulnerabilities: {} },
    takeDamage(amount) { this.health -= amount; },
    applyStatusEffect(effect) { this.statusEffects.push(effect); },
    applySlowEffect(value, duration) { this.applyStatusEffect({ type: 'slow', value, duration }); },
  };
}

test('Infiltrator matches the workbook and is stocked by the Laisung faction store', () => {
  const definition = units.INFILTRATOR;
  assert.equal(definition.cost, 28);
  assert.equal(definition.faction, 'Laisung Collective');
  assert.equal(definition.asset, 'Infiltrator');
  assert.deepEqual(definition.weaponRestrictions, ['heavy', 'explosion']);
  assert.deepEqual(definition.pathTiers.map(tier => tier.paths.length), [3, 3, 2]);
  assert.equal(definition.pathTiers[0].paths.find(path => path.id === 'poison_on_hit').effect.value, 0.05);
  assert.equal(definition.pathTiers[1].paths.find(path => path.id === 'dual_wield_damage').effect.value, 0.075);
  assert.equal(definition.passive.property, 'exposedHitAttackSpeedBoost');
  assert.deepEqual([...infiltratorPng.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const stock = generateFactionStoreStock({ faction: 'Laisung Collective', influence: 50, units, equipment, random: () => 0.25 });
  assert.ok(stock.units.includes('INFILTRATOR'));
  const manager = managerFor('INFILTRATOR');
  assert.equal(manager.isWeaponAllowed('INFILTRATOR', equipment.items.lead_pipe), true);
  assert.equal(manager.isWeaponAllowed('INFILTRATOR', equipment.items.slum_gat), false);
});

test('all unit combat stats and configured progressions match their workbook unit rows', () => {
  const sheetStats = {
    GUTTER_THUGS: [-0.05, 0, 0, 0, 0, -0.05],
    ANARCHO_SABOTEURS: [0, 0.1, 0, 0.15, -0.1, 0],
    SYNDICATE_FIXER: [-0.35, 0.15, 1, 0.2, -0.05, 0.25],
    BELTER_PIRATE: [0.05, 0.05, 0.25, 0, 0, 0],
    PALLID_ORDER_BLADE: [0.1, 0.15, 0.75, -0.35, 0.15, -0.25],
    ASHIGARU: [0, 0.05, 0.15, 0.1, 0, 0],
    INFILTRATOR: [0.05, 0, 1, 0.05, -0.15, 0.05],
    SHINOBI: [0.25, 0.1, 0.5, -0.05, 0.05, -0.1],
    SIEGE_FRAME: [0, 0.1, 0.75, 0.1, 0, 0.3],
  };
  for (const [unitId, expected] of Object.entries(sheetStats)) {
    const stats = units[unitId].baseStats;
    assert.deepEqual([
      stats.attackSpeedModifier, stats.criticalChance, stats.criticalModifier,
      stats.rangedSkill, stats.meleeSkill, stats.reloadSpeed,
    ], expected, `${unitId} combat stats`);
  }
  for (const [unitId, expected] of Object.entries({
    GUTTER_THUGS: [3, 3, 2], ANARCHO_SABOTEURS: [3, 3, 2], SYNDICATE_FIXER: [3, 3, 2],
    BELTER_PIRATE: [3, 3, 2], PALLID_ORDER_BLADE: [3, 3, 2], ASHIGARU: [3, 3, 2],
    INFILTRATOR: [3, 3, 2], SHINOBI: [3, 3, 2], SIEGE_FRAME: [3, 3, 2],
  })) assert.deepEqual(units[unitId].pathTiers.map(tier => tier.paths.length), expected, `${unitId} paths`);

  assert.equal(units.ASHIGARU.passive.criticalChanceBonus, 0.1);
  assert.equal(units.PALLID_ORDER_BLADE.weaponRestrictions[0], 'firearms');
  assert.deepEqual(units.GUTTER_THUGS.weaponRestrictions, ['heavy']);
  assert.deepEqual(units.SYNDICATE_FIXER.weaponRestrictions, ['heavy']);
  for (const unitId of ['ASHIGARU', 'INFILTRATOR', 'SHINOBI', 'SIEGE_FRAME']) {
    assert.equal(units[unitId].pathTiers[0].paths[2].effect.property, 'adjacentAllyDamageOnProc');
  }
});

test('Pallid Order Blade can only equip firearm-compatible weapons and recruits with a compatible starter', () => {
  const manager = managerFor('PALLID_ORDER_BLADE', { left: 'lead_pipe', right: 'lead_pipe', utility: null });
  assert.equal(manager.isWeaponAllowed('PALLID_ORDER_BLADE', equipment.items.lead_pipe), false);
  assert.equal(manager.isWeaponAllowed('PALLID_ORDER_BLADE', equipment.items.slum_gat), true);
  manager.state.units = {};
  manager.save = () => {};
  assert.equal(manager.addUnitCopy('PALLID_ORDER_BLADE'), true);
  assert.deepEqual(manager.getOwnedUnit('PALLID_ORDER_BLADE').equipped, { left: 'slum_gat', right: 'slum_gat', utility: null });
});

test('Infiltrator poison and vulnerable paths apply their configured hit effects', () => {
  const target = enemy();
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    applyDamage(target, { damage: 1, attackType: 'ranged', primaryTarget: target, specialProperties: [
      units.INFILTRATOR.pathTiers[0].paths.find(path => path.id === 'poison_on_hit').effect,
      units.INFILTRATOR.pathTiers[1].paths.find(path => path.id === 'dual_wield_damage').maxBonus,
    ] });
  } finally { Math.random = originalRandom; }
  assert.ok(target.statusEffects.some(effect => effect.type === 'poison' && effect.totalDamage === 5));
  assert.ok(target.statusEffects.some(effect => effect.type === 'vulnerable' && effect.damageTakenMultiplier === 0.25));
});

test('Infiltrator conditional passive grants attack speed only after a hit on an exposed target', () => {
  const sourceTower = { scene: { gameTime: 200 } };
  const target = enemy();
  target.statusEffects.push({ type: 'exposed', damageTakenMultiplier: 0.1, duration: 5000 });
  applyDamage(target, { damage: 1, attackType: 'ranged', sourceTower,
    specialProperties: [units.INFILTRATOR.passive] });
  assert.equal(sourceTower.exposedHitAttackSpeedUntil, 5200);
});

test('Infiltrator dual wield bonus requires two one-handed weapons', () => {
  const property = units.INFILTRATOR.pathTiers[1].paths.find(path => path.id === 'dual_wield_damage').effect;
  assert.equal(getDualWieldDamageMultiplier([property], [{ hands: 1 }, { hands: 1 }]), 1.075);
  assert.equal(getDualWieldDamageMultiplier([property], [{ hands: 2 }]), 1);
});

test('adjacent on-hit buffs affect at most two orthogonal allies and refresh without stacking', () => {
  const property = units.INFILTRATOR.pathTiers[0].paths.find(path => path.id === 'adjacent_ally_damage').effect;
  const origin = { placementTile: { gridPosition: { x: 2, y: 2 } } };
  origin.towerData = { specialProperties: [property] };
  const allies = Array.from({ length: 4 }, (_, index) => ({
    placementTile: { gridPosition: [{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 3 }][index] },
  }));
  origin.scene = { gameTime: 100, towerManager: { getAll: () => [origin, ...allies] } };
  activateAdjacentAllyDamageBuff(origin);
  assert.deepEqual(allies.map(tower => tower.allyDamageBuffUntil), [5100, 5100, undefined, undefined]);
  assert.deepEqual(allies.map(tower => tower.allyDamageBuffValue), [0.05, 0.05, undefined, undefined]);
});

test('Siege Frame inherent attack path doubles its configured attack damage', () => {
  const manager = managerFor('SIEGE_FRAME', { left: 'lead_pipe', right: 'lead_pipe', utility: null });
  const withoutPath = manager.getEffectiveStats('SIEGE_FRAME');
  const withPath = manager.getEffectiveStats('SIEGE_FRAME', { pathProgress: { inherent_attack_damage: 1 } });
  const getInherent = stats => stats.weaponAttacks.find(profile => String(profile.weaponId).startsWith('inherent-'));
  assert.equal(getInherent(withoutPath).damage, 80);
  assert.equal(getInherent(withPath).damage, 160);
});

test('Pallid poison passive and Gutter Thug T3 match their configured definitions', () => {
  assert.equal(units.PALLID_ORDER_BLADE.passive.property, 'doublePoisonEffects');
  assert.equal(units.PALLID_ORDER_BLADE.passive.unimplemented, undefined);
  const pallidProfile = managerFor('PALLID_ORDER_BLADE').getEffectiveStats('PALLID_ORDER_BLADE').weaponAttacks[0];
  assert.ok(pallidProfile.specialProperties.some(property => property.property === 'doublePoisonEffects'));
  const weakened = units.GUTTER_THUGS.pathTiers[2].paths[0];
  assert.deepEqual(weakened.maxBonus, { type: 'special', property: 'weakenedChance', value: 0.25 });
});

test('Gutter Thug T3 applies source-defined Weakened and refreshes without stacking', () => {
  const manager = managerFor('GUTTER_THUGS');
  const profile = manager.getEffectiveStats('GUTTER_THUGS', { pathProgress: { armor_ignore: 3 } }).weaponAttacks[0];
  const proc = profile.specialProperties.find(property => property.property === 'weakenedChance');
  assert.equal(proc.value, 0.25);
  const target = enemy();
  target.scene = { gameTime: 0 };
  target.applyStatusEffect = function apply(effect) {
    return applyEnemyStatusEffect(this, effect, this.scene.gameTime);
  };
  const originalRandom = Math.random;
  Math.random = () => 0.24;
  try {
    applyDamage(target, { damage: 1, specialProperties: [proc] });
    const weakened = target.statusEffects.find(effect => effect.type === 'weakened');
    assert.equal(weakened.damageTakenMultiplier, 0.15);
    assert.equal(weakened.duration, 5000);
    assert.equal(weakened.endTime, 5000);
    target.scene.gameTime = 2000;
    applyDamage(target, { damage: 1, specialProperties: [proc] });
    assert.equal(target.statusEffects.filter(effect => effect.type === 'weakened').length, 1);
    assert.equal(weakened.endTime, 7000);
    const boundaryTarget = enemy();
    Math.random = () => 0.25;
    applyDamage(boundaryTarget, { damage: 1, specialProperties: [proc] });
    assert.equal(boundaryTarget.statusEffects.some(effect => effect.type === 'weakened'), false);
  } finally { Math.random = originalRandom; }
});
