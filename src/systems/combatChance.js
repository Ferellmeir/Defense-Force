import { TILE_EFFECTS } from './tileEffects.js';

export function withTileChanceBonus(chance, unitOrAttack = {}) {
  const specialType = unitOrAttack.specialTileType || unitOrAttack.placementTile?.specialType;
  const value = Number(chance) || 0;
  const factionBonus = (unitOrAttack.specialProperties || unitOrAttack.towerData?.specialProperties || [])
    .filter(property => property.property === 'factionChanceBonus')
    .reduce((total, property) => total + Number(property.value || 0), 0);
  return Math.min(1, Math.max(0, value + factionBonus + (specialType === 'adaptability_network'
    ? TILE_EFFECTS.adaptability_network.chanceBonus : 0)));
}
