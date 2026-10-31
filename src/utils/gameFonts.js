export const GAME_FONT_FAMILY = '"Megabot Five", sans-serif';
export const GAME_TEXT_OUTLINE = Object.freeze({ stroke: '#000000', strokeThickness: 1.5 });
export const GAME_LETTER_SPACING = 1;

export function withGameFont(style = {}) {
  if (typeof style === 'string') {
    return { font: style, fontFamily: GAME_FONT_FAMILY, ...GAME_TEXT_OUTLINE, letterSpacing: GAME_LETTER_SPACING };
  }
  return { ...style, fontFamily: GAME_FONT_FAMILY, ...GAME_TEXT_OUTLINE, letterSpacing: GAME_LETTER_SPACING };
}

export async function loadGameFonts(documentObject = document) {
  if (!documentObject?.fonts) return;
  await Promise.all([
    documentObject.fonts.load(`16px ${GAME_FONT_FAMILY}`, 'Aa09%?!'),
    documentObject.fonts.load(`italic 16px ${GAME_FONT_FAMILY}`, 'Aa09%?!'),
  ]);
  await documentObject.fonts.ready;
}

export function installGameFontDefaults(PhaserNamespace) {
  const factory = PhaserNamespace.GameObjects.GameObjectFactory.prototype;
  const creator = PhaserNamespace.GameObjects.GameObjectCreator.prototype;
  const text = PhaserNamespace.GameObjects.Text.prototype;
  if (!factory.__gameFontDefaultInstalled) {
    const addText = factory.text;
    factory.text = function addTextWithGameFont(x, y, text, style) {
      return addText.call(this, x, y, text, withGameFont(style));
    };
    Object.defineProperty(factory, '__gameFontDefaultInstalled', { value: true });
  }
  if (!creator.__gameFontDefaultInstalled) {
    const makeText = creator.text;
    creator.text = function makeTextWithGameFont(config = {}, addToScene) {
      return makeText.call(this, { ...config, style: withGameFont(config.style) }, addToScene);
    };
    Object.defineProperty(creator, '__gameFontDefaultInstalled', { value: true });
  }
  if (!text.__gameTextOutlineInstalled) {
    const setStyle = text.setStyle;
    const setStroke = text.setStroke;
    const setLetterSpacing = text.setLetterSpacing;
    text.setStyle = function setStyleWithGameTextOutline(style = {}) {
      const updated = setStyle.call(this, {
        ...style,
        ...GAME_TEXT_OUTLINE,
        letterSpacing: GAME_LETTER_SPACING,
      });
      return setLetterSpacing.call(updated, GAME_LETTER_SPACING);
    };
    text.setStroke = function setStrokeWithGameTextOutline() {
      return setStroke.call(this, GAME_TEXT_OUTLINE.stroke, GAME_TEXT_OUTLINE.strokeThickness);
    };
    text.setLetterSpacing = function setGameLetterSpacing() {
      return setLetterSpacing.call(this, GAME_LETTER_SPACING);
    };
    Object.defineProperty(text, '__gameTextOutlineInstalled', { value: true });
  }
}
