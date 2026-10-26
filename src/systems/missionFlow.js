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
}

export function transitionToMap({ isGameOver, isReturning, setReturning, stopAudio, stopUIScene, startMap }) {
  if (!isGameOver || isReturning) return false;
  setReturning();
  stopAudio();
  stopUIScene();
  startMap();
  return true;
}
