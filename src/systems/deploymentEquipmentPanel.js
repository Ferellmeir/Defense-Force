export const DEPLOYMENT_EQUIPMENT_SLOTS = [
  { slot: 'right', label: 'RIGHT' },
  { slot: 'left', label: 'LEFT' },
  { slot: 'utility', label: 'UTILITY' },
  { slot: 'augment', label: 'AUGMENT' },
];

export function getDeploymentEquipmentRows(deployment, rpgManager) {
  if (!deployment) return [];
  const owned = deployment;
  if (!owned) return [];
  return DEPLOYMENT_EQUIPMENT_SLOTS.map(({ slot, label }) => {
    const itemId = slot === 'augment' ? owned.augments?.[0] || null : owned.equipped?.[slot] || null;
    return {
      slot,
      label,
      itemId,
      item: itemId ? rpgManager.getItemDefinition(itemId) || null : null,
    };
  });
}
