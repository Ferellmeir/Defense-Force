import { fmt } from './formatNumber.js';

const PERCENT_MODIFIER_STATS = new Set([
  'attackSpeedModifier', 'criticalChance', 'criticalModifier', 'reloadSpeed', 'armorPenetration',
]);

export function formatStatModifier(stat, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const isPercent = PERCENT_MODIFIER_STATS.has(stat);
  const displayed = isPercent ? number * 100 : number;
  return `${displayed >= 0 ? '+' : ''}${fmt(displayed)}${isPercent ? '%' : ''}`;
}

export function formatSignedPercent(value) {
  const percent = Number(value) * 100;
  return `${percent >= 0 ? '+' : ''}${fmt(percent)}%`;
}
