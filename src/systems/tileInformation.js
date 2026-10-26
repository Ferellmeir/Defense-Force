import { getBuildingFootprint } from '../utils/buildingFootprint.js';
import { CLEAR_TILE_FORCE_COST, isUnclearableTile } from './tileClearing.js';
import { TILE_EFFECTS } from './tileEffects.js';

const tileKey = ({ x, y }) => `${x},${y}`;

const titleCase = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export function getSpecialTileEffect(type) {
  const effect = TILE_EFFECTS[type];
  if (!effect) return null;
  if (type === 'thermal_enhancement') return `Fire damage over time is increased by ${(effect.fireDamageMultiplier - 1) * 100}%.`;
  if (type === 'snipers_nest') return `Weapon range increases by ${effect.rangeBonusTiles} tile; damage increases ${effect.damageBonusPerTile * 100}% per tile to the target.`;
  if (type === 'toxin_synthesizers') return `Attacks gain a ${effect.poisonChance * 100} percentage point chance to poison.`;
  if (type === 'tactical_indoctrination') return `Attack interval is reduced by ${(1 - effect.attackIntervalMultiplier) * 100}% (×${effect.attackIntervalMultiplier}).`;
  if (type === 'adaptability_network') return `Applicable attack chances gain ${effect.chanceBonus * 100} percentage points.`;
  if (type === 'dark_alley') return `Melee hits gain a ${effect.meleeStunChance * 100} percentage point stun chance; stun lasts ${effect.stunDurationMs / 1000} seconds.`;
  return null;
}

function getBuildingAt(map, position) {
  return (map?.buildings || []).find(building => getBuildingFootprint(building)
    .some(tile => tile.x === position.x && tile.y === position.y));
}

export function getTileInformation(map, position, { occupiedUnitName = null } = {}) {
  const id = tileKey(position);
  const path = (map?.paths || []).find(route => route.some(point => tileKey(point) === id));
  const pathIndices = path ? path.flatMap((point, index) => tileKey(point) === id ? [index] : []) : [];
  const building = getBuildingAt(map, position);
  const specialType = (map?.specialTiles || []).find(tile => tileKey(tile) === id)?.type;
  const terrain = (map?.terrainModifiers || []).find(tile => tileKey(tile) === id);
  const clearable = (map?.blockedClearableTiles || []).some(tile => tileKey(tile) === id);
  const unclearable = isUnclearableTile(map, position);

  let type;
  if (path) type = terrain ? `Enemy path · ${terrain.type === 'incline' ? 'uphill' : terrain.type === 'decline' ? 'downhill' : titleCase(terrain.type)}` : 'Enemy path';
  else if (building) type = `Building · ${building.width} × ${building.height} footprint`;
  else if (specialType) type = `Special tile · ${titleCase(specialType)}`;
  else if (clearable) type = 'Clearable obstacle';
  else if (unclearable) type = 'Unclearable obstacle';
  else type = 'Deployable ground';

  const lines = [];
  lines.push(`Effects: ${getSpecialTileEffect(specialType) || 'No special effects.'}`);
  if (terrain) {
    const multiplier = Number(terrain.speedMultiplier);
    const movement = Number.isFinite(multiplier)
      ? `Enemy movement speed ×${multiplier}`
      : `Enemy movement modifier: ${terrain.type}`;
    lines.push(`Elevation: ${terrain.type === 'incline' ? 'Uphill' : terrain.type === 'decline' ? 'Downhill' : titleCase(terrain.type)}; ${movement}.`);
  }
  if (path) {
    lines.push(pathIndices.length > 1
      ? `Path: ${pathIndices.map(index => `step ${index + 1}`).join(', ')} of ${path.length}; visited ${pathIndices.length} times (crossing tile).`
      : `Path: step ${pathIndices[0] + 1} of ${path.length}.`);
    lines.push('Deployment: Not available on enemy path tiles.');
    lines.push('Clearing: Not available on enemy path tiles.');
  } else if (building) {
    lines.push('Deployment: Not available inside a building footprint.');
    lines.push('Clearing: Not clearable (building footprint).');
  } else if (clearable) {
    lines.push('Deployment: Clear this obstacle before deploying.');
    lines.push(`Clearing: Click to clear; costs ${CLEAR_TILE_FORCE_COST} Force.`);
  } else if (unclearable) {
    lines.push('Deployment: Not available on unclearable terrain.');
    lines.push('Clearing: Not clearable (unclearable terrain).');
  } else if (occupiedUnitName) {
    lines.push(`Deployment: Occupied by ${occupiedUnitName}.`);
    lines.push('Clearing: Not applicable.');
  } else {
    lines.push('Deployment: Available when a roster unit and enough Force are selected.');
  }
  return { type, lines };
}
