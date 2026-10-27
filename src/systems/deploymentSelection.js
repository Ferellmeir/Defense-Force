export function getDeploymentItemKey(item) {
  const identity = item?.selectionId ?? item?.id;
  return item?.kind && identity !== undefined && identity !== null
    ? `${item.kind}:${identity}`
    : null;
}

export function createDeploymentSelection() {
  let selectedKey = null;
  return {
    select(item) { selectedKey = getDeploymentItemKey(item); return selectedKey; },
    clear() { selectedKey = null; },
    get key() { return selectedKey; },
    isSelected(item) { return Boolean(selectedKey) && getDeploymentItemKey(item) === selectedKey; },
    resolve(items) { return items.find(item => this.isSelected(item)) || null; },
  };
}

export function handleDeploymentItemPointerDown(item, event, { selectItem, assignUnit }) {
  event?.stopPropagation?.();
  selectItem(item);
  if (item?.kind === 'unit') assignUnit(item.id);
}
