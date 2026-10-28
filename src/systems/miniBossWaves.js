export const MINI_BOSS_TYPES = ['SWARMER', 'ARMORER', 'GRAFTER'];
export const MINI_BOSS_FIRST_WAVE = 10;
export const MINI_BOSS_START_CHANCE = 20;
export const MINI_BOSS_CHANCE_STEP = 3;
const ENEMY_COUNT_VALUES = { ARMORED: 2, ELITE: 3, BOSS: 100 };

export function getEnemyEquivalentCount(groups, enemyDefinitions) {
  return groups.reduce((total, group) => {
    const countValue = Number(enemyDefinitions[group.type]?.countsAs) || ENEMY_COUNT_VALUES[group.type] || 1;
    return total + group.count * countValue;
  }, 0);
}

export function addMiniBossToWave(waveData, miniBossType) {
  const spawnQueue = [...waveData.spawnQueue];
  if (!miniBossType || spawnQueue.length < 2) return waveData;
  const insertionIndex = Math.max(1, Math.min(spawnQueue.length - 1, Math.floor(spawnQueue.length / 2)));
  spawnQueue.splice(insertionIndex, 0, miniBossType);
  const groups = [];
  for (const type of spawnQueue) {
    const previous = groups.at(-1);
    if (previous?.type === type) previous.count += 1;
    else groups.push({ type, count: 1 });
  }
  return {
    ...waveData,
    groups,
    enemies: groups.map(group => group.type),
    spawnQueue,
    count: spawnQueue.length,
    enemyEquivalentCount: (Number(waveData.enemyEquivalentCount) || waveData.spawnQueue.length) + 5,
    miniBossType,
  };
}

export function resolveMiniBossWave(waveData, {
  chance,
  random,
  typeRandom = random,
  eligibleTypes = MINI_BOSS_TYPES,
}) {
  const currentChance = Math.max(0, Math.min(100, Number(chance) || MINI_BOSS_START_CHANCE));
  if (waveData.waveNumber < MINI_BOSS_FIRST_WAVE || eligibleTypes.length === 0) {
    return { waveData, chance: currentChance, miniBossType: null };
  }
  if (waveData.spawnQueue.length < 2) {
    return { waveData, chance: Math.min(100, currentChance + MINI_BOSS_CHANCE_STEP), miniBossType: null };
  }

  if (random() * 100 >= currentChance) {
    return { waveData, chance: Math.min(100, currentChance + MINI_BOSS_CHANCE_STEP), miniBossType: null };
  }

  const miniBossType = eligibleTypes[Math.min(eligibleTypes.length - 1, Math.floor(typeRandom() * eligibleTypes.length))];
  return {
    waveData: addMiniBossToWave(waveData, miniBossType),
    chance: MINI_BOSS_START_CHANCE,
    miniBossType,
  };
}
