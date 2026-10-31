export function getMissionHudLayout(width = 1280) {
  const scale = width / 1280;
  return {
    width,
    status: [24, 220, 400, 575].map(x => x * scale),
    pause: 755 * scale,
    speedStart: 830 * scale,
    speedStep: 42 * scale,
    menu: 1100 * scale,
    mute: 1210 * scale,
  };
}

export function shouldShowBarricadeTileControls(missionType, remainingPoints) {
  return missionType === 'BARRICADE' && Number(remainingPoints) > 0;
}
