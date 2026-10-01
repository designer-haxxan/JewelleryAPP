// POS — New Bill for wholesale jewellery.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, uuid, round2, num, debounce, today, nowISO, AppError } from '../core/utils.js';
import { storageKey } from '../config.js';
import { getSettings as cfg } from '../core/settings.js';
import * as Catalog from '../services/catalog.js';
import * as Printer from '../printer/printer.js';
import * as Scanner from '../scanner/scanner.js';

const $ = window.jQuery;
const DRAFT_KEY = () => storageKey('pos.draft');
const cur = () => cfg().currency;

let st;     // current bill state
let $root;  // container element
let detachWedge = null;

// ── State helpers ────────────────────────────────────────────────────────────
function fresh() {
  return {
    id: uuid(), date: today(),
    customerId: null, customerName: '', customerPhone: '',
    lines: [], discount: 0, paid: 0, paymentNote: 'Cash', note: '',
  };
}
function saveDraft() { localStorage.setItem(DRAFT_KEY(), JSON.stringify(st)); }
function clearDraft() { localStorage.removeItem(DRAFT_KEY()); }

function totals() {
  const subtotal = round2(st.lines.reduce((s, l) => s + l.amount, 0));
  const discount = Math.min(round2(num(st.discount)), subtotal);
  const total    = round2(subtotal - discount);
  const paid     = round2(num(st.paid));
  const balance  = round2(total - paid);
  return { subtotal, discount, total, paid, balance };
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!$root) return;
  renderLines();
  renderFooter();
  renderMeta();
}

function renderMeta() {
  const name = st.customerName || '';
  $root.find('.btn-cust')
    .toggleClass('has-cust', !!st.customerId)
    .html(name
      ? `<i class="bi bi-person-check-fill me-1 text-warning"></i>${esc(name)}`
      : `<i class="bi bi-person-plus me-1"></i>Select Customer (Optional)`);
}

function renderLines() {
  const $lines = $root.find('.pos-lines');
  if (!st.lines.length) {
    $lines.html(`<div class="empty-cart"><i class="bi bi-bag-x d-block mb-2"></i><div class="fw-semibold">Cart is empty</div><div class="small text-body-secondary mt-1">Search items above to add them</div></div>`);
    return;
  }
  $lines.html(st.lines.map((l, i) => `
    <div class="cart-line" data-i="${i}">
      <div class="cl-info">
        <div class="cl-name">${esc(l.name)}</div>
        <div class="cl-meta">
          <div class="qty-ctl d-inline-flex">
            <button class="btn-qty" data-d="-1">−</button>
            <input type="number" class="qty-in" value="${l.qty}" min="0.001" step="1">
            <button class="btn-qty" data-d="1">+</button>
          </div>
          <span class="unit-badge" title="Tap to toggle pc/dz">${esc(l.unit)}</span>
          &nbsp;@ <input type="number" class="rate-in" value="${l.rate}" min="0" step="1" style="width:72px;border:1px solid var(--bs-border-color);border-radius:6px;padding:2px 6px;background:var(--bs-body-bg);color:var(--bs-body-color);font-weight:600;text-align:right">
        </div>
      </div>
      <div class="cl-amt money">${cur()} ${fmtNum(l.amount)}</div>
      <button class="btn-rm" title="Remove"><i class="bi bi-x-lg"></i></button>
    </div>`).join(''));
}

function renderFooter() {
  const t = totals();
  $root.find('.pos-totals').html(`
    <div class="tot-row"><span class="text-body-secondary">Subtotal</span><span class="money">${cur()} ${fmtNum(t.subtotal)}</span></div>
    <div class="tot-row">
      <span class="text-body-secondary">Discount</span>
      <input type="number" id="disc-in" value="${st.discount || ''}" min="0" step="1" placeholder="0" style="width:90px;text-align:right;border:1px solid var(--bs-border-color);border-radius:6px;padding:2px 8px;background:var(--bs-body-bg);color:var(--bs-body-color);font-weight:600">
    </div>
    <div class="tot-row row-total">
      <span>TOTAL</span>
      <span class="money">${cur()} ${fmtNum(t.total)}</span>
    </div>
    <hr class="my-1">
    <div class="tot-row">
      <span class="text-body-secondary">Paid</span>
      <input type="number" id="paid-in" value="${st.paid || ''}" min="0" step="1" placeholder="0" style="width:100px;text-align:right;border:1px solid var(--bs-border-color);border-radius:6px;padding:2px 8px;background:var(--bs-body-bg);color:var(--bs-body-color);font-weight:700">
    </div>
    ${t.balance > 0.005 ? `<div class="tot-row row-bal"><span>Balance Due</span><span class="money">${cur()} ${fmtNum(t.balance)}</span></div>` : ''}
    ${t.balance < -0.005 ? `<div class="tot-row"><span class="text-body-secondary">Change</span><span class="money text-success">${cur()} ${fmtNum(-t.balance)}</span></div>` : ''}
  `);
  $root.find('#disc-in').val(st.discount || '');
  $root.find('#paid-in').val(st.paid || '');
}

// ── Product search ────────────────────────────────────────────────────────────
function showResults(products) {
  const $res = $root.find('.search-results');
  if (!products.length) { $res.addClass('d-none'); return; }
  $res.removeClass('d-none').html(products.map((p, i) => `
    <div class="search-result-item" tabindex="0" data-i="${i}">
      <div class="flex-grow-1">
        <div class="sri-name">${esc(p.name)}</div>
        <div class="sri-sub">${p.sku ? 'SKU: ' + esc(p.sku) + ' &nbsp;·&nbsp; ' : ''}${esc(Catalog.category(p.categoryId)?.name || '')}</div>
      </div>
      <div class="sri-price">
        ${p.priceDz ? `<div>${cur()} ${fmtNum(p.priceDz)}<span class="text-body-secondary">/dz</span></div>` : ''}
        <div>${cur()} ${fmtNum(p.pricePc)}<span class="text-body-secondary">/pc</span></div>
      </div>
    </div>`).join(''));
  // store for keyboard access
  $res.data('items', products);
}

function hideResults() {
  $root.find('.search-results').addClass('d-none').html('');
  $root.find('.pos-search input[type=search]').val('');
}

// ── Add item dialog ────────────────────────────────────────────────────────────
async function openAddItem(p) {
  hideResults();
  const hasDz = p && p.priceDz > 0;
  const defUnit = hasDz ? 'dz' : 'pc';
  const defRate = hasDz ? p.priceDz : (p?.pricePc || 0);

  const result = await UI.formModal({
    title: p ? p.name : 'Custom Item',
    body: `
      <div class="row g-2">
        ${!p ? `<div class="col-12"><label class="form-label">Item Name *</label><input name="name" class="form-control" required placeholder="e.g. Earrings Style A"></div>` : ''}
        <div class="col-6">
          <label class="form-label">Unit</label>
          <select name="unit" class="form-select">
            <option value="pc" ${defUnit === 'pc' ? 'selected' : ''}>Pieces (pc)</option>
            <option value="dz" ${defUnit === 'dz' ? 'selected' : ''}>Dozen (dz)</option>
            <option value="set">Set</option>
            <option value="kg">Kg</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label">Qty *</label>
          <input name="qty" type="number" class="form-control" value="1" min="0.001" step="1" required>
        </div>
        <div class="col-12">
          <label class="form-label">Rate (${cur()}) *</label>
          <input name="rate" type="number" class="form-control" value="${defRate || ''}" min="0" step="1" required placeholder="0">
        </div>
      </div>`,
    submitLabel: 'Add to Bill',
    onSubmit(vals) {
      const name = p ? p.name : (vals.name || '').trim();
      if (!name) throw new AppError('Item name is required.');
      const qty  = num(vals.qty);
      const rate = num(vals.rate);
      if (qty <= 0)  throw new AppError('Qty must be greater than 0.');
      if (rate <= 0) throw new AppError('Rate must be greater than 0.');
      const amount = round2(qty * rate);
      st.lines.push({ id: uuid(), productId: p?.id || null, name, qty, unit: vals.unit, rate, amount });
      saveDraft();
      render();
      UI.beep();
      return true;
    },
  });
  return result;
}

// ── Save bill ─────────────────────────────────────────────────────────────────
async function saveBill(doPrint) {
  const t = totals();
  if (!st.lines.length) { UI.toast('Add at least one item.', 'warning'); return; }

  const { subtotal, discount, total, paid, balance } = t;

  // Get next bill number
  const meta = await idb.get('meta', 'nextBillNo');
  const billNo = meta?.value || 1;
  const prefix = cfg().billPrefix || 'BILL';
  const number = `${prefix}-${String(billNo).padStart(4, '0')}`;

  const sale = {
    ...st,
    number, subtotal, discount, total, paid, balance,
    status: 'saved',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  await idb.write(['sales', 'meta', 'customers'], async (tx) => {
    await tx.put('sales', sale);
    await tx.put('meta', { key: 'nextBillNo', value: billNo + 1 });
    // Update customer outstanding balance
    if (sale.customerId && balance > 0) {
      const cust = await tx.get('customers', sale.customerId);
      if (cust) await tx.put('customers', { ...cust, balance: round2((cust.balance || 0) + balance), updatedAt: nowISO() });
    }
  });

  await Catalog.refreshCustomer(sale.customerId);
  clearDraft();

  if (doPrint) {
    await Printer.printSale(sale, { silentFail: true });
  }

  UI.toast(`Bill ${number} saved!`, 'success');
  st = fresh();
  render();
  // Navigate to bill detail
  location.hash = `#/sales/${encodeURIComponent(sale.id)}`;
}

// ── Customer picker ───────────────────────────────────────────────────────────
async function pickCustomer() {
  const result = await UI.pick({
    title: 'Select Customer',
    placeholder: 'Search name or phone…',
    noneLabel: 'Walk-in (no customer)',
    addNew: {
      label: 'Add New Customer',
      create: () => addCustomerModal(),
    },
    search: async (q) => {
      const list = Catalog.searchCustomers(q, 30);
      return list.map((c) => ({
        id: c.id, title: c.name,
        subtitle: [c.phone, c.city].filter(Boolean).join(' · '),
        right: c.balance > 0.005 ? `${cur()} ${fmtNum(c.balance)} due` : '',
        value: c,
      }));
    },
  });
  if (result === undefined) return; // cancelled
  if (result === null) {
    st.customerId = null; st.customerName = ''; st.customerPhone = '';
  } else {
    st.customerId = result.value.id;
    st.customerName = result.value.name;
    st.customerPhone = result.value.phone || '';
  }
  saveDraft(); renderMeta();
}

async function addCustomerModal() {
  return UI.formModal({
    title: 'New Customer',
    body: `
      <div class="mb-3"><label class="form-label">Name *</label><input name="name" class="form-control" required placeholder="Customer / Shop name"></div>
      <div class="mb-3"><label class="form-label">Phone</label><input name="phone" class="form-control" type="tel" placeholder="03xx-xxxxxxx"></div>
      <div class="mb-3"><label class="form-label">City</label><input name="city" class="form-control" placeholder="Lahore, Karachi…"></div>`,
    submitLabel: 'Add Customer',
    async onSubmit(vals) {
      const name = vals.name.trim();
      if (!name) throw new AppError('Name is required.');
      const cust = { id: uuid(), name, nameLc: name.toLowerCase(), phone: vals.phone.trim(), city: vals.city.trim(), balance: 0, note: '', createdAt: nowISO(), updatedAt: nowISO() };
      await idb.write(['customers'], (tx) => tx.put('customers', cust));
      await Catalog.refreshCustomer(cust.id);
      return cust;
    },
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────
function bindEvents() {
  const $q = $root.find('.pos-q');

  // Search input
  $q.on('input', debounce(() => {
    const q = $q.val().trim();
    if (!q) { hideResults(); return; }
    const found = Catalog.searchProducts(q);
    showResults(found);
  }, 120));

  $q.on('keydown', (e) => {
    if (e.key === 'Enter') {
      const items = $root.find('.search-results').data('items') || [];
      if (items.length === 1) openAddItem(items[0]);
      else if (!items.length && $q.val().trim()) openAddItem(null); // custom item
    }
    if (e.key === 'Escape') hideResults();
  });

  // Click search result
  $root.on('click', '.search-result-item', function () {
    const items = $root.find('.search-results').data('items') || [];
    const i = $root.find('.search-results .search-result-item').index(this);
    if (items[i]) openAddItem(items[i]);
  });

  // Click outside → hide results
  $(document).on('click.pos', (e) => {
    if (!$(e.target).closest('.pos-search').length) hideResults();
  });

  // Customer picker
  $root.on('click', '.btn-cust', pickCustomer);

  // Clear cart
  $root.on('click', '.btn-clear', async () => {
    if (!st.lines.length || await UI.confirmDialog('Clear all items from this bill?', { okLabel: 'Clear', okClass: 'btn-danger' })) {
      st = fresh(); clearDraft(); render();
    }
  });

  // Cart line — qty
  $root.on('click', '.btn-qty', function () {
    const $line = $(this).closest('.cart-line');
    const i = +$line.data('i');
    const d = +$(this).data('d');
    const newQty = round2(num(st.lines[i].qty) + d);
    if (newQty <= 0) return;
    st.lines[i].qty = newQty;
    st.lines[i].amount = round2(newQty * st.lines[i].rate);
    saveDraft(); render();
  });

  $root.on('change', '.qty-in', function () {
    const $line = $(this).closest('.cart-line');
    const i = +$line.data('i');
    const qty = num($(this).val());
    if (qty <= 0) return;
    st.lines[i].qty = qty;
    st.lines[i].amount = round2(qty * st.lines[i].rate);
    saveDraft(); renderFooter();
  });

  // Cart line — rate
  $root.on('change', '.rate-in', function () {
    const $line = $(this).closest('.cart-line');
    const i = +$line.data('i');
    const rate = num($(this).val());
    if (rate < 0) return;
    st.lines[i].rate = rate;
    st.lines[i].amount = round2(st.lines[i].qty * rate);
    saveDraft(); renderFooter();
  });

  // Unit toggle (pc ↔ dz)
  $root.on('click', '.unit-badge', function () {
    const $line = $(this).closest('.cart-line');
    const i = +$line.data('i');
    const l = st.lines[i];
    const prod = l.productId ? Catalog.product(l.productId) : null;
    if (l.unit === 'pc') {
      l.unit = 'dz';
      if (prod?.priceDz) l.rate = prod.priceDz;
    } else {
      l.unit = 'pc';
      if (prod?.pricePc) l.rate = prod.pricePc;
    }
    l.amount = round2(l.qty * l.rate);
    saveDraft(); render();
  });

  // Remove line
  $root.on('click', '.btn-rm', function () {
    const i = +$(this).closest('.cart-line').data('i');
    st.lines.splice(i, 1);
    saveDraft(); render();
  });

  // Discount input
  $root.on('change', '#disc-in', function () {
    st.discount = num($(this).val());
    saveDraft(); renderFooter();
  });

  // Paid input
  $root.on('change', '#paid-in', function () {
    st.paid = num($(this).val());
    saveDraft(); renderFooter();
  });

  // Save Only
  $root.on('click', '.btn-save', () => saveBill(false));

  // Save & Print
  $root.on('click', '.btn-save-print', () => saveBill(true));

  // Scanner
  $root.on('click', '.btn-scan', async () => {
    try {
      const code = await Scanner.scan();
      if (!code) return;
      const p = Catalog.findBySku(code);
      if (p) openAddItem(p);
      else UI.toast('Product not found for code: ' + code, 'warning');
    } catch (e) { UI.toastError(e); }
  });

  // Custom item
  $root.on('click', '.btn-custom', () => openAddItem(null));

  // Pay Full shortcut
  $root.on('click', '.btn-pay-full', () => {
    const t = totals();
    st.paid = t.total;
    saveDraft(); renderFooter();
  });

  // Product browse grid
  $root.on('click', '.product-tile', function () {
    const id = $(this).data('id');
    const p = Catalog.product(id);
    if (p) openAddItem(p);
  });

  $root.on('input', '.browse-q', debounce(renderBrowse, 150));
  $root.on('click', '.cat-chips .chip', function () {
    $root.find('.cat-chips .chip').removeClass('active');
    $(this).addClass('active');
    renderBrowse();
  });

  $root.on('click', '.btn-close-browse', () => {
    $root.find('.pos').removeClass('show-browse');
  });
  $root.on('click', '.btn-browse', () => {
    $root.find('.pos').addClass('show-browse');
    $root.find('.browse-q').trigger('focus');
  });
}

function renderBrowse() {
  const q = $root.find('.browse-q').val().trim();
  const catId = $root.find('.cat-chips .chip.active').data('cat') || null;
  const products = Catalog.searchProducts(q, { limit: 80, categoryId: catId });
  $root.find('.product-grid').html(products.map((p) => `
    <button class="product-tile" data-id="${esc(p.id)}">
      <div class="pt-ph"><i class="bi bi-gem"></i></div>
      <div class="pt-name">${esc(p.name)}</div>
      <div class="pt-price">${cur()} ${fmtNum(p.pricePc)}/pc</div>
    </button>`).join('') || `<div class="col-12 text-center text-body-secondary py-3 small">No products found</div>`);
}

// ── Module entry ──────────────────────────────────────────────────────────────
export default {
  async render(container, { setTitle }) {
    setTitle('New Bill');
    $root = $(container);

    // Restore draft
    try { st = JSON.parse(localStorage.getItem(DRAFT_KEY()) || 'null') || fresh(); } catch { st = fresh(); }

    // Category chips
    const cats = Catalog.allCategories();
    const catChips = `<span class="chip active" data-cat="">All</span>` +
      cats.map((c) => `<span class="chip" data-cat="${esc(c.id)}">${esc(c.name)}</span>`).join('');

    container.innerHTML = `
      <div class="pos">
        <div class="pos-left">
          <div class="d-flex gap-2 mb-2">
            <input type="search" class="form-control browse-q" placeholder="Filter items…" autocomplete="off">
            <button class="btn btn-light d-lg-none btn-close-browse px-2" aria-label="Close"><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="chips mb-2 cat-chips">${catChips}</div>
          <div class="product-grid flex-grow-1 overflow-auto"></div>
        </div>
        <div class="pos-right">
          <div class="pos-meta">
            <button class="btn-cust btn"></button>
            <button class="btn btn-light btn-custom" title="Add custom item"><i class="bi bi-plus-lg me-1"></i>Custom</button>
          </div>
          <div class="pos-search">
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input type="search" class="form-control pos-q" placeholder="Search item name or SKU…" autocomplete="off">
              <button class="btn btn-outline-secondary btn-scan" title="Scan barcode"><i class="bi bi-upc-scan"></i></button>
              <button class="btn btn-outline-secondary btn-browse d-lg-none" title="Browse"><i class="bi bi-grid-3x3-gap"></i></button>
            </div>
            <div class="search-results d-none"></div>
          </div>
          <div class="pos-lines"></div>
          <div class="pos-footer">
            <div class="pos-totals"></div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary flex-grow-1 btn-pay-full">Full Payment</button>
              <button class="btn btn-light btn-save">Save</button>
              <button class="btn btn-primary flex-grow-1 btn-save-print"><i class="bi bi-printer me-1"></i>Save & Print</button>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-light btn-sm btn-clear position-fixed" style="bottom:calc(var(--bottomnav-h)+8px+var(--safe-b));right:8px;z-index:100;opacity:.7"><i class="bi bi-trash"></i></button>
    `;

    renderBrowse();
    render();
    bindEvents();

    // Attach barcode wedge (USB scanners)
    detachWedge = Scanner.attachWedge((code) => {
      const p = Catalog.findBySku(code);
      if (p) { openAddItem(p); UI.beep(); }
      else UI.toast('Product not found: ' + code, 'warning');
    });
  },

  destroy() {
    detachWedge?.();
    detachWedge = null;
    $(document).off('click.pos');
  },
};
