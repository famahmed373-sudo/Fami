// ============ FAMI — app bootstrap, layout, router ============
import * as api from './supabase.js';
import { el, esc, iconSvg, toast, timeAgo, loadPrefs, savePrefs, can, roleBadge } from './lib.js';
import { renderDashboard, renderShops, renderPayments } from './pages/core.js';
import { renderExpenses, renderSavings, renderReports } from './pages/finance.js';
import { renderReminders, renderActivity, renderUsers, renderSettings } from './pages/admin.js';

// ---- brand mark ----
const LOGO_SVG = `<svg width="22" height="22" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 13h18M15 13v22M15 24h14"/></svg>`;

// ---- global state ----
window.FAMI = {
  mode: 'demo', client: null, user: null,
  shops: [], payments: [], expenses: [], budgets: [], goals: [], deposits: [],
  notifications: [], activity: [], profiles: [],
  prefs: loadPrefs(), schemaError: null, alarms: [], current: 'dashboard',
  _refresh: null
};

const ROUTES = [
  { id: 'dashboard', title: 'Dashboard', sub: 'Rent collection, finances and alerts at a glance.', icon: 'dashboard', group: 'Overview', render: renderDashboard },
  { id: 'shops', title: 'Shops & Tenants', sub: 'Register tenants and manage shop units.', icon: 'shop', group: 'Rentals', render: renderShops },
  { id: 'payments', title: 'Payments', sub: 'Record payments with from/up-to periods and review history.', icon: 'card', group: 'Rentals', render: renderPayments },
  { id: 'expenses', title: 'Expenses', sub: 'Track building costs against monthly budgets.', icon: 'receipt', group: 'Finance', render: renderExpenses },
  { id: 'savings', title: 'Savings', sub: 'Set goals and grow your reserves.', icon: 'piggy', group: 'Finance', render: renderSavings },
  { id: 'reports', title: 'Reports', sub: 'Monthly performance and exportable summaries.', icon: 'chart', group: 'Finance', render: renderReports },
  { id: 'reminders', title: 'Reminders & Alarms', sub: 'Automated alerts for rents, budgets and savings.', icon: 'bell', group: 'System', render: renderReminders },
  { id: 'activity', title: 'Activity', sub: 'Full audit trail of important actions.', icon: 'clock', group: 'System', render: renderActivity },
  { id: 'users', title: 'Users & Roles', sub: 'Manage staff access (admin only).', icon: 'users', group: 'System', render: renderUsers, perm: 'users' },
  { id: 'settings', title: 'Settings', sub: 'Profile, preferences and connection.', icon: 'gear', group: 'System', render: renderSettings }
];
const GROUPS = ['Overview', 'Rentals', 'Finance', 'System'];

// ---------- boot ----------
function boot() {
  api.initClient();
  const client = FAMI.client;
  client.auth.getSession().then(({ data }) => {
    FAMI.session = data.session;
    client.auth.onAuthStateChange((event, session) => {
      FAMI.session = session;
      // While a PIN-gated sign-in is in progress, hold off on startApp() until
      // the PIN is verified (wrong PIN signs the session back out again).
      if (session && !FAMI._pendingPin) { if (isRecoveryUrl()) showResetPassword(); else startApp(); }
      else if (!session) showLogin();
    });
    if (FAMI.session) { if (isRecoveryUrl()) showResetPassword(); else startApp(); }
    else showLogin();
  }).catch(() => showLogin());
}

// A password-reset email link lands on the app with type=recovery in the hash.
const isRecoveryUrl = () => location.hash.includes('type=recovery');

function showResetPassword() {
  hideApp();
  const root = document.getElementById('root');
  root.replaceChildren(resetPasswordView());
}

function resetPasswordView() {
  const pass = el('input', { type: 'password', placeholder: 'New password (min 6 characters)', autocomplete: 'new-password' });
  const pass2 = el('input', { type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
  const msg = el('div', { class: 'muted', style: { minHeight: 20, marginTop: 12, fontSize: 13 } });
  const submit = async () => {
    const p = pass.value;
    if (p.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; msg.style.color = 'var(--danger)'; return; }
    if (p !== pass2.value) { msg.textContent = 'Passwords do not match.'; msg.style.color = 'var(--danger)'; return; }
    try {
      await api.updatePassword(p);
      msg.style.color = 'var(--success)';
      msg.textContent = 'Password updated — redirecting to your workspace...';
      history.replaceState(null, '', '#dashboard');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      msg.style.color = 'var(--danger)';
      msg.textContent = e.message || 'Could not update password.';
    }
  };
  return el('div', { class: 'auth' },
    el('div', { class: 'authMain', style: { gridColumn: '1 / -1' } },
      el('div', { class: 'authCard' },
        el('div', { class: 'logo', style: { width: 46, height: 46 } }, el('span', { html: LOGO_SVG.replace('width="22" height="22"', 'width="26" height="26"') })),
        el('h2', {}, 'Set a new password'),
        el('p', {}, 'Choose a new password for your Fahmi account.'),
        el('div', { class: 'formGrid' },
          el('div', { class: 'field full' }, el('label', {}, 'New password'), pass),
          el('div', { class: 'field full' }, el('label', {}, 'Confirm password'), pass2)
        ),
        el('button', { class: 'btn primary', style: { width: '100%', marginTop: 14, padding: 12 }, onclick: submit }, 'Update password'),
        msg
      )
    )
  );
}

// ---------- auth UI ----------
function showLogin() {
  hideApp();
  const root = document.getElementById('root');
  root.replaceChildren(loginView());
}
function loginView() {
  const demo = FAMI.mode === 'demo';
  let mode = 'login';
  const nameInput = el('input', { placeholder: 'Your full name', autocomplete: 'name' });
  const emailInput = el('input', { type: 'email', placeholder: 'name@example.com', autocomplete: 'email' });
  const passInput = el('input', { type: 'password', placeholder: 'Minimum 6 characters', autocomplete: 'current-password' });
  const nameField = el('div', { class: 'field hidden' }, el('label', { html: 'Full name <span class="req">*</span>' }), nameInput);
  const msg = el('div', { class: 'muted', style: { minHeight: 20, marginTop: 12, fontSize: 13 } });
  const submitBtn = el('button', { class: 'btn primary', style: { width: '100%', marginTop: 14, padding: '12px' }, onclick: doAuth }, 'Sign in');

  const tab = (label, m) => el('button', { class: m === mode ? 'active' : '', onclick: () => {
    mode = m;
    tabs.children[0].classList.toggle('active', m === 'login');
    tabs.children[1].classList.toggle('active', m === 'signup');
    nameField.classList.toggle('hidden', m !== 'signup');
    submitBtn.textContent = m === 'signup' ? 'Create account' : 'Sign in';
    passInput.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    syncPinField();
    msg.textContent = '';
  } }, label);
  const tabs = el('div', { class: 'authTabs' }, tab('Sign in', 'login'), tab('Create account', 'signup'));

  // ---- sign-in mode selector: Admin / Manager / User ----
  const ROLE_META = {
    admin: { label: 'Admin', icon: 'gear', desc: 'Full control, staff & roles', demoEmail: 'admin@fami.demo', pin: '82000' },
    manager: { label: 'Manager', icon: 'shop', desc: 'Shops, payments & finances', demoEmail: 'marta@fami.demo', pin: '83000' },
    user: { label: 'User', icon: 'users', desc: 'Read-only access', demoEmail: 'eyob@fami.demo', pin: '' }
  };
  const DEMO_PASS = 'fami1234';
  let roleMode = 'admin';
  const roleHint = el('div', { class: 'roleHint' });
  const roleRow = el('div', { class: 'roleModes' });
  const renderRoleModes = () => {
    roleRow.replaceChildren(...Object.keys(ROLE_META).map((key) => {
      const m = ROLE_META[key];
      return el('button', { class: 'roleMode' + (key === roleMode ? ' active' : ''), type: 'button', onclick: () => pickRole(key) },
        el('span', { class: 'ic', html: iconSvg(m.icon, 15) }),
        el('span', {}, el('b', {}, m.label), el('small', {}, m.desc))
      );
    }));
  };
  const pinInput = el('input', { type: 'password', inputmode: 'numeric', maxLength: 5, autocomplete: 'off', placeholder: '5-digit PIN' });
  const pinField = el('div', { class: 'field hidden' },
    el('label', { html: 'Security PIN <span class="req">*</span>' }),
    pinInput,
    el('div', { class: 'hint' }, roleMode === 'manager' ? 'Manager PIN — default 83000. Change it in Settings.' : 'Admin PIN — default 82000. Change it in Settings.')
  );
  const pinVisible = () => mode === 'login' && roleMode !== 'user';
  const syncPinField = () => {
    pinField.classList.toggle('hidden', !pinVisible());
    if (pinVisible() && !pinInput.value) pinInput.value = demo ? ROLE_META[roleMode].pin : '';
    pinField.querySelector('.hint').textContent = roleMode === 'manager' ? 'Manager PIN — default 83000. Change it in Settings.' : 'Admin PIN — default 82000. Change it in Settings.';
  };
  const pickRole = (key) => {
    roleMode = key;
    renderRoleModes();
    const m = ROLE_META[key];
    if (demo) {
      emailInput.value = m.demoEmail;
      passInput.value = DEMO_PASS;
      roleHint.textContent = `${m.label} mode — demo credentials filled. Click “Sign in”${m.pin ? ` (PIN ${m.pin})` : ''} to enter as ${m.label}.`;
    } else {
      emailInput.placeholder = `${m.label.toLowerCase()}@yourbuilding.com`;
      roleHint.textContent = m.pin ? `${m.label} mode requires your security PIN (default ${m.pin}) in addition to email and password.` : `You will sign in with your ${m.label} account — only email and password are required.`;
    }
    syncPinField();
  };
  renderRoleModes();

  const recoverEmail = el('input', { type: 'email', placeholder: 'name@example.com', autocomplete: 'email' });
  const recoverMsg = el('div', { class: 'muted', style: { minHeight: 20, marginTop: 12, fontSize: 13 } });
  const recoverBox = el('div', { class: 'recoverBox hidden' },
    el('p', { class: 'muted', style: { margin: '0 0 14px' } }, 'Enter your account email and we will send you a link to reset your password.'),
    el('div', { class: 'field' }, el('label', { html: 'Email <span class="req">*</span>' }), recoverEmail),
    el('div', { class: 'formActions', style: { marginTop: 14 } },
      el('button', { class: 'btn', onclick: () => { recoverBox.classList.add('hidden'); authForm.classList.remove('hidden'); recoverMsg.textContent = ''; } }, 'Back'),
      el('button', { class: 'btn primary', onclick: doRecover }, 'Send reset link')
    ),
    recoverMsg
  );
  const authForm = el('div', {},
    tabs,
    roleRow,
    roleHint,
    el('div', { class: 'formGrid' }, nameField,
      el('div', { class: 'field' }, el('label', { html: 'Email <span class="req">*</span>' }), emailInput),
      el('div', { class: 'field' }, el('label', { html: 'Password <span class="req">*</span>' }), passInput),
      pinField
    ),
    submitBtn,
    el('div', { style: { marginTop: 8, textAlign: 'center' } },
      el('button', { class: 'linkBtn', onclick: () => { authForm.classList.add('hidden'); recoverBox.classList.remove('hidden'); } }, 'Forgot password?')
    )
  );

  async function doRecover() {
    const email = recoverEmail.value.trim();
    if (!email || !email.includes('@')) { recoverMsg.textContent = 'Enter a valid email address.'; recoverMsg.style.color = 'var(--danger)'; return; }
    try {
      await api.sendPasswordReset(email);
      recoverMsg.style.color = 'var(--success)';
      recoverMsg.textContent = FAMI.mode === 'demo' ? 'Demo mode — password reset works once connected to Supabase.' : 'Reset link sent — check your email inbox.';
    } catch (e) {
      recoverMsg.style.color = 'var(--danger)';
      recoverMsg.textContent = e.message || 'Could not send the reset link.';
    }
  }

  // Build the in-app user from a live session, then enter the workspace.
  // (Uses the session returned by the auth call itself, never a cached one, so
  // there is no race between the request resolving and the state-change event.)
  async function applySession(session) {
    if (!session) return false;
    FAMI.session = session;
    const u = session.user;
    FAMI.user = {
      id: u.id, email: u.email,
      full_name: (u.user_metadata && u.user_metadata.full_name) || u.email.split('@')[0],
      role: (u.user_metadata && u.user_metadata.role) || 'viewer'
    };
    try { await api.ensureProfile(); } catch { /* profile table may be missing */ }
    try { await api.loadProfile(); } catch { /* noop */ }
    if (!FAMI._pendingPin) startApp();
    return true;
  }

  async function doAuth() {
    const email = emailInput.value.trim(), password = passInput.value;
    if (!email || password.length < 6) { msg.textContent = 'Enter a valid email and a password of at least 6 characters.'; msg.style.color = 'var(--danger)'; return; }
    if (mode === 'signup' && !nameInput.value.trim()) { msg.textContent = 'Please enter your full name.'; msg.style.color = 'var(--danger)'; return; }
    submitBtn.disabled = true;
    msg.style.color = 'var(--muted)';
    msg.textContent = mode === 'signup' ? 'Creating your account...' : 'Signing in...';
    try {
      if (mode === 'signup') {
        // emailRedirectTo points the confirmation email at wherever this app is
        // actually running (preview or production), never a hard-coded localhost.
        const { data, error } = await FAMI.client.auth.signUp({ email, password, options: { data: { full_name: nameInput.value.trim(), role: 'viewer' }, emailRedirectTo: location.origin } });
        if (error) throw error;
        const session = data.session || FAMI.session;
        // Email confirmation enabled -> the account needs confirming first.
        if (FAMI.mode === 'supabase' && !session) {
          msg.style.color = 'var(--success)';
          msg.textContent = 'Account created! Check your email to confirm your address, then sign in.';
          mode = 'login'; tabs.children[0].click();
          return;
        }
        // Confirmation disabled (or demo) -> the session is live, enter directly.
        await applySession(session);
      } else {
        // PIN-gated modes (admin / manager): hold startApp() until the PIN is
        // verified against the account's PIN (default 82000 admin / 83000 manager,
        // or the PIN they set in Settings).
        if (roleMode !== 'user') {
          const pin = pinInput.value.trim();
          if (!/^\d{5}$/.test(pin)) {
            msg.style.color = 'var(--danger)';
            msg.textContent = `${ROLE_META[roleMode].label} mode requires a 5-digit security PIN.`;
            submitBtn.disabled = false;
            return;
          }
          FAMI._pendingPin = true;
        }
        const { data, error } = await FAMI.client.auth.signInWithPassword({ email, password });
        if (error) { FAMI._pendingPin = false; throw error; }
        await applySession(data.session || FAMI.session);
        if (FAMI._pendingPin) {
          // First account on a fresh install becomes the admin automatically, so
          // the PIN gate below can accept the admin PIN (82000) instead of locking
          // everyone out because no admin exists to promote anyone yet.
          try { await api.bootstrapFirstAdmin(); } catch { /* rpc may not be installed yet */ }
          // Refresh the profile from the database so the gate checks the real
          // role + PIN, not the signup-time metadata (which is always 'viewer').
          try { await api.loadProfile(); } catch { /* profile table may be missing */ }
          const role = (FAMI.user && FAMI.user.role) || 'viewer';
          if (role !== 'admin' && role !== 'manager') {
            try { await FAMI.client.auth.signOut(); } catch { /* noop */ }
            FAMI.user = null;
            showLogin();
            msg.style.color = 'var(--danger)';
            msg.textContent = `Your account is registered as “${role}”. Only an admin or manager account can enter ${ROLE_META[roleMode].label} mode — ask the admin to grant you access.`;
            return;
          }
          const expected = api.expectedPin();
          FAMI._pendingPin = false;
          if (String(pinInput.value.trim()) !== expected) {
            try { await FAMI.client.auth.signOut(); } catch { /* noop */ }
            FAMI.user = null;
            showLogin();
            msg.style.color = 'var(--danger)';
            msg.textContent = `Incorrect PIN — ${ROLE_META[roleMode].label} mode requires your security PIN (default ${ROLE_META[roleMode].pin}).`;
            return;
          }
          startApp();
        }
      }
    } catch (e) {
      msg.style.color = 'var(--danger)';
      const m = e.message || 'Authentication failed.';
      msg.textContent = /not confirmed|confirm your email/i.test(m)
        ? 'Please confirm your email first — check your inbox (and spam folder), then sign in.'
        : m;
    } finally { submitBtn.disabled = false; }
  }

  return el('div', { class: 'auth' },
    el('div', { class: 'authAside' },
      el('div', { class: 'authBrand' }, el('div', { class: 'logo' }, el('span', { html: LOGO_SVG })), el('b', {}, 'Fahmi')),
      el('div', {},
        el('h1', {}, 'Run your building’s finances with confidence.'),
        el('p', { class: 'lead' }, 'Shop rent collection, expenses, savings goals and smart alarms — all in one professional workspace.'),
        el('div', { class: 'authFeat' },
          feat('card', 'Rent collection', 'Track full and partial payments with arrears calculated automatically.'),
          feat('receipt', 'Expenses & budgets', 'Categorise building costs and get alerted before you overspend.'),
          feat('piggy', 'Savings goals', 'Set aside rent surplus for renovations, taxes and emergencies.'),
          feat('bell', 'Notifications & alarms', 'Never miss an overdue rent or a budget overrun again.')
        )
      ),
      el('div', { class: 'authFoot' }, 'Fahmi · secure sign in with your staff account')
    ),
    el('div', { class: 'authMain' },
      el('div', { class: 'authCard' },
        el('div', { class: 'logo', style: { width: 46, height: 46 } }, el('span', { html: LOGO_SVG.replace('width="22" height="22"', 'width="26" height="26"') })),
        el('h2', {}, 'Welcome to Fahmi'),
        el('p', {}, 'Sign in to manage your building.'),
        authForm,
        msg,
        recoverBox,
        demo ? el('div', { class: 'demoHint' },
          el('b', {}, 'Demo mode — no Supabase keys set yet.'),
          el('span', {}, 'Pick a mode above, or sign in with ', el('code', {}, 'admin@fami.demo'), ' / ', el('code', {}, 'fami1234'), ' to explore the full app.'),
          el('span', { class: 'muted' }, 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Keys tab to go live.')
        ) : null
      )
    )
  );
}
const feat = (icon, title, desc) => el('div', {}, el('div', { class: 'fi', html: iconSvg(icon, 17) }), el('div', {}, el('b', {}, title), el('p', {}, desc)));

// ---------- app shell ----------
let elSidebar, elOverlay, elBell, elBellDrop, elBadge, elUserMini, elPage, elTitle, elSub;

function hideApp() {
  const shell = document.querySelector('.shell');
  if (shell) shell.classList.add('hidden');
}
function showApp() { document.querySelector('.shell').classList.remove('hidden'); }

function appShell() {
  const brand = el('div', { class: 'brand' }, el('div', { class: 'logo' }, el('span', { html: LOGO_SVG })), el('div', {}, el('b', {}, 'Fahmi'), el('small', {}, 'Property & Finance Manager')));
  const groups = GROUPS.map((g) => {
    const items = ROUTES.filter((r) => r.group === g).map((r) => el('a', { href: `#${r.id}`, 'data-route': r.id }, el('span', { html: iconSvg(r.icon, 17) }), r.title));
    return el('div', { class: 'navGroup' }, el('label', {}, g), el('div', { class: 'nav' }, items));
  });
  elUserMini = el('div', { class: 'userMini' });
  elSidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    brand, el('div', { style: { flex: 1 } }, groups),
    el('div', { class: 'sideBottom' }, elUserMini, el('button', { class: 'btn sideLogout', onclick: logout }, el('span', { class: 'ic', html: iconSvg('x', 14) }), 'Sign out'))
  );
  elOverlay = el('div', { class: 'overlay', onclick: closeSidebar });
  elBadge = el('span', { class: 'badge hidden' });
  elBell = el('button', { class: 'iconBtn', 'aria-label': 'Notifications', onclick: toggleBell }, el('span', { html: iconSvg('bell', 18) }), elBadge);
  elBellDrop = el('div', { class: 'bellDrop hidden' });
  elTitle = el('h1', {});
  elSub = el('div', { class: 'sub' });
  elPage = el('div', { class: 'page', id: 'page' });
  const mobileMenu = el('button', { class: 'btn iconBtn mobileMenu', onclick: openSidebar, 'aria-label': 'Menu' }, el('span', { html: iconSvg('menu', 18) }));
  const topbar = el('header', { class: 'topbar' },
    mobileMenu,
    el('div', {}, elTitle, elSub),
    el('div', { class: 'spacer' }),
    el('div', { class: 'bellWrap' }, elBell, elBellDrop)
  );
  return el('div', { class: 'shell' }, elSidebar, elOverlay, el('main', { class: 'main' }, topbar, elPage));
}

function openSidebar() { elSidebar.classList.add('open'); elOverlay.classList.add('show'); }
function closeSidebar() { elSidebar.classList.remove('open'); elOverlay.classList.remove('show'); }

function renderUserMini() {
  const u = FAMI.user;
  if (!u) return;
  elUserMini.replaceChildren(
    el('div', { class: 'avatar' }, (u.full_name || u.email || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()),
    el('div', { style: { minWidth: 0 } }, el('b', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, esc(u.full_name || u.email)), el('div', { style: { marginTop: 3 } }, roleBadge(u.role)))
  );
}

async function logout() {
  try { await FAMI.client.auth.signOut(); } catch { /* noop */ }
  FAMI.user = null;
  showLogin();
}

// ---------- start ----------
async function startApp() {
  const s = FAMI.session;
  FAMI.user = {
    id: s.user.id, email: s.user.email,
    full_name: (s.user.user_metadata && s.user.user_metadata.full_name) || s.user.email.split('@')[0],
    role: (s.user.user_metadata && s.user.user_metadata.role) || 'viewer'
  };
  try { await api.ensureProfile(); } catch { /* profile table may be missing in real mode */ }
  try { await api.loadProfile(); } catch { /* noop */ }
  if (!document.querySelector('.shell')) document.getElementById('root').replaceChildren(appShell());
  showApp();
  renderUserMini();
  if (!location.hash || location.hash === '#') location.hash = '#dashboard';
  await FAMI._refresh({ silent: true });
  setupRealtime();
  route();
}

// ---------- refresh / render ----------
FAMI._refresh = async ({ silent = false } = {}) => {
  try {
    await api.loadAll();
  } catch (e) {
    toast(e.message || 'Could not load data', 'error');
  }
  FAMI.alarms = await api.runAlarmScan();
  renderUserMini();
  updateBell();
  if (!silent) route();
};

function parseHash() {
  const h = (location.hash || '#dashboard').slice(1);
  const [path, qs] = h.split('?');
  return { path: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function navigate(routeId, params = {}, opts = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const hash = `#${routeId}${qs ? '?' + qs : ''}`;
  if (opts.replace) { history.replaceState(null, '', hash); route(); }
  else window.location.hash = hash;
}

function route() {
  if (!elPage) return; // shell not built yet (e.g. hash changed while signed out)
  const { path, params } = parseHash();
  const def = ROUTES.find((r) => r.id === path) || ROUTES[0];
  if (def.perm && !can(def.perm)) { navigate('dashboard', {}, { replace: true }); return; }
  FAMI.current = def.id;
  elTitle.textContent = def.title;
  elSub.textContent = def.sub;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === def.id));
  closeSidebar();
  const ctx = { go: navigate, refresh: (silent) => FAMI._refresh({ silent }), params, alarms: FAMI.alarms };
  elPage.replaceChildren(def.render(ctx));
  window.scrollTo(0, 0);
}

// ---------- notification bell ----------
function updateBell() {
  const unread = FAMI.notifications.filter((n) => !n.read).length;
  elBadge.textContent = unread > 99 ? '99+' : String(unread);
  elBadge.classList.toggle('hidden', unread === 0);
}
function toggleBell() {
  if (!elBellDrop.classList.contains('hidden')) { elBellDrop.classList.add('hidden'); return; }
  const items = FAMI.notifications.slice(0, 10).map((n) => {
    const meta = notifMeta(n);
    return el('div', { class: 'bellItem' + (n.read ? '' : ' unread'), onclick: async () => {
      await api.markNotifsRead([n.id]);
      updateBell();
      elBellDrop.classList.add('hidden');
      if (n.type === 'rent_due') navigate('reminders');
      else if (n.type === 'budget') navigate('expenses');
      else if (n.type === 'savings') navigate('savings');
      else navigate('activity');
    } },
      el('div', { class: 'ic', style: { background: meta.bg, color: meta.fg }, html: iconSvg(meta.icon, 15) }),
      el('div', {}, el('b', {}, esc(n.title)), el('p', {}, esc(n.message)), el('small', {}, timeAgo(n.created_at)))
    );
  });
  elBellDrop.replaceChildren(
    el('div', { class: 'bellHead' }, el('b', {}, 'Notifications'), el('button', { onclick: async () => { await api.markNotifsRead(); updateBell(); } }, 'Mark all read')),
    el('div', { class: 'bellList' }, items.length ? items : el('div', { class: 'empty', style: { padding: 26 } }, el('b', {}, 'All caught up'), el('p', {}, 'No notifications yet.')))
  );
  elBellDrop.classList.remove('hidden');
}
const notifMeta = (n) => ({
  rent_due: { icon: 'clock', bg: 'rgba(248,113,113,.16)', fg: '#f87171' },
  budget: { icon: 'receipt', bg: 'rgba(251,191,36,.15)', fg: '#fbbf24' },
  savings: { icon: 'piggy', bg: 'rgba(167,139,250,.16)', fg: '#a78bfa' },
  payment: { icon: 'check', bg: 'rgba(52,211,153,.16)', fg: '#34d399' },
  expense: { icon: 'receipt', bg: 'rgba(251,146,60,.16)', fg: '#fb923c' },
  shop: { icon: 'shop', bg: 'rgba(96,165,250,.16)', fg: '#60a5fa' },
  info: { icon: 'info', bg: 'rgba(96,165,250,.16)', fg: '#60a5fa' }
}[n.type] || { icon: 'info', bg: 'rgba(96,165,250,.16)', fg: '#60a5fa' });

// ---------- realtime ----------
function setupRealtime() {
  const client = FAMI.client;
  if (FAMI.mode === 'demo') { demoCrossTabSync(); return; }
  try {
    // Every staff session refreshes when any shared table changes, so a payment
    // recorded by one manager appears instantly for the admin and other managers.
    const tables = ['shops', 'payments', 'expenses', 'expense_budgets', 'savings_goals', 'savings_deposits', 'notifications', 'activity', 'profiles'];
    const dataCh = client.channel('fami-data');
    tables.forEach((table) => dataCh.on('postgres_changes', { event: '*', schema: 'public', table }, () => onDataChange(table)));
    dataCh.subscribe();
    // Shared broadcast: instant toast for actions fanned out by notify_staff.
    client.channel('fami-alerts').on('broadcast', { event: 'new_event' }, ({ payload }) => {
      if (!payload) return;
      if (payload.actor && FAMI.user && payload.actor === FAMI.user.id) { FAMI._refresh({ silent: true }); return; }
      toast(payload.message || payload.title || 'New update', payload.type === 'error' ? 'error' : 'success');
      FAMI._refresh({ silent: true });
    }).subscribe();
  } catch (e) { console.warn('realtime setup failed', e); }
}

function onDataChange(table) {
  if (table === 'profiles') {
    // Re-read own profile so role changes apply without a reload.
    api.loadProfile().then(() => FAMI._refresh({ silent: true })).catch(() => FAMI._refresh({ silent: true }));
    return;
  }
  FAMI._refresh({ silent: true });
}

let demoSyncBound = false;
// Demo mode: the mock DB lives in localStorage, so other open tabs get a
// storage event whenever any tab writes data. Refresh so everyone stays in sync.
function demoCrossTabSync() {
  if (demoSyncBound) return;
  demoSyncBound = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== 'fami_demo_db_v3' || !FAMI.user || !FAMI._refresh) return;
    const before = FAMI.notifications.filter((n) => !n.read).length;
    FAMI._refresh({ silent: true }).then(() => {
      const now = FAMI.notifications.filter((n) => !n.read).length;
      if (now > before) toast('New update — check your notifications', 'info');
    }).catch(() => { /* noop */ });
  });
}

// ---------- wire up ----------
window.addEventListener('hashchange', route);
window.addEventListener('fami:notify', (e) => {
  const d = e.detail || {};
  toast(d.message || d.title || 'Notification', d.type === 'info' ? 'info' : d.type === 'error' ? 'error' : 'success');
});
document.addEventListener('click', (e) => {
  if (elBellDrop && !elBellDrop.classList.contains('hidden') && !e.target.closest('.bellWrap')) elBellDrop.classList.add('hidden');
});

boot();
