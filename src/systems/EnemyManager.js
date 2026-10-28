export default class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemyGroup = this.scene.add.group();
  }

  update(time, delta) {
    this.enemyGroup.getChildren().forEach(enemy => {
      enemy.update(time, delta);
      if (enemy.hasReachedEnd()) {
        const toughnessDamage = String(enemy.type).toLowerCase() === 'boss' ? 999 : Math.max(1, Number(enemy.data?.countsAs) || 1);
        this.scene.economyManager.registerEscape(toughnessDamage);
        enemy.destroy();
        this.enemyGroup.remove(enemy, true, true);
        this.scene.events.emit('updateUI', {
          lives: this.scene.economyManager.getLives(),
          escapes: this.scene.economyManager.getEscapes(),
        });
        if (this.scene.economyManager.getLives() <= 0) {
          this.scene.gameOver(false);
        }
      }
    });
  }

  addEnemy(enemy) {
    this.enemyGroup.add(enemy);
  }

  removeEnemy(enemy) {
    this.enemyGroup.remove(enemy, true, true);
  }

  getAll() {
    return this.enemyGroup.getChildren();
  }

  clear() {
    const group = this.enemyGroup;
    if (!group || !group.scene || !group.children || typeof group.children.size !== 'number') {
      this.enemyGroup = null;
      return false;
    }

    group.clear(true, true);
    return true;
  }
}
