function emit(type, detail = {}) {
  const entry = { type, detail, timestamp: new Date().toISOString() };
  try {
    if (window.runtimeDiagnostics?.report) window.runtimeDiagnostics.report(entry);
    else console.info('[runtime-diagnostics]', entry);
  } catch (error) {
    console.error('[runtime-diagnostics] Logging failed:', error);
  }
}

function sceneKey(scene) {
  return scene?.sys?.settings?.key || scene?.constructor?.name || 'unknown-scene';
}

function countObjects(objects) {
  let displayObjects = 0;
  let interactiveObjects = 0;
  const visit = object => {
    if (!object) return;
    displayObjects += 1;
    if (object.input?.enabled) interactiveObjects += 1;
    if (Array.isArray(object.list)) object.list.forEach(visit);
  };
  (objects || []).forEach(visit);
  return { displayObjects, interactiveObjects };
}

const lifecycleScenes = new WeakSet();

function attachSceneLifecycleDiagnostics(scene) {
  if (lifecycleScenes.has(scene)) return;
  const key = sceneKey(scene);
  const events = scene.events;
  if (!events?.on) return;
  lifecycleScenes.add(scene);
  emit('phaser-scene-start-observed', { scene: key });
  events.on('shutdown', () => emit('phaser-scene-shutdown', { scene: key }));
  events.on('transitionstart', (from, duration) => emit('phaser-scene-transition-start', {
    scene: key,
    from: typeof from === 'string' ? from : from?.sys?.settings?.key,
    duration,
  }));
  events.on('transitioncomplete', from => emit('phaser-scene-transition-complete', {
    scene: key,
    from: typeof from === 'string' ? from : from?.sys?.settings?.key,
  }));
}

export function attachSceneDiagnostics(scenes) {
  scenes.forEach(scene => {
    const key = sceneKey(scene);
    ['init', 'preload', 'create'].forEach(method => {
      if (typeof scene[method] !== 'function') return;
      const original = scene[method];
      scene[method] = function diagnosedSceneMethod(...args) {
        attachSceneLifecycleDiagnostics(this);
        emit('phaser-scene-initialization-start', { scene: key, method });
        try {
          const result = original.apply(this, args);
          emit('phaser-scene-initialization-complete', { scene: key, method });
          return result;
        } catch (error) {
          emit('phaser-scene-initialization-error', {
            scene: key,
            method,
            message: error?.message || String(error),
            stack: error?.stack,
          });
          throw error;
        }
      };
    });

  });
}

export function reportPhaserRuntime(game, phase) {
  try {
    const scenes = game.scene.getScenes(true).map(scene => {
      const objects = countObjects(scene.sys?.displayList?.getChildren?.());
      const isHub = sceneKey(scene) === 'MainHubScene';
      const children = scene.sys?.displayList?.getChildren?.() || [];
      return {
        scene: sceneKey(scene),
        active: scene.sys?.isActive?.() ?? true,
        ...objects,
        ...(isHub ? {
          hubUiCreated: objects.displayObjects > 2 && children.some(object =>
            typeof object.text === 'string' && object.text.includes('DEPLOYMENT LINEUP')
          ),
        } : {}),
      };
    });
    const canvas = game.canvas;
    emit('phaser-runtime-snapshot', {
      phase,
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      } : null,
      activeScenes: scenes,
    });
  } catch (error) {
    emit('phaser-runtime-snapshot-error', {
      phase,
      message: error?.message || String(error),
      stack: error?.stack,
    });
  }
}
