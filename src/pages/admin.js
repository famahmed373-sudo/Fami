// ============ FAMI system pages: reminders, activity, users, settings ============
import * as api from '../api.js';
import {
  el, esc, fmtMoney, fmtDate, timeAgo, toast, badge, emptyState, iconSvg, confirmDialog, can,
  loadPrefs, savePrefs, isDemo, roleBadge, roleLabel
} from '../lib.js';
import { alarmRow } from './core.js';

// ================= REMINDERS & ALARMS =================
export function renderReminders(ctx) {
  const alarms = ctx.alarms || [];
  const red = alarms.filter((a) => a.severity === 'red');
  const amber = alarms.filter((a) => a.severity === 'amber');
  const green = alarms.filter((a) => a.severity === 'green');
  const prefs = FAMI.prefs;

  const root = el('div', {},
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Alarm center'), el('p', {}, 'Automatically detected issues and reminders. Alarms also appear as notifications.'))),
      alarms.length ? el('div', {},
        red.length ? el('div', { style: { marginBottom: 18 } },
          el('div', { class: 'panelHead', style: { marginBottom: 10 } }, el('div', {}, el('h3', { style: { margin: 0, fontSize: 15, color: '#dc2626' } }, `🔴 Overdue rent (${red.length})`))),
          red.map((a) => alarmRow(a, ctx))
        ) : null,
        amber.length ? el('div', { style: { marginBottom: 18 } },
          el('div', { class: 'panelHead', style: { marginBottom: 10 } }, el('div', {}, el('h3', { style: { margin: 0, fontSize: 15, color: '#b45309' } }, `🟠 Due & budget alerts (${amber.length})`))),
          amber.map((a) => alarmRow(a, ctx))
        ) : null,
        green.length ? el('div', {},
          el('div', { class: 'panelHead', style: { marginBottom: 10 } }, el('div', {}, el('h3', { style: { margin: 0, fontSize: 15, color: '#047857' } }, `🟢 Savings milestones (${green.length})`))),
          green.map((a) => alarmRow(a, ctx))
        ) : null
      ) : emptyState('All clear', 'No overdue rents, budget overruns or milestones right now.', 'check')
    ),
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Notification preferences'), el('p', {}, 'Choose which alarms become notifications and when rent reminders fire.'))),
      el('div', {},
        settingRow('Rent reminders', 'Alerts for overdue and due rent payments.', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifyRent !== false, onchange: (e) => { prefs.notifyRent = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
        settingRow('Budget alerts', 'Warn when a category goes over its monthly budget.', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifyBudget !== false, onchange: (e) => { prefs.notifyBudget = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
        settingRow('Savings milestones', 'Notify when a savings goal reaches its target.', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifySavings !== false, onchange: (e) => { prefs.notifySavings = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
        settingRow('Rent reminder timing', 'Day of month after which an unpaid month is flagged as due.', dayInput(prefs))
      )
    )
  );
  return root;
}

function dayInput(prefs) {
  const input = el('input', { type: 'number', min: 1, max: 28, value: prefs.remindDays || 3, style: { width: 90 } });
  input.addEventListener('change', () => {
    const v = Math.min(28, Math.max(1, Number(input.value) || 3));
    prefs.remindDays = v; savePrefs(prefs); toast('Preferences saved');
  });
  return input;
}

const settingRow = (title, desc, control) => el('div', { class: 'settingRow' }, el('div', {}, el('b', {}, title), el('p', {}, desc)), control);

// ================= ACTIVITY =================
export function renderActivity() {
  let q = '';
  const wrap = el('div', {});
  // Role-based audit visibility:
  //  - Admin: full audit trail — every update by anyone in the building.
  //  - Manager: their own updates, other managers' updates, and users' (payment
  //    officers / viewers) activity. The admin's updates stay private to the admin.
  //  - Viewer / payment officer: their own updates only.
  const me = FAMI.user;
  const isAdmin = !!me && me.role === 'admin';
  const isManager = !!me && me.role === 'manager';
  const visibleActivity = () => {
    if (!me) return [];
    if (isAdmin) return FAMI.activity;
    if (isManager) return FAMI.activity.filter((a) => !a.user_id || profileRole(a.user_id) !== 'admin');
    return FAMI.activity.filter((a) => a.user_id === me.id);
  };
  const renderList = () => {
    const base = visibleActivity();
    const list = base.filter((a) => !q || String(a.details || '').toLowerCase().includes(q.toLowerCase()) || String(a.action || '').toLowerCase().includes(q.toLowerCase()));
    wrap.replaceChildren(list.length ? el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, 'When'), el('th', {}, 'Who'), el('th', {}, 'Action'), el('th', {}, 'Details'))),
      el('tbody', {}, list.map((a) => el('tr', {},
        el('td', { style: { whiteSpace: 'nowrap' } }, timeAgo(a.created_at)),
        el('td', {}, el('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          esc(profileName(a.user_id)),
          profileRole(a.user_id) ? roleBadge(profileRole(a.user_id)) : null
        )),
        el('td', {}, badge(String(a.action || '').replace('.', ' '), 'blue')),
        el('td', {}, esc(a.details || '—'))
      )))
    )) : emptyState('No activity found', isManager ? 'Your team has not made any updates yet.' : 'Your updates will appear here.', 'clock'));
  };
  const note = isAdmin
    ? 'Full audit trail — every update made by staff.'
    : isManager
      ? 'Team activity — your updates, other managers’ updates and users’ activity. Admin updates are private.'
      : 'Your updates only.';
  const root = el('div', {},
    el('div', { class: 'toolbar' },
      el('div', { class: 'search' }, el('span', { html: iconSvg('search', 16) }), el('input', { placeholder: 'Search activity...', oninput: (e) => { q = e.target.value; renderList(); } })),
      el('span', { class: 'muted', style: { fontSize: 12.5 } }, `${visibleActivity().length} entries`)
    ),
    el('div', { class: 'hint', style: { margin: '-2px 0 12px', fontSize: 12.5 } }, note),
    wrap
  );
  renderList();
  return root;
}
const profileName = (id) => {
  if (FAMI.user && FAMI.user.id === id) return FAMI.user.full_name || 'You';
  const p = (FAMI.profiles || []).find((x) => x.id === id);
  return p ? p.full_name || p.email : 'Unknown';
};
const profileRole = (id) => {
  if (FAMI.user && FAMI.user.id === id) return FAMI.user.role;
  const p = (FAMI.profiles || []).find((x) => x.id === id);
  return p ? p.role : '';
};
const initials = (name) => (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// ================= USERS (admin) =================
export function renderUsers(ctx) {
  const inviteBtn = el('button', { class: 'btn sm2' }, el('span', { class: 'ic', html: iconSvg('copy', 13) }), 'Copy invite message');
  inviteBtn.addEventListener('click', () => {
    const url = location.origin + location.pathname;
    const msg = `Join FAMI — the building rent & finance workspace:\n\n1. Open ${url}\n2. Tap “Create account” and sign up with your email.\n3. Your admin will assign your role (manager / payment officer).`;
    navigator.clipboard.writeText(msg).then(() => toast('Invite message copied — send it to your manager')).catch(() => toast(msg, 'info', 6000));
  });

  const root = el('div', {},
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Users & roles'), el('p', {}, 'Control who can access FAMI and what they can do.'))),
      el('div', { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.35)', borderRadius: 12, marginBottom: 16, fontSize: 13 } },
        el('span', { html: iconSvg('users', 17), style: { color: '#60a5fa' } }),
        el('span', { style: { flex: 1, minWidth: 220 } }, 'Only you, the admin, can grant Manager access. New staff join by creating an account, then you promote them here — when you change a role, the staff member is notified immediately.'),
        inviteBtn
      ),
      el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', {}, 'User'), el('th', {}, 'Role'), el('th', {}, 'Actions'))),
        el('tbody', {}, (FAMI.profiles || []).map((p) => {
          const sel = el('select', {},
            ['admin', 'manager', 'payment_officer', 'viewer'].map((r) => el('option', { value: r, selected: p.role === r }, roleLabel(r)))
          );
          const save = async () => {
            try { await api.updateUserRole(p.id, sel.value); toast(`Role updated for ${p.full_name || p.email}`); await ctx.refresh(); }
            catch (e) { toast(e.message || 'Could not update role', 'error'); }
          };
          return el('tr', {},
            el('td', {}, el('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              el('div', { class: 'avatar', style: { width: 34, height: 34, fontSize: 13 } }, initials(p.full_name)),
              el('div', {}, el('b', {}, esc(p.full_name || '—')), el('div', { class: 'muted', style: { fontSize: 12 } }, esc(p.email || '')), p.id === FAMI.user.id ? el('span', { class: 'muted', style: { fontSize: 11 } }, '(you)') : null)
            )),
            el('td', {}, roleBadge(p.role)),
            el('td', { class: 'rowActs' }, can('users') ? el('button', { class: 'btn sm2', onclick: save }, 'Save role') : null, sel)
          );
        }))
      ))
    ),
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Role guide'), el('p', {}, 'What each role can see and do.'))),
      el('div', { class: 'pillList' },
        rolePill('Admin', 'Watches and controls everything — every update, every role. Only the admin grants Manager access.'),
        rolePill('Manager', 'Manages shops, payments, expenses and savings. Sees team activity (own, other managers’ and users’ updates) — admin updates stay private to the admin.'),
        rolePill('Payment officer', 'Records payments and manages shops. Sees only their own updates.'),
        rolePill('Viewer', 'Read-only access. Sees only their own updates.')
      )
    )
  );
  return root;
}
const rolePill = (title, desc) => el('div', { class: 'pill', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 } }, el('b', {}, title), el('span', { class: 'muted', style: { fontSize: 12, fontWeight: 400 } }, desc));

// ================= SETTINGS =================
export function renderSettings(ctx) {
  const prefs = loadPrefs();
  const name = el('input', { value: FAMI.user.full_name || '' });
  const curSel = el('select', {}, ['ETB', 'USD'].map((c) => el('option', { value: c, selected: prefs.currency === c }, c === 'ETB' ? 'Ethiopian Birr (ETB)' : 'US Dollar (USD)')));
  const isStaff = FAMI.user && (FAMI.user.role === 'admin' || FAMI.user.role === 'manager');

  // Security PIN manager: only admins and managers have one. Changing it asks
  // ONLY for the account email + password to verify identity, then sets the new
  // 5-digit PIN that replaces the built-in default (82000 admin / 83000 manager).
  function securityPanel() {
    const emailIn = el('input', { type: 'email', value: FAMI.user.email || '', disabled: true });
    const passIn = el('input', { type: 'password', placeholder: 'Your password', autocomplete: 'current-password' });
    const pinIn = el('input', { type: 'password', inputmode: 'numeric', maxLength: 5, placeholder: '5-digit PIN', autocomplete: 'off' });
    const pinIn2 = el('input', { type: 'password', inputmode: 'numeric', maxLength: 5, placeholder: 'Repeat PIN', autocomplete: 'off' });
    const pinMsg = el('div', { class: 'hint', style: { gridColumn: '1/-1' } });
    const save = async () => {
      const newPin = pinIn.value.trim();
      pinMsg.style.color = 'var(--danger)';
      if (!/^\d{5}$/.test(newPin)) { pinMsg.textContent = 'New PIN must be exactly 5 digits.'; return; }
      if (newPin !== pinIn2.value.trim()) { pinMsg.textContent = 'The two PINs do not match.'; return; }
      if (!passIn.value) { pinMsg.textContent = 'Enter your password to verify it is you.'; return; }
      try {
        // Verify identity with the account's email + password only.
        const { error } = await FAMI.client.auth.signInWithPassword({ email: FAMI.user.email, password: passIn.value });
        if (error) throw new Error('Wrong password — verification failed.');
        await api.updateOwnPin(newPin);
        toast('Security PIN updated');
        pinMsg.style.color = 'var(--success)';
        pinMsg.textContent = 'PIN updated — use it next time you sign in.';
        passIn.value = ''; pinIn.value = ''; pinIn2.value = '';
      } catch (e) { pinMsg.textContent = e.message || 'Could not update the PIN.'; }
    };
    return el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Security PIN'), el('p', {}, `Your ${FAMI.user.role === 'admin' ? 'admin' : 'manager'} sign-in requires a 5-digit PIN in addition to your password.`))),
      el('div', { style: { marginBottom: 14, fontSize: 13 } },
        'Current PIN: ', el('code', { style: { fontSize: 13 } }, api.expectedPin() || '—'),
        el('span', { class: 'muted' }, '  — change it below. The form asks only your email and password to verify.')
      ),
      el('div', { class: 'formGrid' },
        el('div', { class: 'field' }, el('label', {}, 'Email'), emailIn),
        el('div', { class: 'field' }, el('label', { html: 'Password <span class="req">*</span>' }), passIn),
        el('div', { class: 'field' }, el('label', { html: 'New PIN <span class="req">*</span>' }), pinIn),
        el('div', { class: 'field' }, el('label', { html: 'Confirm PIN <span class="req">*</span>' }), pinIn2),
        pinMsg,
        el('div', { class: 'formActions full' }, el('button', { class: 'btn primary', onclick: save }, 'Change PIN'))
      )
    );
  }

  const root = el('div', {},
    el('div', { class: 'grid2' },
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Profile'), el('p', {}, 'Your account details and role.'))),
        el('div', { class: 'formGrid' },
          el('div', { class: 'field' }, el('label', {}, 'Full name'), name),
          el('div', { class: 'field' }, el('label', {}, 'Email'), el('input', { value: FAMI.user.email || '', disabled: true })),
          el('div', { class: 'field' }, el('label', {}, 'Role'), el('div', { style: { paddingTop: 10 } }, roleBadge(FAMI.user.role))),
          el('div', { class: 'formActions full' }, el('button', { class: 'btn primary', onclick: saveProfile }, 'Save profile'))
        )
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Preferences'), el('p', {}, 'Display and reminder settings.'))),
        el('div', {},
          settingRow('Currency', 'Used across all amounts and reports.', curSel),
          settingRow('Rent reminders', '', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifyRent !== false, onchange: (e) => { prefs.notifyRent = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
          settingRow('Budget alerts', '', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifyBudget !== false, onchange: (e) => { prefs.notifyBudget = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
          settingRow('Savings milestones', '', el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: prefs.notifySavings !== false, onchange: (e) => { prefs.notifySavings = e.target.checked; savePrefs(prefs); } }), el('i', {}))),
          el('div', { class: 'formActions' }, el('button', { class: 'btn primary', onclick: () => { savePrefs({ ...prefs, currency: curSel.value }); toast('Preferences saved'); } }, 'Save preferences'))
        )
      )
    ),
    isStaff ? securityPanel() : null,
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Connection'), el('p', {}, 'How FAMI stores its data.'))),
      el('div', { class: 'settingRow' },
        el('div', {}, el('b', {}, isDemo() ? 'Demo mode (browser storage)' : 'Supabase connected'), el('p', {}, isDemo() ? 'All data is stored in this browser. Sign in with any demo account to explore, then add your Supabase keys to go live.' : `Connected to ${supaHost()}`)),
        el('div', {}, isDemo() ? badge('Demo', 'amber') : badge('Live', 'green'))
      ),
      isDemo() ? null : el('div', { style: { marginTop: 12, padding: 13, background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.4)', borderRadius: 12, fontSize: 13 } },
        el('b', {}, 'Live mode is fully active. '),
        'All staff see shared data in real time — payments, expenses, budgets, savings and the audit trail. New staff sign up with the “Create account” tab and an admin assigns their role.'
      ),
      FAMI.schemaError ? el('div', { style: { marginTop: 12, padding: 13, background: 'var(--danger-bg)', border: '1px solid rgba(248,113,113,.4)', borderRadius: 12, color: '#fca5a5', fontSize: 13 } },
        el('b', {}, 'Missing database tables: '), Object.keys(FAMI.schemaError).join(', '), '. ',
        'Run the supabase/schema.sql script in your Supabase SQL editor to create them.'
      ) : null,
      isDemo() ? el('div', { style: { marginTop: 14 } },
        el('div', { class: 'muted', style: { fontSize: 12.5, marginBottom: 8 } }, 'Demo accounts — password: fami1234'),
        el('div', { class: 'pillList' }, ['admin@fami.demo', 'marta@fami.demo', 'eyob@fami.demo'].map((e) => el('code', { style: { fontSize: 12.5 } }, e))),
        el('div', { style: { marginTop: 16 } }, el('button', { class: 'btn danger', onclick: () => confirmDialog({
          title: 'Reset demo data?', message: 'All demo shops, payments, expenses and goals will be restored to the original sample.', confirmText: 'Reset data', danger: true,
          onConfirm: async () => { localStorage.removeItem('fami_demo_db_v3'); localStorage.removeItem('fami_demo_session_v3'); window.location.reload(); }
        }) }, 'Reset demo data'))
      ) : null
    )
  );

  async function saveProfile() {
    if (!name.value.trim()) return toast('Name cannot be empty', 'error');
    try {
      await api.updateProfile({ full_name: name.value.trim() });
      toast('Profile updated');
      await ctx.refresh(true);
    } catch (e) { toast(e.message || 'Could not update profile', 'error'); }
  }
  return root;
}
const supaHost = () => {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL || '').host; } catch { return ''; }
};
