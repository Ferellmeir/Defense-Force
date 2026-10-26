import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import PathManager from '../systems/PathManager.js';
import WaveManager from '../systems/WaveManager.js';
import EconomyManager from '../systems/EconomyManager.js';
import AudioManager from '../systems/AudioManager.js';
import MapManager from '../systems/MapManager.js';
import { generateMissionMap, createMissionSeed } from '../systems/missionGeneration.js';
import { canClearBlockedTile, clearBlockedTile } from '../systems/tileClearing.js';
import { createTileClearConfirmationController } from '../systems/tileClearConfirmation.js';
import Tower from '../entities/Tower.js';
import Enemy from '../entities/Enemy.js';
import HealerEnemy from '../entities/HealerEnemy.js';
import ShieldEnemy from '../entities/ShieldEnemy.js';
import SplitEnemy from '../entities/SplitEnemy.js';
import TeleportEnemy from '../entities/TeleportEnemy.js';
import Projectile from '../entities/Projectile.js';
import CollisionManager from '../systems/CollisionManager.js';
import EffectSpawner from '../systems/EffectSpawner.js';
import TowerManager from '../systems/TowerManager.js';
import EnemyManager from '../systems/EnemyManager.js';
import ProjectileManager from '../systems/ProjectileManager.js';
import RPGManager from '../systems/RPGManager.js';
import { clearMissionLocalState, transitionToMap } from '../systems/missionFlow.js';
import { getDirectedPathTiles, getPathTileKeys, getProjectedPathArrowFlipX } from '../utils/pathTiles.js';
import { getBuildingDisplaySize } from '../utils/buildingFootprint.js';
import { createBattlefieldProjection } from '../utils/battlefieldProjection.js';
import { getTileInformation } from '../systems/tileInformation.js';
import { createTileHoverPopupController } from '../systems/tileHoverPopup.js';
import {
  BATTLEFIELD_DRAG_THRESHOLD,
  clampBattlefieldScroll,
  clampBattlefieldZoom,
  zoomScrollAtPointer,
} from '../utils/battlefieldCamera.js';

// --- UI bar boundaries (keep in sync with UIScene) ---
const TOP_BAR_HEIGHT = 80;
const BOTTOM_BAR_HEIGHT = 100;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');

    // Map keys for available maps
    this.MAP_KEYS = ['forest', 'desert', 'mountain'];

    // Game state
    this.isGameOver = false;
    this.isPaused = false;
    this.gameSpeed = 1;
    this.gameTime = 0;
    this.currentWave = 0;
    this.gameEnded = false;
    this.isReturningFromMission = false;
    this.missionResult = null;
    this.battlefieldPointer = null;

    // Game objects
    this.towerManager = null;
    this.enemyManager = null;
    this.projectileManager = null;
    this.rpgManager = null;
    this.placementTiles = [];

    // New helpers
    this.collisionManager = null;
    this.effectSpawner = null;

    // Victory banner elements
    this.victoryBannerBg = null;
    this.victoryText = null;
    this.instructionText = null;
    this.scoreText = null;

    // Tile information popup state
    this.tileInfoPopup = null;
    this.tileInfoBackground = null;
    this.tileInfoText = null;
    this.tileInformationMap = null;
    this.tileInfoController = null;
    this.tileClearConfirmation = null;
  }

  preload() {
    // Load audio assets
    this.load.audio('attack', 'assets/attack.wav');
    this.load.audio('enemy_death', 'assets/enemy_death.wav');
    this.load.audio('upgrade', 'assets/upgrade.wav');
    this.load.audio('wave_start', 'assets/wave_start.mp3');
    this.load.audio('wave_end', 'assets/wave_end.mp3');
    this.load.audio('ui_click', 'assets/ui_click.mp3');
    this.load.audio('bgm', 'assets/bgm.mp3');

    // Load map tiles
    this.load.image('tile', 'assets/tile.png');
    this.load.image('tile_desert', 'assets/tile_desert.png');
    this.load.image('tile_mountain', 'assets/tile_mountain.png');
    this.load.image('path', 'assets/path.png');
    this.load.image('placement', 'assets/placement.png');

    // Supplied battlefield art. These images are rendered as projected map
    // scenery; the logical map and its path coordinates remain unchanged.
    for (let variation = 1; variation <= 8; variation++) {
      this.load.image(`battlefield_tile_${variation}`, `assets/New/tile ${variation}.png`);
    }
    this.load.image('blocked_terrain', 'assets/New/blocked 1.png');
    this.load.image('scenery_building_2x2', 'assets/New/building 2x2.png');
    this.load.image('scenery_building_2x4', 'assets/New/building 2x4.png');
    this.load.image('scenery_building_3x3', 'assets/New/building 3x3.png');
    this.load.image('sewer_rat_battlefield_background', 'assets/New/Sewer rat background.png');
    this.load.image('enemy_path_tile', 'assets/New/path 1.png');
    this.load.image('laisung_background', 'assets/New/Laisung background.png');
    this.load.image('laisung_ground_tile', 'assets/New/tile 1 laisung.png');
    this.load.image('laisung_path_tile', 'assets/New/path laisung.png');
    this.load.image('laisung_blocked_1', 'assets/New/blocked 1 laisung.png');
    this.load.image('laisung_blocked_2', 'assets/New/blocked 2 laisung.png');
    this.load.image('laisung_unclearable_1', 'assets/New/unclearable 1 laisung.png');
    this.load.image('laisung_unclearable_2', 'assets/New/unclearable 2 laisung.png');
    this.load.image('laisung_building_2x2', 'assets/New/Laisung building 2x2.png');
    this.load.image('laisung_building_2x4', 'assets/New/Laisung building 2x4.png');
    this.load.image('laisung_building_3x3', 'assets/New/Laisung building 3x3.png');

    // Dynamically load tower assets per type and upgrade level
    Object.entries(window.GAME_SETTINGS.UNITS).forEach(([type, data]) => {
      const assetName = data.asset || type;
      const key = assetName.toLowerCase();
      if (data.characterArt) {
        this.load.image(`tower_${key}_1`, `assets/${assetName}.png`);
        return;
      }
      for (let lvl = 1; lvl <= (data.maxLevel || 1); lvl++) {
        this.load.image(`tower_${key}_${lvl}`, `assets/tower_${key}_${lvl}.png`);
      }
    });

    // Dynamically load enemy assets for all configured types
    Object.keys(window.GAME_SETTINGS.ENEMIES).forEach(type => {
      const key = (window.GAME_SETTINGS.ENEMIES[type].asset || type).toLowerCase();
      this.load.image(`enemy_${key}`, `assets/enemy_${key}.png`);
    });

    // Load projectile assets
    this.load.image('projectile_basic', 'assets/projectile_basic.png');
    this.load.image('projectile_aoe', 'assets/projectile_aoe.png');
    this.load.image('projectile_slow', 'assets/projectile_slow.png');
    this.load.image('projectile_sniper', 'assets/projectile_sniper.png');
    this.load.image('projectile_multishot', 'assets/projectile_multishot.png');

    // Load effects
    this.load.image('explosion', 'assets/explosion.png');

    // Preload map JSON files
    this.mapManager = new MapManager(this);
    this.mapManager.preloadMaps(this.MAP_KEYS);
  }

  create() {
    // Scene restarts reuse this instance, so reset transient mission state that
    // is initialized in the constructor during a fresh page load.
    this.isGameOver = false;
    this.isPaused = false;
    this.gameSpeed = 1;
    this.gameTime = 0;
    this.currentWave = 0;
    this.gameEnded = false;
    this.isReturningFromMission = false;
    this.missionResult = null;
    this.game.loop.timeScale = 1;
    this.time.timeScale = 1;
    this.physics.world.timeScale = 1;
    this.waveManager?.cleanup();

    // Initialize systems
    this.pathManager = new PathManager(this);
    this.rpgManager = new RPGManager(this);
    this.waveManager = new WaveManager(this);
    this.economyManager = new EconomyManager(this);

    // Initialize audio manager
    this.audioManager = new AudioManager(this);

    // Play global background music (singleton)
    AudioManager.playGlobalMusic(this, 'bgm', 0.3);

    // Initialize MapManager and load maps
    if (!this.mapManager) {
      this.mapManager = new MapManager(this);
    }
    this.mapManager.createMaps(this.MAP_KEYS);

    // Set current map (use selected map from registry if available)
    const selectedMap = this.registry.get('selectedMap');
    if (selectedMap && this.MAP_KEYS.includes(selectedMap)) {
      this.mapManager.setCurrentMap(selectedMap);
    } else {
      this.mapManager.setCurrentMap(this.MAP_KEYS[0]);
    }

    // Generate the battlefield from mission-local seed while retaining the
    // selected map's visual theme and existing placement restrictions.
    let missionSeed = this.registry.get('missionSeed');
    if (!Number.isInteger(missionSeed)) {
      missionSeed = createMissionSeed();
      this.registry.set('missionSeed', missionSeed);
    }
    this.missionSeed = missionSeed;
    this.mapManager.currentMap = generateMissionMap(this.mapManager.getCurrentMap(), missionSeed, {
      difficulty: this.registry.get('selectedDifficulty') || 'EASY',
      faction: this.registry.get('missionFaction'),
    });

    // Create map
    this.createMap();

    // Set up input handlers
    this.setupInputHandlers();

    // Start the game
    this.events.emit('gameStart');

    // Connect to UI scene
    this.scene.launch('UIScene');
    this.events.emit('updateUI', {
      lives: window.GAME_SETTINGS.PLAYER.lives,
      escapes: 0,
      money: this.economyManager.getMoney(),
      force: this.economyManager.getForce(),
      wave: this.currentWave,
    });

    // Initialize new helpers
    this.collisionManager = new CollisionManager(this);
    this.effectSpawner = new EffectSpawner(this);

    // Initialize managers
    this.towerManager = new TowerManager(this, Tower);
    this.enemyManager = new EnemyManager(this);
    this.projectileManager = new ProjectileManager(this);

    // Hook cleanup to the 'transitionout' event, which happens BEFORE shutdown
    this.events.off('transitionout', this.cleanup, this);
    this.events.on('transitionout', this.cleanup, this);
    this.events.off('shutdown', this.cleanup, this);
    this.events.once('shutdown', this.cleanup, this);
    this.events.off('gamePaused', this.handleTileInformationPause, this);
    this.events.on('gamePaused', this.handleTileInformationPause, this);
  }

  update(time, delta) {
    if (this.isGameOver || this.isPaused) return;
    const gameDelta = delta * this.gameSpeed;
    this.gameTime += gameDelta;

    // Update all game entities
    this.towerManager.update(this.gameTime, gameDelta, this.enemyManager.getAll());
    this.enemyManager.update(this.gameTime, gameDelta);
    this.projectileManager.update(this.gameTime, gameDelta);

    // Check for collisions
    this.collisionManager.checkCollisions();

    // Update wave manager
    this.waveManager.update(time, delta);
  }

  createMap() {
    // Get current map data from MapManager
    const mapData = this.mapManager.getCurrentMap();
    if (!mapData) {
      console.error('No map data loaded!');
      return;
    }

    // Create the base map
    this.map = this.add.group();

    // Map dimensions (in tiles)
    const mapWidth = mapData.width;
    const mapHeight = mapData.height;
    const tileSize = mapData.tileSize;
    const renderedTileSize = Math.ceil(tileSize * Math.SQRT2);

    this.battlefieldProjection = createBattlefieldProjection({
      mapWidth,
      mapHeight,
      tileSize,
      viewportWidth: this.scale.width,
      viewportHeight: this.scale.height,
    });
    const projection = this.battlefieldProjection;
    const camera = this.cameras.main;
    const viewport = {
      x: 0,
      y: TOP_BAR_HEIGHT,
      width: this.scale.width,
      height: this.scale.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT,
    };
    camera.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
    camera.setZoom(1);
    const mapCorners = [
      projection.worldToScreen(0, 0),
      projection.worldToScreen(mapWidth * tileSize, 0),
      projection.worldToScreen(0, mapHeight * tileSize),
      projection.worldToScreen(mapWidth * tileSize, mapHeight * tileSize),
    ];
    this.battlefieldCameraBounds = {
      left: Math.min(...mapCorners.map(point => point.x)),
      right: Math.max(...mapCorners.map(point => point.x)),
      top: Math.min(...mapCorners.map(point => point.y)),
      bottom: Math.max(...mapCorners.map(point => point.y)),
      viewport,
    };
    this.clampBattlefieldCamera();
    if (this.mapLayer) this.mapLayer.destroy();
    const isLaisungMission = this.registry.get('missionFaction') === 'Laisung Collective';
    const backgroundKey = isLaisungMission ? 'laisung_background' : 'sewer_rat_battlefield_background';
    const background = this.add.image(projection.originX, projection.originY, backgroundKey);
    const source = this.textures.get(backgroundKey).getSourceImage();
    const fieldWidth = this.scale.width;
    const fieldHeight = Math.max(1, this.scale.height - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT);
    const fieldAspect = fieldWidth / fieldHeight;
    const sourceAspect = source.width / source.height;
    const cropWidth = sourceAspect > fieldAspect ? source.height * fieldAspect : source.width;
    const cropHeight = sourceAspect > fieldAspect ? source.height : source.width / fieldAspect;
    background.setCrop(
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight
    );
    const coverScale = Math.max(fieldWidth / source.width, fieldHeight / source.height);
    background.setDisplaySize(source.width * coverScale, source.height * coverScale);
    background.setDepth(-100);
    this.mapLayer = this.add.container(projection.originX, projection.originY);
    // Ground tiles live in an oblique layer; gameplay entities remain outside
    // it so their sprites can stay upright at projected screen positions.
    this.mapLayer.setScale(projection.scale, projection.scale * 0.5);

    // Prepare sets for restrictions and special tiles
    const restricted = new Set();
    (mapData.placementRestrictions || []).forEach(area => {
      for (let dx = 0; dx < area.width; dx++) {
        for (let dy = 0; dy < area.height; dy++) {
          restricted.add(`${area.x + dx},${area.y + dy}`);
        }
      }
    });
    const pathTileKeys = getPathTileKeys(mapData.paths || []);
    this.pathTileKeys = pathTileKeys;
    const clearableKeys = new Set((mapData.blockedClearableTiles || []).map(tile => `${tile.x},${tile.y}`));
    const specialTiles = {};
    (mapData.specialTiles || []).forEach(tile => {
      specialTiles[`${tile.x},${tile.y}`] = tile.type;
    });
    const terrainModifiers = {};
    (mapData.terrainModifiers || []).forEach(tile => {
      terrainModifiers[`${tile.x},${tile.y}`] = tile;
    });

    // Create background tiles
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tileCenter = projection.worldToLayer(
          (x + 0.5) * tileSize,
          (y + 0.5) * tileSize
        );
        const variation = 1 + ((x * 7 + y * 11) % 8);
        if (!pathTileKeys.has(`${x},${y}`)) {
          const tile = this.add.image(tileCenter.x, tileCenter.y, isLaisungMission ? 'laisung_ground_tile' : `battlefield_tile_${variation}`);
          tile.setDisplaySize(renderedTileSize, renderedTileSize);
          this.map.add(tile);
          this.mapLayer.add(tile);
        }

        // Overlay for placement restrictions
        if (restricted.has(`${x},${y}`)) {
          const overlay = this.add.rectangle(
            tileCenter.x,
            tileCenter.y,
            tileSize, tileSize,
            0x000000, 0.15
          );
          overlay.setRotation(Math.PI / 4);
          overlay.setDepth(2);
          this.map.add(overlay);
          this.mapLayer.add(overlay);
        }

        // Overlay/icon for special tiles
        if (specialTiles[`${x},${y}`]) {
          let color = 0x00ffff, alpha = 0.3;
          switch (specialTiles[`${x},${y}`]) {
            case 'thermal_enhancement': color = 0xff5522; alpha = 0.35; break;
            case 'snipers_nest': color = 0xffff00; alpha = 0.35; break;
            case 'toxin_synthesizers': color = 0x44cc44; alpha = 0.35; break;
            case 'tactical_indoctrination': color = 0x4488ff; alpha = 0.35; break;
            case 'adaptability_network': color = 0xaa44ff; alpha = 0.35; break;
            case 'dark_alley': color = 0x333344; alpha = 0.45; break;
            case 'damage_boost':
              color = 0xffff00; alpha = 0.35; break;
            case 'range_boost':
              color = 0xffff00; alpha = 0.35; break;
            case 'elevation_high':
              color = 0x4444ff; alpha = 0.35; break;
            default:
              color = 0x00ffff; alpha = 0.3;
          }
          const stOverlay = this.add.rectangle(
            tileCenter.x,
            tileCenter.y,
            tileSize * 0.7, tileSize * 0.7,
            color, alpha
          );
          stOverlay.setRotation(Math.PI / 4);
          stOverlay.setDepth(3);
          this.map.add(stOverlay);
          this.mapLayer.add(stOverlay);

        }

        // Create placement tiles (where towers can be placed)
        if (!restricted.has(`${x},${y}`) && !pathTileKeys.has(`${x},${y}`)) {
          const placementTile = this.add.image(tileCenter.x, tileCenter.y, 'placement');
          placementTile.setDisplaySize(tileSize, tileSize).setRotation(Math.PI / 4);
          placementTile.setAlpha(0.3);
          placementTile.setInteractive();

          // Store grid position
          placementTile.gridPosition = { x, y };
          placementTile.specialType = specialTiles[`${x},${y}`];
          placementTile.isBlockedClearable = clearableKeys.has(`${x},${y}`);
          if (placementTile.isBlockedClearable) {
            const blocked = this.add.image(tileCenter.x, tileCenter.y, isLaisungMission
              ? ((x + y) % 2 ? 'laisung_blocked_1' : 'laisung_blocked_2')
              : 'blocked_terrain');
            blocked.setDisplaySize(tileSize, tileSize);
            blocked.setAlpha(0.9);
            placementTile.blockedOverlay = blocked;
            this.map.add(blocked);
            this.mapLayer.add(blocked);
          }

          // Add to placement tiles array
          this.placementTiles.push(placementTile);
          this.mapLayer.add(placementTile);

          // Set up event handlers
          placementTile.on('pointerover', () => {
            if (!placementTile.hasTower) {
              placementTile.setAlpha(0.6);
            }
          });

          placementTile.on('pointerout', () => {
            if (!placementTile.hasTower) {
              placementTile.setAlpha(0.3);
            }
          });

        }
      }
    }

    // Reserved placement areas use the supplied blocked terrain texture.
    // They are scenery only; existing placement restrictions remain authoritative.
    for (const area of mapData.placementRestrictions || []) {
      for (let y = area.y; y < area.y + area.height; y++) {
        for (let x = area.x; x < area.x + area.width; x++) {
          const center = projection.worldToLayer((x + 0.5) * tileSize, (y + 0.5) * tileSize);
          const blocked = this.add.image(center.x, center.y, isLaisungMission
            ? ((x + y) % 2 ? 'laisung_unclearable_1' : 'laisung_unclearable_2')
            : 'blocked_terrain');
          blocked.setDisplaySize(tileSize, tileSize);
          this.map.add(blocked);
          this.mapLayer.add(blocked);
        }
      }
    }

    // Building position, blocked footprint and rendered dimensions all come
    // from the generated building record.
    for (const buildingData of mapData.buildings || []) {
      const center = projection.worldToScreen(
        (buildingData.x + buildingData.width / 2) * tileSize,
        (buildingData.y + buildingData.height / 2) * tileSize
      );
      const building = this.add.image(center.x, center.y, buildingData.sprite);
      let displaySize = getBuildingDisplaySize(buildingData, tileSize);
      if (isLaisungMission) {
        const source = this.textures.get(buildingData.sprite).getSourceImage();
        const fit = Math.min(displaySize.width / source.width, displaySize.height / source.height);
        displaySize = { width: source.width * fit, height: source.height * fit };
      }
      building.setDisplaySize(displaySize.width, displaySize.height);
      building.setDepth(center.y);
      this.map.add(building);
    }

    // Set up path for enemies to follow (use first path for now)
    const mainPath = mapData.paths[0];
    // Draw a tile for every route cell. Downward routes use the closest
    // available upward arrow, with horizontal flipping only.
    for (const routeTile of getDirectedPathTiles(mainPath)) {
      const center = projection.worldToLayer(
        (routeTile.x + 0.5) * tileSize,
        (routeTile.y + 0.5) * tileSize
      );
      const directionFlipX = getProjectedPathArrowFlipX(
        routeTile.nextX - routeTile.x,
        routeTile.nextY - routeTile.y
      );
      const pathTile = this.add.image(center.x, center.y, isLaisungMission ? 'laisung_path_tile' : 'enemy_path_tile');
      pathTile.setDisplaySize(renderedTileSize, renderedTileSize).setFlipX(directionFlipX);
      this.map.add(pathTile);
      this.mapLayer.add(pathTile);
    }
    this.pathManager.setPath(
      mainPath.map((coord) => ({
        x: coord.x * tileSize + tileSize / 2,
        y: coord.y * tileSize + tileSize / 2,
        terrain: terrainModifiers[`${coord.x},${coord.y}`],
      }))
    );
    this.createTileInformationPopup(mapData);
    this.setupBattlefieldNavigation();
  }

  setupBattlefieldNavigation() {
    this.input.off('pointerdown', this.handleBattlefieldPointerDown, this);
    this.input.off('pointermove', this.handleBattlefieldPointerMove, this);
    this.input.off('pointerup', this.handleBattlefieldPointerUp, this);
    this.input.off('pointerupoutside', this.handleBattlefieldPointerCancel, this);
    this.input.off('wheel', this.handleBattlefieldWheel, this);
    this.input.off('pointermove', this.handleTileInformationPointerMove, this);
    this.input.off('gameout', this.handleTileInformationPointerExit, this);
    this.input.on('pointerdown', this.handleBattlefieldPointerDown, this);
    this.input.on('pointermove', this.handleBattlefieldPointerMove, this);
    this.input.on('pointerup', this.handleBattlefieldPointerUp, this);
    this.input.on('pointerupoutside', this.handleBattlefieldPointerCancel, this);
    this.input.on('wheel', this.handleBattlefieldWheel, this);
    this.input.on('pointermove', this.handleTileInformationPointerMove, this);
    this.input.on('gameout', this.handleTileInformationPointerExit, this);
  }

  createTileInformationPopup(mapData) {
    this.tileInfoController?.destroy();
    this.tileInfoPopup?.destroy();
    this.tileInfoBackground = this.add.rectangle(0, 0, 276, 48, 0x101923, 0.97)
      .setOrigin(0).setStrokeStyle(1, 0x54d9e8, 0.9);
    this.tileInfoText = this.add.text(10, 8, '', {
      fontSize: '14px',
      color: '#e9f4fb',
      wordWrap: { width: 256 },
      lineSpacing: 2,
    }).setOrigin(0);
    this.tileInfoPopup = this.add.container(0, 0, [this.tileInfoBackground, this.tileInfoText])
      .setDepth(1200).setVisible(false);
    this.tileInfoController = createTileHoverPopupController({
      delayMs: 1000,
      schedule: (delay, callback) => this.time.delayedCall(delay, callback),
      cancel: timer => timer?.remove(false),
      onShow: (info, anchor) => this.renderTileInformation(info, anchor),
      onUpdate: (info, anchor) => this.renderTileInformation(info, anchor),
      onHide: () => this.tileInfoPopup?.setVisible(false),
    });
    this.tileInformationMap = mapData;
  }

  renderTileInformation(info, anchor) {
    if (!this.tileInfoPopup || !this.tileInfoText || !this.tileInfoBackground) return;
    this.tileInfoText.setText([info.type, ...info.lines].join('\n'));
    const viewport = this.battlefieldCameraBounds?.viewport;
    if (!viewport) return;
    const width = Math.min(276, Math.max(120, viewport.width - 16));
    this.tileInfoText.setWordWrapWidth(width - 20);
    const height = this.tileInfoText.height + 16;
    this.tileInfoBackground.setSize(width, height);
    const right = viewport.x + viewport.width;
    const bottom = viewport.y + viewport.height;
    const halfTileWidth = anchor.tileSize * anchor.scale * anchor.zoom * Math.SQRT1_2;
    let x = anchor.x + halfTileWidth + 10;
    if (x + width > right - 8) x = anchor.x - halfTileWidth - width - 10;
    let y = anchor.y - height / 2;
    if (x < viewport.x + 8 || x + width > right - 8) {
      x = Math.max(viewport.x + 8, Math.min(right - width - 8, anchor.x - width / 2));
      const above = anchor.y - anchor.tileHeight / 2 - height - 8;
      const below = anchor.y + anchor.tileHeight / 2 + 8;
      y = above >= viewport.y + 8 ? above : below;
    }
    x = Math.max(viewport.x + 8, Math.min(right - width - 8, x));
    y = Math.max(viewport.y + 8, Math.min(bottom - height - 8, y));
    const worldPosition = this.cameras.main.getWorldPoint(x, y);
    this.tileInfoPopup.setPosition(worldPosition.x, worldPosition.y)
      .setScale(1 / anchor.zoom).setVisible(true);
  }

  getTileInformationAnchor(position) {
    const map = this.tileInformationMap;
    const world = this.battlefieldProjection.worldToScreen(
      (position.x + 0.5) * map.tileSize,
      (position.y + 0.5) * map.tileSize
    );
    const screen = this.cameras.main.matrix.transformPoint(world.x, world.y);
    return {
      ...screen,
      tileSize: map.tileSize,
      tileHeight: map.tileSize * this.battlefieldProjection.scale * this.cameras.main.zoom * Math.SQRT1_2 * 0.5,
      scale: this.battlefieldProjection.scale,
      zoom: this.cameras.main.zoom,
    };
  }

  getTileInformationAt(position) {
    const map = this.tileInformationMap;
    const tower = this.towerManager?.getAll().find(unit => unit.placementTile?.gridPosition?.x === position.x
      && unit.placementTile?.gridPosition?.y === position.y);
    const unit = tower && this.rpgManager?.getUnitDefinition(tower.characterId || tower.towerData?.unitId);
    return getTileInformation(map, position, { occupiedUnitName: unit?.name || null });
  }

  handleTileInformationPointerMove(pointer) {
    if (this.tileClearConfirmation?.isOpen()) {
      this.tileInfoController?.leave();
      return;
    }
    const bounds = this.battlefieldCameraBounds?.viewport;
    if (pointer.isDown || this.isPaused || this.gameEnded || !bounds || pointer.x < bounds.x || pointer.x > bounds.x + bounds.width
      || pointer.y < bounds.y || pointer.y > bounds.y + bounds.height) {
      this.tileInfoController?.leave();
      return;
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const position = this.battlefieldProjection.screenToTile(world.x, world.y);
    if (!position) {
      this.tileInfoController?.leave();
      return;
    }
    const id = `${position.x},${position.y}`;
    const anchor = this.getTileInformationAnchor(position);
    this.tileInfoController?.hover(id, () => this.getTileInformationAt(position), anchor);
  }

  handleTileInformationPointerExit() {
    this.tileInfoController?.leave();
  }

  handleTileInformationPause(paused) {
    if (paused) this.tileInfoController?.leave();
  }

  clampBattlefieldCamera() {
    const camera = this.cameras.main;
    const bounds = this.battlefieldCameraBounds;
    if (!bounds) return;
    camera.setScroll(
      clampBattlefieldScroll({
        scroll: camera.scrollX,
        zoom: camera.zoom,
        viewportSize: bounds.viewport.width,
        mapStart: bounds.left,
        mapEnd: bounds.right,
      }),
      clampBattlefieldScroll({
        scroll: camera.scrollY,
        zoom: camera.zoom,
        viewportSize: bounds.viewport.height,
        mapStart: bounds.top,
        mapEnd: bounds.bottom,
      })
    );
  }

  handleBattlefieldPointerDown(pointer) {
    const bounds = this.battlefieldCameraBounds;
    if (this.tileClearConfirmation?.isOpen()) return;
    if (this.gameEnded || !bounds || !pointer.leftButtonDown()) return;
    if (pointer.x < bounds.viewport.x || pointer.x > bounds.viewport.x + bounds.viewport.width
      || pointer.y < bounds.viewport.y || pointer.y > bounds.viewport.y + bounds.viewport.height) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const cell = this.battlefieldProjection.screenToTile(worldPoint.x, worldPoint.y);
    const tile = cell && this.placementTiles.find(item =>
      item.gridPosition.x === cell.x && item.gridPosition.y === cell.y
    );
    this.battlefieldPointer = {
      id: pointer.id,
      x: pointer.x,
      y: pointer.y,
      lastX: pointer.x,
      lastY: pointer.y,
      dragged: false,
      tile,
    };
  }

  handleBattlefieldPointerMove(pointer) {
    if (this.tileClearConfirmation?.isOpen()) return;
    const drag = this.battlefieldPointer;
    if (!drag || drag.id !== pointer.id || !pointer.isDown) return;
    if (Math.hypot(pointer.x - drag.x, pointer.y - drag.y) > BATTLEFIELD_DRAG_THRESHOLD) {
      drag.dragged = true;
    }
    if (drag.dragged) {
      const camera = this.cameras.main;
      camera.setScroll(
        camera.scrollX - (pointer.x - drag.lastX) / camera.zoom,
        camera.scrollY - (pointer.y - drag.lastY) / camera.zoom
      );
      this.clampBattlefieldCamera();
    }
    drag.lastX = pointer.x;
    drag.lastY = pointer.y;
  }

  handleBattlefieldPointerUp(pointer) {
    const drag = this.battlefieldPointer;
    if (this.tileClearConfirmation?.isOpen()) {
      this.battlefieldPointer = null;
      return;
    }
    if (!drag || drag.id !== pointer.id) return;
    if (!drag.dragged && drag.tile) this.handleTilePlacement(drag.tile);
    this.battlefieldPointer = null;
    if (this.tileClearConfirmation?.isOpen()) {
      this.tileInfoController?.leave();
      return;
    }
    this.handleTileInformationPointerMove(pointer);
  }

  handleBattlefieldPointerCancel(pointer) {
    if (this.battlefieldPointer?.id === pointer.id) this.battlefieldPointer = null;
  }

  handleBattlefieldWheel(pointer, gameObjects, deltaX, deltaY, deltaZ, event) {
    if (this.tileClearConfirmation?.isOpen()) return;
    const bounds = this.battlefieldCameraBounds;
    if (!bounds || pointer.x < bounds.viewport.x || pointer.x > bounds.viewport.x + bounds.viewport.width
      || pointer.y < bounds.viewport.y || pointer.y > bounds.viewport.y + bounds.viewport.height) return;
    event?.preventDefault();
    const camera = this.cameras.main;
    const nextZoom = clampBattlefieldZoom(camera.zoom * Math.exp(-deltaY * 0.001));
    if (nextZoom === camera.zoom) return;
    camera.setScroll(
      zoomScrollAtPointer({
        scroll: camera.scrollX,
        pointer: pointer.x,
        viewportStart: bounds.viewport.x,
        viewportSize: bounds.viewport.width,
        zoom: camera.zoom,
        nextZoom,
      }),
      zoomScrollAtPointer({
        scroll: camera.scrollY,
        pointer: pointer.y,
        viewportStart: bounds.viewport.y,
        viewportSize: bounds.viewport.height,
        zoom: camera.zoom,
        nextZoom,
      })
    );
    camera.setZoom(nextZoom);
    this.clampBattlefieldCamera();
  }

  handleTilePlacement(tile) {
    if (this.tileClearConfirmation?.isOpen()) return;
    const gridPosition = tile.gridPosition;
    if (tile.isBlockedClearable) {
      const map = this.mapManager.getCurrentMap();
      this.openTileClearConfirmation(tile, map);
      return;
    }
    if (gridPosition && this.pathTileKeys?.has(`${gridPosition.x},${gridPosition.y}`)) {
      this.events.emit('showMessage', 'Units cannot be placed on enemy paths.', 1800);
      return;
    }

    // Prevent placement in UI bar regions
    const canvasHeight = this.sys.game.scale.height;
    const tileHeight = tile.displayHeight || 64;
    const projectedTilePosition = this.battlefieldProjection.worldToScreen(
      (gridPosition.x + 0.5) * this.mapManager.getCurrentMap().tileSize,
      (gridPosition.y + 0.5) * this.mapManager.getCurrentMap().tileSize
    );
    const tileScreenPosition = this.cameras.main.matrix.transformPoint(
      projectedTilePosition.x,
      projectedTilePosition.y
    );
    if (tileScreenPosition.y < TOP_BAR_HEIGHT || tileScreenPosition.y > (canvasHeight - BOTTOM_BAR_HEIGHT - tileHeight * this.cameras.main.zoom * 0.25)) {
      // Use default message styling (now in UIScene.js)
      this.events.emit(
        'showMessage',
        "You can't place \na tower here",
        1800
      );
      return;
    }
    if (tile.hasTower) return;

    const selectedDeployment = this.registry.get('selectedUnit');
    const selectedEntry = (this.registry.get('missionRoster') || []).find(entry => typeof entry === 'string' ? entry === selectedDeployment : entry.deploymentId === selectedDeployment);
    const selectedUnit = typeof selectedEntry === 'string' ? selectedEntry : selectedEntry?.unitId;
    if (!this.towerManager.deployUnit(selectedUnit, tile)) {
      this.events.emit('showMessage', 'Not enough Force!', 1800);
    }
  }

  openTileClearConfirmation(tile, map) {
    if (!this.tileClearConfirmation) {
      this.tileClearConfirmation = createTileClearConfirmationController({
        canClear: (position, context) => canClearBlockedTile(context.map, position),
        clear: (position, context) => clearBlockedTile(context.map, position, this.economyManager),
        getForce: () => this.economyManager.getForce(),
        onOpen: () => this.showTileClearDialog(),
        onClose: () => this.hideTileClearDialog(),
        onCleared: (position, context) => {
          const selectedTile = context.tile;
          selectedTile.isBlockedClearable = false;
          selectedTile.blockedOverlay?.destroy();
          selectedTile.blockedOverlay = null;
          selectedTile.setAlpha(0.3);
          this.tileInfoController?.refresh();
          this.events.emit('showMessage', 'Terrain cleared. The tile is ready for deployment.', 1800);
        },
        onInsufficientForce: cost => {
          this.events.emit('showMessage', `Not enough Force to clear this tile. ${cost} Force required.`, 1800);
        },
      });
    }
    this.tileInfoController?.leave();
    this.tileClearConfirmation.open(tile.gridPosition, { map, tile });
  }

  showTileClearDialog() {
    this.scene.get('UIScene')?.showTileClearConfirmation({
      onConfirm: () => this.tileClearConfirmation?.confirm(),
      onCancel: () => this.tileClearConfirmation?.cancel(),
    });
  }

  hideTileClearDialog() {
    this.scene.get('UIScene')?.hideTileClearConfirmation();
  }

  projectWorldPoint(x, y) {
    return this.battlefieldProjection?.worldToScreen(x, y) || { x, y };
  }

  setupInputHandlers() {
    // Pause game
    this.input.keyboard.on('keydown-P', () => {
      this.isPaused = !this.isPaused;
      this.time.timeScale = this.isPaused ? 0 : this.gameSpeed;
      this.events.emit('gamePaused', this.isPaused);
    });

    this.input.keyboard.on('keydown-F', () => {
      this.setGameSpeed((this.gameSpeed % 4) + 1);
    });

    // Start next wave manually
    this.input.keyboard.on('keydown-SPACE', () => {
      this.waveManager.startNextWave('manual');
    });

    // Force victory for testing (press V key)
    this.input.keyboard.on('keydown-V', () => {
      console.log('V key pressed - forcing victory');
      this.gameOver(true);
    });

    // Show wave end indicator and check for victory when a wave is completed
    this.events.on('waveCompleted', (waveNumber) => {
      console.log(
        `Wave ${waveNumber} completed. GameScene.currentWave=${
          this.currentWave
        }, WaveManager.currentWave=${this.waveManager.getCurrentWave()}`
      );
      // Robust, single-responsibility victory check
      const totalWaves = this.waveManager.getTotalWaves();
      if (waveNumber >= totalWaves && !this.isGameOver && !this.gameEnded) {
        console.log(
          `Victory condition met: waveNumber=${waveNumber}, totalWaves=${totalWaves}`
        );
        this.gameOver(true);
      }
    });

    // Listen for wave started events to update current wave
    this.events.on('waveStarted', (waveNumber) => {
      this.currentWave = waveNumber;
      console.log(
        `Wave ${waveNumber} started. GameScene.currentWave=${
          this.currentWave
        }, WaveManager.currentWave=${this.waveManager.getCurrentWave()}`
      );
    });
  }

  setGameSpeed(speed) {
    if (![1, 2, 3, 4].includes(speed)) return false;
    this.gameSpeed = speed;
    this.time.timeScale = this.isPaused ? 0 : speed;
    this.physics.world.timeScale = 1 / speed;
    this.events.emit('gameSpeedChanged', speed);
    return true;
  }

  /**
   * Show a visual indicator for wave start/end
   * @param {string} text - The text to display
   */
  showWaveIndicator(text) {
    const width = this.game.config.width;
    const height = this.game.config.height;
    const banner = this.add.text(width / 2, height / 2, text, {
      fontSize: '48px',
      fill: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
      align: 'center',
    });
    banner.setOrigin(0.5);
    banner.setDepth(1000);

    this.tweens.add({
      targets: banner,
      alpha: 0,
      duration: 1200,
      delay: 800,
      onComplete: () => {
        banner.destroy();
      },
    });
  }

  spawnEnemy(type, x, y, data, path, currentPathIndex, t) {
    const enemyType = type.toLowerCase();
    const enemyData = data || window.GAME_SETTINGS.ENEMIES[type];
    const usePath = path || this.pathManager.getPath();
    let spawnPoint;
    if (typeof x === 'number' && typeof y === 'number') {
      spawnPoint = { x, y };
    } else {
      spawnPoint = this.pathManager.getStartPoint();
    }

    let enemy;
    // Instrumentation: log type and class
    let debugClass = 'Enemy';
    if (enemyType === 'healer') {
      enemy = new HealerEnemy(
        this,
        spawnPoint.x,
        spawnPoint.y,
        enemyType,
        enemyData,
        usePath
      );
      debugClass = 'HealerEnemy';
    } else if (enemyType === 'shield') {
      enemy = new ShieldEnemy(
        this,
        spawnPoint.x,
        spawnPoint.y,
        enemyType,
        enemyData,
        usePath
      );
      debugClass = 'ShieldEnemy';
    } else if (enemyType === 'split') {
      enemy = new SplitEnemy(
        this,
        spawnPoint.x,
        spawnPoint.y,
        enemyType,
        enemyData,
        usePath
      );
      debugClass = 'SplitEnemy';
      // Optionally set path index/t for mid-path spawns
      if (typeof currentPathIndex === 'number')
        enemy.currentPathIndex = currentPathIndex;
      if (typeof t === 'number') enemy.t = t;
    } else if (enemyType === 'teleport') {
      enemy = new TeleportEnemy(
        this,
        spawnPoint.x,
        spawnPoint.y,
        enemyType,
        enemyData,
        usePath
      );
      debugClass = 'TeleportEnemy';
    } else {
      enemy = new Enemy(
        this,
        spawnPoint.x,
        spawnPoint.y,
        enemyType,
        enemyData,
        usePath
      );
    }

    // Debug: log instantiation
    // eslint-disable-next-line no-console
    console.log(
      `[spawnEnemy] type: ${type}, enemyType: ${enemyType}, class: ${debugClass}`
    );

    this.enemyManager.addEnemy(enemy);
  }

  spawnProjectile(tower, target, type, data) {
    const projectile = new Projectile(
      this,
      tower.x,
      tower.y,
      type,
      data,
      target
    );

    this.projectileManager.addProjectile(projectile);
  }

  gameOver(victory) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.gameEnded = true;
    this.tileInfoController?.leave();

    const result = this.rpgManager.settleMission({
      missionId: this.registry.get('missionRunId'),
      victory,
      difficulty: this.registry.get('selectedDifficulty') || 'EASY',
      unitIds: this.registry.get('missionRoster') || [],
      missionFaction: this.registry.get('missionFaction') || null,
    });
    this.missionResult = result;
    if (result) {
      this.registry.set('storeStock', null);
      this.registry.set('storeRestockCost', 15);
    }

    // Emit game over event
    this.events.emit('gameOver', {
      victory,
      wave: this.currentWave,
      score: this.economyManager.getScore(),
      force: this.economyManager.getForce(),
      result,
    });

    clearMissionLocalState(this);

    console.log(
      `gameOver called with victory=${victory}, gameEnded=${this.gameEnded}`
    );

  }

  returnToMap() {
    return transitionToMap({
      isGameOver: this.isGameOver,
      isReturning: this.isReturningFromMission,
      setReturning: () => { this.isReturningFromMission = true; },
      stopAudio: () => this.audioManager?.stopAll(),
      stopUIScene: () => this.scene.stop('UIScene'),
      startMap: () => this.scene.start('MapSelectScene'),
    });
  }

  /**
   * Display a victory banner when all waves are successfully defended
   */
  showVictoryBanner() {
    console.log('showVictoryBanner method called');

    // Set flag to prevent multiple banners
    this.gameEnded = true;

    // Create full-screen semi-transparent background
    const width = this.game.config.width;
    const height = this.game.config.height;
    this.victoryBannerBg = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.8
    );
    this.victoryBannerBg.setOrigin(0.5);
    this.victoryBannerBg.setDepth(1000);

    // Create victory text in gold
    this.victoryText = this.add.text(width / 2, height / 2 - 80, 'VICTORY!', {
      fontSize: '96px',
      fontStyle: 'bold',
      fill: '#FFD700', // Gold color
      stroke: '#000000',
      strokeThickness: 8,
      align: 'center',
    });
    this.victoryText.setOrigin(0.5);
    this.victoryText.setDepth(1001);

    // Create instruction text
    this.instructionText = this.add.text(
      width / 2,
      height / 2 + 60,
      'Click anywhere to return to the map',
      {
        fontSize: '32px',
        fill: '#FFFFFF',
        align: 'center',
      }
    );
    this.instructionText.setOrigin(0.5);
    this.instructionText.setDepth(1001);

    // Add score text
    const score = this.economyManager.getScore();
    this.scoreText = this.add.text(width / 2, height / 2, `Score: ${fmt(score)}`, {
      fontSize: '48px',
      fill: '#00FF00', // Green color
      align: 'center',
    });
    this.scoreText.setOrigin(0.5);
    this.scoreText.setDepth(1001);

    // End the mission and return to the map without reloading persistent state.
    this.input.once('pointerdown', () => {
      if (this.audioManager) {
        this.audioManager.stopAll();
      }
      this.scene.stop('UIScene');
      this.scene.start('MapSelectScene');
    });

    // Add animation effects
    this.tweens.add({
      targets: this.victoryText,
      scale: { from: 0.5, to: 1.2, yoyo: true, repeat: -1 },
      duration: 1000,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: this.instructionText,
      alpha: { from: 0, to: 1 },
      duration: 500,
      delay: 500,
    });

    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 0.8, to: 1.1 },
      duration: 800,
      ease: 'Back.out',
    });

    // Play victory sound if available
    if (this.audioManager) {
      this.audioManager.playSound('wave_end');
    }

    console.log('Victory banner created and displayed');
  }

  /**
   * Play enemy death animation at (x, y)
   */
  playDeathAnimation(x, y) {
    const emitter = this.add.particles(0, 0, 'explosion', {
      lifespan: 400,
      speed: { min: 60, max: 160 },
      scale: { start: 0.5, end: 0 },
      quantity: 15,
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    });
    emitter.explode(15, x, y);
    this.time.delayedCall(420, () => {
      emitter.destroy();
    });
  }

  // --- Add cleanup method for robust restart ---
  cleanup() {
    this.tileClearConfirmation?.destroy();
    this.tileClearConfirmation = null;
    this.hideTileClearDialog();
    this.tileInfoController?.destroy();
    this.tileInfoController = null;
    this.input?.off('pointermove', this.handleBattlefieldPointerMove, this);
    this.input?.off('pointermove', this.handleTileInformationPointerMove, this);
    this.input?.off('gameout', this.handleTileInformationPointerExit, this);
    this.input?.off('pointerdown', this.handleBattlefieldPointerDown, this);
    this.input?.off('pointerup', this.handleBattlefieldPointerUp, this);
    this.input?.off('pointerupoutside', this.handleBattlefieldPointerCancel, this);
    this.input?.off('wheel', this.handleBattlefieldWheel, this);
    this.events.off('gamePaused', this.handleTileInformationPause, this);
    this.events.off('transitionout', this.cleanup, this);
    this.events.off('shutdown', this.cleanup, this);
    this.waveManager?.cleanup();
    console.log('[GameScene.cleanup] called. this.towerManager:', this.towerManager);
    if (this.towerManager) {
      console.log('[GameScene.cleanup] this.towerManager.towerGroup:', this.towerManager.towerGroup);
    }
    if (this.enemyManager) {
      console.log('[GameScene.cleanup] this.enemyManager.enemyGroup:', this.enemyManager.enemyGroup);
    }
    if (this.projectileManager) {
      console.log('[GameScene.cleanup] this.projectileManager.projectileGroup:', this.projectileManager.projectileGroup);
    }
    // Clear all managers (defensive: check for group existence)
    if (this.towerManager && this.towerManager.towerGroup) {
      this.towerManager.clear();
    }
    if (this.enemyManager && this.enemyManager.enemyGroup) {
      this.enemyManager.clear();
    }
    if (this.projectileManager && this.projectileManager.projectileGroup) {
      this.projectileManager.clear();
    }
    // Remove placement tiles
    if (this.placementTiles) {
      this.placementTiles.forEach(tile => tile && tile.destroy && tile.destroy());
      this.placementTiles = [];
    }
    // Remove map overlays/group
    if (this.map && this.map.clear) {
      this.map.clear(true, true);
      this.map = null;
    }
    if (this.mapLayer) {
      this.mapLayer.destroy();
      this.mapLayer = null;
    }
    // Destroy all audio objects and clear references
    if (this.audioManager) {
      this.audioManager.stopAll();
      this.audioManager = null;
    }
    // Reset economy
    this.economyManager?.reset && this.economyManager.reset();
    // Remove any tooltips or custom overlays
    this.tileInfoPopup?.destroy();
    this.tileInfoPopup = null;
    this.tileInfoBackground = null;
    this.tileInfoText = null;
    this.tileInformationMap = null;
    // Destroy victory banner elements if present
    if (this.victoryText) {
      this.victoryText.destroy();
      this.victoryText = null;
    }
    if (this.instructionText) {
      this.instructionText.destroy();
      this.instructionText = null;
    }
    if (this.scoreText) {
      this.scoreText.destroy();
      this.scoreText = null;
    }
    if (this.victoryBannerBg) {
      this.victoryBannerBg.destroy();
      this.victoryBannerBg = null;
    }
  }
}
