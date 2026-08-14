(function(){
  // db-wrapper provides a stable global `window.db` that delegates to window.supabase when available,
  // otherwise provides safe no-op/mocked behavior. This lets code import or use `window.db` instead
  // of directly importing @supabase/supabase-js.

  function makeNoopTable() {
    return {
      select: (cols) => Promise.resolve({ data: [], error: null }),
      insert: (rows) => Promise.resolve({ data: Array.isArray(rows)? rows : [rows], error: null }),
      update: (changes) => ({ eq: (col, val) => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ eq: (col, val) => Promise.resolve({ data: [], error: null }) }),
      single: () => Promise.resolve({ data: null, error: null }),
      limit: (n) => ({ then: (cb) => Promise.resolve({ data: [], error: null }).then(cb) }),
      order: (c,d) => ({ then: (cb) => Promise.resolve({ data: [], error: null }).then(cb) }),
      eq: (c,v) => ({ then: (cb) => Promise.resolve({ data: [], error: null }).then(cb) })
    };
  }

  function getFrom(table){
    if(window.supabase && typeof window.supabase.from === 'function'){
      try { return window.supabase.from(table); } catch(e){ return makeNoopTable(); }
    }
    return makeNoopTable();
  }

  window.db = {
    from: getFrom,
    getClient: () => window.supabase || null,
    auth: {
      signIn: (opts) => (window.supabase && window.supabase.auth && window.supabase.auth.signIn) ? window.supabase.auth.signIn(opts) : Promise.resolve({ data: null, error: null }),
      signOut: () => (window.supabase && window.supabase.auth && window.supabase.auth.signOut) ? window.supabase.auth.signOut() : Promise.resolve({ error: null })
    }
  };
})();
