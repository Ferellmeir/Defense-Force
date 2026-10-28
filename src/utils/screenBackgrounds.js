export const FACTION_PAGE_BACKGROUNDS = {
  'Laisung Collective': 'Laisung faction page background.jpg',
  'Strozek Supremacy': 'Strozek faction page background.jpg',
  'Underworld Network': 'Underworld faction page background.jpg',
};

export const MISSION_SELECTION_BACKGROUND = 'mission selection screen background.jpg';

export function useSceneBackground(scene, imagePath = null) {
  const body = document.body;
  const styleProperties = [
    'backgroundImage',
    'backgroundPosition',
    'backgroundRepeat',
    'backgroundAttachment',
    'backgroundSize',
  ];
  const previousStyles = Object.fromEntries(styleProperties.map(property => [property, body.style[property]]));

  body.classList.add('scene-background-active');
  body.style.backgroundImage = imagePath ? `url("${imagePath}")` : 'none';
  body.style.backgroundPosition = 'center center';
  body.style.backgroundRepeat = 'no-repeat';
  body.style.backgroundAttachment = 'fixed';
  body.style.backgroundSize = 'cover';

  scene.events.once('shutdown', () => {
    body.classList.remove('scene-background-active');
    Object.assign(body.style, previousStyles);
  });
}

export function getCoverDisplaySize(sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  if (![sourceWidth, sourceHeight, viewportWidth, viewportHeight].every(value => Number.isFinite(value) && value > 0)) {
    return { width: viewportWidth, height: viewportHeight };
  }
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}
