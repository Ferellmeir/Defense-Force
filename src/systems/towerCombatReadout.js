import { TILE_EFFECTS } from './tileEffects.js';

export function getEffectiveAttackInterval(tower, state, time = tower.scene?.gameTime ?? tower.scene?.time?.now ?? 0) {
  const boost = tower.towerData.specialProperties?.find(property => property.property === 'waveStartAttackSpeedBoost');
  const speedMultiplier = boost && time < (tower.stimpackActiveUntil || 0)
    ? 1 + Number(boost.value || 0) : 1;
  const critBoost = tower.towerData.specialProperties?.find(property => property.property === 'critDamageBoost');
  const critSpeedMultiplier = critBoost && time < (tower.critDamageBoostUntil || 0)
    ? 1 + Number(critBoost.attackSpeedPenalty || 0) : 1;
  const exposedHitBoost = tower.towerData.specialProperties?.find(property => property.property === 'exposedHitAttackSpeedBoost');
  const exposedHitMultiplier = exposedHitBoost && time < (tower.exposedHitAttackSpeedUntil || 0)
    ? 1 + Number(exposedHitBoost.value || 0) : 1;
  const tileType = tower.placementTile?.specialType;
  return Number(state.profile.attackSpeed ?? state.profile.fireRate ?? 1000)
    / speedMultiplier / Math.max(0.01, critSpeedMultiplier) / exposedHitMultiplier
    * (tileType === 'tactical_indoctrination' ? TILE_EFFECTS.tactical_indoctrination.attackIntervalMultiplier : 1);
}

export function getEffectiveAttackRange(tower, state) {
  return Number(state.profile.range || 0) + (tower.placementTile?.specialType === 'snipers_nest'
    ? TILE_EFFECTS.snipers_nest.rangeBonusTiles * (tower.scene.mapManager?.getCurrentMap?.()?.tileSize || 64) : 0);
}
