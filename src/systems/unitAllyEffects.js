export function activateAdjacentAllyDamageBuff(sourceTower) {
  const property = sourceTower.towerData.specialProperties?.find(item => item.property === 'adjacentAllyDamageOnProc');
  if (!property) return;
  const own = sourceTower.placementTile?.gridPosition;
  if (!own) return;
  const allies = sourceTower.scene.towerManager?.getAll?.().filter(tower => {
    if (tower === sourceTower) return false;
    const position = tower.placementTile?.gridPosition;
    return position && Math.abs(position.x - own.x) + Math.abs(position.y - own.y) <= Number(property.radiusTiles || 1);
  }) || [];
  const now = Number(sourceTower.scene.gameTime || 0);
  allies.slice(0, Number(property.maxAllies || 2)).forEach(tower => {
    tower.allyDamageBuffValue = Number(property.value || 0);
    tower.allyDamageBuffUntil = now + Number(property.duration || 5000);
  });
}
