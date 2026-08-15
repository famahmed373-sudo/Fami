// ============ FAMI data layer ============
import { createClient } from '@supabase/supabase-js';
import { createMockDb } from './mock-db.js';
import { fmtMoney, monthKey, monthShift, monthLabel, shortMonth, today, loadPrefs } from './lib.js';

export function initClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  FAMI.prefs = loadPrefs();
  if (url && key && url.startsWith('http')) {
    FAMI.mode = 'supabase';
    FAMI.client = createClient(url, key);
  } else {
    FAMI.mode = 'demo';
    FAMI.client = createMockDb();
  }
  return FAMI.client;
}

const sb = () => FAMI.client;

// ---------- generic loaders ----------
async function loadTable(name, opts = {}) {
  try {
    let q = sb().from(name).select(opts.cols || '*');
    if (opts.filter) q = q.eq(opts.filter.col, opts.filter.val);
    if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.asc !== false });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    const msg = String(e.message || '');
    if (/does not exist|relation|42P01/i.test(msg)) {
      FAMI.schemaError = FAMI.schemaError || {};
      FAMI.schemaError[name] = msg;
      return [];
    }
    throw e;
  }
}

export async function loadAll() {
  const demo = FAMI.mode === 'demo';
  const uid = FAMI.user ? FAMI.user.id : null;
  // Building-wide data (shops, payments, expenses, budgets, savings) is shared by
  // all staff. Only notifications are per-user.
  const personal = demo ? null : { col: 'user_id', val: uid };
  const [shops, payments, expenses, budgets, goals, deposits, notifications, activity, profiles, shopImages] = await Promise.all([
    loadTable('shops', { order: { col: 'name' } }),
    loadTable('payments', { order: { col: 'date', asc: false }, limit: 1000 }),
    loadTable('expenses', { order: { col: 'date', asc: false }, limit: 500 }),
    loadTable('expense_budgets'),
    loadTable('savings_goals'),
    loadTable('savings_deposits', { order: { col: 'date', asc: false } }),
    loadTable('notifications', { filter: personal, order: { col: 'created_at', asc: false }, limit: 60 }),
    loadTable('activity', { order: { col: 'created_at', asc: false }, limit: 300 }),
    loadTable('profiles', { order: { col: 'full_name' } }),
    loadTable('shop_images')
  ]);
  FAMI.shops = shops;
  FAMI.payments = payments;
  FAMI.expenses = expenses;
  FAMI.budgets = budgets;
  FAMI.goals = goals;
  FAMI.deposits = deposits;
  FAMI.notifications = notifications;
  FAMI.activity = activity;
  FAMI.profiles = profiles;
  FAMI.shopImages = shopImages;
}

// ---------- shop photos ----------
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the selected file'));
    r.readAsDataURL(file);
  });
}

export function shopImageUrl(img) {
  if (!img) return '';
  if (FAMI.mode === 'demo') return img.path || '';
  try { return sb().storage.from('shop-images').getPublicUrl(img.path).data.publicUrl; }
  catch { return img.path || ''; }
}

export async function uploadShopImage(shopId, file) {
  if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('Only image files are allowed');
  if (file.size > 2 * 1024 * 1024) throw new Error('Photos must be 2 MB or smaller');
  const shop = FAMI.shops.find((s) => s.id === shopId);
  const label = shop ? shop.name : 'Shop';
  if (FAMI.mode === 'demo') {
    const path = await readFileAsDataURL(file);
    const { data, error } = await sb().from('shop_images').insert({ shop_id: shopId, path }).select();
    if (error) throw error;
    await logActivity('shop.photo_added', 'Shop', `Added a photo to "${label}"`, data && data[0] && data[0].id);
    return data || [];
  }
  const ext = String((file.name.split('.').pop() || 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${shopId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await sb().storage.from('shop-images').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (upErr) throw upErr;
  const { data, error } = await sb().from('shop_images').insert({ shop_id: shopId, path }).select();
  if (error) throw error;
  await logActivity('shop.photo_added', 'Shop', `Added a photo to "${label}"`, data && data[0] && data[0].id);
  await pushNotification('shop', `New photo — ${label}`, 'A shop photo was added');
  return data || [];
}

export async function deleteShopImage(id, path) {
  const img = FAMI.shopImages.find((i) => i.id === id);
  const shop = FAMI.shops.find((s) => s.id === (img && img.shop_id));
  if (FAMI.mode !== 'demo' && path) {
    try { await sb().storage.from('shop-images').remove([path]); } catch { /* file may already be gone */ }
  }
  const { error } = await sb().from('shop_images').delete().eq('id', id);
  if (error) throw error;
  await logActivity('shop.photo_deleted', 'Shop', `Removed a photo from "${shop ? shop.name : ''}"`, id);
}

export async function ensureProfile() {
  const user = FAMI.user;
  if (!user) return;
  const { data } = await sb().from('profiles').select('*').eq('id', user.id).single();
  if (data) { FAMI.user = { ...data }; return; }
  // profile missing (trigger not installed) -> create from auth metadata
  const meta = (user.user_metadata || {});
  const row = {
    id: user.id,
    email: user.email,
    full_name: meta.full_name || user.email.split('@')[0],
    role: meta.role || 'viewer'
  };
  await sb().from('profiles').insert(row);
  FAMI.user = row;
}

export async function loadProfile() {
  const { data } = await sb().from('profiles').select('*').eq('id', FAMI.user.id).single();
  if (data) FAMI.user = { ...FAMI.user, ...data };
}

// ---------- arrears / stats ----------
export function shopMonths(shop) {
  const out = [];
  let m = shop.registered_month;
  const cur = monthKey();
  let guard = 0;
  while (m && m <= cur && guard++ < 240) { out.push(m); m = monthShift(m, 1); }
  return out;
}

export function computeArrears(shop) {
  const empty = { total: 0, list: [], overdue: [], due: false };
  if (shop.status !== 'active') return empty;
  const list = shopMonths(shop).map((m) => {
    const paid = FAMI.payments
      .filter((p) => p.shop_id === shop.id && p.month === m && !p.reversed)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const due = Number(shop.rent_amount || 0);
    return { month: m, due, paid, missing: Math.max(0, due - paid) };
  });
  const cur = monthKey();
  const overdue = list.filter((x) => x.missing > 0 && x.month < cur);
  const due = list.some((x) => x.month === cur && x.missing > 0);
  return {
    total: list.reduce((s, x) => s + x.missing, 0),
    list, overdue, due
  };
}

export function computeStats() {
  const cur = monthKey();
  const active = FAMI.shops.filter((s) => s.status === 'active');
  const paid = FAMI.payments.filter((p) => !p.reversed);
  const expectedMonth = active.reduce((s, x) => s + Number(x.rent_amount || 0), 0);
  const collectedMonth = paid.filter((p) => p.month === cur).reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthExpenses = FAMI.expenses.filter((e) => String(e.date || '').slice(0, 7) === cur).reduce((s, e) => s + Number(e.amount || 0), 0);
  const budgetMonth = FAMI.budgets.filter((b) => b.month === cur).reduce((s, b) => s + Number(b.amount || 0), 0);
  let outstanding = 0, defaulters = 0, dueSoon = 0;
  active.forEach((s) => {
    const a = computeArrears(s);
    outstanding += a.total;
    if (a.overdue.length) defaulters++;
    if (a.due) dueSoon++;
  });
  return {
    shopsTotal: FAMI.shops.length,
    shopsActive: active.length,
    expectedMonth, collectedMonth,
    collectionRate: expectedMonth ? collectedMonth / expectedMonth : 0,
    outstanding, defaulters, dueSoon,
    paymentsThisMonth: paid.filter((p) => p.month === cur).length,
    avgRent: active.length ? active.reduce((s, x) => s + Number(x.rent_amount || 0), 0) / active.length : 0,
    monthExpenses, budgetMonth,
    savingsTotal: FAMI.goals.filter((g) => !g.closed).reduce((s, g) => s + Number(g.saved_amount || 0), 0),
    savingsTarget: FAMI.goals.filter((g) => !g.closed).reduce((s, g) => s + Number(g.target_amount || 0), 0),
    goalsOpen: FAMI.goals.filter((g) => !g.closed).length
  };
}

export function budgetStatus() {
  const cur = monthKey();
  return FAMI.budgets
    .filter((b) => b.month === cur)
    .map((b) => {
      const spent = FAMI.expenses
        .filter((e) => e.category === b.category && String(e.date || '').slice(0, 7) === cur)
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      return { ...b, spent, over: Math.max(0, spent - Number(b.amount || 0)) };
    })
    .sort((a, b) => b.spent - a.spent);
}

// ---------- notifications / alarms ----------
// Fan an action notification out to every staff member (or one target user), so
// managers and the admin all see updates when someone records something.
export async function pushNotification(type, title, message, opts = {}) {
  const target = opts.targetUserId || null;
  const sendArgs = { p_title: title, p_message: message || '', p_type: type, p_user_id: target };
  try {
    const { error } = await sb().rpc('notify_staff', sendArgs);
    if (error) throw error;
  } catch (e) {
    // Function not installed yet -> fall back to a notification for the actor only.
    if (!/function|rpc|42883|does not exist/i.test(String(e.message || ''))) console.warn('notification fan-out failed', e);
    try {
      const { error: e2 } = await sb().from('notifications').insert({ user_id: target || FAMI.user.id, type, title, message: message || '', read: false });
      if (e2 && !/does not exist|relation/i.test(String(e2.message || ''))) console.warn('notification failed', e2);
    } catch { /* noop */ }
  }
  // Same-tab toast for the actor.
  if (!target || target === (FAMI.user && FAMI.user.id)) {
    window.dispatchEvent(new CustomEvent('fami:notify', { detail: { type, title, message } }));
  }
  // Shared realtime broadcast so other open sessions toast instantly.
  try {
    sb().channel('fami-alerts').send({ type: 'broadcast', event: 'new_event', payload: { type, title, message, actor: FAMI.user && FAMI.user.id } });
  } catch { /* channel not subscribed yet */ }
}

async function ensureNotification(alarm) {
  const prefs = FAMI.prefs;
  const type = alarm.type;
  if ((type === 'rent_due' && prefs.notifyRent === false) ||
      (type === 'budget' && prefs.notifyBudget === false) ||
      (type === 'savings' && prefs.notifySavings === false)) return;
  const exists = FAMI.notifications.some((n) => n.type === type && n.title === alarm.title);
  if (exists) return;
  const { data, error } = await sb().from('notifications').insert({
    user_id: FAMI.user.id, type, title: alarm.title, message: alarm.message, read: false
  });
  if (!error && data) FAMI.notifications.unshift(...data);
}

export async function runAlarmScan() {
  const cur = monthKey();
  const alarms = [];
  for (const shop of FAMI.shops) {
    if (shop.status !== 'active') continue;
    const a = computeArrears(shop);
    if (a.overdue.length) {
      alarms.push({
        severity: 'red', type: 'rent_due', shop,
        title: `Rent overdue — ${shop.name}`,
        message: `${fmtMoney(a.total)} outstanding for ${a.overdue.length} month(s): ${a.overdue.map((x) => shortMonth(x.month)).join(', ')}`,
        amount: a.total
      });
    } else if (a.due && new Date().getDate() >= (FAMI.prefs.remindDays || 3)) {
      alarms.push({
        severity: 'amber', type: 'rent_due', shop,
        title: `Rent due — ${shop.name}`,
        message: `${fmtMoney(shop.rent_amount)} expected for ${monthLabel(cur)}`,
        amount: Number(shop.rent_amount)
      });
    }
  }
  for (const b of budgetStatus()) {
    if (b.over > 0) {
      alarms.push({
        severity: 'amber', type: 'budget', category: b.category,
        title: `Over budget — ${b.category}`,
        message: `${fmtMoney(b.spent)} spent of ${fmtMoney(b.amount)} budget (${fmtMoney(b.over)} over)`,
        amount: b.over
      });
    }
  }
  for (const g of FAMI.goals) {
    if (!g.closed && Number(g.saved_amount || 0) >= Number(g.target_amount || 0)) {
      alarms.push({
        severity: 'green', type: 'savings', goal: g,
        title: `Goal reached — ${g.name}`,
        message: `Savings target of ${fmtMoney(g.target_amount)} has been met. 🎉`,
        amount: Number(g.target_amount)
      });
    }
  }
  for (const a of alarms) await ensureNotification(a);
  return alarms;
}

export async function markNotifsRead(ids = null) {
  try {
    let q = sb().from('notifications').update({ read: true });
    if (ids && ids.length) q = q.in('id', ids);
    else q = q.eq('read', false);
    const { error } = await q;
    if (error) throw error;
    FAMI.notifications.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true; });
  } catch (e) { if (!/does not exist|relation/i.test(String(e.message || ''))) throw e; }
}

// ---------- activity ----------
export async function logActivity(action, entity, details, entityId = '') {
  try {
    const { error } = await sb().from('activity').insert({
      user_id: FAMI.user.id, action, entity, entity_id: String(entityId || ''),
      details: details || '', created_at: new Date().toISOString()
    });
    if (error) throw error;
  } catch (e) { if (!/does not exist|relation/i.test(String(e.message || ''))) console.warn('activity failed', e); }
}

// ---------- shops ----------
export async function saveShop(data) {
  const isNew = !data.id;
  const row = {
    name: data.name.trim(),
    unit: (data.unit || '').trim(),
    tenant_name: (data.tenant_name || '').trim(),
    tenant_phone: (data.tenant_phone || '').trim(),
    rent_amount: Number(data.rent_amount) || 0,
    status: data.status,
    registered_month: data.registered_month,
    notes: (data.notes || '').trim()
  };
  let res;
  if (isNew) {
    res = await sb().from('shops').insert(row).select();
    const created = res.data ? res.data[0] : null;
    await logActivity('shop.added', 'Shop', `Registered "${row.name}" (${row.unit || 'no unit'}) with ${fmtMoney(row.rent_amount)} rent`, created && created.id);
    await pushNotification('shop', `New shop registered — ${row.name}`, `${fmtMoney(row.rent_amount)} monthly rent${row.unit ? ` · unit ${row.unit}` : ''}`);
  } else {
    res = await sb().from('shops').update(row).eq('id', data.id).select();
    await logActivity('shop.updated', 'Shop', `Updated "${row.name}"`, data.id);
  }
  if (res.error) throw res.error;
  return res.data ? res.data[0] : row;
}

export async function deleteShop(id) {
  const shop = FAMI.shops.find((s) => s.id === id);
  const { error } = await sb().from('shops').delete().eq('id', id);
  if (error) throw error;
  await logActivity('shop.deleted', 'Shop', `Deleted "${shop ? shop.name : id}"`, id);
}

// ---------- payments ----------
export async function addPayment({ shop_id, month, amount, date, method, reference, note }) {
  const shop = FAMI.shops.find((s) => s.id === shop_id);
  const { data, error } = await sb().from('payments').insert({
    shop_id, user_id: FAMI.user.id, month, amount: Number(amount), date: date || today(),
    method, reference: (reference || '').trim(), note: (note || '').trim(),
    reversed: false
  }).select();
  if (error) throw error;
  await logActivity('payment.recorded', 'Payment', `Recorded ${fmtMoney(amount)} rent for ${monthLabel(month)} — ${shop ? shop.name : ''}`, data && data[0] && data[0].id);
  await pushNotification('payment', `Payment recorded — ${shop ? shop.name : 'Shop'}`, `${fmtMoney(amount)} received for ${monthLabel(month)}`);
  return data;
}

export async function reversePayment(id) {
  const p = FAMI.payments.find((x) => x.id === id);
  const shop = FAMI.shops.find((s) => s.id === (p && p.shop_id));
  const { error } = await sb().from('payments').update({ reversed: true, reversed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logActivity('payment.reversed', 'Payment', `Reversed ${fmtMoney(p && p.amount)} for ${p ? monthLabel(p.month) : ''} — ${shop ? shop.name : ''}`, id);
  await pushNotification('info', 'Payment reversed', `${fmtMoney(p && p.amount)} for ${p ? monthLabel(p.month) : ''} was reversed`);
}

// ---------- expenses & budgets ----------
export async function saveExpense(data) {
  const isNew = !data.id;
  const row = {
    user_id: FAMI.user.id,
    category: data.category,
    amount: Number(data.amount) || 0,
    date: data.date || today(),
    shop_id: data.shop_id || null,
    description: (data.description || '').trim()
  };
  let res;
  if (isNew) {
    res = await sb().from('expenses').insert(row).select();
    const created = res.data ? res.data[0] : null;
    await logActivity('expense.added', 'Expense', `Added ${row.category} expense of ${fmtMoney(row.amount)}${row.description ? ` — ${row.description}` : ''}`, created && created.id);
    await pushNotification('expense', 'Expense recorded', `${fmtMoney(row.amount)} · ${row.category}${row.description ? ` — ${row.description}` : ''}`);
  } else {
    const upd = { category: row.category, amount: row.amount, date: row.date, shop_id: row.shop_id, description: row.description };
    res = await sb().from('expenses').update(upd).eq('id', data.id).select();
    await logActivity('expense.updated', 'Expense', `Updated ${row.category} expense to ${fmtMoney(row.amount)}`, data.id);
  }
  if (res.error) throw res.error;
  return res.data ? res.data[0] : row;
}

export async function deleteExpense(id) {
  const { error } = await sb().from('expenses').delete().eq('id', id);
  if (error) throw error;
  await logActivity('expense.deleted', 'Expense', 'Deleted an expense record', id);
}

export async function setBudget(category, month, amount) {
  const existing = FAMI.budgets.find((b) => b.category === category && b.month === month);
  const val = { user_id: FAMI.user.id, category, month, amount: Number(amount) || 0 };
  if (existing) {
    const { error } = await sb().from('expense_budgets').update({ amount: val.amount }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb().from('expense_budgets').insert(val);
    if (error) throw error;
  }
  await logActivity('budget.set', 'Budget', `Set ${category} budget for ${monthLabel(month)} to ${fmtMoney(amount)}`);
}

// ---------- savings ----------
export async function addGoal({ name, target_amount, target_date }) {
  const { data, error } = await sb().from('savings_goals').insert({
    user_id: FAMI.user.id, name: name.trim(), target_amount: Number(target_amount) || 0,
    saved_amount: 0, target_date: target_date || null, closed: false
  }).select();
  if (error) throw error;
  const created = data && data[0];
  await logActivity('savings.goal', 'Savings', `Created goal "${name.trim()}" (${fmtMoney(target_amount)})`, created && created.id);
  await pushNotification('savings', `New savings goal — ${name.trim()}`, `Target: ${fmtMoney(target_amount)}`);
  return data;
}

export async function addDeposit(goalId, amount, date, note) {
  const goal = FAMI.goals.find((g) => g.id === goalId);
  const { data, error } = await sb().from('savings_deposits').insert({
    goal_id: goalId, user_id: FAMI.user.id, amount: Number(amount), date: date || today(), note: (note || '').trim()
  }).select();
  if (error) throw error;
  const newSaved = Number(goal.saved_amount || 0) + Number(amount);
  const { error: e2 } = await sb().from('savings_goals').update({ saved_amount: newSaved }).eq('id', goalId);
  if (e2) throw e2;
  const deposited = data && data[0];
  await logActivity('savings.deposit', 'Savings', `Deposited ${fmtMoney(amount)} to "${goal ? goal.name : 'goal'}"`, deposited && deposited.id);
  await pushNotification('savings', `Deposit — ${goal ? goal.name : 'Savings'}`, `${fmtMoney(amount)} added${goal ? ` (${fmtMoney(newSaved)} of ${fmtMoney(goal.target_amount)})` : ''}`);
  if (goal && newSaved >= Number(goal.target_amount || 0) && !goal.closed) {
    await pushNotification('savings', `Goal reached — ${goal.name}`, `Savings target of ${fmtMoney(goal.target_amount)} has been met. 🎉`);
  }
  return data;
}

export async function closeGoal(id) {
  const goal = FAMI.goals.find((g) => g.id === id);
  const { error } = await sb().from('savings_goals').update({ closed: true }).eq('id', id);
  if (error) throw error;
  await logActivity('savings.completed', 'Savings', `Completed goal "${goal ? goal.name : ''}"`, id);
  await pushNotification('savings', `Goal completed — ${goal ? goal.name : 'Savings'}`, `${goal ? goal.name : ''} has reached its target. 🎉`);
}

export async function deleteGoal(id) {
  const goal = FAMI.goals.find((g) => g.id === id);
  await sb().from('savings_deposits').delete().eq('goal_id', id);
  const { error } = await sb().from('savings_goals').delete().eq('id', id);
  if (error) throw error;
  await logActivity('savings.deleted', 'Savings', `Deleted goal "${goal ? goal.name : ''}"`, id);
}

// ---------- auth: password reset ----------
export async function sendPasswordReset(email) {
  if (!email || !String(email).includes('@')) throw new Error('Enter a valid email address');
  // redirectTo = wherever the app is actually running (preview or production),
  // so the emailed link never points at a hard-coded localhost.
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await sb().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---------- users ----------
export async function updateUserRole(userId, role) {
  // Goes through the security-definer RPC so an admin can update any profile
  // despite RLS, and non-admins are rejected server-side.
  const { error } = await sb().rpc('set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
  const target = FAMI.profiles.find((p) => p.id === userId);
  await logActivity('user.role', 'User', `Changed role of ${target ? target.full_name : userId} to ${role}`, userId);
  await pushNotification('info', 'Your FAMI role changed', `Your access was updated to ${role}`, { targetUserId: userId });
}

export async function updateProfile(fields) {
  const { error } = await sb().from('profiles').update(fields).eq('id', FAMI.user.id);
  if (error) throw error;
  Object.assign(FAMI.user, fields);
  await logActivity('profile.updated', 'Profile', 'Updated profile details');
}
