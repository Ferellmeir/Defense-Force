import { formatSignedPercent } from '../utils/statFormatting.js';

const STAT_LABELS = {
  damage: 'Damage', range: 'Range', attackSpeedModifier: 'Attack speed', criticalChance: 'Critical chance',
  criticalModifier: 'Critical damage', reloadSpeed: 'Reload speed', armorPenetration: 'Armor penetration',
  sellBonus: 'Sell value', xpPerKill: 'XP per kill', statusDuration: 'Status duration',
};

function effectLabel(effect) {
  if (!effect) return '';
  if (effect.property === 'weakenedChance') {
    return `${Math.round(Number(effect.value || 0) * 100)}% chance to apply Weakened (+${Math.round(Number(effect.damageTakenMultiplier ?? 0.15) * 100)}% status-effect damage for ${Number(effect.duration || 5000) / 1000} seconds)`;
  }
  if (effect.type === 'special') return effect.property || 'Special effect';
  if (effect.stat) {
    const stat = STAT_LABELS[effect.stat] || effect.stat;
    const value = Number(effect.value);
    if (!Number.isFinite(value)) return stat;
    const amount = effect.mode === 'percent' ? formatSignedPercent(value) : effect.mode === 'multiplier' ? `×${value}` : `${value}`;
    return `${stat} ${effect.mode === 'percent' ? amount : `${value >= 0 ? '+' : ''}${amount}`}`;
  }
  if (effect.property) return effect.property;
  return '';
}

function pathEffectLabel(path) {
  if (path.unimplemented) return 'Unimplemented';
  const effects = [effectLabel(path.effect), ...(path.upgrades || []).map(upgrade => effectLabel(upgrade.effect)), effectLabel(path.maxBonus), path.maxBonusDescription].filter(Boolean);
  return effects.length ? effects.join(' → ') : 'No defined effect';
}

export function getDeploymentUpgradeOverview(rpgManager, unitId, progression = {}) {
  if (!unitId) return [];
  const tiers = rpgManager.getPathChoiceState(unitId, progression);
  return tiers.map(tier => ({
    tier: tier.tier,
    unlocked: tier.unlocked,
    paths: tier.paths.map(path => ({
      id: path.id,
      name: path.name || (path.unimplemented ? 'Unimplemented path' : path.id || 'Unnamed path'),
      description: path.description || '',
      effect: pathEffectLabel(path),
      level: path.level,
      status: path.unimplemented || (!path.name && !path.effect) ? 'Unimplemented'
        : path.level > 0 ? `Acquired · ${path.level}/3${path.available ? ' · available now' : ''}`
          : path.available ? 'Available now'
            : tier.unlocked ? (path.abandoned ? 'Locked · choice closed' : 'Locked · tier limit reached')
              : 'Locked · tier unavailable',
    })),
  }));
}

