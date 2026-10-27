import Phaser from 'phaser';
import MapSelectScene from './scenes/MapSelectScene.js';
import MainHubScene from './scenes/MainHubScene.js';
import FactionScene from './scenes/FactionScene.js';
import StoreScene from './scenes/StoreScene.js';
import DeploymentScene from './scenes/DeploymentScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import wavesConfig from './assets/config/waves.json';
import towersConfig from './assets/config/towers.json';
import unitsConfig from './assets/config/units.json';
import equipmentConfig from './assets/config/equipment.json';
import enemiesConfig from './assets/config/enemies.json';

// Game configuration
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  dom: { createContainer: true },
  width: 1280,
  height: 720,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  transparent: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [MainHubScene, FactionScene, MapSelectScene, StoreScene, DeploymentScene, GameScene, UIScene],
};

// Global game settings
window.GAME_SETTINGS = {
  // Difficulty levels
  DIFFICULTY: {
    EASY: {
      name: 'Easy',
      enemyHealthMultiplier: 1.0,
      enemySpeedMultiplier: 1.0,
      enemyRewardMultiplier: 1.0,
      enemyCountMultiplier: 1.0,
      waveCountAdjustment: 0, // No extra waves
    },
    NORMAL: {
      name: 'Normal',
      enemyHealthMultiplier: 1,
      enemySpeedMultiplier: 1,
      enemyRewardMultiplier: 1,
      enemyCountMultiplier: 1,
      waveCountAdjustment: 0,
    },
    HARD: {
      name: 'Hard',
      enemyHealthMultiplier: 1,
      enemySpeedMultiplier: 1,
      enemyRewardMultiplier: 1,
      enemyCountMultiplier: 1,
      waveCountAdjustment: 0,
    },
    EXPERT: {
      name: 'Expert',
      enemyHealthMultiplier: 1,
      enemySpeedMultiplier: 1,
      enemyRewardMultiplier: 1,
      enemyCountMultiplier: 1,
      waveCountAdjustment: 0,
    },
    INSANE: {
      name: 'Insane',
      enemyHealthMultiplier: 1,
      enemySpeedMultiplier: 1,
      enemyRewardMultiplier: 1,
      enemyCountMultiplier: 1,
      waveCountAdjustment: 0,
    },
  },
  // Tower types
  TOWERS: towersConfig,
  UNITS: unitsConfig,
  EQUIPMENT: equipmentConfig,
  // Mission enemy types. Keep these records data-only so placeholder content is easy to replace.
  ENEMIES: enemiesConfig,
  // Secure Region wave parameters are generated per mission from GAME_RULES.
  MISSION_WAVES: wavesConfig,
  // Player starting stats
  PLAYER: {
    lives: 10,
    money: 200,
    force: 80,
    allowedEscapes: 10,
  },
};

// Initialize the game after configuration is available to scene preload hooks.
const game = new Phaser.Game(config);

// Temporary read-only browser diagnostic for comparing rendering state between browsers.
window.__towerDefenseGame = game;
window.inspectFirstLancer = () => {
  const gameScene = game.scene.getScene('GameScene');
  const towerManager = gameScene?.towerManager;
  const towers = towerManager?.getAll?.() || [];
  const tower = towers.find(item => item?.characterId === 'LANCER');

  if (!gameScene) {
    console.warn('[inspectFirstLancer] GameScene is not available.');
    return { error: 'GameScene is not available' };
  }
  if (!tower) {
    console.warn('[inspectFirstLancer] No deployed LANCER was found.', { towerCount: towers.length });
    return { error: 'No deployed LANCER was found', towerCount: towers.length };
  }

  const sprite = tower.sprite;
  const textureKey = object => object?.texture?.key ?? null;
  const frameName = object => object?.frame?.name ?? null;
  const typeName = object => object?.constructor?.name || typeof object;
  const parentSummary = object => object?.parentContainer ? {
    type: typeName(object.parentContainer),
    name: object.parentContainer.name || null,
    depth: object.parentContainer.depth ?? null,
    visible: object.parentContainer.visible ?? null,
    active: object.parentContainer.active ?? null,
  } : null;
  const worldPosition = object => {
    if (!object) return null;
    const matrix = object.getWorldTransformMatrix?.();
    return matrix ? { x: matrix.tx, y: matrix.ty } : { x: object.x, y: object.y };
  };
  const objectSummary = object => ({
    type: typeName(object),
    name: object?.name || null,
    textureKey: textureKey(object),
    frame: frameName(object),
    x: object?.x ?? null,
    y: object?.y ?? null,
    worldX: worldPosition(object)?.x ?? null,
    worldY: worldPosition(object)?.y ?? null,
    width: object?.width ?? null,
    height: object?.height ?? null,
    displayWidth: object?.displayWidth ?? null,
    displayHeight: object?.displayHeight ?? null,
    visible: object?.visible ?? null,
    active: object?.active ?? null,
    depth: object?.depth ?? null,
    parentContainer: parentSummary(object),
  });
  const containsPoint = (object, x, y) => {
    if (!object?.getBounds) return false;
    try {
      return object.getBounds().contains(x, y);
    } catch (error) {
      return false;
    }
  };
  const childObjects = object => (object?.list || []).map(child => ({
    ...objectSummary(child),
    parentType: typeName(child.parentContainer),
  }));
  const sceneObjects = [];
  const visit = object => {
    if (!object) return;
    sceneObjects.push(object);
    (object.list || []).forEach(visit);
  };
  (gameScene.sys.displayList?.getChildren?.() || []).forEach(visit);

  const position = worldPosition(tower) || { x: tower.x, y: tower.y };
  const towerObjects = new Set([tower, ...(tower.list || [])]);
  const objectsAtPositionObjects = sceneObjects.filter(object =>
    containsPoint(object, position.x, position.y)
  );
  const objectsAtPosition = objectsAtPositionObjects.map(objectSummary);
  const separateObjectsAtPosition = objectsAtPositionObjects
    .filter(object => !towerObjects.has(object))
    .map(objectSummary);
  const tileSize = gameScene.mapManager?.getCurrentMap?.()?.tileSize || 0;
  const gridPosition = tileSize ? {
    x: Math.floor(tower.x / tileSize),
    y: Math.floor(tower.y / tileSize),
  } : null;
  const placementTile = gridPosition && gameScene.placementTiles?.find(tile =>
    tile.gridPosition?.x === gridPosition.x && tile.gridPosition?.y === gridPosition.y
  );
  const expectedTextureKey = `tower_${String(tower.towerData?.asset || tower.type).toLowerCase()}_${Math.min(
    tower.level,
    tower.towerData?.maxVisualLevel || 3
  )}`;
  const textureManager = gameScene.textures;
  const deployedTowerComparison = towers.map(item => ({
    characterId: item.characterId ?? null,
    towerType: item.type ?? null,
    level: item.level ?? null,
    gridPosition: tileSize ? {
      x: Math.floor(item.x / tileSize),
      y: Math.floor(item.y / tileSize),
    } : null,
    expectedTextureKey: `tower_${String(item.towerData?.asset || item.type).toLowerCase()}_${Math.min(
      item.level || 1,
      item.towerData?.maxVisualLevel || 3
    )}`,
    expectedTextureLoaded: textureManager?.exists?.(`tower_${String(item.towerData?.asset || item.type).toLowerCase()}_${Math.min(
      item.level || 1,
      item.towerData?.maxVisualLevel || 3
    )}`) ?? null,
    sprite: item.sprite ? objectSummary(item.sprite) : null,
    tower: objectSummary(item),
  }));
  const report = {
    characterId: tower.characterId,
    towerType: tower.type,
    expectedTextureKey,
    expectedTextureLoaded: textureManager?.exists?.(expectedTextureKey) ?? null,
    textureManagerTowerKeys: textureManager?.getTextureKeys?.().filter(key => key.startsWith('tower_')) || [],
    textureManagerHasMissingTexture: textureManager?.exists?.('__MISSING') ?? null,
    tower: {
      ...objectSummary(tower),
      depth: tower.depth,
      parentContainer: typeName(tower.parentContainer),
    },
    sprite: {
      ...objectSummary(sprite),
      textureKey: textureKey(sprite),
      frame: frameName(sprite),
      parentContainer: typeName(sprite?.parentContainer),
    },
    containerChildren: childObjects(tower),
    blackGreenCandidateDetails: objectsAtPositionObjects
      .filter(object => !object.texture || object.texture.key !== expectedTextureKey)
      .map(objectSummary),
    position,
    gridPosition,
    objectsAtPosition,
    separateObjectsAtPosition,
    nonTexturedObjectsAtPosition: objectsAtPosition.filter(object => !object.textureKey),
    boostTowerSquare: placementTile ? {
      ...objectSummary(placementTile),
      gridPosition: placementTile.gridPosition,
      hasTower: placementTile.hasTower ?? false,
      separateGameObjectAtPosition: !towerObjects.has(placementTile),
    } : null,
    blackGreenCandidates: objectsAtPosition.filter(object => !object.textureKey || object.textureKey !== textureKey(sprite)),
    deployedTowerComparison,
  };

  console.log('[inspectFirstLancer] Read-only report:', report);
  return report;
};
