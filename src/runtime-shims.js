// Runtime shims for logging and WebSocket fallback
// Place at src/runtime-shims.js and include before your main app script in index.html.
(function () {
  // Simple buffered logger that prints to console and keeps recent entries
  const MAX_LOGS = 200;
  const buffer = [];

  function push(level, args) {
    const entry = { level, time: new Date().toISOString(), message: Array.from(args).map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')};
    buffer.push(entry);
    if (buffer.length > MAX_LOGS) buffer.shift();
    if (console && console[level]) console[level](...args);
  }

  window.logger = {
    log: function(){ push('log', arguments); },
    info: function(){ push('info', arguments); },
    warn: function(){ push('warn', arguments); },
    error: function(){ push('error', arguments); },
    getBuffer: () => buffer.slice()
  };

  // Simple WebSocket wrapper with graceful fallback (no-op) if sockets not allowed
  function createSocket(url) {
    try {
      if (!url) throw new Error('No URL');
      const ws = new WebSocket(url);
      const listeners = new Map();
      ws.addEventListener('message', (ev) => {
        const cb = listeners.get('message');
        if (cb) cb(ev.data);
      });
      return {
        send: (d) => { try{ ws.send(d); } catch(e){ window.logger.error('WS send failed', e); } },
        on: (evt, cb) => { listeners.set(evt, cb); },
        close: () => { try{ ws.close(); } catch(e){} }
      };
    } catch (e) {
      window.logger.warn('WebSocket unavailable, using no-op socket:', e.message);
      return {
        send: () => {},
        on: () => {},
        close: () => {}
      };
    }
  }

  window.createSocket = createSocket;
})();
