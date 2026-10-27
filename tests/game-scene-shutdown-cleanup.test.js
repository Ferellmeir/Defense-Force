import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameSceneSource = readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');

test('battlefield cleanup does not re-clear a Phaser Group after UpdateList shutdown', () => {
  // Phaser.add.group() registers its Group with UpdateList, which destroys it
  // before GameScene's shutdown listener. The visual objects are already
  // owned by the Scene display list or mapLayer, so no cleanup Group is needed.
  assert.doesNotMatch(gameSceneSource, /this\.add\.group\(\)/);
  assert.doesNotMatch(gameSceneSource, /this\.map\.(?:add|clear)\(/);
  assert.match(gameSceneSource, /this\.map = null;/);
});
