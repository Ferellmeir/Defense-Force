export function getMissionGridLayout(width, height) {
  const marginX = Math.max(16, Math.round(width * 0.02));
  const columnGap = Math.max(8, Math.round(width * 0.009));
  const top = Math.max(84, Math.round(height * 0.128));
  const footerTop = height - Math.max(180, Math.round(height * 0.26));
  const rowGap = Math.max(6, Math.round(height * 0.011));
  const cardWidth = (width - marginX * 2 - columnGap * 2) / 3;
  const cardHeight = (footerTop - top - rowGap * 3) / 4;
  const detailsTop = footerTop + 8;
  const detailsHeight = Math.max(52, height - Math.round(height * 0.15) - detailsTop);
  return {
    marginX, columnGap, top, footerTop, rowGap, cardWidth, cardHeight,
    detailsTop, detailsHeight, prepareY: height - Math.max(56, Math.round(height * 0.09)),
  };
}

export function getMissionCardBounds(index, width, height) {
  const layout = getMissionGridLayout(width, height);
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: layout.marginX + column * (layout.cardWidth + layout.columnGap),
    y: layout.top + row * (layout.cardHeight + layout.rowGap),
    width: layout.cardWidth,
    height: layout.cardHeight,
  };
}
