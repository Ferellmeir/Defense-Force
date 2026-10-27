import { displayFactionName, FACTIONS } from '../utils/factions.js';

const SHARED_SCI_FI_ENVIRONMENT = {
  key: 'shared_scifi',
  label: 'Shared sci-fi field · faction environment unspecified',
  backgroundKey: 'generic_scifi_background',
  factionSpecific: false,
};

export const FACTION_ENVIRONMENTS = {
  'Ordo Sanctus': SHARED_SCI_FI_ENVIRONMENT,
  'Laisung Collective': {
    key: 'laisung',
    label: 'Laisung battlefield',
    backgroundKey: 'laisung_background',
    factionSpecific: true,
  },
  'Strozek Supremacy': SHARED_SCI_FI_ENVIRONMENT,
  'Underworld Network': {
    key: 'underworld',
    label: 'Underworld Network battlefield',
    backgroundKey: 'sewer_rat_battlefield_background',
    factionSpecific: true,
  },
};

export function getFactionEnvironment(faction) {
  const canonicalFaction = displayFactionName(faction);
  if (!FACTIONS.includes(canonicalFaction)) return SHARED_SCI_FI_ENVIRONMENT;
  return FACTION_ENVIRONMENTS[canonicalFaction];
}
