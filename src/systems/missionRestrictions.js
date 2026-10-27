import { factionDataName } from '../utils/factions.js';

export function getCurrentMissionRestrictions(registry) {
  if (!registry?.get) return [];
  const mission = registry.get('selectedMission');
  if (!mission) return [];
  if (mission.missionType !== 'DYNAMIC_ENGAGEMENT') return mission.restrictions || [];
  const index = Math.max(0, Number(registry.get('missionMapIndex')) || 0);
  return mission.restrictionsByMap?.[index] || [];
}

function getDeploymentItems(deployment, rpgManager) {
  const equipped = deployment?.equipped || rpgManager.getOwnedUnit(deployment?.unitId)?.equipped || {};
  const equipment = ['left', 'right', 'utility'].map(slot => rpgManager.getItemDefinition(equipped[slot]));
  const owned = rpgManager.getOwnedUnit(deployment?.unitId);
  const augmentIds = deployment?.augments || owned?.augments || [];
  return [...equipment, ...augmentIds.map(id => rpgManager.getItemDefinition(id))].filter(Boolean);
}

export function getDeploymentRestrictionFailure(deployment, restrictions = [], rpgManager) {
  if (!deployment || !rpgManager) return 'Invalid deployment.';
  const unit = rpgManager.getUnitDefinition(deployment.unitId);
  if (!unit) return 'Unknown unit.';
  const items = getDeploymentItems(deployment, rpgManager);
  for (const restriction of restrictions) {
    if (restriction.kind === 'weaponType' && items.some(item => item.type === 'weapon' && item.attackType === restriction.attackType)) return restriction.label;
    if (restriction.kind === 'damageType' && items.some(item => String(item.damageType).toLowerCase() === String(restriction.damageType).toLowerCase())) return restriction.label;
    if (restriction.kind === 'aoe' && items.some(item => (item.specialProperties || []).some(property => property.type === 'aoe' || property.property === 'aoe'))) return restriction.label;
    if (restriction.kind === 'faction') {
      const faction = factionDataName(restriction.faction);
      if (factionDataName(unit.faction) === faction || items.some(item => item.faction && factionDataName(item.faction) === faction)) return restriction.label;
    }
  }
  return null;
}

export function getMissionRestrictionFailure(deployments, mission, rpgManager) {
  const restrictions = mission?.missionType === 'DYNAMIC_ENGAGEMENT' ? [] : mission?.restrictions || [];
  for (const deployment of deployments || []) {
    const failure = getDeploymentRestrictionFailure(deployment, restrictions, rpgManager);
    if (failure) return `${rpgManager.getUnitDefinition(deployment.unitId)?.name || deployment.unitId}: ${failure}.`;
  }
  const cap = restrictions.find(restriction => restriction.kind === 'costCap' && Number.isFinite(restriction.maxCost))?.maxCost;
  if (Number.isFinite(cap)) {
    const total = rpgManager.getMissionCostBreakdown(deployments).total;
    if (!Number.isFinite(total) || total >= cap) return `Mission launch cost must be under ${cap} Cr.`;
  }
  return null;
}

export function isDebuffBanned(type, restrictions = []) {
  return String(type || '').toLowerCase() !== 'fire'
    && restrictions.some(restriction => restriction.kind === 'debuff'
      && String(restriction.debuff).toLowerCase() === String(type || '').toLowerCase());
}
