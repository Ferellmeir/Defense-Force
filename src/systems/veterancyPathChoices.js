export const VETERANCY_PATH_BUTTON_START_Y = 460;
export const VETERANCY_PATH_BUTTON_ROW_HEIGHT = 35;

export function getAvailableVeterancyPathOptions(pathTiers) {
  return (pathTiers || []).flatMap(tier => (tier.paths || [])
    .filter(path => path.available)
    .map(path => ({ tier: tier.tier, path })));
}

export function getVeterancyPathButtonY(index) {
  return VETERANCY_PATH_BUTTON_START_Y + index * VETERANCY_PATH_BUTTON_ROW_HEIGHT;
}
