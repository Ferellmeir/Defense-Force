import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import MapManager from '../systems/MapManager.js';
import RPGManager from '../systems/RPGManager.js';
import ConfirmationDialog from '../helpers/ConfirmationDialog.js';
import { preloadUiAssets } from '../helpers/uiAssets.js';

export default class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelectScene');
    this.MAP_KEYS = ['forest', 'desert', 'mountain'];
    this.DIFFICULTY_KEYS = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'INSANE'];
    this.selectedDifficulty = 'EASY'; // Default difficulty
  }

  preload() {
    preloadUiAssets(this);
    // Preload map JSONs for preview
    this.mapManager = new MapManager(this);
    this.mapManager.preloadMaps(this.MAP_KEYS);
  }

  create() {
    // Stop global background music if playing when entering map select/home
    import('../systems/AudioManager.js').then(({ default: AudioManager }) => {
      AudioManager.stopGlobalMusic(this, 'bgm');
    });

    this.mapManager.createMaps(this.MAP_KEYS);
    this.rpgManager = new RPGManager(this);
    this.registry.set('selectedUnit', null);

    // Set intro background when entering map select
    if (window.setIntroBackground) window.setIntroBackground();

    // Game title and mission briefing
    this.add
      .text(640, 55, 'SCI-FI TOWER DEFENSE RPG', {
        fontSize: '48px',
        fill: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(320, 125, 'MISSION BRIEFING', {
        fontSize: '17px',
        fill: '#ffe27a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(320, 165,
        'Defend the protected zone from enemy waves on procedurally generated, winding routes. Deploy your owned units on eligible tiles beside the path; prepare their weapons and equipment, then use their roles, targeting, and tile effects to build your defense. Win missions to earn credits, faction influence, and possible equipment or unit rewards for future deployments.',
        {
          fontSize: '15px',
          fill: '#fff',
          align: 'center',
          wordWrap: { width: 590 },
          lineSpacing: 3,
        })
      .setOrigin(0.5);

    this.add
      .text(320, 230, 'Select a Mission Map', {
        fontSize: '22px',
        fill: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Map selection
    const mapStartY = 270;
    const mapSpacing = 65;
    this.mapButtons = [];

    this.MAP_KEYS.forEach((key, idx) => {
      const mapData = this.mapManager.getMap(key);
      const y = mapStartY + idx * mapSpacing;

      // Map name
      this.add
        .text(200, y, mapData ? mapData.name : key, {
          fontSize: '22px',
          fill: '#fff',
        })
        .setOrigin(0, 0.5);

      // Simple preview (theme)
      this.add
        .text(390, y, mapData ? `Terrain: ${mapData.theme}` : '', {
          fontSize: '19px',
          fill: '#ddd',
        })
        .setOrigin(0, 0.5);

      // Select button
      const btn = this.add
        .rectangle(650, y, 160, 60, 0x008800, 0.7)
        .setInteractive()
        .setOrigin(0.5);
      this.add
        .text(650, y, 'Select', {
          fontSize: '22px',
          fill: '#fff',
        })
        .setOrigin(0.5);
      if (key == 'forest') {
        btn.setStrokeStyle(2, 0xffffff);
      }
      btn.on('pointerdown', () => {
        this.selectMap(key);
      });

      this.mapButtons.push(btn);
    });

    this.add.image(770, 257, 'ui_icon_credits').setDisplaySize(28, 32);
    this.add.text(790, 245, `Credits: ${fmt(this.rpgManager.state.credits, 'floor')}`, { fontSize: '24px', fill: '#ffe27a' });
    const storeButton = this.add.rectangle(850, 330, 300, 70, 0x245b66, 0.95).setInteractive({ useHandCursor: true });
    this.add.text(850, 330, 'Store', { fontSize: '27px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    storeButton.on('pointerdown', () => this.scene.start('StoreScene'));
    const deploymentButton = this.add.rectangle(850, 420, 300, 70, 0x245b66, 0.95).setInteractive({ useHandCursor: true });
    this.add.text(850, 420, 'Deployment', { fontSize: '27px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    deploymentButton.on('pointerdown', () => this.scene.start('DeploymentScene'));
    const hasProgress = Object.keys(this.rpgManager.state.units).length > 0
      || this.rpgManager.state.inventory.length > 0
      || this.rpgManager.state.credits !== 200
      || Object.keys(this.rpgManager.state.influence).length > 0;
    const restartButton = this.add.rectangle(850, 140, 300, 54, 0x8b2525, 0.95).setInteractive({ useHandCursor: true });
    this.add.image(735, 140, 'ui_restart').setDisplaySize(30, 30);
    this.add.text(870, 140, hasProgress ? 'Restart Game' : 'New Game', { fontSize: '22px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    restartButton.on('pointerdown', () => {
      const confirmation = new ConfirmationDialog(this, {
        message: 'Start a new game? This will permanently erase your current campaign save.',
        width: 520,
        height: 220,
        onConfirm: () => {
          this.rpgManager.startNewGame();
          this.registry.set('storeStock', null);
          this.registry.set('storeRestockCost', 15);
          this.scene.restart();
        },
      });
      confirmation.show();
    });

    // Difficulty selection title
    this.add
      .text(640, 505, 'Select Difficulty', {
        fontSize: '22px',
        fill: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Difficulty buttons
    const difficultyStartX = 240;
    const difficultySpacing = 200;
    this.difficultyButtons = [];

    this.DIFFICULTY_KEYS.forEach((key, idx) => {
      const difficultyData = window.GAME_SETTINGS.DIFFICULTY[key];
      const x = difficultyStartX + idx * difficultySpacing;

      // Get color based on difficulty
      let btnColor;
      switch (key) {
        case 'EASY':
          btnColor = 0x00aa00;
          break; // Green
        case 'NORMAL':
          btnColor = 0x0088cc;
          break; // Blue
        case 'HARD':
          btnColor = 0xaaaa00;
          break; // Yellow
        case 'EXPERT':
          btnColor = 0xdd6600;
          break; // Orange
        case 'INSANE':
          btnColor = 0xcc0000;
          break; // Red
        default:
          btnColor = 0x888888;
      }

      // Difficulty button
      const btn = this.add
      .rectangle(x, 565, 160, 60, btnColor, 0.7)
        .setInteractive()
        .setOrigin(0.5);

      // Difficulty name
      this.add
        .text(x, 565, difficultyData.name, {
          fontSize: '24px',
          fill: '#fff',
        })
        .setOrigin(0.5);

      // Highlight selected difficulty
      if (key === this.selectedDifficulty) {
        btn.setStrokeStyle(2, 0xffffff);
      }

      btn.on('pointerdown', () => {
        this.selectDifficulty(key);
      });

      this.difficultyButtons.push({ button: btn, key: key });
    });

    // Continue to mission preparation
    this.startButton = this.add
      .rectangle(640, 665, 240, 80, 0x008800, 0.8)
      .setInteractive()
      .setOrigin(0.5);

    this.add
      .text(640, 665, 'Prepare Deployment', {
        fontSize: '27px',
        fill: '#fff',
      })
      .setOrigin(0.5);

    this.startButton.on('pointerdown', () => {
      this.startGame();
    });

    // Keyboard navigation (1/2/3 for maps)
    this.input.keyboard.on('keydown-ONE', () =>
      this.selectMap(this.MAP_KEYS[0])
    );
    this.input.keyboard.on('keydown-TWO', () =>
      this.selectMap(this.MAP_KEYS[1])
    );
    this.input.keyboard.on('keydown-THREE', () =>
      this.selectMap(this.MAP_KEYS[2])
    );
  }

  selectMap(mapKey) {
    this.registry.set('selectedMap', mapKey);
    // Highlight the selected map button
    this.mapButtons.forEach((btn, idx) => {
      if (this.MAP_KEYS[idx] === mapKey) {
        btn.setFillStyle(0x00aa00, 0.9);
        btn.setStrokeStyle(2, 0xffffff);
      } else {
        btn.setFillStyle(0x008800, 0.7);
        btn.setStrokeStyle(0);
      }
    });
  }

  selectDifficulty(difficultyKey) {
    this.selectedDifficulty = difficultyKey;
    this.registry.set('selectedDifficulty', difficultyKey);

    // Update button appearances
    this.difficultyButtons.forEach((item) => {
      if (item.key === difficultyKey) {
        item.button.setStrokeStyle(2, 0xffffff);
      } else {
        item.button.setStrokeStyle(0);
      }
    });
  }

  updatePreparationUI() {
    // Mission preparation now lives in DeploymentScene.
  }

  startGame() {
    if (!this.registry.get('selectedMap')) {
      this.selectMap(this.MAP_KEYS[0]);
    }
    if (!this.registry.get('selectedDifficulty')) {
      this.registry.set('selectedDifficulty', this.selectedDifficulty);
    }
    if (window.setGameBackground) {
      window.setGameBackground(this.registry.get('selectedMap'));
    }
    this.scene.start('DeploymentScene');
  }
}
