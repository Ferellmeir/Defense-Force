import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import RPGManager from '../systems/RPGManager.js';
import ConfirmationDialog from '../helpers/ConfirmationDialog.js';
import { preloadUiAssets } from '../helpers/uiAssets.js';
import { FACTIONS, displayFactionName } from '../utils/factions.js';
import { MISSION_TYPE_NAMES } from '../systems/missionBoard.js';
import { getFactionEnvironment } from '../systems/missionEnvironments.js';
import { getMissionCardBounds, getMissionGridLayout } from '../systems/missionScreenLayout.js';
import { getCoverDisplaySize, MISSION_SELECTION_BACKGROUND } from '../utils/screenBackgrounds.js';

const COLORS = { gold: '#ffe27a', pale: '#d8e6ef', muted: '#91a4b5' };
const DIFFICULTY_NAMES = { EASY: '1', NORMAL: '2', HARD: '3', EXPERT: '4', INSANE: '5' };

export default class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelectScene'); }

  preload() {
    preloadUiAssets(this);
    if (!this.textures.exists('mission_selection_background')) {
      this.load.image('mission_selection_background', `assets/images/${MISSION_SELECTION_BACKGROUND}`);
    }
  }

  create() {
    import('../systems/AudioManager.js').then(({ default: AudioManager }) => AudioManager.stopGlobalMusic(this, 'bgm'));
    this.rpgManager = new RPGManager(this);
    this.missions = this.rpgManager.getAvailableMissions();
    this.selectedMission = null;
    this.missionLayout = getMissionGridLayout(this.scale.width, this.scale.height);
    this.cameras.main.setBackgroundColor('#101923');
    const backgroundSource = this.textures.get('mission_selection_background').getSourceImage();
    const backgroundSize = getCoverDisplaySize(backgroundSource.width, backgroundSource.height, this.scale.width, this.scale.height);
    this.add.image(this.scale.width / 2, this.scale.height / 2, 'mission_selection_background')
      .setDisplaySize(backgroundSize.width, backgroundSize.height);
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101923, 0.54);
    this.add.image(this.scale.width / 2, this.scale.height / 2, 'ui_panel_9').setDisplaySize(this.scale.width, this.scale.height).setAlpha(0.16);
    this.add.text(this.scale.width / 2, 27, 'AVAILABLE MISSIONS', { fontSize: '27px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.addButton(26, 20, 'Back to Hub', () => this.scene.start('MainHubScene'));
    this.add.image(this.scale.width - 276, 26, 'ui_icon_credits').setDisplaySize(18, 22);
    this.add.text(this.scale.width - 254, 19, `${fmt(this.rpgManager.state.credits)} Cr`, { fontSize: '15px', color: COLORS.gold });
    const hasProgress = Object.keys(this.rpgManager.state.units).length > 0
      || this.rpgManager.state.inventory.length > 0 || this.rpgManager.state.credits !== 200
      || Object.keys(this.rpgManager.state.influence).length > 0;
    this.addButton(this.scale.width - 112, 18, hasProgress ? 'Restart' : 'New Game', () => this.confirmRestart(), {
      fontSize: '11px', background: '#743b3b', padX: 7, padY: 5,
    });
    this.add.text(28, 65, `TURN ${this.rpgManager.state.turnNumber + 1} - Choose from three offers for each faction`, { fontSize: '13px', color: COLORS.muted });
    this.missionCards = this.add.container(0, 0);
    this.add.rectangle(this.scale.width / 2, this.missionLayout.detailsTop + this.missionLayout.detailsHeight / 2,
      this.scale.width - 48, this.missionLayout.detailsHeight, 0x0b1722, 0.96).setStrokeStyle(1, 0x315267);
    this.details = this.add.text(38, this.missionLayout.detailsTop + 7, 'Select a mission to inspect its rules and environment.', {
      fontSize: '13px', color: COLORS.pale, wordWrap: { width: this.scale.width - 76 }, lineSpacing: 2,
    });
    this.prepareButton = this.addButton(this.scale.width / 2, this.missionLayout.prepareY,
      'Select a mission first', () => this.prepareMission(), { fontSize: '18px' }).setOrigin(0.5);
    this.drawMissions();
  }

  addButton(x, y, label, callback, style = {}) {
    const button = this.add.text(x, y, label, {
      fontSize: style.fontSize || '14px', color: '#ffffff',
      backgroundColor: style.background || '#245b66', padding: { x: style.padX || 10, y: style.padY || 7 },
    }).setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    return button;
  }

  drawMissions() {
    this.missionCards.removeAll(true);
    const offers = FACTIONS.flatMap(faction => this.missions.filter(mission => mission.faction === faction).slice(0, 3));
    offers.forEach((mission, index) => {
      const bounds = getMissionCardBounds(index, this.scale.width, this.scale.height);
      const environment = getFactionEnvironment(mission.faction);
      const selected = this.selectedMission?.id === mission.id;
      const card = this.add.rectangle(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2,
        bounds.width, bounds.height, selected ? 0x213b4e : 0x142536, 0.98)
        .setStrokeStyle(2, selected ? 0xffe27a : 0x315267).setInteractive({ useHandCursor: true });
      this.missionCards.add(card);

      const dynamic = mission.missionType === 'DYNAMIC_ENGAGEMENT';
      const restrictions = dynamic
        ? '3 map-specific restrictions revealed in-mission'
        : mission.restrictions.length ? mission.restrictions.map(restriction => restriction.label).join(' - ') : 'None';
      const offerNumber = (Number(mission.offerIndex) || 0) + 1;
      const textX = bounds.x + 12;
      this.missionCards.add(this.add.text(textX, bounds.y + 6,
        `${displayFactionName(mission.faction)} - Mission ${offerNumber}`, { fontSize: '12px', color: COLORS.gold, fontStyle: 'bold' }));
      this.missionCards.add(this.add.text(textX, bounds.y + 25,
        `${MISSION_TYPE_NAMES[mission.missionType] || mission.missionType} - Difficulty ${DIFFICULTY_NAMES[mission.difficulty] || mission.difficulty} - ${mission.wavesPerMap} wave(s)${dynamic ? ' per map' : ''}`,
        { fontSize: '11px', color: COLORS.pale, wordWrap: { width: bounds.width - 24 } }));
      this.missionCards.add(this.add.text(textX, bounds.y + 45,
        `Environment: ${mission.environmentLabel || environment.label}`,
        { fontSize: '10px', color: COLORS.muted, wordWrap: { width: bounds.width - 24 } }));
      this.missionCards.add(this.add.text(textX, bounds.y + 64,
        `Restrictions: ${restrictions} - Reward x${fmt(mission.rewardMultiplier)}`,
        { fontSize: '10px', color: COLORS.pale, wordWrap: { width: bounds.width - 24 }, lineSpacing: 1 }));

      card.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation?.();
        this.selectedMission = mission;
        this.drawMissions();
        this.updateDetails();
      });
    });
    if (!offers.length) this.missionCards.add(this.add.text(40, this.missionLayout.top, 'No mission offers are available.', { fontSize: '15px', color: COLORS.muted }));
  }

  updateDetails() {
    const mission = this.selectedMission;
    if (!mission) {
      this.details.setText('Select a mission to inspect its rules and environment.');
      this.prepareButton.setText('Select a mission first');
      return;
    }
    const restrictionText = mission.missionType === 'DYNAMIC_ENGAGEMENT'
      ? 'Each map has a different restriction. It is revealed when that map begins.'
      : mission.restrictions.length ? mission.restrictions.map(restriction => `- ${restriction.label}`).join('\n') : 'No restrictions.';
    const typeDescription = {
      SECURE_REGION: 'Protect-zone toughness: 10.',
      BARRICADE: `Barricade health: 100 - toughness: 1 - ${mission.wavesPerMap} waves.`,
      GAUNTLET: 'Waves automatically start with a one-second delay. Pause and manual wave controls are disabled. Toughness: 15.',
      DYNAMIC_ENGAGEMENT: 'Three sequential maps. Each map starts fresh, with five protected-zone toughness. Any map loss fails the mission.',
    }[mission.missionType];
    const environment = mission.environmentLabel || getFactionEnvironment(mission.faction).label;
    const mapCount = mission.missionType === 'DYNAMIC_ENGAGEMENT' ? `${mission.mapKeys.length} sequential maps` : '1 map';
    this.details.setText(`${displayFactionName(mission.faction)} - ${MISSION_TYPE_NAMES[mission.missionType]} - Difficulty ${DIFFICULTY_NAMES[mission.difficulty]} - ${mapCount}\nEnvironment: ${environment}\n${typeDescription}\n${restrictionText}\nLaunch wages and equipment maintenance are calculated from your current deployment.`);
    this.prepareButton.setText('Prepare Deployment');
  }

  prepareMission() {
    if (!this.selectedMission) return;
    this.registry.set('selectedMission', this.selectedMission);
    this.registry.set('missionFaction', this.selectedMission.faction);
    this.registry.set('missionEnvironmentKey', this.selectedMission.environmentKey || getFactionEnvironment(this.selectedMission.faction).key);
    this.registry.set('selectedDifficulty', this.selectedMission.difficulty);
    this.registry.set('selectedMap', this.selectedMission.mapKeys[0]);
    this.registry.set('missionMapIndex', 0);
    this.registry.set('missionRestriction', this.selectedMission.restrictionsByMap?.[0] || this.selectedMission.restrictions || []);
    this.registry.set('missionRewardMultiplier', this.selectedMission.rewardMultiplier);
    this.registry.set('missionSeed', this.selectedMission.mapSeeds[0]);
    this.registry.set('missionRunId', this.selectedMission.id);
    this.registry.set('miniBossSpawnState', { missionRunId: this.selectedMission.id, chance: 20, outcomes: {} });
    this.registry.set('deploymentReturnScene', 'MapSelectScene');
    this.scene.start('DeploymentScene');
  }

  confirmRestart() {
    new ConfirmationDialog(this, {
      message: 'Start a new game? This will permanently erase your current campaign save.',
      width: 520, height: 220,
      onConfirm: () => { this.rpgManager.startNewGame(); this.scene.restart(); },
    }).show();
  }
}
