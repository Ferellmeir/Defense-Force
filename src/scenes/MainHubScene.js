import Phaser from 'phaser';
import { fmt } from '../utils/formatNumber.js';
import { displayFactionName, FACTIONS, getFactionInfluence } from '../utils/factions.js';
import { rarityFrame, preloadUiAssets } from '../helpers/uiAssets.js';
import RPGManager from '../systems/RPGManager.js';
import { getAspectFitDisplaySize } from '../utils/visualSize.js';
import { FACTION_PAGE_BACKGROUNDS } from '../utils/screenBackgrounds.js';

const COLORS = { gold: '#ffe27a', pale: '#d8e6ef', muted: '#91a4b5', teal: 0x245b66, panel: 0x142536 };

export default class MainHubScene extends Phaser.Scene {
  constructor() { super('MainHubScene'); }

  preload() {
    preloadUiAssets(this);
    Object.values(window.GAME_SETTINGS.UNITS).forEach(unit => {
      if (unit.characterArt) this.load.image(`hub_unit_${unit.id}`, `assets/${unit.asset || unit.id}.png`);
    });
  }

  create() {
    this.rpgManager = new RPGManager(this);
    this.cameras.main.setBackgroundColor('#101923');
    this.add.rectangle(640, 360, 1280, 720, 0x101923, 0.98);
    this.add.image(640, 360, 'ui_panel_9').setDisplaySize(1280, 720).setAlpha(0.2);
    this.setupLineup();
    this.setupStatusBar();
    this.setupStore();
    this.setupDetails();
    this.setupNavigation();
    this.renderStore();
  }

  setupStatusBar() {
    this.add.rectangle(640, 43, 1236, 64, 0x0b1722, 0.98).setStrokeStyle(1, 0x315267);
    this.add.image(46, 42, 'ui_icon_credits').setDisplaySize(27, 32);
    this.creditLabel = this.add.text(67, 27, `Credits  ${fmt(this.rpgManager.state.credits)}`, {
      fontSize: '19px', color: COLORS.gold, fontStyle: 'bold',
    }).setInteractive({ useHandCursor: true });
    this.creditLabel.on('pointerover', () => this.showCreditDetails());
    this.creditLabel.on('pointerout', () => this.clearDetails());
    FACTIONS.forEach((faction, index) => {
      const x = 290 + index * 235;
      this.add.image(x, 42, 'ui_icon_influence').setDisplaySize(19, 21);
      const influence = getFactionInfluence(this.rpgManager.state.influence, faction);
      const label = this.add.text(x + 16, 30, `${faction}: ${fmt(influence)}`, {
        fontSize: '16px', color: '#dce9f2',
      }).setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.showFactionDetails(faction, influence));
      label.on('pointerout', () => this.clearDetails());
    });
  }

  setupLineup() {
    this.add.text(24, 105, 'DEPLOYMENT LINEUP', { fontSize: '20px', color: COLORS.gold, fontStyle: 'bold' });
    this.add.text(24, 131, 'Up to five units · select to configure', { fontSize: '13px', color: COLORS.muted });
    this.lineup = this.getLineup();
    this.lineupSlots = [];
    for (let index = 0; index < 5; index += 1) {
      const x = 26 + index * 84;
      const y = 166;
      const card = this.add.rectangle(x + 36, y + 66, 76, 138, 0x1b2c3b, 0.95)
        .setStrokeStyle(1, this.lineup[index] ? 0x52788e : 0x53616b);
      if (this.lineup[index]) {
        const entry = this.lineup[index];
        const definition = this.rpgManager.getUnitDefinition(entry.unitId);
        const artKey = `hub_unit_${entry.unitId}`;
        if (this.textures.exists(artKey)) {
          const source = this.textures.get(artKey).getSourceImage();
          const size = getAspectFitDisplaySize(source.width, source.height, { width: 56, height: 56 });
          this.add.image(x + 36, y + 51, artKey).setDisplaySize(size.width, size.height);
        }
        this.add.text(x + 36, y + 92, definition?.name || entry.unitId, {
          fontSize: '11px', color: '#ffffff', align: 'center', wordWrap: { width: 70 },
        }).setOrigin(0.5, 0);
        this.add.text(x + 36, y + 125, displayFactionName(definition?.faction), {
          fontSize: '9px', color: COLORS.muted, align: 'center', wordWrap: { width: 72 },
        }).setOrigin(0.5, 0);
        card.setInteractive({ useHandCursor: true });
        card.on('pointerover', () => this.showUnitDetails(entry));
        card.on('pointerout', () => this.clearDetails());
        card.on('pointerdown', () => this.openDeployment());
      } else {
        this.add.text(x + 36, y + 58, 'EMPTY', { fontSize: '11px', color: '#91a0ac' }).setOrigin(0.5);
        this.add.text(x + 36, y + 88, `SLOT ${index + 1}`, { fontSize: '10px', color: '#6e7e8c' }).setOrigin(0.5);
        card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openDeployment());
      }
      this.lineupSlots.push(card);
    }
  }

  getLineup() {
    const saved = this.registry.get('missionRoster');
    const configured = this.rpgManager.state.deploymentLineup;
    if (Array.isArray(configured) && configured.some(Boolean)) {
      const lineup = Array.from({ length: 5 }, (_, index) => {
        const unitId = configured[index];
        return unitId && this.rpgManager.getOwnedUnit(unitId) ? this.makeDeployment(unitId, `hub-${index}`) : null;
      });
      this.registry.set('missionRoster', lineup.filter(Boolean));
      return lineup;
    }
    let lineup = Array.isArray(saved) ? saved.map((entry, index) => typeof entry === 'string'
      ? this.makeDeployment(entry, `hub-${index}`) : entry)
      .filter(entry => entry && this.rpgManager.getOwnedUnit(entry.unitId)) : [];
    if (!lineup.length) {
      lineup = this.rpgManager.getRoster().filter(entry => entry.owned).slice(0, 5)
        .map((entry, index) => this.makeDeployment(entry.definition.id, `hub-${index}`));
      this.registry.set('missionRoster', lineup);
    }
    return lineup.slice(0, 5);
  }

  makeDeployment(unitId, deploymentId) {
    const owned = this.rpgManager.getOwnedUnit(unitId);
    const equipped = { ...(owned?.equipped || {}) };
    const weapons = ['left', 'right'].map(slot => equipped[slot]
      ? this.rpgManager.getItemDefinition(equipped[slot]) : null);
    return {
      deploymentId, unitId, equipped, augments: [...(owned?.augments || [])],
      equipment: {
        weapons,
        utility: equipped.utility ? this.rpgManager.getItemDefinition(equipped.utility) : null,
      },
    };
  }

  openDeployment() {
    if (!this.registry.get('selectedMap')) this.registry.set('selectedMap', 'forest');
    if (!this.registry.get('selectedDifficulty')) this.registry.set('selectedDifficulty', 'EASY');
    this.registry.set('deploymentReturnScene', 'MainHubScene');
    this.scene.start('DeploymentScene');
  }

  setupStore() {
    this.add.text(470, 105, 'CREDIT STORE', { fontSize: '20px', color: COLORS.gold, fontStyle: 'bold' });
    this.storeDescriptionLabel = this.add.text(635, 108, '', { fontSize: '13px', color: COLORS.muted });
    this.restockButton = this.add.text(1238, 105, '', {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#245b66', padding: { x: 8, y: 5 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.restockButton.on('pointerdown', () => {
      if (!this.rpgManager.restockCreditStore()) this.showMessage('Credit restock unavailable while in debt or with insufficient credits.');
      else this.renderStore();
    });
    this.storeCards = [];
  }

  getStoreEntries() {
    const stock = this.rpgManager.getCreditStoreStock();
    const equipment = (stock.equipment || []).map(id => ({ ...this.rpgManager.equipment.items[id], type: 'equipment' })).filter(item => item.id && !item.faction);
    const units = (stock.units || []).map(id => ({ ...this.rpgManager.units[id], type: 'unit' })).filter(item => item.id);
    const augments = (stock.augments || []).map(id => ({ ...this.rpgManager.equipment.augments[id], type: 'augment' })).filter(item => item.id && !item.faction);
    return [...equipment, ...units, ...augments];
  }

  renderStore() {
    this.storeCards.forEach(item => item.destroy());
    this.storeCards = [];
    const debt = this.rpgManager.state.credits < 0;
    this.storeDescriptionLabel.setText(this.rpgManager.state.firstUnitDiscountAvailable
      ? '4 equipment · 3 units · 1 augment · first unit 50% off'
      : '4 equipment · 3 units · 1 augment');
    const restockCost = this.rpgManager.getCreditStoreRestockCost();
    this.restockButton.setText(`Restock · ${fmt(restockCost)} Cr`)
      .setAlpha(debt || this.rpgManager.state.credits < restockCost ? 0.5 : 1);
    if (debt || this.rpgManager.state.credits < restockCost) this.restockButton.disableInteractive();
    else this.restockButton.setInteractive({ useHandCursor: true });
    const entries = this.getStoreEntries();
    entries.forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = 470 + col * 195;
      const y = 133 + row * 160;
      const bg = this.add.rectangle(x + 90, y + 67, 184, 148, 0x192b3a, 0.98)
        .setStrokeStyle(1, 0x34576b).setInteractive({ useHandCursor: true });
      const frame = this.add.image(x + 32, y + 47, rarityFrame(item.rarity)).setDisplaySize(54, 66);
      const iconKey = this.getItemIcon(item);
      let icon = null;
      if (this.textures.exists(iconKey)) {
        if (item.type === 'unit') {
          const source = this.textures.get(iconKey).getSourceImage();
          const size = getAspectFitDisplaySize(source.width, source.height, { width: 46, height: 46 });
          icon = this.add.image(x + 32, y + 46, iconKey).setDisplaySize(size.width, size.height);
        } else icon = this.add.image(x + 32, y + 46, iconKey).setDisplaySize(30, 34);
      }
      const rarity = item.type === 'unit' ? displayFactionName(item.faction) : `${item.rarity || 'Equipment'}`;
      const name = this.add.text(x + 64, y + 12, item.name, {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 112 },
      });
      const price = item.type === 'unit' ? this.rpgManager.getUnitCreditCost(item.id) : this.rpgManager.getEquipmentCreditCost(item.id);
      const owned = item.type !== 'unit' && Boolean(this.rpgManager.getItemInstance(item.id));
      const canBuy = !debt && !owned && Number.isFinite(price) && this.rpgManager.state.credits >= price;
      const meta = this.add.text(x + 64, y + 53, `${rarity}\n${fmt(price ?? item.cost)} Cr`, {
        fontSize: '11px', color: canBuy ? COLORS.gold : '#e78980', lineSpacing: 3,
      });
      const buy = this.add.text(x + 64, y + 103, owned ? 'OWNED' : debt ? 'DEBT' : canBuy ? 'BUY' : 'NEED CREDITS', {
        fontSize: '10px', color: canBuy ? '#9ff0bd' : '#9ba8b2', backgroundColor: canBuy ? '#1c583e' : '#3b4148',
        padding: { x: 6, y: 3 },
      }).setInteractive({ useHandCursor: canBuy });
      if (canBuy) buy.on('pointerdown', () => {
        const success = item.type === 'unit'
          ? this.rpgManager.purchaseUnit(item.id) : this.rpgManager.purchaseEquipment(item.id);
        this.showMessage(success ? `${item.name} purchased.` : 'Purchase unavailable.');
        this.renderStore();
        this.refreshStatus();
      });
      bg.on('pointerover', () => this.showItemDetails(item));
      bg.on('pointerout', () => this.clearDetails());
      [frame, ...(icon ? [icon] : []), name, meta, buy].forEach(object => {
        object.setDepth(1);
        object.setInteractive({ useHandCursor: object === buy && canBuy });
        object.on('pointerover', () => this.showItemDetails(item));
        object.on('pointerout', () => this.clearDetails());
      });
      this.storeCards.push(bg, frame, ...(icon ? [icon] : []), name, meta, buy);
    });
  }

  getItemIcon(item) {
    if (item.type === 'unit') return `hub_unit_${item.id}`;
    const type = String(item.damageType || item.statusEffects?.[0]?.type || '').toLowerCase();
    if (type && this.textures.exists(`ui_icon_${type}`)) return `ui_icon_${type}`;
    if (item.type === 'augment') return 'ui_icon_star';
    return 'ui_icon_physical';
  }

  setupDetails() {
    this.add.rectangle(640, 540, 1236, 160, 0x0b1722, 0.98).setStrokeStyle(1, 0x315267);
    this.detailTitle = this.add.text(32, 468, 'DETAILS', { fontSize: '15px', color: COLORS.gold, fontStyle: 'bold' });
    this.detailText = this.add.text(32, 491, 'Hover over credits, influence, a lineup slot, or a store option to inspect it.', {
      fontSize: '12px', color: COLORS.pale, wordWrap: { width: 1205 }, lineSpacing: 2,
    });
  }

  setDetails(title, text) {
    this.detailTitle.setText(title);
    this.detailText.setText(text);
  }

  clearDetails() {
    this.setDetails('DETAILS', 'Hover over credits, influence, a lineup slot, or a store option to inspect it.');
  }

  showCreditDetails() {
    const state = this.rpgManager.state;
    const breakdown = this.rpgManager.getTurnUpkeepBreakdown(this.lineup);
    const change = state.lastTurnCreditChange;
    const changeText = change === null ? 'No previous turn recorded'
      : `${change >= 0 ? 'Increased' : 'Decreased'} by ${fmt(Math.abs(change))} Cr`;
    const lastMission = breakdown.lastMission
      ? `Last mission launch (already charged): wages ${fmt(breakdown.lastMission.wages)} Cr, maintenance ${fmt(breakdown.lastMission.maintenance)} Cr.`
      : 'No mission expense breakdown recorded yet.';
    const previousCharges = state.lastTurnUpkeep
      ? `Previous turn close charged: interest ${fmt(state.lastTurnUpkeep.interest)} Cr, baseline upkeep ${fmt(state.lastTurnUpkeep.baseline)} Cr${state.lastTurnUpkeep.allegiance ? `, allegiance ${fmt(state.lastTurnUpkeep.allegiance)} Cr` : ''}${state.lastTurnUpkeep.allegianceCancelled ? `; allegiance to ${state.lastTurnUpkeep.allegianceFaction} cancelled because it could not be paid` : ''}.`
      : 'No prior turn-close upkeep recorded.';
    this.setDetails('CREDIT ACCOUNT', [
      `Balance: ${fmt(state.credits)} Cr  ·  Previous turn: ${changeText}`,
      `Expected next turn close: baseline upkeep ${fmt(breakdown.baseline)} Cr${breakdown.conditionalInterest ? `; debt interest ${fmt(breakdown.conditionalInterest)} Cr if the balance is still negative at report close` : ''}${breakdown.allegiance ? `; allegiance ${fmt(breakdown.allegiance)} Cr to ${state.allegiance}, paid only if the balance covers it` : ''}.`,
      `Current lineup mission launch estimate (charged when mission starts): wages ${fmt(breakdown.mission.wages)} Cr + maintenance ${fmt(breakdown.mission.maintenance)} Cr = ${fmt(breakdown.mission.total)} Cr.`,
      previousCharges,
      lastMission,
      'Credit purchases and credit restocks are unavailable while in debt. Mission wages and equipment maintenance are charged even if they increase debt.',
    ].join('\n'));
  }

  showFactionDetails(faction, influence) {
    const thresholds = [25, 50, 100, 200, 250];
    const next = thresholds.find(threshold => threshold > influence);
    const stock = this.rpgManager.getFactionStoreStock(faction);
    this.setDetails(`${faction.toUpperCase()} INFLUENCE`, [
      `Current influence: ${fmt(influence)}${next ? ` · ${fmt(next - influence)} to next store milestone (${next})` : ' · all listed store milestones reached'}.`,
      `Faction store data: ${stock.equipment.length} equipment, ${stock.units.length} units, ${stock.augments.length} augments currently eligible from faction-aligned content.`,
      ['Laisung Collective', 'Underworld Network'].includes(faction)
        ? 'Open this faction page for stock, unit purchases, and allegiance controls.'
        : 'This faction page is unavailable because faction-specific store content is not configured.',
    ].join('\n'));
  }

  showUnitDetails(entry) {
    const definition = this.rpgManager.getUnitDefinition(entry.unitId);
    const stats = this.rpgManager.getEffectiveStats(entry.unitId, {
      equipped: entry.equipped, equipment: entry.equipment, augments: entry.augments,
    });
    const equipmentIds = ['left', 'right', 'utility'].map(slot => entry.equipped?.[slot]).filter(Boolean);
    const equipment = equipmentIds.map(id => {
      const item = this.rpgManager.getItemDefinition(id);
      return `${item?.name || id}${this.effectText(item)}`;
    });
    const equippedWeapons = ['left', 'right'].map(slot => this.rpgManager.getItemDefinition(entry.equipped?.[slot])).filter(Boolean);
    const augments = (entry.augments || []).map(id => this.rpgManager.getItemDefinition(id))
      .filter(Boolean).map(item => {
        const eligible = (!item.requiredHands || equippedWeapons.some(weapon => weapon.hands === item.requiredHands))
          && (!item.requiredAttackType || equippedWeapons.some(weapon => weapon.attackType === item.requiredAttackType))
          && (!item.requiredDamageType || equippedWeapons.some(weapon => weapon.damageType === item.requiredDamageType));
        const requirement = [item.requiredHands ? `${item.requiredHands}-handed` : null, item.requiredAttackType, item.requiredDamageType]
          .filter(Boolean).join(' ');
        return `${item.name}${eligible ? this.effectText(item) : ` (inactive; requires ${requirement || 'a compatible weapon'})`}`;
      });
    const attackStats = (stats?.weaponAttacks || []).map(profile => {
      const name = String(profile.weaponId).startsWith('inherent-') ? 'Inherent attack' : this.rpgManager.getItemDefinition(profile.weaponId)?.name || 'Weapon';
      return `${name}: ${fmt(profile.damage)} ${profile.damageType} · range ${fmt(profile.range)} · ${fmt(profile.attackSpeed)} ms${profile.aoeRadius ? ` · splash ${fmt(profile.aoeRadius)} px at ${fmt((profile.aoeDamageMultiplier || 0) * 100)}%` : ''}`;
    });
    const paths = this.rpgManager.getPathTiers(entry.unitId).map(tier =>
      `Tier ${tier.tier}: ${tier.paths.map(path => path.id === 'random_path'
        ? 'Stat bonus (rolled on deployment)' : path.name).join(' / ')}`).join('\n');
    this.setDetails(`${definition?.name || entry.unitId} · ${displayFactionName(definition?.faction)}`, [
      `Rank ${fmt(stats?.rank ?? 0)}★ · Crit ${fmt((stats?.criticalChance || 0) * 100)}% · Crit modifier ${fmt((stats?.criticalModifier || 1) * 100)}% · Ranged skill ${fmt((stats?.rangedSkill || 0) * 100)}% · Reload ${fmt((stats?.reloadSpeed || 0) * 100)}%`,
      ...attackStats,
      `Passive: ${definition?.passive?.name || 'None'}${definition?.passive?.unimplemented ? ' (unimplemented: effect needs a definition)' : ''}`,
      `Equipped: ${equipment.join(' · ') || 'None'}${augments.length ? ` · Augments: ${augments.join(' · ')}` : ''}`,
      paths,
    ].join('\n'));
  }

  effectText(item) {
    const effects = (item?.effects || []).map(effect => `${effect.stat} ${effect.mode === 'percent' ? `${effect.value >= 0 ? '+' : ''}${fmt(effect.value * 100)}%` : `${effect.value >= 0 ? '+' : ''}${fmt(effect.value)}`}`);
    const specials = [item?.specialProperty?.property, ...(item?.specialProperties || []).map(effect => effect.property)].filter(Boolean);
    const statuses = (item?.statusEffects || []).map(effect => effect.type);
    const lines = [...effects, ...specials, ...statuses].filter(Boolean);
    return lines.length ? ` (${lines.join(', ')})` : '';
  }

  showItemDetails(item) {
    if (item.type === 'unit') {
      if (!this.rpgManager.getOwnedUnit(item.id)) {
        const stats = item.baseStats || {};
        const inherent = (item.inherentAttacks || []).map(attack =>
          `Inherent attack: ${fmt(attack.damage)} ${attack.damageType || 'Physical'} · range ${fmt(attack.range)} tiles · ${fmt(attack.attacksPerSecond)} attacks/sec · ${fmt(attack.aoeDamageMultiplier * 100)}% splash in ${fmt(attack.aoeRadius)} tile radius`);
        const paths = this.rpgManager.getPathTiers(item.id).map(tier =>
          `Tier ${tier.tier}: ${tier.paths.map(path => path.id === 'random_path'
            ? 'Stat bonus (rolled on deployment)' : path.name).join(' / ')}`).join('\n');
        this.setDetails(`${item.name} · ${displayFactionName(item.faction)} · ${fmt(this.rpgManager.getUnitCreditCost(item.id))} Cr`, [
          `Unit stats: attack speed ${fmt((stats.attackSpeedModifier || 0) * 100)}% · crit ${fmt((stats.criticalChance || 0) * 100)}% · crit modifier ${fmt((stats.criticalModifier || 0) * 100)}% · ranged skill ${fmt((stats.rangedSkill || 0) * 100)}% · reload ${fmt((stats.reloadSpeed || 0) * 100)}%`,
          ...inherent,
          `Passive: ${item.passive?.name || 'None'}${item.passive?.unimplemented ? ' (unimplemented: effect needs a definition)' : ''}`,
          paths,
        ].join('\n'));
        return;
      }
      this.showUnitDetails(this.makeDeployment(item.id, `preview-${item.id}`));
      return;
    }
    const lines = [
      `${item.type.toUpperCase()} · ${item.rarity || 'No rarity'} · ${fmt(item.cost)} Cr${item.faction ? ` · ${displayFactionName(item.faction)} aligned` : ''}`,
      item.damage !== undefined ? `${fmt(item.damage)} ${item.damageType || 'Physical'} damage · range ${fmt(item.range)} · ${fmt(item.attacksPerSecond)} attacks/sec · ${fmt((item.criticalChance || 0) * 100)}% crit · ${fmt((item.armorPenetration || 0) * 100)}% armor penetration` : '',
      item.hands ? `Requires ${fmt(item.hands)} hands` : '',
      item.requiredHands ? `Requirement: ${fmt(item.requiredHands)}-handed weapon` : '',
      item.requiredAttackType ? `Requirement: ${item.requiredAttackType} weapon` : '',
      item.requiredDamageType ? `Requirement: ${item.requiredDamageType} damage` : '',
      this.effectText(item),
      item.ammo?.requiresAmmo ? `Magazine: ${fmt(item.ammo.magazineCapacity)} · reload ${fmt(item.reloadSpeed)} sec` : '',
      item.description || '',
    ].filter(Boolean);
    this.setDetails(item.name, lines.join('\n'));
  }

  addLineupHint() {
    this.setDetails('DEPLOYMENT LINEUP', `${this.lineup.length} unit(s) in the current mission roster. Click any slot to edit the lineup and equipment.`);
  }

  showMessage(message) {
    this.setDetails('STORE', message);
  }

  refreshStatus() {
    this.creditLabel.setText(`Credits  ${fmt(this.rpgManager.state.credits)}`);
  }

  setupNavigation() {
    this.add.rectangle(640, 672, 1236, 70, 0x0b1722, 0.98).setStrokeStyle(1, 0x315267);
    const labels = [
      { text: 'Settings', enabled: false },
      { text: 'Missions', enabled: true, action: () => this.scene.start('MapSelectScene') },
      ...FACTIONS.map(faction => ({ text: faction, enabled: Boolean(FACTION_PAGE_BACKGROUNDS[faction]), action: () => {
        this.registry.set('factionPage', faction);
        this.scene.start('FactionScene', { faction });
      } })),
    ];
    labels.forEach((entry, index) => {
      const x = 100 + index * 216;
      const enabled = entry.enabled;
      const button = this.add.text(x, 672, entry.text, {
        fontSize: '13px', color: enabled ? '#ffffff' : '#8493a0',
        backgroundColor: enabled ? '#245b66' : '#28333c', padding: { x: 10, y: 8 },
      }).setOrigin(0.5);
      if (enabled) button.setInteractive({ useHandCursor: true }).on('pointerdown', entry.action);
    });
  }
}
