import { CLEAR_TILE_FORCE_COST } from './tileClearing.js';

export function createTileClearConfirmationController({
  canClear,
  clear,
  getForce,
  onOpen = () => {},
  onClose = () => {},
  onCleared = () => {},
  onInsufficientForce = () => {},
}) {
  let pending = null;

  const close = () => {
    if (!pending) return false;
    pending = null;
    onClose();
    return true;
  };

  return {
    open(position, context) {
      if (pending || !canClear(position, context)) return false;
      pending = {
        position: { x: position.x, y: position.y },
        context,
      };
      onOpen(pending.position, CLEAR_TILE_FORCE_COST);
      return true;
    },
    confirm() {
      if (!pending) return false;
      const selected = pending;
      pending = null;
      const cleared = clear(selected.position, selected.context, CLEAR_TILE_FORCE_COST);
      onClose();
      if (cleared) {
        onCleared(selected.position, selected.context);
        return true;
      }
      if (getForce() < CLEAR_TILE_FORCE_COST) onInsufficientForce(CLEAR_TILE_FORCE_COST);
      return false;
    },
    cancel() { return close(); },
    isOpen() { return pending !== null; },
    destroy() { close(); },
  };
}
