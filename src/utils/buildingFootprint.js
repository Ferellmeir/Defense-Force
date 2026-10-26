export const BUILDING_SPRITES = {
  '2x2': 'scenery_building_2x2',
  '2x4': 'scenery_building_2x4',
  '2x3': 'scenery_building_3x3',
  '3x2': 'scenery_building_3x3',
};

export function getBuildingFootprint(building) {
  const tiles = [];
  for (let y = building.y; y < building.y + building.height; y += 1) {
    for (let x = building.x; x < building.x + building.width; x += 1) tiles.push({ x, y });
  }
  return tiles;
}

export function getBuildingDisplaySize(building, tileSize) {
  return { width: building.width * tileSize, height: building.height * tileSize };
}

export function getBuildingSprite(building, faction = null) {
  const size = `${building.width}x${building.height}`;
  if (faction === 'Laisung Collective') {
    const laisungSprites = {
      '2x2': 'laisung_building_2x2',
      '2x4': 'laisung_building_2x4',
      '3x3': 'laisung_building_3x3',
      '3x2': 'laisung_building_3x3',
    };
    if (laisungSprites[size]) return laisungSprites[size];
  }
  return BUILDING_SPRITES[size] || null;
}
