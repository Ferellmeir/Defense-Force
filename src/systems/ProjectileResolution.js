import { applyDamage } from './DamageSystem.js';
import { spawnProjectileExplosionEffect, spawnProjectileHitEffect } from './ProjectileEffectBridge.js';

export function resolveProjectileHit(scene, projectile, enemy, enemies) {
  if (!projectile || projectile.resolved || !enemy || enemy.isDying) return false;
  if (enemy.data.flying && !projectile.projectileData.canHitFlying) return false;
  projectile.resolved = true;
  if (scene.effectSpawner) {
    spawnProjectileHitEffect(scene.effectSpawner, enemy.x, enemy.y, projectile.projectileData);
  }
  applyDamage(enemy, projectile.projectileData);
  if (projectile.projectileData.aoeRadius > 0) {
    const multiplier = Number(projectile.projectileData.aoeDamageMultiplier ?? 1);
    enemies.forEach(other => {
      if (other === enemy || other.isDying) return;
      if (Math.hypot(enemy.x - other.x, enemy.y - other.y) <= projectile.projectileData.aoeRadius) {
        applyDamage(other, { ...projectile.projectileData, damage: projectile.projectileData.damage * multiplier });
      }
    });
  }
  scene.audioManager?.playSound('attack');
  if (enemy.isDead?.()) {
    if (scene.effectSpawner) spawnProjectileExplosionEffect(scene.effectSpawner, enemy.x, enemy.y, 32, projectile.projectileData);
    scene.audioManager?.playSound('enemy_death');
  }
  return true;
}
