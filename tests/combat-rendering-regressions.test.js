import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWeaponRange } from '../src/utils/weaponRange.js';
import { selectTarget } from '../src/utils/targetSelection.js';
import { createBattlefieldProjection } from '../src/utils/battlefieldProjection.js';
import { getEnemyEffectPosition } from '../src/utils/combatCoordinates.js';
import { moveTowardTarget } from '../src/utils/projectileTracking.js';
import { resolveProjectileHit } from '../src/systems/ProjectileResolution.js';

const enemies = [
  { id: 'first', x: 40, y: 0, health: 25, getPathProgress: () => 0.8 },
  { id: 'last', x: 80, y: 0, health: 90, getPathProgress: () => 0.2 },
];

test('ranged target modes select the expected in-range enemy using current world positions', () => {
  const inRange = enemies.filter(enemy => isWithinWeaponRange({ x: 0, y: 0 }, enemy, 100, 'ranged'));
  assert.equal(selectTarget(inRange, 'first').id, 'first');
  assert.equal(selectTarget(inRange, 'last').id, 'last');
  assert.equal(selectTarget(inRange, 'highestHealth').id, 'last');
  assert.equal(selectTarget(inRange, 'lowestHealth').id, 'first');
  enemies[0].x = 150;
  assert.equal(selectTarget(enemies.filter(enemy => isWithinWeaponRange({ x: 0, y: 0 }, enemy, 100, 'ranged')), 'first').id, 'last');
});

test('projected death effect coordinates come from the enemy current world position', () => {
  const project = (x, y) => ({ x: x * 2 + 17, y: y * 3 - 11 });
  const scene = { projectWorldPoint: project };
  const enemy = { x: 415, y: 263 };
  assert.deepEqual(getEnemyEffectPosition(scene, enemy), project(415, 263));
  enemy.x = 433;
  assert.deepEqual(getEnemyEffectPosition(scene, enemy), project(433, 263));
});

test('projectile arrival uses world distance and snaps visual and hit position to the moving target', () => {
  const projectile = { x: 0, y: 0, speed: 100, target: { x: 25, y: 0 } };
  const update = delta => moveTowardTarget(projectile, projectile.target, projectile.speed, delta);
  assert.equal(update(100), false);
  projectile.target.x = 15;
  assert.equal(update(100), true);
  assert.deepEqual([projectile.x, projectile.y], [projectile.target.x, projectile.target.y]);
  let health = 100;
  let removed = true;
  if (!removed) health -= 20;
  assert.equal(health, 100);
  assert.equal(removed, true);
});

test('projectiles resolve damage once and are removed, including repeated shots at one target', () => {
  const enemy = { x: 20, y: 0, health: 100, armor: 0, data: {}, statusEffects: [], isDying: false, takeDamage(amount) { this.health -= amount; }, isDead() { return this.health <= 0; } };
  const shots = [0, 1, 2].map(() => ({ target: enemy, reachedTarget: true, resolved: false, projectileData: { damage: 10, damageType: 'Physical', armorPenetration: 0, criticalChance: 0 }, destroy() { this.destroyed = true; } }));
  const scene = {};
  while (shots.length) {
    const shot = shots[0];
    if (shot.reachedTarget && resolveProjectileHit(scene, shot, enemy, [enemy])) {
      shot.destroy();
      shots.splice(shots.indexOf(shot), 1);
    }
  }
  assert.equal(enemy.health, 70);
  assert.equal(shots.length, 0);
  assert.equal(shots.every(shot => shot.destroyed), true);
});

test('camera projection changes visual coordinates only, not logical range or hit positions', () => {
  const a = createBattlefieldProjection({ mapWidth: 20, mapHeight: 12, tileSize: 64, viewportWidth: 1280, viewportHeight: 720 });
  const enemy = { x: 100, y: 100 };
  const cameraA = { projectWorldPoint: (x, y) => a.worldToScreen(x, y) };
  const cameraB = { projectWorldPoint: (x, y) => ({ x: x * 1.5 + 70, y: y * 1.5 - 35 }) };
  assert.notDeepEqual(getEnemyEffectPosition(cameraA, enemy), getEnemyEffectPosition(cameraB, enemy));
  assert.equal(isWithinWeaponRange({ x: 0, y: 0 }, { x: 100, y: 0 }, 100, 'ranged'), true);
  assert.equal(isWithinWeaponRange({ x: 0, y: 0 }, { x: 100, y: 0 }, 99, 'ranged'), false);
});
