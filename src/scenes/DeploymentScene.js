import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import RPGManager from '../systems/RPGManager.js';
import { preloadUiAssets, rarityFrame } from '../helpers/uiAssets.js';
import { displayFactionName } from '../utils/factions.js';
import { getAspectFitDisplaySize } from '../utils/visualSize.js';
import { getMissionRestrictionFailure } from '../systems/missionRestrictions.js';
import { createDeploymentSelection, handleDeploymentItemPointerDown } from '../systems/deploymentSelection.js';
import { getDeploymentEquipmentRows } from '../systems/deploymentEquipmentPanel.js';
import { getDeploymentUpgradeOverview } from '../systems/deploymentUpgradeOverview.js';

const GOLD = '#ffe27a';
const PALE = '#d8e6ef';
const MUTED = '#91a4b5';
const PAGE_SIZE = 10;

export default class DeploymentScene extends Phaser.Scene {
  constructor() { super('DeploymentScene'); }

  preload() {
    preloadUiAssets(this);
    Object.values(window.GAME_SETTINGS.UNITS).forEach(unit => {
      if (unit.characterArt) this.load.image(`deployment_unit_${unit.id}`, `assets/${unit.asset || unit.id}.png`);
    });
  }

  create() {
    this.rpgManager = new RPGManager(this);
    const savedLineup = this.rpgManager.state.deploymentLineup;
    const previous = this.getEligibleRoster(this.registry.get('missionRoster'));
    this.lineup = Array.isArray(savedLineup) && savedLineup.some(Boolean)
      ? savedLineup.slice(0, 5).map((id, index) => id ? this.makeDeployment(id, `lineup-${index}`) : null)
      : Array.from({ length: 5 }, (_, index) => previous[index] || null);
    if (!this.lineup.some(Boolean)) {
      this.lineup = Array.from({ length: 5 }, (_, index) => {
        const unit = this.rpgManager.getRoster().filter(entry => entry.owned)[index];
        return unit ? this.makeDeployment(unit.definition.id, `lineup-${index}`) : null;
      });
    }
    this.activeSlot = this.lineup.findIndex(Boolean);
    if (this.activeSlot < 0) this.activeSlot = 0;
    this.mode = 'unit';
    this.damageFilter = 'All';
    this.typeFilter = 'All';
    this.rarityFilter = 'All';
    this.searchText = '';
    this.page = 0;
    this.selection = createDeploymentSelection();
    this.inventoryInstanceKeys = new WeakMap();
    this.nextInventoryInstanceKey = 1;
    this.activeEquipSlot = 'right';
    this.handSlotExplicit = false;
    this.cameras.main.setBackgroundColor('#101923');
    this.add.rectangle(640, 360, 1280, 720, 0x101923, 0.98);
    this.add.image(640, 360, 'ui_panel_9').setDisplaySize(1280, 720).setAlpha(0.15);
    this.add.text(24, 18, 'DEPLOYMENT & LOADOUT', { fontSize: '25px', color: GOLD, fontStyle: 'bold' });
    this.addButton(1110, 20, this.registry.get('deploymentReturnScene') === 'MainHubScene' ? 'Back to Hub' : 'Back to Map', () => this.returnFromScreen());
    const missionSelected = Boolean(this.registry.get('selectedMission'));
    this.addButton(975, 20, missionSelected ? 'Continue to Mission' : 'Select a Mission', () => {
      if (!missionSelected) { this.scene.start('MapSelectScene'); return; }
      if (this.prepareMission()) this.scene.start('GameScene');
    });
    this.add.rectangle(640, 124, 1230, 142, 0x0b1722, 0.96).setStrokeStyle(1, 0x315267);
    this.add.text(28, 48, 'LINEUP', { fontSize: '15px', color: GOLD, fontStyle: 'bold' });
    this.add.text(1010, 52, 'Five deployment slots', { fontSize: '12px', color: MUTED });
    this.slotObjects = [];
    for (let i = 0; i < 5; i += 1) this.drawSlot(i);

    this.add.rectangle(640, 326, 1230, 180, 0x0b1722, 0.94).setStrokeStyle(1, 0x315267);
    this.add.text(28, 204, 'FILTERS', { fontSize: '15px', color: GOLD, fontStyle: 'bold' });
    this.filterControls = this.add.container(24, 230);
    this.drawFilters();
    this.detailTitle = this.add.text(300, 205, 'Select a lineup slot or inventory item', { fontSize: '18px', color: GOLD, fontStyle: 'bold' });
    this.detailText = this.add.text(300, 234, '', { fontSize: '12px', color: PALE, wordWrap: { width: 700 }, lineSpacing: 2, fixedWidth: 700, fixedHeight: 62 });
    this.add.rectangle(640, 359, 704, 112, 0x101c28, 0.98).setStrokeStyle(1, 0x315267);
    this.add.text(300, 304, 'UPGRADE PATHS', { fontSize: '11px', color: GOLD, fontStyle: 'bold' });
    this.upgradePathText = this.add.text(300, 322, 'Select a unit to inspect its full progression.', {
      fontSize: '10px', color: PALE, wordWrap: { width: 680 }, lineSpacing: 2, fixedWidth: 680,
    });
    this.upgradePathScroll = 0;
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (pointer.x < 295 || pointer.x > 1004 || pointer.y < 300 || pointer.y > 416) return;
      this.upgradePathScroll = Math.max(0, this.upgradePathScroll + Math.sign(deltaY));
      this.updateUpgradePaths();
    });
    this.slotControls = this.add.container(1020, 205);
    this.drawSlotControls();

    this.add.rectangle(640, 598, 1230, 224, 0x0b1722, 0.96).setStrokeStyle(1, 0x315267);
    this.add.text(24, 488, 'OWNED INVENTORY', { fontSize: '15px', color: GOLD, fontStyle: 'bold' });
    this.modeControls = this.add.container(200, 484);
    this.drawModeControls();
    this.inventoryGrid = this.add.container(24, 514);
    this.pageControls = this.add.container(1000, 482);
    this.status = this.add.text(24, 704, '', { fontSize: '12px', color: PALE });
    this.drawInventory();
    this.persistLineup();
  }

  addButton(x, y, text, callback, options = {}) {
    const button = this.add.text(x, y, text, {
      fontSize: options.fontSize || '13px', color: options.color || '#ffffff',
      backgroundColor: options.background || '#245b66', padding: { x: 8, y: 5 },
    }).setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    return button;
  }

  drawSlot(index) {
    const x = 30 + index * 192;
    const y = 82;
    const deployment = this.lineup[index];
    const box = this.add.rectangle(x + 82, y + 43, 170, 82, 0x192b3a, 0.98)
      .setStrokeStyle(2, index === this.activeSlot ? 0xffe27a : deployment ? 0x52788e : 0x53616b)
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => { this.activeSlot = index; this.selection.clear(); this.drawSlots(); this.drawSlotControls(); this.updateDetails(); });
    const objects = [box, this.add.text(x + 8, y + 6, `SLOT ${index + 1}`, { fontSize: '10px', color: MUTED })];
    if (deployment) {
      const unit = this.rpgManager.getUnitDefinition(deployment.unitId);
      const key = `deployment_unit_${deployment.unitId}`;
      if (this.textures.exists(key)) {
        const source = this.textures.get(key).getSourceImage();
        const size = getAspectFitDisplaySize(source.width, source.height, { width: 48, height: 54 });
        objects.push(this.add.image(x + 37, y + 47, key).setDisplaySize(size.width, size.height));
      }
      objects.push(this.add.text(x + 68, y + 22, unit?.name || deployment.unitId, { fontSize: '12px', color: '#fff', wordWrap: { width: 94 } }));
      objects.push(this.add.text(x + 68, y + 55, displayFactionName(unit?.faction), { fontSize: '10px', color: MUTED, wordWrap: { width: 94 } }));
    } else {
      objects.push(this.add.text(x + 82, y + 37, 'EMPTY', { fontSize: '13px', color: MUTED }).setOrigin(0.5));
    }
    this.slotObjects.push(...objects);
  }

  drawSlots() {
    this.slotObjects.forEach(object => object.destroy());
    this.slotObjects = [];
    for (let i = 0; i < 5; i += 1) this.drawSlot(i);
  }

  drawFilters() {
    this.searchInput?.destroy();
    this.filterControls.removeAll(true);
    const label = (text, y) => this.filterControls.add(this.add.text(0, y, text, { fontSize: '11px', color: MUTED }));
    label('CATEGORY', 0);
    ['unit', 'equipment'].forEach((mode, i) => this.filterControls.add(this.addButton(i * 76, 17, mode.toUpperCase(), () => {
      this.mode = mode; this.page = 0; this.drawFilters(); this.drawModeControls(); this.drawInventory(); this.updateDetails();
    }, { fontSize: '10px', background: this.mode === mode ? '#245b66' : '#28333c' })));
    label('DAMAGE', 48);
    const damages = ['All', ...new Set(this.getInventory().flatMap(item => item.damageType ? [item.damageType] : []))];
    this.filterControls.add(this.addButton(0, 65, this.damageFilter, () => {
      const index = damages.indexOf(this.damageFilter); this.damageFilter = damages[(index + 1) % damages.length]; this.page = 0; this.drawFilters(); this.drawInventory(); this.updateDetails();
    }, { fontSize: '10px', background: '#28333c' }));
    label('ITEM TYPE', 95);
    const types = this.mode === 'unit' ? ['All'] : ['All', 'weapon', 'utility', 'augment'];
    this.filterControls.add(this.addButton(0, 112, this.typeFilter, () => {
      const index = types.indexOf(this.typeFilter); this.typeFilter = types[(index + 1) % types.length]; this.page = 0; this.drawFilters(); this.drawInventory(); this.updateDetails();
    }, { fontSize: '10px', background: '#28333c' }));
    label('RARITY', 143);
    const rarities = ['All', ...Object.keys(this.rpgManager.equipment.rarities || {})];
    this.filterControls.add(this.addButton(0, 160, this.rarityFilter, () => {
      const index = rarities.indexOf(this.rarityFilter); this.rarityFilter = rarities[(index + 1) % rarities.length]; this.page = 0; this.drawFilters(); this.drawInventory(); this.updateDetails();
    }, { fontSize: '10px', background: '#28333c' }));
    label('SEARCH', 191);
    this.searchInput = this.add.dom(110, 465).createFromHTML('<input type="text" placeholder="Search inventory" style="width:178px;background:#142536;color:#fff;border:1px solid #52788e;padding:6px;font-size:12px">');
    const inputEl = this.searchInput.node.querySelector('input');
    inputEl.value = this.searchText;
    inputEl.addEventListener('input', event => { this.searchText = event.target.value.toLowerCase(); this.page = 0; this.drawInventory(); this.updateDetails(); });
  }

  getInventory() {
    return this.mode === 'unit' ? this.getUnitInventory() : this.getEquipmentInventory();
  }

  getUnitInventory() {
    return this.rpgManager.getRoster().filter(entry => entry.owned).map(entry => ({ ...entry.definition, kind: 'unit' }));
  }

  getEquipmentInventory() {
    return ['weapon', 'utility', 'augment'].flatMap(type => this.rpgManager.getOwnedItems(type)
      .map(entry => ({
        ...entry.definition,
        kind: 'equipment',
        instance: entry.instance,
        selectionId: entry.instance ? this.getInventoryInstanceKey(entry.instance) : `permanent:${entry.definition.id}`,
      })));
  }

  getInventoryInstanceKey(instance) {
    if (!this.inventoryInstanceKeys.has(instance)) {
      this.inventoryInstanceKeys.set(instance, `instance:${this.nextInventoryInstanceKey}`);
      this.nextInventoryInstanceKey += 1;
    }
    return this.inventoryInstanceKeys.get(instance);
  }

  getSelectedItem() {
    const item = this.selection.resolve([...this.getUnitInventory(), ...this.getEquipmentInventory()]);
    if (!item && this.selection.key) this.selection.clear();
    return item;
  }

  drawModeControls() {
    this.modeControls.removeAll(true);
    ['unit', 'equipment'].forEach((mode, index) => this.modeControls.add(this.addButton(index * 98, 0, mode === 'unit' ? 'UNITS' : 'EQUIPMENT', () => {
      this.mode = mode; this.page = 0; this.damageFilter = 'All'; this.typeFilter = 'All'; this.rarityFilter = 'All'; this.drawFilters(); this.drawModeControls(); this.drawInventory(); this.updateDetails();
    }, { fontSize: '10px', background: this.mode === mode ? '#245b66' : '#28333c' })));
  }

  filteredItems() {
    return this.getInventory().filter(item => {
      if (this.mode === 'equipment' && this.typeFilter !== 'All' && item.type !== this.typeFilter) return false;
      if (this.damageFilter !== 'All' && item.damageType !== this.damageFilter) return false;
      if (this.rarityFilter !== 'All' && item.rarity !== this.rarityFilter) return false;
      return !this.searchText || `${item.name} ${item.description || ''} ${item.type || ''}`.toLowerCase().includes(this.searchText);
    });
  }

  drawInventory() {
    this.inventoryGrid.removeAll(true);
    this.pageControls.removeAll(true);
    this.getSelectedItem();
    const entries = this.filteredItems();
    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    entries.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).forEach((item, index) => {
      const col = index % 5, row = Math.floor(index / 5), x = col * 238, y = row * 88;
      const selected = this.selection.isSelected(item);
      const card = this.add.rectangle(x + 108, y + 39, 224, 76, 0x192b3a, 0.98).setStrokeStyle(1, selected ? 0xffe27a : 0x34576b);
      this.inventoryGrid.add(card);
      const icon = item.kind === 'unit' ? `deployment_unit_${item.id}` : `ui_icon_${String(item.damageType || 'physical').toLowerCase()}`;
      if (this.textures.exists(icon)) {
        if (item.kind === 'unit') {
          const source = this.textures.get(icon).getSourceImage(); const size = getAspectFitDisplaySize(source.width, source.height, { width: 42, height: 52 });
          this.inventoryGrid.add(this.add.image(x + 25, y + 38, icon).setDisplaySize(size.width, size.height));
        } else this.inventoryGrid.add(this.add.image(x + 25, y + 38, icon).setDisplaySize(26, 30));
      }
      this.inventoryGrid.add(this.add.image(x + 25, y + 38, rarityFrame(item.rarity)).setDisplaySize(47, 58));
      this.inventoryGrid.add(this.add.text(x + 52, y + 10, item.name, { fontSize: '11px', color: '#fff', wordWrap: { width: 162 } }));
      const meta = item.kind === 'unit' ? `${displayFactionName(item.faction)} · Rank ${this.rpgManager.getOwnedUnit(item.id)?.stars || 0}` : `${item.rarity || 'Equipment'} · ${item.type}`;
      this.inventoryGrid.add(this.add.text(x + 52, y + 45, meta, { fontSize: '10px', color: MUTED, wordWrap: { width: 162 } }));
      card.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer, localX, localY, event) => {
        handleDeploymentItemPointerDown(item, event, {
          selectItem: selectedItem => {
            this.selection.select(selectedItem);
            this.updateDetails(); this.drawInventory();
          },
          assignUnit: unitId => this.assignUnit(unitId),
        });
      });
    });
    this.pageControls.add(this.addButton(0, 0, '‹', () => { this.page = Math.max(0, this.page - 1); this.drawInventory(); }, { fontSize: '12px' }));
    this.pageControls.add(this.add.text(32, 3, `${this.page + 1}/${pages}`, { fontSize: '11px', color: PALE }));
    this.pageControls.add(this.addButton(70, 0, '›', () => { this.page = Math.min(pages - 1, this.page + 1); this.drawInventory(); }, { fontSize: '12px' }));
    if (!entries.length) this.inventoryGrid.add(this.add.text(10, 50, 'No owned items match these filters.', { fontSize: '13px', color: MUTED }));
  }

  drawSlotControls() {
    this.slotControls.removeAll(true);
    const deployment = this.lineup[this.activeSlot];
    if (!deployment) {
      this.slotControls.add(this.add.text(0, 5, 'NO UNIT SELECTED', { fontSize: '11px', color: MUTED, fontStyle: 'bold' }));
      this.slotControls.add(this.add.text(0, 26, 'Equipment slots are empty.', { fontSize: '10px', color: MUTED }));
      this.slotControls.add(this.addButton(0, 52, 'FILL FROM INVENTORY', () => this.status.setText('Select an owned unit below to fill this slot.'), { fontSize: '10px', background: '#28333c' }));
      return;
    }
    const rows = getDeploymentEquipmentRows(deployment, this.rpgManager);
    rows.forEach((row, index) => {
      const y = index * 29;
      this.slotControls.add(this.addButton(0, y + 1, row.label, () => {
        if (row.slot === 'left' || row.slot === 'right') this.handSlotExplicit = true;
        this.activeEquipSlot = row.slot;
        this.mode = 'equipment';
        this.typeFilter = row.slot === 'augment' || row.slot === 'utility' ? row.slot : 'weapon';
        this.page = 0;
        this.drawFilters(); this.drawModeControls(); this.drawInventory(); this.updateDetails();
      }, { fontSize: '9px', background: this.activeEquipSlot === row.slot ? '#245b66' : '#28333c' }));

      const icon = this.getEquipmentPanelIcon(row.item);
      if (icon && this.textures.exists(icon)) {
        this.slotControls.add(this.add.image(80, y + 14, icon).setDisplaySize(20, 20));
      }
      this.slotControls.add(this.add.text(96, y + 7, row.item?.name || 'Empty', {
        fontSize: '10px', color: row.item ? PALE : MUTED, wordWrap: { width: 140 },
      }));
    });
    this.slotControls.add(this.addButton(0, 120, 'REMOVE UNIT', () => {
      this.lineup[this.activeSlot] = null; this.persistLineup(); this.drawSlots(); this.drawSlotControls(); this.updateDetails();
    }, { fontSize: '10px', background: '#643d3a' }));
    this.slotControls.add(this.addButton(0, 148, 'UNEQUIP SELECTED SLOT', () => this.unequipActive(), { fontSize: '10px', background: '#28333c' }));
    this.slotControls.add(this.addButton(0, 176, 'EQUIP SELECTED ITEM', () => this.equipSelected(), { fontSize: '10px' }));
  }

  getEquipmentPanelIcon(item) {
    if (!item) return null;
    if (item.icon && this.textures.exists(item.icon)) return item.icon;
    if (item.asset && this.textures.exists(item.asset)) return item.asset;
    const typeIcon = item.type === 'augment' ? 'ui_icon_star'
      : item.type === 'utility' ? 'ui_icon_force'
        : `ui_icon_${String(item.damageType || 'physical').toLowerCase()}`;
    return this.textures.exists(typeIcon) ? typeIcon : null;
  }

  updateDetails() {
    const selectedItem = this.getSelectedItem();
    const deployment = this.lineup[this.activeSlot];
    const selectedUnitId = selectedItem?.kind === 'unit' ? selectedItem.id : deployment?.unitId;
    if (selectedUnitId !== this.upgradeOverviewUnitId) this.upgradePathScroll = 0;
    this.upgradeOverviewUnitId = selectedUnitId || null;
    this.updateUpgradePaths();
    if (selectedItem?.kind === 'equipment') {
      const item = selectedItem;
      const stats = this.effectSummary(item) || item.description || 'No listed stat effects';
      this.detailTitle.setText(`${item.name} · ${item.rarity || 'Equipment'}`);
      this.detailText.setText(`${item.type} · ${item.damageType || ''} · ${stats}${item.hands ? ` · ${item.hands}-handed` : ''}${item.requiredHands ? ` · Requires ${item.requiredHands}-hand weapon` : ''}${item.requiredAttackType ? ` · Requires ${item.requiredAttackType}` : ''}${item.requiredDamageType ? ` · Requires ${item.requiredDamageType} damage` : ''}${item.cost !== undefined ? ` · Base cost ${fmt(item.cost)} Cr` : ''}`);
      return;
    }
    if (!deployment) {
      this.detailTitle.setText(`Slot ${this.activeSlot + 1} · Empty`);
      this.detailText.setText('Choose a unit from the inventory below to assign this slot. Unit copies are not consumed.');
      return;
    }
    const definition = this.rpgManager.getUnitDefinition(deployment.unitId);
    const owned = this.rpgManager.getOwnedUnit(deployment.unitId);
    const equipped = owned.equipped || {};
    const augments = owned.augments || [];
    const base = this.rpgManager.getEffectiveStats(deployment.unitId, { equipped: {}, equipment: { weapons: [], utility: null }, augments: [], veterancy: 0, selectedPaths: {} });
    const final = this.rpgManager.getEffectiveStats(deployment.unitId, { equipped, equipment: this.snapshotEquipment(equipped), augments, veterancy: 0, selectedPaths: {} });
    const show = value => value === undefined || value === null ? '—' : fmt(value);
    const stats = ['damage', 'range', 'attackSpeedModifier', 'criticalChance', 'criticalModifier', 'reloadSpeed', 'armorPenetration'];
    const statRows = stats.filter(key => base?.[key] !== undefined || final?.[key] !== undefined)
      .map(key => `${key}: ${show(base?.[key])} base → ${show(final?.[key])} equipped`).join(' · ');
    const gear = ['left', 'right', 'utility'].map(slot => {
      const item = this.rpgManager.getItemDefinition(equipped[slot]);
      return `${slot}: ${item ? `${item.name}${this.effectSummary(item) ? ` (${this.effectSummary(item)})` : ''}` : 'Empty'}`;
    }).join(' · ');
    const augmentNames = augments.map(id => this.rpgManager.getItemDefinition(id)?.name || id).join(', ') || 'None';
    const augment = augments.length ? this.rpgManager.getItemDefinition(augments[0]) : null;
    const augmentRule = augment ? (['RARE', 'EXOTIC', 'LEGENDARY'].includes(String(augment.rarity).toUpperCase())
      ? `Remove for ${fmt(augment.cost)} Cr` : 'Removal destroys this common/uncommon augment') : 'One augment slot is available';
    this.detailTitle.setText(`${definition.name} · ${displayFactionName(definition.faction)} · Rank ${owned.stars || 0}`);
    const augmentDetails = augment ? this.effectSummary(augment) : '';
    this.detailText.setText(`${statRows}\nPassive: ${definition.passive?.name || 'None'}${definition.passive?.unimplemented ? ' (unimplemented: effect needs a definition)' : ''}${definition.passive?.description ? ` — ${definition.passive.description}` : ''}${definition.passive?.effects?.length ? ` (${definition.passive.effects.map(effect => `${effect.stat} ${effect.mode === 'percent' ? `${effect.value >= 0 ? '+' : ''}${fmt(effect.value * 100)}%` : `${effect.value >= 0 ? '+' : ''}${fmt(effect.value)}`}`).join(', ')})` : ''}\n${gear}\nAugment: ${augmentNames}${augmentDetails ? ` (${augmentDetails})` : ''} · ${augmentRule}`);
  }

  updateUpgradePaths() {
    if (!this.upgradePathText) return;
    const selectedItem = this.getSelectedItem();
    const unitId = selectedItem?.kind === 'unit' ? selectedItem.id : this.lineup[this.activeSlot]?.unitId;
    if (!unitId) {
      this.upgradePathText.setText('Select a unit to inspect its full progression.');
      return;
    }
    const owned = this.rpgManager.getOwnedUnit(unitId) || {};
    const tiers = getDeploymentUpgradeOverview(this.rpgManager, unitId, {
      pathProgress: owned.pathProgress || owned.selectedPaths || {},
      selectedPaths: owned.selectedPaths || {},
      pathTierSelection: owned.pathTierSelection || {},
      randomStat: owned.randomStat || null,
    });
    const rows = tiers.flatMap(tier => [
      { kind: 'tier', text: `TIER ${tier.tier} · ${tier.unlocked ? 'UNLOCKED' : 'LOCKED'}` },
      ...tier.paths.map(path => ({ kind: 'path', text: `• ${path.name} [${path.status}]${path.description ? `\n  ${path.description}` : ''}\n  Effect: ${path.effect}` })),
    ]);
    const maxRows = Math.max(0, rows.length - 1);
    this.upgradePathScroll = Math.max(0, Math.min(this.upgradePathScroll, maxRows));
    this.upgradePathText.setText(rows.slice(this.upgradePathScroll, this.upgradePathScroll + 2)
      .map(row => row.kind === 'tier' ? `[ ${row.text} ]` : row.text).join('\n'));
  }

  effectSummary(item) {
    const effects = (item.effects || []).map(effect => `${effect.stat} ${effect.mode === 'percent' ? `${effect.value >= 0 ? '+' : ''}${fmt(effect.value * 100)}%` : `${effect.value >= 0 ? '+' : ''}${fmt(effect.value)}`}`);
    const special = [item.specialProperty?.property, ...(item.specialProperties || []).map(property => property.property)].filter(Boolean);
    const statuses = (item.statusEffects || []).map(effect => effect.type);
    return [...effects, ...special, ...statuses, item.description].filter(Boolean).join(' · ');
  }

  assignUnit(unitId) {
    const deployment = this.makeDeployment(unitId, `lineup-${this.activeSlot}`);
    this.lineup[this.activeSlot] = deployment;
    this.persistLineup(); this.drawSlots(); this.drawSlotControls(); this.updateDetails(); this.drawInventory();
  }

  equipSelected() {
    const deployment = this.lineup[this.activeSlot];
    const item = this.getSelectedItem();
    if (!deployment || !item || item.kind !== 'equipment') { this.status.setText('Select a unit and an owned equipment item first.'); return; }
    const equipSlot = this.activeEquipSlot === 'right' && !this.handSlotExplicit ? 'auto' : this.activeEquipSlot;
    const success = this.activeEquipSlot === 'augment'
      ? this.rpgManager.equipAugment(deployment.unitId, item.id)
      : this.rpgManager.equip(deployment.unitId, item.id, equipSlot);
    this.syncLoadouts();
    const owned = this.rpgManager.getOwnedUnit(deployment.unitId);
    const noAutomaticHandAvailable = equipSlot === 'auto' && item.type === 'weapon' && item.hands === 1
      && owned?.equipped?.left && owned?.equipped?.right;
    this.status.setText(success ? `${item.name} equipped.` : noAutomaticHandAvailable
      ? 'Both hands are occupied. Select LEFT or RIGHT to replace a weapon.'
      : 'Unable to equip: check slot compatibility, ownership, and augment slot availability.');
    this.updateDetails(); this.drawInventory();
  }

  unequipActive() {
    const deployment = this.lineup[this.activeSlot];
    if (!deployment) return;
    const success = this.activeEquipSlot === 'augment'
      ? (this.rpgManager.getOwnedUnit(deployment.unitId).augments || []).some(id => this.rpgManager.unequipAugment(deployment.unitId, id))
      : this.rpgManager.unequip(deployment.unitId, this.activeEquipSlot);
    this.syncLoadouts();
    this.status.setText(success ? 'Loadout updated.' : 'Unable to remove this item; check the augment removal rule and available credits.');
    this.updateDetails(); this.drawInventory();
  }

  syncLoadouts() {
    this.lineup = this.lineup.map((entry, index) => entry ? this.makeDeployment(entry.unitId, `lineup-${index}`) : null);
    this.persistLineup(); this.drawSlots(); this.drawSlotControls();
  }

  persistLineup() {
    this.rpgManager.setDeploymentLineup(this.lineup.map(entry => entry?.unitId || null));
    this.registry.set('missionRoster', this.lineup.filter(Boolean));
  }

  snapshotEquipment(equipped) {
    return { weapons: ['left', 'right'].map(slot => equipped[slot] ? this.rpgManager.getItemDefinition(equipped[slot]) : null), utility: equipped.utility ? this.rpgManager.getItemDefinition(equipped.utility) : null };
  }

  makeDeployment(unitId, deploymentId) {
    const owned = this.rpgManager.getOwnedUnit(unitId);
    const equipped = { ...owned.equipped };
    return { deploymentId, unitId, equipped, augments: [...(owned.augments || [])], equipment: this.snapshotEquipment(equipped) };
  }

  getEligibleRoster(roster) {
    if (!Array.isArray(roster)) return [];
    return roster.map((entry, index) => typeof entry === 'string'
      ? (this.rpgManager.getOwnedUnit(entry) ? this.makeDeployment(entry, `deployment-${index}`) : null) : entry)
      .filter(entry => entry && this.rpgManager.getUnitDefinition(entry.unitId) && this.rpgManager.getOwnedUnit(entry.unitId)).slice(0, 5);
  }

  prepareMission() {
    const mission = this.registry.get('selectedMission');
    if (!mission) { this.status.setText('Select an available mission before launching.'); return false; }
    const selected = this.lineup.filter(Boolean).map((entry, index) => this.makeDeployment(entry.unitId, `mission-${index}`));
    if (!this.rpgManager.setMissionRoster(selected)) { this.status.setText('Select at least one owned unit.'); return false; }
    const restrictionFailure = getMissionRestrictionFailure(selected, mission, this.rpgManager);
    if (restrictionFailure) { this.status.setText(restrictionFailure); return false; }
    if (!this.rpgManager.chargeMissionCosts(selected)) { this.registry.set('missionRoster', []); this.status.setText('Mission costs could not be calculated.'); return false; }
    this.registry.set('selectedDifficulty', mission.difficulty);
    this.registry.set('missionFaction', mission.faction);
    this.registry.set('missionMapIndex', 0);
    this.registry.set('missionRestriction', mission.restrictionsByMap?.[0] || mission.restrictions || []);
    this.registry.set('missionRewardMultiplier', mission.rewardMultiplier);
    const difficultyLevel = Math.max(1, ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'INSANE'].indexOf(mission.difficulty) + 1);
    this.registry.set('missionSpecialTilePoints', mission.missionType === 'BARRICADE' ? 9 * difficultyLevel : 5);
    this.registry.set('selectedUnit', selected[0].deploymentId);
    this.registry.set('missionRunId', mission.id);
    this.registry.set('miniBossSpawnState', { missionRunId: mission.id, chance: 20, outcomes: {} });
    this.registry.set('missionSeed', mission.mapSeeds?.[0] ?? mission.seed);
    this.registry.set('selectedMap', mission.mapKeys?.[0] || this.registry.get('selectedMap') || 'forest');
    return true;
  }

  returnFromScreen() {
    this.persistLineup();
    if (this.registry.get('deploymentReturnScene') === 'MainHubScene') this.scene.start('MainHubScene');
    else this.scene.start('MapSelectScene');
  }
}
