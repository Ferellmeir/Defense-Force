import { resolveProjectileHit } from './ProjectileResolution.js';

export default class CollisionManager {
  constructor(scene) {
    this.scene = scene;
  }

  checkCollisions() {
    // Use manager accessors to get arrays
    const projectiles = this.scene.projectileManager.getAll();
    const enemies = this.scene.enemyManager.getAll();
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      const enemy = projectile.target;
      if (projectile.reachedTarget && !projectile.resolved && enemies.includes(enemy)
        && !enemy.isDying && !(enemy.data.flying && !projectile.projectileData.canHitFlying)) {
        resolveProjectileHit(this.scene, projectile, enemy, enemies);
      }
      if (projectile.invalidTarget || projectile.resolved || projectile.isOutOfBounds()) {
        projectile.destroy();
        this.scene.projectileManager.removeProjectile(projectile);
      }
    }
  }
}
