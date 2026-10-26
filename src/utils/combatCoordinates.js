export function getEnemyEffectPosition(scene, enemy) {
  return scene.projectWorldPoint?.(enemy.x, enemy.y) || { x: enemy.x, y: enemy.y };
}
