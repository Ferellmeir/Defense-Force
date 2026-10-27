export function getNextDynamicMapIndex(mission, mapIndex) {
  if (mission?.missionType !== 'DYNAMIC_ENGAGEMENT' || !Array.isArray(mission.mapKeys)) return null;
  const index = Number(mapIndex);
  return Number.isInteger(index) && index >= 0 && index < mission.mapKeys.length - 1 ? index + 1 : null;
}

export function advanceDynamicMissionMap({ mission, mapIndex, registry, stopUIScene, restartGameScene }) {
  const nextIndex = getNextDynamicMapIndex(mission, mapIndex);
  if (nextIndex === null || !registry?.set) return false;
  registry.set('missionMapIndex', nextIndex);
  registry.set('selectedMap', mission.mapKeys[nextIndex]);
  registry.set('missionSeed', mission.mapSeeds?.[nextIndex]);
  registry.set('missionRestriction', mission.restrictionsByMap?.[nextIndex] || []);
  registry.set('selectedUnit', null);
  stopUIScene?.();
  restartGameScene?.();
  return nextIndex;
}

export function clearMissionLocalState({
  waveManager,
  towerManager,
  enemyManager,
  projectileManager,
  economyManager,
  registry,
}) {
  waveManager?.cleanup();
  towerManager?.clear();
  enemyManager?.clear();
  projectileManager?.clear();
  economyManager?.clearMissionForce();
  registry.set('missionRoster', []);
  registry.set('selectedUnit', null);
  registry.set('missionRunId', null);
  registry.set('missionSeed', null);
  registry.set('missionFaction', null);
  registry.set('missionEnvironmentKey', null);
  registry.set('selectedMission', null);
  registry.set('missionMapIndex', 0);
  registry.set('missionRestriction', []);
  registry.set('missionRewardMultiplier', 1);
  registry.set('missionSpecialTilePoints', null);
}

export function transitionToMap({ isGameOver, isReturning, setReturning, stopAudio, stopUIScene, startMap }) {
  if (!isGameOver || isReturning) return false;
  setReturning();
  stopAudio();
  stopUIScene();
  startMap();
  return true;
}
