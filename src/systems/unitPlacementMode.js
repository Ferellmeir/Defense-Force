export function selectUnitForPlacement(unitId, registry, gameScene) {
  gameScene?.setSpecialTilePlacementMode(false);
  registry.set('selectedUnit', unitId);
}
