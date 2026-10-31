import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { GAME_FONT_FAMILY, GAME_LETTER_SPACING, GAME_TEXT_OUTLINE, installGameFontDefaults, withGameFont } from '../src/utils/gameFonts.js';

test('font defaults apply to Phaser text while preserving all other text styling', () => {
  const style = withGameFont({ fontSize: '22px', color: '#fff', fontStyle: 'bold', align: 'center' });
  assert.equal(style.fontFamily, GAME_FONT_FAMILY);
  assert.deepEqual({ fontSize: style.fontSize, color: style.color, fontStyle: style.fontStyle, align: style.align }, {
    fontSize: '22px', color: '#fff', fontStyle: 'bold', align: 'center',
  });
  assert.equal(withGameFont().fontFamily, GAME_FONT_FAMILY);
  assert.deepEqual({ stroke: style.stroke, strokeThickness: style.strokeThickness }, GAME_TEXT_OUTLINE);
  assert.equal(style.letterSpacing, GAME_LETTER_SPACING);
  assert.deepEqual(withGameFont('bold 16px Arial'), { font: 'bold 16px Arial', fontFamily: GAME_FONT_FAMILY, ...GAME_TEXT_OUTLINE, letterSpacing: GAME_LETTER_SPACING });
});

test('Phaser add.text and make.text both receive the game font, including dynamic text', () => {
  const calls = [];
  function GameObjectFactory() {}
  GameObjectFactory.prototype.text = function (x, y, text, style) { calls.push(['add', style]); };
  function GameObjectCreator() {}
  GameObjectCreator.prototype.text = function (config) { calls.push(['make', config.style]); };
  function Text() {}
  Text.prototype.setStyle = function (style) { this.appliedStyle = style; return this; };
  installGameFontDefaults({ GameObjects: { Text, GameObjectFactory, GameObjectCreator } });
  new GameObjectFactory().text(0, 0, 'Wave 1');
  new GameObjectCreator().text({ text: 'Damage 10%', style: { fontSize: '12px' } });
  assert.deepEqual(calls.map(([kind, style]) => [kind, style.fontFamily]), [
    ['add', GAME_FONT_FAMILY], ['make', GAME_FONT_FAMILY],
  ]);
  assert.deepEqual(calls.map(([, style]) => [style.stroke, style.strokeThickness]), [
    [GAME_TEXT_OUTLINE.stroke, GAME_TEXT_OUTLINE.strokeThickness],
    [GAME_TEXT_OUTLINE.stroke, GAME_TEXT_OUTLINE.strokeThickness],
  ]);
  assert.deepEqual(calls.map(([, style]) => style.letterSpacing), [GAME_LETTER_SPACING, GAME_LETTER_SPACING]);
});

test('Phaser setStyle cannot clear or replace the global text outline', () => {
  function Text() {}
  Text.prototype.setStyle = function (style) { this.appliedStyle = style; return this; };
  Text.prototype.setStroke = function (color, thickness) { this.appliedStroke = { color, thickness }; return this; };
  Text.prototype.setLetterSpacing = function (spacing) { this.appliedLetterSpacing = spacing; return this; };
  function GameObjectFactory() {}
  GameObjectFactory.prototype.text = function () {};
  function GameObjectCreator() {}
  GameObjectCreator.prototype.text = function () {};

  installGameFontDefaults({ GameObjects: { Text, GameObjectFactory, GameObjectCreator } });
  const text = new Text();
  text.setStyle({ color: '#fff', stroke: '#ff0000', strokeThickness: 0 });
  text.setStroke('#ff0000', 0);
  text.setLetterSpacing(0);

  assert.deepEqual(text.appliedStyle, { color: '#fff', ...GAME_TEXT_OUTLINE, letterSpacing: GAME_LETTER_SPACING });
  assert.deepEqual(text.appliedStroke, { color: GAME_TEXT_OUTLINE.stroke, thickness: GAME_TEXT_OUTLINE.strokeThickness });
  assert.equal(text.appliedLetterSpacing, GAME_LETTER_SPACING);
});

test('font files, CSS faces, preload hints, and startup wait are configured', () => {
  const fontsDir = new URL('../public/assets/fonts/', import.meta.url);
  const files = readdirSync(fontsDir).filter(name => name.endsWith('.ttf'));
  assert.deepEqual(files.sort(), ['MegabotFive-n8DR.ttf', 'MegabotFiveItalic-zBRl.ttf'].sort());
  assert.ok(files.every(file => statSync(new URL(file, fontsDir)).size > 1000));
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const deployment = readFileSync(new URL('../src/scenes/DeploymentScene.js', import.meta.url), 'utf8');
  assert.equal((html.match(/@font-face/g) || []).length, 2);
  assert.match(html, /font-style:\s*italic/);
  assert.match(html, /font-display:\s*block/);
  assert.match(html, /#game-container, #game-container \*,\s*#game-container \*::before, #game-container \*::after,\s*#game-container input::placeholder\s*\{\s*-webkit-text-stroke:\s*0\.5px\s+#000\s*!important/);
  assert.match(html, /#game-container, #game-container \*,\s*#game-container \*::before, #game-container \*::after,\s*#game-container input::placeholder\s*\{[^}]*letter-spacing:\s*1px\s*!important/);
  assert.match(deployment, /this\.add\.dom\([^\n]+createFromHTML\('<input/);
  assert.match(entry, /await loadGameFonts\(document\);[\s\S]*new Phaser\.Game\(config\)/);
});
