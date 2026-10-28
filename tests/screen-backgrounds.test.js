import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FACTION_PAGE_BACKGROUNDS, getCoverDisplaySize, MISSION_SELECTION_BACKGROUND } from '../src/utils/screenBackgrounds.js';
import { FACTIONS } from '../src/utils/factions.js';

const assetRoot = new URL('../public/assets/images/', import.meta.url);

test('the three faction pages and mission selection map to their supplied JPEGs', () => {
  assert.deepEqual(Object.keys(FACTION_PAGE_BACKGROUNDS), [
    'Laisung Collective', 'Strozek Supremacy', 'Underworld Network',
  ]);
  assert.equal(MISSION_SELECTION_BACKGROUND, 'mission selection screen background.jpg');
  const expected = [
    ...Object.values(FACTION_PAGE_BACKGROUNDS),
    MISSION_SELECTION_BACKGROUND,
  ];
  for (const filename of expected) {
    const bytes = fs.readFileSync(new URL(filename, assetRoot));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
  assert.ok(FACTIONS.every(faction => faction === 'Ordo Sanctus' || FACTION_PAGE_BACKGROUNDS[faction]));
});

test('cover sizing fills the viewport without changing the supplied image aspect ratio', () => {
  const size = getCoverDisplaySize(1920, 1080, 1280, 720);
  assert.deepEqual(size, { width: 1280, height: 720 });

  const portrait = getCoverDisplaySize(900, 1200, 1280, 720);
  assert.ok(portrait.width >= 1280);
  assert.ok(portrait.height >= 720);
  assert.ok(Math.abs(portrait.width / portrait.height - 900 / 1200) < 1e-12);
});
