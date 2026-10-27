const VICTORY_REWARDS = {
  EASY: { credits: 100, influence: 14 },
  NORMAL: { credits: 150, influence: 20 },
  HARD: { credits: 200, influence: 26 },
  EXPERT: { credits: 300, influence: 40 },
  INSANE: { credits: 500, influence: 56 },
};

const EQUIPMENT_DROP_CHANCE = { EASY: 0.25, NORMAL: 0.375, HARD: 0.5, EXPERT: 0.625, INSANE: 0.75 };
const UNIT_DROP_CHANCE = { EASY: 0.1, NORMAL: 0.2, HARD: 0.3, EXPERT: 0.4, INSANE: 0.5 };
const EQUIPMENT_BREAK_CHANCE = {
  MAKESHIFT: 0,
  COMMON: 0.15,
  UNCOMMON: 0.1,
  RARE: 0.05,
  EXOTIC: 0.025,
  LEGENDARY: 0,
};
export const EQUIPMENT_RARITY_ROLLS = [
  ['COMMON', 50],
  ['UNCOMMON', 38.5],
  ['RARE', 10],
  ['EXOTIC', 1],
  ['LEGENDARY', 0.5],
];

export function rollEquipmentRarity(random = Math.random) {
  const roll = random();
  let total = 0;
  for (const [rarity, probability] of EQUIPMENT_RARITY_ROLLS) {
    total += probability;
    if (roll * 100 < total) return rarity;
  }
  return EQUIPMENT_RARITY_ROLLS.at(-1)[0];
}

export function pickItemByRarity(items, random = Math.random, excludedIds = new Set()) {
  const rolledRarity = rollEquipmentRarity(random);
  const rolledIndex = EQUIPMENT_RARITY_ROLLS.findIndex(([rarity]) => rarity === rolledRarity);
  for (let index = rolledIndex; index >= 0; index -= 1) {
    const rarity = EQUIPMENT_RARITY_ROLLS[index][0];
    const candidates = items.filter(item => item.rarity === rarity && !excludedIds.has(item.id));
    if (candidates.length) return candidates[Math.floor(random() * candidates.length)];
  }
  // If all non-duplicate choices are exhausted, allow a duplicate from the
  // same rarity fallback ladder so the requested stock size can be filled.
  for (let index = rolledIndex; index >= 0; index -= 1) {
    const rarity = EQUIPMENT_RARITY_ROLLS[index][0];
    const candidates = items.filter(item => item.rarity === rarity);
    if (candidates.length) return candidates[Math.floor(random() * candidates.length)];
  }
  return null;
}

export function settleMissionState(state, {
  missionId,
  victory,
  difficulty,
  unitIds = [],
  missionFaction = null,
  rewardMultiplier = 1,
  units,
  equipment,
  addUnitCopy,
  random = Math.random,
}) {
  if (!missionId || state.lastSettledMissionId === missionId) return null;

  const result = {
    missionId,
    victory: Boolean(victory),
    credits: 0,
    influence: 0,
    faction: null,
    equipmentGained: [],
    unitsGained: [],
    equipmentLost: [],
  };
  const roster = [...new Set(unitIds)].map(id => units[id] && ({ id, definition: units[id], owned: state.units[id] }))
    .filter(unit => unit?.owned);

  // Roll once per distinct owned weapon equipped by the roster, including on defeat.
  const equipmentIds = new Set();
  roster.forEach(({ owned }) => ['left', 'right', 'utility'].forEach(slot => {
    if (owned.equipped?.[slot]) equipmentIds.add(owned.equipped[slot]);
  }));
  roster.forEach(({ owned }) => (owned.augments || []).forEach(itemId => equipmentIds.add(itemId)));
  for (const itemId of equipmentIds) {
    const instanceIndex = state.inventory.findIndex(instance => instance.itemId === itemId);
    if (instanceIndex < 0) continue;
    const item = equipment.items[itemId] || equipment.augments[itemId];
    const chance = EQUIPMENT_BREAK_CHANCE[item?.rarity] || 0;
    if (chance > 0 && random() < chance) {
      state.inventory.splice(instanceIndex, 1);
      result.equipmentLost.push(itemId);
    }
  }

  if (victory) {
    const reward = VICTORY_REWARDS[difficulty];
    if (reward) {
      const multiplier = Math.max(0, Number(rewardMultiplier) || 1);
      const credits = reward.credits * multiplier;
      const influence = reward.influence * multiplier;
      state.credits += credits;
      result.credits = credits;
      if (missionFaction) {
        state.influence[missionFaction] = (Number(state.influence[missionFaction]) || 0) + influence;
        state.totalInfluence ||= {};
        state.totalInfluence[missionFaction] = (Number(state.totalInfluence[missionFaction]) || 0) + influence;
        result.faction = missionFaction;
        result.influence = influence;
      }
    }

    if (random() < (EQUIPMENT_DROP_CHANCE[difficulty] || 0)) {
      const lootPool = Object.values({ ...equipment.items, ...equipment.augments })
        .filter(item => item.rarity !== 'MAKESHIFT' && !item.faction);
      const item = pickItemByRarity(lootPool, random);
      if (item) {
        state.inventory.push({ itemId: item.id, durability: null });
        result.equipmentGained.push(item.id);
      }
    }

    if (random() < (UNIT_DROP_CHANCE[difficulty] || 0)) {
      const candidates = Object.values(units);
      if (candidates.length) {
        const definition = candidates[Math.floor(random() * candidates.length)];
        if (addUnitCopy) addUnitCopy(definition.id);
        result.unitsGained.push(definition.id);
      }
    }
  }

  state.lastSettledMissionId = missionId;
  return result;
}

export { VICTORY_REWARDS, EQUIPMENT_DROP_CHANCE, UNIT_DROP_CHANCE, EQUIPMENT_BREAK_CHANCE };
