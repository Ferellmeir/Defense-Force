const { contextBridge, ipcRenderer } = require('electron');

function report(type, detail = {}) {
  try {
    ipcRenderer.send('runtime-diagnostic', {
      type,
      detail,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[runtime-diagnostics] Unable to send diagnostic to main process:', error);
  }
}

contextBridge.exposeInMainWorld('runtimeDiagnostics', {
  report(entry) {
    report(entry?.type || 'renderer-diagnostic', entry?.detail || {});
  },
});

window.addEventListener('error', event => {
  report('renderer-uncaught-error', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  report('renderer-unhandled-rejection', {
    message: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

report('renderer-preload-ready', { url: location.href });
