const UI_IMAGES = [
  'btn_disabled', 'btn_hover', 'btn_normal', 'btn_pressed',
  'frame_common', 'frame_uncommon', 'frame_rare', 'frame_exotic', 'frame_legendary', 'frame_makeshift',
  'icon_acid', 'icon_bleeding', 'icon_credits', 'icon_difficulty', 'icon_energy', 'icon_exposed',
  'icon_force', 'icon_influence', 'icon_physical', 'icon_poison', 'icon_slowed', 'icon_star',
  'icon_strength', 'icon_wave', 'mainmenu', 'mute', 'panel_9', 'restart', 'unmute',
];

export function preloadUiAssets(scene) {
  UI_IMAGES.forEach(key => {
    if (!scene.textures.exists(`ui_${key}`)) scene.load.image(`ui_${key}`, `assets/ui/${key}.png`);
  });
}

export function rarityFrame(rarity) {
  const key = String(rarity || 'common').toLowerCase();
  return ['common', 'uncommon', 'rare', 'exotic', 'legendary', 'makeshift'].includes(key)
    ? `ui_frame_${key}`
    : 'ui_frame_common';
}
