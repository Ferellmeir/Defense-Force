export const FACTIONS = [
  'Ordo Sanctus',
  'Laisung Collective',
  'Strozek Supremacy',
  'Underworld Network',
];

export function displayFactionName(faction) {
  if (faction === 'Nihon Collective') return 'Laisung Collective';
  if (faction === 'Sewer Rats') return 'Underworld Network';
  return faction || 'No faction';
}

export function factionDataName(faction) {
  if (faction === 'Nihon Collective') return 'Laisung Collective';
  if (faction === 'Laisung Collective') return 'Laisung Collective';
  if (faction === 'Underworld Network') return 'Sewer Rats';
  if (faction === 'Sewer Rats') return 'Sewer Rats';
  return faction;
}

export function getFactionInfluence(influence = {}, faction) {
  const canonical = displayFactionName(faction);
  const candidates = [canonical, factionDataName(canonical), faction];
  if (canonical === 'Laisung Collective') candidates.push('Nihon Collective');
  if (canonical === 'Underworld Network') candidates.push('Sewer Rats');
  for (const key of candidates) {
    if (Number.isFinite(Number(influence[key]))) return Number(influence[key]);
  }
  return 0;
}
