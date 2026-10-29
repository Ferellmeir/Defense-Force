import { getProjectileSpeed } from './ProjectileSpeeds.js';
import { settleMissionState } from './missionSettlement.js';
import { generateFactionStoreStock, generateStoreStock } from './storeStock.js';
import { FACTIONS, displayFactionName, factionDataName, getFactionInfluence } from '../utils/factions.js';
import { createMissionBoard } from './missionBoard.js';
import { getUnitRankProgress, MAX_UNIT_STARS } from './unitRankProgress.js';

const SAVE_KEY = 'scifi-tower-defense-rpg-v1';
const VETERANCY_XP_BASE = 10;
const VETERANCY_XP_GROWTH = 1.6;
const VETERANCY_FORCE_GROWTH = 1.6;
const RANDOM_PATH_BONUSES = [
  { stat: 'criticalChance', value: 0.05 },
  { stat: 'criticalModifier', value: 0.20 },
  { stat: 'attackSpeedModifier', value: 0.10 },
  { stat: 'range', value: 0.4 },
  { stat: 'reloadSpeed', value: 1 / 1.1, mode: 'multiplier' },
];
const RANDOM_STAT_NAMES = {
  criticalChance: 'Critical Chance',
  criticalModifier: 'Critical Damage',
  attackSpeedModifier: 'Attack Speed',
  range: 'Range',
  reloadSpeed: 'Reload Speed',
};

function describeRandomStat(bonus) {
  if (!bonus?.stat) return null;
  const name = RANDOM_STAT_NAMES[bonus.stat] || bonus.stat;
  if (bonus.mode === 'multiplier') {
    const percent = Math.round((1 / Number(bonus.value || 1) - 1) * 100);
    return `${name} +${percent}%`;
  }
  if (bonus.stat === 'range') return `${name} +${Number(bonus.value)} tiles`;
  return `${name} +${Math.round(Number(bonus.value || 0) * 100)}%`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default class RPGManager {
  constructor(scene) {
    this.scene = scene;
    this.units = window.GAME_SETTINGS.UNITS;
    this.equipment = window.GAME_SETTINGS.EQUIPMENT;
    this.state = this.loadState();
  }

  createDefaultState() {
    return {
      units: {}, inventory: [], credits: 200, influence: {}, totalInfluence: {}, firstUnitDiscountAvailable: true,
      lastSettledMissionId: null, turnNumber: 0, turnStartCredits: 200,
      lastTurnCreditChange: null, lastTurnUpkeep: null, lastMissionCostBreakdown: null,
      lastAdvancedMissionId: null,
      deploymentLineup: [],
      allegiance: null,
      lastAllegiancePayment: null,
      availableMissions: null,
      storeState: { creditStock: null, creditStockVersion: 2, creditRestocksThisTurn: 0, factionStores: {} },
    };
  }

  loadState() {
    const defaults = this.createDefaultState();
    try {
      const stored = window.localStorage.getItem(SAVE_KEY);
      if (!stored) {
        this.state = defaults;
        this.save();
        return defaults;
      }
      const parsed = JSON.parse(stored);
      const savedUnits = parsed.units || {};
      const units = Object.fromEntries(
        Object.entries(savedUnits)
          .filter(([unitId, savedUnit]) => this.units[unitId] && savedUnit)
          .map(([unitId, savedUnit]) => {
            const persistentData = { ...savedUnit };
            const { stars, extraCopies } = getUnitRankProgress(savedUnit);
            // `copies` is an older opaque field; only extraCopies has defined
            // threshold semantics. Preserve the legacy field but do not use it
            // to invent rank progress when loading an old save.
            delete persistentData.level;
            delete persistentData.veterancy;
            delete persistentData.xp;
            delete persistentData.experience;
            delete persistentData.selectedPaths;
            delete persistentData.pathProgress;
            delete persistentData.pathTierSelection;
            delete persistentData.deploymentCost;
            delete persistentData.investedForce;
            return [unitId, {
              ...persistentData,
              id: unitId,
              stars,
              rank: stars,
              extraCopies,
              extraPassiveUnlocked: stars === 5,
            }];
          })
      );
      const state = {
        ...defaults,
        ...parsed,
        units,
        inventory: (parsed.inventory || []).filter(instance => !this.isPermanentlyAvailable(this.getItemDefinition(instance.itemId))),
        deploymentLineup: Array.isArray(parsed.deploymentLineup)
          ? parsed.deploymentLineup.slice(0, 5).map((entry, index) => {
            const unitId = typeof entry === 'string' ? entry : entry?.unitId;
            if (!this.getUnitDefinition(unitId) || !this.getOwnedUnitFrom(savedUnits, unitId)) return null;
            const owned = savedUnits[unitId];
            return {
              deploymentId: entry?.deploymentId || `lineup-${index}`,
              unitId,
              equipped: clone(entry?.equipped || owned.equipped || { left: null, right: null, utility: null }),
              augments: clone(entry?.augments || owned.augments || []),
            };
          })
          : [],
        credits: Number.isFinite(parsed.credits) ? parsed.credits : defaults.credits,
        influence: parsed.influence && typeof parsed.influence === 'object' ? parsed.influence : {},
        lastSettledMissionId: parsed.lastSettledMissionId || null,
        firstUnitDiscountAvailable: parsed.firstUnitDiscountAvailable !== false,
      };
      state.turnNumber = Math.max(0, Math.floor(Number(parsed.turnNumber) || 0));
      state.totalInfluence = parsed.totalInfluence && typeof parsed.totalInfluence === 'object'
        ? parsed.totalInfluence : { ...state.influence };
      state.turnStartCredits = Number.isFinite(parsed.turnStartCredits) ? parsed.turnStartCredits : state.credits;
      state.lastTurnCreditChange = Number.isFinite(parsed.lastTurnCreditChange) ? parsed.lastTurnCreditChange : null;
      state.lastTurnUpkeep = parsed.lastTurnUpkeep && typeof parsed.lastTurnUpkeep === 'object' ? parsed.lastTurnUpkeep : null;
      state.lastMissionCostBreakdown = parsed.lastMissionCostBreakdown && typeof parsed.lastMissionCostBreakdown === 'object' ? parsed.lastMissionCostBreakdown : null;
      state.lastAdvancedMissionId = parsed.lastAdvancedMissionId || null;
      state.allegiance = FACTIONS.includes(displayFactionName(parsed.allegiance)) ? displayFactionName(parsed.allegiance) : null;
      state.lastAllegiancePayment = parsed.lastAllegiancePayment && typeof parsed.lastAllegiancePayment === 'object' ? parsed.lastAllegiancePayment : null;
      state.availableMissions = Array.isArray(parsed.availableMissions) ? parsed.availableMissions : null;
      state.storeState = {
        ...defaults.storeState,
        ...(parsed.storeState || {}),
        creditStockVersion: Math.max(0, Math.floor(Number(parsed.storeState?.creditStockVersion) || 0)),
        creditRestocksThisTurn: Math.max(0, Math.floor(Number(parsed.storeState?.creditRestocksThisTurn) || 0)),
        factionStores: parsed.storeState?.factionStores && typeof parsed.storeState.factionStores === 'object'
          ? parsed.storeState.factionStores : {},
      };
      return state;
    } catch (error) {
      console.warn('[RPGManager] Could not load save data:', error);
      return defaults;
    }
  }

  save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[RPGManager] Could not save RPG data:', error);
    }
  }

  getRoster() {
    return Object.values(this.units).map(unit => ({ definition: unit, owned: this.state.units[unit.id] || null }));
  }

  getAvailableMissions(random = Math.random) {
    const board = this.state.availableMissions;
    const complete = Array.isArray(board) && board.length === FACTIONS.length * 3
      && FACTIONS.every(faction => board.filter(mission => mission?.faction === faction).length === 3);
    if (!complete) {
      this.state.availableMissions = createMissionBoard({
        turnNumber: this.state.turnNumber, units: this.units, equipment: this.equipment, random,
      });
      this.save();
    }
    return this.state.availableMissions;
  }

  startNewGame() {
    window.localStorage.removeItem(SAVE_KEY);
    this.state = this.createDefaultState();
    this.save();
    return this.state;
  }

  isPermanentlyAvailable(item) {
    return item?.rarity === 'MAKESHIFT';
  }

  settleMission({ missionId, victory, difficulty, unitIds, missionFaction, rewardMultiplier = 1, random = Math.random }) {
    const result = settleMissionState(this.state, {
      missionId,
      victory,
      difficulty,
      unitIds,
      missionFaction,
      rewardMultiplier,
      units: this.units,
      equipment: this.equipment,
      addUnitCopy: (unitId, count = 1) => this.addUnitCopy(unitId, count),
      random,
    });
    if (!result) return null;
    this.save();
    return result;
  }

  getUnitCreditCost(unitId) {
    const unit = this.getUnitDefinition(unitId);
    if (!unit || !Number.isFinite(Number(unit.cost))) return null;
    const baseCost = Number(unit.cost) * 4.2;
    return this.state.firstUnitDiscountAvailable ? baseCost * 0.5 : baseCost;
  }

  getDeploymentForceCost(unitId, loadout = null) {
    const definition = this.getUnitDefinition(unitId);
    const owned = this.getOwnedUnit(unitId);
    const baseCost = Number(definition?.cost);
    if (!definition || !owned || !Number.isFinite(baseCost) || baseCost < 0) return null;

    const getPricedCost = item => {
      const cost = Number(item?.cost);
      // Free/unpriced makeshift equipment has a zero priced component; the
      // minimum Force increase below still applies to equipped weapons.
      return Number.isFinite(cost) && cost >= 0 ? cost : 0;
    };
    const items = this.equipment.items || {};
    const equipped = loadout?.equipped || owned.equipped || {};
    const weaponIds = loadout?.equipment?.weapons
      ? loadout.equipment.weapons.filter(Boolean).map(item => item.id)
      : [equipped.left, equipped.right].filter(Boolean);
    const chargedTwoHanded = new Set();
    const weaponIncrease = weaponIds.reduce((total, itemId) => {
      const weapon = items[itemId];
      if (weapon?.type !== 'weapon') return total;
      if (weapon.hands === 2) {
        if (chargedTwoHanded.has(itemId)) return total;
        chargedTwoHanded.add(itemId);
      }
      const minimum = weapon.hands === 2 ? 8 : 4;
      return total + Math.max(getPricedCost(weapon) / 4.2, minimum);
    }, 0);

    const utility = loadout?.equipment?.utility || this.getItemDefinition(equipped.utility);
    const utilityIncrease = utility?.type === 'utility'
      ? Math.max(getPricedCost(utility) / 8.4, 1)
      : 0;

    const augmentIncrease = (loadout?.augments || owned.augments || []).reduce((total, augmentId) => {
      const modifier = Number(this.equipment.augments[augmentId]?.forceCostModifier);
      return total + (Number.isFinite(modifier) ? modifier : 0);
    }, 0);

    // GAME_RULES.md specifies no default augment premium, and the current
    // equipment data defines no explicit augment Force-cost modifier.
    return baseCost + weaponIncrease + utilityIncrease + augmentIncrease;
  }

  purchaseUnit(unitId) {
    const definition = this.getUnitDefinition(unitId);
    if (!definition) return false;
    const cost = this.getUnitCreditCost(unitId);
    if (!Number.isFinite(cost) || this.state.credits < 0 || this.state.credits < cost) return false;
    this.state.credits -= cost;
    this.state.firstUnitDiscountAvailable = false;
    this.addUnitCopy(unitId);
    return true;
  }

  getEquipmentCreditCost(itemId) {
    const item = this.equipment.items[itemId] || this.equipment.augments[itemId];
    if (!item || item.faction || this.isPermanentlyAvailable(item)) return null;
    const cost = item?.cost;
    return item && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
  }

  purchaseEquipment(itemId) {
    const item = this.getItemDefinition(itemId);
    const cost = this.getEquipmentCreditCost(itemId);
    if (!item || item.faction || this.isPermanentlyAvailable(item) || cost === null || this.getItemInstance(itemId) || this.state.credits < 0 || this.state.credits < cost) return false;
    this.state.credits -= cost;
    this.state.inventory.push({ itemId, durability: item.durability ?? null });
    this.save();
    return true;
  }

  spendCredits(amount) {
    if (!Number.isFinite(amount) || amount < 0 || this.state.credits < 0 || this.state.credits < amount) return false;
    this.state.credits -= amount;
    this.save();
    return true;
  }

  getMissionCreditCost(unitIds) {
    if (!Array.isArray(unitIds) || unitIds.some(entry => {
      const id = typeof entry === 'string' ? entry : entry?.unitId;
      return !this.getUnitDefinition(id) || !this.getOwnedUnit(id);
    })) return null;
    return unitIds.reduce((total, entry) => {
      const unitId = typeof entry === 'string' ? entry : entry?.unitId;
      const forceCost = Number(this.getUnitDefinition(unitId)?.cost);
      return total + (Number.isFinite(forceCost) ? forceCost * 4.2 * 0.25 : 0);
    }, 0);
  }

  getMissionCostBreakdown(deployments = []) {
    const wages = this.getMissionCreditCost(deployments);
    if (wages === null) return { wages: null, maintenance: 0, total: null };
    let maintenance = 0;
    const maintenanceRates = { COMMON: 0.1, UNCOMMON: 0.08, RARE: 0.06, EXOTIC: 0.04, LEGENDARY: 0.03 };
    deployments.forEach(entry => {
      const equipmentIds = new Set();
      if (!entry || typeof entry === 'string') {
        const owned = this.getOwnedUnit(typeof entry === 'string' ? entry : '');
        ['left', 'right', 'utility'].forEach(slot => { if (owned?.equipped?.[slot]) equipmentIds.add(owned.equipped[slot]); });
        (owned?.augments || []).forEach(id => equipmentIds.add(id));
      } else {
        ['left', 'right', 'utility'].forEach(slot => { if (entry.equipped?.[slot]) equipmentIds.add(entry.equipped[slot]); });
        (entry.augments || []).forEach(id => equipmentIds.add(id));
        if (!entry.equipped && entry.equipment) {
          (entry.equipment.weapons || []).filter(Boolean).forEach(item => equipmentIds.add(item.id));
          if (entry.equipment.utility?.id) equipmentIds.add(entry.equipment.utility.id);
        }
      }
      equipmentIds.forEach(id => {
        const item = this.getItemDefinition(id);
        const cost = Number(item?.cost);
        const rate = maintenanceRates[item?.rarity] || 0;
        if (Number.isFinite(cost) && cost > 0) maintenance += cost * rate;
      });
    });
    return { wages, maintenance, total: wages + maintenance };
  }

  chargeMissionCosts(deployments) {
    const breakdown = this.getMissionCostBreakdown(deployments);
    if (!Number.isFinite(breakdown.total)) return false;
    this.state.credits -= breakdown.total;
    this.state.lastMissionCostBreakdown = { ...breakdown };
    this.save();
    return true;
  }

  getBaselineUpkeep() {
    const value = Object.values(this.state.units).reduce((total, owned) => {
      const unit = this.getUnitDefinition(owned.id);
      if (!unit) return total;
      const creditValue = Number(unit.cost) * 4.2;
      const stars = Math.max(0, Math.min(5, Number(owned.stars ?? owned.rank) || 0));
      return total + creditValue * (1 + 0.2 * stars);
    }, 0);
    return value * 0.025;
  }

  getTurnUpkeepBreakdown(deployments = []) {
    const mission = this.getMissionCostBreakdown(deployments);
    return {
      baseline: this.getBaselineUpkeep(),
      conditionalInterest: this.state.credits < 0 ? -this.state.credits * 0.1 : 0,
      allegiance: this.state.allegiance ? this.getBaselineUpkeep() * 2 : 0,
      mission,
      lastMission: this.state.lastMissionCostBreakdown,
    };
  }

  ensureStoreState() {
    if (!this.state.storeState || typeof this.state.storeState !== 'object') {
      this.state.storeState = { creditStock: null, creditStockVersion: 2, creditRestocksThisTurn: 0, factionStores: {} };
    }
    this.state.storeState.factionStores ||= {};
    return this.state.storeState;
  }

  getCreditStoreStock(random = Math.random) {
    const stores = this.ensureStoreState();
    if (!stores.creditStock || stores.creditStockVersion < 2) {
      stores.creditStock = generateStoreStock({ equipment: this.equipment, units: this.units, state: this.state, random });
      stores.creditStockVersion = 2;
    }
    this.save();
    return stores.creditStock;
  }

  getCreditStoreRestockCost() {
    return 15 + 10 * Math.max(0, Number(this.ensureStoreState().creditRestocksThisTurn) || 0);
  }

  restockCreditStore(random = Math.random) {
    if (this.state.credits < 0) return false;
    const cost = this.getCreditStoreRestockCost();
    if (!this.spendCredits(cost)) return false;
    const stores = this.ensureStoreState();
    stores.creditStock = generateStoreStock({ equipment: this.equipment, units: this.units, state: this.state, random });
    stores.creditStockVersion = 2;
    stores.creditRestocksThisTurn += 1;
    this.save();
    return true;
  }

  getFactionStoreStock(faction, random = Math.random) {
    const canonicalFaction = factionDataName(faction);
    const stores = this.ensureStoreState();
    const factionState = stores.factionStores[canonicalFaction] ||= { stock: null, manualRestocked: false };
    if (!factionState.stock) factionState.stock = generateFactionStoreStock({
      faction, equipment: this.equipment, units: this.units,
      influence: getFactionInfluence(this.state.totalInfluence, faction), random,
    });
    this.save();
    return factionState.stock;
  }

  getFactionStoreDiscount(faction) {
    return getFactionInfluence(this.state.totalInfluence, faction) >= 50 ? 0.1 : 0;
  }

  getFactionStoreUnitPrice(faction, unitId) {
    const unit = this.getUnitDefinition(unitId);
    const factionKey = factionDataName(faction);
    if (!unit || unit.faction !== factionKey || !this.getFactionStoreStock(faction).units.includes(unitId)) return null;
    return Number(unit.cost) * (1 - this.getFactionStoreDiscount(faction));
  }

  purchaseFactionUnit(faction, unitId) {
    const price = this.getFactionStoreUnitPrice(faction, unitId);
    const influence = getFactionInfluence(this.state.influence, faction);
    if (!Number.isFinite(price) || price < 0 || influence < price) return false;
    const influenceKeys = this.getFactionInfluenceKeys(faction);
    const influenceKey = influenceKeys.find(key => Number.isFinite(Number(this.state.influence[key])))
      || factionDataName(faction);
    this.state.influence[influenceKey] = influence - price;
    this.addUnitCopy(unitId);
    this.save();
    return true;
  }

  getFactionStoreEquipmentPrice(faction, itemId) {
    const item = this.getItemDefinition(itemId);
    const stock = this.getFactionStoreStock(faction);
    const inStock = stock.equipment.includes(itemId) || stock.augments.includes(itemId);
    if (!item || !inStock || item.faction !== factionDataName(faction)) return null;
    const cost = Number(item.cost);
    return Number.isFinite(cost) && cost >= 0
      ? cost * (1 - this.getFactionStoreDiscount(faction)) : null;
  }

  purchaseFactionEquipment(faction, itemId) {
    const item = this.getItemDefinition(itemId);
    const price = this.getFactionStoreEquipmentPrice(faction, itemId);
    const influence = getFactionInfluence(this.state.influence, faction);
    if (!item || !Number.isFinite(price) || this.getItemInstance(itemId) || influence < price) return false;
    const key = this.getFactionInfluenceKeys(faction).find(candidate => Number.isFinite(Number(this.state.influence[candidate])))
      || factionDataName(faction);
    this.state.influence[key] = influence - price;
    this.state.inventory.push({ itemId, durability: item.durability ?? null });
    this.save();
    return true;
  }

  restockFactionStore(faction, random = Math.random) {
    const canonicalFaction = factionDataName(faction);
    if (!FACTIONS.includes(faction) && !FACTIONS.includes(displayFactionName(faction))) return false;
    const influence = getFactionInfluence(this.state.influence, faction);
    const stores = this.ensureStoreState();
    const factionState = stores.factionStores[canonicalFaction] ||= { stock: null, manualRestocked: false };
    if (factionState.manualRestocked || influence < 2) return false;
    const influenceKeys = this.getFactionInfluenceKeys(faction);
    const influenceKey = influenceKeys.find(key => Number.isFinite(Number(this.state.influence[key]))) || canonicalFaction;
    this.state.influence[influenceKey] = influence - 2;
    factionState.stock = generateFactionStoreStock({ faction, equipment: this.equipment, units: this.units, influence: getFactionInfluence(this.state.totalInfluence, faction), random });
    factionState.manualRestocked = true;
    this.save();
    return true;
  }

  getFactionInfluenceKeys(faction) {
    const name = displayFactionName(faction);
    const keys = [name, factionDataName(name)];
    if (name === 'Laisung Collective') keys.push('Nihon Collective');
    if (name === 'Underworld Network') keys.push('Sewer Rats');
    return [...new Set(keys)];
  }

  setAllegiance(faction) {
    const name = displayFactionName(faction);
    if (!FACTIONS.includes(name) || this.state.credits < 0) return false;
    this.state.allegiance = name;
    this.save();
    return true;
  }

  advanceTurn(missionId, random = Math.random) {
    if (!missionId || this.state.lastAdvancedMissionId === missionId) return null;
    const interest = this.state.credits < 0 ? -this.state.credits * 0.1 : 0;
    this.state.credits -= interest;
    const baseline = this.getBaselineUpkeep();
    this.state.credits -= baseline;
    let allegianceCost = 0;
    let allegianceCancelled = false;
    const allegianceFaction = this.state.allegiance;
    if (allegianceFaction) {
      const due = baseline * 2;
      if (this.state.credits < 0 || this.state.credits < due) {
        this.state.allegiance = null;
        allegianceCancelled = true;
      } else {
        allegianceCost = due;
        this.state.credits -= due;
        const key = this.getFactionInfluenceKeys(allegianceFaction).find(candidate => Number.isFinite(Number(this.state.influence[candidate])))
          || factionDataName(allegianceFaction);
        const gain = due;
        this.state.influence[key] = (Number(this.state.influence[key]) || 0) + gain;
        this.state.totalInfluence[key] = (Number(this.state.totalInfluence[key]) || 0) + gain;
      }
    }
    this.state.lastTurnCreditChange = this.state.credits - Number(this.state.turnStartCredits ?? this.state.credits);
    this.state.lastTurnUpkeep = { interest, baseline, allegiance: allegianceCost, allegianceFaction, allegianceCancelled };
    this.state.lastAllegiancePayment = { faction: allegianceFaction, cost: allegianceCost, influence: allegianceCost, cancelled: allegianceCancelled };
    this.state.turnNumber += 1;
    this.state.turnStartCredits = this.state.credits;
    this.state.lastAdvancedMissionId = missionId;
    this.state.availableMissions = createMissionBoard({
      turnNumber: this.state.turnNumber, units: this.units, equipment: this.equipment, random,
    });
    const stores = this.ensureStoreState();
    stores.creditStock = generateStoreStock({ equipment: this.equipment, units: this.units, state: this.state, random });
    stores.creditStockVersion = 2;
    stores.creditRestocksThisTurn = 0;
    FACTIONS.forEach(faction => {
      const dataFaction = factionDataName(faction);
      const factionState = stores.factionStores[dataFaction] ||= { stock: null, manualRestocked: false };
      factionState.stock = generateFactionStoreStock({
        faction, equipment: this.equipment, units: this.units,
        influence: getFactionInfluence(this.state.totalInfluence, faction), random,
      });
      factionState.manualRestocked = false;
    });
    this.save();
    return { creditChange: this.state.lastTurnCreditChange, interest, baseline };
  }

  setMissionRoster(unitIds) {
    if (!Array.isArray(unitIds) || unitIds.length === 0) return false;
    if (unitIds.every(entry => typeof entry === 'string')) {
      const roster = [...new Set(unitIds)];
      if (roster.some(unitId => !this.getUnitDefinition(unitId) || !this.getOwnedUnit(unitId))) return false;
      this.scene.registry.set('missionRoster', roster);
      return true;
    }
    const roster = unitIds.map((entry, index) => typeof entry === 'string'
      ? { deploymentId: `deployment-${index}`, unitId: entry }
      : entry);
    if (roster.some(entry => !entry || !this.getUnitDefinition(entry.unitId) || !this.getOwnedUnit(entry.unitId))) return false;
    this.scene.registry.set('missionRoster', roster);
    return true;
  }

  getOwnedUnit(unitId) {
    return this.state.units[unitId];
  }

  getOwnedUnitFrom(units, unitId) { return Boolean(units?.[unitId]); }

  setDeploymentLineup(entries) {
    if (!Array.isArray(entries) || entries.length > 5) return false;
    const lineup = Array.from({ length: 5 }, (_, index) => {
      const entry = entries[index];
      if (!entry) return null;
      const unitId = typeof entry === 'string' ? entry : entry.unitId;
      if (!this.getUnitDefinition(unitId) || !this.getOwnedUnit(unitId)) return null;
      const owned = this.getOwnedUnit(unitId);
      return {
        deploymentId: typeof entry === 'string' ? `lineup-${index}` : entry.deploymentId || `lineup-${index}`,
        unitId,
        equipped: clone(typeof entry === 'string' ? owned.equipped : entry.equipped || owned.equipped),
        augments: clone(typeof entry === 'string' ? owned.augments || [] : entry.augments || owned.augments || []),
      };
    });
    if (entries.some(entry => {
      const id = typeof entry === 'string' ? entry : entry?.unitId;
      return id && (!this.getUnitDefinition(id) || !this.getOwnedUnit(id));
    })) return false;
    this.state.deploymentLineup = lineup;
    this.save();
    return true;
  }

  getUnitDefinition(unitId) {
    return this.units[unitId];
  }

  isWeaponAllowed(unitId, weapon) {
    const restrictions = this.getUnitDefinition(unitId)?.weaponRestrictions || [];
    return !restrictions.length || restrictions.some(restriction => restriction === 'heavy'
      ? weapon.hands === 2
      : restriction === 'firearms'
        ? weapon.attackType === 'ranged' && !(weapon.specialProperties || []).some(property => property.type === 'aoe')
        : restriction === 'explosion'
          ? (weapon.specialProperties || []).some(property => property.type === 'aoe')
          : true);
  }

  getItemDefinition(itemId) {
    return this.equipment.items[itemId] || this.equipment.augments[itemId];
  }

  getItemInstance(itemId) {
    return this.state.inventory.find(item => item.itemId === itemId);
  }

  getOwnedItems(type) {
    const inventoryItems = this.state.inventory
      .map(instance => ({ instance, definition: this.getItemDefinition(instance.itemId) }))
      .filter(item => item.definition && (!type || item.definition.type === type));
    const permanentItems = [...Object.values(this.equipment.items), ...Object.values(this.equipment.augments)]
      .filter(definition => this.isPermanentlyAvailable(definition)
        && (!type || definition.type === type)
        && !this.getItemInstance(definition.id))
      .map(definition => ({ instance: null, definition }));
    return [...inventoryItems, ...permanentItems];
  }

  consumeDurability(unitId) {
    const owned = this.getOwnedUnit(unitId);
    if (!owned) return false;
    const itemIds = [...new Set([owned.equipped.left, owned.equipped.right].filter(Boolean))];
    itemIds.forEach(itemId => {
      const definition = this.getItemDefinition(itemId);
      const instance = this.getItemInstance(itemId);
      if (definition?.durability !== undefined && instance && instance.durability !== null) instance.durability = Math.max(0, instance.durability - 1);
    });
    this.save();
    return itemIds.every(itemId => (this.getItemInstance(itemId)?.durability ?? 1) > 0);
  }

  getVeterancyXpRequirement(veterancyLevel) {
    const currentLevel = Math.max(0, Number(veterancyLevel) || 0);
    return VETERANCY_XP_BASE * Math.pow(VETERANCY_XP_GROWTH, currentLevel);
  }

  getVeterancyForceCost(veterancyLevel, deploymentCost = 0) {
    const currentLevel = Math.max(0, Number(veterancyLevel) || 0);
    return (Number(deploymentCost) || 0) * 0.5 * Math.pow(VETERANCY_FORCE_GROWTH, currentLevel);
  }

  getUnitVeterancyCostMultiplier(unitId) {
    const passive = this.getUnitDefinition(unitId)?.passive;
    if (passive?.stat === 'veterancyForceCostMultiplier') return Number(passive.value) || 1;
    return Number(passive?.veterancyForceCostMultiplier) || 1;
  }

  getTowerVeterancyCostMultiplier(tower) {
    return Number(tower?.towerData?.veterancyForceCostMultiplier)
      || this.getUnitVeterancyCostMultiplier(tower?.characterId);
  }

  canPurchaseVeterancy(tower, pathId) {
    if (!tower || !this.scene.economyManager) return false;
    const forceCost = this.getVeterancyForceCost(tower.veterancy, tower.deploymentCost)
      * this.getTowerVeterancyCostMultiplier(tower);
    if (!Number.isFinite(forceCost) || forceCost < 0) return false;
    const requiredXp = this.getVeterancyXpRequirement(tower.veterancy);
    const paths = this.getPathChoiceState(tower.characterId, tower);
    const path = paths.flatMap(tier => tier.paths).find(item => item.id === pathId);
    return Number(tower.experience) >= requiredXp
      && this.scene.economyManager.getForce() >= forceCost
      && path?.available === true
      && path.unimplemented !== true
      && Number(tower.pathProgress?.[pathId] || 0) < this.getPathProgressLimit(path);
  }

  purchaseVeterancy(tower, pathId) {
    if (!this.canPurchaseVeterancy(tower, pathId)) return false;

    const forceCost = this.getVeterancyForceCost(tower.veterancy, tower.deploymentCost)
      * this.getTowerVeterancyCostMultiplier(tower);
    const tier = this.getPathTier(tower.characterId, pathId);
    const pathTierSelection = { ...tower.pathTierSelection };
    const tierState = pathTierSelection[tier.tier] || { selected: [], abandoned: [] };
    tierState.selected = [...(tierState.selected || [])];
    tierState.abandoned = [...(tierState.abandoned || [])];
    if (!tierState.selected.includes(pathId)) {
      tierState.selected.push(pathId);
      const limit = tier.tier === 3 ? 1 : 2;
      if (tierState.selected.length >= limit) {
        tierState.abandoned = tier.paths.map(path => path.id).filter(id => !tierState.selected.includes(id));
      }
    }
    pathTierSelection[tier.tier] = tierState;
    const pathProgress = { ...tower.pathProgress };
    pathProgress[pathId] = Math.min(3, Number(pathProgress[pathId] || 0) + 1);

    if (!this.scene.economyManager.spendForce(forceCost)) return false;

    tower.pathTierSelection = pathTierSelection;
    tower.pathProgress = pathProgress;
    tower.selectedPaths = { ...pathProgress };
    tower.veterancy += 1;
    tower.level = tower.veterancy;
    tower.investedForce += forceCost;
    tower.refreshProgressionStats();
    return true;
  }

  getLevelRequirement(level) {
    return this.getVeterancyXpRequirement(level);
  }

  getPathProgressLimit(path) {
    return path ? Math.max(0, Number(path.maxLevel) || 3) : 0;
  }

  getPathTiers(unitId) {
    const definition = this.getUnitDefinition(unitId);
    if (!definition) return [];
    if (Array.isArray(definition.pathTiers)) return definition.pathTiers;
    if (definition.pathsByTier) {
      return Object.entries(definition.pathsByTier)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([tier, paths]) => ({ tier: Number(tier), paths }));
    }
    return [{ tier: 1, paths: definition.paths || [] }];
  }

  getPathTier(unitId, pathId) {
    return this.getPathTiers(unitId).find(tier => tier.paths.some(path => path.id === pathId));
  }

  getAvailablePathIds(unitId, progression = {}) {
    return this.getPathChoiceState(unitId, progression)
      .flatMap(tier => tier.paths.filter(path => path.available).map(path => path.id));
  }

  createDeploymentProgression(unitId, source = {}) {
    const definition = this.getUnitDefinition(unitId);
    if (!definition) return { veterancy: 1, xp: 0, experience: 0, selectedPaths: {}, pathProgress: {}, pathTierSelection: {} };
    const xp = Math.max(0, Number(source.xp ?? source.experience ?? 0) || 0);
    const hasRandomPath = this.getPathTiers(unitId).some(tier => tier.paths.some(path => path.id === 'random_path'));
    return {
      veterancy: Math.max(0, Number(source.veterancy ?? 0) || 0),
      xp,
      experience: xp,
      selectedPaths: clone(source.selectedPaths || {}),
      pathProgress: clone(source.pathProgress || source.selectedPaths || {}),
      pathTierSelection: clone(source.pathTierSelection || {}),
      ...(source.equipped ? { equipped: clone(source.equipped) } : {}),
      ...(source.equipment ? { equipment: clone(source.equipment) } : {}),
      ...(source.augments ? { augments: clone(source.augments) } : {}),
      ...(source.randomStat || hasRandomPath ? {
        randomStat: clone(source.randomStat || RANDOM_PATH_BONUSES[
          Math.floor(Math.random() * RANDOM_PATH_BONUSES.length)
        ]),
      } : {}),
    };
  }

  getPathChoiceState(unitId, progression = {}) {
    const progress = progression.pathProgress || progression.selectedPaths || {};
    const tierSelection = progression.pathTierSelection || {};
    return this.getPathTiers(unitId).map(tier => {
      const state = tierSelection[tier.tier] || {};
      const completed = tier.paths.filter(path => (progress[path.id] || 0) >= 3).length;
      const unlocked = tier.tier === 1 || this.getPathTiers(unitId)
        .filter(previous => previous.tier < tier.tier)
        .every(previous => previous.paths.filter(path => (progress[path.id] || 0) >= 3).length >= (previous.tier === 3 ? 1 : 2));
      const limit = tier.tier === 3 ? 1 : 2;
      return {
        tier: tier.tier,
        unlocked,
        completed,
        limit,
        paths: tier.paths.map(path => {
          const randomStat = progression.randomStat || progression.towerData?.randomStat || null;
          const randomStatLabel = path.id === 'random_path' ? describeRandomStat(randomStat) : null;
          return {
          ...path,
          ...(randomStatLabel ? { name: randomStatLabel, description: `This deployed unit's stored random stat roll: ${randomStatLabel}.` } : {}),
          level: Number(progress[path.id] || 0),
          selected: state.selected?.includes(path.id) || false,
          abandoned: state.abandoned?.includes(path.id) || false,
          available: unlocked && path.unimplemented !== true
            && Number(progress[path.id] || 0) < this.getPathProgressLimit(path)
            && !state.abandoned?.includes(path.id)
            && (!state.selected?.length || state.selected.includes(path.id) || state.selected.length < limit),
        };}),
      };
    });
  }

  addUnitCopy(unitId, count = 1) {
    if (!this.getUnitDefinition(unitId)) return false;
    const copiesToAdd = Number(count);
    if (!Number.isSafeInteger(copiesToAdd) || copiesToAdd < 1) return false;
    let unit = this.getOwnedUnit(unitId);
    let additionalCopies = copiesToAdd;
    if (!unit) {
      const freeWeapon = Object.values(this.equipment.items).find(item => item.rarity === 'MAKESHIFT'
        && this.isWeaponAllowed(unitId, item));
      unit = this.state.units[unitId] = {
        id: unitId, stars: 0, extraCopies: 0, extraPassiveUnlocked: false,
        equipped: { left: freeWeapon?.id || null, right: freeWeapon?.id || null, utility: null }, augments: [],
      };
      additionalCopies -= 1;
    }
    ({ stars: unit.stars, extraCopies: unit.extraCopies } = getUnitRankProgress(unit));
    if (unit.stars < MAX_UNIT_STARS && additionalCopies > 0) {
      let availableCopies = unit.extraCopies + additionalCopies;
      while (unit.stars < MAX_UNIT_STARS && availableCopies >= unit.stars + 1) {
        availableCopies -= unit.stars + 1;
        unit.stars += 1;
      }
      unit.extraCopies = unit.stars < MAX_UNIT_STARS ? availableCopies : 0;
    }
    unit.rank = unit.stars;
    unit.extraPassiveUnlocked = unit.stars === 5;
    this.save();
    return true;
  }

  equip(unitId, itemId, slot = 'utility', targetLoadout = this.getOwnedUnit(unitId)) {
    const owned = targetLoadout;
    const item = this.getItemDefinition(itemId);
    if (!owned || !item || (!this.isPermanentlyAvailable(item) && !this.getItemInstance(itemId))) return false;
    let equipSlot = slot;
    if (equipSlot === 'auto') {
      if (item.type !== 'weapon') return false;
      if (item.hands === 1) {
        const { left, right } = owned.equipped || {};
        if (right === itemId && !left) equipSlot = 'left';
        else if (!right) equipSlot = 'right';
        else if (!left) equipSlot = 'left';
        else if (left === right && this.getItemDefinition(right)?.hands === 2) {
          // A mirrored two-handed weapon is one occupied item, not a dual-wield
          // loadout. Let the default right-hand target replace it via the normal
          // two-handed cleanup below.
          equipSlot = 'right';
        }
        else return false;
      } else {
        // Preserve the existing two-handed behavior: an accepted two-handed
        // weapon occupies both hands, with right as the default hand choice.
        equipSlot = 'right';
      }
    }
    const validHandSlot = equipSlot === 'left' || equipSlot === 'right';
    if (equipSlot === 'utility' ? item.type !== 'utility' : !validHandSlot || item.type !== 'weapon') return false;
    if (item.type === 'weapon' && ((item.hands !== 1 && item.hands !== 2) || !this.isWeaponAllowed(unitId, item))) return false;

    const equipped = { ...owned.equipped };
    if (equipSlot === 'utility') {
      equipped.utility = itemId;
    } else {
      const currentHandItem = this.getItemDefinition(equipped[equipSlot]);
      if (currentHandItem?.hands === 2) {
        equipped.left = null;
        equipped.right = null;
      }
      if (item.hands === 2) {
        equipped.left = itemId;
        equipped.right = itemId;
      } else {
        equipped[equipSlot] = itemId;
      }
    }
    owned.equipped = equipped;
    this.save();
    return true;
  }

  equipAugment(unitId, itemId, targetLoadout = this.getOwnedUnit(unitId)) {
    const owned = targetLoadout;
    const augment = this.equipment.augments[itemId];
    if (!owned || !augment || augment.type !== 'augment'
      || !this.getItemInstance(itemId) || (owned.augments || []).length > 0) return false;
    owned.augments = [itemId];
    this.save();
    return true;
  }

  unequipAugment(unitId, itemId, targetLoadout = this.getOwnedUnit(unitId)) {
    const owned = targetLoadout;
    if (!owned?.augments?.includes(itemId)) return false;
    const augment = this.equipment.augments[itemId];
    const rarityOrder = ['COMMON', 'UNCOMMON', 'RARE', 'EXOTIC', 'LEGENDARY'];
    if (rarityOrder.indexOf(String(augment?.rarity || 'COMMON').toUpperCase()) < rarityOrder.indexOf('RARE')) {
      const instance = this.getItemInstance(itemId);
      if (instance) this.state.inventory = this.state.inventory.filter(candidate => candidate !== instance);
    } else {
      const cost = Number(augment?.cost);
      if (!Number.isFinite(cost) || this.state.credits < cost) return false;
      this.state.credits -= cost;
    }
    owned.augments = owned.augments.filter(augmentId => augmentId !== itemId);
    this.save();
    return true;
  }

  unequip(unitId, slot = 'utility', targetLoadout = this.getOwnedUnit(unitId)) {
    const owned = targetLoadout;
    if (!owned || (slot !== 'utility' && slot !== 'left' && slot !== 'right')) return false;
    const equipped = { ...owned.equipped };
    if (slot === 'utility') equipped.utility = null;
    else {
      const itemId = equipped[slot];
      if (this.getItemDefinition(itemId)?.hands === 2) {
        equipped.left = null;
        equipped.right = null;
      } else equipped[slot] = null;
    }
    owned.equipped = equipped;
    this.save();
    return true;
  }

  applyEffect(stats, effect) {
    if (effect.type !== 'stat' || !effect.stat) return;
    const value = effect.unit === 'tiles'
      ? Number(effect.value) * Number(this.scene.mapManager?.getCurrentMap?.()?.tileSize || 0)
      : Number(effect.value);
    if (stats[effect.stat] === undefined) stats[effect.stat] = 0;
    if (effect.mode === 'percent' && effect.stat === 'reloadSpeed') stats[effect.stat] /= Math.max(0.01, 1 + value);
    else if (effect.mode === 'percent' && ['attackSpeedModifier', 'sellBonus'].includes(effect.stat)) stats[effect.stat] += value;
    else if (effect.mode === 'percent') stats[effect.stat] *= 1 + value;
    else if (effect.mode === 'multiplier') stats[effect.stat] *= value;
    else stats[effect.stat] += value;
  }

  getEffectiveStats(unitId, progression = {}) {
    const definition = this.getUnitDefinition(unitId);
    const owned = this.getOwnedUnit(unitId);
    if (!definition || !owned) return null;

    const { stars } = getUnitRankProgress(owned);
    const starMultiplier = 1 + 0.06 * stars;
    const stats = { ...clone(definition.baseStats) };
    ['attackSpeedModifier', 'criticalChance', 'criticalModifier', 'rangedSkill', 'meleeSkill', 'reloadSpeed']
      .forEach(stat => { if (stats[stat] !== undefined) stats[stat] *= starMultiplier; });
    const veterancy = Math.max(0, Number(progression.veterancy ?? progression.level ?? 0) || 0);
    const selectedPaths = progression.pathProgress || progression.selectedPaths || {};

    const equippedWeapons = progression.equipment?.weapons || [owned.equipped.left, owned.equipped.right]
      .map(itemId => this.getItemDefinition(itemId));
    const unitReloadSpeedModifier = Number(stats.reloadSpeed) || 0;
    const hands = equippedWeapons
      .filter(item => item && item.type === 'weapon'
        && (this.isPermanentlyAvailable(item) || (this.getItemInstance(item.id)
          && (this.getItemInstance(item.id).durability ?? 1) !== 0)));
    const activeWeapons = hands.filter((item, index) => item.hands !== 2
      || hands.findIndex(candidate => candidate.id === item.id) === index);
    const primary = activeWeapons[0];
    if (primary) {
      const quality = this.equipment.rarities[primary.rarity]?.statMultiplier || 1;
      const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize;
      ['damage', 'armorPenetration', 'aoeRadius'].forEach(stat => {
        if (primary[stat] !== undefined) stats[stat] = clone(primary[stat]) * quality;
      });
      ['damageType', 'statusEffects', 'attackType'].forEach(stat => {
        if (primary[stat] !== undefined) stats[stat] = clone(primary[stat]);
      });
      if (primary.reloadSpeed !== undefined) {
        const reloadFactor = 1 + unitReloadSpeedModifier;
        stats.reloadSpeed = reloadFactor > 0 ? primary.reloadSpeed / reloadFactor : primary.reloadSpeed;
      }
      if (primary.range !== undefined) {
        const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize;
        if (Number.isFinite(tileSize)) stats.range = primary.range * tileSize;
      }
      const primaryAoe = (primary.specialProperties || []).find(property => property.type === 'aoe');
      if (primaryAoe && Number.isFinite(tileSize)) {
        stats.aoeRadius = Number(primaryAoe.radius || 0) * tileSize;
        stats.aoeDamageMultiplier = Number(primaryAoe.multiplier ?? 1);
      }
      if (primary.attacksPerSecond > 0) stats.attackSpeed = 1000 / primary.attacksPerSecond;
      stats.projectileSpeed = getProjectileSpeed(primary.projectileSpeedCategory, tileSize)
        || primary.projectileSpeed
        || stats.projectileSpeed;
      ['criticalChance', 'criticalModifier', 'rangedSkill', 'meleeSkill'].forEach(stat => {
        stats[stat] = (Number(stats[stat]) || 0) + (Number(primary[stat]) || 0);
      });
    }

    const veterancyMultiplier = Math.pow(1.15, veterancy);
    stats.damage *= veterancyMultiplier;
    stats.attackSpeed = Number(stats.attackSpeed || 1000) / veterancyMultiplier;
    stats.reloadSpeed = Number(stats.reloadSpeed || 1) * Math.pow(0.85, veterancy);

    const selectedAugments = progression.augments || owned.augments || [];
    const eligibleWeaponDefinitions = (progression.equipped ? [progression.equipped.left, progression.equipped.right] : [owned.equipped.left, owned.equipped.right])
      .map(id => this.getItemDefinition(id)).filter(Boolean);
    const augments = selectedAugments.map(id => this.equipment.augments[id])
      .filter(augment => augment && (this.isPermanentlyAvailable(augment)
        || (this.getItemInstance(augment.id) && (this.getItemInstance(augment.id).durability ?? 1) !== 0)))
      .filter(augment => !augment.requiredHands || eligibleWeaponDefinitions.some(weapon => weapon.hands === augment.requiredHands))
      .filter(augment => !augment.requiredAttackType || eligibleWeaponDefinitions.some(weapon => weapon.attackType === augment.requiredAttackType))
      .filter(augment => !augment.requiredDamageType || eligibleWeaponDefinitions.some(weapon => weapon.damageType === augment.requiredDamageType));
    const isWeaponConditional = augment => augment.requiredHands || augment.requiredAttackType || augment.requiredDamageType;
    const conditionalAugments = augments.filter(isWeaponConditional);
    const extraPassive = definition.extraPassive || definition.additionalPassive || null;
    const effects = [definition.passive, stars === 5 ? extraPassive : null,
      ...augments.filter(augment => !isWeaponConditional(augment))];
    stats.veterancyForceCostMultiplier = 1;
    stats.statusDuration = 1;
    stats.sellBonus = 0;
    stats.xpPerKill = 0;
    const utility = progression.equipment?.utility || this.getItemDefinition(progression.equipped?.utility ?? owned.equipped.utility);
    const utilityBonusPath = this.getPathTiers(unitId).flatMap(tier => tier.paths).find(path => path.id === 'utility_bonus');
    const utilityBonus = utilityBonusPath && Number(selectedPaths.utility_bonus || 0) > 0 ? 0.05 : 0;
    if (utility?.effects) effects.push(...utility.effects.map(effect => ({
      ...effect,
      value: Number(effect.value || 0) * (1 + utilityBonus),
    })));
    if (utility?.specialProperty) effects.push({ specialProperty: utility.specialProperty });
    if (utility?.specialProperties) effects.push({ specialProperties: utility.specialProperties });

    const paths = this.getPathTiers(unitId).flatMap(tier => tier.paths);
    const randomPath = paths.find(path => path.id === 'random_path');
    const randomStat = progression.randomStat || progression.towerData?.randomStat || null;
    if (randomPath && Number(selectedPaths[randomPath.id] || 0) > 0 && randomStat) {
      const bonus = clone(randomStat);
      if (bonus.stat === 'range') bonus.value *= this.scene.mapManager?.getCurrentMap?.()?.tileSize || 1;
      effects.push({ type: 'stat', ...bonus });
    }

    paths.forEach(path => {
      const currentProgress = Number(selectedPaths[path.id] || 0);
      const requiredSteps = this.getPathProgressLimit(path);
      const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize;
      const addEffect = effect => {
        if (!effect) return;
        const applied = clone(effect);
        if (applied.stat === 'range' && Number.isFinite(tileSize)) applied.value *= tileSize;
        effects.push(applied);
      };
      if (currentProgress > 0) addEffect(path.effect);
      (path.upgrades || []).slice(0, currentProgress).forEach(upgrade => effects.push(upgrade.effect));
      if (currentProgress >= requiredSteps) addEffect(path.maxBonus);
    });

    stats.specialProperties = [];
    const preEffectStats = { ...stats };
    effects.filter(Boolean).forEach(effect => {
      if (effect.effects) effect.effects.forEach(item => this.applyEffect(stats, item));
      else if (effect.type === 'status') stats.statusEffects = [...(stats.statusEffects || []), clone(effect.statusEffect)];
      else if (effect.type === 'special') stats.specialProperties.push(clone(effect));
      else if (effect.specialProperty) stats.specialProperties.push(effect.specialProperty);
      else if (effect.specialProperties) stats.specialProperties.push(...clone(effect.specialProperties));
      else this.applyEffect(stats, effect);
    });
    const singleWeaponCritBonus = stats.specialProperties.find(property => property.property === 'singleOneHandedCritBonus');
    if (singleWeaponCritBonus && activeWeapons.filter(weapon => weapon.hands === 1).length !== 1) {
      stats.specialProperties = stats.specialProperties.filter(property => property !== singleWeaponCritBonus);
    }

    const preSkillAttackSpeed = stats.attackSpeed;
    const relevantSkill = stats.attackType === 'melee'
      ? Number(stats.meleeSkill) || 0
      : stats.attackType === 'ranged'
        ? Number(stats.rangedSkill) || 0
        : 0;
    const skillAttackSpeedModifier = 1 + relevantSkill;
    const unitAttackSpeedModifier = 1 + (Number(stats.attackSpeedModifier) || 0);
    if (skillAttackSpeedModifier > 0 && unitAttackSpeedModifier > 0) {
      stats.attackSpeed /= skillAttackSpeedModifier * unitAttackSpeedModifier;
    }
    stats.criticalModifier = 1 + (Number(stats.criticalModifier) || 0);

    stats.cost = definition.cost;
    stats.name = definition.name;
    stats.asset = definition.asset;
    stats.characterArt = definition.characterArt === true;
    stats.visualSize = clone(definition.visualSize || null);
    stats.visualOrigin = clone(definition.visualOrigin || null);
    stats.filtering = definition.filtering || 'linear';
    stats.unitId = unitId;
    stats.equipped = clone(progression.equipped || owned.equipped);
    stats.augments = clone(progression.augments || owned.augments || []);
    stats.equipment = clone(progression.equipment || {
      weapons: ['left', 'right'].map(slot => {
        const itemId = owned.equipped[slot];
        const item = itemId ? this.getItemDefinition(itemId) : null;
        return item ? clone(item) : null;
      }),
      utility: owned.equipped.utility
        ? clone(this.getItemDefinition(owned.equipped.utility))
        : null,
    });
    stats.level = veterancy;
    stats.veterancy = veterancy;
    stats.randomStat = clone(randomStat);
    stats.rank = stars;
    stats.stars = stars;
    stats.extraPassiveUnlocked = stars === 5;
    stats.extraPassive = stars === 5 ? clone(extraPassive) : null;
    stats.experience = Number(progression.experience ?? progression.xp ?? 0) || 0;
    stats.xp = stats.experience;
    stats.ammo = clone(primary?.ammo || { requiresAmmo: false, consumesPerAttack: 0, unlimited: true });
    stats.targetingMode = stats.targetingMode || 'first';
    const tileSize = this.scene.mapManager?.getCurrentMap?.()?.tileSize;
    const primaryBaseInterval = primary?.attacksPerSecond > 0
      ? 1000 / primary.attacksPerSecond / veterancyMultiplier
      : Number(definition.baseStats.attackSpeed || 1000) / veterancyMultiplier;
    const skillEffectDelta = skillName => stats[skillName]
      - ((Number(definition.baseStats[skillName]) || 0) + (Number(primary?.[skillName]) || 0));
    const damageEffectMultiplier = preEffectStats.damage
      ? stats.damage / preEffectStats.damage
      : 1 + (Number(selectedPaths.damage) > 0 ? 0.05 : 0)
        + (Number(selectedPaths.damage) >= 3 ? 0.1 : 0);
    const rangeEffectMultiplier = preEffectStats.range
      ? stats.range / preEffectStats.range
      : 1;
    const aoeEffectMultiplier = preEffectStats.aoeRadius
      ? stats.aoeRadius / preEffectStats.aoeRadius
      : 1;
    const attackSpeedEffectMultiplier = primaryBaseInterval
      ? preSkillAttackSpeed / primaryBaseInterval
      : 1;
    const reloadEffectMultiplier = preEffectStats.reloadSpeed
      ? stats.reloadSpeed / preEffectStats.reloadSpeed
      : 1;
    const armorPenetrationEffectDelta = stats.armorPenetration - preEffectStats.armorPenetration;
    const criticalChanceEffectDelta = stats.criticalChance - preEffectStats.criticalChance;
    const criticalModifierEffectDelta = stats.criticalModifier
      - (1 + preEffectStats.criticalModifier);

    stats.weaponAttacks = activeWeapons.map((weapon, index) => {
      if (index === 0) {
        return {
          ...clone(stats),
          damage: stats.damage * (weapon.hands === 1 && definition.passive?.property === 'oneHandedDamage'
            ? 1 + Number(definition.passive.value || 0)
            : 1),
          weaponId: weapon.id,
          weaponHands: weapon.hands,
          specialProperties: [...(stats.specialProperties || []), ...(weapon.specialProperties || [])],
          statusEffects: clone(weapon.statusEffects || stats.statusEffects || []),
          ammo: clone(weapon.ammo || stats.ammo),
          reloadSpeed: weapon.reloadSpeed !== undefined ? stats.reloadSpeed : undefined,
        };
      }

      const quality = this.equipment.rarities[weapon.rarity]?.statMultiplier || 1;
      const weaponSkillName = weapon.attackType === 'melee' ? 'meleeSkill' : 'rangedSkill';
      const effectiveSkill = (Number(definition.baseStats[weaponSkillName]) || 0)
        + (Number(weapon[weaponSkillName]) || 0)
        + skillEffectDelta(weaponSkillName);
      const skillFactor = 1 + effectiveSkill;
      const unitSpeedFactor = 1 + (Number(stats.attackSpeedModifier) || 0);
      let attackSpeed = (weapon.attacksPerSecond > 0
        ? 1000 / weapon.attacksPerSecond / veterancyMultiplier
        : Number(definition.baseStats.attackSpeed || 1000) / veterancyMultiplier)
        * attackSpeedEffectMultiplier;
      if (skillFactor > 0 && unitSpeedFactor > 0) attackSpeed /= skillFactor * unitSpeedFactor;

      const weaponRange = Number.isFinite(tileSize) && weapon.range !== undefined
        ? weapon.range * tileSize
        : Number(definition.baseStats.range) || 0;
      const range = weaponRange
        * rangeEffectMultiplier;
      const reloadSpeed = weapon.reloadSpeed === undefined
        ? stats.reloadSpeed
        : weapon.reloadSpeed / Math.max(0.01, 1 + unitReloadSpeedModifier)
          * Math.pow(0.85, veterancy) * reloadEffectMultiplier;

      return {
        ...clone(stats),
        weaponId: weapon.id,
        weaponHands: weapon.hands,
        specialProperties: [...(stats.specialProperties || []), ...(weapon.specialProperties || [])],
        statusEffects: clone(weapon.statusEffects || stats.statusEffects || []),
        damage: (Number(weapon.damage) || 0) * quality * veterancyMultiplier * damageEffectMultiplier
          * (weapon.hands === 1 && definition.passive?.property === 'oneHandedDamage'
            ? 1 + Number(definition.passive.value || 0)
            : 1),
        damageType: weapon.damageType || definition.baseStats.damageType,
        attackType: weapon.attackType || 'ranged',
        armorPenetration: (Number(weapon.armorPenetration) || 0) * quality + armorPenetrationEffectDelta,
        criticalChance: (Number(definition.baseStats.criticalChance) || 0)
          + (Number(weapon.criticalChance) || 0) + criticalChanceEffectDelta,
        criticalModifier: 1 + (Number(definition.baseStats.criticalModifier) || 0)
          + (Number(weapon.criticalModifier) || 0) + criticalModifierEffectDelta,
        rangedSkill: (Number(definition.baseStats.rangedSkill) || 0)
          + (Number(weapon.rangedSkill) || 0) + skillEffectDelta('rangedSkill'),
        meleeSkill: (Number(definition.baseStats.meleeSkill) || 0)
          + (Number(weapon.meleeSkill) || 0) + skillEffectDelta('meleeSkill'),
        range,
        attackSpeed,
        reloadSpeed,
        ammo: clone(weapon.ammo || { requiresAmmo: false, consumesPerAttack: 0, unlimited: true }),
        projectileSpeed: getProjectileSpeed(weapon.projectileSpeedCategory, tileSize)
          || weapon.projectileSpeed
          || stats.projectileSpeed,
        aoeRadius: Number.isFinite(tileSize)
          ? Number((weapon.specialProperties || []).find(property => property.type === 'aoe')?.radius || 0)
            * tileSize * aoeEffectMultiplier
          : 0,
        aoeDamageMultiplier: Number((weapon.specialProperties || []).find(property => property.type === 'aoe')?.multiplier ?? 1)
          * (preEffectStats.aoeDamageMultiplier
            ? stats.aoeDamageMultiplier / preEffectStats.aoeDamageMultiplier
            : 1),
        projectileAsset: weapon.projectileAsset || stats.projectileAsset,
      };
    });
    stats.weaponAttacks = stats.weaponAttacks.map((profile, index) => {
      const weapon = activeWeapons[index];
      const matchingAugments = conditionalAugments.filter(augment => (!augment.requiredHands || augment.requiredHands === weapon.hands)
        && (!augment.requiredAttackType || augment.requiredAttackType === weapon.attackType)
        && (!augment.requiredDamageType || augment.requiredDamageType === weapon.damageType));
      matchingAugments.flatMap(augment => augment.effects || [])
        .forEach(effect => {
          const value = effect.unit === 'tiles'
            ? Number(effect.value) * Number(tileSize || 0)
            : Number(effect.value);
          if (effect.stat === 'reloadSpeed' && effect.mode === 'percent') profile.reloadSpeed /= Math.max(0.01, 1 + value);
          else if (effect.stat === 'reloadSpeed' && effect.mode === 'multiplier') profile.reloadSpeed *= value;
          else if (effect.stat === 'attackSpeedModifier') profile.attackSpeed /= Math.max(0.01, 1 + value);
          else if (effect.mode === 'percent') profile[effect.stat] *= 1 + value;
          else profile[effect.stat] = (Number(profile[effect.stat]) || 0) + value;
        });
      matchingAugments.forEach(augment => {
        if (augment.specialProperty) profile.specialProperties.push(clone(augment.specialProperty));
        if (augment.specialProperties) profile.specialProperties.push(...clone(augment.specialProperties));
      });
      return profile;
    });
    const aoeRadiusBonusTiles = Number(stats.specialProperties
      .find(property => property.property === 'aoeRadiusBonus')?.value || 0);
    const aoeDamageBonus = Number(stats.specialProperties
      .find(property => property.property === 'aoeDamageBonus')?.value || 0);
    if (aoeRadiusBonusTiles > 0 && Number.isFinite(tileSize)) {
      stats.weaponAttacks.forEach(profile => {
        if (Number(profile.aoeRadius) > 0) profile.aoeRadius += aoeRadiusBonusTiles * tileSize;
      });
    }
    if (aoeDamageBonus > 0) {
      stats.weaponAttacks.forEach(profile => {
        if (Number(profile.aoeRadius) > 0) profile.aoeDamageMultiplier *= 1 + aoeDamageBonus;
      });
    }
    const inherentAttacks = (definition.inherentAttacks || []).map((attack, index) => ({
      ...clone(stats),
      ...clone(attack),
      weaponId: `inherent-${index}`,
      damage: Number(attack.damage || 0) * veterancyMultiplier * damageEffectMultiplier
        * (1 + Number(stats.specialProperties.find(property => property.property === 'inherentAttackDamageBonus')?.value || 0)),
      range: Number(attack.range || 0) * Number(tileSize || 0) * rangeEffectMultiplier,
      attackSpeed: (1000 / Math.max(0.01, Number(attack.attacksPerSecond || 1)))
        / veterancyMultiplier / Math.max(0.01, 1 + (Number(stats.attackSpeedModifier) || 0))
        / Math.max(0.01, 1 + (Number(stats.rangedSkill) || 0)),
      criticalChance: Number(attack.criticalChance || 0),
      criticalModifier: Number(attack.criticalModifier || 1),
      ammo: { requiresAmmo: false, consumesPerAttack: 0, unlimited: true },
      reloadSpeed: undefined,
      aoeRadius: Number(attack.aoeRadius || 0) * Number(tileSize || 0) * aoeEffectMultiplier,
      aoeDamageMultiplier: Number(attack.aoeDamageMultiplier ?? 1),
      projectileSpeed: getProjectileSpeed('fired', tileSize) || stats.projectileSpeed,
      projectileAsset: attack.projectileAsset || 'basic',
      specialProperties: [...(stats.specialProperties || [])],
      statusEffects: clone(stats.statusEffects || []),
      attackType: 'ranged',
      damageType: attack.damageType || 'Physical',
    }));
    if (aoeRadiusBonusTiles > 0 && Number.isFinite(tileSize)) {
      inherentAttacks.forEach(profile => {
        if (Number(profile.aoeRadius) > 0) profile.aoeRadius += aoeRadiusBonusTiles * tileSize;
      });
    }
    if (aoeDamageBonus > 0) {
      inherentAttacks.forEach(profile => {
        if (Number(profile.aoeRadius) > 0) profile.aoeDamageMultiplier *= 1 + aoeDamageBonus;
      });
    }
    stats.weaponAttacks.push(...inherentAttacks);
    if (stats.statusDuration !== 1) {
      stats.statusEffects = (stats.statusEffects || []).map(effect => ({
        ...effect,
        duration: Number(effect.duration) * stats.statusDuration,
      }));
    }
    return stats;
  }
}
