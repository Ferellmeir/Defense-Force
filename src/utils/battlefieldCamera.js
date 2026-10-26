export const MIN_BATTLEFIELD_ZOOM = 0.75;
export const MAX_BATTLEFIELD_ZOOM = 2;
export const BATTLEFIELD_DRAG_THRESHOLD = 6;

export function clampBattlefieldZoom(zoom) {
  return Math.max(MIN_BATTLEFIELD_ZOOM, Math.min(MAX_BATTLEFIELD_ZOOM, zoom));
}

export function zoomScrollAtPointer({ scroll, pointer, viewportStart, viewportSize, zoom, nextZoom }) {
  const pointerFromCenter = pointer - viewportStart - viewportSize / 2;
  const worldAtPointer = scroll + pointerFromCenter / zoom;
  return worldAtPointer - pointerFromCenter / nextZoom;
}

export function clampBattlefieldScroll({ scroll, zoom, viewportSize, mapStart, mapEnd }) {
  const visibleSize = viewportSize / zoom;
  const mapSize = mapEnd - mapStart;
  const viewportHalfSize = viewportSize / 2;
  if (mapSize <= visibleSize) return (mapStart + mapEnd) / 2 - viewportHalfSize;
  const minScroll = mapStart + visibleSize / 2 - viewportHalfSize;
  const maxScroll = mapEnd - visibleSize / 2 - viewportHalfSize;
  return Math.max(minScroll, Math.min(maxScroll, scroll));
}
