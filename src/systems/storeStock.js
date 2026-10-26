import { pickItemByRarity } from './missionSettlement.js';

const STOCK_COUNTS = { equipment: 6, units: 4, augments: 2 };

function pickUnit(units, random) {
  if (!units.length) return null;
  return units[Math.floor(random() * units.length)];
}

export function generateStoreStock({ equipment, units, state, random = Math.random }) {
  const ownedEquipment = new Set(state.inventory.map(instance => instance.itemId));
  const availableEquipment = Object.values(equipment.items).filter(item =>
    item.rarity !== 'MAKESHIFT' && typeof item.cost === 'number' && Number.isFinite(item.cost)
    && item.cost >= 0 && !ownedEquipment.has(item.id));
  const availableAugments = Object.values(equipment.augments).filter(item =>
    item.type === 'augment' && item.rarity !== 'MAKESHIFT' && typeof item.cost === 'number'
    && Number.isFinite(item.cost) && item.cost >= 0 && !ownedEquipment.has(item.id));
  const availableUnits = Object.values(units).filter(unit =>
    Number.isFinite(Number(unit.cost)));
  const stock = { equipment: [], units: [], augments: [] };

  for (const category of ['equipment', 'augments']) {
    const pool = category === 'equipment' ? availableEquipment : availableAugments;
    const excluded = new Set();
    for (let index = 0; index < STOCK_COUNTS[category]; index += 1) {
      const item = pickItemByRarity(pool, random, excluded);
      if (item) {
        stock[category].push(item.id);
        excluded.add(item.id);
      }
    }
  }
  const unitPool = [...availableUnits];
  for (let index = 0; index < STOCK_COUNTS.units && unitPool.length; index += 1) {
    const unit = pickUnit(unitPool, random);
    stock.units.push(unit.id);
    unitPool.splice(unitPool.indexOf(unit), 1);
  }
  while (stock.units.length < STOCK_COUNTS.units && availableUnits.length) {
    stock.units.push(pickUnit(availableUnits, random).id);
  }
  return stock;
}
