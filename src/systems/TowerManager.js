import { isUnclearableTile } from './tileClearing.js';
import { getCurrentMissionRestrictions, getDeploymentRestrictionFailure } from './missionRestrictions.js';

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

  getDeploymentFailure(unitId, tile) {
    const { rpgManager, economyManager, registry } = this.scene;
    if (!tile?.gridPosition) return 'Select a valid battlefield tile.';
    if (tile.hasTower) return 'A unit is already deployed on this tile.';
    const definition = rpgManager.getUnitDefinition(unitId);
    if (!definition) return 'Select an available unit from the mission roster.';
    if (!rpgManager.getOwnedUnit(unitId)) return 'This unit is no longer in your roster.';

    const missionRoster = registry.get('missionRoster') || [];
    const selectedId = registry.get('selectedUnit');
    const deployment = missionRoster.find(entry => typeof entry === 'string'
      ? entry === unitId && (!selectedId || selectedId === unitId)
      : entry.deploymentId === selectedId && entry.unitId === unitId);
    if (!deployment) return 'Select a unit from the mission roster first.';

    const deploymentCost = rpgManager.getDeploymentForceCost(unitId, deployment);
    if (!Number.isFinite(deploymentCost) || deploymentCost < 0) return 'Unable to calculate this unit’s deployment cost.';

    const position = tile.gridPosition;
    const map = this.scene.mapManager.getCurrentMap();
    if (this.scene.pathTileKeys?.has(`${position.x},${position.y}`)) return 'Units cannot be placed on enemy paths.';
    if (isUnclearableTile(map, position)) return 'Units cannot be placed on reserved terrain.';

    const restrictionDeployment = typeof deployment === 'string'
      ? { unitId: deployment, equipped: rpgManager.getOwnedUnit(deployment)?.equipped, augments: rpgManager.getOwnedUnit(deployment)?.augments }
      : deployment;
    const restrictionFailure = getDeploymentRestrictionFailure(restrictionDeployment, getCurrentMissionRestrictions(registry), rpgManager);
    if (restrictionFailure) return restrictionFailure;
    if (economyManager.getForce() < deploymentCost) return `Not enough Force. ${deploymentCost} Force required.`;
    return null;
  }

  deployUnit(unitId, tile) {
    const { rpgManager, economyManager, registry } = this.scene;
    const failure = this.getDeploymentFailure(unitId, tile);
    if (failure) {
      this.scene.events.emit('showMessage', failure, 2200);
      return false;
    }
    const missionRoster = registry.get('missionRoster') || [];
    const selectedId = registry.get('selectedUnit');
    const deployment = missionRoster.find(entry => typeof entry === 'string'
      ? entry === unitId && (!selectedId || selectedId === unitId)
      : entry.deploymentId === selectedId && entry.unitId === unitId);
    const deploymentCost = rpgManager.getDeploymentForceCost(unitId, deployment);
    const progression = rpgManager.createDeploymentProgression(unitId, {
      equipped: deployment.equipped,
      equipment: deployment.equipment,
      augments: deployment.augments,
    });
    const towerData = rpgManager.getEffectiveStats(unitId, progression);
    if (!towerData) {
      this.scene.events.emit('showMessage', 'Could not calculate this unit’s combat stats.', 2200);
      return false;
    }

    const tower = this.createTower(unitId, tile, towerData, deploymentCost);
    if (!economyManager.spendForce(deploymentCost)) {
      tower.destroy();
      this.scene.events.emit('showMessage', `Not enough Force. ${deploymentCost} Force required.`, 2200);
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
    const group = this.towerGroup;
    // Phaser's UpdateList destroys Groups during Scene shutdown before the
    // Scene's `shutdown` listeners run. Group.destroy() clears its members,
    // then sets both `scene` and `children` to undefined. The manager keeps
    // its reference, so a later cleanup call must recognize that lifecycle.
    if (!group || !group.scene || !group.children || typeof group.children.size !== 'number') {
      this.towerGroup = null;
      return false;
    }

    group.clear(true, true);
    return true;
  }
}
