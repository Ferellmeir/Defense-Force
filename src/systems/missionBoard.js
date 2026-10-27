import { FACTIONS } from '../utils/factions.js';
import { DIFFICULTY_WAVE_RANGES } from './waveGenerator.js';
import { getFactionEnvironment } from './missionEnvironments.js';

export const MISSION_TYPES = ['SECURE_REGION', 'BARRICADE', 'GAUNTLET', 'DYNAMIC_ENGAGEMENT'];
export const MISSION_TYPE_NAMES = {
  SECURE_REGION: 'Secure Region',
  BARRICADE: 'Barricade',
  GAUNTLET: 'Gauntlet',
  DYNAMIC_ENGAGEMENT: 'Dynamic Engagement',
};

export const MAP_KEYS = ['forest', 'desert', 'mountain'];
const DIFFICULTIES = Object.keys(DIFFICULTY_WAVE_RANGES);
const DAMAGE_TYPES = ['Physical', 'Energy', 'Acid', 'Fire'];
const DEBUFFS = ['bleed', 'poison', 'slow', 'stun', 'exposed', 'marked'];

function choose(items, random) { return items[Math.floor(random() * items.length)]; }

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function randomWaveCount(difficulty, random) {
  const [minimum, maximum] = DIFFICULTY_WAVE_RANGES[difficulty];
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function makeRestrictionPool() {
  const pool = [
    ...DAMAGE_TYPES.map(damageType => ({ id: `damage-${damageType}`, kind: 'damageType', damageType, label: `No ${damageType} damage` })),
    ...DEBUFFS.map(debuff => ({ id: `debuff-${debuff}`, kind: 'debuff', debuff, label: `No ${debuff} debuff` })),
    { id: 'no-ranged', kind: 'weaponType', attackType: 'ranged', label: 'No ranged weapons' },
    { id: 'no-melee', kind: 'weaponType', attackType: 'melee', label: 'No melee weapons' },
    { id: 'no-aoe', kind: 'aoe', label: 'No area-of-effect attacks' },
    ...FACTIONS.map(faction => ({ id: `faction-${faction}`, kind: 'faction', faction, label: `No ${faction} units or equipment` })),
  ];
  return pool;
}

function generateRestrictions(missionType, restrictionPool, random) {
  if (missionType === 'DYNAMIC_ENGAGEMENT') return shuffle(restrictionPool, random).slice(0, 3);
  const roll = random();
  const count = roll < 0.75 ? 0 : roll < 0.95 ? 1 : 2;
  return shuffle(restrictionPool, random).slice(0, count);
}

export function createMissionBoard({ turnNumber = 0, random = Math.random } = {}) {
  const restrictionPool = makeRestrictionPool();
  return FACTIONS.flatMap(faction => Array.from({ length: 3 }, (_, index) => {
    const difficulty = turnNumber === 0 ? 'EASY' : choose(DIFFICULTIES, random);
    const missionType = choose(MISSION_TYPES, random);
    const selectedRestrictions = generateRestrictions(missionType, restrictionPool, random);
    const restrictionsByMap = missionType === 'DYNAMIC_ENGAGEMENT'
      ? selectedRestrictions.map(restriction => [restriction]) : null;
    const restrictions = restrictionsByMap ? [] : selectedRestrictions;
    const seed = Math.floor(random() * 0x100000000) >>> 0;
    // Base maps still provide varied procedural geometry. Their generic
    // backgrounds are bypassed by the faction environment used for rendering.
    const mapKeys = missionType === 'DYNAMIC_ENGAGEMENT'
      ? shuffle(MAP_KEYS, random)
      : [choose(MAP_KEYS, random)];
    const environment = getFactionEnvironment(faction);
    const [minimum, maximum] = DIFFICULTY_WAVE_RANGES[difficulty];
    let wavesPerMap;
    if (missionType === 'DYNAMIC_ENGAGEMENT') {
      wavesPerMap = Number(difficulty.replace(/\D/g, '')) <= 2
        ? 7 : 10 + Math.floor(random() * 6);
    } else {
      const ordinaryWaves = minimum + Math.floor(random() * (maximum - minimum + 1));
      wavesPerMap = missionType === 'BARRICADE' ? Math.ceil(ordinaryWaves * 0.5) : ordinaryWaves;
    }
    const restrictionMultiplier = restrictions.length >= 2 ? 1.5 : restrictions.length === 1 ? 1.25 : 1;
    return {
      id: `turn-${turnNumber}-${faction}-${index}-${seed.toString(36)}`,
      faction,
      environmentKey: environment.key,
      environmentLabel: environment.label,
      offerIndex: index,
      missionType,
      difficulty,
      restrictions,
      restrictionsByMap,
      rewardMultiplier: restrictionMultiplier * (missionType === 'GAUNTLET' ? 1.5 : 1),
      seed,
      mapKeys,
      mapSeeds: mapKeys.map((_, mapIndex) => (seed + Math.imul(mapIndex + 1, 0x9e3779b9)) >>> 0),
      wavesPerMap,
      parameters: {
        protectedZoneToughness: missionType === 'BARRICADE' ? 1 : missionType === 'GAUNTLET' ? 15 : missionType === 'DYNAMIC_ENGAGEMENT' ? 5 : 10,
        barricadeHealth: missionType === 'BARRICADE' ? 100 : null,
        startingForceMultiplier: missionType === 'BARRICADE' ? 1.1 : 1,
        enemyCountMultiplier: missionType === 'BARRICADE' ? 1.25 : 1,
        mapScale: missionType === 'BARRICADE' ? 0.35 : 1,
      },
    };
  }));
}

export function getRestrictionRewardMultiplier(restrictions = []) {
  return restrictions.length >= 2 ? 1.5 : restrictions.length === 1 ? 1.25 : 1;
}
