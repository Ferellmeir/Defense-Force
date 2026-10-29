import { DIFFICULTY_WAVE_RANGES } from './waveGenerator.js';

export const MISSION_TYPE_COLORS = {
  GAUNTLET: 0xe05252,
  SECURE_REGION: 0x55aaff,
  BARRICADE: 0x9aa3ad,
  DYNAMIC_ENGAGEMENT: 0xff9f43,
};

const DIFFICULTY_ORDER = Object.keys(DIFFICULTY_WAVE_RANGES);

function difficultyValue(difficulty) {
  if (typeof difficulty === 'number' && Number.isFinite(difficulty)) return difficulty;
  const label = String(difficulty ?? '').toUpperCase();
  const namedIndex = DIFFICULTY_ORDER.indexOf(label);
  if (namedIndex >= 0) return namedIndex + 1;
  const numericValue = Number(label);
  return Number.isFinite(numericValue) ? numericValue : Number.POSITIVE_INFINITY;
}

export function sortMissionsByDifficulty(missions = []) {
  return missions.map((mission, originalIndex) => ({ mission, originalIndex }))
    .sort((a, b) => difficultyValue(a.mission?.difficulty) - difficultyValue(b.mission?.difficulty)
      || a.originalIndex - b.originalIndex)
    .map(({ mission }) => mission);
}

export function getMissionTypeColor(missionType) {
  return MISSION_TYPE_COLORS[missionType] ?? 0x9aa3ad;
}
