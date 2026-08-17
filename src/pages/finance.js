// ============ FAMI finance pages: expenses, savings, reports ============
import * as api from '../supabase.js';
import {
  el, esc, fmtMoney, fmtNum, fmtDate, pct, today, monthKey, monthLabel, monthShift,
  toast, badge, emptyState, confirmDialog, downloadCSV, iconSvg, openModal, closeModal, can
} from '../lib.js';

const CATEGORIES = ['Utilities', 'Maintenance', 'Tax', 'Staff', 'Insurance', 'Repairs', 'Marketing', 'Other'];
const CAT_COLORS = { Utilities: 'amber', Maintenance: 'blue', Tax: 'red', Staff: 'purple', Insurance: 'green', Repairs: 'amber', Marketing: 'blue', Other: 'gray' };

// ================= EXPENSES =================
export function renderExpenses(ctx) {
  const status = api.budgetStatus();
  const root = el('div', {},
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, `${monthLabel(monthKey())} budgets`), el('p', {}, 'Monthly spending limits per category. Exceeding a budget raises an alarm.'))),
      status.length ? el('div', { class: 'barList' }, status.map((b) => budgetRow(b))) : el('p', { class: 'muted', style: { margin: 0 } }, 'No budgets set for this month. Set one below to track spending.')
    ),
    can('edit') ? el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Record expense'), el('p', {}, 'Track utilities, maintenance, taxes and other building costs.'))),
      expenseForm()
    ) : null,
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' },
        el('div', {}, el('h2', {}, 'Expense register'), el('p', {}, 'All recorded expenses, newest first.'))),
      registerPanel(ctx)
    )
  );
  return root;
}

function registerPanel(ctx) {
  let q = '', cat = 'all';
  const wrap = el('div', {});
  const filterList = () => FAMI.expenses
    .filter((e) => (cat === 'all' || e.category === cat) && (!q || [e.category, e.description, shopName(e.shop_id)].join(' ').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const renderList = () => {
    const list = filterList();
    wrap.replaceChildren(list.length ? el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Category'), el('th', {}, 'Shop'), el('th', {}, 'Description'), el('th', { class: 'right' }, 'Amount'), el('th', { class: 'right' }, 'Actions'))),
      el('tbody', {}, list.map((e) => el('tr', {},
        el('td', {}, fmtDate(e.date)),
        el('td', {}, badge(e.category, CAT_COLORS[e.category] || 'gray')),
        el('td', {}, e.shop_id ? esc(shopName(e.shop_id)) : el('span', { class: 'muted' }, '—')),
        el('td', {}, esc(e.description || '—')),
        el('td', { class: 'right mono' }, fmtMoney(e.amount)),
        el('td', { class: 'rowActs' },
          can('edit') ? el('button', { class: 'btn sm2', onclick: () => expenseModal(ctx, e) }, 'Edit') : null,
          can('edit') ? el('button', { class: 'btn sm2 danger', onclick: () => deleteExpenseFlow(ctx, e) }, el('span', { class: 'ic', html: iconSvg('trash', 13) })) : null
        )
      )))
    )) : emptyState('No expenses recorded', 'Add your first expense to start tracking building costs.', 'receipt'));
  };
  const root = el('div', {},
    el('div', { class: 'toolbar', style: { marginTop: 0 } },
      el('div', { class: 'filters' },
        el('div', { class: 'search' }, el('span', { html: iconSvg('search', 16) }), el('input', { placeholder: 'Search category, description...', oninput: (e) => { q = e.target.value; renderList(); } })),
        el('select', { onchange: (e) => { cat = e.target.value; renderList(); } }, el('option', { value: 'all' }, 'All categories'), CATEGORIES.map((c) => el('option', { value: c }, c)))
      ),
      el('button', { class: 'btn small', onclick: () => exportExpenses(filterList()) }, el('span', { class: 'ic', html: iconSvg('download', 14) }), 'Export CSV')
    ),
    wrap
  );
  renderList();
  return root;
}

function budgetRow(b) {
  const input = el('input', { type: 'number', min: 0, step: 1, value: b.amount, style: { width: 110 } });
  const save = async () => {
    try { await api.setBudget(b.category, b.month, input.value); toast(`Budget for ${b.category} updated`); await FAMI._refresh(); }
    catch (e) { toast(e.message || 'Could not save budget', 'error'); }
  };
  return el('div', { class: 'barRow' },
    el('div', { class: 'barLab' },
      el('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, badge(b.category, CAT_COLORS[b.category] || 'gray'), el('b', {}, `${pct(b.spent, b.amount)}% used`)),
      el('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        el('span', { class: 'muted' }, `${fmtMoney(b.spent)} of ${fmtMoney(b.amount)}`),
        b.over > 0 ? badge(`Over by ${fmtMoney(b.over)}`, 'red') : null,
        input,
        el('button', { class: 'btn sm2', onclick: save }, 'Save')
      )
    ),
    el('div', { class: 'progress' + (b.over > 0 ? ' amber' : ' green') }, el('i', { style: { width: `${Math.min(100, pct(b.spent, b.amount))}%` } }))
  );
}

function expenseForm() {
  const cat = el('select', {}, CATEGORIES.map((c) => el('option', { value: c }, c)));
  const amount = el('input', { type: 'number', min: 0.01, step: 0.01, placeholder: '0.00' });
  const date = el('input', { type: 'date', value: today() });
  const shop = el('select', {}, el('option', { value: '' }, '— General —'), FAMI.shops.map((s) => el('option', { value: s.id }, `${s.name}${s.unit ? ' (' + s.unit + ')' : ''}`)));
  const desc = el('input', { placeholder: 'e.g. Electricity bill' });

  const submit = async () => {
    if (!(Number(amount.value) > 0)) return toast('Enter a valid amount', 'error');
    try {
      await api.saveExpense({ category: cat.value, amount: amount.value, date: date.value, shop_id: shop.value || null, description: desc.value });
      toast('Expense recorded');
      amount.value = ''; desc.value = '';
      await FAMI._refresh();
    } catch (e) { toast(e.message || 'Could not save expense', 'error'); }
  };

  return el('div', { class: 'formGrid' },
    el('div', { class: 'field' }, el('label', {}, 'Category <span class="req">*</span>'), cat),
    el('div', { class: 'field' }, el('label', {}, 'Amount (ETB) <span class="req">*</span>'), amount),
    el('div', { class: 'field' }, el('label', {}, 'Date'), date),
    el('div', { class: 'field' }, el('label', {}, 'Shop (optional)'), shop),
    el('div', { class: 'field full' }, el('label', {}, 'Description'), desc),
    el('div', { class: 'formActions full' }, el('button', { class: 'btn primary', onclick: submit }, el('span', { class: 'ic', html: iconSvg('plus', 15) }), 'Record expense'))
  );
}

function expenseModal(ctx, expense) {
  const cat = el('select', {}, CATEGORIES.map((c) => el('option', { value: c, selected: expense.category === c }, c)));
  const amount = el('input', { type: 'number', min: 0.01, step: 0.01, value: expense.amount });
  const date = el('input', { type: 'date', value: expense.date });
  const shop = el('select', {}, el('option', { value: '' }, '— General —'), FAMI.shops.map((s) => el('option', { value: s.id, selected: expense.shop_id === s.id }, s.name)));
  const desc = el('input', { value: expense.description || '' });

  const save = async () => {
    if (!(Number(amount.value) > 0)) return toast('Enter a valid amount', 'error');
    try {
      await api.saveExpense({ id: expense.id, category: cat.value, amount: amount.value, date: date.value, shop_id: shop.value || null, description: desc.value });
      closeModal(); toast('Expense updated'); await ctx.refresh();
    } catch (e) { toast(e.message || 'Could not save expense', 'error'); }
  };

  openModal({
    title: 'Edit expense', sub: 'Update the details of this expense record.',
    body: el('div', { class: 'formGrid' },
      el('div', { class: 'field' }, el('label', {}, 'Category'), cat),
      el('div', { class: 'field' }, el('label', {}, 'Amount (ETB)'), amount),
      el('div', { class: 'field' }, el('label', {}, 'Date'), date),
      el('div', { class: 'field' }, el('label', {}, 'Shop'), shop),
      el('div', { class: 'field full' }, el('label', {}, 'Description'), desc),
      el('div', { class: 'formActions full' }, el('button', { class: 'btn', onclick: closeModal }, 'Cancel'), el('button', { class: 'btn primary', onclick: save }, 'Save changes'))
    )
  });
}

function deleteExpenseFlow(ctx, expense) {
  confirmDialog({
    title: 'Delete expense?', message: `Delete the ${fmtMoney(expense.amount)} ${expense.category} expense${expense.description ? ' — ' + expense.description : ''}?`, confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await api.deleteExpense(expense.id); toast('Expense deleted'); await ctx.refresh(); }
      catch (e) { toast(e.message || 'Could not delete expense', 'error'); }
    }
  });
}

function exportExpenses(list) {
  downloadCSV(`fami-expenses-${today()}.csv`, [
    ['Date', 'Category', 'Shop', 'Description', 'Amount'],
    ...list.map((e) => [e.date, e.category, e.shop_id ? shopName(e.shop_id) : '', e.description, e.amount])
  ]);
}

// ================= SAVINGS =================
export function renderSavings(ctx) {
  const open = FAMI.goals.filter((g) => !g.closed);
  const total = open.reduce((s, g) => s + Number(g.saved_amount || 0), 0);
  const target = open.reduce((s, g) => s + Number(g.target_amount || 0), 0);
  const closed = FAMI.goals.filter((g) => g.closed);

  const root = el('div', {},
    el('div', { class: 'cards' },
      statMini('Total saved', fmtMoney(total), 'across open goals', 'piggy', 'green'),
      statMini('Active goals', String(open.length), `${closed.length} completed`, 'target', 'blue'),
      statMini('Combined target', fmtMoney(target), 'to reach', 'wallet', 'purple'),
      statMini('Overall progress', `${pct(total, target)}%`, `${fmtMoney(total)} of ${fmtMoney(target)}`, 'chart', 'amber')
    ),
    can('edit') ? el('div', { style: { marginBottom: 18 } }, el('button', { class: 'btn primary', onclick: () => goalModal(ctx, null) }, el('span', { class: 'ic', html: iconSvg('plus', 15) }), 'New savings goal')) : null,
    open.length ? el('div', { class: 'shopGrid', style: { marginBottom: 22 } }, open.map((g) => goalCard(g, ctx))) : el('div', { style: { marginBottom: 22 } }, emptyState('No savings goals', 'Create a goal to start setting money aside for big projects.', 'piggy')),
    closed.length ? el('div', {},
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Completed goals'), el('p', {}, 'Goals you have reached.'))),
      el('div', { class: 'shopGrid' }, closed.map((g) => goalCard(g, ctx)))
    ) : null
  );
  return root;
}

const statMini = (label, big, sub, icon, color) => {
  const colors = { green: ['rgba(52,211,153,.16)', '#34d399'], blue: ['rgba(96,165,250,.16)', '#60a5fa'], purple: ['rgba(167,139,250,.16)', '#a78bfa'], amber: ['rgba(251,191,36,.16)', '#fbbf24'] };
  const [bg, fg] = colors[color] || colors.blue;
  return el('div', { class: 'panel stat' },
    el('div', { class: 'statTop' }, el('label', {}, label), el('div', { class: 'statIcon', style: { background: bg, color: fg }, html: iconSvg(icon, 18) })),
    el('div', { class: 'num' }, big),
    el('div', { class: 'sub' }, sub)
  );
};

function goalCard(g, ctx) {
  const prog = pct(g.saved_amount, g.target_amount);
  const reached = !g.closed && Number(g.saved_amount) >= Number(g.target_amount);
  return el('div', { class: 'panel goalCard' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
      el('h3', {}, el('span', { html: iconSvg('piggy', 16), style: { color: '#a78bfa' } }), esc(g.name)),
      g.closed ? badge('Completed', 'green') : reached ? badge('Reached', 'green') : badge('In progress', 'blue')
    ),
    el('div', { class: 'nums' }, el('span', {}, 'Saved'), el('b', {}, fmtMoney(g.saved_amount)), el('span', {}, 'of'), el('b', {}, fmtMoney(g.target_amount))),
    el('div', { class: 'progress' + (reached || g.closed ? ' green' : prog > 80 ? ' amber' : '') }, el('i', { style: { width: `${Math.min(100, prog)}%` } })),
    el('div', { class: 'muted', style: { fontSize: 12 } }, g.target_date ? `Target date: ${fmtDate(g.target_date)}` : 'No target date'),
    el('div', { class: 'foot', style: { borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      el('div', {}, `${Math.round(prog)}% complete`),
      el('div', { style: { display: 'flex', gap: 6 } },
        !g.closed && can('edit') ? el('button', { class: 'btn sm2 primary', onclick: () => depositModal(ctx, g) }, 'Deposit') : null,
        !g.closed && reached && can('edit') ? el('button', { class: 'btn sm2 success', onclick: () => closeGoalFlow(ctx, g) }, 'Mark done') : null,
        can('edit') ? el('button', { class: 'btn sm2 danger', onclick: () => deleteGoalFlow(ctx, g) }, el('span', { class: 'ic', html: iconSvg('trash', 13) })) : null
      )
    )
  );
}

function goalModal(ctx, goal) {
  const name = el('input', { placeholder: 'e.g. Building renovation fund' });
  const target = el('input', { type: 'number', min: 0, step: 1, placeholder: '0.00' });
  const tdate = el('input', { type: 'date' });
  const save = async () => {
    if (!name.value.trim()) return toast('Goal name is required', 'error');
    if (!(Number(target.value) > 0)) return toast('Enter a target amount', 'error');
    try {
      await api.addGoal({ name: name.value, target_amount: target.value, target_date: tdate.value || null });
      closeModal(); toast('Savings goal created'); await ctx.refresh();
    } catch (e) { toast(e.message || 'Could not create goal', 'error'); }
  };
  openModal({
    title: 'New savings goal', sub: 'Define what you are saving for.',
    body: el('div', { class: 'formGrid' },
      el('div', { class: 'field full' }, el('label', {}, 'Goal name <span class="req">*</span>'), name),
      el('div', { class: 'field' }, el('label', {}, 'Target amount (ETB) <span class="req">*</span>'), target),
      el('div', { class: 'field' }, el('label', {}, 'Target date (optional)'), tdate),
      el('div', { class: 'formActions full' }, el('button', { class: 'btn', onclick: closeModal }, 'Cancel'), el('button', { class: 'btn primary', onclick: save }, 'Create goal'))
    )
  });
}

function depositModal(ctx, g) {
  const amount = el('input', { type: 'number', min: 0.01, step: 0.01, placeholder: '0.00' });
  const date = el('input', { type: 'date', value: today() });
  const note = el('input', { placeholder: 'Optional note' });
  const save = async () => {
    if (!(Number(amount.value) > 0)) return toast('Enter a valid amount', 'error');
    try {
      await api.addDeposit(g.id, amount.value, date.value, note.value);
      closeModal(); toast('Deposit recorded'); await ctx.refresh();
    } catch (e) { toast(e.message || 'Could not record deposit', 'error'); }
  };
  openModal({
    title: `Deposit to "${g.name}"`, sub: `Current balance: ${fmtMoney(g.saved_amount)} of ${fmtMoney(g.target_amount)}.`,
    body: el('div', { class: 'formGrid' },
      el('div', { class: 'field' }, el('label', {}, 'Amount (ETB) <span class="req">*</span>'), amount),
      el('div', { class: 'field' }, el('label', {}, 'Date'), date),
      el('div', { class: 'field full' }, el('label', {}, 'Note'), note),
      el('div', { class: 'formActions full' }, el('button', { class: 'btn', onclick: closeModal }, 'Cancel'), el('button', { class: 'btn primary', onclick: save }, 'Record deposit'))
    )
  });
}

function closeGoalFlow(ctx, g) {
  confirmDialog({
    title: 'Mark goal complete?', message: `"${g.name}" has reached its target. Mark it as completed?`, confirmText: 'Complete goal',
    onConfirm: async () => {
      try { await api.closeGoal(g.id); toast('Goal completed 🎉'); await ctx.refresh(); }
      catch (e) { toast(e.message || 'Could not update goal', 'error'); }
    }
  });
}
function deleteGoalFlow(ctx, g) {
  confirmDialog({
    title: 'Delete goal?', message: `"${g.name}" and its deposit history will be permanently removed.`, confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await api.deleteGoal(g.id); toast('Goal deleted'); await ctx.refresh(); }
      catch (e) { toast(e.message || 'Could not delete goal', 'error'); }
    }
  });
}

// ================= REPORTS =================
export function renderReports(ctx) {
  const years = [...new Set([
    ...FAMI.payments.map((p) => p.month.slice(0, 4)),
    ...FAMI.expenses.map((e) => String(e.date || '').slice(0, 4)),
    monthKey().slice(0, 4)
  ])].sort().reverse();
  const year = (ctx.params && ctx.params.year) || years[0] || monthKey().slice(0, 4);

  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    if (m > monthKey()) continue;
    const expected = FAMI.shops.filter((s) => s.status === 'active' && s.registered_month <= m).reduce((s, x) => s + Number(x.rent_amount || 0), 0);
    const collected = FAMI.payments.filter((p) => !p.reversed && p.month === m).reduce((s, p) => s + Number(p.amount || 0), 0);
    const exp = FAMI.expenses.filter((e) => String(e.date || '').slice(0, 7) === m).reduce((s, e) => s + Number(e.amount || 0), 0);
    const saved = FAMI.deposits.filter((d) => String(d.date || '').slice(0, 7) === m).reduce((s, d) => s + Number(d.amount || 0), 0);
    months.push({ m, expected, collected, rate: expected ? collected / expected : 0, exp, saved, net: collected - exp });
  }
  const tot = months.reduce((s, x) => ({ expected: s.expected + x.expected, collected: s.collected + x.collected, exp: s.exp + x.exp, saved: s.saved + x.saved }), { expected: 0, collected: 0, exp: 0, saved: 0 });
  const byCat = {};
  FAMI.expenses.filter((e) => String(e.date || '').slice(0, 4) === year).forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0); });
  const catMax = Math.max(1, ...Object.values(byCat));

  const root = el('div', {},
    el('div', { class: 'toolbar' },
      el('h2', { style: { margin: 0, fontSize: 18 } }, `${year} performance`),
      el('select', { value: year, onchange: (e) => reNav('reports', { year: e.target.value }) }, years.map((y) => el('option', { value: y }, y)))
    ),
    el('div', { class: 'kpis' },
      statMini('Rent expected', fmtMoney(tot.expected), `over ${months.length} month(s)`, 'wallet', 'purple'),
      statMini('Rent collected', fmtMoney(tot.collected), `${pct(tot.collected, tot.expected)}% collection rate`, 'check', 'green'),
      statMini('Expenses', fmtMoney(tot.exp), 'all categories', 'receipt', 'amber'),
      statMini('Net position', fmtMoney(tot.collected - tot.exp), 'collected minus expenses', 'chart', tot.collected - tot.exp >= 0 ? 'green' : 'red')
    ),
    el('div', { class: 'grid2' },
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Monthly summary'), el('p', {}, 'Rent collection vs. expenses by month.'))),
        months.length ? el('div', { class: 'tableWrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Month'), el('th', { class: 'right' }, 'Expected'), el('th', { class: 'right' }, 'Collected'), el('th', {}, 'Rate'), el('th', { class: 'right' }, 'Expenses'), el('th', { class: 'right' }, 'Saved'), el('th', { class: 'right' }, 'Net'))),
          el('tbody', {}, months.map((x) => el('tr', {},
            el('td', {}, monthLabel(x.m)),
            el('td', { class: 'right mono' }, fmtMoney(x.expected)),
            el('td', { class: 'right mono' }, fmtMoney(x.collected)),
            el('td', {}, el('div', { class: 'progress', style: { width: 90 } }, el('i', { style: { width: `${Math.round(x.rate * 100)}%`, background: x.rate >= 0.9 ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#d97706,#fbbf24)' } })), el('div', { style: { fontSize: 11, marginTop: 3, color: 'var(--muted)' } }, `${Math.round(x.rate * 100)}%`)),
            el('td', { class: 'right mono' }, fmtMoney(x.exp)),
            el('td', { class: 'right mono' }, fmtMoney(x.saved)),
            el('td', { class: 'right mono', style: { color: x.net >= 0 ? '#34d399' : '#f87171', fontWeight: 800 } }, fmtMoney(x.net))
          )))
        )) : emptyState('No data for this year', 'Pick a year with activity.', 'chart')
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Expenses by category'), el('p', {}, `${year} spending breakdown`))),
        Object.keys(byCat).length ? el('div', { class: 'barList' }, Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
          el('div', { class: 'barRow' },
            el('div', { class: 'barLab' }, el('b', {}, badge(c, CAT_COLORS[c] || 'gray')), el('span', {}, fmtMoney(v))),
            el('div', { class: 'progress amber' }, el('i', { style: { width: `${Math.round((v / catMax) * 100)}%` } }))
          )
        )) : emptyState('No expenses in this year', 'Record expenses to see the breakdown.', 'chart')
      )
    ),
    el('div', { class: 'panel' },
      el('div', { class: 'panelHead' }, el('div', {}, el('h2', {}, 'Export'), el('p', {}, 'Download the yearly summary as CSV.'))),
      el('button', { class: 'btn', onclick: () => downloadCSV(`fami-report-${year}.csv`, [
        ['Month', 'Expected', 'Collected', 'Collection rate %', 'Expenses', 'Saved', 'Net'],
        ...months.map((x) => [monthLabel(x.m), x.expected, x.collected, Math.round(x.rate * 100), x.exp, x.saved, x.net])
      ]) }, el('span', { class: 'ic', html: iconSvg('download', 15) }), `Download ${year} report`)
    )
  );
  return root;
}

const reNav = (route, params) => { window.location.hash = '#' + route + (Object.keys(params).filter((k) => params[k]).length ? '?' + new URLSearchParams(params).toString() : ''); };
const shopName = (id) => { const s = FAMI.shops.find((x) => x.id === id); return s ? s.name : '—'; };
