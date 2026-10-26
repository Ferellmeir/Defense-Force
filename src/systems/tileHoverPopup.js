export function createTileHoverPopupController({
  delayMs = 1000,
  schedule,
  cancel,
  onShow,
  onUpdate,
  onHide,
}) {
  let tileId = null;
  let getInfo = null;
  let anchor = null;
  let timer = null;
  let visible = false;

  const stopTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };

  return {
    hover(nextTileId, nextGetInfo, nextAnchor) {
      if (nextTileId === null) return this.leave();
      if (nextTileId === tileId) {
        getInfo = nextGetInfo;
        anchor = nextAnchor;
        if (visible) onUpdate(getInfo(), anchor);
        return;
      }
      stopTimer();
      tileId = nextTileId;
      getInfo = nextGetInfo;
      anchor = nextAnchor;
      if (visible) {
        onUpdate(getInfo(), anchor);
        return;
      }
      timer = schedule(delayMs, () => {
        timer = null;
        if (tileId === null || !getInfo) return;
        visible = true;
        onShow(getInfo(), anchor);
      });
    },
    leave() {
      stopTimer();
      tileId = null;
      getInfo = null;
      anchor = null;
      if (visible) onHide();
      visible = false;
    },
    refresh() {
      if (tileId !== null && visible && getInfo) onUpdate(getInfo(), anchor);
    },
    isVisible() { return visible; },
    destroy() { this.leave(); },
  };
}
