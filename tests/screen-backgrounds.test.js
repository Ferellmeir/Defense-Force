import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FACTION_PAGE_BACKGROUNDS, getCoverDisplaySize, MISSION_SELECTION_BACKGROUND, useSceneBackground } from '../src/utils/screenBackgrounds.js';
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

test('custom background scenes suppress the page background and mission maps skip only the generic sci-fi layer', () => {
  const factionScene = fs.readFileSync(new URL('../src/scenes/FactionScene.js', import.meta.url), 'utf8');
  const mapSelectScene = fs.readFileSync(new URL('../src/scenes/MapSelectScene.js', import.meta.url), 'utf8');
  const gameScene = fs.readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(mapSelectScene, /useSceneBackground\(this, `assets\/images\/\$\{MISSION_SELECTION_BACKGROUND\}`\)/);
  assert.match(gameScene, /useSceneBackground\(this\)/);
  assert.match(gameScene, /backgroundKey !== 'generic_scifi_background'/);
  assert.match(gameScene, /camera\.setBackgroundColor\('#101923'\)/);
  assert.match(factionScene, /useSceneBackground\(this, `assets\/images\/\$\{FACTION_PAGE_BACKGROUNDS\[this\.faction\]\}`\)/);
  assert.doesNotMatch(factionScene, /this\.add\.image\([^\n]*backgroundKey/);
  assert.doesNotMatch(mapSelectScene, /this\.add\.image\([^\n]*mission_selection_background/);
  assert.match(gameScene, /this\.createMap\(\);[\s\S]*const pathTile = this\.add\.image[\s\S]*this\.mapLayer\.add\(pathTile\)/);
  assert.match(gameScene, /this\.towerManager = new TowerManager\(this, Tower\)/);
  assert.match(html, /body\.scene-background-active\s*\{[^}]*background-image:\s*none/s);
  assert.match(html, /background-size:\s*cover/);
});

test('scene backgrounds use viewport cover and restore the prior page background on shutdown', () => {
  const previousDocument = globalThis.document;
  const classes = new Set();
  const body = {
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
    },
    style: {
      backgroundImage: 'url(old.jpg)',
      backgroundPosition: 'left top',
      backgroundRepeat: 'repeat',
      backgroundAttachment: 'scroll',
      backgroundSize: 'auto',
    },
  };
  let shutdown;
  globalThis.document = { body };

  try {
    useSceneBackground({ events: { once: (_event, callback) => { shutdown = callback; } } }, 'assets/images/mission selection screen background.jpg');
    assert.equal(body.style.backgroundImage, 'url("assets/images/mission selection screen background.jpg")');
    assert.equal(body.style.backgroundSize, 'cover');
    assert.equal(body.style.backgroundPosition, 'center center');
    assert.equal(classes.has('scene-background-active'), true);

    shutdown();
    assert.equal(body.style.backgroundImage, 'url(old.jpg)');
    assert.equal(body.style.backgroundSize, 'auto');
    assert.equal(classes.has('scene-background-active'), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
