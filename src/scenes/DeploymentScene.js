import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import RPGManager from '../systems/RPGManager.js';
import { preloadUiAssets } from '../helpers/uiAssets.js';

export default class DeploymentScene extends Phaser.Scene {
  constructor() { super('DeploymentScene'); }

  preload() { preloadUiAssets(this); }

  create() {
    this.rpgManager = new RPGManager(this);
    this.selected = this.getEligibleRoster(this.registry.get('missionRoster'));
    this.registry.set('missionRoster', this.selected);
    this.activeDeployment = 0;
    this.unitId = this.selected[0]?.unitId || this.rpgManager.getRoster().find(entry => entry.owned)?.definition.id || null;
    this.add.rectangle(640, 360, 1280, 720, 0x101923, 0.98);
    this.add.image(875, 390, 'ui_panel_9').setDisplaySize(720, 520).setAlpha(0.72);
    this.add.text(640, 35, 'Deployment', { fontSize: '36px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(45, 90, 'Owned units · select for mission', { fontSize: '20px', color: '#ffe27a' });
    this.unitList = this.add.container(40, 130);
    this.add.text(555, 90, 'Selected unit loadout', { fontSize: '20px', color: '#ffe27a' });
    this.detail = this.add.text(555, 130, '', { fontSize: '18px', color: '#ffffff', wordWrap: { width: 660 } });
    this.controls = this.add.container(555, 230);
    this.add.image(565, 643, 'ui_icon_credits').setDisplaySize(18, 23);
    this.status = this.add.text(580, 630, '', { fontSize: '16px', color: '#d8e6ef', wordWrap: { width: 640 } });
    this.addButton(1110, 42, 'Back to Map', () => this.returnToMap());
    this.addButton(640, 682, 'Continue to Mission', () => {
      if (!this.prepareMission()) return;
      this.scene.start('GameScene');
    }).setOrigin(0.5);
    this.render();
  }

  addButton(x, y, label, callback) {
    const button = this.add.text(x, y, label, { fontSize: '17px', color: '#fff', backgroundColor: '#245b66', padding: { x: 12, y: 8 } })
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    return button;
  }

  render() {
    this.unitList.removeAll(true);
    this.rpgManager.getRoster().filter(entry => entry.owned).forEach((entry, index) => {
      const id = entry.definition.id;
      const count = this.selected.filter(deployment => deployment.unitId === id).length;
      const button = this.add.text(0, index * 55, `+ ${entry.definition.name} (${count})`, {
        fontSize: '18px', color: count ? '#8ff0b2' : '#fff', backgroundColor: '#1a2c3c', padding: { x: 8, y: 8 },
      }).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => {
        this.selected.push(this.makeDeployment(id));
        this.selected = this.getEligibleRoster(this.selected);
        this.activeDeployment = this.selected.length - 1;
        this.unitId = id;
        this.registry.set('missionRoster', this.selected);
        this.render();
      });
      this.unitList.add(button);
    });
    this.selected.forEach((deployment, index) => {
      const button = this.add.text(280, index * 40, `${index === this.activeDeployment ? '▶ ' : ''}${index + 1}. ${this.rpgManager.getUnitDefinition(deployment.unitId)?.name || deployment.unitId}  [Remove]`, {
        fontSize: '15px', color: '#fff', backgroundColor: '#283b4b', padding: { x: 6, y: 5 },
      }).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => {
        if (this.activeDeployment === index) {
          this.selected.splice(index, 1);
          this.activeDeployment = Math.max(0, index - 1);
          this.unitId = this.selected[this.activeDeployment]?.unitId || this.unitId;
        } else {
          this.activeDeployment = index;
          this.unitId = deployment.unitId;
        }
        this.registry.set('missionRoster', this.selected);
        this.render();
      });
      this.unitList.add(button);
    });
    const deployment = this.selected[this.activeDeployment];
    const owned = this.unitId && this.rpgManager.getOwnedUnit(this.unitId);
    const definition = this.unitId && this.rpgManager.getUnitDefinition(this.unitId);
    if (!owned || !definition) { this.detail.setText('Select an owned unit to configure equipment.'); return; }
    const itemName = id => this.rpgManager.getItemDefinition(id)?.name || 'Empty';
    const equipped = deployment?.equipped || owned.equipped;
    const augmentIds = deployment?.augments || owned.augments || [];
    const augmentNames = augmentIds.map(id => this.rpgManager.getItemDefinition(id)?.name || id).join(', ') || 'None';
    this.detail.setText(`${definition.name} · ${definition.faction} · Deployment ${this.activeDeployment + 1}\nPassive: ${definition.passive?.name || 'None'}\nLeft: ${itemName(equipped.left)}     Right: ${itemName(equipped.right)}     Utility: ${itemName(equipped.utility)}\nAugments: ${augmentNames}`);
    this.controls.removeAll(true);
    ['left', 'right', 'utility', 'augment'].forEach((slot, i) => {
      const type = slot === 'utility' || slot === 'augment' ? slot : 'weapon';
      const items = this.rpgManager.getOwnedItems(type);
      const title = slot === 'utility' || slot === 'augment' ? slot[0].toUpperCase() + slot.slice(1) : `${slot[0].toUpperCase()}${slot.slice(1)} hand`;
      const y = i * 115;
      const equippedId = slot === 'augment' ? augmentIds.join(', ') || 'None' : equipped[slot];
      const slotLabel = this.add.text(0, y, `${title}: ${slot === 'augment' ? equippedId.split(', ').map(itemName).join(', ') : itemName(equippedId)}`, { fontSize: '17px', color: '#fff' });
      this.controls.add(slotLabel);
      if (slot !== 'augment') {
        const clear = this.addButton(0, y + 35, 'Unequip', () => { if (deployment) deployment.equipped[slot] = null; this.refreshDeployment(deployment); this.render(); });
        this.controls.add(clear);
      }
      items.forEach((item, itemIndex) => {
        const x = 125 + (itemIndex % 4) * 140;
        const iy = y + 35 + Math.floor(itemIndex / 4) * 42;
        const isEquipped = slot === 'augment' ? augmentIds.includes(item.definition.id) : equipped[slot] === item.definition.id;
        const availability = item.instance ? '' : 'Makeshift: ';
        const equip = this.addButton(x, iy, `${isEquipped ? 'Remove' : 'Equip'} ${availability}${item.definition.name}`, () => {
          const success = this.editDeploymentLoadout(deployment, slot, item.definition.id, isEquipped);
          this.status.setText(success ? `${item.definition.name} equipped.` : 'That equipment cannot be equipped in this slot.');
          this.render();
        });
        equip.setFontSize('14px');
        this.controls.add(equip);
      });
    });
    const wages = this.rpgManager.getMissionCreditCost(this.selected.map(item => item.unitId)) || 0;
    this.status.setText(`${fmt(this.selected.length)} unit(s) selected. Mission wages: ${fmt(wages, 'floor')} Cr. Credits: ${fmt(this.rpgManager.state.credits, 'floor')}.`);
  }

  prepareMission() {
    this.selected = this.getEligibleRoster(this.selected);
    if (!this.rpgManager.setMissionRoster(this.selected)) {
      this.status.setText('Select at least one owned unit.');
      return false;
    }
    if (!this.rpgManager.chargeMissionCosts(this.selected.map(item => item.unitId))) {
      this.registry.set('missionRoster', []);
      this.status.setText('Not enough credits for mission wages.');
      return false;
    }
    this.registry.set('selectedUnit', this.selected[0].deploymentId);
    this.registry.set('missionRunId', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    this.registry.set('missionSeed', Math.floor(Math.random() * 0x100000000) >>> 0);
    const factionCounts = this.selected.reduce((counts, deployment) => {
      const faction = this.rpgManager.getUnitDefinition(deployment.unitId)?.faction;
      if (faction) counts[faction] = (counts[faction] || 0) + 1;
      return counts;
    }, {});
    this.registry.set('missionFaction', Object.entries(factionCounts)
      .sort((left, right) => right[1] - left[1])[0]?.[0] || 'Sewer Rats');
    return true;
  }

  returnToMap() {
    this.registry.set('missionRoster', this.getEligibleRoster(this.selected));
    this.scene.start('MapSelectScene');
  }

  getEligibleRoster(unitIds) {
    if (!Array.isArray(unitIds)) return [];
    return unitIds.map((entry, index) => typeof entry === 'string' ? this.makeDeployment(entry, `deployment-${index}`) : entry)
      .filter(entry => entry && this.rpgManager.getUnitDefinition(entry.unitId) && this.rpgManager.getOwnedUnit(entry.unitId));
  }

  makeDeployment(unitId, deploymentId = `${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    const owned = this.rpgManager.getOwnedUnit(unitId);
    const equipped = { ...owned.equipped };
    return { deploymentId, unitId, equipped, augments: [...(owned.augments || [])], equipment: this.snapshotEquipment(equipped) };
  }

  snapshotEquipment(equipped) {
    return { weapons: ['left', 'right'].map(slot => equipped[slot] ? this.rpgManager.getItemDefinition(equipped[slot]) : null), utility: equipped.utility ? this.rpgManager.getItemDefinition(equipped.utility) : null };
  }

  refreshDeployment(deployment) { if (deployment) deployment.equipment = this.snapshotEquipment(deployment.equipped); }

  editDeploymentLoadout(deployment, slot, itemId, wasEquipped) {
    if (!deployment) return false;
    const item = this.rpgManager.getItemDefinition(itemId);
    if (!item || (!this.rpgManager.isPermanentlyAvailable(item) && !this.rpgManager.getItemInstance(itemId))) return false;
    if (slot === 'augment') deployment.augments = wasEquipped ? deployment.augments.filter(id => id !== itemId) : [...deployment.augments, itemId];
    else if (slot === 'utility' && item.type === 'utility') deployment.equipped.utility = wasEquipped ? null : itemId;
    else if ((slot === 'left' || slot === 'right') && item.type === 'weapon' && [1, 2].includes(item.hands) && this.rpgManager.isWeaponAllowed(deployment.unitId, item)) {
      if (wasEquipped) { deployment.equipped[slot] = null; if (item.hands === 2) deployment.equipped.left = deployment.equipped.right = null; }
      else if (item.hands === 2) deployment.equipped.left = deployment.equipped.right = itemId;
      else { if (this.rpgManager.getItemDefinition(deployment.equipped[slot])?.hands === 2) deployment.equipped.left = deployment.equipped.right = null; deployment.equipped[slot] = itemId; }
    } else return false;
    this.refreshDeployment(deployment);
    this.registry.set('missionRoster', this.selected);
    return true;
  }
}
