export const FACTION_PAGE_BACKGROUNDS = {
  'Laisung Collective': 'Laisung faction page background.jpg',
  'Strozek Supremacy': 'Strozek faction page background.jpg',
  'Underworld Network': 'Underworld faction page background.jpg',
};

export const MISSION_SELECTION_BACKGROUND = 'mission selection screen background.jpg';

export function getCoverDisplaySize(sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  if (![sourceWidth, sourceHeight, viewportWidth, viewportHeight].every(value => Number.isFinite(value) && value > 0)) {
    return { width: viewportWidth, height: viewportHeight };
  }
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}
