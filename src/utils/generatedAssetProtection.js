import path from 'node:path';

const protectedAssetFilenames = new Set([
  'enemy_basic.png',
  'enemy_fast.png',
  'enemy_armored.png',
  'enemy_elite.png',
  'enemy_boss.png',
  'enemy_swarmer.png',
  'enemy_armorer.png',
  'enemy_grafter.png',
  'gutter_thug.png',
  'anarcho_saboteur.png',
  'syndicate_fixer.png',
  'belter_pirate.png',
  'pallid_order_blade.png',
  'infiltrator.png',
]);

export function writeGeneratedAsset(filename, content, writeFile) {
  const basename = path.basename(filename).toLowerCase();
  if (protectedAssetFilenames.has(basename)) {
    throw new Error(`Refusing to overwrite protected artwork: ${basename}`);
  }
  return writeFile(filename, content);
}
