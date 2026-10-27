import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import RPGManager from '../systems/RPGManager.js';
import { preloadUiAssets, rarityFrame } from '../helpers/uiAssets.js';
import { displayFactionName } from '../utils/factions.js';

export default class StoreScene extends Phaser.Scene {
  constructor() { super('StoreScene'); }

  preload() { preloadUiAssets(this); }

  create() {
    this.rpgManager = new RPGManager(this);
    this.page = 0;
    this.add.rectangle(640, 360, 1280, 720, 0x101923, 0.98);
    this.add.text(640, 38, 'Store', { fontSize: '36px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.image(27, 101, 'ui_icon_credits').setDisplaySize(22, 28);
    this.balance = this.add.text(45, 90, '', { fontSize: '20px', color: '#ffe27a' });
    this.restockArt = this.add.image(940, 90, 'ui_btn_normal').setDisplaySize(150, 68);
    this.restockButton = this.addButton(940, 90, 'Cr', () => this.restock());
    this.restockButton.setBackgroundColor('rgba(0,0,0,0)');
    this.restockButton.setDepth(1);
    this.restockArt.setInteractive({ useHandCursor: true });
    this.restockArt.on('pointerover', () => this.restockArt.setTexture('ui_btn_hover'));
    this.restockArt.on('pointerout', () => this.restockArt.setTexture('ui_btn_normal'));
    this.restockArt.on('pointerdown', () => this.restockArt.setTexture('ui_btn_pressed'));
    this.status = this.add.text(640, 673, '', { fontSize: '17px', color: '#ffe27a' }).setOrigin(0.5);
    this.addButton(1100, 42, 'Back to Hub', () => this.scene.start('MainHubScene'));
    this.addButton(515, 673, '◀', () => { this.page = Math.max(0, this.page - 1); this.render(); });
    this.pageLabel = this.add.text(640, 673, '', { fontSize: '17px', color: '#ffffff' }).setOrigin(0.5);
    this.addButton(765, 673, '▶', () => { this.page = Math.min(this.pageCount - 1, this.page + 1); this.render(); });
    this.render();
  }

  ensureStock() {
    this.rpgManager.getCreditStoreStock();
  }

  restock() {
    const restocked = this.rpgManager.restockCreditStore();
    this.status.setText(restocked ? 'Stock refreshed.' : 'Restock unavailable: clear credit debt or earn more credits.');
    this.render();
  }

  addButton(x, y, label, callback) {
    const button = this.add.text(x, y, label, { fontSize: '18px', color: '#ffffff', backgroundColor: '#245b66', padding: { x: 12, y: 8 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    return button;
  }

  render() {
    this.ensureStock();
    this.rows?.forEach(row => row.destroy());
    this.rows = [];
    const stock = this.rpgManager.getCreditStoreStock();
    const equipment = stock.equipment.map(id => this.rpgManager.equipment.items[id]).filter(Boolean)
      .map(item => ({ ...item, type: 'equipment', cost: this.rpgManager.getEquipmentCreditCost(item.id) }));
    const augments = stock.augments.map(id => this.rpgManager.equipment.augments[id]).filter(Boolean)
      .map(item => ({ ...item, type: 'augment', cost: this.rpgManager.getEquipmentCreditCost(item.id) }));
    const units = stock.units.map(id => this.rpgManager.units[id]).filter(Boolean)
      .map(unit => ({ ...unit, type: 'unit', cost: this.rpgManager.getUnitCreditCost(unit.id) }));
    const entries = [...equipment, ...units, ...augments]
      .filter(item => item.cost !== null);
    this.pageCount = Math.max(1, Math.ceil(entries.length / 6));
    this.page = Math.min(this.page, this.pageCount - 1);
    this.balance.setText(`Credits: ${fmt(this.rpgManager.state.credits, 'floor')}`);
    const restockCost = this.rpgManager.getCreditStoreRestockCost();
    const hasDebt = this.rpgManager.state.credits < 0;
    this.restockButton.setText(`${fmt(restockCost, 'floor')} Cr`);
    this.setButtonEnabled(this.restockButton, !hasDebt && this.rpgManager.state.credits >= restockCost);
    this.pageLabel.setText(`${fmt(this.page + 1)} / ${fmt(this.pageCount)}`);
    entries.slice(this.page * 6, this.page * 6 + 6).forEach((item, index) => {
      const x = index % 2 ? 670 : 40;
      const y = 130 + Math.floor(index / 2) * 170;
      const frame = this.add.image(x + 35, y + 76, rarityFrame(item.rarity)).setDisplaySize(62, 82);
      const condition = (item.statusEffects || []).map(effect => effect.type).find(type =>
        ['acid', 'bleeding', 'poison', 'slowed', 'exposed'].includes(String(type).toLowerCase()));
      const portraitType = String(condition || item.damageType || '').toLowerCase();
      const portraitKey = ['acid', 'bleeding', 'poison', 'slowed', 'exposed'].includes(portraitType)
        ? `ui_icon_${portraitType}`
        : portraitType === 'physical' ? 'ui_icon_physical'
          : item.type === 'unit' ? 'ui_icon_star' : null;
      const portrait = portraitKey ? this.add.image(x + 35, y + 76, portraitKey).setDisplaySize(32, 36) : null;
      const name = this.add.text(x + 80, y, `${item.name}  ·  ${item.rarity || 'Unit'}`, { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' });
      const stats = item.type === 'unit'
        ? `Unit  |  ${displayFactionName(item.faction)}  |  ${Object.entries(item.baseStats || {}).slice(0, 4).map(([key, value]) => `${key} ${fmt(value)}`).join(', ')}`
        : `${item.type}  |  ${item.hands ? `${fmt(item.hands)}-handed, ` : ''}${item.damage !== undefined ? `${fmt(item.damage)} ${item.damageType} damage, range ${fmt(item.range)}` : item.effects?.map(effect => `${effect.stat} ${fmt(effect.value)}`).join(', ') || item.specialProperty?.property || item.specialProperties?.map(effect => effect.property).join(', ') || item.description || 'Effect details in item data'}`;
      const detail = this.add.text(x + 80, y + 32, `${stats}\nPrice: ${fmt(item.cost, 'floor')} Cr`, { fontSize: '15px', color: '#d8e6ef', wordWrap: { width: 375 } });
      const owned = item.type !== 'unit' && Boolean(this.rpgManager.getItemInstance(item.id));
      const affordable = !hasDebt && !owned && this.rpgManager.state.credits >= item.cost;
      const buy = this.addButton(x + 515, y + 20, owned ? 'Owned' : hasDebt ? 'Debt' : affordable ? 'Buy' : 'Need credits', () => {
        const purchased = item.type === 'unit' ? this.rpgManager.purchaseUnit(item.id) : this.rpgManager.purchaseEquipment(item.id);
        this.status.setText(purchased ? `${item.name} copy purchased.` : 'Purchase unavailable.');
        this.render();
      });
      this.setButtonEnabled(buy, affordable);
      this.rows.push(frame, ...(portrait ? [portrait] : []), name, detail, buy);
    });
  }

  setButtonEnabled(button, enabled) {
    button.setAlpha(enabled ? 1 : 0.5);
    if (button === this.restockButton && this.restockArt) {
      this.restockArt.setAlpha(enabled ? 1 : 0.5);
      if (!enabled) this.restockArt.setTexture('ui_btn_disabled');
      else if (this.restockArt.input?.pointerOver) this.restockArt.setTexture('ui_btn_hover');
      else this.restockArt.setTexture('ui_btn_normal');
    }
    if (enabled) button.setInteractive({ useHandCursor: true });
    else button.disableInteractive();
  }
}
