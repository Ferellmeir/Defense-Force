import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EQUIPMENT_CATEGORY_ICON_FILES, EQUIPMENT_CATEGORY_ICONS, getEquipmentCategoryIcon } from '../src/systems/equipmentCategoryIcons.js';
import { preloadUiAssets } from '../src/helpers/uiAssets.js';

const equipment = JSON.parse(readFileSync(new URL('../src/assets/config/equipment.json', import.meta.url), 'utf8'));

test('all eight supplied transparent icon assets are present under the expected filenames', () => {
  assert.deepEqual(Object.keys(EQUIPMENT_CATEGORY_ICON_FILES), [
    'oneHandedRanged', 'twoHandedRanged', 'heavyRanged', 'oneHandedMelee',
    'twoHandedMelee', 'heavyMelee', 'utility', 'augment',
  ]);
  for (const filename of Object.values(EQUIPMENT_CATEGORY_ICON_FILES)) {
    const bytes = readFileSync(new URL(`../public/assets/ui/${filename}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], filename);
  }
});

test('UI preload registers all eight icons at their exact supplied asset paths', () => {
  const queued = new Map();
  preloadUiAssets({
    textures: { exists: () => false },
    load: { image: (key, path) => queued.set(key, path) },
  });
  for (const [category, filename] of Object.entries(EQUIPMENT_CATEGORY_ICON_FILES)) {
    assert.equal(queued.get(EQUIPMENT_CATEGORY_ICONS[category]), `assets/ui/${filename}`);
  }
});

test('weapon category selection uses internal weapon type, hand count, attack style, and explicit heavy metadata', () => {
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 1, attackType: 'ranged' }), EQUIPMENT_CATEGORY_ICONS.oneHandedRanged);
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 2, attackType: 'ranged' }), EQUIPMENT_CATEGORY_ICONS.twoHandedRanged);
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 2, attackType: 'ranged', weaponClass: 'heavy' }), EQUIPMENT_CATEGORY_ICONS.heavyRanged);
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 1, attackType: 'melee' }), EQUIPMENT_CATEGORY_ICONS.oneHandedMelee);
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 2, attackType: 'melee' }), EQUIPMENT_CATEGORY_ICONS.twoHandedMelee);
  assert.equal(getEquipmentCategoryIcon({ type: 'weapon', hands: 2, attackType: 'melee', weaponCategory: 'heavy_melee' }), EQUIPMENT_CATEGORY_ICONS.heavyMelee);
});

test('utility and augment identifiers stay distinct even when a store card uses a display type', () => {
  assert.equal(getEquipmentCategoryIcon({ type: 'equipment', equipmentCategoryType: 'utility' }), EQUIPMENT_CATEGORY_ICONS.utility);
  assert.equal(getEquipmentCategoryIcon({ type: 'augment' }), EQUIPMENT_CATEGORY_ICONS.augment);
  assert.equal(getEquipmentCategoryIcon({ type: 'utility' }), EQUIPMENT_CATEGORY_ICONS.utility);
});

test('existing equipment definitions resolve without changing their gameplay data', () => {
  const weaponCategories = new Set(Object.values(equipment.items).map(getEquipmentCategoryIcon));
  assert.ok(weaponCategories.has(EQUIPMENT_CATEGORY_ICONS.oneHandedRanged));
  assert.ok(weaponCategories.has(EQUIPMENT_CATEGORY_ICONS.oneHandedMelee));
  assert.ok(weaponCategories.has(EQUIPMENT_CATEGORY_ICONS.twoHandedRanged));
  assert.ok(weaponCategories.has(EQUIPMENT_CATEGORY_ICONS.twoHandedMelee));
  assert.ok(Object.values(equipment.augments).filter(item => item.type === 'utility')
    .every(item => getEquipmentCategoryIcon(item) === EQUIPMENT_CATEGORY_ICONS.utility));
  assert.ok(Object.values(equipment.augments).filter(item => item.type === 'augment')
    .every(item => getEquipmentCategoryIcon(item) === EQUIPMENT_CATEGORY_ICONS.augment));
});

test('store and deployment screens use the shared icons for cards and equipped slots', async () => {
  const sources = await Promise.all([
    readFileSync(new URL('../src/scenes/StoreScene.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/scenes/MainHubScene.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/scenes/FactionScene.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/scenes/DeploymentScene.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(sources.every(source => source.includes('getEquipmentCategoryIcon')));
  assert.match(sources[3], /getEquipmentPanelIcon\(row\.item\)/);
  assert.match(sources[3], /getAspectFitDisplaySize\(source\.width, source\.height, \{ width: 22, height: 22 \}\)/);
});
