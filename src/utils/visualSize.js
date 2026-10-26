export function getAspectFitDisplaySize(sourceWidth, sourceHeight, visualSize) {
  const width = Number(visualSize?.width);
  const height = Number(visualSize?.height);
  if (
    !Number.isFinite(sourceWidth) || sourceWidth <= 0
    || !Number.isFinite(sourceHeight) || sourceHeight <= 0
    || !Number.isFinite(width) || width <= 0
    || !Number.isFinite(height) || height <= 0
  ) {
    throw new Error('Source dimensions and configured visual size must be positive numbers.');
  }

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}
