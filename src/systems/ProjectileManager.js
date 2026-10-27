export default class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.projectileGroup = this.scene.add.group();
  }

  update(time, delta) {
    this.projectileGroup.getChildren().forEach(projectile => {
      projectile.update(time, delta);
      if (projectile.isOutOfBounds()) {
        projectile.destroy();
        this.projectileGroup.remove(projectile, true, true);
      }
    });
  }

  addProjectile(projectile) {
    this.projectileGroup.add(projectile);
  }

  removeProjectile(projectile) {
    this.projectileGroup.remove(projectile, true, true);
  }

  getAll() {
    return this.projectileGroup.getChildren();
  }

  clear() {
    const group = this.projectileGroup;
    if (!group || !group.scene || !group.children || typeof group.children.size !== 'number') {
      this.projectileGroup = null;
      return false;
    }

    group.clear(true, true);
    return true;
  }
}
