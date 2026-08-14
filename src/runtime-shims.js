(function(){
  // Simple logger shim with in-memory buffer
  const buf = [];
  window.logger = {
    info(msg, data){ buf.push({ time: new Date().toISOString(), level: 'info', message: String(msg), data }); console.info(msg, data); },
    warn(msg, data){ buf.push({ time: new Date().toISOString(), level: 'warn', message: String(msg), data }); console.warn(msg, data); },
    error(msg, data){ buf.push({ time: new Date().toISOString(), level: 'error', message: String(msg), data }); console.error(msg, data); },
    getBuffer(){ return buf.slice(); }
  };

  // Minimal socket factory (no-op in demo)
  window.createSocket = function(url){
    console.info('createSocket no-op (demo):', url);
    return {
      send(...args){ console.warn('socket.send noop', ...args); },
      close(){},
      onmessage: null,
      onopen: null,
      onclose: null
    };
  };
})();
