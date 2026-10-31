export const EQUIPMENT_CATEGORY_ICON_FILES = {
  oneHandedRanged: '1 handed wpn icon.png',
  twoHandedRanged: '2 handed wpn icon.png',
  heavyRanged: 'heavy wpn icon.png',
  oneHandedMelee: '1 handed melee wpn icon.png',
  twoHandedMelee: '2 handed melee wpn icon.png',
  heavyMelee: 'heavy melee wpn icon.png',
  utility: 'utility icon.png',
  augment: 'augment icon.png',
};

export const EQUIPMENT_CATEGORY_ICONS = Object.fromEntries(
  Object.keys(EQUIPMENT_CATEGORY_ICON_FILES).map(category => [category, `ui_equipment_${category}`]),
);

export function getEquipmentCategoryIcon(item) {
  const type = String(item?.equipmentCategoryType || item?.type || '').toLowerCase();
  if (type === 'utility') return EQUIPMENT_CATEGORY_ICONS.utility;
  if (type === 'augment') return EQUIPMENT_CATEGORY_ICONS.augment;
  if (type !== 'weapon') return null;

  const attackType = String(item.attackType || '').toLowerCase();
  const isMelee = attackType === 'melee';
  const category = String(item.weaponCategory || item.weaponClass || item.equipmentClass || '')
    .toLowerCase().replace(/[\s-]+/g, '_');
  const isHeavy = item.heavy === true || category === 'heavy' || category.startsWith('heavy_');
  if (isHeavy || Number(item.hands) > 2) {
    return isMelee ? EQUIPMENT_CATEGORY_ICONS.heavyMelee : EQUIPMENT_CATEGORY_ICONS.heavyRanged;
  }
  if (isMelee) {
    return Number(item.hands) === 2 ? EQUIPMENT_CATEGORY_ICONS.twoHandedMelee : EQUIPMENT_CATEGORY_ICONS.oneHandedMelee;
  }
  return Number(item.hands) === 2 ? EQUIPMENT_CATEGORY_ICONS.twoHandedRanged : EQUIPMENT_CATEGORY_ICONS.oneHandedRanged;
}
