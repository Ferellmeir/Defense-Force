const DIFFICULTY_WAVE_RANGES = {
  EASY: [10, 12],
  NORMAL: [12, 15],
  HARD: [16, 19],
  EXPERT: [20, 24],
  INSANE: [25, 25],
};

function chooseWeightedType(weights, random) {
  const roll = random();
  let cumulative = 0;
  for (const [type, probability] of Object.entries(weights)) {
    cumulative += probability;
    if (roll < cumulative) return type;
  }
  return Object.keys(weights).at(-1);
}

export function getNonBossProbabilities(waveNumber, availableTypes) {
  const types = availableTypes.filter(type => type !== 'BOSS' && (type !== 'ELITE' || waveNumber >= 5));
  if (types.length === 0) return {};

  const alternates = types.filter(type => type !== 'NORMAL');
  if (waveNumber < 5 || !types.includes('NORMAL') || alternates.length === 0) {
    if (types.includes('NORMAL') && alternates.length > 0) {
      const weights = { NORMAL: 0.9 };
      alternates.forEach(type => { weights[type] = 0.1 / alternates.length; });
      return weights;
    }
    return Object.fromEntries(types.map(type => [type, 1 / types.length]));
  }

  const normalProbability = Math.max(1 / types.length, 0.9 - ((waveNumber - 4) * 0.05));
  const alternateProbability = (1 - normalProbability) / alternates.length;
  return Object.fromEntries(types.map(type => [
    type,
    type === 'NORMAL' ? normalProbability : alternateProbability,
  ]));
}

function groupedComposition(count, weights, random, onlyType = null) {
  const typeCounts = new Map();
  if (onlyType) {
    typeCounts.set(onlyType, count);
  } else {
    for (let index = 0; index < count; index += 1) {
      const type = chooseWeightedType(weights, random);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    // Every type is grouped into one contiguous batch.
    return [...typeCounts].map(([type, amount]) => ({ type, count: amount }));
  }
  return [...typeCounts].map(([type, amount]) => ({ type, count: amount }));
}

export function generateMissionWaves({ difficulty, enemies, random = Math.random, totalWaves: fixedTotalWaves = null }) {
  const range = DIFFICULTY_WAVE_RANGES[difficulty];
  if (!range) throw new Error(`Unknown mission difficulty: ${difficulty}`);
  const [minimum, maximum] = range;
  const totalWaves = Number.isInteger(fixedTotalWaves) && fixedTotalWaves > 0
    ? fixedTotalWaves : minimum + Math.floor(random() * (maximum - minimum + 1));
  const availableTypes = Object.keys(enemies).filter(type => type !== 'BOSS' && !enemies[type]?.miniBoss);
  let rawEnemyCount = 30;
  let bossChance = 10;

  const waves = Array.from({ length: totalWaves }, (_, index) => {
    const waveNumber = index + 1;
    if (index > 0) rawEnemyCount *= 1.15;
    const nonBossCount = Math.round(rawEnemyCount);
    const probabilities = getNonBossProbabilities(waveNumber, availableTypes);
    const singleTypeWave = waveNumber > 4 && random() < 0.1;
    const singleType = singleTypeWave ? chooseWeightedType(probabilities, random) : null;
    const groups = groupedComposition(nonBossCount, probabilities, random, singleType);

    let bossCount = 0;
    const bossChanceBeforeWave = bossChance;
    if (waveNumber >= 15 && enemies.BOSS) {
      if (random() < bossChance / 100) {
        bossCount = 1;
        bossChance = 10;
      } else {
        bossChance += 2;
      }
    }
    if (bossCount) groups.push({ type: 'BOSS', count: 1 });

    return {
      waveNumber,
      count: nonBossCount + bossCount,
      rawEnemyCount,
      nonBossCount,
      interval: 1000,
      probabilities,
      singleTypeWave,
      bossCount,
      bossChanceBeforeWave: waveNumber >= 15 && enemies.BOSS ? bossChanceBeforeWave : null,
      bossChanceAfterWave: bossChance,
      groups,
    };
  });

  return { totalWaves, waves };
}

export { DIFFICULTY_WAVE_RANGES };
