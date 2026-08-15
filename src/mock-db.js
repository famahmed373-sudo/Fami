// ============ FAMI demo backend ============
// A Supabase-compatible client backed by localStorage so the app is fully
// usable without credentials. Swapped for the real client when VITE_* keys exist.

const DB_KEY = 'fami_demo_db_v3';
const SES_KEY = 'fami_demo_session_v3';

const DEMO_PASSWORD = 'fami1234';

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------- seed ----------
function seed() {
  const users = [
    { id: uuid(), email: 'admin@fami.demo', password: DEMO_PASSWORD, full_name: 'Abebe Kebede', role: 'admin' },
    { id: uuid(), email: 'marta@fami.demo', password: DEMO_PASSWORD, full_name: 'Marta Haile', role: 'manager' },
    { id: uuid(), email: 'eyob@fami.demo', password: DEMO_PASSWORD, full_name: 'Eyob Tesfaye', role: 'viewer' }
  ];
  const profiles = users.map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, created_at: nowIso() }));

  const shops = [
    { id: uuid(), name: 'Selam Bakery', unit: 'A-01', tenant_name: 'Hanna Bekele', tenant_phone: '0911 234 567', rent_amount: 4800, status: 'active', registered_month: '2025-09', notes: 'Corner unit, bakery ovens on lease', created_at: nowIso() },
    { id: uuid(), name: 'Kaldi Coffee House', unit: 'A-02', tenant_name: 'Dawit Girma', tenant_phone: '0912 876 543', rent_amount: 5200, status: 'active', registered_month: '2025-09', notes: '', created_at: nowIso() },
    { id: uuid(), name: 'Abyssinia Pharmacy', unit: 'B-01', tenant_name: 'Dr. Yonas Alemu', tenant_phone: '0913 445 566', rent_amount: 6500, status: 'active', registered_month: '2025-10', notes: 'Long-term lease', created_at: nowIso() },
    { id: uuid(), name: 'Habesha Textiles', unit: 'B-02', tenant_name: 'Sara Mekonnen', tenant_phone: '0914 998 877', rent_amount: 5500, status: 'active', registered_month: '2025-11', notes: '', created_at: nowIso() },
    { id: uuid(), name: 'Golden Butchery', unit: 'C-01', tenant_name: 'Tigist Wondimu', tenant_phone: '0915 112 233', rent_amount: 4200, status: 'active', registered_month: '2025-12', notes: 'Cold room installed', created_at: nowIso() },
    { id: uuid(), name: 'Zoma Bookstore', unit: 'C-02', tenant_name: 'Liya Tadesse', tenant_phone: '0916 554 433', rent_amount: 3500, status: 'active', registered_month: '2026-01', notes: '', created_at: nowIso() },
    { id: uuid(), name: 'Tena Beauty Salon', unit: 'C-03', tenant_name: 'Nardos Fikru', tenant_phone: '0917 221 100', rent_amount: 3000, status: 'released', registered_month: '2025-12', notes: 'Released Mar 2026', created_at: nowIso() },
    { id: uuid(), name: 'Buna Express Cafe', unit: 'D-01', tenant_name: '', tenant_phone: '', rent_amount: 2600, status: 'vacant', registered_month: '2026-06', notes: 'For rent — contact admin', created_at: nowIso() }
  ];
  const adminId = users[0].id;

  // payment months per shop: key = shop index, value = list of months paid
  const paid = {
    0: ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
    1: ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
    2: ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
    3: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-04', '2026-05', '2026-06', '2026-07'],
    4: ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-07'],
    5: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
    6: ['2025-12', '2026-01', '2026-02']
  };
  const methods = ['Bank Transfer', 'Cash', 'Mobile Money'];
  const payments = [];
  shops.forEach((shop, i) => {
    (paid[i] || []).forEach((m, j) => {
      const day = String(1 + ((j * 3) % 25)).padStart(2, '0');
      payments.push({
        id: uuid(), shop_id: shop.id, user_id: adminId, amount: shop.rent_amount,
        month: m, date: `${m}-${day}`, method: methods[j % methods.length],
        reference: `RCP-${m.slice(2).replace('-', '')}-${String(i + 1).padStart(2, '0')}${String(j + 1).padStart(2, '0')}`,
        note: '', reversed: false, created_at: nowIso()
      });
    });
  });

  const expenses = [
    { id: uuid(), user_id: adminId, category: 'Utilities', amount: 2600, date: '2026-07-05', shop_id: null, description: 'Electricity bill', created_at: nowIso() },
    { id: uuid(), user_id: adminId, category: 'Utilities', amount: 900, date: '2026-07-12', shop_id: null, description: 'Water & sanitation', created_at: nowIso() },
    { id: uuid(), user_id: adminId, category: 'Maintenance', amount: 1400, date: '2026-07-18', shop_id: shops[4].id, description: 'Generator service', created_at: nowIso() },
    { id: uuid(), user_id: adminId, category: 'Staff', amount: 3500, date: '2026-07-28', shop_id: null, description: 'Security guard wages', created_at: nowIso() },
    { id: uuid(), user_id: adminId, category: 'Tax', amount: 1200, date: '2026-07-30', shop_id: null, description: 'Property tax', created_at: nowIso() },
    { id: uuid(), user_id: adminId, category: 'Utilities', amount: 4450, date: '2026-08-04', shop_id: null, description: 'Electricity bill (over budget!)', created_at: nowIso() }
  ];
  const budgets = [
    { id: uuid(), user_id: adminId, category: 'Utilities', month: '2026-08', amount: 4000 },
    { id: uuid(), user_id: adminId, category: 'Maintenance', month: '2026-08', amount: 2000 },
    { id: uuid(), user_id: adminId, category: 'Staff', month: '2026-08', amount: 3500 },
    { id: uuid(), user_id: adminId, category: 'Tax', month: '2026-08', amount: 1500 },
    { id: uuid(), user_id: adminId, category: 'Insurance', month: '2026-08', amount: 1000 }
  ];
  const goals = [
    { id: uuid(), user_id: adminId, name: 'Building renovation fund', target_amount: 60000, saved_amount: 24500, target_date: '2026-12-31', closed: false, created_at: nowIso() },
    { id: uuid(), user_id: adminId, name: 'Emergency reserve', target_amount: 30000, saved_amount: 12500, target_date: '2027-06-30', closed: false, created_at: nowIso() },
    { id: uuid(), user_id: adminId, name: 'New shop signage', target_amount: 8000, saved_amount: 8000, target_date: '2026-08-01', closed: true, created_at: nowIso() }
  ];
  const deposits = [
    { id: uuid(), goal_id: goals[0].id, amount: 5000, date: '2026-07-03', note: 'Monthly deposit', created_at: nowIso() },
    { id: uuid(), goal_id: goals[0].id, amount: 4500, date: '2026-07-19', note: 'Rent surplus', created_at: nowIso() },
    { id: uuid(), goal_id: goals[1].id, amount: 3000, date: '2026-07-10', note: '', created_at: nowIso() }
  ];
  const notifications = [
    { id: uuid(), user_id: adminId, type: 'rent_due', title: 'Rent overdue', message: '3 shops are behind on rent for past months. Total arrears: ETB 17,900.', read: false, created_at: nowIso() },
    { id: uuid(), user_id: adminId, type: 'budget', title: 'Budget exceeded', message: 'Utilities spending is ETB 450 over the August budget.', read: false, created_at: nowIso() },
    { id: uuid(), user_id: adminId, type: 'savings', title: 'Goal reached', message: '"New shop signage" savings goal has been completed. 🎉', read: false, created_at: nowIso() }
  ];
  const activity = [
    { id: uuid(), user_id: adminId, action: 'payment.recorded', entity: 'Payment', entity_id: payments[0].id, details: `Recorded ${payments[0].amount} ETB rent for ${payments[0].month}`, created_at: nowIso() },
    { id: uuid(), user_id: adminId, action: 'expense.added', entity: 'Expense', entity_id: expenses[5].id, details: 'Added expense: Electricity bill (4,450 ETB)', created_at: nowIso() },
    { id: uuid(), user_id: adminId, action: 'savings.deposit', entity: 'Savings', entity_id: deposits[0].id, details: 'Deposited 5,000 ETB to Building renovation fund', created_at: nowIso() }
  ];

  return { users, profiles, shops, payments, expenses, budgets, goals, deposits, notifications, activity, shop_images: [] };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted -> reseed */ }
  const db = seed();
  saveDb(db);
  return db;
}
function saveDb(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota */ }
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SES_KEY) || 'null'); } catch { return null; }
}
function setSession(s) {
  try {
    if (s) localStorage.setItem(SES_KEY, JSON.stringify(s));
    else localStorage.removeItem(SES_KEY);
  } catch { /* noop */ }
}

// Real Supabase table names -> internal demo keys
const TABLE_MAP = { expense_budgets: 'budgets', savings_goals: 'goals', savings_deposits: 'deposits' };

// ---------- query builder ----------
class Query {
  constructor(db, table) {
    this.db = db; this.table = table; this.key = TABLE_MAP[table] || table;
    this.filters = []; this.ordering = null; this.isSingle = false; this.limitN = null;
    this.cols = null; this.verb = null; this.payload = null;
  }
  select(cols) { this.cols = cols || null; return this; }
  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
  in(col, vals) { this.filters.push({ col, op: 'in', val: vals }); return this; }
  order(col, opts = {}) { this.ordering = { col, asc: opts.ascending !== false }; return this; }
  single() { this.isSingle = true; return this; }
  limit(n) { this.limitN = n; return this; }
  insert(rows) { this.verb = 'insert'; this.payload = rows; return this; }
  update(changes) { this.verb = 'update'; this.payload = changes; return this; }
  delete() { this.verb = 'delete'; return this; }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  catch(reject) { return this.run().catch(reject); }

  matches(row) {
    return this.filters.every((f) => {
      if (f.op === 'in') return f.val.includes(row[f.col]);
      return row[f.col] === f.val;
    });
  }
  async run() {
    await new Promise((r) => setTimeout(r, 60)); // small latency, feels real
    const table = this.db[this.key];
    if (!table) return { data: null, error: { message: `relation "${this.table}" does not exist` } };
    try {
      let rows = table.filter((r) => this.matches(r));
      if (this.ordering) {
        const { col, asc } = this.ordering;
        rows = [...rows].sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return asc ? 1 : -1;
          if (bv == null) return asc ? -1 : 1;
          const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
          return asc ? cmp : -cmp;
        });
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      rows = rows.map((r) => ({ ...r }));
      if (this.verb === 'insert') {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = incoming.map((row) => {
          const rec = { id: uuid(), created_at: nowIso(), ...row };
          this.db[this.key].push(rec);
          return { ...rec };
        });
        saveDb(this.db);
        return { data: inserted, error: null };
      }
      if (this.verb === 'update') {
        const target = table.filter((r) => this.matches(r));
        target.forEach((r) => Object.assign(r, this.payload, { updated_at: nowIso() }));
        saveDb(this.db);
        return { data: target.map((r) => ({ ...r })), error: null };
      }
      if (this.verb === 'delete') {
        const kept = table.filter((r) => !this.matches(r));
        this.db[this.key] = kept;
        saveDb(this.db);
        return { data: null, error: null };
      }
      if (this.isSingle) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message || 'Query failed' } };
    }
  }
}

// ---------- client ----------
export function createMockDb() {
  const db = loadDb();
  const listeners = [];
  const channels = [];

  function toUser(u) {
    if (!u) return null;
    return {
      id: u.id, email: u.email,
      user_metadata: { full_name: u.full_name, role: u.role },
      app_metadata: {},
      created_at: nowIso()
    };
  }
  function toSession(u) {
    return { access_token: 'demo-token-' + u.id, refresh_token: 'demo-refresh', expires_at: Date.now() + 86400e3, user: toUser(u) };
  }
  function fire(event, session) {
    listeners.forEach((l) => l(event, session));
  }

  return {
    _isDemo: true,
    auth: {
      getSession: async () => {
        const s = getSession();
        return { data: { session: s }, error: null };
      },
      onAuthStateChange(cb) {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } } } };
      },
      signInWithPassword: async ({ email, password }) => {
        const u = db.users.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase());
        if (!u || u.password !== password) return { data: { user: null }, error: { message: 'Invalid login credentials' } };
        const s = toSession(u);
        setSession(s);
        fire('SIGNED_IN', s);
        return { data: { user: toUser(u) }, error: null };
      },
      signUp: async ({ email, password, options }) => {
        const existing = db.users.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase());
        if (existing) return { data: { user: null }, error: { message: 'User already registered' } };
        const meta = (options && options.data) || {};
        const u = { id: uuid(), email, password, full_name: meta.full_name || email.split('@')[0], role: meta.role || 'viewer' };
        db.users.push(u);
        db.profiles.push({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, created_at: nowIso() });
        saveDb(db);
        const s = toSession(u);
        setSession(s);
        fire('SIGNED_IN', s);
        return { data: { user: toUser(u) }, error: null };
      },
      signOut: async () => {
        setSession(null);
        fire('SIGNED_OUT', null);
        return { error: null };
      },
      updateUser: async (fields) => {
        const s = getSession();
        if (!s) return { data: null, error: { message: 'No session' } };
        const u = db.users.find((x) => x.id === s.user.id);
        if (u && fields.data) Object.assign(u, fields.data);
        saveDb(db);
        return { data: { user: toUser(u) }, error: null };
      }
    },
    rpc: async (name, args = {}) => {
      await new Promise((r) => setTimeout(r, 40));
      if (name === 'notify_staff') {
        const rows = db.profiles
          .filter((p) => !args.p_user_id || p.id === args.p_user_id)
          .map((p) => ({
            id: uuid(), user_id: p.id, type: args.p_type || 'info',
            title: args.p_title || 'Update', message: args.p_message || '',
            read: false, created_at: nowIso()
          }));
        db.notifications.push(...rows);
        saveDb(db);
        return { data: null, error: null };
      }
      if (name === 'set_user_role') {
        const sess = getSession();
        const me = db.profiles.find((p) => p.id === (sess && sess.user && sess.user.id));
        if (!me || me.role !== 'admin') return { data: null, error: { message: 'Only an admin can change roles' } };
        const target = db.profiles.find((p) => p.id === args.p_user_id);
        if (!target) return { data: null, error: { message: 'User not found' } };
        target.role = args.p_role;
        const user = db.users.find((u) => u.id === args.p_user_id);
        if (user) user.role = args.p_role;
        saveDb(db);
        return { data: null, error: null };
      }
      return { data: null, error: { message: `rpc function ${name} not found` } };
    },
    from(table) { return new Query(db, table); },
    channel(name) {
      const ch = {
        _name: name, _handlers: [],
        on(ev, opts, cb) { this._handlers.push({ ev, opts, cb }); return this; },
        subscribe(cb) { this._subscribed = cb; channels.push(this); return this; },
        send(msg) {
          const payload = (msg && msg.type === 'broadcast' && msg.payload) ? msg.payload : msg;
          const event = (msg && msg.event) || 'broadcast';
          this._handlers.forEach((h) => {
            if (h.ev !== 'broadcast') return;
            const wants = (h.opts && h.opts.event) || 'broadcast';
            if (wants !== event) return;
            try { h.cb({ payload }); } catch { /* noop */ }
          });
          return this;
        },
        unsubscribe() { /* noop */ }
      };
      return ch;
    },
    removeChannel() { /* noop */ },
    removeAllChannels() { /* noop */ }
  };
}
