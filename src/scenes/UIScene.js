import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import UIButton from '../helpers/UIButton.js';
import ConfirmationDialog from '../helpers/ConfirmationDialog.js';
import { getPriceColor, setButtonAffordability } from '../helpers/UIHelpers.js';
import { selectUnitForPlacement } from '../systems/unitPlacementMode.js';
import { CLEAR_TILE_FORCE_COST } from '../systems/tileClearing.js';
import { preloadUiAssets } from '../helpers/uiAssets.js';
import { displayFactionName } from '../utils/factions.js';
import { getActiveUnitCombatEffects, getUnitCardCombatProfiles, getUnitCardEquipment, getUnitCardUpgradeColumns } from '../systems/unitCardData.js';

// General dialog style config for confirmation dialogs
const DIALOG_STYLE = {
  width: 420,
  height: 210,
  backgroundColor: 0x000000,
  backgroundAlpha: 0.6,
  borderColor: 0xffd700,
  borderThickness: 0,
  borderRadius: 16,
  padding: 32,
  fontFamily: 'courier',
  fontSize: 17,
  fontColor: '#fffbe7',
  buttonStyle: {
    backgroundColor: 0x009900, // MATCH Start Wave button
    backgroundAlpha: 1,
    borderColor: 0xffffff,
    borderThickness: 0,
    borderRadius: 10,
    fontFamily: 'courier',
    fontSize: 20,
    fontColor: '#fffbe7',
    hoverColor: 0x00aa00 // Lighter green for hover, matches pointerover in wave button
  }
};

// Centralized style config for all in-game messages (edit here for global changes)
const MESSAGE_STYLE = {
  fontSize: '22px',
  fontFamily: 'courier',
  color: '#fffbe7',
  backgroundColor: 0x000000,
  backgroundAlpha: 0.6,
  borderRadius: 8,
  padding: 16,
  width: 400,
  height: 100,
};

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');

    // UI state
    this.lives = 0;
    this.escapes = 0;
    this.money = 0;
    this.wave = 0;
    this.selectedUnit = 'RANGER';

    // UI elements
    this.livesText = null;
    this.moneyText = null;
    this.waveText = null;
    this.messageText = null;
    this.towerButtons = [];
    this.lowerBarContainer = null;
    this.lowerBarVisible = true;
    this.isGameStopped = true;

    // Store the current tower for live updates in the upgrade panel
    this.currentTowerForUpgradePanel = null;
    this._boundUpgradePanelGoldListener = null;
    this.missionResultObjects = [];
    this.tileClearConfirmDialog = null;
    this.tileClearConfirmCallbacks = null;
  }

  /**
   * Preload UI assets
   */
  preload() {
    preloadUiAssets(this);
  }

  /**
   * Show tower info panel when a tower is selected
   * @param {Tower} tower - The selected tower instance
   */
  showTowerInfo(tower) {
    // Defensive: skip if tower or tower.towerData is null
    if (!tower || !tower.towerData) {
      console.warn('[UIScene] showTowerInfo called with null/invalid tower:', tower);
      return;
    }
    // Remove existing panel if present
    if (this.towerInfoPanel) {
      this.towerInfoPanel.destroy(true);
    }
    this.combatCardTimer?.remove();
    this.combatCardTimer = null;
    this.stopAmmoDisplayTimer();

    // Store the current tower for live updates
    this.currentTowerForUpgradePanel = tower;

    // Panel background
    const panelWidth = Math.min(820, this.scale.width - 40);
    const panelHeight = Math.min(650, this.scale.height - 40);
    const panelX = Math.max(20, this.scale.width - panelWidth - 20);
    const panelY = Math.max(20, Math.min(50, this.scale.height - panelHeight - 20));
    const panelBg = this.add.rectangle(
      0,
      0,
      panelWidth,
      panelHeight,
      0x222244,
      0.95
    );
    panelBg.setOrigin(0, 0);
    console.log('[TowerInfoPanel] Creating panelBg, calling setInteractive');
    panelBg.setInteractive();
    panelBg.on('pointerdown', (pointer) => {
      console.log('[TowerInfoPanel] panelBg pointerdown', pointer);
    });
    console.log('[TowerInfoPanel] panelBg depth:', panelBg.depth, 'input:', panelBg.input);

    // Create the panel container
    this.towerInfoPanel = this.add.container(panelX, panelY);
    this.towerInfoPanel.add(panelBg);
    console.log('[TowerInfoPanel] towerInfoPanel depth:', this.towerInfoPanel.depth);

    // Tower name
    const nameText = this.add.text(
      20,
      12,
      `Unit: ${tower.towerData.name || tower.type}`,
      {
        fontSize: '20px',
        fill: '#ffffff',
        fixedWidth: panelWidth - 90,
        wordWrap: { width: panelWidth - 90 },
      }
    );
    this.towerInfoPanel.add(nameText);

    // Tower level
    const levelText = this.add.text(
      20,
      43,
      `Level: ${fmt(tower.towerData.level || tower.level)}   Rank: ${fmt(tower.towerData.rank || 1)}`,
      {
        fontSize: '18px',
        fill: '#ffff00',
      }
    );
    this.towerInfoPanel.add(levelText);

    const combatHeading = this.add.text(20, 78, 'LIVE COMBAT PROFILE', { fontSize: '13px', fill: '#7de8ff', fontStyle: 'bold' });
    const statsText = this.add.text(20, 99, '', {
      fontSize: '12px', fill: '#ffffff', lineSpacing: 2,
      fixedWidth: Math.floor(panelWidth * 0.52) - 40,
      wordWrap: { width: Math.floor(panelWidth * 0.52) - 40 },
    });
    this.towerInfoPanel.add([combatHeading, statsText]);

    const equipmentHeading = this.add.text(Math.floor(panelWidth * 0.54), 78, 'EQUIPMENT', { fontSize: '13px', fill: '#7de8ff', fontStyle: 'bold' });
    const equipmentText = this.add.text(Math.floor(panelWidth * 0.54), 99, '', {
      fontSize: '12px', fill: '#d8e6ef', lineSpacing: 3,
      fixedWidth: Math.floor(panelWidth * 0.44) - 24,
      wordWrap: { width: Math.floor(panelWidth * 0.44) - 24 },
    });
    this.towerInfoPanel.add([equipmentHeading, equipmentText]);

    const liveEffectsText = this.add.text(20, 218, '', { fontSize: '11px', fill: '#a6efb1', wordWrap: { width: panelWidth - 40 } });
    const ammoText = this.add.text(20, 238, '', { fontSize: '11px', fill: '#ffd27d', wordWrap: { width: panelWidth - 40 } });
    this.towerInfoPanel.add(liveEffectsText);
    this.towerInfoPanel.add(ammoText);
    const gameScene = this.scene.get('GameScene');
    const manager = gameScene.rpgManager;
    const refreshCombatCard = () => {
      if (!this.towerInfoPanel || this.currentTowerForUpgradePanel !== tower || !tower.towerData) return;
      const now = Number(gameScene.gameTime || 0);
      const profileText = getUnitCardCombatProfiles(tower, now, gameScene.towerManager?.getAll?.().length || 1).map(profile => {
        const ammo = profile.unlimitedAmmo ? 'unlimited ammo'
          : Number.isFinite(profile.ammoRemaining) ? `${fmt(profile.ammoRemaining)}/${fmt(profile.ammoCapacity)} ammo` : null;
        const values = [
          `${fmt(profile.damage)} profile damage/hit`,
          `${fmt(profile.interval / 1000)}s interval`,
          `${fmt(profile.range)} range`,
          `${fmt(profile.criticalChance * 100)}% crit · ×${fmt(profile.criticalModifier)}`,
          Number(profile.armorPenetration) ? `${fmt(profile.armorPenetration * 100)}% armor penetration` : null,
          profile.reload !== null ? `${fmt(profile.reload)}ms reload` : null,
          ammo,
          Number(profile.aoeRadius) > 0 ? `${fmt(profile.aoeRadius)} AoE` : null,
          profile.statusEffects.length ? `applies ${profile.statusEffects.join(', ')}` : null,
        ].filter(Boolean).join(' · ');
        return `${profile.name} (${profile.damageType} ${profile.attackType})\n${values}`;
      });
      statsText.setText(profileText.join('\n\n') || 'No active weapon or inherent attacks.');

      const effects = getActiveUnitCombatEffects(tower, now);
      liveEffectsText.setText(effects.length ? `Active effects: ${effects.map(effect => `${effect.label}${effect.remaining !== undefined ? ` (${fmt(effect.remaining)}s left)` : ''}`).join(' · ')}` : '');

      const getEquipmentLine = (slot, item) => {
        if (!item) return `${slot}: Empty`;
        const details = [
          item.type === 'weapon' ? `${item.hands || 1}-hand ${item.attackType || 'weapon'}` : item.type,
          item.damage !== undefined ? `${fmt(item.damage)} damage` : null,
          item.range !== undefined ? `${fmt(item.range)} range` : null,
          item.attacksPerSecond > 0 ? `${fmt(item.attacksPerSecond)} attacks/s` : null,
        ].filter(Boolean).join(' · ');
        return `${slot}: ${item.name}${details ? ` (${details})` : ''}`;
      };
      equipmentText.setText(getUnitCardEquipment(tower, manager)
        .map(row => getEquipmentLine(row.slot, row.item)).join('\n'));
    };
    refreshCombatCard();
    this.combatCardTimer = this.time.addEvent({ delay: 250, loop: true, callback: refreshCombatCard });
    const updateAmmoText = () => {
      refreshCombatCard();
      const gameScene = this.scene.get('GameScene');
      const attackState = tower.weaponAttackStates?.[0];
      const hasEquippedWeapon = attackState?.profile?.weaponId
        && tower.equipment?.weapons?.some(weapon => weapon?.id === attackState.profile.weaponId);
      const hasValidAmmoState = !this.isGameStopped
        && !gameScene.isGameOver
        && this.towerInfoPanel
        && this.currentTowerForUpgradePanel === tower
        && tower.active
        && tower.towerData
        && hasEquippedWeapon
        && attackState.ammoMagazine
        && tower.ammoMagazine === attackState.ammoMagazine;

      if (!hasValidAmmoState) {
        ammoText.setText('');
        ammoText.setVisible(false);
        this.stopAmmoDisplayTimer();
        return;
      }

      ammoText.setVisible(true);
      const ammo = tower.ammoConfigurationMissing
        ? 'Ammo configuration missing: magazine capacity or reload speed'
        : Number.isFinite(tower.ammoRemaining)
        ? `Ammo: ${fmt(tower.ammoRemaining)} / ${fmt(tower.magazineCapacity)}`
        : 'Ammo: Unlimited';
      const reload = tower.getReloadRemaining();
      ammoText.setText(!tower.ammoConfigurationMissing && reload > 0 ? `${ammo}\nReloading: ${fmt(reload)}ms` : ammo);
    };
    updateAmmoText();
    this.reloadDisplayTimer = this.time.addEvent({ delay: 100, loop: true, callback: updateAmmoText });

    const targetingButton = this.add.text(20, 277, 'Cycle Targeting', {
      fontSize: '14px', fill: '#7de8ff', backgroundColor: '#163d52', padding: 6,
    }).setInteractive();
    targetingButton.on('pointerdown', () => {
      tower.cycleTargetingMode();
      refreshCombatCard();
    });
    this.towerInfoPanel.add(targetingButton);

    const sellButton = this.add.text(205, 277, '', {
      fontSize: '14px', fill: '#ffe27a', backgroundColor: '#5a3426', padding: 6,
    }).setInteractive({ useHandCursor: true });
    const updateSellButton = () => sellButton.setText(`Sell (+${fmt(tower.getSellForceRefund())} Force)`);
    updateSellButton();
    sellButton.on('pointerdown', () => {
      if (!tower.isSold) tower.sell();
      this.hideTowerInfo();
    });
    this.towerInfoPanel.add(sellButton);

    const pathTiers = getUnitCardUpgradeColumns(gameScene.rpgManager.getPathChoiceState(tower.characterId, tower));
    this.towerInfoPanel.add(this.add.text(20, 311,
      `Veterancy ${fmt(tower.veterancy)} · XP ${fmt(tower.experience)}/${fmt(tower.getVeterancyXpRequirement())} · Force ${fmt(gameScene.economyManager.getForce())} · Next upgrade ${fmt(tower.getVeterancyForceCost(), 'floor')} Force`,
      { fontSize: '12px', fill: '#d8e6ef', wordWrap: { width: panelWidth - 40 } }));
    const columnsX = 20;
    const columnGap = 8;
    const columnWidth = (panelWidth - 40 - columnGap * 2) / 3;
    const columnY = 339;
    const columnHeight = panelHeight - columnY - 12;
    pathTiers.forEach((tier, index) => {
      const x = columnsX + index * (columnWidth + columnGap);
      const column = this.add.rectangle(x, columnY, columnWidth, columnHeight, tier.unlocked ? 0x142b3b : 0x202832, 0.98)
        .setOrigin(0).setStrokeStyle(1, tier.unlocked ? 0x4c829b : 0x59636b);
      this.towerInfoPanel.add(column);
      this.towerInfoPanel.add(this.add.text(x + 8, columnY + 7,
        `TIER ${fmt(tier.tier)} · ${tier.unlocked ? `${fmt(tier.completed)}/${fmt(tier.limit)} complete` : 'LOCKED'}`,
        { fontSize: '12px', fill: tier.unlocked ? '#7de8ff' : '#91a4b5', fontStyle: 'bold', fixedWidth: columnWidth - 16 }));
      const paths = tier.paths || [];
      const rowHeight = Math.min(91, (columnHeight - 38) / Math.max(paths.length, 1));
      paths.forEach((path, pathIndex) => {
        const status = path.abandoned ? 'ABANDONED' : path.selected ? 'COMMITTED' : path.available ? 'AVAILABLE' : 'LOCKED';
        const y = columnY + 33 + pathIndex * rowHeight;
        const upgrades = (path.upgrades || []).map(upgrade => upgrade.name).filter(Boolean);
        const body = `${path.name}\nRank ${fmt(path.level)}/3 · ${status}${upgrades.length ? `\n${upgrades.slice(0, 3).join(' · ')}` : ''}${path.available ? `\nChoose · ${fmt(tower.getVeterancyForceCost(), 'floor')} Force` : ''}`;
        const choice = this.add.text(x + 7, y, body, {
          fontSize: '11px', fill: path.selected ? '#ffe27a' : path.available ? '#ffffff' : '#91a4b5',
          backgroundColor: path.selected ? '#493f20' : path.available ? '#245b66' : '#18232c',
          padding: { x: 5, y: 4 }, fixedWidth: columnWidth - 14, fixedHeight: rowHeight - 3,
          wordWrap: { width: columnWidth - 24 }, lineSpacing: 1,
        });
        if (path.available) {
          choice.setInteractive({ useHandCursor: true });
          choice.on('pointerdown', () => {
            const forceCost = tower.getVeterancyForceCost();
            if (!tower.spendVeterancy(path.id)) {
              this.showMessage(`Need ${fmt(forceCost, 'floor')} Force and ${fmt(tower.getVeterancyXpRequirement())} XP.`, 1800);
              return;
            }
            this.showTowerInfo(tower);
          });
        }
        this.towerInfoPanel.add(choice);
      });
    });

    // Close button
    const closeBtn = this.add.rectangle(panelWidth - 40, 10, 30, 30, 0x444444);
    closeBtn.setOrigin(0, 0);
    closeBtn.setInteractive();
    const closeX = this.add.text(panelWidth - 25, 25, 'X', {
      fontSize: '18px',
      fill: '#ffffff',
    });
    closeX.setOrigin(0.5, 0.5);
    this.towerInfoPanel.add(closeBtn);
    this.towerInfoPanel.add(closeX);
    closeBtn.on('pointerdown', () => {
      const audioManager = this.scene.get('GameScene').audioManager;
      if (audioManager) audioManager.playSound('ui_click');
      this.hideTowerInfo();
    });

    this.uiContainer.add(this.towerInfoPanel);

    // --- Listen for gold changes to update upgrade button state live ---
    if (!this._boundUpgradePanelGoldListener) {
      this._boundUpgradePanelGoldListener = this._onUpgradePanelGoldChanged.bind(this);
    }
    gameScene.events.on('updateUI', this._boundUpgradePanelGoldListener);
  }

  /**
   * Remove tower info panel if present
   */
  hideTowerInfo() {
    if (this.towerInfoPanel) {
      this.towerInfoPanel.destroy(true);
      this.towerInfoPanel = null;
    }
    // Remove gold change listener for upgrade panel
    const gameScene = this.scene.get('GameScene');
    if (this._boundUpgradePanelGoldListener) {
      gameScene.events.off('updateUI', this._boundUpgradePanelGoldListener);
    }
    // Remove all pointer events from upgradeBtn if present
    if (this.upgradeBtn) {
      this.upgradeBtn.removeAllListeners && this.upgradeBtn.removeAllListeners();
      this.upgradeBtn = null;
    }
    this.currentTowerForUpgradePanel = null;
    this.combatCardTimer?.remove();
    this.combatCardTimer = null;
    this.stopAmmoDisplayTimer();
  }

  stopAmmoDisplayTimer() {
    if (!this.reloadDisplayTimer) return;
    this.reloadDisplayTimer.remove();
    this.reloadDisplayTimer = null;
  }

  /**
   * Live-update the upgrade button and price color if the panel is open and money changes
   */
  _onUpgradePanelGoldChanged(data) {
    if (!this.towerInfoPanel || !this.upgradeBtn || !this.upgradeText || !this.currentTowerForUpgradePanel) return;
    if (data.money === undefined) return;

    // Recalculate upgrade cost and affordability
    const tower = this.currentTowerForUpgradePanel;
    let canUpgrade = typeof tower.upgrade === 'function' && (!tower.maxLevel || tower.level < tower.maxLevel);
    let upgradeCost = 0;
    if (canUpgrade) {
      if (typeof tower.calculateUpgradeCost === 'function') {
        upgradeCost = tower.calculateUpgradeCost();
      } else {
        upgradeCost = Math.floor(tower.towerData.cost * 0.5);
      }
    }
    const canAffordUpgrade = data.money >= upgradeCost;

    // Update price color
    this.upgradeText.setFill(getPriceColor(canUpgrade && canAffordUpgrade));
    // Update button state
    setButtonAffordability(this.upgradeBtn, canAffordUpgrade, 0x00aa00, 0x888888);
  }

  create() {
    // Register shutdown handler for cleanup
    this.events.on('shutdown', this.shutdown, this);
    this.isGameStopped = this.scene.get('GameScene').isGameOver;

    // Get initial values
    this.lives = window.GAME_SETTINGS.PLAYER.lives;
    const gameScene = this.scene.get('GameScene');
    this.money = gameScene.economyManager.getMoney();
    this.force = gameScene.economyManager.getForce();
    this.wave = 0;

    // Create UI container
    this.uiContainer = this.add.container(0, 0);

    // --- Top bar background ---
    this.topBarBackground = this.add.rectangle(0, 0, 1280, 80, 0x222222);
    this.topBarBackground.setOrigin(0, 0);
    this.topBarBackground.setAlpha(0.8);
    this.topBarBackground.setDepth(10);
    this.uiContainer.add(this.topBarBackground);

    // Create top-right buttons container (always new)
    this.topRightButtonsContainer = this.add.container(0, 0);
    this.topRightButtonsContainer.setDepth(20);
    this.uiContainer.add(this.topRightButtonsContainer);

    // --- Lower bar container for fade effect ---
    this.lowerBarContainer = this.add.container(0, 0);
    this.lowerBarContainer.setAlpha(1);
    this.uiContainer.add(this.lowerBarContainer);

    // Create UI background
    this.createUIBackground();
    // Create status displays
    this.createStatusDisplays();
    // Create tower selection buttons
    this.createTowerButtons();
    // Create wave control button
    this.createWaveButton();
    this.createSpecialTileControls();
    // Create message display
    this.createMessageDisplay();
    // Create UI buttons (mute, return home)
    this.createUIButtons();
    // Listen for game events
    this.setupEventListeners();
    const missionRestrictions = gameScene.registry.get('missionRestriction') || [];
    const mission = gameScene.registry.get('selectedMission');
    if (mission?.missionType === 'DYNAMIC_ENGAGEMENT' && missionRestrictions[0]?.label) {
      this.showMessage(`Map ${Number(gameScene.registry.get('missionMapIndex') || 0) + 1}/3 restriction: ${missionRestrictions[0].label}`, 5000);
    } else if (missionRestrictions.length) {
      this.showMessage(`Mission restriction: ${missionRestrictions.map(restriction => restriction.label).join(', ')}`, 5000);
    }
    this.updateTowerButtonStates();
    // Always show lower bar
    this.lowerBarVisible = true;
    if (this.lowerBarContainer) this.lowerBarContainer.setAlpha(1);

    // Pointer events for fade in/out on hover
    // this.input.on('pointermove', (pointer) => {
    //   if (!this.isWaveActive()) return;
    //   const y = pointer.y;
    //   if (y >= 620 && !this.lowerBarVisible) {
    //     this.showLowerBar();
    //   } else if (y < 620 && this.lowerBarVisible) {
    //     this.hideLowerBar();
    //   }
    // });
    // Fade out if mouse leaves the game canvas completely during an active wave
    // this.game.canvas.addEventListener('mouseleave', () => {
    //   if (this.lowerBarVisible && this.isWaveActive()) {
    //     this.hideLowerBar();
    //   }
    // });
  }

  createUIBackground() {
    // Bottom bar background
    const bottomBar = this.add.rectangle(0, 620, 1280, 100, 0x222222);
    bottomBar.setOrigin(0, 0);
    bottomBar.setAlpha(0.8);
    this.lowerBarContainer.add(bottomBar);
    this.bottomBarBackground = bottomBar;
  }

  createStatusDisplays() {
    // Lives display
    const livesIcon = this.add.image(30, 40, 'ui_icon_strength').setDisplaySize(26, 26);
    this.uiContainer.add(livesIcon);

    this.livesText = this.add.text(52, 27, `Protected Zone: ${fmt(this.lives)}`, {
      fontSize: '20px',
      fill: '#ffffff',
    });
    this.uiContainer.add(this.livesText);

    // Money display
    this.uiContainer.add(this.add.image(305, 40, 'ui_icon_force').setDisplaySize(25, 25));
    this.forceText = this.add.text(330, 28, `Force: ${fmt(this.force)}`, {
      fontSize: '20px',
      fill: '#7de8ff',
    });
    this.uiContainer.add(this.forceText);

    // Wave display
    const waveIcon = this.add.image(505, 40, 'ui_icon_wave').setDisplaySize(26, 26);
    this.uiContainer.add(waveIcon);

    // Get total waves from WaveManager if available, otherwise use base waves
    const totalWaves = this.scene.get('GameScene').waveManager
      ? this.scene.get('GameScene').waveManager.getTotalWaves()
      : (window.GAME_SETTINGS.MISSION_WAVES?.waveCount ?? '?');

    this.waveText = this.add.text(530, 28, `Wave ${fmt(this.wave)} / ${fmt(totalWaves)}`, {
      fontSize: '20px',
      fill: '#ffffff',
    });
    this.uiContainer.add(this.waveText);

    // Difficulty display
    const difficultyKey = this.registry.get('selectedDifficulty') || 'EASY';
    const difficultyData = window.GAME_SETTINGS.DIFFICULTY[difficultyKey];

    // Get color based on difficulty
    let difficultyColor;
    switch (difficultyKey) {
      case 'EASY':
        difficultyColor = '#00aa00';
        break; // Green
      case 'NORMAL':
        difficultyColor = '#0088cc';
        break; // Blue
      case 'HARD':
        difficultyColor = '#aaaa00';
        break; // Yellow
      case 'EXPERT':
        difficultyColor = '#dd6600';
        break; // Orange
      case 'INSANE':
        difficultyColor = '#cc0000';
        break; // Red
      default:
        difficultyColor = '#ffffff';
    }

    const difficultyIcon = this.add.image(705, 40, 'ui_icon_difficulty').setDisplaySize(25, 25);
    this.uiContainer.add(difficultyIcon);

    this.difficultyText = this.add.text(
      730,
      28,
      `Difficulty: ${difficultyData.name}`,
      {
        fontSize: '18px',
        fill: difficultyColor,
      }
    );
    this.uiContainer.add(this.difficultyText);
  }

  createTowerButtons() {
    const buttonWidth = 190;
    const buttonHeight = 82;
    const padding = 8;
    const startX = 24;
    const startY = 628;

    const gameScene = this.scene.get('GameScene');
    const missionRoster = this.registry.get('missionRoster') || [];
    const towerTypes = missionRoster.map(entry => typeof entry === 'string' ? { unitId: entry, deploymentId: entry } : entry).filter(entry =>
      window.GAME_SETTINGS.UNITS[entry.unitId] && gameScene.rpgManager.getOwnedUnit(entry.unitId)
    );
    this.selectedUnit = towerTypes[0]?.deploymentId || null;
    this.registry.set('selectedUnit', this.selectedUnit);

    towerTypes.forEach((deployment, index) => {
      const type = deployment.unitId;
      const towerData = window.GAME_SETTINGS.UNITS[type];
      const deploymentCost = gameScene.rpgManager.getDeploymentForceCost(type);
      const x = startX + (buttonWidth + padding) * index;

      // Button background
      const button = this.add.rectangle(
        x,
        startY,
        buttonWidth,
        buttonHeight,
        0x444444
      );
      button.setOrigin(0, 0);
      button.setInteractive();
      button.towerType = type;

      // Tower icon using level-1 sprite
      const icon = this.add.image(
        x + 16,
        startY + 16,
        `tower_${(towerData.asset || type).toLowerCase()}_1`
      );
      icon.setOrigin(0.5, 0.5);
      icon.setDisplaySize(24, 24);

      // Tower name
      const nameText = this.add.text(
        x + 34,
        startY + 7,
        towerData.name,
        {
          fontSize: '13px',
          fill: '#ffffff',
        }
      );
      nameText.setOrigin(0, 0);

      // Tower cost
      const costText = this.add.text(
        x + 34,
        startY + 63,
        `Force ${fmt(deploymentCost, 'floor')}`,
        {
          fontSize: '12px',
          fill: '#ffff00',
        }
      );
      costText.setOrigin(0, 0);

      // Add to lower bar container
      this.lowerBarContainer.add(button);
      this.lowerBarContainer.add(icon);
      this.lowerBarContainer.add(nameText);
      this.lowerBarContainer.add(costText);

      // Compact loadout badges use the actual item definitions captured for
      // the mission. Each badge is identified by slot and item name.
      const owned = gameScene.rpgManager.getOwnedUnit(type);
      const missionTower = gameScene.towerManager?.getAll().find(tower => tower.characterId === type);
      const loadout = missionTower?.equipment || {
        weapons: [owned?.equipped?.left, owned?.equipped?.right].filter(Boolean)
          .map(id => gameScene.rpgManager.getItemDefinition(id)).filter(Boolean),
        utility: gameScene.rpgManager.getItemDefinition(owned?.equipped?.utility),
        augments: (owned?.augments || []).map(id => gameScene.rpgManager.getItemDefinition(id)).filter(Boolean),
      };
      const badges = [];
      (loadout.weapons || []).forEach(item => badges.push(`W ${item.name}`));
      if (loadout.utility) badges.push(`U ${loadout.utility.name}`);
      (loadout.augments || []).forEach(item => badges.push(`A ${item.name}`));
      const loadoutText = this.add.text(x + 34, startY + 27, badges.join(' · ') || 'No equipment', {
        fontSize: '10px', fill: '#bfeaff', wordWrap: { width: buttonWidth - 40 },
        lineSpacing: 1,
      });
      this.lowerBarContainer.add(loadoutText);

      // Store button reference
      this.towerButtons.push({
        button,
        icon,
        nameText,
        costText,
        loadoutText,
        type, deploymentId: deployment.deploymentId,
      });

      // Set up event handlers
      button.on('pointerover', () => {
        button.setFillStyle(0x666666);
      });

      button.on('pointerout', () => {
        if (this.selectedUnit !== type) {
          button.setFillStyle(0x444444);
        }
      });

      button.on('pointerdown', () => {
        const audioManager = this.scene.get('GameScene').audioManager;
        if (audioManager) audioManager.playSound('ui_click');
        this.selectUnit(deployment.deploymentId);
      });

      // Set initial selection
      if (deployment.deploymentId === this.selectedUnit) {
        button.setFillStyle(0x888888);
      }
    });
  }

  createSpecialTileControls() {
    const gameScene = this.scene.get('GameScene');
    this.specialTileTypeButton = this.add.rectangle(818, 54, 216, 24, 0x1b3548, 0.96)
      .setStrokeStyle(1, 0x58c6dd).setInteractive({ useHandCursor: true });
    this.specialTileTypeText = this.add.text(826, 57, '', { fontSize: '12px', color: '#e5f8ff' });
    this.specialTilePlacementButton = this.add.rectangle(1042, 54, 177, 24, 0x25465a, 0.96)
      .setStrokeStyle(1, 0x58c6dd).setInteractive({ useHandCursor: true });
    this.specialTilePlacementText = this.add.text(1054, 57, '', { fontSize: '12px', color: '#e5f8ff' });
    this.uiContainer.add([
      this.specialTileTypeButton, this.specialTileTypeText,
      this.specialTilePlacementButton, this.specialTilePlacementText,
    ]);
    this.specialTileTypeButton.on('pointerdown', () => gameScene.cycleSpecialTileType());
    this.specialTilePlacementButton.on('pointerdown', () => {
      gameScene.setSpecialTilePlacementMode(!gameScene.specialTilePlacementMode);
    });
    this.updateSpecialTileControls();
  }

  updateSpecialTileControls() {
    const gameScene = this.scene.get('GameScene');
    if (!this.specialTileTypeText || !gameScene) return;
    const state = gameScene.getSpecialTileState();
    const title = String(state.type || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    this.specialTileTypeText.setText(`Tile: ${title}  |  ${fmt(state.points)} pts`);
    this.specialTilePlacementText.setText(state.placementMode ? 'Place tile: ON' : 'Place tile: OFF');
    this.specialTilePlacementButton.setFillStyle(state.placementMode ? 0x287348 : 0x25465a);
    if (state.points > 0 && !gameScene.isGameOver) this.specialTilePlacementButton.setInteractive({ useHandCursor: true });
    else this.specialTilePlacementButton.disableInteractive();
    if (gameScene.isGameOver) {
      this.specialTileTypeButton.disableInteractive();
      this.specialTilePlacementButton.disableInteractive();
    }
  }

  createWaveButton() {
    const buttonWidth = 220;
    const buttonHeight = 60;
    const x = 1280 - buttonWidth - 30;
    const y = 720 - 80;

    // Button background
    this.waveButton = this.add.rectangle(
      x,
      y,
      buttonWidth,
      buttonHeight,
      0x009900
    );
    this.waveButton.setOrigin(0, 0);
    this.waveButton.setInteractive();

    // Button text
    this.waveButtonText = this.add.text(
      x + buttonWidth / 2,
      y + buttonHeight / 2,
      'Start Wave 1',
      {
        fontSize: '20px', 
        fontFamily: 'courier', 
        fontStyle: 'normal',
        fill: '#fffbe7', 
        align: 'center',
        padding: { left: 24, right: 24, top: 20, bottom: 8 },
        fixedWidth: buttonWidth + 60, 
        fixedHeight: buttonHeight,
        backgroundColor: null, 
      }
    );
    this.waveButtonText.setOrigin(0.5, 0.5);

    // Add to lower bar container
    this.lowerBarContainer.add(this.waveButton);
    this.lowerBarContainer.add(this.waveButtonText);

    // Set up event handlers
    this.waveButton.on('pointerover', () => {
      this.waveButton.setFillStyle(0x00aa00);
    });

    this.waveButton.on('pointerout', () => {
      this.waveButton.setFillStyle(0x009900);
    });

    this.waveButton.on('pointerdown', () => {
      const audioManager = this.scene.get('GameScene').audioManager;
      if (audioManager) audioManager.playSound('ui_click');
      this.scene.get('GameScene').waveManager.startNextWave('manual');
    });
    if (this.scene.get('GameScene').selectedMission?.missionType === 'GAUNTLET') {
      this.waveButton.disableInteractive().setVisible(false);
      this.waveButtonText.setVisible(false);
    }
  }

  hideRPGPanel() {
    if (this.rpgPanel) this.rpgPanel.destroy(true);
    this.rpgPanel = null;
  }

  showRPGPanel() {
    if (this.rpgPanel) this.hideRPGPanel();
    const gameScene = this.scene.get('GameScene');
    const manager = gameScene.rpgManager;
    const panel = this.add.container(20, 90);
    const background = this.add.rectangle(0, 0, 600, 620, 0x101c2a, 0.98).setOrigin(0);
    panel.add(background);
    panel.setDepth(60);
    this.rpgPanel = panel;

    const close = this.add.text(560, 10, 'X', { fontSize: '20px', fill: '#ffffff' }).setInteractive({ useHandCursor: true });
    close.on('pointerdown', (pointer) => {
      pointer.event.stopPropagation();
      this.hideRPGPanel();
    });
    panel.add(close);
    panel.add(this.add.text(20, 12, 'Owned Units and Progression', { fontSize: '22px', fill: '#7de8ff' }));

    const roster = manager.getRoster();
    roster.forEach((entry, index) => {
      const y = 52 + index * 38;
      const selected = entry.definition.id === this.selectedUnit;
      if (!entry.owned) return;
      const stars = Math.max(0, Math.min(5, Math.floor(Number(entry.owned.stars) || 0)));
      const progress = stars < 5 ? `${Math.floor(Number(entry.owned.extraCopies) || 0)}/${stars + 1} copies` : 'MAX copies';
      const unitButton = this.add.text(20, y, `${entry.definition.name}  ${fmt(stars, 'floor')}★, ${progress}`, {
        fontSize: '16px', fill: selected ? '#ffe27a' : '#ffffff', backgroundColor: selected ? '#284d63' : '#1a2c3c', padding: 5,
      }).setInteractive();
      unitButton.on('pointerdown', () => {
        this.selectUnit(entry.definition.id);
        this.hideRPGPanel();
        this.showRPGPanel();
      });
      panel.add(unitButton);
    });

    const unitId = this.selectedUnit;
    const definition = manager.getUnitDefinition(unitId);
    const owned = manager.getOwnedUnit(unitId);
    const stats = manager.getEffectiveStats(unitId);
    const detailY = 220;
    const formatEffect = effect => {
      if (!effect) return 'None';
      if (effect.type === 'stat') {
        const value = effect.mode === 'percent'
          ? `${fmt(effect.value * 100)}%`
          : effect.mode === 'multiplier'
            ? `${fmt(effect.value)}x`
            : fmt(effect.value);
        return `${effect.stat}: ${effect.mode === 'flat' ? (effect.value >= 0 ? '+' : '') : ''}${value}`;
      }
      if (effect.type === 'status' && effect.statusEffect) {
        const status = effect.statusEffect;
        const details = [
          status.duration !== undefined ? `${fmt(status.duration)}ms` : null,
          status.value !== undefined ? `value ${fmt(status.value)}` : null,
          status.interval !== undefined ? `every ${fmt(status.interval)}ms` : null,
        ].filter(Boolean).join(', ');
        return `Status: ${status.type}${details ? ` (${details})` : ''}`;
      }
      if (effect.specialProperty) return `Special: ${effect.specialProperty}`;
      return effect.type ? `Effect: ${effect.type}` : 'Effect';
    };
    const formatEffects = effects => (effects || []).map(formatEffect).join(', ') || 'None';
    const formatStat = (label, value, suffix = '') => `${label}: ${value}${suffix}`;
    const augmentNames = (owned.augments || []).map(id => manager.getItemDefinition(id)?.name || id).join(', ') || 'None';
    const effectiveStats = [
      formatStat('Damage', fmt(stats.damage)),
      formatStat('Range', fmt(stats.range)),
      formatStat('Attack', fmt(stats.attackSpeed), 'ms'),
      formatStat('Type', stats.damageType),
      formatStat('Attack mode', stats.attackType),
      formatStat('Projectile', fmt(stats.projectileSpeed)),
      formatStat('Armor pen.', fmt(stats.armorPenetration)),
      stats.aoeRadius !== undefined ? formatStat('AOE radius', fmt(stats.aoeRadius)) : null,
      stats.statusEffects?.length ? `Status effects: ${formatEffects(stats.statusEffects.map(status => ({ type: 'status', statusEffect: status })))}` : null,
      stats.specialProperties?.length ? `Specials: ${stats.specialProperties.join(', ')}` : null,
    ].filter(Boolean).join(' | ');
    const stars = Math.max(0, Math.min(5, Math.floor(Number(owned.stars) || 0)));
    const copyProgress = stars < 5 ? `${fmt(Math.floor(Number(owned.extraCopies) || 0), 'floor')}/${stars + 1} copies` : 'MAX copies';
    panel.add(this.add.text(20, detailY, `${definition.name} (${unitId}) | ${displayFactionName(definition.faction)}\n${fmt(stars, 'floor')}★, ${copyProgress}\nDeployment baseline: ${effectiveStats}\nPassive: ${definition.passive?.name || 'None'}${definition.passive?.unimplemented ? ' (unimplemented: effect needs a definition)' : ''} (${formatEffects(definition.passive?.effects)})${stars === 5 ? '\nExtra passive unlocked.' : ''}\nAugments: ${augmentNames}`, { fontSize: '14px', fill: '#ffffff', wordWrap: { width: 560 } }));

    const equipmentText = (slot, itemId) => {
      const item = manager.getItemDefinition(itemId);
      if (!item) return `${slot}: Empty`;
      const rarity = manager.equipment.rarities[item.rarity];
      const durability = manager.getItemInstance(itemId)?.durability;
      return `${slot}: ${item.name} [${rarity?.name || 'Augment'}]${durability === null || durability === undefined ? '' : ` ${fmt(durability)}/${fmt(item.durability)}`}`;
    };
    panel.add(this.add.text(20, detailY + 115, `${equipmentText('Left hand', owned.equipped.left)}\n${equipmentText('Right hand', owned.equipped.right)}\n${equipmentText('Utility', owned.equipped.utility)}`, { fontSize: '14px', fill: '#d8e6ef' }));


    panel.add(this.add.text(20, 410, 'Loadout is fixed for this mission. Upgrade paths and XP belong to deployed units.', { fontSize: '13px', fill: '#9aa8b2', wordWrap: { width: 560 } }));
  }

  createMessageDisplay() {
    // Use centralized MESSAGE_STYLE config
    this.messageConfig = { ...MESSAGE_STYLE };
    // Message background
    this.messageBackground = this.add.graphics();
    this.messageBackground.setDepth(100);
    this.messageBackground.setVisible(false);
    this.uiContainer.add(this.messageBackground);

    // Message text
    this.messageText = this.add.text(640, 360, '', {
      fontSize: this.messageConfig.fontSize,
      fontFamily: this.messageConfig.fontFamily,
      color: this.messageConfig.color,
      align: 'center',
      wordWrap: { width: this.messageConfig.width - 2 * this.messageConfig.padding }
    });
    this.messageText.setOrigin(0.5, 0.5);
    this.messageText.setDepth(101);
    this.messageText.setVisible(false);
    this.uiContainer.add(this.messageText);
  }

  // --- Show message with custom style ---
  showMessage(message, duration = 2000, options = {}) {
    // Always merge MESSAGE_STYLE as the base config
    const cfg = { ...MESSAGE_STYLE, ...options };
    this.messageConfig = { ...cfg }; // Keep current config in sync
    // Set text and style
    this.messageText.setText(message);
    this.messageText.setStyle({
      fontSize: cfg.fontSize,
      fontFamily: cfg.fontFamily,
      color: cfg.color,
      align: 'center',
      wordWrap: { width: cfg.width - 2 * cfg.padding }
    });
    this.messageText.setVisible(true);

    // Calculate background size based on text
    const textBounds = this.messageText.getBounds();
    const bgWidth = Math.max(cfg.width, textBounds.width + 2 * cfg.padding);
    const bgHeight = Math.max(cfg.height, textBounds.height + 2 * cfg.padding);
    this.messageBackground.clear();
    this.messageBackground.fillStyle(cfg.backgroundColor, cfg.backgroundAlpha);
    // Draw rounded rectangle
    this.messageBackground.fillRoundedRect(
      640 - bgWidth / 2,
      360 - bgHeight / 2,
      bgWidth,
      bgHeight,
      cfg.borderRadius
    );
    this.messageBackground.setVisible(true);

    // Bring to top
    this.messageBackground.setDepth(100);
    this.messageText.setDepth(101);

    // Clear any existing timer
    if (this.messageTimer) {
      this.messageTimer.remove();
    }
    // Hide message after duration (if not permanent)
    if (duration > 0) {
      this.messageTimer = this.time.delayedCall(duration, () => {
        this.messageText.setVisible(false);
        this.messageBackground.setVisible(false);
      });
    }
  }

  showTileClearConfirmation({ onConfirm, onCancel }) {
    if (this.tileClearConfirmDialog) return false;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const dialog = this.add.container(0, 0).setDepth(2000);
    const shade = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x02070d, 0.78)
      .setInteractive();
    const panel = this.add.rectangle(centerX, centerY, 430, 230, 0x101923, 0.99)
      .setStrokeStyle(2, 0x54d9e8, 1);
    const question = this.add.text(centerX, centerY - 62, 'Clear this tile?', {
      fontFamily: 'courier', fontSize: '24px', color: '#e9f4fb', fontStyle: 'bold',
    }).setOrigin(0.5);
    const cost = this.add.text(centerX, centerY - 18, `Cost: ${CLEAR_TILE_FORCE_COST} Force`, {
      fontFamily: 'courier', fontSize: '20px', color: '#ffd36a',
    }).setOrigin(0.5);
    const confirmButton = this.add.rectangle(centerX - 95, centerY + 60, 150, 48, 0x187044, 1)
      .setStrokeStyle(1, 0x75f0a7, 1).setInteractive({ useHandCursor: true });
    const confirmText = this.add.text(centerX - 95, centerY + 60, 'Clear', {
      fontFamily: 'courier', fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const cancelButton = this.add.rectangle(centerX + 95, centerY + 60, 150, 48, 0x344454, 1)
      .setStrokeStyle(1, 0x90a9bc, 1).setInteractive({ useHandCursor: true });
    const cancelText = this.add.text(centerX + 95, centerY + 60, 'Cancel', {
      fontFamily: 'courier', fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    dialog.add([shade, panel, question, cost, confirmButton, confirmText, cancelButton, cancelText]);
    this.tileClearConfirmCallbacks = { onConfirm, onCancel };
    shade.on('pointerdown', pointer => {
      pointer.event?.stopPropagation();
      this.dismissTileClearConfirmation();
    });
    confirmButton.on('pointerdown', pointer => {
      pointer.event?.stopPropagation();
      const callback = this.tileClearConfirmCallbacks?.onConfirm;
      this.hideTileClearConfirmation();
      callback?.();
    });
    cancelButton.on('pointerdown', pointer => {
      pointer.event?.stopPropagation();
      this.dismissTileClearConfirmation();
    });
    this.tileClearConfirmDialog = dialog;
    this.input.keyboard.on('keydown-ESC', this.dismissTileClearConfirmation, this);
    return true;
  }

  dismissTileClearConfirmation() {
    const callback = this.tileClearConfirmCallbacks?.onCancel;
    this.hideTileClearConfirmation();
    callback?.();
  }

  hideTileClearConfirmation() {
    this.input?.keyboard?.off('keydown-ESC', this.dismissTileClearConfirmation, this);
    this.tileClearConfirmDialog?.destroy(true);
    this.tileClearConfirmDialog = null;
    this.tileClearConfirmCallbacks = null;
  }

  setupEventListeners() {
    // Listen for UI update events from game scene
    this.scene.get('GameScene').events.on('updateUI', this.updateUI, this);

    // Listen for wave events
    this.scene
      .get('GameScene')
      .events.on('waveStarted', this.onWaveStarted, this);
    this.scene
      .get('GameScene')
      .events.on('waveCompleted', this.onWaveCompleted, this);
    this.scene
      .get('GameScene')
      .events.on('waveReadyForNext', this.onWaveReadyForNext, this);
    this.scene
      .get('GameScene')
      .events.on('waveCountdown', this.onWaveCountdown, this);

    // Listen for game over
    this.scene.get('GameScene').events.on('gameOver', this.onGameOver, this);
    this.scene.get('GameScene').events.on('specialTileStateChanged', this.updateSpecialTileControls, this);

    // Listen for messages
    this.scene
      .get('GameScene')
      .events.on('showMessage', this.showMessage, this);

    // Listen for tower info display
    this.scene.get('GameScene').events.on('showTowerInfo', this.showTowerInfo, this);

    // Hide tower info when clicking elsewhere (optional: could be improved)
    this.input.on('pointerdown', (pointer, currentlyOver) => {
      console.log('[UIScene] Scene pointerdown', pointer, 'currentlyOver:', currentlyOver);
      // If the tower info panel is open
      if (this.towerInfoPanel) {
        // Gather all objects that are part of the panel (panel + children)
        const panelObjects = [this.towerInfoPanel];
        if (this.towerInfoPanel.getAll) {
          panelObjects.push(...this.towerInfoPanel.getAll());
        } else if (this.towerInfoPanel.list) {
          panelObjects.push(...this.towerInfoPanel.list);
        }
        // If click is NOT on the panel or any of its children, hide it
        if (!currentlyOver.some(obj => panelObjects.includes(obj))) {
          this.hideTowerInfo();
        }
      } else {
        // If no panel, old logic (optional: could skip)
        if (!currentlyOver.some(obj => obj === this.towerInfoPanel)) {
          this.hideTowerInfo();
        }
      }
    });

    // On game start, show lower bar
    this.scene.get('GameScene').events.on('gameStart', () => {
      this.isGameStopped = false;
    });
  }

  updateUI(data) {
    // Update lives
    if (data.lives !== undefined) {
      this.lives = data.lives;
    }
    if (data.escapes !== undefined) this.escapes = data.escapes;
    const gameScene = this.scene.get('GameScene');
    this.lives = gameScene.economyManager.getLives();
    this.livesText.setText(`Protected Zone: ${fmt(this.lives)}`);

    // Update money
    if (data.money !== undefined) {
      this.money = data.money;
      // Update tower button states based on affordability
      this.updateTowerButtonStates();
    }

    if (data.force !== undefined) {
      this.force = data.force;
      this.forceText.setText(`Force: ${fmt(this.force)}`);
      this.updateTowerButtonStates();
    }

    // Update wave
    if (data.wave !== undefined) {
      this.wave = data.wave;

      // Get total waves from WaveManager
      const totalWaves = this.scene
        .get('GameScene')
        .waveManager.getTotalWaves();
      this.waveText.setText(`Wave ${fmt(this.wave)} / ${fmt(totalWaves)}`);
    }
  }

  updateTowerButtonStates() {
    // Update tower buttons based on whether player can afford them
    for (const towerButton of this.towerButtons) {
      // Defensive: Check for destroyed/null buttons and texts
      if (!towerButton || !towerButton.button || !towerButton.costText) {
        console.warn('[updateTowerButtonStates] Skipping invalid towerButton:', towerButton);
        continue;
      }
      if (towerButton.button.destroyed || towerButton.costText.destroyed) {
        console.warn('[updateTowerButtonStates] Skipping destroyed button or costText:', towerButton);
        continue;
      }
      const gameScene = this.scene.get('GameScene');
      const towerCost = gameScene.rpgManager.getDeploymentForceCost(towerButton.type);
      const canAfford = this.force >= towerCost;
      towerButton.costText.setFill(getPriceColor(canAfford));
      setButtonAffordability(towerButton.button, canAfford, 0x444444, 0x888888);
    }
  }

  selectUnit(type) {
    if (!this.towerButtons.some(towerButton => towerButton.deploymentId === type)) return false;
    this.selectedUnit = type;
    selectUnitForPlacement(type, this.registry, this.scene.get('GameScene'));

    // Update button appearances
    for (const towerButton of this.towerButtons) {
      if (towerButton.deploymentId === type) {
        towerButton.button.setFillStyle(0x888888);
      } else {
        towerButton.button.setFillStyle(0x444444);
      }
    }

    return true;
  }

  /**
   * Show a large animated banner for wave events
   */
  showWaveBanner(text, color = '#ffff00') {
    // Remove existing banner if present
    if (this.waveBanner) {
      this.waveBanner.destroy();
    }
    const banner = this.add.text(640, 120, text, {
      fontSize: '56px',
      fill: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 8,
      align: 'center',
    });
    banner.setOrigin(0.5, 0.5);
    banner.setAlpha(0);
    this.waveBanner = banner;

    // Animate in, hold, then out
    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 350,
      yoyo: false,
      onComplete: () => {
        this.time.delayedCall(1100, () => {
          this.tweens.add({
            targets: banner,
            alpha: 0,
            duration: 400,
            onComplete: () => {
              banner.destroy();
            },
          });
        });
      },
    });
  }

  onWaveStarted(waveNumber) {
    this.isGameStopped = false;
    // Update wave number
    this.wave = waveNumber;
    this.waveText.setText(
      `Wave ${fmt(this.wave)} / ${fmt(this.scene.get('GameScene').waveManager.getTotalWaves())}`
    );

    // Starting a wave never blocks the next one; concurrent spawn schedules
    // are supported, so keep the next available wave actionable.
    const nextWave = waveNumber + 1;
    const hasNextWave = nextWave <= this.scene.get('GameScene').waveManager.getTotalWaves();
    this.setWaveButtonEnabled(hasNextWave);
    this.waveButtonText.setText(hasNextWave ? `Start Wave ${fmt(nextWave)}` : 'Final Wave');

    // Show animated wave start banner
    this.showWaveBanner(`Wave ${fmt(this.wave)} Start!`, '#00ff88');
  }

  onWaveCompleted(waveNumber) {
    const gameScene = this.scene.get('GameScene');
    if (gameScene.isGameOver || waveNumber >= gameScene.waveManager.getTotalWaves()) return;

    // Enable wave button for next wave
    this.setWaveButtonEnabled(true);
    this.waveButtonText.setText(`Start Wave ${fmt(gameScene.waveManager.getCurrentWave() + 1)}`);

    // Show animated wave completed banner
    this.showWaveBanner(`Wave ${fmt(waveNumber)} Complete!`, '#ffff00');
  }

  onWaveReadyForNext(waveNumber) {
    const gameScene = this.scene.get('GameScene');
    if (gameScene.isGameOver || waveNumber >= gameScene.waveManager.getTotalWaves()) return;
    this.setWaveButtonEnabled(true);
    this.waveButtonText.setText(`Start Wave ${fmt(gameScene.waveManager.getCurrentWave() + 1)}`);
  }

  onWaveCountdown(seconds) {
    if (seconds === null || this.isGameStopped) return;
    this.waveButtonText.setText(`Start Next Wave (${fmt(seconds)}s)`);
  }

  onGameOver(data) {
    this.isGameStopped = true;
    this.specialTileTypeButton?.disableInteractive();
    this.specialTilePlacementButton?.disableInteractive();
    this.hideTowerInfo();
    // Disable wave button
    this.setWaveButtonEnabled(false);
    this.waveButtonText.setText(data.victory ? 'Victory!' : 'Game Over');

    // Update UI button states for game over
    this.updateUIButtonStates(true);
    this.showMissionResult(data);
  }

  showMissionResult(data) {
    if (this.missionResultObjects.length) return;
    const result = data.result || {};
    const victory = typeof result.victory === 'boolean' ? result.victory : Boolean(data.victory);
    const itemNames = ids => (ids || []).map(id => this.scene.get('GameScene').rpgManager.getItemDefinition(id)?.name || id).join(', ') || 'none';
    const unitNames = ids => (ids || []).map(id => this.scene.get('GameScene').rpgManager.getUnitDefinition(id)?.name || id).join(', ') || 'none';
    const rows = [victory ? 'MISSION COMPLETE' : 'MISSION FAILED'];
    if (victory) {
      rows.push(`Credits: +${fmt(Number(result.credits) || 0, 'floor')}`);
      rows.push(result.influence
        ? `${displayFactionName(result.faction)} influence: +${fmt(result.influence)}`
        : 'Faction influence: not awarded; mission faction is not assigned');
      rows.push(`Equipment found: ${itemNames(result.equipmentGained)}`);
      rows.push(`Units found: ${unitNames(result.unitsGained)}`);
    } else {
      rows.push('No victory rewards were awarded.');
    }
    rows.push(`Equipment broken: ${itemNames(result.equipmentLost)}`);
    rows.push(`Waves completed: ${fmt(data.wave || 0)}   Score: ${fmt(data.score || 0)}`);

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const shade = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x07111b, 0.94).setDepth(1000).setInteractive();
    const title = this.add.text(centerX, centerY - 195, rows[0], {
      fontSize: '42px', fontStyle: 'bold', color: victory ? '#ffd700' : '#ff7777',
    }).setOrigin(0.5).setDepth(1001);
    const details = this.add.text(centerX, centerY - 30, rows.slice(1).join('\n'), {
      fontSize: '21px', color: '#ffffff', align: 'center', lineSpacing: 12,
      wordWrap: { width: 1000 },
    }).setOrigin(0.5).setDepth(1001);
    const influenceIcon = victory && result.influence
      ? this.add.image(centerX - 175, centerY - 30 - details.height / 2 + details.height / 6 * 1.5, 'ui_icon_influence').setDisplaySize(22, 24).setDepth(1002)
      : null;
    const button = this.add.rectangle(centerX, this.scale.height - 135, 320, 64, 0x187044).setDepth(1002).setInteractive({ useHandCursor: true });
    const returnIcon = this.add.image(centerX - 105, this.scale.height - 135, 'ui_restart').setDisplaySize(34, 34).setDepth(1003);
    const buttonText = this.add.text(centerX + 18, this.scale.height - 135, 'Return to Hub · advance turn', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1003);
    button.on('pointerdown', () => this.scene.get('GameScene').returnToMap());
    this.missionResultObjects = [shade, title, details, ...(influenceIcon ? [influenceIcon] : []), button, returnIcon, buttonText];
  }

  setWaveButtonEnabled(enabled) {
    if (enabled) {
      this.waveButton.setFillStyle(0x00aa00);
      this.waveButton.setInteractive();
    } else {
      this.waveButton.setFillStyle(0x555555);
      this.waveButton.disableInteractive();
    }
  }

  getTowerColor(type) {
    // Return a color based on tower type
    switch (type) {
      case 'BASIC':
        return 0x0000ff;
      case 'AOE':
        return 0xff0000;
      case 'SLOW':
        return 0x00ffff;
      case 'SNIPER':
        return 0xaa00ff;
      case 'MULTISHOT':
        return 0xff8800;
      case 'SUPPORT':
        return 0x00ff00;
      default:
        return 0xffffff;
    }
  }

  // Helper to determine if a wave is currently active (in progress)
  isWaveActive() {
    const gameScene = this.scene.get('GameScene');
    return !this.isGameStopped && gameScene.waveManager && gameScene.waveManager.isWaveInProgress();
  }

  // Helper to determine if wave is paused or stopped
  isWavePausedOrStopped() {
    // Returns true if the game is paused, stopped, or between waves
    const gameScene = this.scene.get('GameScene');
    return this.isGameStopped || gameScene.isPaused || !gameScene.waveManager.isWaveInProgress();
  }

  // --- Lower bar fade logic ---
  showLowerBar() {
    // Deprecated: Lower bar is always visible now
  }

  hideLowerBar() {
    // Deprecated: Lower bar is always visible now
  }

  /**
   * Create UI buttons (mute, restart, main menu)
   */
  createUIButtons() {
    // Use Phaser's global sound mute for robust, best-practice muting
    this.isMuted = this.sound.mute;

    // Button spacing
    const buttonSize = 40;
    const buttonPadding = 10;
    const startX = 1280 - buttonSize - 10;
    const buttonY = 30; // Move buttons down slightly
    
    // Create top-right buttons container with higher depth
    this.topRightButtonsContainer.setDepth(100); // Ensure buttons appear above other UI elements

    const gameScene = this.scene.get('GameScene');
    this.pauseControl = this.add.text(875, 28, 'PAUSE', { fontSize: '16px', fill: '#ffffff', backgroundColor: '#27445c', padding: 8 }).setInteractive();
    if (gameScene.selectedMission?.missionType === 'GAUNTLET') this.pauseControl.disableInteractive().setVisible(false);
    this.pauseControl.on('pointerdown', () => {
      gameScene.isPaused = !gameScene.isPaused;
      gameScene.time.timeScale = gameScene.isPaused ? 0 : gameScene.gameSpeed;
      this.pauseControl.setText(gameScene.isPaused ? 'RESUME' : 'PAUSE');
      gameScene.events.emit('gamePaused', gameScene.isPaused);
    });
    this.speedControls = [1, 2, 3, 4].map((speed, index) => {
      const control = this.add.text(945 + index * 42, 28, `${fmt(speed)}×`, {
        fontSize: '16px',
        fill: '#ffffff',
        backgroundColor: gameScene.gameSpeed === speed ? '#32799c' : '#27445c',
        padding: 8,
      }).setInteractive();
      control.on('pointerdown', () => {
        gameScene.setGameSpeed(speed);
        this.speedControls.forEach((item, itemIndex) => {
          item.setBackgroundColor(itemIndex + 1 === gameScene.gameSpeed ? '#32799c' : '#27445c');
        });
      });
      return control;
    });
    gameScene.events.on('gameSpeedChanged', speed => {
      this.speedControls.forEach((control, index) => {
        control.setBackgroundColor(index + 1 === speed ? '#32799c' : '#27445c');
      });
    });
    this.uiContainer.add([this.pauseControl, ...this.speedControls]);
    
    // Create mute button
    this.muteButton = new UIButton(this, startX, buttonY, {
      image: 'ui_unmute',
      toggleImage: 'ui_mute',
      isToggle: true,
      initialState: this.isMuted,
      tooltip: 'Mute',
      width: buttonSize,
      height: buttonSize,
      callback: (isToggled) => {
        this.isMuted = isToggled;
        this.sound.mute = this.isMuted; // Phaser best practice: mute all audio globally
        this.muteButton.setTooltip(this.isMuted ? 'Unmute' : 'Mute');
      }
    });
    
    this.topRightButtonsContainer.add(this.muteButton.container);

    // Create main menu button
    this.mainMenuButton = new UIButton(this, startX - 2 * (buttonSize + buttonPadding), buttonY, {
      image: 'ui_mainmenu',
      tooltip: 'Return Home',
      width: buttonSize,
      height: buttonSize,
      callback: () => {
        // Create confirmation dialog
        if (!this.mainMenuDialog) {
          this.mainMenuDialog = new ConfirmationDialog(this, {
            message: 'Are you sure you want to\nleave the current mission and return to the hub?',
            onConfirm: () => {
              // Return to the campaign hub without advancing an unfinished mission.
              this.scene.stop('GameScene');
              this.scene.stop('UIScene');
              this.scene.start('MainHubScene');
            },
            ...DIALOG_STYLE
          });
        }
        
        this.mainMenuDialog.show();
      }
    });
    
    this.topRightButtonsContainer.add(this.mainMenuButton.container);
    
    // Set initial button states
    this.updateUIButtonStates(false);
  }
  
  /**
   * Update UI button states based on game state
   * @param {boolean} isGameOver - Whether the game is in an end state
   */
  updateUIButtonStates(isGameOver) {
    // Mute button is always enabled
    
    // Restart and main menu buttons are always visible but may be disabled in certain states
    if (isGameOver) {
      // During victory/defeat, enable return home after a short delay
      // to prevent accidental clicks
      this.time.delayedCall(1000, () => {
        if (this.mainMenuButton) this.mainMenuButton.setEnabled(true);
      });
    } else {
      // During normal gameplay, keep return home enabled
      if (this.mainMenuButton) this.mainMenuButton.setEnabled(true);
    }
  }

  shutdown() {
    this.dismissTileClearConfirmation();
    this.hideTowerInfo();
    this.stopAmmoDisplayTimer();
    this.missionResultObjects.forEach(object => object.destroy());
    this.missionResultObjects = [];
    // Destroy UI buttons if they exist
    if (this.muteButton) {
      this.muteButton.destroy();
      this.muteButton = null;
    }
    if (this.mainMenuButton) {
      this.mainMenuButton.destroy();
      this.mainMenuButton = null;
    }
    // Destroy top-right buttons container (always)
    if (this.topRightButtonsContainer) {
      this.topRightButtonsContainer.destroy(true);
      this.topRightButtonsContainer = null;
    }
    // Destroy dialogs if they exist
    if (this.mainMenuDialog) {
      this.mainMenuDialog.destroy();
      this.mainMenuDialog = null;
    }
    // Destroy all tower buttons and their text objects
    if (this.towerButtons && Array.isArray(this.towerButtons)) {
      for (const towerButton of this.towerButtons) {
        if (towerButton.button && towerButton.button.destroy) towerButton.button.destroy();
        if (towerButton.costText && towerButton.costText.destroy) towerButton.costText.destroy();
        if (towerButton.nameText && towerButton.nameText.destroy) towerButton.nameText.destroy();
      }
      this.towerButtons = [];
    }
    // Remove event listeners from GameScene
    const gameScene = this.scene.get('GameScene');
    if (gameScene && gameScene.events) {
      gameScene.events.off('updateUI', this.updateUI, this);
      gameScene.events.off('waveStarted', this.onWaveStarted, this);
      gameScene.events.off('waveCompleted', this.onWaveCompleted, this);
      gameScene.events.off('waveReadyForNext', this.onWaveReadyForNext, this);
      gameScene.events.off('waveCountdown', this.onWaveCountdown, this);
      gameScene.events.off('gameOver', this.onGameOver, this);
      gameScene.events.off('specialTileStateChanged', this.updateSpecialTileControls, this);
      gameScene.events.off('showMessage', this.showMessage, this);
      gameScene.events.off('showTowerInfo', this.showTowerInfo, this);
      gameScene.events.off('gameStart');
    }

    // Remove pointer event listeners
    this.input.off('pointerdown');
    // Remove canvas event listener
    this.game.canvas.removeEventListener('mouseleave', this.hideLowerBar);
  }
}
