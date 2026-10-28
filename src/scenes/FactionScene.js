import Phaser from 'phaser';
import RPGManager from '../systems/RPGManager.js';
import { fmt } from '../utils/formatNumber.js';
import { displayFactionName, factionDataName, getFactionInfluence, FACTIONS } from '../utils/factions.js';
import { preloadUiAssets, rarityFrame } from '../helpers/uiAssets.js';
import { getAspectFitDisplaySize } from '../utils/visualSize.js';
import ConfirmationDialog from '../helpers/ConfirmationDialog.js';
import { FACTION_PAGE_BACKGROUNDS, useSceneBackground } from '../utils/screenBackgrounds.js';

const IMPLEMENTED = new Set(Object.keys(FACTION_PAGE_BACKGROUNDS));

export default class FactionScene extends Phaser.Scene {
  constructor() { super('FactionScene'); }

  init(data) { this.faction = displayFactionName(data?.faction || this.registry.get('factionPage')); }

  preload() {
    preloadUiAssets(this);
    const dataFaction = factionDataName(this.faction);
    Object.values(window.GAME_SETTINGS.UNITS).filter(unit => unit.faction === dataFaction && unit.characterArt)
      .forEach(unit => { if (!this.textures.exists(`faction_unit_${unit.id}`)) this.load.image(`faction_unit_${unit.id}`, `assets/${unit.asset || unit.id}.png`); });
  }

  create() {
    if (!IMPLEMENTED.has(this.faction) || !FACTIONS.includes(this.faction)) {
      this.scene.start('MainHubScene');
      return;
    }
    useSceneBackground(this, `assets/images/${FACTION_PAGE_BACKGROUNDS[this.faction]}`);
    this.rpg = new RPGManager(this);
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101923, 0.56);
    this.add.image(640, 360, 'ui_panel_9').setDisplaySize(1280, 720).setAlpha(0.14);
    this.add.text(26, 18, this.faction.toUpperCase(), { fontSize: '29px', color: '#ffe27a', fontStyle: 'bold' });
    this.addButton(1120, 20, 'Back to Hub', () => this.scene.start('MainHubScene'));
    this.influence = getFactionInfluence(this.rpg.state.influence, this.faction);
    this.totalInfluence = getFactionInfluence(this.rpg.state.totalInfluence, this.faction);
    const introduction = this.faction === 'Underworld Network'
      ? 'A human faction/community. Current game data associates Underworld Network units and faction equipment with this community.'
      : this.faction === 'Strozek Supremacy'
        ? 'Current game data associates Strozek Supremacy units and faction equipment with this faction.'
        : 'Current game data associates several units and weapons with the Laisung Collective.';
    this.add.text(28, 66, introduction, { fontSize: '14px', color: '#d8e6ef', wordWrap: { width: 1200 } });
    this.add.text(28, 96, `Influence: ${fmt(this.influence)} available · ${fmt(this.totalInfluence)} lifetime · ${this.totalInfluence >= 50 ? '10% store discount' : `${fmt(50 - this.totalInfluence)} lifetime influence to 10% discount`}`, { fontSize: '14px', color: '#c6d5df' });
    const allegiance = this.rpg.state.allegiance;
    this.add.text(610, 96, `Allegiance: ${allegiance || 'None'}`, { fontSize: '15px', color: allegiance === this.faction ? '#a6efbd' : '#c6d5df' });
    this.allegianceButton = this.addButton(900, 91, '', () => this.confirmAllegiance());
    this.refreshAllegianceButton();
    this.add.rectangle(640, 365, 1228, 490, 0x0b1722, 0.93).setStrokeStyle(1, 0x315267);
    this.add.text(28, 132, 'FACTION STORE', { fontSize: '19px', color: '#ffe27a', fontStyle: 'bold' });
    this.add.text(315, 137, 'Faction stock · purchases use influence', { fontSize: '13px', color: '#91a4b5' });
    this.add.text(565, 137, 'No faction augments are currently configured.', { fontSize: '11px', color: '#91a4b5' });
    this.restock = this.addButton(1228, 130, '', () => this.restockStore()).setOrigin(1, 0);
    this.storeCards = this.add.container(24, 164);
    this.details = this.add.text(30, 545, 'Select or hover over a store item for details.', { fontSize: '13px', color: '#d8e6ef', wordWrap: { width: 1215 }, lineSpacing: 3 });
    this.add.text(28, 604, 'MISSIONS', { fontSize: '18px', color: '#ffe27a', fontStyle: 'bold' });
    this.add.text(155, 606, 'General map options only; no faction-specific mission catalog is implemented.', { fontSize: '13px', color: '#91a4b5' });
    this.addButton(1010, 635, 'Open General Mission Selection', () => this.scene.start('MapSelectScene'));
    this.refreshStore();
  }

  addButton(x, y, label, callback) {
    const button = this.add.text(x, y, label, { fontSize: '13px', color: '#fff', backgroundColor: '#245b66', padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    return button;
  }

  refreshAllegianceButton() {
    const current = this.rpg.state.allegiance;
    this.allegianceButton.setText(current === this.faction ? 'Current Allegiance' : current ? 'Switch Allegiance' : 'Join Allegiance');
    this.allegianceButton.setAlpha(this.rpg.state.credits < 0 || current === this.faction ? 0.5 : 1);
    if (this.rpg.state.credits < 0 || current === this.faction) this.allegianceButton.disableInteractive();
    else this.allegianceButton.setInteractive({ useHandCursor: true });
  }

  confirmAllegiance() {
    if (this.rpg.state.credits < 0) { this.details.setText('Allegiance cannot be started while in credit debt.'); return; }
    const baseline = this.rpg.getBaselineUpkeep();
    const current = this.rpg.state.allegiance;
    if (current === this.faction) return;
    const message = `Allegiance to ${this.faction}${current ? ` will replace ${current}` : ''}. There is no upfront charge in the rules. At each turn close, the game will pay 2 × current baseline upkeep (${fmt(baseline * 2)} Cr at today's upkeep) and grant the same amount as faction influence. It cancels if that payment cannot be made.`;
    new ConfirmationDialog(this, {
      message, width: 640, height: 270, fontSize: 17,
      onConfirm: () => {
        const changed = this.rpg.setAllegiance(this.faction);
        if (!changed) this.details.setText('Allegiance could not be changed. Credit debt prevents joining.');
        this.scene.restart({ faction: this.faction });
      },
    }).show();
  }

  refreshStore() {
    this.storeCards.removeAll(true);
    const stock = this.rpg.getFactionStoreStock(this.faction);
    const dataKey = factionDataName(this.faction);
    const items = [
      ...stock.equipment.map(id => ({ ...this.rpg.equipment.items[id], kind: 'equipment' })),
      ...stock.augments.map(id => ({ ...this.rpg.equipment.augments[id], kind: 'augment' })),
      ...stock.units.map(id => ({ ...this.rpg.units[id], kind: 'unit' })),
    ].filter(item => item?.id);
    const storeState = this.rpg.ensureStoreState().factionStores[dataKey] || {};
    this.restock.setText(storeState.manualRestocked ? 'Restocked this turn' : 'Restock · 2 influence');
    if (storeState.manualRestocked || this.influence < 2) this.restock.disableInteractive().setAlpha(0.5);
    else this.restock.setInteractive({ useHandCursor: true }).setAlpha(1);
    if (!items.length) {
      this.storeCards.add(this.add.text(10, 30, 'No faction store stock is unlocked for this faction at the current total influence.', { fontSize: '14px', color: '#91a4b5' }));
      return;
    }
    items.forEach((item, index) => {
      const col = index % 4, row = Math.floor(index / 4), x = col * 305, y = row * 176;
      const card = this.add.rectangle(x + 143, y + 74, 286, 160, 0x192b3a, 0.98).setStrokeStyle(1, 0x34576b);
      this.storeCards.add(card);
      this.storeCards.add(this.add.image(x + 35, y + 48, rarityFrame(item.rarity)).setDisplaySize(58, 70));
      const iconKey = item.kind === 'unit' ? `faction_unit_${item.id}` : this.iconFor(item);
      if (this.textures.exists(iconKey)) {
        const source = this.textures.get(iconKey).getSourceImage();
        const size = getAspectFitDisplaySize(source.width, source.height, { width: 42, height: 52 });
        this.storeCards.add(this.add.image(x + 35, y + 48, iconKey).setDisplaySize(size.width, size.height));
      }
      this.storeCards.add(this.add.text(x + 70, y + 14, item.name, { fontSize: '13px', color: '#fff', fontStyle: 'bold', wordWrap: { width: 205 } }));
      const price = item.kind === 'unit' ? this.rpg.getFactionStoreUnitPrice(this.faction, item.id)
        : this.rpg.getFactionStoreEquipmentPrice(this.faction, item.id);
      const priceText = Number.isFinite(price) ? `${fmt(price)} influence` : 'Influence price not configured';
      this.storeCards.add(this.add.text(x + 70, y + 62, `${item.rarity || 'Unit'} · ${priceText}`, { fontSize: '11px', color: Number.isFinite(price) ? '#ffe27a' : '#f0b49b', wordWrap: { width: 205 } }));
      this.storeCards.add(this.add.text(x + 70, y + 98, item.kind === 'unit' ? 'UNIT' : String(item.type || item.kind).toUpperCase(), { fontSize: '10px', color: item.kind === 'unit' ? '#9ff0bd' : '#91a4b5' }));
      card.setInteractive({ useHandCursor: true }).on('pointerover', () => this.showDetails(item, price));
      card.on('pointerout', () => this.details.setText('Select or hover over a store item for details.'));
      if (item.kind === 'unit' || Number.isFinite(price)) {
        const isUnit = item.kind === 'unit';
        const alreadyOwned = isUnit ? false : Boolean(this.rpg.getItemInstance(item.id));
        const buy = this.addButton(x + 212, y + 124, isUnit ? (this.rpg.getOwnedUnit(item.id) ? 'BUY UNIT COPY' : 'BUY UNIT') : alreadyOwned ? 'OWNED' : 'BUY ITEM', () => isUnit ? this.buyUnit(item.id) : this.buyItem(item.id));
        buy.setFontSize('10px');
        const canBuy = Number.isFinite(price) && this.influence >= price && !alreadyOwned;
        if (!canBuy) buy.disableInteractive().setAlpha(0.45);
        this.storeCards.add(buy);
      } else {
        this.storeCards.add(this.add.text(x + 210, y + 126, 'PRICE UNAVAILABLE', { fontSize: '9px', color: '#f0b49b' }));
      }
    });
  }

  iconFor(item) {
    const type = String(item.damageType || item.statusEffects?.[0]?.type || '').toLowerCase();
    const key = `ui_icon_${type}`;
    return this.textures.exists(key) ? key : item.type === 'augment' ? 'ui_icon_star' : 'ui_icon_physical';
  }

  showDetails(item, price) {
    const effects = (item.effects || []).map(effect => `${effect.stat} ${effect.mode === 'percent' ? `${effect.value >= 0 ? '+' : ''}${fmt(effect.value * 100)}%` : `${effect.value >= 0 ? '+' : ''}${fmt(effect.value)}`}`);
    const special = [item.specialProperty?.property, ...(item.specialProperties || []).map(property => property.property)].filter(Boolean);
    const statuses = (item.statusEffects || []).map(effect => effect.type);
    const lines = [
      `${item.kind.toUpperCase()} · ${item.rarity || 'No rarity'} · ${Number.isFinite(price) ? `${fmt(price)} influence` : 'Influence price not configured'}`,
      item.kind === 'unit' ? Object.entries(item.baseStats || {}).map(([key, value]) => `${key}: ${fmt(value)}`).join(' · ') : '',
      item.damage !== undefined ? `${fmt(item.damage)} ${item.damageType || 'Physical'} damage · range ${fmt(item.range)} · ${fmt(item.attacksPerSecond)} attacks/sec · ${item.hands || 0}-handed` : '',
      [...effects, ...special, ...statuses].join(' · '), item.description || '',
    ].filter(Boolean);
    this.details.setText(`${item.name}\n${lines.join('\n')}`);
  }

  buyUnit(unitId) {
    const success = this.rpg.purchaseFactionUnit(this.faction, unitId);
    this.details.setText(success ? `${this.rpg.units[unitId].name} acquired. Current faction influence: ${fmt(getFactionInfluence(this.rpg.state.influence, this.faction))}.` : 'Purchase unavailable: check stock and available faction influence.');
    this.influence = getFactionInfluence(this.rpg.state.influence, this.faction);
    this.refreshStore();
  }

  buyItem(itemId) {
    const item = this.rpg.getItemDefinition(itemId);
    const success = this.rpg.purchaseFactionEquipment(this.faction, itemId);
    this.details.setText(success ? `${item?.name || itemId} purchased with faction influence.` : 'Purchase unavailable: this item has no configured influence price or insufficient influence.');
    this.influence = getFactionInfluence(this.rpg.state.influence, this.faction);
    this.refreshStore();
  }

  restockStore() {
    const success = this.rpg.restockFactionStore(this.faction);
    this.influence = getFactionInfluence(this.rpg.state.influence, this.faction);
    this.details.setText(success ? 'Faction stock refreshed for 2 influence.' : 'Restock unavailable: requires 2 influence and has already been used this turn.');
    this.refreshStore();
  }
}
