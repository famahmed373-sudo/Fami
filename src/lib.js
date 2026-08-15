// ============ FAMI shared UI helpers ============

// ---- tiny DOM builder ----
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  let pendingValue;
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'value') pendingValue = v; // set as property after children (selects need this)
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'readonly') {
      if (v === true || v === '') node.setAttribute(k, '');
    }
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  append(node, children);
  if (pendingValue !== undefined) node.value = pendingValue;
  return node;
}
export function append(node, children) {
  for (const c of [].concat(children).filter(Boolean)) {
    if (Array.isArray(c)) append(node, c);
    else node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
}

// ---- escaping ----
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- money / numbers ----
const nf = (max = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max });
export const fmtNum = (n) => nf(2).format(Number(n || 0));
export const curSymbol = () => (FAMI.prefs.currency === 'USD' ? '$' : 'ETB');
export function fmtMoney(n) {
  const c = curSymbol();
  return c === 'ETB' ? `${nf(2).format(Number(n || 0))} ETB` : `$${nf(2).format(Number(n || 0))}`;
}
export const pct = (part, whole) => (whole ? Math.round((Number(part) / Number(whole)) * 100) : 0);

// ---- dates ----
export const today = () => new Date().toISOString().slice(0, 10);
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function monthShift(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(m) {
  if (!m) return '';
  try { return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  catch { return m; }
}
export const shortMonth = (m) => (m ? m.slice(5) + '/' + m.slice(0, 4) : '');
export function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}
export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso.slice(0, 10));
}

// ---- toast ----
export function toast(msg, type = 'success', duration = 3200) {
  let wrap = document.querySelector('.toastWrap');
  if (!wrap) { wrap = el('div', { class: 'toastWrap' }); document.body.appendChild(wrap); }
  const icon = type === 'error' ? iconSvg('alert') : type === 'info' ? iconSvg('info') : iconSvg('check');
  const t = el('div', { class: `toast ${type}` }, el('div', { class: 'ic', html: icon }), el('div', { html: esc(msg) }));
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 260); }, duration);
}

// ---- modal ----
let modalBack = null;
export function openModal({ title, sub, body, wide = false }) {
  if (!modalBack) {
    modalBack = el('div', { class: 'modalBack' }, el('div', { class: 'modal' }));
    modalBack.addEventListener('click', (e) => { if (e.target === modalBack) closeModal(); });
    document.body.appendChild(modalBack);
  }
  const m = modalBack.querySelector('.modal');
  m.className = 'modal' + (wide ? ' wide' : '');
  const head = el('div', { class: 'modalHead' },
    el('div', {}, el('h3', { html: esc(title) }), sub ? el('p', { html: esc(sub) }) : null),
    el('button', { class: 'x', onclick: closeModal, 'aria-label': 'Close' }, '×')
  );
  m.innerHTML = '';
  append(m, [head, body]);
  modalBack.classList.add('open');
  document.body.style.overflow = 'hidden';
}
export function closeModal() {
  if (!modalBack) return;
  modalBack.classList.remove('open');
  document.body.style.overflow = '';
}
export function confirmDialog({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false, onConfirm }) {
  const body = el('div', {},
    el('p', { class: 'muted', style: { margin: '0 0 6px' } }, message),
    el('div', { class: 'formActions', style: { marginTop: 22 } },
      el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
      el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: async () => { closeModal(); await onConfirm(); } }, confirmText)
    )
  );
  openModal({ title, body, onClose: null });
}

// ---- badges ----
export function badge(text, color = 'gray', dot = false) {
  return el('span', { class: `badge ${color}` }, dot ? el('span', { class: 'dot' }) : null, text);
}

// ---- empty / skeleton ----
export function emptyState(title, sub, iconName = 'inbox') {
  return el('div', { class: 'empty' },
    el('div', { class: 'ic', html: iconSvg(iconName, 22) }),
    el('b', {}, title),
    el('p', {}, sub)
  );
}
export function skeleton(rows = 5, cols = 4) {
  const body = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(el('div', { class: 'skeleton', style: { height: 14, width: `${60 + ((c * 13 + r * 7) % 35)}%` } }));
    body.push(el('div', { style: { display: 'flex', gap: 16, padding: '12px 4px' } }, row));
  }
  return el('div', {}, body);
}

// ---- CSV ----
export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---- icons ----
const ICONS = {
  dashboard: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  shop: '<path d="M3 10l1-7h16l1 7a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M9 21v-6h6v6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 7h8M8 11h8M8 15h5"/>',
  piggy: '<path d="M19 11a5 5 0 0 0-9.5-2H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1.5l1.5 3h3v-3h1.5L17 17a4 4 0 0 0 2-3.5V11zM16 6V4M7.5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  arrow: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  building: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  wallet: '<path d="M20 7H4a2 2 0 0 1 0-4h13v4M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M21 11h-5a2 2 0 0 0 0 4h5z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
};
export function iconSvg(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.inbox}</svg>`;
}

// ---- preferences (localStorage) ----
const PREFS_KEY = 'fami_prefs_v1';
export const defaultPrefs = {
  currency: 'ETB',
  notifyRent: true,
  notifyBudget: true,
  notifySavings: true,
  remindDays: 3
};
export function loadPrefs() {
  try { return Object.assign({}, defaultPrefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
  catch { return { ...defaultPrefs }; }
}
export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  FAMI.prefs = prefs;
}

// ---- global app reference (set by app.js) ----
export const uid = () => (FAMI.user ? FAMI.user.id : null);
export const isDemo = () => FAMI.mode === 'demo';
export const can = (perm) => {
  const role = FAMI.user && FAMI.user.role;
  if (!role) return false;
  if (perm === 'edit') return role !== 'viewer';
  if (perm === 'payments') return role === 'admin' || role === 'manager' || role === 'payment_officer';
  if (perm === 'users') return role === 'admin';
  return true;
};
