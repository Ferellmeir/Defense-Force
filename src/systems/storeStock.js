import { pickItemByRarity } from './missionSettlement.js';
import { factionDataName } from '../utils/factions.js';

export const CREDIT_STOCK_COUNTS = { equipment: 4, units: 3, augments: 1 };
export const INFLUENCE_STOCK_COUNTS = { equipment: 3, units: 2, augments: 1 };

function pickUnit(units, random) {
  if (!units.length) return null;
  return units[Math.floor(random() * units.length)];
}

function pickStoreItem(items, random, excludedIds = new Set()) {
  if (!items.length) return null;
  return pickItemByRarity(items, random, excludedIds)
    || items.find(item => !excludedIds.has(item.id))
    || items[Math.floor(random() * items.length)];
}

export function generateStoreStock({ equipment, units, random = Math.random }) {
  const availableEquipment = Object.values(equipment.items).filter(item =>
    item.rarity !== 'MAKESHIFT' && typeof item.cost === 'number' && Number.isFinite(item.cost)
    && item.cost >= 0 && !item.faction);
  const availableAugments = Object.values(equipment.augments).filter(item =>
    item.type === 'augment' && item.rarity !== 'MAKESHIFT' && typeof item.cost === 'number'
    && Number.isFinite(item.cost) && item.cost >= 0 && !item.faction);
  const availableUnits = Object.values(units).filter(unit => Number.isFinite(Number(unit.cost)));
  const stock = { equipment: [], units: [], augments: [] };

  for (const category of ['equipment', 'augments']) {
    const pool = category === 'equipment' ? availableEquipment : availableAugments;
    const excluded = new Set();
    for (let index = 0; index < CREDIT_STOCK_COUNTS[category]; index += 1) {
      const item = pickStoreItem(pool, random, excluded);
      if (item) {
        stock[category].push(item.id);
        excluded.add(item.id);
      }
    }
  }
  const unitPool = [...availableUnits];
  for (let index = 0; index < CREDIT_STOCK_COUNTS.units && unitPool.length; index += 1) {
    const unit = pickUnit(unitPool, random);
    stock.units.push(unit.id);
    unitPool.splice(unitPool.indexOf(unit), 1);
  }
  while (stock.units.length < CREDIT_STOCK_COUNTS.units && availableUnits.length) {
    stock.units.push(pickUnit(availableUnits, random).id);
  }
  return stock;
}

export function generateFactionStoreStock({ faction, equipment, units, influence = 0, random = Math.random }) {
  const factionKey = factionDataName(faction);
  const value = Math.max(0, Number(influence) || 0);
  const eligibleRarities = new Set();
  if (value >= 25) ['COMMON', 'UNCOMMON'].forEach(rarity => eligibleRarities.add(rarity));
  if (value >= 100) eligibleRarities.add('RARE');
  if (value >= 200) ['EXOTIC', 'LEGENDARY'].forEach(rarity => eligibleRarities.add(rarity));
  const gear = Object.values(equipment.items).filter(item => item.faction === factionKey && eligibleRarities.has(item.rarity));
  const augments = Object.values(equipment.augments).filter(item => item.faction === factionKey && eligibleRarities.has(item.rarity));
  const unitPool = value >= 50 ? Object.values(units).filter(unit => unit.faction === factionKey) : [];
  const stock = { equipment: [], units: [], augments: [] };
  for (let index = 0; index < INFLUENCE_STOCK_COUNTS.equipment; index += 1) {
    const item = pickStoreItem(gear, random, new Set(stock.equipment));
    if (item) stock.equipment.push(item.id);
  }
  for (let index = 0; index < INFLUENCE_STOCK_COUNTS.augments; index += 1) {
    const item = pickStoreItem(augments, random, new Set(stock.augments));
    if (item) stock.augments.push(item.id);
  }
  while (stock.units.length < INFLUENCE_STOCK_COUNTS.units && unitPool.length) {
    const unit = unitPool[Math.floor(random() * unitPool.length)];
    stock.units.push(unit.id);
    unitPool.splice(unitPool.indexOf(unit), 1);
  }
  return stock;
}
