import { isUnclearableTile } from './tileClearing.js';

export default class TowerManager {
  constructor(scene, TowerClass) {
    this.scene = scene;
    this.TowerClass = TowerClass;
    this.towerGroup = this.scene.add.group();
  }

  update(time, delta, enemies) {
    this.towerGroup.getChildren().forEach(tower => {
      tower.update(time, delta, enemies);
    });
  }

  addTower(tower) {
    this.towerGroup.add(tower);
  }

  createTower(unitId, tile, towerData, deploymentCost) {
    const tileSize = this.scene.mapManager.getCurrentMap().tileSize;
    const gridPosition = tile.gridPosition;
    return new this.TowerClass(
      this.scene,
      (gridPosition.x + 0.5) * tileSize,
      (gridPosition.y + 0.5) * tileSize,
      unitId.toLowerCase(),
      {
        ...towerData,
        unitId,
        level: 0,
        veterancy: 0,
        experience: 0,
        xp: 0,
        selectedPaths: {},
        pathProgress: {},
        pathTierSelection: {},
        visualLevel: 1,
        tileModifier: tile.specialType,
        cost: deploymentCost,
        placementTile: tile,
      }
    );
  }

  deployUnit(unitId, tile) {
    const { rpgManager, economyManager, registry } = this.scene;
    const definition = rpgManager.getUnitDefinition(unitId);
    const missionRoster = registry.get('missionRoster') || [];
    const selectedId = registry.get('selectedUnit');
    const deployment = missionRoster.find(entry => typeof entry === 'string'
      ? entry === unitId && (!selectedId || selectedId === unitId)
      : entry.deploymentId === selectedId && entry.unitId === unitId);
    const deploymentCost = rpgManager.getDeploymentForceCost(unitId, deployment);
    const position = tile?.gridPosition;
    const map = this.scene.mapManager.getCurrentMap();
    const isPathTile = position && this.scene.pathTileKeys?.has(`${position.x},${position.y}`);
    if (!tile || tile.hasTower || !definition || !rpgManager.getOwnedUnit(unitId)
      || !deployment || !Number.isFinite(deploymentCost)
      || deploymentCost < 0 || economyManager.getForce() < deploymentCost || isPathTile
      || isUnclearableTile(map, position)) return false;

    const progression = rpgManager.createDeploymentProgression(unitId, {
      equipped: deployment.equipped,
      equipment: deployment.equipment,
      augments: deployment.augments,
    });
    const towerData = rpgManager.getEffectiveStats(unitId, progression);
    if (!towerData) return false;

    const tower = this.createTower(unitId, tile, towerData, deploymentCost);
    if (!economyManager.spendForce(deploymentCost)) {
      tower.destroy();
      return false;
    }

    this.addTower(tower);
    tile.hasTower = true;
    tile.setAlpha(0.1);
    return true;
  }

  removeTower(tower) {
    this.towerGroup.remove(tower, true, true);
  }

  getAll() {
    return this.towerGroup.getChildren();
  }

  clear() {
    console.log('[TowerManager.clear] called. this.towerGroup:', this.towerGroup);
    this.towerGroup.clear(true, true);
  }
}
