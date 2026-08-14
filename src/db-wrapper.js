(function(){
  function makeNoopTable(){
    const noop = Promise.resolve({ data: [], error: null });
    const chain = () => ({ select: () => noop, insert: () => noop, update: () => ({ eq: () => noop }), delete: () => ({ eq: () => noop }), single: () => Promise.resolve({ data: null, error: null }) });
    return {
      select: () => Promise.resolve({ data: [], error: null }),
      insert: (rows) => Promise.resolve({ data: Array.isArray(rows) ? rows : [rows], error: null }),
      update: (changes) => ({ eq: (c,v) => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ eq: (c,v) => Promise.resolve({ data: [], error: null }) }),
      single: () => Promise.resolve({ data: null, error: null }),
      eq: () => ({ then: (cb) => noop.then(cb) })
    };
  }

  function getFrom(table){
    try{
      if(window.supabase && typeof window.supabase.from === 'function'){
        return window.supabase.from(table);
      }
    }catch(e){ console.warn('window.supabase.from threw', e); }
    return makeNoopTable();
  }

  window.db = {
    from: getFrom,
    getClient: () => (window.supabase || null),
    auth: {
      signIn: (opts) => (window.supabase && window.supabase.auth && window.supabase.auth.signIn) ? window.supabase.auth.signIn(opts) : Promise.resolve({ data: null, error: null }),
      signOut: () => (window.supabase && window.supabase.auth && window.supabase.auth.signOut) ? window.supabase.auth.signOut() : Promise.resolve({ error: null })
    }
  };
})();
