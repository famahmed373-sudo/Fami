// ============ FAMI core pages: dashboard, shops, payments ============
import * as api from '../api.js';
import {
  el, esc, fmtMoney, fmtDate, pct, today, monthKey, monthLabel, shortMonth, timeAgo,
  toast, badge, emptyState, confirmDialog, downloadCSV, iconSvg, openModal, closeModal, can
} from '../lib.js';

const ACTIONS = {
  shop_added: ['shop.added', 'blue'], shop_updated: ['shop.updated', 'blue'], shop_deleted: ['shop.deleted', 'blue'],
  shop_photo_added: ['shop.photo added', 'blue'], shop_photo_deleted: ['shop.photo removed', 'gray'],
  payment_recorded: ['payment.recorded', 'green'], payment_reversed: ['payment.reversed', 'amber'],
  expense_added: ['expense.added', 'amber'], expense_updated: ['expense.updated', 'amber'], expense_deleted: ['expense.deleted', 'amber'],
  budget_set: ['budget.set', 'amber'],
  savings_goal: ['savings.goal', 'purple'], savings_deposit: ['savings.deposit', 'purple'],
  savings_completed: ['savings.completed', 'green'], savings_deleted: ['savings.deleted', 'red'],
  user_role: ['user.role', 'gray'], profile_updated: ['profile.updated', 'gray']
};
const actionBadge = (a) => {
  const [key, color] = ACTIONS[a] || [a, 'gray'];
  return badge(key.replace('.', ' '), color);
};
const actionIcon = (a) => {
  if (a.startsWith('shop')) return 'shop';
  if (a.startsWith('payment')) return 'card';
  if (a.startsWith('expense') || a.startsWith('budget')) return 'receipt';
  if (a.startsWith('savings')) return 'piggy';
  if (a.startsWith('user') || a.startsWith('profile')) return 'users';
  return 'info';
};
const initials = (name) => (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function renderDashboard(ctx) {
  const stats = api.computeStats();
  const cur = monthKey();
  const recent = FAMI.payments.filter((p) => !p.reversed).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const feed = FAMI.activity.slice(0, 8);
  const alarms = ctx.alarms || [];

  const root = el('div', {},
    FAMI.mode === 'demo' ? el('div', { class: 'demoBanner' }, el('span', { html: iconSvg('info', 17) }), el('span', {}, el('b', {}, 'Demo mode — '), 'data is stored in your browser. Add Supabase keys in Settings to go live.')) : null,
    el('div', { class: 'panel', style: { padding: 22 } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' } },
        el('div', {},
          el('h2', { style: { margin: 0, fontSize: 19, letterSpacing: '-.4px' } }, `${greeting()}, ${esc(FAMI.user.full_name || '')}`),
          el('p', { class: 'muted', style: { margin: '3px 0 0' } }, `Here's what's happening in ${monthLabel(cur)}.`)
        ),
        el('div', { class: 'actions' },
          can('payments') ? el('button', { class: 'btn success', onclick: () => ctx.go('payments') }, el('span', { class: 'ic', html: iconSvg('plus', 15) }), 'Record payment') : null,
          can('edit') ? el('button', { class: 'btn', onclick: () => ctx.go('expenses') }, el('span', { class: 'ic', html: iconSvg('plus', 15) }), 'Add expense') : null,
          el('button', { class: 'btn ghost', onclick: async () => { await ctx.refresh(); } }, el('span', { class: 'ic', html: iconSvg('refresh', 15) }), 'Refresh')
        )
      )
    ),
    el('div', { class: 'cards' },
      statCard('Shops', stats.shopsTotal, `${stats.shopsActive} active`, iconSvg('shop', 19), 'blue', `${stats.shopsTotal - stats.shopsActive} inactive/vacant`),
      statCard('Expected rent', fmtMoney(stats.expectedMonth), 'for this month', iconSvg('wallet', 19), 'purple', `${stats.dueSoon} shop(s) not yet paid`),
      statCard('Collected', fmtMoney(stats.collectedMonth), `${pct(stats.collectedMonth, stats.expectedMonth)}% collection rate`, iconSvg('check', 19), 'green', `${stats.paymentsThisMonth} payments posted`),
      statCard('Outstanding', fmtMoney(stats.outstanding), `${stats.defaulters} shop(s) in arrears`, iconSvg('alert', 19), 'red', 'from earlier months')
    ),
    alarms.length ? el('div', {},
      el('div', { class: 'panelHead', style: { marginBottom: 10 } },
        el('div', {}, el('h2', {}, '⚠ Attention needed'), el('p', {}, 'Items flagged by your alarm rules')),
        el('button', { class: 'btn small', onclick: () => ctx.go('reminders') }, 'View all alerts')
      ),
      el('div', {}, alarms.slice(0, 3).map((a) => alarmRow(a, ctx)))
    ) : null,
    el('div', { class: 'kpis' },
      miniCard('Collection progress', `${pct(stats.collectedMonth, stats.expectedMonth)}%`, el('div', { class: 'progress', style: { marginTop: 8 } }, el('i', { style: { width: `${pct(stats.collectedMonth, stats.expectedMonth)}%` } })), `${fmtMoney(stats.collectedMonth)} of ${fmtMoney(stats.expectedMonth)}`),
      budgetMini(ctx),
      miniCard('Savings', fmtMoney(stats.savingsTotal), el('div', { class: 'progress green', style: { marginTop: 8 } }, el('i', { style: { width: `${pct(stats.savingsTotal, stats.savingsTarget)}%` } })), `${stats.goalsOpen} active goal(s) · target ${fmtMoney(stats.savingsTarget)}`)
    ),
    el('div', { class: 'grid2' },
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Recent payments'), el('p', {}, `Latest rent collections in ${monthLabel(cur)}`)), el('button', { class: 'btn small', onclick: () => ctx.go('payments') }, 'All payments')),
        recent.length ? el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Shop'), el('th', { class: 'right' }, 'Amount'), el('th', {}, 'Status'))),
          el('tbody', {}, recent.map((p) => {
            const shop = FAMI.shops.find((s) => s.id === p.shop_id);
            return el('tr', {}, el('td', {}, fmtDate(p.date)), el('td', {}, esc(shop ? shop.name : '—')), el('td', { class: 'right mono' }, fmtMoney(p.amount)), el('td', {}, badge(p.method, 'gray')));
          }))
        )) : emptyState('No payments yet', 'Record your first rent payment to see it here.', 'card')
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Recent activity'), el('p', {}, 'Audit trail of important actions'))),
        feed.length ? el('div', { class: 'feed' }, feed.map((a) =>
          el('div', { class: 'feedItem' },
            el('div', { class: 'ic', style: { background: 'rgba(99,102,241,.18)', color: '#a5b4fc' }, html: iconSvg(actionIcon(a.action), 15) }),
            el('div', {}, el('span', {}, actionBadge(a.action)), ' ', el('b', {}, esc(a.details)), el('small', {}, `${esc(profileName(a.user_id))} · ${timeAgo(a.created_at)}`))
          )
        )) : emptyState('No activity yet', 'Actions you take will appear here.', 'clock')
      )
    )
  );
  return root;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};
const profileName = (id) => {
  if (FAMI.user && FAMI.user.id === id) return FAMI.user.full_name || 'You';
  const p = (FAMI.profiles || []).find((x) => x.id === id);
  return p ? p.full_name || p.email : 'Unknown';
};
const statCard = (label, num, sub, icon, color, tip) => {
  const colors = { blue: ['rgba(96,165,250,.16)', '#60a5fa'], green: ['rgba(52,211,153,.16)', '#34d399'], red: ['rgba(248,113,113,.16)', '#f87171'], amber: ['rgba(251,191,36,.16)', '#fbbf24'], purple: ['rgba(167,139,250,.16)', '#a78bfa'] };
  const [bg, fg] = colors[color] || colors.blue;
  return el('div', { class: 'card panel stat' },
    el('div', { class: 'statTop' },
      el('label', {}, label),
      el('div', { class: 'statIcon', style: { background: bg, color: fg }, html: icon })),
    el('div', { class: 'num' }, num),
    el('div', { class: 'sub', title: tip || '' }, tip ? el('span', { class: 'muted' }, tip) : sub));
};
const miniCard = (label, big, bar, sub) => el('div', { class: 'panel mini' }, el('div', { class: 'muted', style: { fontSize: 12, fontWeight: 800 } }, label), el('div', { class: 'big' }, big), bar, el('p', {}, sub));
const budgetMini = (ctx) => {
  const status = api.budgetStatus();
  const total = status.reduce((s, b) => s + Number(b.amount || 0), 0);
  const spent = status.reduce((s, b) => s + Number(b.spent || 0), 0);
  const over = status.filter((b) => b.over > 0).length;
  return el('div', { class: 'panel mini' },
    el('div', { class: 'muted', style: { fontSize: 12, fontWeight: 800 } }, 'Budget health'),
    el('div', { class: 'big' }, fmtMoney(spent)),
    el('div', { class: 'barLab' }, el('span', {}, `of ${fmtMoney(total)} budget`), el('b', { style: { color: over ? '#f87171' : '#34d399' } }, `${pct(spent, total)}%`)),
    el('div', { class: 'progress' + (over ? ' amber' : ' green') }, el('i', { style: { width: `${Math.min(100, pct(spent, total))}%` } })),
    el('p', {}, over ? `${over} categor${over > 1 ? 'ies' : 'y'} over budget` : 'Within budget this month')
  );
};

// ---------- alarms ----------
export function alarmRow(a, ctx) {
  const acts = [];
  if (a.type === 'rent_due' && a.shop && can('payments')) acts.push(el('button', { class: 'btn small primary', onclick: () => ctx.go('payments', { shop: a.shop.id }) }, 'Record payment'));
  if (a.type === 'budget') acts.push(el('button', { class: 'btn small', onclick: () => ctx.go('expenses') }, 'Manage expenses'));
  if (a.type === 'savings' && a.goal) acts.push(el('button', { class: 'btn small', onclick: () => ctx.go('savings') }, 'View goal'));
  return el('div', { class: `alarm ${a.severity}` },
    el('div', { class: 'ic', html: iconSvg(a.type === 'rent_due' ? 'clock' : a.type === 'budget' ? 'receipt' : 'piggy', 18) }),
    el('div', {}, el('b', {}, esc(a.title)), el('p', {}, esc(a.message))),
    acts.length ? el('div', { class: 'acts' }, acts) : null
  );
}

// ================= SHOPS =================
export function renderShops(ctx) {
  let q = '', st = 'all';
  const grid = el('div', {});
  const renderGrid = () => {
    const list = FAMI.shops.filter((s) =>
      (st === 'all' || s.status === st) &&
      (!q || [s.name, s.unit, s.tenant_name, s.tenant_phone].join(' ').toLowerCase().includes(q.toLowerCase()))
    );
    grid.replaceChildren(list.length
      ? el('div', { class: 'shopGrid' }, list.map((s) => shopCard(s, ctx)))
      : emptyState('No shops found', q || st !== 'all' ? 'Try changing your search or filter.' : 'Register your first shop to start collecting rent.', 'shop')
    );
  };
  const root = el('div', {},
    el('div', { class: 'toolbar' },
      el('div', { class: 'filters' },
        el('div', { class: 'search' }, el('span', { html: iconSvg('search', 16) }), el('input', { placeholder: 'Search shop, tenant, unit...', oninput: (e) => { q = e.target.value; renderGrid(); } })),
        el('select', { onchange: (e) => { st = e.target.value; renderGrid(); } },
          el('option', { value: 'all' }, 'All statuses'),
          el('option', { value: 'active' }, 'Active'),
          el('option', { value: 'released' }, 'Released'),
          el('option', { value: 'vacant' }, 'Vacant')
        )
      ),
      can('edit') ? el('button', { class: 'btn primary', onclick: () => shopModal(ctx, null) }, el('span', { class: 'ic', html: iconSvg('plus', 15) }), 'Register shop') : null
    ),
    grid
  );
  renderGrid();
  return root;
}

function shopCard(s, ctx) {
  const a = api.computeArrears(s);
  const imgs = (FAMI.shopImages || []).filter((i) => i.shop_id === s.id);
  return el('div', { class: 'panel shopCard' },
    el('span', { class: 'unit' }, esc(s.unit || '—')),
    imgs.length ? el('div', { class: 'shopThumbs' }, imgs.slice(0, 3).map((img) => el('img', { src: api.shopImageUrl(img), alt: '', loading: 'lazy' }))) : null,
    el('div', {},
      el('h3', {}, el('span', { html: iconSvg('shop', 17), style: { color: 'var(--brand-ink)' } }), esc(s.name)),
      el('div', { style: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' } },
        badge(s.status, s.status === 'active' ? 'green' : s.status === 'released' ? 'amber' : 'gray', true),
        s.tenant_name ? badge('Occupied', 'blue') : null
      )
    ),
    el('div', { class: 'meta' },
      el('div', {}, 'Tenant: ', s.tenant_name ? el('b', {}, esc(s.tenant_name)) : el('span', { class: 'muted' }, '—')),
      s.tenant_phone ? el('div', {}, 'Phone: ', el('b', {}, esc(s.tenant_phone))) : null,
      el('div', {}, 'Rent: ', el('b', {}, fmtMoney(s.rent_amount)), ' ', el('span', { class: 'muted' }, 'since ' + shortMonth(s.registered_month))),
      el('div', {}, 'Arrears: ', s.status === 'active' ? el('b', { style: { color: a.total > 0 ? '#f87171' : '#34d399' } }, fmtMoney(a.total)) : el('span', { class: 'muted' }, '—'))
    ),
    el('div', { class: 'foot' },
      el('div', {}, s.tenant_name ? el('div', { class: 'muted', style: { fontSize: 12 } }, `Registered ${shortMonth(s.registered_month)}`) : el('div', { class: 'muted', style: { fontSize: 12 } }, 'Available for rent')),
      el('div', { class: 'acts' },
        can('edit') ? el('button', { class: 'btn sm2', onclick: () => shopModal(ctx, s) }, 'Edit') : null,
        can('edit') ? el('button', { class: 'btn sm2 danger', onclick: () => deleteShopFlow(ctx, s) }, el('span', { class: 'ic', html: iconSvg('trash', 13) })) : null,
        el('button', { class: 'btn sm2', onclick: () => ctx.go('payments', { shop: s.id }) }, 'Payments')
      )
    )
  );
}

function shopModal(ctx, shop) {
  const isNew = !shop;
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
  const photosGrid = el('div', { class: 'shopPhotos' });
  const photoHint = el('div', { class: 'hint', style: { fontSize: 11.8 } }, 'Photos are shared with the whole team and appear on the shop card. Up to 2 MB each.');
  const renderPhotos = () => {
    const imgs = (FAMI.shopImages || []).filter((i) => i.shop_id === shop.id);
    const items = imgs.map((img) => el('div', { class: 'photo' },
      el('img', { src: api.shopImageUrl(img), alt: '', loading: 'lazy' }),
      el('button', { class: 'photoDel', title: 'Delete photo', 'aria-label': 'Delete photo', onclick: async () => {
        try {
          await api.deleteShopImage(img.id, img.path);
          FAMI.shopImages = FAMI.shopImages.filter((x) => x.id !== img.id);
          renderPhotos();
          toast('Photo deleted');
        } catch (e) { toast(e.message || 'Could not delete photo', 'error'); }
      } }, '×')
    ));
    items.push(el('button', { class: 'photoAdd', onclick: () => fileInput.click() },
      el('span', { html: iconSvg('plus', 18) }), 'Add photo'));
    photosGrid.replaceChildren(...items);
  };
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    fileInput.disabled = true;
    for (const f of files) {
      try {
        const res = await api.uploadShopImage(shop.id, f);
        const rows = Array.isArray(res) ? res : [res];
        FAMI.shopImages.push(...rows);
        renderPhotos();
      } catch (e) { toast(e.message || 'Could not upload photo', 'error'); }
    }
    fileInput.value = '';
    fileInput.disabled = false;
  });
  const f = (val) => (val == null ? '' : val);
  const name = el('input', { placeholder: 'e.g. Selam Bakery', value: f(shop && shop.name) });
  const unit = el('input', { placeholder: 'e.g. A-01', value: f(shop && shop.unit) });
  const tenantName = el('input', { placeholder: 'Tenant full name', value: f(shop && shop.tenant_name) });
  const tenantPhone = el('input', { placeholder: 'e.g. 0911 234 567', value: f(shop && shop.tenant_phone) });
  const rent = el('input', { type: 'number', min: 0, step: 0.01, placeholder: '0.00', value: f(shop && shop.rent_amount) });
  const status = el('select', {}, ['active', 'released', 'vacant'].map((s) => el('option', { value: s, selected: shop && shop.status === s }, s.charAt(0).toUpperCase() + s.slice(1))));
  const regMonth = el('input', { type: 'month', value: f(shop && shop.registered_month) || (isNew ? monthKey() : '') });
  const notes = el('textarea', { placeholder: 'Optional notes', rows: 2 }, f(shop && shop.notes));

  const save = async () => {
    if (!name.value.trim()) return toast('Shop name is required', 'error');
    if (!regMonth.value) return toast('Registration month is required', 'error');
    if (Number(rent.value) < 0) return toast('Rent cannot be negative', 'error');
    try {
      await api.saveShop({ id: shop && shop.id, name: name.value, unit: unit.value, tenant_name: tenantName.value, tenant_phone: tenantPhone.value, rent_amount: rent.value, status: status.value, registered_month: regMonth.value, notes: notes.value });
      closeModal();
      toast(isNew ? 'Shop registered' : 'Shop updated');
      await ctx.refresh();
    } catch (e) { toast(e.message || 'Could not save shop', 'error'); }
  };

  openModal({
    title: isNew ? 'Register shop' : `Edit ${shop.name}`,
    sub: isNew ? 'Add a new shop unit to your building.' : 'Update shop, tenant and photo details.',
    body: el('div', { class: 'formGrid' },
      el('div', { class: 'field full' }, el('label', { html: 'Shop name <span class="req">*</span>' }), name),
      el('div', { class: 'field' }, el('label', {}, 'Shop number'), unit),
      el('div', { class: 'field' }, el('label', {}, 'Monthly rent (ETB) <span class="req">*</span>'), rent),
      el('div', { class: 'field' }, el('label', {}, 'Status'), status),
      el('div', { class: 'field' }, el('label', {}, 'Tenant name'), tenantName),
      el('div', { class: 'field' }, el('label', {}, 'Phone number'), tenantPhone),
      el('div', { class: 'field' }, el('label', {}, 'Registration month <span class="req">*</span>'), regMonth, el('div', { class: 'hint' }, 'Rent accrues from this month.')),
      el('div', { class: 'field full' }, el('label', {}, 'Notes'), notes),
      el('div', { class: 'field full', style: { display: isNew ? 'none' : 'grid' } },
        el('label', {}, 'Photos'),
        photosGrid,
        fileInput,
        photoHint
      ),
      el('div', { class: 'formActions full' },
        el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
        el('button', { class: 'btn primary', onclick: save }, isNew ? 'Register shop' : 'Save changes')
      )
    )
  });
  if (!isNew) renderPhotos();
}

function deleteShopFlow(ctx, shop) {
  confirmDialog({
    title: 'Delete shop?',
    message: `"${shop.name}" and its payment history will be permanently removed.`,
    confirmText: 'Delete shop', danger: true,
    onConfirm: async () => {
      try { await api.deleteShop(shop.id); toast('Shop deleted'); await ctx.refresh(); }
      catch (e) { toast(e.message || 'Could not delete shop', 'error'); }
    }
  });
}

// ================= PAYMENTS =================
export function renderPayments(ctx) {
  const params = ctx.params || {};
  const preselect = params.shop || '';
  const root = el('div', {},
    can('payments') ? paymentForm(params.shop) : el('div', { class: 'panel' }, el('p', { class: 'muted', style: { margin: 0 } }, 'Your role has view-only access to payments.')),
    historyPanel(params)
  );
  return root;
}

function paymentForm(preselectShopId) {
  const shops = FAMI.shops.filter((s) => s.status === 'active' || s.id === preselectShopId);
  const shopSel = el('select', {}, shops.map((s) => el('option', { value: s.id, selected: preselectShopId === s.id }, `${s.name}${s.tenant_name ? ' — ' + s.tenant_name : ''}`)));
  const month = el('input', { type: 'month', value: monthKey() });
  const amount = el('input', { type: 'number', min: 0.01, step: 0.01, placeholder: '0.00' });
  const date = el('input', { type: 'date', value: today() });
  const method = el('select', {}, ['Cash', 'Bank Transfer', 'Mobile Money', 'Check'].map((m) => el('option', { value: m }, m)));
  const ref = el('input', { placeholder: 'Receipt / transfer reference' });
  const note = el('input', { placeholder: 'Optional note' });
  const hint = el('div', { class: 'hint', style: { gridColumn: '1/-1', fontSize: 12.4, color: 'var(--muted)' } });

  const suggest = () => {
    const s = FAMI.shops.find((x) => x.id === shopSel.value);
    if (!s) return;
    amount.value = s.rent_amount;
    const a = api.computeArrears(s);
    hint.textContent = a.total > 0 ? `${s.name}: ${fmtMoney(a.total)} arrears — this payment covers ${monthLabel(month.value)}.` : `${s.name}: suggested rent ${fmtMoney(s.rent_amount)} for ${monthLabel(month.value)}.`;
  };
  shopSel.addEventListener('change', suggest);
  month.addEventListener('change', suggest);

  const submit = async () => {
    const s = FAMI.shops.find((x) => x.id === shopSel.value);
    if (!s) return toast('Select a shop', 'error');
    if (!month.value) return toast('Select the month being paid for', 'error');
    if (!(Number(amount.value) > 0)) return toast('Enter a valid amount', 'error');
    try {
      await api.addPayment({ shop_id: s.id, month: month.value, amount: amount.value, date: date.value, method: method.value, reference: ref.value, note: note.value });
      toast(`Payment of ${fmtMoney(amount.value)} recorded`);
      amount.value = ''; ref.value = ''; note.value = '';
      await FAMI._refresh();
    } catch (e) { toast(e.message || 'Could not record payment', 'error'); }
  };

  return el('div', { class: 'panel' },
    el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Record rent payment'), el('p', {}, 'Supports full or partial payments. Reversals keep the audit trail.'))),
    el('div', { class: 'formGrid' },
      el('div', { class: 'field' }, el('label', {}, 'Shop <span class="req">*</span>'), shopSel),
      el('div', { class: 'field' }, el('label', {}, 'Paying for month <span class="req">*</span>'), month),
      el('div', { class: 'field' }, el('label', {}, 'Amount (ETB) <span class="req">*</span>'), amount),
      el('div', { class: 'field' }, el('label', {}, 'Payment date'), date),
      el('div', { class: 'field' }, el('label', {}, 'Method'), method),
      el('div', { class: 'field' }, el('label', {}, 'Reference'), ref),
      el('div', { class: 'field full' }, el('label', {}, 'Note'), note),
      hint
    ),
    el('div', { class: 'formActions' }, el('button', { class: 'btn success', onclick: submit }, el('span', { class: 'ic', html: iconSvg('check', 15) }), 'Record payment'))
  );
}

function historyPanel(params) {
  let q = '', month = 'all', showRev = params.reversed === '1';
  const months = [...new Set(FAMI.payments.map((p) => p.month))].sort().reverse();
  const filterList = () => FAMI.payments
    .filter((p) => (!p.reversed || showRev) && (month === 'all' || p.month === month) &&
      (!q || [shopName(p.shop_id), tenantOf(p.shop_id), p.reference, p.note].join(' ').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const wrap = el('div', {});

  const renderList = () => {
    const list = filterList();
    wrap.replaceChildren(list.length ? el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Shop'), el('th', {}, 'Month'), el('th', { class: 'right' }, 'Amount'), el('th', {}, 'Method'), el('th', {}, 'Reference'), el('th', {}, 'Status'), el('th', { class: 'right' }, 'Actions'))),
      el('tbody', {}, list.map((p) => el('tr', {},
        el('td', {}, fmtDate(p.date)),
        el('td', {}, el('b', {}, esc(shopName(p.shop_id)))),
        el('td', {}, monthLabel(p.month)),
        el('td', { class: 'right mono' }, fmtMoney(p.amount)),
        el('td', {}, badge(p.method, 'gray')),
        el('td', {}, esc(p.reference || '—')),
        el('td', {}, p.reversed ? badge('Reversed', 'red') : badge('Posted', 'green', true)),
        el('td', { class: 'rowActs' }, !p.reversed && can('payments') ? el('button', { class: 'btn sm2', onclick: () => reverseFlow(p) }, 'Reverse') : null)
      )))
    )) : emptyState('No payments found', 'Adjust your filters or record a new payment.', 'card'));
  };

  const root = el('div', { class: 'panel' },
    el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Payment history'), el('p', {}, 'Posted and reversed transactions.'))),
    el('div', { class: 'toolbar', style: { marginTop: 0 } },
      el('div', { class: 'filters' },
        el('div', { class: 'search' }, el('span', { html: iconSvg('search', 16) }), el('input', { placeholder: 'Search shop, tenant, reference...', oninput: (e) => { q = e.target.value; renderList(); } })),
        el('select', { onchange: (e) => { month = e.target.value; renderList(); } }, el('option', { value: 'all' }, 'All months'), months.map((m) => el('option', { value: m }, monthLabel(m)))),
        el('label', { class: 'pill', style: { padding: '6px 10px' } }, el('input', { type: 'checkbox', checked: showRev, onchange: (e) => { showRev = e.target.checked; renderList(); } }), 'Show reversed')
      ),
      el('button', { class: 'btn small', onclick: () => exportPayments(filterList()) }, el('span', { class: 'ic', html: iconSvg('download', 14) }), 'Export CSV')
    ),
    wrap
  );
  renderList();
  return root;
}

const shopName = (id) => { const s = FAMI.shops.find((x) => x.id === id); return s ? s.name : '—'; };
const tenantOf = (id) => { const s = FAMI.shops.find((x) => x.id === id); return s ? s.tenant_name : ''; };

function reverseFlow(p) {
  const s = FAMI.shops.find((x) => x.id === p.shop_id);
  confirmDialog({
    title: 'Reverse payment?',
    message: `Reverse ${fmtMoney(p.amount)} from ${s ? s.name : 'shop'} for ${monthLabel(p.month)}? The transaction stays in the audit trail.`,
    confirmText: 'Reverse payment', danger: true,
    onConfirm: async () => {
      try { await api.reversePayment(p.id); toast('Payment reversed'); await FAMI._refresh(); }
      catch (e) { toast(e.message || 'Could not reverse payment', 'error'); }
    }
  });
}

function exportPayments(list) {
  downloadCSV(`fami-payments-${today()}.csv`, [
    ['Date', 'Shop', 'Tenant', 'Month', 'Amount', 'Method', 'Reference', 'Note', 'Status'],
    ...list.map((p) => [p.date, shopName(p.shop_id), tenantOf(p.shop_id), p.month, p.amount, p.method, p.reference, p.note, p.reversed ? 'reversed' : 'posted'])
  ]);
}
