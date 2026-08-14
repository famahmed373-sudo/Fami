// Lightweight Supabase initializer + mock fallback.
// Place at src/supabase-client.js and include before your main app script in index.html.
(function () {
  // Demo seed data used when running in mock/demo mode:
  const DEMO = {
    shops: [
      { id: 1, name: "Demo Shop A", rent: 1000, occupied: true },
      { id: 2, name: "Demo Shop B", rent: 800, occupied: false }
    ],
    payments: [
      { id: 1, shop_id: 1, amount: 1000, date: "2026-01-01" }
    ]
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function chainable(resultArray) {
    // Allows .single(), .eq(), .limit(), .order() simple chaining used by some apps
    let data = clone(resultArray);
    return {
      single() { return Promise.resolve({ data: data[0] || null, error: null }); },
      limit(n) { data = data.slice(0, n); return chainable(data); },
      order(col, dir = 'asc') { data.sort((a,b)=> (a[col] > b[col] ? 1 : -1) * (dir==='asc'?1:-1)); return chainable(data); },
      eq(col, val) { data = data.filter(item => String(item[col]) === String(val)); return chainable(data); },
      then: (cb) => Promise.resolve({ data: data, error: null }).then(cb)
    };
  }

  function makeMock() {
    // very small subset of supabase-js interface used by typical apps:
    return {
      from(table) {
        return {
          select: (cols = "*") => Promise.resolve({ data: clone(DEMO[table] || []), error: null }),
          insert: (rows) => {
            const arr = Array.isArray(rows) ? rows : [rows];
            const target = DEMO[table] || (DEMO[table] = []);
            // assign simple incremental id
            arr.forEach(r => {
              r.id = (target.length ? (target[target.length - 1].id + 1) : 1);
              target.push(r);
            });
            // persist to localStorage for session persistence:
            try { localStorage.setItem('FAMI_DEMO_DATA', JSON.stringify(DEMO)); } catch (e) {}
            return Promise.resolve({ data: arr, error: null });
          },
          update: (changes) => ({
            eq: (col, val) => {
              const target = DEMO[table] || [];
              for (let i = 0; i < target.length; i++) {
                if (String(target[i][col]) === String(val)) {
                  Object.assign(target[i], changes);
                }
              }
              try { localStorage.setItem('FAMI_DEMO_DATA', JSON.stringify(DEMO)); } catch (e) {}
              return Promise.resolve({ data: clone(target), error: null });
            }
          }),
          delete: () => ({
            eq: (col, val) => {
              const target = DEMO[table] || [];
              const before = target.length;
              DEMO[table] = target.filter(item => String(item[col]) !== String(val));
              try { localStorage.setItem('FAMI_DEMO_DATA', JSON.stringify(DEMO)); } catch (e) {}
              return Promise.resolve({ data: DEMO[table], error: null });
            }
          }),
          // Provide chainable helpers
          single: () => chainable(DEMO[table] || []).single(),
          limit: (n) => chainable(DEMO[table] || []).limit(n),
          order: (c,d) => chainable(DEMO[table] || []).order(c,d),
          eq: (c,v) => chainable(DEMO[table] || []).eq(c,v),
        };
      },
      auth: {
        // stubbed auth methods if your UI calls them
        signIn: (opts) => Promise.resolve({ data: null, error: null }),
        signOut: () => Promise.resolve({ error: null })
      }
    };
  }

  // If there is saved demo state from a previous run, restore it
  try {
    const saved = localStorage.getItem('FAMI_DEMO_DATA');
    if (saved) {
      const s = JSON.parse(saved);
      Object.assign(DEMO, s);
    }
  } catch (e) {}

  // Expose supabase client or mock at window.supabase.
  // Your app can use window.supabase.from('shops').select() etc.
  (function initClient() {
    // If you have build-time injection of keys, put them on window.SUPABASE_URL / window.SUPABASE_ANON_KEY
    const url = window.SUPABASE_URL || null;
    const key = window.SUPABASE_ANON_KEY || null;

    if (url && key) {
      // dynamic import of supabase client (CDN ESM)
      import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
        .then(({ createClient }) => {
          try {
            window.supabase = createClient(url, key);
            window.logger && window.logger.info('Supabase: real client initialized.');
            console.log('Supabase: real client initialized.');
          } catch (e) {
            console.error('Supabase init failed, falling back to mock.', e);
            window.supabase = makeMock();
          }
        })
        .catch(err => {
          console.warn('Failed to load supabase-js from CDN — using mock. Error:', err);
          window.supabase = makeMock();
        });
    } else {
      // No keys -> mock mode
      console.warn('Supabase keys not found. Running in DEMO/MOCK mode (no DB).');
      window.supabase = makeMock();
    }
  })();
})();
